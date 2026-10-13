const http = require('node:http');
const {randomBytes} = require('node:crypto');
const {MongoClient} = require('mongodb');
const {rank,validateStart,result,DIFFICULTIES} = require('./rules.cjs');
const PORT = Number(process.env.PORT || 3000);
const limits = new Map();
function publicPlayer(p) { return {id:p._id,alias:p.alias,xp:p.xp,rank:rank(p.xp),badges:p.badges}; }
async function readBody(req) {
  let content = '';
  for await (const chunk of req) { content += chunk; if (content.length > 8192) throw Object.assign(new Error('Solicitud demasiado grande.'), {status:413}); }
  try { const b = JSON.parse(content || '{}'); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch { throw new Error('JSON inválido.'); }
}
function weekStart() { const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay()+6)%7)); return d; }
async function createServer(db) {
  const players = db.collection('players'), runs = db.collection('runs');
  await Promise.all([players.createIndex({session:1},{unique:true}), runs.createIndex({playerId:1,startedAt:-1}), runs.createIndex({difficulty:1,stage:1,finishedAt:-1,'result.score':-1})]);
  return http.createServer(async (req,res) => {
    const send = (status,data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url,'http://localhost');
      if (url.pathname === '/api/health' && req.method === 'GET') { await db.command({ping:1}); return send(200,{ok:true}); }
      // Same-origin browser writes; no permissive CORS.
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403,{error:'Origen no autorizado.'});
      const ip = process.env.TRUST_PROXY === 'true' ? (req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
      const suppliedSession = /(?:^|;\s*)chankas_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
      const limitKey = suppliedSession ? suppliedSession[1] : ip;
      const now = Date.now(), bucket = limits.get(limitKey);
      if (!bucket || now-bucket.start > 60000) limits.set(limitKey,{start:now,count:1});
      else if (++bucket.count > 120) return send(429,{error:'Demasiadas solicitudes. Intenta en un minuto.'});
      if (limits.size > 10000) for (const [k,v] of limits) if (now-v.start > 60000) limits.delete(k);
      const cookie = /(?:^|;\s*)chankas_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
      let p = cookie && await players.findOne({session:cookie[1]});
      if (!p) {
        const session = randomBytes(32).toString('hex');
        p = {_id:randomBytes(16).toString('hex'),session,alias:`Chasqui-${randomBytes(3).toString('hex')}`,xp:0,badges:[],rewardedRuns:[],completedStages:[],createdAt:new Date()};
        await players.insertOne(p);
        res.setHeader('Set-Cookie',`chankas_session=${session}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=31536000${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
      }
      if (url.pathname === '/api/profile' && req.method === 'GET') return send(200,{player:publicPlayer(p),progress:{unlockedStages:p.completedStages?.includes(1) ? [1,2] : [1],completedStages:p.completedStages || []}});
      if (url.pathname === '/api/profile' && req.method === 'PATCH') {
        const {alias} = await readBody(req);
        if (typeof alias !== 'string' || !/^[\p{L}\p{N} _-]{3,24}$/u.test(alias.trim())) throw new Error('El alias debe tener entre 3 y 24 letras, números o espacios.');
        p.alias = alias.trim(); await players.updateOne({_id:p._id},{$set:{alias:p.alias}});
        return send(200,{player:publicPlayer(p),progress:{unlockedStages:p.completedStages?.includes(1) ? [1,2] : [1],completedStages:p.completedStages || []}});
      }
      if (url.pathname === '/api/runs' && req.method === 'POST') {
        const config = validateStart(await readBody(req));
        if (await runs.countDocuments({playerId:p._id,startedAt:{$gte:new Date(Date.now()-60000)}}) >= 10) return send(429,{error:'Demasiadas partidas nuevas.'});
        const run = {_id:randomBytes(16).toString('hex'),playerId:p._id,...config,startedAt:new Date(),result:null};
        await runs.insertOne(run); return send(201,{runId:run._id});
      }
      const match = /^\/api\/runs\/([a-f0-9]{32})\/finish$/.exec(url.pathname);
      if (match && req.method === 'POST') {
        const run = await runs.findOne({_id:match[1],playerId:p._id});
        if (!run) return send(404,{error:'Partida no encontrada.'});
        let outcome = run.result;
        if (!outcome) {
          outcome = result(await readBody(req),Date.now()-run.startedAt.getTime(),run.difficulty);
          await runs.updateOne({_id:run._id,result:null},{$set:{result:outcome,finishedAt:new Date()}});
          outcome = (await runs.findOne({_id:run._id})).result;
        }
        const previousBadges = p.badges;
        await players.updateOne({_id:p._id,rewardedRuns:{$ne:run._id}},{$inc:{xp:outcome.xpEarned},$addToSet:{badges:{$each:outcome.badges},rewardedRuns:run._id,completedStages:run.stage}});
        p = await players.findOne({_id:p._id});
        return send(200,{...outcome,newBadges:outcome.badges.filter(b => !previousBadges.includes(b)),player:publicPlayer(p),progress:{unlockedStages:p.completedStages?.includes(1) ? [1,2] : [1],completedStages:p.completedStages || []}});
      }
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        const difficulty = url.searchParams.get('difficulty') || 'inka', period = url.searchParams.get('period') || 'all';
        if (!DIFFICULTIES.includes(difficulty) || !['all','weekly'].includes(period) || (url.searchParams.has('stage') && url.searchParams.get('stage') !== '1')) throw new Error('Clasificación inválida.');
        const filter = {difficulty,stage:1,result:{$ne:null}};
        if (period === 'weekly') filter.finishedAt = {$gte:weekStart()};
        const rows = await runs.aggregate([{$match:filter},{$sort:{'result.score':-1,'result.deaths':1,'result.durationMs':1,finishedAt:1,_id:1}},{$group:{_id:'$playerId',best:{$first:'$$ROOT'}}},{$sort:{'best.result.score':-1,'best.result.deaths':1,'best.result.durationMs':1,'best.finishedAt':1,_id:1}},{$set:{rankingKey:{score:{$multiply:['$best.result.score',-1]},deaths:'$best.result.deaths',durationMs:'$best.result.durationMs',finishedAt:'$best.finishedAt',playerId:'$_id'}}},{$setWindowFields:{sortBy:{rankingKey:1},output:{position:{$documentNumber:{}}}}},{$facet:{top:[{$limit:50}],personal:[{$match:{_id:p._id}}]}}]).toArray();
        const playerRows = await players.find({_id:{$in:[...rows[0].top.map(r=>r._id),p._id]}}).toArray();
        const identities = new Map(playerRows.map(v=>[v._id,v]));
        const entry = r => ({position:r.position,medal:period === 'weekly' && r.position <= 3 ? ['gold','silver','bronze'][r.position-1] : null,alias:identities.get(r._id)?.alias || 'Chasqui',score:r.best.result.score,rank:rank(identities.get(r._id)?.xp || 0),badges:identities.get(r._id)?.badges || [],deaths:r.best.result.deaths,durationMs:r.best.result.durationMs});
        return send(200,{entries:rows[0].top.map(entry),personal:rows[0].personal[0] ? entry(rows[0].personal[0]) : null});
      }
      send(404,{error:'Ruta no encontrada.'});
    } catch (error) { if (!(error instanceof SyntaxError) && error.name?.startsWith('Mongo')) console.error('Database request failed:',error.name); send(error.status || (error.name?.startsWith('Mongo') ? 503 : 400),{error:error.name?.startsWith('Mongo') ? 'Servicio temporalmente no disponible.' : error.message}); }
  });
}
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Configura MONGODB_URI.');
  const client = new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});
  await client.connect();
  const server = await createServer(client.db(process.env.MONGODB_DB || 'chankas'));
  server.listen(PORT,'0.0.0.0',()=>console.log(`Chankas API listening on ${PORT}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(async()=>{await client.close();process.exit(0);}));
}
if (require.main === module) main().catch(err=>{console.error(err.message);process.exit(1);});
module.exports = {createServer};

const {test} = require('node:test');
const assert = require('node:assert/strict');
const uri = process.env.TEST_MONGODB_URI;
test('Mongo API: sessions, validation, ownership, rewards and ranking', {skip:!uri}, async () => {
  const {MongoClient} = require(require.resolve('mongodb', {paths:[process.env.TEST_SERVER_DIR || require('node:path').join(__dirname,'../server')]}));
  const {createServer} = require(require('node:path').join(process.env.TEST_SERVER_DIR || require('node:path').join(__dirname,'../server'),'index.cjs'));
  const client = await new MongoClient(uri).connect();
  const db = client.db(`chankas_test_${Date.now()}`);
  const server = await createServer(db);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method='GET',body,cookie) => {
    const response = await fetch(base+path,{method,headers:{...(cookie ? {Cookie:cookie} : {}),...(body ? {'Content-Type':'application/json'} : {})},body:body ? JSON.stringify(body) : undefined});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const guest = await request('/api/profile');
    assert.equal(guest.status,200);
    assert.match(guest.cookie,/chankas_session=/);
    const cookie = guest.cookie;
    assert.equal((await request('/api/profile','PATCH',{alias:'<script>'},cookie)).status,400);
    assert.equal((await request('/api/profile','PATCH',{alias:'Puma'},cookie)).body.player.alias,'Puma');
    assert.equal((await request('/api/runs','POST',{difficulty:'easy',stage:1,version:1},cookie)).status,400);
    const run = await request('/api/runs','POST',{difficulty:'pachacutec',stage:1,version:1},cookie);
    const path = `/api/runs/${run.body.runId}/finish`;
    const metrics = {completed:true,kills:12,shots:20,hits:16,llamaHits:5,deaths:0,optionalCompleted:true,durationMs:120000};
    assert.equal((await request(path,'POST',metrics,cookie)).status,400);
    await db.collection('runs').updateOne({_id:run.body.runId},{$set:{startedAt:new Date(Date.now()-125000)}});
    const stranger = await request('/api/profile');
    assert.equal((await request(path,'POST',metrics,stranger.cookie)).status,404);
    const finished = await Promise.all([request(path,'POST',metrics,cookie),request(path,'POST',metrics,cookie)]);
    assert.equal(finished[0].status,200); assert.equal(finished[1].status,200);
    assert.equal(finished[0].body.score,3180);
    const profile = await request('/api/profile','GET',undefined,cookie);
    assert.equal(profile.body.player.xp,259);
    assert.equal(profile.body.player.badges.length,6);
    assert.deepEqual(profile.body.progress.completedStages,[1]);
    assert.deepEqual(profile.body.progress.unlockedStages,[1,2]);
    await request(path,'POST',metrics,cookie);
    assert.equal((await request('/api/profile','GET',undefined,cookie)).body.player.xp,259);
    const board = await request('/api/leaderboard?difficulty=pachacutec&period=weekly&stage=1','GET',undefined,cookie);
    assert.equal(board.status,200);
    assert.equal(board.body.entries[0].alias,'Puma');
    assert.equal(board.body.personal.position,1);
    assert.equal(board.body.personal.medal,'gold');
    // Verify composite BSON ordering and one best run per player.
    const seeds = [
      {id:'runner_a',alias:'A',score:3180,deaths:0,durationMs:110000},
      {id:'runner_b',alias:'B',score:3180,deaths:1,durationMs:90000},
      {id:'runner_c',alias:'C',score:3181,deaths:3,durationMs:150000},
      {id:'runner_d',alias:'D',score:3180,deaths:0,durationMs:120000}
    ];
    for (const seed of seeds) {
      await db.collection('players').insertOne({_id:seed.id,session:seed.id,alias:seed.alias,xp:500,badges:[]});
      await db.collection('runs').insertOne({_id:seed.id,playerId:seed.id,difficulty:'pachacutec',stage:1,finishedAt:new Date(Date.now()+1000),result:{score:seed.score,deaths:seed.deaths,durationMs:seed.durationMs}});
    }
    await db.collection('runs').insertOne({_id:'duplicate_a',playerId:'runner_a',difficulty:'pachacutec',stage:1,finishedAt:new Date(),result:{score:100,deaths:0,durationMs:10000}});
    const ordered = await request('/api/leaderboard?difficulty=pachacutec&period=weekly','GET',undefined,cookie);
    assert.deepEqual(ordered.body.entries.map(e=>e.alias),['C','A','Puma','D','B']);
    assert.deepEqual(ordered.body.entries.map(e=>e.position),[1,2,3,4,5]);
    assert.equal(ordered.body.personal.position,3);
    assert.equal(ordered.body.personal.medal,'bronze');
    const empty = await request('/api/leaderboard?difficulty=inka','GET',undefined,cookie);
    assert.deepEqual(empty.body.entries,[]);assert.equal(empty.body.personal,null);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await db.dropDatabase();await client.close();
  }
});

const DIFFICULTIES = ['chasqui', 'inka', 'pachacutec'];
const RANKS = [{name:'Caminante',xp:0},{name:'Guardián del Camino',xp:500},{name:'Guerrero de la Huaraca',xp:1500},{name:'Protector de las Cumbres',xp:3500},{name:'Leyenda de los Andes',xp:7000}];
function rank(xp) { return RANKS.filter(r => xp >= r.xp).at(-1).name; }
function validateStart(body) {
  if (!DIFFICULTIES.includes(body.difficulty) || body.stage !== 1 || body.version !== 1) throw new Error('Etapa, modalidad o versión inválida.');
  return {difficulty:body.difficulty, stage:body.stage, version:body.version};
}
function result(body, elapsedMs, difficulty) {
  if (body.completed !== true) throw new Error('Solo las victorias participan en la clasificación.');
  for (const [key,max] of Object.entries({kills:12,shots:2000,hits:2000,llamaHits:300,deaths:100,durationMs:14400000})) {
    if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > max) throw new Error(`Métrica inválida: ${key}.`);
  }
  if (body.hits > body.shots || body.durationMs < 10000 || body.durationMs > elapsedMs + 5000 || typeof body.optionalCompleted !== 'boolean') throw new Error('Duración o precisión inválida.');
  const score = 1000 + body.kills * 100 + (body.optionalCompleted ? 300 : 0) + Math.max(0, 500 - body.deaths * 100) + Math.max(0, 300 - Math.floor(body.durationMs / 1000));
  const badges = ['first_victory'];
  if (!body.deaths) badges.push('steady_step');
  if (body.shots >= 10 && body.hits/body.shots >= .7) badges.push('precise_huaraca');
  if (body.llamaHits >= 5) badges.push('road_companions');
  if (body.optionalCompleted) badges.push('terrace_explorer');
  if (difficulty === 'pachacutec') badges.push('pachacutec_challenge');
  return {score,xpEarned:100 + Math.floor(score / 20),badges,deaths:body.deaths,durationMs:body.durationMs,ranked:true};
}
module.exports = {DIFFICULTIES,RANKS,rank,validateStart,result};

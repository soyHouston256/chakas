const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('competition.js', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(handler, saved) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {value: id === 'ranking-period' ? 'weekly' : 'inka', children: [], listeners: {}, textContent: '', addEventListener(name, fn) {this.listeners[name] = fn;}, append(child) {this.children.push(child);}, replaceChildren() {this.children = [];}});
    return elements.get(id);
  }
  const radio = {value: 'inka', addEventListener() {}};
  const calls = [], storage = new Map(saved ? [['chankas-local-competition-v1', JSON.stringify(saved)]] : []);
  const context = {document:{ getElementById:element, createElement:()=>({children:[], append(child){this.children.push(child);}}), querySelector:()=>radio, querySelectorAll:()=>[radio]}, window:{dispatchEvent(){}}, CustomEvent:function(){}, localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}, AbortController,setTimeout,clearTimeout, fetch:async(path,options)=>{calls.push(path); const body = options.body && JSON.parse(options.body); return {ok:true,json:async()=>handler(path,body)};}};
  vm.runInNewContext(source, context);
  return {api:context.window.ChankasCompetition,elements,calls,storage};
}
const player = {id:'test',alias:'Chasqui',xp:0,rank:'Caminante',badges:[]};
const metrics = {completed:true,kills:5,shots:10,hits:8,llamaHits:5,deaths:0,durationMs:100000};
function standard(path) {
  if(path === '/api/profile') return {player};
  if(path.startsWith('/api/leaderboard')) return {entries:[],personal:null};
  if(path === '/api/runs') return {runId:'one'};
  return {score:2200,xpEarned:210,newBadges:['first_victory'],player:{...player,xp:210,badges:['first_victory']},ranked:true};
}
test('quick first play awaits guest session; leaderboard cannot race guest creation',async()=>{
  let resolveProfile;
  const env = setup(path=>path === '/api/profile' ? new Promise(resolve=>resolveProfile=resolve) : standard(path));
  env.api.begin();
  assert.deepEqual(env.calls,['/api/profile']);
  await tick(); resolveProfile({player}); await tick();
  await env.api.finish(metrics);
  assert.equal(env.calls.filter(p=>p === '/api/runs').length,1);
  assert.match(env.elements.get('competition-result').textContent,/Partida clasificada/);
});
test('abandoning a pending start prevents upload and rewards',async()=>{
  let resolveRun;
  const env=setup(path=>path === '/api/runs' ? new Promise(resolve=>resolveRun=resolve) : standard(path));
  await tick(); env.api.begin(); await tick();
  const finished=env.api.finish(metrics); env.api.reset(); resolveRun({runId:'one'}); await finished;
  assert.equal(env.calls.some(p=>p.includes('/finish')),false);
});
test('offline victory awards local progress once without uploads',async()=>{
  const env=setup(()=>{throw new Error('offline');}); await tick(); env.api.begin();
  await env.api.finish(metrics); await env.api.finish(metrics);
  assert.equal(env.calls.some(p=>p === '/api/runs'),false);
  const local=JSON.parse(env.storage.get('chankas-local-competition-v1'));
  assert.equal(local.xp,210); assert.ok(local.badges.includes('first_victory'));
  assert.match(env.elements.get('competition-result').textContent,/sin clasificación/);
});
test('lost finish response is retried idempotently and duplicate finish ignored',async()=>{
  let attempts=0;
  const env=setup(path=>{if(path.includes('/finish') && ++attempts === 1) throw new Error('response lost'); return standard(path);});
  await tick(); env.api.begin(); await env.api.finish(metrics); await env.api.finish(metrics);
  assert.equal(attempts,2); assert.equal(env.elements.get('player-xp').textContent,'210 XP');
});
test('invalid stored negative XP safely falls back to fresh profile',async()=>{
  const env=setup(()=>{throw new Error('offline');},{xp:-3,badges:[]}); await tick();
  assert.equal(env.elements.get('player-rank').textContent,'Caminante');
});

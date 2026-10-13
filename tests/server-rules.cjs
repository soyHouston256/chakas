const {test} = require('node:test');
const assert = require('node:assert/strict');
const {result,validateStart,rank} = require('../server/rules.cjs');
const victory = {completed:true,kills:12,shots:20,hits:16,llamaHits:5,deaths:0,optionalCompleted:true,durationMs:120000};
test('score and achievements are server-derived',()=>{const r=result({...victory,score:999999},125000,'pachacutec');assert.equal(r.score,3180);assert.equal(r.badges.length,6);assert.equal(r.xpEarned,259);});
test('invalid timing and fabricated metrics rejected',()=>{for(const m of [{durationMs:1000},{durationMs:130001},{hits:21},{kills:13},{kills:-1},{deaths:.5},{optionalCompleted:'yes'},{completed:false}]) assert.throws(()=>result({...victory,...m},125000,'inka'));});
test('only supported run configurations accepted',()=>{assert.equal(validateStart({difficulty:'inka',stage:1,version:1}).stage,1);assert.throws(()=>validateStart({difficulty:'easy',stage:1,version:1}));assert.throws(()=>validateStart({difficulty:'inka',stage:2,version:1}));});
test('rank thresholds',()=>{assert.equal(rank(499),'Caminante');assert.equal(rank(500),'Guardián del Camino');assert.equal(rank(7000),'Leyenda de los Andes');});

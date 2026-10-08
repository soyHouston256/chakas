const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements={};const context={console,Math,Set,window:{},document:{querySelector(s){return elements[s]??={style:{},getContext(){return {}},textContent:''}},querySelectorAll(){return []}},addEventListener(){},requestAnimationFrame(){}};
vm.createContext(context);vm.runInContext(fs.readFileSync('game.js','utf8'),context);
function run(code){return vm.runInContext(code,context)}
run('reset()');assert.equal(run('state'),'playing');assert.equal(run('enemies.length'),9);
run('shoot(false)');assert.equal(run('player.ammo'),23);assert.equal(run('shots.length'),1);
run('player.cool=0; shoot(true)');assert.equal(run('player.fire'),4);assert.equal(run('shots[1].damage'),5);
run('player.ammo=0; player.cool=0; shoot(false)');assert.equal(run('shots.length'),2);
run("player.x=180; keys.add('KeyE'); update(.016); keys.clear()");assert.equal(run('player.ammo'),24);
run("keys.add('Space'); update(.016); keys.clear()");assert.ok(run('player.vy')<0);
run('pause()');assert.equal(run('state'),'paused');run('pause()');assert.equal(run('state'),'playing');
run('reset(); player.hp=1; player.inv=0; hit()');assert.equal(run('state'),'lost');
run('reset(); enemies.slice(0,8).forEach(e=>e.dead=true); const boss=enemies[8]; boss.hp=1; shots.push({x:boss.x,y:boss.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(.016)');assert.equal(run('state'),'won');assert.equal(run('score'),1000);
console.log('OK: inicio, munición, fuego, recarga, salto, pausa, derrota y victoria.');

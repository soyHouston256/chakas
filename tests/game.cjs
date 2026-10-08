const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");

// Contexto 2D falso: cualquier método es un no-op; createLinearGradient devuelve un objeto válido.
function fakeCtx(log) {
  return new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === "createLinearGradient") return () => ({ addColorStop() {} });
        return (...a) => log && log.push([k, ...a]);
      },
      set(target, k, v) {
        target[k] = v;
        return true;
      },
    },
  );
}
function makeGame(windowGlobals = {}) {
  const elements = {};
  const ctx2d = fakeCtx();
  const context = {
    console,
    Math,
    Set,
    window: { ...windowGlobals },
    document: {
      querySelector(s) {
        return (elements[s] ??= {
          style: {},
          getContext() {
            return ctx2d;
          },
          textContent: "",
        });
      },
      querySelectorAll() {
        return [];
      },
    },
    addEventListener() {},
    requestAnimationFrame() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("game.js", "utf8"), context);
  return (code) => vm.runInContext(code, context);
}

// 1) Lógica de juego (sin arte: fallback a rectángulos)
let run = makeGame();
run("reset()");
assert.equal(run("state"), "playing");
assert.equal(run("enemies.length"), 9);
run("shoot(false)");
assert.equal(run("player.ammo"), 23);
assert.equal(run("shots.length"), 1);
run("player.cool=0; shoot(true)");
assert.equal(run("player.fire"), 4);
assert.equal(run("shots[1].damage"), 5);
run("player.ammo=0; player.cool=0; shoot(false)");
assert.equal(run("shots.length"), 2);
run("player.x=180; keys.add('KeyE'); update(.016); keys.clear()");
assert.equal(run("player.ammo"), 24);
run("keys.add('Space'); update(.016); keys.clear()");
assert.ok(run("player.vy") < 0);
run("pause()");
assert.equal(run("state"), "paused");
run("pause()");
assert.equal(run("state"), "playing");
run("reset(); player.hp=1; player.inv=0; hit(); update(.001)");
assert.equal(run("state"), "lost");
run(
  "reset(); enemies.slice(0,8).forEach(e=>e.dead=true); const boss=enemies[8]; boss.hp=1; shots.push({x:boss.x,y:boss.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(.016)",
);
assert.equal(run("state"), "won");
assert.equal(run("score"), 1000);
// El perro (type 0) tiene hitbox bajo y apoya en el suelo.
run("reset()");
assert.equal(run("enemies[0].type"), 0);
assert.equal(run("enemies[0].w + 'x' + enemies[0].h"), "44x26");
assert.equal(run("enemies[0].y + enemies[0].h"), 440);
// Piedras (a la altura de la mano) y escupitajos de la llama siguen acertando al perro.
run(
  "const d=enemies[0]; d.hp=3; shots.length=0; shots.push({x:d.x+10,y:player.y+23,vx:0,vy:0,life:1,good:true,damage:1}); update(.001)",
);
assert.equal(run("enemies[0].hp"), 2);
run(
  "shots.length=0; shots.push({x:enemies[0].x+10,y:GROUND-48,vx:0,vy:0,life:1,good:true,damage:1,spit:true}); update(.001)",
);
assert.equal(run("enemies[0].hp"), 1);
// Recibir daño cancela la animación de lanzamiento.
run("reset(); shoot(false); player.inv=0; hit(); update(.016)");
assert.equal(run("player.throwT <= 0"), true);
assert.equal(run("player.anim"), "hurt");
// P0-1 · Empate: el jefe cae y el héroe recibe su último golpe en el mismo frame → victoria.
// (a) bala enemiga procesada ANTES que la piedra que mata al jefe
run(`reset(); enemies.slice(0,8).forEach(e=>e.dead=true); var B=enemies[8]; B.hp=1; player.hp=1; player.inv=0;
  shots.length=0;
  shots.push({x:player.x+5,y:player.y+20,vx:0,vy:0,life:1,good:false});
  shots.push({x:B.x+10,y:B.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(.016)`);
assert.equal(run("state"), "won");
// (b) piedra primero, bala después
run(`reset(); enemies.slice(0,8).forEach(e=>e.dead=true); B=enemies[8]; B.hp=1; player.hp=1; player.inv=0;
  shots.length=0;
  shots.push({x:B.x+10,y:B.y+20,vx:0,vy:0,life:1,good:true,damage:1});
  shots.push({x:player.x+5,y:player.y+20,vx:0,vy:0,life:1,good:false}); update(.016)`);
assert.equal(run("state"), "won");
// hit() fuera de "playing" no hace nada.
run("state='won'; player.hp=3; player.inv=0; hit()");
assert.equal(run("player.hp"), 3);

// P0-2 · Ningún enemigo dispara fuera de la ventana de cámara.
run(`reset(); player.x=1500; cam=1220; enemies.forEach(e=>{e.dead=true});
  var A=enemies[1]; A.dead=false; A.x=900; A.home=900; A.cool=0; shots.length=0;
  for (let i=0;i<120;i++){ update(.016); A.x=900; }`);
assert.equal(run("shots.filter(s=>!s.good).length"), 0);
assert.equal(run("canFire(enemies[1])"), false);
// …pero sí dispara cuando está a la vista.
run("A.x=player.x+300; A.home=A.x; A.cool=0; update(.016)");
assert.ok(run("shots.filter(s=>!s.good).length") >= 1);
// Fuera de cámara por la derecha (pantalla: cam..cam+960) tampoco.
run(
  "reset(); enemies.forEach(e=>e.dead=true); A=enemies[1]; A.dead=false; A.x=player.x+700; A.home=A.x; A.cool=0; shots.length=0; update(.016)",
);
assert.equal(run("canFire(A)"), false);
assert.equal(run("shots.filter(s=>!s.good).length"), 0);

// P0-3 · Checkpoint: la apacheta se activa al pasar, se revive allí con la manta
// mínima, invulnerabilidad breve y los enemigos derrotados siguen derrotados.
run("reset(); player.x=1600; update(.016)");
assert.equal(run("world.cpPile"), 2);
assert.equal(run("world.checkpoint"), 1600);
run("player.x=200; update(.016)"); // volver atrás no retrocede el checkpoint
assert.equal(run("world.checkpoint"), 1600);
run(
  "enemies[0].dead=true; enemies[1].dead=true; enemies[3].x=1700; player.x=2000; player.ammo=0; player.fire=0; player.bola=0; player.hp=1; player.inv=0; score=200; hit(); update(.016)",
);
assert.equal(run("state"), "lost");
run("respawn()");
assert.equal(run("state"), "playing");
assert.equal(run("player.x"), 1600);
assert.equal(run("player.hp"), 6);
assert.equal(run("player.ammo"), 12);
assert.ok(run("player.fire") >= 2 && run("player.bola") >= 1);
assert.ok(run("player.inv") > 1.5);
assert.equal(run("enemies[0].dead && enemies[1].dead"), true);
assert.equal(run("enemies[3].x"), run("enemies[3].home"));
assert.equal(run("score"), 200);
assert.equal(run("enemies.length"), 9);
// El botón principal de la pantalla de derrota revive (no reinicia); «Empezar de nuevo» sí.
run("player.hp=1; player.inv=0; hit(); update(.016)");
run("document.querySelector('#start').onclick({})");
assert.equal(run("player.x"), 1600);
assert.equal(run("enemies[0].dead"), true);
run("document.querySelector('#restart').onclick({})");
assert.equal(run("enemies.every(e=>!e.dead) && world.cpPile===-1 && player.x===70"), true);
// Respawn con el jefe activo: conserva el daño del jefe y lo devuelve a su puesto.
run(
  "player.x=3200; update(.016); var Bo=enemies[8]; Bo.hp=10; Bo.x=3300; Bo.wind=.3; player.hp=1; player.inv=0; hit(); update(.016); respawn()",
);
assert.equal(run("Bo.hp"), 10);
assert.equal(run("Bo.x"), 3910);
assert.equal(run("Bo.wind"), 0);
assert.equal(run("shots.length"), 0);

// P1-1 · La llama escupe hacia el enemigo aunque esté entre ella y el héroe.
run(
  "reset(); enemies.forEach(e=>e.dead=true); var Q=enemies[1]; Q.dead=false; Q.cool=99; player.x=1000; world.llama=920; Q.x=960; Q.home=960; world.spit=0; shots.length=0; update(.001)",
);
assert.ok(run("shots.find(s=>s.spit).vx") > 0);

// P1-2 · El jefe anuncia el disparo (preparación ≥0,4 s) y nunca dispara alto+bajo a la vez.
run(`reset(); enemies.slice(0,8).forEach(e=>e.dead=true); var C=enemies[8]; player.x=3600; player.inv=999;
  cam=player.x-280; C.x=3900; C.cool=0; shots.length=0; update(.016)`);
assert.ok(run("C.wind") >= 0.4);
assert.equal(run("C.anim"), "shoot");
assert.equal(run("shots.filter(s=>!s.good).length"), 0);
run("for (let i=0;i<40;i++) update(.016)");
assert.equal(run("shots.filter(s=>!s.good).length"), 1);
run(
  "var ys=[]; shots.length=0; for (let i=0;i<400;i++){ const n=shots.length; update(.016); shots.slice(n).filter(s=>!s.good).forEach(s=>ys.push(Math.round(s.y))); C.x=3900; }",
);
assert.ok(run("ys.length") >= 3);
assert.ok(run("new Set(ys).size") === 2); // alterna alto y bajo
// Disparo alto: no da al héroe de pie. Disparo bajo: sí (hay que saltarlo).
assert.ok(run("Math.min(...ys) + 8 <= GROUND - 58"));
assert.ok(run("Math.max(...ys) >= GROUND - 58"));

// P1-3 · Contacto: empuje lejos del enemigo e invulnerabilidad.
run("reset(); var D=enemies[1]; player.x=D.x-10; player.inv=0; update(.016)");
assert.equal(run("player.hp"), 5);
assert.ok(run("player.kb") < 0);
run("for (let i=0;i<20;i++) update(.016)");
assert.ok(run("player.x + player.w < D.x || player.inv > 0"));
assert.equal(run("player.hp"), 5);

// P1-4 · Sin munición, J golpea con la macana y el jefe es vencible.
run(`reset(); enemies.slice(0,8).forEach(e=>e.dead=true); var M=enemies[8]; M.hp=2; player.ammo=0; player.fire=0;
  player.x=M.x-30; player.face=1; player.cool=0; shoot(false)`);
assert.equal(run("M.hp"), 1);
assert.equal(run("shots.length"), 0);
run("player.cool=0; shoot(false)");
assert.equal(run("state"), "won");
// La macana no alcanza a distancia.
run(
  "reset(); var N=enemies[1]; player.ammo=0; player.x=N.x-200; player.face=1; player.cool=0; shoot(false)",
);
assert.equal(run("N.hp"), 3);

// Perro: no dispara balas, embiste con 'lunge' y muerde por contacto.
run(`reset(); enemies.forEach(e=>e.dead=true); var P=enemies[0]; P.dead=false; P.cool=0; player.x=P.x-120; player.inv=999;
  cam=Math.max(0,player.x-280); shots.length=0; var lunged=false;
  for (let i=0;i<300;i++){ update(.016); if (P.anim==='lunge') lunged=true; }`);
assert.equal(run("shots.filter(s=>!s.good).length"), 0);
assert.equal(run("lunged"), true);
run("player.inv=0; player.hp=6; P.x=player.x; P.lunge=0; update(.016)");
assert.equal(run("player.hp"), 5);

// Boleadora: tiro en arco limitado que aturde ('stunned') y frena al enemigo.
run("reset(); var G=enemies[0]; player.x=G.x-150; player.face=1; player.cool=0; throwBola()");
assert.equal(run("player.bola"), 2);
assert.ok(run("shots[0].bola && shots[0].vy < 0"));
run(
  "shots.length=0; shots.push({x:G.x+10,y:G.y,vx:400,vy:0,life:1,good:true,damage:1,bola:true}); update(.016)",
);
assert.ok(run("G.stun") > 1);
assert.equal(run("G.anim"), "stunned");
run("var gx=G.x; for (let i=0;i<30;i++) update(.016)");
assert.equal(run("G.x"), run("gx"));
run("player.bola=0; player.cool=0; shots.length=0; throwBola()");
assert.equal(run("shots.length"), 0);

// HUD: los corazones tienen tope y nunca desbordan el panel.
assert.equal(run("hudHearts(6)"), "♥♥♥♥♥♥");
assert.equal(run("hudHearts(99)"), "♥×99");
assert.equal(run("hudHearts(-2)"), "");
assert.ok(run("reset(); player.hp=99; hudLine().length") <= run("reset(); hudLine().length"));
assert.ok(run("hudLine().length * 7.5 + 16 <= HUD_W")); // ~7,5 px por carácter a 14 px

// El dibujo con fallback no lanza.
run("for (let i = 0; i < 30; i++) { update(.016); draw(); }");

// 2) Con arte: stubs de window.ChankasSprites / ChankasBackground
const calls = [];
const SP = {
  draw(ctx, kind, anim, t, x, y, o) {
    calls.push({
      kind,
      anim,
      t,
      x,
      y,
      w: o.w,
      h: o.h,
      facing: o.facing,
      rot: o.rotation,
      flash: o.flash,
      fill: o.fill,
    });
    return true;
  },
  size: (k) => ({ w: 16, h: 16, anchor: "center" }),
  duration: (k, a) => 0.4,
};
const bgCalls = [];
const BG = {
  drawBackground: () => bgCalls.push("bg"),
  drawForeground: () => bgCalls.push("fg"),
  drawGround: () => bgCalls.push("ground"),
  drawPlatform: () => bgCalls.push("plat"),
};
run = makeGame({ ChankasSprites: SP, ChankasBackground: BG });
run("reset(); draw()");
assert.ok(bgCalls.includes("bg") && bgCalls.includes("ground") && bgCalls.includes("fg"));
assert.ok(calls.some((c) => c.kind === "hero" && c.anim === "idle" && c.fill === 1));
assert.ok(calls.some((c) => c.kind === "llama"));
assert.ok(calls.some((c) => c.kind === "stone_pile"));
// El arte recibe el hitbox real (perro 44x26 en el suelo, capitán 72x96) y una orientación válida.
assert.ok(calls.some((c) => c.kind === "perro" && c.w === 44 && c.h === 26 && c.y + c.h === 440));
assert.ok(calls.some((c) => c.kind === "capitan" && c.w === 72 && c.h === 96));
assert.ok(calls.every((c) => c.facing === 1 || c.facing === -1));
// Lanzar: animación 'throw' con temporizador desde el inicio de la acción.
run("player.cool=0; shoot(false); update(.016)");
assert.equal(run("player.anim"), "throw");
assert.ok(run("player.animT") < 0.05);
calls.length = 0;
run("draw()");
assert.ok(calls.some((c) => c.kind === "hero" && c.fill === 23 / 24));
assert.ok(calls.some((c) => c.kind === "stone"));
// Enemigo derrotado: sale volando girando y desaparece al salir de pantalla.
run(
  "player.x=560; const e0=enemies[1]; e0.hp=1; shots.length=0; shots.push({x:e0.x+5,y:e0.y+10,vx:620,vy:0,life:1,good:true,damage:1}); update(.016)",
);
assert.equal(run("enemies[1].dead"), true);
assert.ok(run("fx.some(f => f.kind === 'hit_spark')"));
run("for (let i = 0; i < 20; i++) update(.016)");
assert.ok(run("enemies[1].rot") !== 0);
assert.ok(run("enemies[1].y") < 440 - 48);
run("for (let i = 0; i < 200; i++) updateFx(.016)");
assert.equal(run("enemies[1].gone"), true);
// Los efectos caducan.
run("for (let i = 0; i < 60; i++) updateFx(.016)");
assert.equal(run("fx.length"), 0);
// Con arte: la apacheta activada iza la bandera (opts.active) y solo esa.
run("reset(); player.x=850; update(.016); player.x=1200");
calls.length = 0;
run("draw()");
const pilesDrawn = calls.filter((c) => c.kind === "stone_pile");
assert.equal(pilesDrawn.length, 5);
assert.equal(pilesDrawn.filter((c) => c.anim === "active").length, 1);
// Telegrafía del jefe y boleadora se dibujan con el arte.
run(
  "enemies.slice(0,8).forEach(e=>e.dead=true); var C2=enemies[8]; C2.wind=.3; C2.pat='low'; shots.push({x:player.x,y:player.y,vx:1,vy:0,life:1,good:true,bola:true})",
);
calls.length = 0;
run("draw()");
assert.ok(calls.some((c) => c.kind === "capitan" && c.flash));
assert.ok(calls.some((c) => c.kind === "boleadora" && c.anim === "spin"));
console.log(
  "OK: inicio, munición, fuego, recarga, salto, pausa, derrota, empate→victoria, sin disparos fuera de cámara, checkpoint/respawn, escupitajo, telegrafía del jefe, empuje, macana, perro sin balas, boleadora, HUD, arte (stubs).",
);

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
        if (k === "measureText") return (s) => ({ width: String(s).length * 7 });
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
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    requestAnimationFrame() {},
  };
  const listeners = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("game.js", "utf8"), context);
  const r = (code) => vm.runInContext(code, context);
  // Dispara los handlers reales registrados con addEventListener (teclado, blur).
  r.fire = (type, ev = {}) => {
    const e = { repeat: false, target: null, preventDefault() {}, ...ev };
    for (const fn of listeners[type] || []) fn(e);
    return e;
  };
  return r;
}

// Deja correr la escena de la caída del capitán (≈3,2 s) hasta la tarjeta de victoria.
const OUTRO_RUN = "for (let i=0;i<400 && state==='playing' && world.outro;i++) update(1/60)";

// 1) Lógica de juego (sin arte: fallback a rectángulos)
let run = makeGame();
run("reset()");
assert.equal(run("state"), "playing");
assert.equal(run("enemies.length"), 13);
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
  "reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); const boss=enemies.find(e=>e.type===3); boss.hp=1; shots.push({x:boss.x,y:boss.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(.016)",
);
// El jefe cae en una escena corta: la victoria no es inmediata.
assert.equal(run("state"), "playing");
assert.equal(run("!!world.outro"), true);
run(OUTRO_RUN);
assert.equal(run("state"), "won");
assert.equal(run("score"), 1800);
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
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var B=enemies.find(e=>e.type===3); B.hp=1; player.hp=1; player.inv=0;
  shots.length=0;
  shots.push({x:player.x+5,y:player.y+20,vx:0,vy:0,life:1,good:false});
  shots.push({x:B.x+10,y:B.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(.016)`);
run(OUTRO_RUN);
assert.equal(run("state"), "won");
// (b) piedra primero, bala después
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); B=enemies.find(e=>e.type===3); B.hp=1; player.hp=1; player.inv=0;
  shots.length=0;
  shots.push({x:B.x+10,y:B.y+20,vx:0,vy:0,life:1,good:true,damage:1});
  shots.push({x:player.x+5,y:player.y+20,vx:0,vy:0,life:1,good:false}); update(.016)`);
run(OUTRO_RUN);
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
// Visibilidad pura (cámara forzada): a 500 px (dentro de alcance) pero fuera por la derecha.
run(
  "reset(); enemies.forEach(e=>e.dead=true); A=enemies[1]; A.dead=false; player.x=2000; A.x=2500; cam=1500",
);
assert.equal(run("Math.abs(A.x + A.w/2 - player.x - player.w/2) < FIRE_RANGE"), true);
assert.equal(run("canFire(A)"), false);
run("cam=1600");
assert.equal(run("canFire(A)"), true);
// El jefe que sale de cámara durante la preparación cancela el disparo.
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var Z=enemies.find(e=>e.type===3); player.x=2000; player.inv=999;
  Z.x=1750; Z.home=1750; cam=1720; Z.cool=0; shots.length=0; update(.016)`);
assert.ok(run("Z.wind") > 0);
run("for (let i=0;i<60;i++){ player.x += 4; update(.016); }");
assert.equal(run("shots.filter(s=>!s.good).length"), 0);
assert.equal(run("Z.wind <= 0"), true);

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
assert.equal(run("enemies.length"), 13);
// El botón principal de la pantalla de derrota revive (no reinicia); «Empezar de nuevo» sí.
run("player.hp=1; player.inv=0; hit(); update(.016)");
run("document.querySelector('#start').onclick({})");
assert.equal(run("player.x"), 1600);
assert.equal(run("enemies[0].dead"), true);
run("document.querySelector('#restart').onclick({})");
assert.equal(run("enemies.every(e=>!e.dead) && world.cpPile===-1 && player.x===70"), true);
// Respawn con el jefe activo: conserva el daño del jefe y lo devuelve a su puesto.
run(
  "player.x=3200; update(.016); var Bo=enemies.find(e=>e.type===3); Bo.hp=10; Bo.x=3300; Bo.wind=.3; player.hp=1; player.inv=0; hit(); update(.016); respawn()",
);
assert.equal(run("Bo.hp"), 10);
assert.equal(run("Bo.x"), 5350);
assert.equal(run("Bo.wind"), 0);
assert.equal(run("shots.length"), 0);

// P1-1 · La llama escupe (H) hacia el enemigo aunque esté entre ella y el héroe.
run(
  "reset(); enemies.forEach(e=>e.dead=true); var Q=enemies[1]; Q.dead=false; Q.cool=99; player.x=1000; player.face=-1; cam=720; world.llama=920; Q.x=960; Q.home=960; shots.length=0; keys.add('KeyH'); update(.001); keys.clear(); for (let i=0;i<40 && !shots.some(s=>s.spit);i++) { world.llama=920; update(.016); }",
);
assert.ok(run("shots.find(s=>s.spit).vx") > 0);

// P1-2 · El jefe anuncia el disparo (preparación ≥0,4 s) y nunca dispara alto+bajo a la vez.
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var C=enemies.find(e=>e.type===3); player.x=3600; player.inv=999;
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
assert.deepEqual(
  JSON.parse(run("JSON.stringify(ys.map(y => y < C.y + 40 ? 'high' : 'low'))")),
  JSON.parse(run("JSON.stringify(ys.map((_, i) => BOSS_PATTERN[(i + 1) % BOSS_PATTERN.length]))")),
);
// Disparo alto: no da al héroe de pie. Disparo bajo: sí (hay que saltarlo).
assert.ok(run("Math.min(...ys) + 8 <= GROUND - 58"));
assert.ok(run("Math.max(...ys) >= GROUND - 58"));

// P1-3 · Contacto: empuje lejos del enemigo e invulnerabilidad.
run("reset(); var D=enemies[1]; player.x=D.x-10; player.inv=0; update(.016)");
assert.equal(run("player.hp"), 5);
assert.ok(run("player.kb") < 0);
run("for (let i=0;i<20;i++) update(.016)");
assert.ok(run("player.x + player.w < D.x")); // separado de verdad del atacante
assert.equal(run("player.hp"), 5);

// P1-4 · Sin munición, J golpea con la macana y el jefe es vencible.
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var M=enemies.find(e=>e.type===3); M.hp=2; player.ammo=0; player.fire=0;
  player.x=M.x-30; player.face=1; player.cool=0; shoot(false)`);
assert.equal(run("M.hp"), 1);
assert.equal(run("shots.length"), 0);
run("player.cool=0; shoot(false)");
run(OUTRO_RUN);
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
// La embestida muerde de verdad: el perro sale a distancia y daña durante el 'lunge'.
run(`reset(); enemies.forEach(e=>e.dead=true); P=enemies[0]; P.dead=false; P.cool=0; player.x=P.x-110; player.inv=0;
  cam=Math.max(0,player.x-280); var bitLunging=false;
  for (let i=0;i<120 && player.hp===6;i++){ update(.016); if (player.hp<6) bitLunging = P.anim==='lunge'; }`);
assert.equal(run("player.hp"), 5);
assert.equal(run("bitLunging"), true);

// Boleadora: tiro en arco limitado que aturde ('stunned') y frena al enemigo.
run("reset(); var G=enemies[0]; player.x=G.x-150; player.face=1; player.cool=0; throwBola()");
assert.equal(run("player.bola"), 2);
assert.ok(run("shots[0].bola && shots[0].vy < 0"));
run("player.inv=999; for (let i=0;i<60 && !(G.stun>0);i++) update(.016)"); // tiro real, en arco
assert.ok(run("G.stun") > 1);
assert.equal(run("G.anim"), "stunned");
run("var gx=G.x; for (let i=0;i<30;i++) update(.016)");
assert.equal(run("G.x"), run("gx"));
run("for (let i=0;i<120;i++) update(.016)"); // se recupera
assert.ok(run("G.stun <= 0 && G.anim !== 'stunned'"));
// El aturdimiento corre aunque el enemigo quede fuera de la ventana de activación.
run("G.stun=2; player.x=G.x+1000; for (let i=0;i<150;i++){ update(.016); player.x=G.x+1000; }");
assert.ok(run("G.stun") <= 0);
// Contra el jefe: aturdimiento corto que cancela la preparación.
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var J2=enemies.find(e=>e.type===3); player.x=3600; player.inv=999; player.face=1;
  cam=player.x-280; J2.x=3800; J2.wind=.3; J2.pat='low'; J2.cool=5; shots.length=0;
  shots.push({x:J2.x+10,y:J2.y+30,vx:400,vy:0,life:1,good:true,damage:1,bola:true,w:16,h:16}); update(.016)`);
assert.ok(run("J2.stun > 0 && J2.stun <= 0.7 && J2.wind === 0"));
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
assert.equal(pilesDrawn.length, 8);
assert.equal(pilesDrawn.filter((c) => c.anim === "active").length, 1);
// Telegrafía del jefe y boleadora se dibujan con el arte.
run(
  "enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var C2=enemies.find(e=>e.type===3); C2.wind=.3; C2.pat='low'; shots.push({x:player.x,y:player.y,vx:1,vy:0,life:1,good:true,bola:true})",
);
calls.length = 0;
run("draw()");
assert.ok(calls.some((c) => c.kind === "capitan" && c.flash));
assert.ok(calls.some((c) => c.kind === "boleadora" && c.anim === "spin"));
// ---------------------------------------------------------------------------
// Mapa de misiones: título → mapa → nivel, victoria → mapa con progreso, etapas
// bloqueadas no jugables, localStorage robusto y fallback sin módulo de mapa.
// Lienzos falsos pero funcionales (para que map.js pueda preparar y dibujar de verdad).
function fakeCanvasDoc() {
  const mk = () => {
    const c = { width: 0, height: 0 };
    const g = new Proxy(
      {},
      {
        get(t, k) {
          if (k in t) return t[k];
          if (k === "measureText") return (s) => ({ width: String(s).length * 7 });
          if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
          if (k === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
          if (k === "canvas") return c;
          return () => {};
        },
        set(t, k, v) {
          t[k] = v;
          return true;
        },
      },
    );
    c.getContext = () => g;
    return c;
  };
  return { createElement: mk };
}
function realMap(withCanvas) {
  const ctx = { console, Math, Number, JSON, Uint8ClampedArray, Float32Array, Uint8Array };
  if (withCanvas) ctx.document = fakeCanvasDoc();
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("art/peru-data.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("art/map.js", "utf8"), ctx);
  return ctx.ChankasMap;
}
const RM = realMap();
assert.equal(RM.stages.length, 5);
assert.equal(JSON.stringify(RM.stages.map((s) => s.playable)), "[true,false,false,false,false]");
assert.equal(RM.statusOf(0, 1) + RM.statusOf(1, 1) + RM.statusOf(2, 1), "completedcurrentlocked");
assert.equal(RM.stageAt(RM.stages[3].node[0], RM.stages[3].node[1] - 8), 3);
assert.equal(RM.stageAt(5, 5), -1);
for (const s of RM.stages) {
  assert.ok(s.history.length > 20 && s.fiction.startsWith("Ficción") && (s.fictional ? s.year === "Ficción" : /^15\d\d$/.test(s.year)));
  const p = RM.project(s.lat, s.lon);
  assert.ok(p.x > 0 && p.x < 640 && p.y > 0 && p.y < 540, "etapa dentro del mapa: " + s.id);
}
function memStorage(init = {}) {
  const m = { ...init };
  return {
    data: m,
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => (m[k] = String(v)),
  };
}
let mapDraws = 0;
const MAPSTUB = {
  stages: RM.stages,
  statusOf: RM.statusOf,
  stageAt: RM.stageAt,
  buttonAt: RM.buttonAt,
  prepare: () => true,
  draw: () => (mapDraws++, true),
};
let store = memStorage();
run = makeGame({ ChankasMap: MAPSTUB, localStorage: store });
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "map");
assert.equal(run("mapS.progress"), 0);
assert.equal(run("mapS.selected"), 0);
run("updateMap(.016); drawMap()");
assert.ok(mapDraws > 0);
// El mapa ignora P (pausa) y las teclas no se filtran al nivel.
run("mapKey('KeyP')");
assert.equal(run("state"), "map");
// Etapa bloqueada: se puede seleccionar para leer, pero no jugar.
run("mapKey('ArrowRight'); mapKey('ArrowRight'); mapKey('ArrowRight')");
assert.equal(run("mapS.selected"), 3);
run("mapKey('Enter')");
assert.equal(run("state"), "map");
assert.ok(run("mapS.msg") > 0);
run("for (let i = 0; i < 9; i++) mapKey('ArrowRight')");
assert.equal(run("mapS.selected"), 4);
run("for (let i = 0; i < 9; i++) mapKey('KeyA')");
assert.equal(run("mapS.selected"), 0);
run("mapKey('Enter')");
assert.equal(run("state"), "playing");
// Victoria → progreso guardado y el héroe camina hacia la etapa 2 (Próximamente).
run(
  "enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var Bm=enemies.find(e=>e.type===3); Bm.hp=1; shots.push({x:Bm.x,y:Bm.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(.016)",
);
assert.equal(run("state"), "playing");
run(OUTRO_RUN);
assert.equal(run("state"), "won");
assert.equal(JSON.parse(store.data["chankas.progress.v1"]).progress, 1);
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "map");
assert.equal(run("mapS.progress"), 1);
assert.equal(run("mapS.selected"), 1);
assert.equal(run("mapS.heroT"), 0);
run("for (let i = 0; i < 60; i++) updateMap(.016)");
assert.ok(run("mapS.heroT") > 0 && run("mapS.heroT") < 1);
run("for (let i = 0; i < 200; i++) updateMap(.016)");
assert.equal(run("mapS.heroT"), 1);
assert.equal(run("mapS.walk"), null);
run("mapKey('Enter')");
assert.equal(run("state"), "map"); // etapa 2 en construcción
// Toque/clic: tocar otra etapa la selecciona; tocar la elegida la juega (si es jugable).
run("mapPointer(" + RM.stages[0].node + ")");
assert.equal(run("mapS.selected"), 0);
assert.equal(run("state"), "map");
run("mapPointer(" + RM.stages[0].node + ")");
assert.equal(run("state"), "playing");
// Entrada real (handlers de teclado): la tecla que confirma la etapa no se filtra al nivel,
// ni siquiera con autorrepetición, hasta que se suelta.
run = makeGame({ ChankasMap: MAPSTUB, localStorage: memStorage() });
run("document.querySelector('#start').onclick()");
run.fire("keydown", { code: "KeyJ" });
assert.equal(run("state"), "playing");
run.fire("keydown", { code: "KeyJ", repeat: true });
run.fire("keydown", { code: "KeyJ", repeat: true });
assert.equal(run("keys.has('KeyJ')"), false);
run("update(.016)");
assert.equal(run("shots.length"), 0);
run.fire("keyup", { code: "KeyJ" });
run.fire("keydown", { code: "KeyJ" });
assert.equal(run("keys.has('KeyJ')"), true);
// Con el foco en un botón (p. ej. «Sonido»), Espacio/Enter no juegan la etapa.
run = makeGame({ ChankasMap: MAPSTUB, localStorage: memStorage() });
run("document.querySelector('#start').onclick()");
const btnTarget = { closest: selector => selector.includes("button") ? {} : null };
let pd = false;
run.fire("keydown", { code: "Space", target: btnTarget, preventDefault: () => (pd = true) });
run.fire("keydown", { code: "Enter", target: btnTarget });
assert.equal(run("state"), "map");
assert.equal(pd, false);
// Las flechas sí funcionan y P no pausa en el mapa.
run.fire("keydown", { code: "ArrowRight" });
run.fire("keydown", { code: "KeyP" });
assert.equal(run("mapS.selected") + run("state"), "1map");
// Toque: el primer toque sobre la etapa ya seleccionada no la juega; el segundo sí.
run.fire("keydown", { code: "ArrowLeft" });
run("mapPointer(" + RM.stages[0].node + ")");
assert.equal(run("state"), "map");
run("mapPointer(" + RM.stages[0].node + ")");
assert.equal(run("state"), "playing");
// El botón de la ficha juega la etapa elegida con un solo toque; bloqueada → aviso.
run = makeGame({ ChankasMap: MAPSTUB, localStorage: memStorage() });
run("document.querySelector('#start').onclick()");
assert.equal(RM.buttonAt(790, 455), true);
assert.equal(RM.buttonAt(790, 300), false);
run("mapKey('ArrowRight'); mapPointer(790, 455)");
assert.equal(run("state"), "map");
assert.ok(run("mapS.msg") > 0);
run("mapKey('ArrowLeft'); mapPointer(790, 455)");
assert.equal(run("state"), "playing");
// Al volver del título, el progreso persiste (nueva partida con el mismo almacenamiento).
run = makeGame({ ChankasMap: MAPSTUB, localStorage: store });
run("document.querySelector('#start').onclick()");
assert.equal(run("mapS.progress"), 1);
assert.equal(run("mapS.heroT"), 1);
// localStorage corrupto, fuera de rango o que lanza excepciones: progreso 0..5 sin romper.
for (const bad of ["basura", '{"progress":99}', '{"progress":-4}', '{"progress":"2.7"}', "null"]) {
  run = makeGame({ ChankasMap: MAPSTUB, localStorage: memStorage({ "chankas.progress.v1": bad }) });
  run("document.querySelector('#start').onclick()");
  const pr = run("mapS.progress");
  assert.ok(Number.isInteger(pr) && pr >= 0 && pr <= 5, bad + " → " + pr);
  assert.ok(run("mapS.selected") <= 4);
}
const throwing = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceeded");
  },
};
run = makeGame({ ChankasMap: MAPSTUB, localStorage: throwing });
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "map");
run("mapKey('Enter'); win()");
assert.equal(run("state"), "won");
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "map");
assert.equal(run("mapS.progress"), 1); // en memoria aunque no se pueda guardar
// Fallback: sin módulo de mapa (o si prepare() falla) se va directo al nivel.
run = makeGame();
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "playing");
run("win()");
assert.equal(run("document.querySelector('#start').textContent"), "Jugar otra vez →");
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "playing");
run = makeGame({ ChankasMap: { ...MAPSTUB, prepare: () => false } });
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "playing");
run = makeGame({
  ChankasMap: {
    ...MAPSTUB,
    prepare() {
      throw new Error("x");
    },
  },
});
run("document.querySelector('#start').onclick()");
assert.equal(run("state"), "playing");

// ---------------------------------------------------------------------------
// Interfaz v2: modelos de vista puros (HUD, ruta, panel del mapa).
run = makeGame();
const J = (code) => JSON.parse(run("JSON.stringify(" + code + ")"));
let hv = J("hudView(null, null, 0)"); // título: aún no hay partida
assert.deepEqual(
  [hv.hp, hv.maxHp, hv.ammo, hv.maxAmmo, hv.fire, hv.bola, hv.loads, hv.maxLoads, hv.quipu, hv.weapon],
  [6, 6, 24, 24, 5, 3, 5, 5, "0000", "J"],
);
assert.equal(hv.lifeLabel, "Vida: 6 de 6");
run("reset(); enemies.forEach(e=>e.dead=true); player.hp=5; score=100; world.loads=4; player.cool=0; shoot(true)");
hv = J("hudView(player, world, score)");
assert.deepEqual([hv.hp, hv.ammo, hv.fire, hv.weapon, hv.quipu, hv.loads], [5, 23, 4, "K", "0100", 4]);
assert.equal(hv.lifeLabel, "Vida: 5 de 6");
assert.equal(hv.loadLabel, "Carga de la llama: 4 de 5");
run("player.cool=0; throwBola()");
assert.equal(J("hudView(player, world, score)").weapon, "L");
run("player.cool=0; player.ammo=0; shoot(false)"); // macana = J
assert.equal(J("hudView(player, world, score)").weapon, "J");
assert.equal(J("hudView({hp:-3}, {loads:9}, -5)").hp, 0);
assert.equal(J("hudView({hp:99}, {loads:9}, 0)").hp, 6);
assert.equal(J("hudView({hp:2}, {loads:9}, 0)").loads, 5);
assert.equal(run("quipu(12345)"), "12345");
assert.equal(run("quipu('x')"), "0000");
// Barra de ruta: 5 columnas (centros 10 %, 30 %…, 90 %); el marcador avanza hacia la siguiente etapa.
let rv = J("routeView(0, 6, 5)");
assert.deepEqual([rv.start, rv.end, rv.pct, rv.marker, rv.fill, rv.roman], [10, 90, 6, 11.2, 1.2, "I"]);
rv = J("routeView(0, 150, 5)");
assert.deepEqual([rv.pct, rv.marker, rv.fill], [100, 30, 20]);
rv = J("routeView(4, 50, 5)"); // última etapa: no hay siguiente
assert.deepEqual([rv.marker, rv.roman], [90, "V"]);
rv = J("routeView(-2, NaN, 5)");
assert.deepEqual([rv.stage, rv.pct, rv.marker], [0, 0, 10]);
rv = J("routeView(7, 50, 1)"); // sin mapa: una sola etapa centrada
assert.deepEqual([rv.stage, rv.start, rv.marker], [0, 50, 50]);

// Alforjas de la llama: E junto a la llama (lejos de una apacheta) da +8 piedras y gasta una carga;
// mantener E no vacía las alforjas; con tope de 24; las cargas se reponen en una apacheta nueva.
run(`reset(); enemies.forEach(e=>e.dead=true); player.x=1200; world.llama=1120; player.ammo=3; world.loads=2;
  keys.add('KeyE'); update(.016)`);
assert.deepEqual(J("[player.ammo, world.loads]"), [11, 1]);
run("update(.016); update(.016)"); // E sigue pulsada: no repite
assert.deepEqual(J("[player.ammo, world.loads]"), [11, 1]);
run("keys.delete('KeyE'); update(.016); keys.add('KeyE'); update(.016)");
assert.deepEqual(J("[player.ammo, world.loads]"), [19, 0]);
run("keys.delete('KeyE'); update(.016); keys.add('KeyE'); update(.016)"); // sin cargas
assert.deepEqual(J("[player.ammo, world.loads]"), [19, 0]);
run("keys.clear(); update(.016); world.loads=3; player.ammo=20; keys.add('KeyE'); update(.016)");
assert.deepEqual(J("[player.ammo, world.loads]"), [24, 2]); // tope
run("keys.clear(); update(.016); player.ammo=24; keys.add('KeyE'); update(.016)");
assert.equal(run("world.loads"), 2); // manta llena: no gasta carga
run("keys.clear(); update(.016); world.llama=player.x-400; player.ammo=5; keys.add('KeyE'); update(.016)");
assert.deepEqual(J("[player.ammo, world.loads]"), [5, 2]); // llama lejos
run("keys.clear(); player.x=1600; world.loads=0; update(.016)");
assert.deepEqual(J("[world.cpPile, world.loads]"), [2, 5]); // apacheta nueva repone las alforjas
run("player.x=1600; world.loads=1; player.ammo=0; keys.add('KeyE'); update(.016); keys.clear()");
assert.deepEqual(J("[player.ammo, world.loads]"), [24, 1]); // en la apacheta recarga ella, no la llama
run("player.x=1200; world.llama=1120; player.ammo=3; world.loads=2");
assert.equal(run("llamaPromptVisible()"), true);
run("player.ammo=20");
assert.equal(run("llamaPromptVisible()"), false); // la recarga apenas serviría
run("player.ammo=3; world.loads=0");
assert.equal(run("llamaPromptVisible()"), false);

// Interfaz HTML presente (stub de ChankasUI): estado del juego → pantallas y acciones.
let lastMapOpts = null;
const UISTUB = {
  ready: true,
  inits: 0,
  syncs: 0,
  menuCodes: [],
  init(api) {
    this.api = api;
    this.inits++;
  },
  sync() {
    this.syncs++;
  },
  menuKey(code) {
    this.menuCodes.push(code);
    return code === "ArrowDown" || code === "ArrowUp";
  },
};
run = makeGame({
  ChankasUI: UISTUB,
  ChankasMap: { ...MAPSTUB, draw: (c, t, o) => ((lastMapOpts = o), true) },
  localStorage: memStorage(),
});
assert.equal(UISTUB.inits, 1);
assert.notEqual(run("overlay.style.display"), "flex"); // el título es HTML, no la tarjeta clásica
let uv = J("uiView()");
assert.deepEqual([uv.state, uv.hasMap, uv.map, uv.stageNames.length, uv.hud.hp], ["menu", true, null, 5, 6]);
assert.equal(run("uiAction('resume')"), false); // no hay nada que reanudar en el título
assert.equal(run("uiAction('start')"), true);
assert.deepEqual(J("[state, curStage]"), ["playing", 0]);
run("for (let i = 0; i < 5; i++) { update(.016); draw(); }"); // sin HUD de canvas, sin errores
// Escape/P pausan; en la pausa, las flechas van al menú y Enter/Espacio sobre un botón no llegan al juego.
pd = false;
run.fire("keydown", { code: "Escape" });
assert.equal(run("state"), "paused");
assert.equal(run("keys.has('Escape')"), false);
run.fire("keydown", { code: "ArrowDown" });
assert.deepEqual(UISTUB.menuCodes.slice(-1), ["ArrowDown"]);
assert.equal(run("swallowed.has('ArrowDown')"), true);
run.fire("keyup", { code: "ArrowDown" });
run.fire("keydown", { code: "Enter", target: btnTarget, preventDefault: () => (pd = true) });
assert.equal(pd, false); // el navegador activa el botón enfocado
assert.equal(run("keys.has('Enter') || !swallowed.has('Enter')"), false);
run("uiAction('resume')"); // lo que haría el clic del botón «Continuar»
run.fire("keydown", { code: "Enter", repeat: true });
assert.deepEqual(J("[state, keys.has('Enter')]"), ["playing", false]); // la repetición no se filtra
run.fire("keyup", { code: "Enter" });
// Jugando, Espacio sobre un botón enfocado (p. ej. «Sonido») activa el botón y no salta.
pd = false;
run.fire("keydown", { code: "Space", target: btnTarget, preventDefault: () => (pd = true) });
assert.deepEqual([run("keys.has('Space')"), pd], [false, false]);
run.fire("keyup", { code: "Space" });
run.fire("keydown", { code: "Space" }); // sin foco en un control, Espacio salta
assert.equal(run("keys.has('Space')"), true);
run.fire("keyup", { code: "Space" });
run.fire("keydown", { code: "KeyP" });
run.fire("keydown", { code: "KeyP", repeat: true });
assert.equal(run("state"), "paused");
run.fire("keyup", { code: "KeyP" });
run.fire("keydown", { code: "KeyP" });
assert.equal(run("state"), "playing");
run("pause(); player.x=900; uiAction('restart')");
assert.deepEqual(J("[state, player.x]"), ["playing", 70]);
run("pause(); uiAction('title')");
assert.deepEqual(J("[state, player, uiView().hud.ammo]"), ["menu", null, 24]);
run("draw()"); // el título dibuja el escenario sin jugador
// Una tecla mantenida en el título no dispara al empezar con «Comenzar expedición».
run.fire("keydown", { code: "KeyJ" });
assert.equal(run("keys.has('KeyJ')"), false);
run("uiAction('start'); update(.016)");
assert.deepEqual(J("[state, shots.length, player.ammo]"), ["playing", 0, 24]);
run.fire("keydown", { code: "KeyJ", repeat: true });
assert.equal(run("keys.has('KeyJ')"), false);
run.fire("keyup", { code: "KeyJ" });
// Una tecla pulsada al pausar no sigue activa al reanudar (hasta soltarla y volver a pulsar).
run.fire("keydown", { code: "ArrowRight" });
run.fire("keydown", { code: "KeyP" });
run.fire("keyup", { code: "KeyP" });
run("uiAction('resume')");
assert.equal(run("keys.has('ArrowRight')"), false);
run.fire("keyup", { code: "ArrowRight" });
run.fire("keydown", { code: "ArrowRight" });
assert.equal(run("keys.has('ArrowRight')"), true);
run.fire("keyup", { code: "ArrowRight" });
assert.equal(run("uiAction('pause')"), true); // botón táctil de pausa
assert.equal(run("state"), "paused");
run("uiAction('title')");
// Mapa: panel «Las cinco cuerdas» (la ficha del canvas se omite) y selección por arriba/abajo.
assert.equal(run("uiAction('map')"), true);
assert.equal(run("state"), "map");
run("drawMap()");
assert.equal(lastMapOpts.card, false);
let mv = J("uiView().map");
assert.equal(mv.selected, 0);
assert.deepEqual(
  mv.rows.map((r) => r.status + ":" + r.label),
  ["current:EN CURSO", "locked:Bloqueada", "locked:Bloqueada", "locked:Bloqueada", "locked:Bloqueada"],
);
assert.deepEqual([mv.playable, mv.playLabel, mv.notice], [true, "Jugar etapa I", ""]);
assert.ok(mv.history.startsWith("Mayo de 1536") && !/^Ficción/.test(mv.fiction) && /^[A-ZÁÉÍÓÚ]/.test(mv.fiction));
run("uiAction('select', 3)");
mv = J("uiView().map");
assert.deepEqual([mv.selected, mv.playable, mv.playLabel], [3, false, "Próximamente"]);
assert.equal(run("uiAction('play')"), false);
assert.equal(run("state"), "map");
assert.ok(J("uiView().map").notice.includes("IV"));
run("mapKey('ArrowUp')");
assert.equal(run("mapS.selected"), 2);
run("mapKey('ArrowDown'); mapKey('KeyS')");
assert.equal(run("mapS.selected"), 4);
run("uiAction('select', 99)");
assert.equal(run("mapS.selected"), 4);
run("mapPointer(790, 455)"); // el antiguo botón de la ficha ya no existe con el panel HTML
assert.equal(run("state"), "map");
run("uiAction('select', 4)"); // elegir la ya elegida la juega: bloqueada → aviso
assert.equal(run("state"), "map");
run("uiAction('select', 0)");
assert.equal(run("state"), "map");
assert.equal(run("uiAction('select', 0)"), true); // segunda vez (Enter/toque sobre la fila) → juega
assert.equal(run("state"), "playing");
run("win()");
assert.equal(run("state"), "won");
run("uiAction('map')");
mv = J("uiView().map");
assert.deepEqual(
  mv.rows.slice(0, 3).map((r) => r.label),
  ["COMPLETADA", "PRÓXIMAMENTE", "Bloqueada"],
);
assert.equal(mv.selected, 1);
assert.equal(run("uiAction('sound')"), true);
assert.equal(J("uiView()").sound, true);
// ---------------------------------------------------------------------------
// Pulido: piquero cuerpo a cuerpo, perro con alerta y preparación, apacheta de la arena,
// aviso del jefe, contorno del héroe en caché, mapa vertical y cartela a medida.
run = makeGame();
// Piquero: nunca dispara balas; se acerca, echa la pica atrás (≥0,3 s) y da la estocada.
run(`reset(); enemies.forEach(e=>e.dead=true); var PQ=enemies[2]; PQ.dead=false; player.x=PQ.x-260; player.inv=999;
  var tWind=-1, tThrust=-1;
  for (let i=0;i<600;i++){ cam=Math.max(0,player.x-280); update(1/60);
    if (PQ.wind>0 && tWind<0) tWind=i; if (PQ.lunge>0 && tThrust<0) { tThrust=i; var thrAnim=PQ.anim; } }`);
assert.equal(run("shots.filter(s=>!s.good).length"), 0);
assert.ok(run("tWind") >= 0 && run("tThrust") > run("tWind"));
assert.ok((run("tThrust") - run("tWind")) / 60 >= 0.33, "telegrafía visible antes de la estocada");
assert.equal(run("thrAnim"), "thrust");
// La estocada hiere dentro del alcance (y solo una vez)…
run(`reset(); enemies.forEach(e=>e.dead=true); PQ=enemies[2]; PQ.dead=false; PQ.x=PQ.home=1400; player.inv=0;
  player.x=PQ.x-40-player.w; cam=player.x-280; PQ.wdir=-1; PQ.lunge=PIQ.thrust; PQ.hitDone=false; PQ.cool=5;
  for (let i=0;i<20;i++) update(1/60)`);
assert.equal(run("player.hp"), 5);
// …pero no fuera de él, ni por encima de la pica (saltando), ni detrás del piquero.
run(`reset(); enemies.forEach(e=>e.dead=true); PQ=enemies[2]; PQ.dead=false; PQ.x=PQ.home=1400; player.inv=0;
  player.x=PQ.x-PIQ.reach-20-player.w; cam=player.x-280; PQ.wdir=-1; PQ.lunge=PIQ.thrust; PQ.hitDone=false; PQ.cool=5;
  for (let i=0;i<20;i++) update(1/60)`);
assert.equal(run("player.hp"), 6);
run("PQ.wdir=-1; var box=thrustBox(PQ)");
assert.equal(run("overlap({x:PQ.x-40-28,y:GROUND-58,w:28,h:58}, box)"), true);
assert.equal(run("overlap({x:PQ.x-40-28,y:GROUND-58-50,w:28,h:58}, box)"), false); // saltando
assert.equal(run("overlap({x:PQ.x+PQ.w+10,y:GROUND-58,w:28,h:58}, box)"), false); // a su espalda
assert.equal(run("box.w"), run("PIQ.reach"));
// La boleadora interrumpe la preparación.
run(`reset(); enemies.forEach(e=>e.dead=true); PQ=enemies[2]; PQ.dead=false; player.x=PQ.x-90; player.inv=999;
  cam=player.x-280; PQ.wind=.2; PQ.wdir=-1; shots.length=0;
  shots.push({x:PQ.x+5,y:PQ.y+20,vx:-1,vy:0,life:1,good:true,damage:1,bola:true,w:16,h:16}); update(1/60)`);
assert.ok(run("PQ.stun > 0 && PQ.wind === 0 && PQ.lunge === 0"));

// Perro: quieto hasta verse en pantalla; luego alerta, y se agacha (≥0,25 s) antes de embestir.
run(`reset(); enemies.forEach(e=>e.dead=true); var PD=enemies[3]; PD.dead=false; player.x=1000; player.inv=999;
  for (let i=0;i<60;i++){ update(1/60); player.x=1000; }`);
assert.deepEqual(J("[PD.x === PD.home, PD.aggro, PD.anim]"), [true, false, "idle"]);
run(`player.x=1400; var tw=-1, tl=-1; for (let i=0;i<300;i++){ update(1/60); player.x=1400;
  if (PD.wind>0 && tw<0) tw=i; if (PD.lunge>0 && tl<0) tl=i; }`);
assert.equal(run("PD.aggro"), true);
// La alerta dura DOG.notice completa sin moverse (aunque su enfriamiento ya estuviera a 0).
run(`reset(); enemies.forEach(e=>e.dead=true); PD=enemies[3]; PD.dead=false; PD.cool=0; player.x=1400; player.inv=999;
  var still=0; update(1/60); for (let i=0;i<60;i++){ const x0=PD.x; update(1/60); player.x=1400; if (PD.alert>0 && PD.x===x0) still++; }`);
assert.ok(run("still") / 60 >= 0.6, "alerta quieta: " + run("still"));
assert.ok(run("tw") >= 0 && (run("tl") - run("tw")) / 60 >= 0.25);
// Quien camina hacia la derecha sin disparar pierde como mucho un corazón con el primer perro.
run(`reset(); enemies.forEach((e,i)=>{ if (i) e.dead=true; }); keys.add('ArrowRight');
  for (let i=0;i<60*6;i++) update(1/60); keys.clear()`);
assert.ok(run("player.hp") >= 5, "primer perro: " + run("player.hp"));
assert.ok(run("player.x") > 900);

// Apacheta en la entrada de la arena: punto de reaparición y recarga justo antes del jefe.
run("reset(); player.x=piles[ARENA_PILE]; update(1/60)");
assert.deepEqual(J("[world.cpPile, world.checkpoint]"), [7, 5100]);
assert.ok(run("piles[ARENA_PILE] > 3400 && piles[ARENA_PILE] < enemies.find(e=>e.type===3).home"));
run("player.ammo=0; keys.add('KeyE'); update(1/60); keys.clear()");
assert.equal(run("player.ammo"), 24);
// Con el jefe vivo, mantener E no da boleadoras infinitas: una recarga por vida y por pulsación.
run("keys.clear(); update(1/60); player.bola=0; player.ammo=0; keys.add('KeyE'); update(1/60); keys.add('KeyL'); for (let i=0;i<120;i++) { player.cool=0; update(1/60); }");
assert.ok(run("player.bola") === 0, "boleadoras infinitas en la arena: " + run("player.bola"));
run("keys.clear(); update(1/60); keys.add('KeyE'); update(1/60); keys.clear()");
assert.equal(run("player.ammo < 24 || player.bola < 3"), true);
run("world.arenaReloads=1; player.ammo=24;");
// Al reaparecer allí, el jefe sube al 60 % si tenía menos…
run("var BA=enemies.find(e=>e.type===3); BA.hp=5; player.hp=1; player.inv=0; hit(); update(1/60); respawn()");
assert.deepEqual(J("[player.x, BA.hp, BA.x]"), [5100, Math.ceil(32 * 0.6), 5350]);
// …y conserva su vida si tenía más.
run("BA.hp=25; player.hp=1; player.inv=0; hit(); update(1/60); respawn()");
assert.equal(run("BA.hp"), 25);

// Aviso del jefe: expone la altura del disparo y dura al menos 0,42 s en ambas fases.
run(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var BT=enemies.find(e=>e.type===3); player.x=3600; player.inv=999;
  cam=player.x-280; BT.x=3900; BT.cool=0; BT.shotN=1; update(1/60)`);
assert.deepEqual(J("[bossTelegraph(BT).height, bossTelegraph(BT).dir]"), ["high", -1]);
assert.equal(run("bossTelegraph(BT).y"), run("BT.y + 22"));
assert.ok(run("BOSS_WIND >= 0.42 && BOSS_WIND_P2 >= 0.42"));
run("BT.pat='low'");
assert.equal(run("bossTelegraph(BT).height"), "low");
run("BT.wind=0");
assert.equal(run("bossTelegraph(BT)"), null);
// El disparo sale a la altura anunciada.
run("BT.wind=.01; BT.pat='low'; BT.wdir=-1; shots.length=0; update(1/60)");
assert.equal(run("shots.filter(s=>!s.good)[0].y"), run("BT.y + 55"));

// Con arte (stubs): el héroe pide contorno claro; los enemigos no. Con «reducir movimiento»
// el aviso del jefe no parpadea (el cuerpo se ilumina en todos los fotogramas).
const calls2 = [];
const SP2 = {
  draw(c, kind, anim, t, x, y, o) {
    calls2.push({ kind, flash: o.flash, outline: o.outline });
    return true;
  },
  size: () => ({ w: 16, h: 16, anchor: "center" }),
  duration: () => 0.4,
};
run = makeGame({ ChankasSprites: SP2, matchMedia: () => ({ matches: true }) });
run("reset(); draw()");
assert.ok(calls2.some((c) => c.kind === "hero" && c.outline === run("HERO_RIM")));
assert.ok(calls2.filter((c) => c.kind !== "hero").every((c) => !c.outline));
run("enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var BR=enemies.find(e=>e.type===3); BR.pat='low'; BR.wdir=-1");
let lit = 0;
for (let i = 0; i < 12; i++) {
  calls2.length = 0;
  run("BR.wind = " + (0.55 - i * 0.04) + "; draw()");
  if (calls2.some((c) => c.kind === "capitan" && c.flash)) lit++;
}
assert.equal(lit, 12);

// Sprites reales: el contorno se pre-renderiza una sola vez por fotograma y color.
(function () {
  let created = 0;
  const fake2d = () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  });
  const ctx = {
    console, Math, Uint8ClampedArray, parseInt,
    document: { createElement: () => (created++, { width: 0, height: 0, getContext: fake2d }) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("art/sprites.js", "utf8"), ctx);
  const S = ctx.ChankasSprites;
  const draws = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === "drawImage" ? (...a) => draws.push(a) : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const o = { facing: 1, outline: "#f6e3a6", w: 28, h: 58 };
  S.draw(g, "hero", "idle", 0, 0, 0, o);
  const after1 = created, rims = S._rimsBuilt();
  assert.equal(rims, 1);
  assert.equal(draws.length, 2); // contorno + sprite
  for (let i = 0; i < 50; i++) S.draw(g, "hero", "idle", 0, 0, 0, o);
  assert.equal(created, after1); // sin nuevos lienzos por fotograma
  assert.equal(S._rimsBuilt(), 1);
  S.draw(g, "hero", "idle", 0, 0, 0, { facing: 1 });
  assert.equal(S._rimsBuilt(), 1); // sin contorno pedido, no se construye
  const rim = draws[0][0];
  assert.equal(rim.width === undefined || rim.width >= 0, true);
})();

// Mapa: cartela a la medida del texto (nunca recorta) y encuadre vertical en móvil.
const fakeMeasure = (t, px) => t.length * px * 0.62;
let cl = RM.cartoucheLayout(fakeMeasure, 300, 1);
assert.ok(cl.w <= 300 && cl.textW + 28 <= cl.w && cl.w % 3 === 0 && cl.f1 === 15);
assert.ok(fakeMeasure(cl.t1, cl.f1) + 4 <= cl.w - 28);
cl = RM.cartoucheLayout(fakeMeasure, 180, 1); // estrecho: reduce la letra hasta caber
assert.ok(cl.f1 < 15 && cl.w <= 180 && fakeMeasure(cl.t1, cl.f1) + 4 + 28 <= cl.w);
assert.ok(cl.f2 <= cl.f1 && cl.h > cl.f1 + cl.f2);
cl = RM.cartoucheLayout(fakeMeasure, 300, 1.15);
assert.ok(cl.w <= 300 && fakeMeasure(cl.t1, cl.f1) + 32 <= cl.w);
assert.equal(RM.viewFor({ width: 780, height: 1040 }).layout, "portrait");
assert.equal(RM.viewFor({ width: 960, height: 540 }).layout, "landscape");
assert.equal(RM.viewFor({ width: 960, height: 540 }).sc, 1);
const PORT = { width: 780, height: 1040, layout: "portrait" };
assert.equal(RM.viewFor(PORT).sc, 2);
RM.stages.forEach((s, i) => {
  const [x, y] = RM.toScreen(s.node[0], s.node[1] - 8, PORT);
  assert.ok(x > 0 && x < 780 && y > 0 && y < 1040, "etapa visible en vertical: " + s.id);
  assert.equal(RM.stageAt(x, y, PORT), i);
  // el rótulo (debajo del icono) también selecciona la etapa
  const [lx, ly] = RM.toScreen(s.node[0], s.node[1] + 32, PORT);
  assert.equal(RM.stageAt(lx, ly, PORT), i, "rótulo " + s.id);
});
assert.equal(RM.stageAt(5, 5, PORT), -1);
// Perú completo dentro del encuadre vertical (norte y sur del país).
for (const [lat, lon] of [[-0.1, -75.2], [-18.3, -70.4], [-4.5, -81.3], [-10, -70.6]]) {
  const p = RM.project(lat, lon), [x, y] = RM.toScreen(p.x, p.y, PORT);
  assert.ok(x >= 0 && x <= 780 && y >= 0 && y <= 1040, "Perú en vertical: " + lat + "," + lon);
}

// El mapa real se prepara y se dibuja en ambos encuadres (lienzos falsos funcionales).
const RMC = realMap(true);
assert.equal(RMC.prepare(), true);
assert.equal(RMC.draw(fakeCtx(), 0, { width: 960, height: 540, card: false }), true);
assert.equal(RMC.draw(fakeCtx(), 0, { width: 780, height: 1040, layout: "portrait", cartouche: false }), true);
assert.equal(RMC.viewFor({ width: 780, height: 1040 }).layout, "portrait");
const [cx3, cy3] = RMC.toScreen(RMC.stages[3].node[0], RMC.stages[3].node[1] - 8);
assert.equal(RMC.stageAt(cx3, cy3), 3); // usa la vista del último dibujo (vertical)
assert.equal(RMC.buttonAt(790, 455), false); // en vertical no hay ficha
// Juego + interfaz en un escenario estrecho: el canvas pasa a 780×1040 en el mapa, el toque
// se escala con el tamaño real del canvas y selecciona la etapa; al jugar vuelve a 960×540.
run = makeGame({
  ChankasUI: { ready: true, init() {}, sync() {}, menuKey: () => false },
  ChankasMap: { ...RMC, prepare: () => true },
  localStorage: memStorage(),
});
run("canvas.dataset = {}; stageW = 390; uiAction('map'); drawMap()");
assert.deepEqual(J("[canvas.width, canvas.height, canvas.dataset.layout]"), [780, 1040, "portrait"]);
run("canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 390, height: 520 })");
assert.deepEqual(J("canvasPoint({ clientX: 10 + 195, clientY: 20 + 260 })"), [390, 520]);
const [tx, ty] = RM.toScreen(RM.stages[3].node[0], RM.stages[3].node[1] - 8, PORT);
run(`mapPointer(...canvasPoint({ clientX: 10 + ${tx} / 2, clientY: 20 + ${ty} / 2 }))`);
assert.equal(run("mapS.selected"), 3);
// …y el rótulo del nombre, debajo del icono, también.
const [lx0, ly0] = RM.toScreen(RM.stages[0].node[0], RM.stages[0].node[1] + 32, PORT);
run(`mapPointer(...canvasPoint({ clientX: 10 + ${lx0} / 2, clientY: 20 + ${ly0} / 2 }))`);
assert.equal(run("mapS.selected"), 0);
run("uiAction('select', 3)");
assert.equal(run("mapS.selected"), 3);
run("stageW = 1200; drawMap()");
assert.deepEqual(J("[canvas.width, canvas.height, canvas.dataset.layout]"), [960, 540, "landscape"]);
run("stageW = 390; drawMap(); uiAction('select', 0); uiAction('select', 0); fitCanvas()");
assert.deepEqual(J("[state, canvas.width, canvas.height, canvas.dataset.layout]"), ["playing", 960, 540, "landscape"]);

// ---------------------------------------------------------------------------
// Escupitajo de la llama (especificación 01): cargas, recarga, H, objetivo, impacto,
// reacciones, rescate automático, sonido, HUD y reinicio.
run = makeGame();
// Escenario: un solo arcabucero a la vista, cerca de la llama.
const spitScene = `reset(); enemies.forEach(e=>e.dead=true); var S1=enemies[1]; S1.dead=false; S1.cool=99;
  player.x=1000; player.inv=999; world.llama=llamaS.prev=920; S1.x=S1.home=1100; cam=720; shots.length=0;`;
const tick = (n, dt = 1 / 60) => run(`for (let i=0;i<${n};i++){ world.llama=920; update(${dt}); }`);
const pressH = () => run("keys.add('KeyH'); world.llama=920; update(1/60); keys.delete('KeyH'); world.llama=920; update(1/60)");
// Iniciar partida: tres cargas, independientes de la munición y de las alforjas.
run("reset()");
assert.deepEqual(J("[world.spitCharges, world.spitRecharge, world.spitUsed, world.spitRescueUsed]"), [3, 0, false, false]);
// H cerca de un enemigo: escupe (gira hacia él, anima, sale el proyectil) y gasta una carga.
run(spitScene);
assert.equal(run("findLlamaTarget() === S1"), true);
pressH();
assert.deepEqual(J("[world.spitCharges, llamaS.anim, llamaS.face, world.spitUsed]"), [2, "spit", 1, true]);
assert.equal(run("shots.some(s=>s.spit)"), false); // aún infla los cachetes
tick(12);
assert.equal(run("shots.filter(s=>s.spit).length"), 1);
assert.deepEqual(J("[player.ammo, world.loads]"), [24, 5]); // munición y alforjas intactas
// Impacto en un soldado: 1 de daño, mancha, retroceso y aturdimiento de 0,5 s; no ataca.
run("var hx0=S1.x; for (let i=0;i<60 && S1.hp===3;i++){ world.llama=920; update(1/60); }");
assert.equal(run("S1.hp"), 2);
assert.ok(run("S1.stun") > 0.4 && run("S1.stun") <= 0.5);
assert.deepEqual(J("[S1.anim, S1.spat > 0, S1.x > hx0, S1.face]"), ["spat", true, true, -1]);
assert.ok(run("particles.some(p=>p.color==='#c3eaa8')"));
assert.ok(J("world.speech.map(b=>b.text)").includes("¡Puaj!"));
run("S1.cool=0; var nb=shots.filter(s=>!s.good).length; for (let i=0;i<20;i++){ world.llama=920; update(1/60); }");
assert.equal(run("shots.filter(s=>!s.good).length"), run("nb")); // aturdido: no dispara
tick(30);
assert.ok(run("S1.stun <= 0 && S1.huff > 0")); // se recupera, aún indignado
// Mantener H no dispara en ráfaga: cada escupitajo pide una pulsación nueva.
run(spitScene + "keys.add('KeyH'); for (let i=0;i<120;i++){ world.llama=920; update(1/60); } keys.clear()");
assert.equal(run("world.spitCharges"), 3 - 1 + 0); // 2 s después: una gastada, ninguna recuperada aún
// Pausa mínima de 0,4 s entre escupitajos.
run(spitScene + "keys.add('KeyH'); update(1/60); keys.clear(); update(1/60); keys.add('KeyH'); update(1/60); keys.clear()");
assert.equal(run("world.spitCharges"), 2);
run("for (let i=0;i<30;i++){ world.llama=920; update(1/60); } keys.add('KeyH'); update(1/60); keys.clear()");
assert.equal(run("world.spitCharges"), 1);
// Sin objetivo (lejos o fuera de pantalla) no se gasta la carga.
run(spitScene + "S1.x=S1.home=1400; cam=900;");
pressH();
assert.deepEqual(J("[world.spitCharges, world.spitUsed, !!world.spitPending]"), [3, false, false]);
run("S1.x=S1.home=1100; cam=1300;"); // a distancia, pero fuera de cámara
assert.equal(run("findLlamaTarget()"), null);
// Elige al enemigo más cercano.
run(spitScene + "var S2=enemies[2]; S2.dead=false; S2.x=S2.home=990;");
assert.equal(run("findLlamaTarget() === S2"), true);
// Un obstáculo sólido bloquea la trayectoria: sin objetivo ni gasto; el proyectil no lo atraviesa.
run(spitScene + "SOLIDS.push({x:1020,y:GROUND-120,w:30,h:120});");
assert.equal(run("findLlamaTarget()"), null);
pressH();
assert.equal(run("world.spitCharges"), 3);
run("shots.push({x:1000,y:GROUND-60,w:12,h:10,vx:460,vy:0,life:1,good:true,damage:1,spit:true}); for (let i=0;i<20;i++) update(1/60)");
assert.deepEqual(J("[S1.hp, shots.filter(s=>s.spit).length]"), [3, 0]);
run("SOLIDS.length=0");
// Recarga: empieza al gastar, una carga cada 6 s, nunca más de 3.
run(spitScene + "world.spitCharges=0;");
tick(60);
assert.ok(run("world.spitRecharge") > 0.9 && run("world.spitCharges") === 0);
tick(5 * 60 + 1);
assert.equal(run("world.spitCharges"), 1);
tick(12 * 60);
assert.deepEqual(J("[world.spitCharges, world.spitRecharge]"), [3, 0]);
tick(10 * 60);
assert.equal(run("world.spitCharges"), 3);
assert.equal(J("hudView(player, world, 0)").spitFill, 0);
// En pausa la recarga no avanza (el bucle no llama a update()).
run(spitScene + "world.spitCharges=1; world.spitRecharge=2; pause(); last=0; for (let i=1;i<=300;i++) loop(i*16)");
assert.deepEqual(J("[state, world.spitCharges, world.spitRecharge]"), ["paused", 1, 2]);
assert.equal(run("(pause(), state)"), "playing");
// No se escupe fuera del juego (pausa, derrota) ni con el héroe caído.
run(spitScene + "state='paused'");
assert.equal(run("activateLlamaSpit()"), false);
run("state='playing'; player.hp=0");
assert.equal(run("activateLlamaSpit()"), false);
// El aturdimiento no se acumula: varios escupitajos seguidos lo dejan en 0,5 s como mucho.
run(spitScene + "S1.hp=9; S1.x=S1.home=1000; for (let k=0;k<3;k++) applySpitImpact(S1,{vx:400})");
assert.ok(run("S1.stun") <= 0.5);
// El perro también reacciona (sacude la cabeza) y sigue recibiendo el impacto pese a ser bajo.
run(spitScene + "S1.dead=true; var DG=enemies[0]; DG.dead=false; DG.x=DG.home=1050; DG.cool=99; DG.aggro=true;");
pressH();
run("for (let i=0;i<60 && DG.hp===3;i++){ world.llama=920; update(1/60); }");
assert.deepEqual(J("[DG.hp, DG.anim, DG.stun > 0]"), [2, "spat", true]);
// Capitán: reacción especial la primera vez («¡Maldita llama!», más larga) y corta después.
const bossScene = `reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var CP=enemies.find(e=>e.type===3); player.x=5200; player.inv=999;
  world.llama=llamaS.prev=5120; CP.x=CP.home=5300; CP.cool=99; cam=4920; world.spitUsed=true; shots.length=0;`;
run(bossScene + "applySpitImpact(CP,{vx:400})");
assert.deepEqual(J("[CP.hp, CP.anim, CP.spatOnce, world.speech.map(b=>b.text)]"), [31, "spat", true, ["¡Maldita llama!"]]);
assert.ok(run("CP.stun") > 0.5 && run("CP.stun") <= 0.8);
assert.equal(run("llamaS.react"), "proud");
run("CP.stun=0; world.speech.length=0; applySpitImpact(CP,{vx:400})");
assert.deepEqual(J("[CP.hp, world.speech.length]"), [30, 0]);
assert.ok(run("CP.stun") <= run("SPIT.bossStun"));
// La reacción cancela la preparación del disparo del capitán.
run(bossScene + "CP.wind=.3; CP.pat='low'; applySpitImpact(CP,{vx:400})");
assert.equal(run("CP.wind"), 0);
// Rescate automático: al llegar al capitán sin haber escupido en esta vida, la llama escupe
// una vez sola (gasta una carga) y enseña la tecla.
run(bossScene + "world.spitUsed=false; update(1/60)");
assert.deepEqual(J("[world.spitRescueUsed, world.spitCharges, world.spitUsed, world.tip.text]"), [
  true,
  2,
  false,
  "¡Tu llama también sabe defenderse! Pulsa H para ayudarla",
]);
assert.equal(J("hudView(player, world, 0)").spitHint, true);
run("for (let i=0;i<60 && CP.hp===32;i++){ world.llama=5120; update(1/60); }");
assert.equal(run("CP.hp"), 31);
// No se repite: ni en la misma vida, ni al reaparecer (aunque se repita el enfrentamiento).
run("for (let i=0;i<8*60;i++){ world.llama=5120; update(1/60); }");
assert.equal(run("world.spitCharges"), 3);
assert.equal(run("shots.filter(s=>s.spit).length"), 0);
run("player.hp=1; player.inv=0; hit(); update(1/60); respawn(); player.x=5200; player.inv=999; world.llama=5120; cam=4920; CP.x=5300; update(1/60)");
assert.deepEqual(J("[world.spitCharges, world.spitUsed, world.spitRescueUsed, !!world.spitPending]"), [3, false, true, false]);
// Si el jugador ya escupió en esta vida, no hay rescate.
run(bossScene + "world.spitUsed=true; update(1/60)");
assert.deepEqual(J("[world.spitRescueUsed, world.spitCharges]"), [false, 3]);
// …ni sin cargas, ni lejos del capitán.
run(bossScene + "world.spitUsed=false; world.spitCharges=0; update(1/60)");
assert.equal(run("world.spitRescueUsed"), false);
run(bossScene + "world.spitUsed=false; player.x=3000; world.llama=2920; cam=2720; update(1/60)");
assert.equal(run("world.spitRescueUsed"), false);
// Reiniciar la partida restablece la habilidad (y el rescate vuelve a estar disponible).
run(bossScene + "world.spitCharges=0; world.spitRescueUsed=true; world.tip={text:'x',t:2}; reset()");
assert.deepEqual(J("[world.spitCharges, world.spitRecharge, world.spitUsed, world.spitRescueUsed, world.tip]"), [3, 0, false, false, null]);
// Personalidad: sorpresa al recibir daño, preocupación con poca vida, celebración al ganar.
run(spitScene + "player.inv=0; hit(); world.llama=920; update(1/60)");
assert.equal(run("llamaS.anim"), "surprise");
run("player.hp=2; for (let i=0;i<60;i++){ player.x=1000; player.kb=0; world.llama=920; llamaS.prev=920; update(1/60); }");
assert.equal(run("llamaS.anim"), "worry");
run("player.hp=6; llamaS.still=0; for (let i=0;i<5*60;i++){ player.x=1000; player.kb=0; player.inv=999; world.llama=920; llamaS.prev=920; update(1/60); }");
assert.equal(run("llamaS.anim"), "look");
run(bossScene + "CP.hp=1; applySpitImpact(CP,{vx:400})");
run(OUTRO_RUN);
assert.deepEqual(J("[state, llamaS.anim]"), ["won", "celebrate"]);
// HUD: cargas, progreso de la recarga y etiqueta accesible; la línea del canvas cabe.
run(spitScene + "world.spitCharges=1; world.spitRecharge=3");
hv = J("hudView(player, world, 0)");
assert.deepEqual([hv.spit, hv.spitMax, hv.spitFill, hv.spitHint], [1, 3, 0.5, false]);
assert.equal(hv.spitLabel, "Escupitajos de la llama: 1 de 3, recuperando");
assert.deepEqual(J("[hudView(null,null,0).spit, hudView(null,null,0).spitFill]"), [3, 0]);
assert.ok(run("hudLine()").endsWith("LLAMA ●○○"));
assert.ok(run("player.hp=6; hudLine().length * 7.5 + 16 <= HUD_W"));
// Dibujo sin sprites con escupitajo, mancha, enfado, globo y aviso: no lanza.
run(bossScene + "world.spitUsed=false; update(1/60); applySpitImpact(CP,{vx:400}); CP.stun=0; for (let i=0;i<30;i++){ update(1/60); draw(); }");
// Sonido: con el sonido apagado no se crea audio; encendido, cada efecto sintetiza nodos.
const audioLog = [];
function FakeAudio() {
  audioLog.push("ctx");
  const node = () =>
    new Proxy(
      {},
      {
        get: (t, k) =>
          k in t
            ? t[k]
            : k === "connect"
              ? (n) => n
              : ["gain", "frequency", "Q"].includes(k)
                ? (t[k] = new Proxy({}, { get: (p, m) => (m in p ? p[m] : () => {}), set: (p, m, v) => ((p[m] = v), true) }))
                : () => {},
        set: (t, k, v) => ((t[k] = v), true),
      },
    );
  this.currentTime = 0;
  this.sampleRate = 8000;
  this.destination = node();
  for (const m of ["createOscillator", "createGain", "createBiquadFilter", "createBufferSource"])
    this[m] = () => (audioLog.push(m), node());
  this.createBuffer = (c, n) => ({ getChannelData: () => new Float32Array(n) });
}
run = makeGame({ AudioContext: FakeAudio });
run("reset(); sfx('spit'); sfx('splat'); sfx('recharge'); sfx('grumble'); tone()");
assert.equal(audioLog.length, 0);
run("sound=true; sfx('spit')");
assert.ok(audioLog.includes("ctx") && audioLog.includes("createBiquadFilter") && audioLog.includes("createBufferSource"));
for (const n of ["splat", "recharge", "grumble"]) {
  const before = audioLog.length;
  run(`sfx('${n}')`);
  assert.ok(audioLog.length > before, "efecto " + n);
}
// En móvil el aviso del rescate señala el botón táctil.
run = makeGame({ matchMedia: (q) => ({ matches: q === "(pointer: coarse)" }) });
assert.equal(run("rescueTip()"), "¡Tu llama también sabe defenderse! Toca el botón LLAMA para ayudarla");
// Botón táctil: existe en la página, usa la misma tecla (KeyH) y funciona con el sistema de toques.
const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /<button[^>]*data-key="KeyH"[^>]*>/);
run = makeGame();
run(spitScene);
run("keys.add('KeyH'); world.llama=920; update(1/60); keys.delete('KeyH')"); // = onpointerdown / onpointerup
assert.equal(run("world.spitCharges"), 2);
// Con sprites: la llama y los enemigos usan las nuevas animaciones; el arte real las define.
run = makeGame({ ChankasSprites: SP, ChankasBackground: BG });
run(spitScene + "keys.add('KeyH'); update(1/60); keys.clear(); for (let i=0;i<60 && S1.hp===3;i++){ world.llama=920; update(1/60); }");
calls.length = 0;
run("draw()");
assert.ok(calls.some((c) => c.kind === "arcabucero" && c.anim === "spat"));
assert.ok(run("fx.some(f=>f.kind==='splat')"));
(function () {
  const ctx = { console, Math, Uint8ClampedArray, parseInt };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("art/sprites.js", "utf8"), ctx);
  const L = ctx.ChankasSprites.list();
  for (const a of ["spit", "proud", "surprise", "look", "worry", "celebrate"]) assert.ok(L.llama.anims[a], "llama." + a);
  const d = ctx.ChankasSprites.duration("llama", "spit");
  assert.ok(d >= 0.4 && d <= 0.6, "animación de escupir 0,4–0,6 s: " + d);
  for (const k of ["perro", "arcabucero", "piquero", "capitan"]) assert.ok(L[k].anims.spat, k + ".spat");
  assert.ok(L.splat && L.spit.box.w >= 12 && L.spit.box.w <= 18);
  // Todos los fotogramas nuevos se construyen sin errores (colores válidos de la paleta).
  for (const [k, anims] of [["llama", ["spit", "proud", "surprise", "look", "worry", "celebrate"]], ["perro", ["spat"]], ["arcabucero", ["spat"]], ["piquero", ["spat"]], ["capitan", ["spat"]], ["splat", ["burst"]], ["spit", ["fly"]]])
    for (const a of anims) for (let i = 0; i < L[k].anims[a].frames; i++) ctx.ChankasSprites._grid(k, a, i);
})();


// ---------------------------------------------------------------------------
// Ruta de la resistencia (aprobada): Sacsayhuamán → Ollantaytambo → La Convención (Vitcos) →
// Vilcabamba (Espíritu Pampa) → El Callao (ficción declarada).
assert.deepEqual(
  JSON.parse(JSON.stringify(RM.stages.map((s) => [s.id, s.name, s.year]))),
  [
    ["sacsayhuaman", "Sacsayhuamán", "1536"],
    ["ollantaytambo", "Ollantaytambo", "1537"],
    ["laconvencion", "La Convención", "1537"],
    ["vilcabamba", "Vilcabamba", "1539"],
    ["callao", "El Callao", "Ficción"],
  ],
);
const near = (s, lat, lon) => Math.abs(s.lat - lat) < 0.1 && Math.abs(s.lon - lon) < 0.1;
assert.ok(near(RM.stages[2], -13.1, -72.94), "Vitcos (Rosaspata)");
assert.ok(near(RM.stages[3], -12.91, -73.21), "Espíritu Pampa");
assert.ok(/Vitcos/.test(RM.stages[2].history) && /1537/.test(RM.stages[2].history));
assert.ok(/1572/.test(RM.stages[3].history) && /Gonzalo Pizarro/.test(RM.stages[3].history));
assert.ok(RM.stages[4].fictional && /inventada/.test(RM.stages[4].fiction) && /no ocurrieron/.test(RM.stages[4].history));
assert.equal(RM.stages.filter((s) => s.fictional).length, 1);
// Iconos: todos existen en el mapa real y los nodos no se pisan (≥ 40 px base entre sí).
for (let i = 0; i < RM.stages.length; i++)
  for (let j = i + 1; j < RM.stages.length; j++) {
    const a = RM.stages[i].node, b = RM.stages[j].node;
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 40, "nodos separados " + i + "-" + j);
  }
assert.ok(RMC.draw(fakeCtx(), 1, { width: 960, height: 540, progress: 4, selected: 3 }));

// Interfaz «arte clave»: modelo de vista con etapa, lugar y año; arma elegida; recarga contextual.
run = makeGame({ ChankasUI: UISTUB, ChankasMap: MAPSTUB, localStorage: memStorage() });
uv = J("uiView()");
assert.deepEqual([uv.stages.length, uv.stagePlace, uv.stageYear, uv.layout, uv.rotate], [5, "Cusco", "1536", "desktop", false]);
assert.deepEqual(J("uiView().stages.map(s=>s.fictional)"), [false, false, false, false, true]);
assert.equal(run("uiAction('weapon', 1)"), false); // en el título no hay arma que elegir
run("uiAction('start')");
assert.equal(run("uiAction('weapon', 1)"), true);
assert.equal(J("uiView().hud.weapon"), "K");
assert.equal(run("fireKey(player)"), "KeyK");
run("player.fire = 0");
assert.equal(run("fireKey(player)"), "KeyJ"); // sin piedras de fuego, la huaraca
run("uiAction('weapon', 2)");
assert.equal(run("fireKey(player)"), "KeyL");
run("player.bola = 0");
assert.equal(run("fireKey(player)"), "KeyJ");
assert.equal(run("fireKey(null)"), "KeyJ");
assert.equal(run("uiAction('weapon', 7)"), false);
// Recargar contextual: junto a la apacheta inicial sí; lejos de apachetas y de la llama, no.
run("player.x = piles[0]; update(1/60)");
assert.equal(J("uiView().reload"), true);
run("player.x = 1250; world.llama = 300; update(1/60)");
assert.equal(J("uiView().reload"), false);
// «suspend» pausa sin alternar (salir de pantalla completa, pestaña oculta).
assert.equal(run("uiAction('suspend')"), true);
assert.equal(run("state"), "paused");
assert.equal(run("uiAction('suspend')"), false);
assert.equal(run("state"), "paused");

// Disposición por tipo de puntero (no por user agent) y aviso «Gira tu teléfono».
assert.equal(run("controlLayout({coarse:true, w:844, h:390})"), "touch");
assert.equal(run("controlLayout({coarse:false, w:390, h:844})"), "desktop");
assert.equal(run("needsRotate('touch', 390, 844, 'playing')"), true);
assert.equal(run("needsRotate('touch', 390, 844, 'menu')"), false); // título y mapa funcionan en vertical
assert.equal(run("needsRotate('touch', 844, 390, 'playing')"), false);
assert.equal(run("needsRotate('desktop', 390, 844, 'playing')"), false);
assert.deepEqual(J("rotateStep('playing', true, false)"), { act: "pause", held: true });
assert.deepEqual(J("rotateStep('paused', true, true)"), { act: null, held: true });
assert.deepEqual(J("rotateStep('paused', false, true)"), { act: "resume", held: false });
assert.deepEqual(J("rotateStep('paused', false, false)"), { act: null, held: false }); // pausa del jugador: no se reanuda
assert.deepEqual(J("rotateStep('menu', true, true)"), { act: null, held: false });
// Con puntero táctil y ventana vertical, el modelo lo indica y el bucle pausa/reanuda.
const win = { ChankasUI: UISTUB, ChankasMap: MAPSTUB, localStorage: memStorage(), innerWidth: 390, innerHeight: 844,
  matchMedia: (q) => ({ matches: q === "(pointer: coarse)" }) };
run = makeGame(win);
run("uiAction('start')");
assert.deepEqual(J("[uiView().layout, uiView().rotate]"), ["touch", true]);
run("loop(16)");
assert.deepEqual(J("[state, rotateHeld]"), ["paused", true]);
run("window.innerWidth = 844; window.innerHeight = 390; loop(32)");
assert.deepEqual(J("[state, rotateHeld, uiView().rotate]"), ["playing", false, false]);
// Si además se oculta la pestaña (o se sale de pantalla completa), al girar no se reanuda sola.
run("window.innerWidth = 390; window.innerHeight = 844; loop(48)");
assert.deepEqual(J("[state, rotateHeld]"), ["paused", true]);
assert.equal(run("uiAction('suspend')"), true);
run("window.innerWidth = 844; window.innerHeight = 390; loop(64)");
assert.deepEqual(J("[state, rotateHeld]"), ["paused", false]);
// Cruceta: zona muerta, izquierda/derecha, arriba = saltar (diagonales combinan).
assert.deepEqual(J("padKeys(2, 3, 60)"), []);
assert.deepEqual(J("padKeys(-50, 0, 60)"), ["ArrowLeft"]);
assert.deepEqual(J("padKeys(50, -50, 60)"), ["ArrowRight", "ArrowUp"]);
assert.deepEqual(J("padKeys(0, -55, 60)"), ["ArrowUp"]);
assert.deepEqual(J("padKeys(0, 55, 60)"), []); // abajo: sin acción
assert.deepEqual(J("padKeys(NaN, 0, 60)"), []);

// Página: controles en pantalla, HUD superpuesto, metadatos sociales y app web; sin estilos en línea (CSP).
const page = fs.readFileSync("index.html", "utf8");
for (const k of ["ArrowLeft", "ArrowRight", "Space", "KeyJ", "KeyK", "KeyL", "KeyH", "KeyE"])
  assert.match(page, new RegExp('data-key="' + k + '"'), "botón " + k);
assert.equal((page.match(/data-key="KeyH"/g) || []).length, 1, "sin controles táctiles duplicados");
assert.match(page, /data-fire/);
assert.match(page, /data-pad/);
assert.match(page, /<meta property="og:image" content="https:\/\/chankas\.maxflow\.ink\/assets\/keyart-social\.jpg"/);
assert.match(page, /<meta name="twitter:card" content="summary_large_image"/);
assert.match(page, /<meta property="og:url" content="https:\/\/chankas\.maxflow\.ink\/"/);
assert.match(page, /<link rel="manifest" href="manifest\.webmanifest"/);
assert.match(page, /apple-mobile-web-app-capable/);
assert.doesNotMatch(page, /\sstyle="/);
assert.doesNotMatch(page, /<script>(?!<\/script>)/);
const mf = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
assert.deepEqual([mf.display, mf.orientation, mf.theme_color], ["fullscreen", "landscape", "#16121A"]);
assert.ok(mf.icons.some((i) => i.sizes === "192x192") && mf.icons.some((i) => i.sizes === "512x512"));
assert.match(fs.readFileSync("deploy/nginx/templates/security-headers.inc.template", "utf8"), /manifest-src 'self'/);
assert.ok(fs.statSync("assets/keyart.webp").size < 250 * 1024, "arte clave optimizado");

// build-dist: publica JS/CSS con hash y los recursos estáticos; nunca data.txt, docs ni tests.
{
  const os = require("node:os"), path = require("node:path"), { execFileSync } = require("node:child_process");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "chankas-dist-"));
  try {
    execFileSync(process.execPath, ["scripts/build-dist.cjs", outDir], { stdio: "pipe" });
    const files = [];
    (function walk(d, rel) {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f), r = rel ? rel + "/" + f : f;
        if (fs.statSync(full).isDirectory()) walk(full, r);
        else files.push(r);
      }
    })(outDir, "");
    for (const f of ["manifest.webmanifest", "assets/keyart.webp", "assets/keyart-social.jpg", "assets/favicon.svg", "assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png", "index.html", "404.html"])
      assert.ok(files.includes(f), "dist incluye " + f);
    assert.ok(files.some((f) => /^game\.[0-9a-f]{12}\.js$/.test(f)) && files.some((f) => /^style\.[0-9a-f]{12}\.css$/.test(f)));
    assert.ok(!files.some((f) => /data\.txt|^docs\/|^tests\/|preview-|\.md$/.test(f)), "nada de datos ni documentación");
    const distHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    assert.match(distHtml, /href="manifest\.webmanifest"/);
    assert.doesNotMatch(distHtml, /src="game\.js"/);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

console.log(
  "OK: inicio, munición, fuego, recarga, salto, pausa, derrota, empate→victoria, sin disparos fuera de cámara, checkpoint/respawn, escupitajo, telegrafía del jefe, empuje, macana, perro sin balas, boleadora, HUD, arte (stubs), mapa (título→mapa→nivel, victoria→mapa, bloqueadas, localStorage, fallback, teclas retenidas, foco, toques), interfaz v2 (HUD, ruta, alforjas de la llama, pantallas y acciones), pulido (piquero cuerpo a cuerpo, perro con alerta, apacheta de la arena, aviso del jefe, contorno del héroe, mapa vertical, cartela), escupitajo de la llama (cargas, recarga y pausa, H sin ráfagas, objetivo y obstáculos, impacto y aturdimiento, reacciones del capitán, rescate automático, personalidad, HUD, sonido, botón táctil, sprites), arte clave (ruta I–V con ficción declarada, arma elegida, disparo táctil, recarga contextual, disposición táctil/escritorio, «Gira tu teléfono», cruceta, metadatos y manifiesto, build-dist con recursos).",
);

// Modalidades, recorrido ampliado, objetivo opcional y métricas competitivas.
run = makeGame();
run("reset()");
assert.equal(run("END"), 5670);
assert.equal(run("enemies.filter(e=>e.type!==3).length"), 12);
assert.equal(run("enemies.find(e=>e.type===3).home"), 5350);
run("difficultyId='chasqui'; reset()");
assert.equal(run("player.fire"), 7);
run("player.ammo=0; world.llama=player.x; llamaReload()");
assert.equal(run("player.ammo"), 10);
run("difficultyId='pachacutec'; reset(); player.ammo=0; world.llama=player.x; llamaReload()");
assert.equal(run("player.fire"), 3);
assert.equal(run("player.ammo"), 6);
assert.equal(run("difficulty.attacks"), 1.25);
run("difficultyId='inka'; reset(); enemies.forEach(e=>e.dead=true); player.inv=999; player.x=3750; player.y=235; player.vy=0; update(.001)");
assert.equal(run("world.optionalCompleted"), true);
assert.equal(run("score"), 300);
assert.equal(run("player.fire"), 6);
run("update(.001)");
assert.equal(run("score"), 300, "la recompensa opcional no se repite");
run("reset(); shoot(false); player.cool=0; throwBola()");
assert.equal(run("world.shots"), 2);
run("player.ammo=0; player.cool=0; shoot(false)");
assert.equal(run("world.shots"), 2, "la macana no cuenta como lanzamiento");
let payload, begun, abandoned = 0;
run = makeGame({ChankasCompetition: {
 getDifficulty:()=>"pachacutec", begin:id=>{begun=id;}, finish:m=>{payload=m;}, reset:()=>{abandoned++;}, sync:()=>{},
}});
run("reset(); world.time=120; world.kills=12; world.shots=20; world.hits=16; world.llamaHits=5; world.optionalCompleted=true; score=2500; win()");
assert.equal(begun, "pachacutec");
assert.deepEqual(JSON.parse(JSON.stringify(payload)), {completed:true,kills:12,shots:20,hits:16,llamaHits:5,deaths:0,optionalCompleted:true,durationMs:120000});
assert.equal(run("score"), 3180);
run("goTitle()");
assert.equal(abandoned, 1);
// Caída del capitán: escena de ≈3 s antes de la victoria. Sin control, sin daño, sin balas,
// los soldados huyen; el reloj se fija al derrotarlo y los ganchos de victoria saltan una vez.
let finished = 0;
payload = null;
run = makeGame({ChankasCompetition: {
 getDifficulty:()=>"inka", begin:()=>{}, finish:m=>{finished++; payload=m;}, reset:()=>{}, sync:()=>{},
}});
run(`reset(); world.time=90; world.kills=5; var FB=enemies.find(e=>e.type===3); player.x=FB.x-200; player.inv=0; cam=FB.x-500;
  enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var FL=enemies[11]; FL.dead=false; FL.x=FB.x-400;
  FB.hp=1; shots.length=0; shots.push({x:FB.x+10,y:FB.y+20,vx:0,vy:0,life:1,good:true,damage:1});
  shots.push({x:player.x+300,y:player.y+20,vx:-240,vy:0,life:3,good:false}); update(1/60)`);
assert.deepEqual(J("[state, FB.dead, !!world.outro, shots.length]"), ["playing", true, true, 0]);
assert.equal(finished, 0, "la victoria no salta al instante");
const scoreAtKill = run("score"),
  timeAtKill = run("world.time");
// Sin control ni daño durante la escena.
run("var X0=player.x; keys.add('ArrowRight'); keys.add('KeyJ'); player.inv=0; update(1/60); hit(player.x); hit(player.x)");
assert.deepEqual(J("[player.x===X0, player.hp, shots.length]"), [true, 6, 0]);
run("keys.clear()");
// Los enemigos restantes no atacan: el que quedaba huye y desaparece.
run("for (let i=0;i<60;i++) update(1/60)");
assert.equal(run("FL.flee < 1 && FL.x < FB.x-400"), true);
assert.equal(run("shots.filter(s=>!s.good).length"), 0);
// La pausa congela la escena y no la rompe.
run("pause(); var T0=world.outro.t");
assert.equal(run("state"), "paused");
run("pause(); update(1/60)");
assert.ok(run("world.outro.t - T0") < 0.02);
// El capitán cae de espaldas (girado 90°), lejos del héroe; después llega la victoria.
run("for (let i=0;i<60 && world.outro.t < OUTRO.land + .1;i++) update(1/60)");
assert.deepEqual(J("[state, world.outro.landed, Math.abs(FB.rot)===Math.PI/2, FB.x > FB.home]"), ["playing", true, true, true]);
assert.equal(finished, 0);
assert.equal(run("FL.gone"), true);
assert.equal(run("world.time"), timeAtKill, "el reloj de la partida no cuenta la escena");
assert.equal(run("score"), scoreAtKill);
run(OUTRO_RUN);
assert.equal(run("state"), "won");
assert.equal(finished, 1);
assert.equal(payload.durationMs, Math.round(timeAtKill * 1000));
run("for (let i=0;i<120;i++) update(1/60); win(); draw()");
assert.equal(finished, 1, "los ganchos de victoria saltan una sola vez");
// Duración total ≈3,2 s (2–3,5 s), más corta con «reducir movimiento».
const outroFrames = (rm) => {
  const g = makeGame({ matchMedia: () => ({ matches: rm }) });
  g(`reset(); enemies.filter(e=>e.type!==3).forEach(e=>e.dead=true); var B=enemies.find(e=>e.type===3); B.hp=1;
    shots.push({x:B.x+10,y:B.y+20,vx:0,vy:0,life:1,good:true,damage:1}); update(1/60)`);
  let n = 0;
  while (g("state") === "playing" && n < 400) {
    g("update(1/60); draw()");
    n++;
  }
  assert.equal(g("state"), "won");
  return n / 60;
};
const tFull = outroFrames(false),
  tQuick = outroFrames(true);
assert.ok(tFull >= 2.5 && tFull <= 3.5, "escena " + tFull);
assert.ok(tQuick < tFull && tQuick >= 1.5, "reducida " + tQuick);
run.fire("chankas-profile", {detail:{progress:{completedStages:[1]}}});
assert.equal(run("mapS.progress"), 1);
run("reset()");
run.fire("keydown", {code:"KeyD",target:{closest:sel=>sel.includes("input") ? {} : null}});
assert.equal(run("keys.has('KeyD')"), false, "escribir en el alias no mueve al héroe");
console.log("OK: complejidad temática, extensión de etapa, recompensa opcional única, métricas, restauración MongoDB y abandono.");

run = makeGame({ChankasCompetition:{getProgress:()=>({completedStages:[1]})}});
assert.equal(run("mapS.progress"), 1, "se restaura un perfil llegado antes de cargar el motor");

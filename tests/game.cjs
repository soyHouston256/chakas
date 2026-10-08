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
run("reset(); player.hp=1; player.inv=0; hit()");
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
// El dibujo con fallback no lanza.
run("for (let i = 0; i < 30; i++) { update(.016); draw(); }");

// 2) Con arte: stubs de window.ChankasSprites / ChankasBackground
const calls = [];
const SP = {
  draw(ctx, kind, anim, t, x, y, o) {
    calls.push({ kind, anim, t, x, y, rot: o.rotation, flash: o.flash, fill: o.fill });
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
console.log(
  "OK: inicio, munición, fuego, recarga, salto, pausa, derrota, victoria, hitbox del perro, fallback y arte (stubs).",
);

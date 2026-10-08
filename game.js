"use strict";
const canvas = document.querySelector("canvas"),
  ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay"),
  keys = new Set();
let state = "menu",
  last = 0,
  world,
  player,
  shots,
  enemies,
  particles,
  cam = 0,
  score = 0,
  sound = false,
  audio,
  fx = [],
  renderT = 0,
  llamaS = { anim: "idle", animT: 0, face: 1, prev: 20 };
// Arte opcional (art/sprites.js y art/background.js). Si falta, se usan los rectángulos.
const SP = window.ChankasSprites || null,
  BG = window.ChankasBackground || null;
const ENEMY_KIND = ["perro", "arcabucero", "piquero", "capitan"];
const SPR = { facing: 1, fill: 1, flash: false, alpha: 1, rotation: 0, active: false, w: 0, h: 0 };
const BG_OPTS = { width: 960, height: 540, levelLength: 4200 };
const DOG_W = 44,
  DOG_H = 26;
const W = 960,
  H = 540,
  GROUND = 440,
  END = 4200;
const piles = [180, 850, 1600, 2450, 3200];
const platforms = [
  { x: 580, y: 350, w: 180 },
  { x: 1250, y: 340, w: 200 },
  { x: 2100, y: 345, w: 180 },
  { x: 2820, y: 330, w: 220 },
];
function tone(freq = 350) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.04, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.start();
    o.stop(audio.currentTime + 0.12);
  } catch {}
}
function reset() {
  player = {
    x: 70,
    y: GROUND - 58,
    w: 28,
    h: 58,
    vy: 0,
    hp: 6,
    ammo: 24,
    fire: 5,
    face: 1,
    cool: 0,
    inv: 0,
    ground: true,
    anim: "idle",
    animT: 0,
    throwT: 0,
    flash: 0,
  };
  shots = [];
  particles = [];
  score = 0;
  cam = 0;
  world = { time: 0, llama: 20, spit: 0, checkpoint: 70 };
  fx = [];
  llamaS = { anim: "idle", animT: 0, face: 1, prev: world.llama, spitT: 9 };
  enemies = [];
  [620, 980, 1360, 1750, 2150, 2600, 2940, 3300].forEach((x, i) => {
    const dog = i % 3 === 0; // type 0 = perro (alano): hitbox bajo y ancho
    enemies.push({
      x,
      y: GROUND - (dog ? DOG_H : 48),
      w: dog ? DOG_W : 30,
      h: dog ? DOG_H : 48,
      // El cuerpo del perro es bajo, pero recibe impactos en la misma franja vertical que
      // los demás enemigos (48 px) para que piedras y escupitajos sigan acertándole.
      hurtPad: dog ? 48 - DOG_H : 0,
      hp: 3,
      type: i % 3,
      cool: 1 + (i % 2),
      home: x,
      dead: false,
      ...animFields(),
    });
  });
  enemies.push({
    x: 3910,
    y: GROUND - 96,
    w: 72,
    h: 96,
    hp: 32,
    max: 32,
    type: 3,
    cool: 1.5,
    home: 3910,
    dead: false,
    ...animFields(),
  });
  state = "playing";
  overlay.style.display = "none";
}
function animFields() {
  return { anim: "", animT: 0, face: -1, flash: 0, fvx: 0, fvy: 0, rot: 0, spin: 0, gone: false };
}
// Cambia de animación solo si es distinta (reinicia el temporizador de la acción).
function setAnim(o, a) {
  if (o.anim !== a) {
    o.anim = a;
    o.animT = 0;
  }
}
function restartAnim(o, a) {
  o.anim = a;
  o.animT = 0;
}
function animDur(kind, anim, fallback) {
  return SP && SP.duration ? SP.duration(kind, anim) || fallback : fallback;
}
// Efectos de arte (hit_spark, dust, muzzle_flash): x,y = centro del efecto.
function spawnFx(kind, anim, x, y, face = 1) {
  if (!SP) return;
  fx.push({ kind, anim, x, y, t: 0, face, dur: animDur(kind, anim, 0.3) });
}
function updateFx(dt) {
  let n = 0;
  for (const f of fx) {
    f.t += dt;
    if (f.t < f.dur) fx[n++] = f;
  }
  fx.length = n;
  for (const e of enemies) {
    if (!e.dead || e.gone) continue;
    e.animT += dt;
    e.flash -= dt;
    if (e.type === 3) continue; // el capitán cae de rodillas en su sitio
    e.x += e.fvx * dt;
    e.y += e.fvy * dt;
    e.fvy += 900 * dt;
    e.rot += e.spin * dt;
    if (e.y > H + 100 || e.x + e.w < cam - 150 || e.x > cam + W + 150) e.gone = true;
  }
}
function show(title, message, label) {
  document.querySelector("#title").textContent = title;
  document.querySelector("#message").textContent = message;
  document.querySelector("#start").textContent = label;
  overlay.style.display = "flex";
}
document.querySelector("#start").onclick = () => {
  if (state === "paused") {
    state = "playing";
    overlay.style.display = "none";
  } else reset();
};
document.querySelector("#sound").onclick = () => {
  sound = !sound;
  document.querySelector("#sound").textContent = "Sonido: " + (sound ? "sí" : "no");
  tone();
};
function pause() {
  if (state === "playing") {
    state = "paused";
    show("Un respiro en el camino", "Tu expedición te espera.", "Continuar →");
  } else if (state === "paused") {
    state = "playing";
    overlay.style.display = "none";
  }
}
addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
    e.preventDefault();
  if (e.code === "KeyP" && !e.repeat) pause();
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  if (state === "playing") pause();
});
document.querySelectorAll("[data-key]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key);
  };
  b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.key);
});
function burst(x, y, color, n = 12) {
  for (let i = 0; i < n; i++)
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 240,
      vy: -Math.random() * 230,
      t: 0.6,
      color,
    });
}
function hit() {
  if (player.inv > 0) return;
  player.hp--;
  player.inv = 1.5;
  player.flash = 0.12;
  player.throwT = 0;
  restartAnim(player, player.hp <= 0 ? "dead" : "hurt");
  burst(player.x, player.y, "#e9b25f");
  tone(130);
  if (player.hp <= 0) {
    state = "lost";
    show(
      "El camino aún te necesita",
      "Vuelve a intentarlo. Recarga en los montones de piedras y salta los proyectiles.",
      "Volver a jugar →",
    );
  }
}
function shoot(fire) {
  if (player.cool > 0 || player.ammo <= 0 || (fire && player.fire <= 0)) return;
  player.ammo--;
  if (fire) player.fire--;
  player.cool = fire ? 0.65 : 0.24;
  restartAnim(player, "throw");
  player.throwT = animDur("hero", "throw", 0.3);
  shots.push({
    x: player.x + 14,
    y: player.y + 23,
    vx: player.face * 620,
    vy: fire ? -70 : 0,
    life: 1.4,
    good: true,
    damage: fire ? 5 : 1,
    fire,
  });
  tone(fire ? 220 : 520);
}
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + (a.w || 8) > b.x && a.y < b.y + b.h && a.y + (a.h || 8) > b.y;
}
// Impacto de proyectil aliado: como overlap(), pero con la zona de impacto ampliada hacia arriba.
function hitsEnemy(s, e) {
  const top = e.y - (e.hurtPad || 0);
  return s.x < e.x + e.w && s.x + (s.w || 8) > e.x && s.y < e.y + e.h && s.y + (s.h || 8) > top;
}
function update(dt) {
  world.time += dt;
  player.cool -= dt;
  player.inv -= dt;
  player.animT += dt;
  player.throwT -= dt;
  player.flash -= dt;
  const wasGround = player.ground;
  let direction =
    (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
    (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  player.x = Math.max(0, Math.min(END - 40, player.x + direction * 230 * dt));
  if (direction) player.face = direction;
  if ((keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW")) && player.ground) {
    player.vy = -510;
    player.ground = false;
    spawnFx("dust", "puff", player.x + player.w / 2, player.y + player.h - 6);
    tone(300);
  }
  const old = player.y + player.h;
  player.vy += 1250 * dt;
  player.y += player.vy * dt;
  player.ground = false;
  let floor = GROUND;
  for (const p of platforms)
    if (
      player.x + player.w > p.x &&
      player.x < p.x + p.w &&
      old <= p.y + 2 &&
      player.y + player.h >= p.y &&
      player.vy >= 0
    )
      floor = Math.min(floor, p.y);
  if (player.y + player.h >= floor) {
    player.y = floor - player.h;
    player.vy = 0;
    player.ground = true;
    if (!wasGround) spawnFx("dust", "puff", player.x + player.w / 2, player.y + player.h - 6);
  }
  if (keys.has("KeyJ")) shoot(false);
  if (keys.has("KeyK")) shoot(true);
  if (keys.has("KeyE") && piles.some((x) => Math.abs(player.x - x) < 85)) {
    player.ammo = 24;
    world.checkpoint = player.x;
  }
  world.llama += (player.x - 80 - world.llama) * dt * 3;
  world.spit -= dt;
  for (const e of enemies) {
    if (e.dead || Math.abs(e.x - player.x) > 850) continue;
    const dir = player.x > e.x ? 1 : -1;
    const prevX = e.x;
    e.cool -= dt;
    e.animT += dt;
    e.flash -= dt;
    if (e.type === 0) e.x += dir * 65 * dt;
    else if (e.type === 2) e.x = e.home + Math.sin(world.time * 1.8) * 85;
    else if (e.type === 3) e.x += dir * 45 * dt;
    enemyAnim(e, dir, prevX);
    if (overlap(player, e)) hit();
    if (e.cool <= 0 && Math.abs(e.x - player.x) < 650) {
      e.cool = e.type === 3 ? 0.85 : e.type === 1 ? 1.8 : 2.5;
      e.face = dir;
      restartAnim(e, ENEMY_ATTACK[e.type]);
      if (e.type === 1 || e.type === 3)
        spawnFx("muzzle_flash", "burst", dir > 0 ? e.x + e.w + 6 : e.x - 6, e.y + (e.type === 3 ? 40 : 20), dir);
      shots.push({
        x: e.x,
        y: e.y + 22,
        vx: dir * (e.type === 3 ? 300 : 240),
        vy: 0,
        life: 3,
        good: false,
      });
      if (e.type === 3)
        shots.push({ x: e.x, y: e.y + 55, vx: dir * 330, vy: 0, life: 3, good: false });
    }
    if (Math.abs(e.x - world.llama) < 240 && world.spit <= 0) {
      shots.push({
        x: world.llama + 12,
        y: GROUND - 48,
        vx: dir * -400,
        vy: 0,
        life: 0.65,
        good: true,
        damage: 1,
        spit: true,
      });
      world.spit = 2.8;
      restartAnim(llamaS, "spit");
      llamaS.spitT = 0;
      llamaS.face = dir * -1;
    }
  }
  for (const s of shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.fire) s.vy += 200 * dt;
    s.life -= dt;
    if (s.good) {
      for (const e of enemies)
        if (!e.dead && hitsEnemy(s, e)) {
          e.hp -= s.damage;
          s.life = 0;
          e.flash = 0.1;
          spawnFx("hit_spark", "burst", s.x + 4, s.y + 4);
          burst(s.x, s.y, s.fire ? "#f09e47" : "#eddb9c", 5);
          if (e.hp <= 0) {
            e.dead = true;
            defeat(e, s.vx);
            score += e.type === 3 ? 1000 : 100;
            burst(e.x, e.y, "#d6c5a3", 22);
            tone(700);
            if (e.type === 3) {
              state = "won";
              show(
                "¡El paso es nuestro!",
                "Abriste el camino junto a tu llama. Quipu: " +
                  score +
                  " puntos. Esta es la primera etapa de CHANKAS.",
                "Jugar otra vez →",
              );
            }
          }
          break;
        }
    } else if (overlap(s, player)) {
      s.life = 0;
      hit();
    }
  }
  shots = shots.filter((s) => s.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 700 * dt;
    p.t -= dt;
  }
  particles = particles.filter((p) => p.t > 0);
  updateLlama(dt);
  heroAnim(direction);
  updateFx(dt);
  cam = Math.max(0, Math.min(END - W, player.x - 280));
}
const ENEMY_ATTACK = ["lunge", "fire", "thrust", "shoot"];
function enemyAnim(e, dir, prevX) {
  const busy = e.animT < animDur(ENEMY_KIND[e.type], e.anim, 0.4);
  if (e.type === 2) {
    // patrulla: mira hacia donde camina salvo mientras ataca
    if (!(e.anim === "thrust" && busy) && e.x !== prevX) e.face = e.x > prevX ? 1 : -1;
  } else e.face = dir;
  if (e.anim === ENEMY_ATTACK[e.type] && busy) return;
  if (e.type === 0) setAnim(e, "run");
  else if (e.type === 1) setAnim(e, e.cool > 0.6 ? "reload" : "aim");
  else if (e.type === 2) setAnim(e, "walk");
  else if (Math.abs(e.x + e.w / 2 - (player.x + player.w / 2)) < 90) {
    if (e.anim !== "slash" || !busy) restartAnim(e, "slash");
  }
  else setAnim(e, "walk");
}
// Enemigo derrotado: sale volando girando (sin sangre); el capitán se arrodilla.
function defeat(e, vx) {
  const side = vx >= 0 ? 1 : -1;
  e.animT = 0;
  e.anim = e.type === 3 ? "defeated" : "hit";
  e.flash = 0.12;
  e.fvx = side * (380 + Math.random() * 100);
  e.fvy = -520 - Math.random() * 80;
  e.spin = side * (9 + Math.random() * 4);
  spawnFx("dust", "puff", e.x + e.w / 2, e.y + e.h - 6);
}
function heroAnim(direction) {
  let a;
  if (player.hp <= 0) a = "dead";
  else if (player.inv > 1.2) a = "hurt";
  else if (player.throwT > 0) a = "throw";
  else if (!player.ground) a = player.vy < 0 ? "jump" : "fall";
  else a = direction ? "run" : "idle";
  setAnim(player, a);
}
function updateLlama(dt) {
  const v = dt > 0 ? (world.llama - llamaS.prev) / dt : 0;
  llamaS.prev = world.llama;
  llamaS.animT += dt;
  llamaS.spitT += dt;
  if (llamaS.anim === "spit" && llamaS.spitT < animDur("llama", "spit", 0.5)) return;
  if (Math.abs(v) > 5) llamaS.face = v > 0 ? 1 : -1;
  setAnim(llamaS, Math.abs(v) > 150 ? "run" : Math.abs(v) > 12 ? "walk" : "idle");
}
function rect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function mountain(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * 0.46, y - h);
  ctx.lineTo(x + w, y);
  ctx.fill();
}
function person(x, y, type, frame = 0) {
  const hero = type === -1,
    boss = type === 3,
    scale = boss ? 1.5 : 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  rect(5, 7, 22, 14, hero ? "#bd855d" : "#afaaa0");
  rect(3, 0, 26, 9, hero ? "#da694d" : "#6f8589");
  rect(8, -4, 14, 5, hero ? "#e5ba64" : "#8b9b99");
  rect(4, 22, 25, 24, hero ? "#b94437" : "#53676c");
  rect(5, 31, 23, 6, hero ? "#e8b953" : "#9eadaa");
  rect(1, 24, 7, 22, hero ? "#c99166" : "#758486");
  rect(27, 25, 7, 19, hero ? "#c99166" : "#758486");
  rect(7, 46, 8, 12 + frame, "#312d2c");
  rect(21, 46, 8, 12 - frame, "#312d2c");
  if (hero) {
    rect(-3, 23, 10, 22, "#d2a769");
    rect(0, 25, 4, 15, "#8a5f4a");
    rect(32, 30, 17, 3, "#dfd0a8");
  } else rect(30, 30, type === 0 ? 8 : 24, 4, "#b4b3a2");
  ctx.restore();
}
function sprite(kind, anim, t, x, y, w, h, facing) {
  SPR.facing = facing;
  SPR.w = w;
  SPR.h = h;
  return SP.draw(ctx, kind, anim, t, x, y, SPR);
}
function resetSpr() {
  SPR.fill = 1;
  SPR.flash = false;
  SPR.alpha = 1;
  SPR.rotation = 0;
  SPR.active = false;
}
function drawLegacyBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#274c5a");
  grad.addColorStop(1, "#a4b6a2");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  rect(730 - cam * 0.05, 70, 48, 48, "#f0d38a");
  for (let i = -1; i < 12; i++)
    mountain(i * 290 - ((cam * 0.15) % 290), 330, 390, 210 + (i % 3) * 40, "#456a71");
  for (let i = -1; i < 13; i++)
    mountain(i * 240 - ((cam * 0.3) % 240), 400, 320, 170 + (i % 2) * 60, "#65817a");
  for (let i = -1; i < 15; i++) {
    let x = i * 160 - ((cam * 0.55) % 160);
    rect(x, 350, 150, 15, "#839078");
    rect(x + 18, 365, 132, 16, "#697d65");
    rect(x + 35, 381, 115, 20, "#506d5d");
  }
}
function drawLegacyGround() {
  rect(0, GROUND, END, 100, "#716748");
  rect(0, GROUND, END, 8, "#c2b17d");
  for (let i = 0; i < END; i += 48) {
    rect(i, GROUND + 12, 44, 17, "#918368");
    rect(i + 20, GROUND + 35, 44, 17, "#807359");
  }
  for (const p of platforms) {
    rect(p.x, p.y, p.w, 12, "#c0ac77");
    rect(p.x + 8, p.y + 12, p.w - 16, GROUND - p.y - 12, "#7b8065");
    for (let j = 0; j < p.w; j += 40) rect(p.x + j + 5, p.y + 20, 32, 18, "#94957a");
  }
}
function drawPiles() {
  for (const x of piles) {
    const near = player && Math.abs(player.x - x) < 85;
    if (SP) {
      resetSpr();
      SPR.active = near;
      sprite("stone_pile", near ? "active" : "idle", renderT, x - 15, GROUND - 70, 40, 70, 1);
    } else {
      for (let i = 0; i < 5; i++) rect(x - 15 + i * 8, GROUND - 9 - (i % 2) * 7, 12, 9, "#c5c6ae");
      rect(x, GROUND - 67, 3, 45, "#b39f72");
      rect(x + 3, GROUND - 67, 34, 19, "#dcb55d");
    }
    if (near) {
      ctx.fillStyle = "#fff0bc";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("E · RECARGAR", x - 40, GROUND - 83);
    }
  }
}
function drawLlama() {
  const lx = world.llama;
  if (SP) {
    resetSpr();
    sprite("llama", llamaS.anim, llamaS.animT, lx - 2, GROUND - 70, 40, 70, llamaS.face);
    return;
  }
  rect(lx - 10, GROUND - 39, 42, 20, "#e6d6ad");
  rect(lx + 23, GROUND - 62, 11, 37, "#e6d6ad");
  rect(lx + 23, GROUND - 67, 22, 12, "#e6d6ad");
  rect(lx + 25, GROUND - 77, 4, 12, "#e6d6ad");
  rect(lx - 5, GROUND - 20, 6, 20, "#cab98f");
  rect(lx + 23, GROUND - 20, 6, 20, "#cab98f");
  rect(lx, GROUND - 40, 22, 16, "#a04d39");
}
// dead=true: solo los derrotados que salen volando (se dibujan antes del suelo para que
// se pierdan detrás del terreno al caer); dead=false: vivos y el capitán derrotado.
function drawEnemies(flying) {
  for (const e of enemies) {
    if (e.gone || (e.dead && !SP)) continue;
    if (flying !== (e.dead && e.type !== 3)) continue;
    if (SP) {
      resetSpr();
      SPR.flash = e.flash > 0;
      SPR.rotation = e.rot;
      sprite(ENEMY_KIND[e.type], e.anim || "idle", e.animT, e.x, e.y, e.w, e.h, e.face);
    } else person(e.x, e.y + e.h - (e.type === 3 ? 96 : 48), e.type);
    if (e.type === 3 && !e.dead) {
      rect(e.x - 10, e.y - 20, 110, 7, "#342f2a");
      rect(e.x - 10, e.y - 20, (110 * e.hp) / e.max, 7, "#db7052");
    }
  }
}
function drawPlayer() {
  const blink = player.inv > 0 && Math.floor(player.inv * 10) % 2 !== 0;
  if (SP) {
    resetSpr();
    SPR.fill = player.ammo / 24;
    SPR.flash = player.flash > 0;
    SPR.alpha = blink ? 0.45 : 1;
    sprite("hero", player.anim, player.animT, player.x, player.y, player.w, player.h, player.face);
  } else if (!blink)
    person(player.x, player.y, -1, player.ground ? Math.sin(world.time * 15) * 3 : 0);
}
function drawShots() {
  for (const s of shots) {
    if (SP) {
      resetSpr();
      const kind = s.spit ? "spit" : s.good ? (s.fire ? "fire_stone" : "stone") : "bullet";
      sprite(kind, "fly", world.time, s.x, s.y, 8, 8, s.vx < 0 ? -1 : 1);
    } else
      rect(
        s.x,
        s.y,
        s.fire ? 13 : 7,
        s.fire ? 10 : 6,
        s.good ? (s.fire ? "#ff9e49" : s.spit ? "#b3deac" : "#eee0b3") : "#ef7356",
      );
  }
}
function drawFx() {
  if (!SP) return;
  for (const f of fx) {
    resetSpr();
    const sz = SP.size(f.kind);
    const y = sz.anchor === "center" ? f.y - sz.h / 2 : f.y - sz.h;
    sprite(f.kind, f.anim, f.t, f.x - sz.w / 2, y, sz.w, sz.h, f.face);
  }
}
function draw() {
  const camR = Math.round(cam);
  if (BG) BG.drawBackground(ctx, camR, renderT, BG_OPTS);
  else drawLegacyBackground();
  ctx.save();
  ctx.translate(-camR, 0);
  if (player && SP) drawEnemies(true);
  if (BG) {
    BG.drawGround(ctx, 0, GROUND, END, H - GROUND, camR);
    for (const p of platforms) BG.drawPlatform(ctx, p.x, p.y, p.w, GROUND - p.y, camR);
  } else drawLegacyGround();
  drawPiles();
  if (player) {
    drawLlama();
    drawEnemies(false);
    drawPlayer();
    drawShots();
    drawFx();
    for (const p of particles) rect(p.x, p.y, 4, 4, p.color);
  }
  ctx.restore();
  if (BG && BG.drawForeground) BG.drawForeground(ctx, camR, renderT, BG_OPTS);
  rect(18, 18, 430, 58, "#102b30e8");
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#f3d394";
  ctx.fillText("CHANKAS", 34, 42);
  if (player) {
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#f6e9cc";
    ctx.fillText(
      "VIDA " +
        "♥".repeat(Math.max(0, player.hp)) +
        "   PIEDRAS " +
        player.ammo +
        "/24   FUEGO " +
        player.fire,
      34,
      63,
    );
    ctx.textAlign = "right";
    ctx.fillText("QUIPU " + score, W - 28, 38);
    ctx.fillText(Math.round((player.x / END) * 100) + "% DEL CAMINO", W - 28, 60);
    ctx.textAlign = "left";
    if (player.ammo === 0) {
      ctx.fillStyle = "#f8d48c";
      ctx.fillText("Manta vacía: vuelve a una bandera y pulsa E", 260, 105);
    }
    if (player.x > 3400) {
      ctx.fillStyle = "#f8d48c";
      ctx.fillText("CAPITÁN DE LA EXPEDICIÓN", 580, 100);
    }
  }
}
function loop(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  renderT += dt;
  if (state === "playing") update(dt);
  else if (state === "won" || state === "lost") updateFx(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

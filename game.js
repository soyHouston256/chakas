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
  BG = window.ChankasBackground || null,
  MAP = window.ChankasMap || null;
const ENEMY_KIND = ["perro", "arcabucero", "piquero", "capitan"];
const SPR = { facing: 1, fill: 1, flash: false, alpha: 1, rotation: 0, active: false, w: 0, h: 0 };
const BG_OPTS = { width: 960, height: 540, levelLength: 4200 };
const DOG_W = 44,
  DOG_H = 26;
const W = 960,
  H = 540,
  GROUND = 440,
  END = 4200;
const MAX_HP = 6,
  MAX_AMMO = 24,
  MAX_BOLA = 3,
  HUD_HEARTS = 6; // corazones dibujados como máximo; si hay más se muestra «♥×N»
// Disparo enemigo: solo con el tirador visible (margen interior) y a distancia de cámara.
const FIRE_MARGIN = 12,
  FIRE_RANGE = 620;
// Jefe: preparación visible antes de cada disparo y patrones alternos (nunca alto+bajo a la vez).
const BOSS_WIND = 0.55,
  BOSS_WIND_P2 = 0.42,
  BOSS_PATTERN = ["low", "high", "low", "high", "low", "low"];
// Respawn en la apacheta: munición mínima garantizada e invulnerabilidad breve.
const RESPAWN_AMMO = 12,
  RESPAWN_FIRE = 2,
  RESPAWN_BOLA = 1,
  RESPAWN_INV = 2.2;
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
    hp: MAX_HP,
    ammo: MAX_AMMO,
    fire: 5,
    bola: MAX_BOLA,
    kb: 0,
    melee: 0,
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
  world = { time: 0, llama: 20, spit: 0, checkpoint: 70, cpPile: -1, deaths: 0 };
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
  restartBtn.hidden = true;
}
// Revivir en la última apacheta activada: los enemigos derrotados siguen derrotados,
// los vivos vuelven a su puesto (el jefe conserva el daño recibido) y la munición
// sube a un mínimo razonable.
function respawn() {
  world.deaths++;
  Object.assign(player, {
    x: world.checkpoint,
    y: GROUND - player.h,
    vy: 0,
    kb: 0,
    hp: MAX_HP,
    ammo: Math.max(player.ammo, RESPAWN_AMMO),
    fire: Math.max(player.fire, RESPAWN_FIRE),
    bola: Math.max(player.bola, RESPAWN_BOLA),
    cool: 0.3,
    inv: RESPAWN_INV,
    ground: true,
    throwT: 0,
    flash: 0,
    melee: 0,
    face: 1,
  });
  restartAnim(player, "idle");
  for (const e of enemies) {
    if (e.dead) continue;
    e.x = e.home;
    e.y = GROUND - e.h;
    e.cool = 1.2;
    e.stun = 0;
    e.wind = 0;
    e.lunge = 0;
    e.flash = 0;
    restartAnim(e, "");
  }
  shots = [];
  particles = [];
  world.llama = player.x - 80;
  world.spit = 1;
  llamaS.prev = world.llama;
  cam = Math.max(0, Math.min(END - W, player.x - 280));
  state = "playing";
  overlay.style.display = "none";
  restartBtn.hidden = true;
  spawnFx("dust", "puff", player.x + player.w / 2, player.y + player.h - 6);
}
function animFields() {
  return {
    anim: "",
    animT: 0,
    face: -1,
    flash: 0,
    fvx: 0,
    fvy: 0,
    rot: 0,
    spin: 0,
    gone: false,
    stun: 0,
    wind: 0,
    lunge: 0,
    lvx: 0,
    shotN: 0,
    pat: "",
    wdir: -1,
  };
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
const restartBtn = document.querySelector("#restart");
function show(title, message, label, restart = false) {
  document.querySelector("#title").textContent = title;
  document.querySelector("#message").textContent = message;
  document.querySelector("#start").textContent = label;
  restartBtn.hidden = !restart;
  overlay.style.display = "flex";
}
document.querySelector("#start").onclick = (e) => {
  e?.currentTarget?.blur?.();
  if (state === "paused") {
    state = "playing";
    overlay.style.display = "none";
  } else if (state === "lost") respawn();
  else if ((state === "menu" || state === "won") && openMap(state === "won")) return;
  else reset();
};
restartBtn.onclick = (e) => {
  e?.currentTarget?.blur?.();
  reset();
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
  if (state === "map") {
    if (!e.repeat || e.code.startsWith("Arrow")) mapKey(e.code);
    return;
  }
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
    if (state === "map") return mapKey(b.dataset.key);
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
// Daño al héroe. srcX = centro horizontal de lo que golpea (empuje en sentido contrario).
// Fuera de "playing" no hace nada: si el jefe cae en el mismo frame, gana la victoria.
// La derrota se resuelve al final de update() (ver resolveDeath).
function hit(srcX, push = 260) {
  if (state !== "playing" || player.inv > 0 || player.hp <= 0) return;
  player.hp--;
  player.inv = 1.5;
  player.flash = 0.12;
  player.throwT = 0;
  player.melee = 0;
  const pc = player.x + player.w / 2;
  const away = srcX == null ? -player.face : pc >= srcX ? 1 : -1;
  player.kb = away * push;
  if (player.ground) {
    player.vy = -240;
    player.ground = false;
  }
  restartAnim(player, player.hp <= 0 ? "dead" : "hurt");
  burst(player.x, player.y, "#e9b25f");
  tone(130);
}
function resolveDeath() {
  if (state !== "playing" || player.hp > 0) return;
  state = "lost";
  show(
    "El camino aún te necesita",
    "Vuelves a la última apacheta con piedras de reserva. Los caídos no se levantan.",
    "Continuar desde la apacheta →",
    true,
  );
}
function win() {
  state = "won";
  const withMap = mapReady();
  if (withMap) saveProgress(Math.max(mapS.progress, 1));
  show(
    "¡El paso es nuestro!",
    "Abriste el camino junto a tu llama. Quipu: " +
      score +
      (withMap
        ? " puntos. Sacsayhuamán queda atrás: el Qhapaq Ñan sigue hacia Ollantaytambo."
        : " puntos. Esta es la primera etapa de CHANKAS."),
    withMap ? "Ver el mapa →" : "Jugar otra vez →",
    withMap,
  );
}
// Macana: golpe corto de respaldo cuando la manta está vacía (el jefe siempre es vencible).
const MELEE = { reach: 50, damage: 1, cool: 0.42 };
function melee() {
  if (player.cool > 0) return;
  player.cool = MELEE.cool;
  player.melee = 0.16;
  restartAnim(player, "throw");
  player.throwT = animDur("hero", "throw", 0.3);
  const box = meleeBox();
  let hitAny = false;
  for (const e of enemies)
    if (!e.dead && hitsEnemy(box, e)) {
      hitAny = true;
      damageEnemy(e, MELEE.damage, player.face * 300, box.x + box.w / 2, box.y + 20);
      if (state !== "playing") break;
    }
  tone(hitAny ? 180 : 420);
}
function meleeBox() {
  const cx = player.x + player.w / 2;
  return {
    x: player.face > 0 ? cx : cx - MELEE.reach,
    y: player.y + 6,
    w: MELEE.reach,
    h: player.h - 10,
  };
}
// Boleadora: tiro en arco, pocas unidades, aturde (no mata de un golpe).
function throwBola() {
  if (player.cool > 0 || player.bola <= 0) return;
  player.bola--;
  player.cool = 0.5;
  restartAnim(player, "throw");
  player.throwT = animDur("hero", "throw", 0.3);
  shots.push({
    x: player.x + 14,
    y: player.y + 18,
    vx: player.face * 430,
    vy: -180,
    w: 16,
    h: 16,
    life: 1.6,
    good: true,
    damage: 1,
    bola: true,
  });
  tone(380);
}
function damageEnemy(e, dmg, vx, fxX, fxY) {
  e.hp -= dmg;
  e.flash = 0.1;
  spawnFx("hit_spark", "burst", fxX, fxY);
  if (e.hp <= 0) {
    e.dead = true;
    e.wind = 0;
    defeat(e, vx);
    score += e.type === 3 ? 1000 : 100;
    burst(e.x, e.y, "#d6c5a3", 22);
    tone(700);
    if (e.type === 3) win();
  }
}
function shoot(fire) {
  if (!fire && player.ammo <= 0) return melee();
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
// Enemigo visible en la ventana de cámara (con margen interior) y a distancia de tiro.
function canFire(e) {
  const visible = e.x + e.w > cam + FIRE_MARGIN && e.x < cam + W - FIRE_MARGIN;
  return visible && Math.abs(e.x + e.w / 2 - (player.x + player.w / 2)) < FIRE_RANGE;
}
function nearPile() {
  return piles.findIndex((x) => Math.abs(player.x - x) < 85);
}
function update(dt) {
  world.time += dt;
  player.cool -= dt;
  player.inv -= dt;
  player.animT += dt;
  player.throwT -= dt;
  player.flash -= dt;
  player.melee -= dt;
  const wasGround = player.ground;
  let direction =
    (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
    (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  if (player.hp <= 0) direction = 0;
  player.x = Math.max(0, Math.min(END - 40, player.x + (direction * 230 + player.kb) * dt));
  player.kb *= Math.max(0, 1 - 7 * dt);
  if (Math.abs(player.kb) < 5) player.kb = 0;
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
  if (keys.has("KeyL")) throwBola();
  const pi = nearPile();
  if (pi >= 0 && pi > world.cpPile) {
    // Apacheta nueva: se convierte en el punto de reaparición (bandera izada).
    world.cpPile = pi;
    world.checkpoint = piles[pi];
    tone(620);
    spawnFx("dust", "puff", piles[pi] + 5, GROUND - 6);
  }
  if (keys.has("KeyE") && pi >= 0) {
    player.ammo = MAX_AMMO;
    player.bola = Math.max(player.bola, MAX_BOLA);
  }
  world.llama += (player.x - 80 - world.llama) * dt * 3;
  world.spit -= dt;
  for (const e of enemies) {
    if (e.dead) continue;
    // Los estados temporales corren aunque el enemigo esté fuera de la ventana de activación.
    e.stun -= dt;
    if (Math.abs(e.x - player.x) > 850) {
      e.wind = 0; // un ataque pendiente no se dispara al volver
      e.lunge = 0;
      continue;
    }
    const dir = player.x > e.x ? 1 : -1;
    const prevX = e.x;
    e.cool -= dt;
    e.animT += dt;
    e.flash -= dt;
    const touching = overlap(player, e);
    if (e.stun > 0) {
      // Aturdido por la boleadora: ni se mueve ni ataca (sí hace daño al tocarlo).
      e.wind = 0;
      e.lunge = 0;
      setAnim(e, e.type === 3 ? "hurt" : "stunned");
    } else if (e.type === 0) updateDog(e, dir, dt, touching);
    else {
      if (e.type === 2) e.x = e.home + Math.sin(world.time * 1.8) * 85;
      else if (e.type === 3 && !touching && e.wind <= 0) e.x += dir * 45 * dt;
      enemyAnim(e, dir, prevX);
      if (e.type === 3) updateBoss(e, dir, dt);
      else if (e.cool <= 0 && canFire(e)) {
        e.cool = e.type === 1 ? 1.8 : 2.5;
        e.face = dir;
        restartAnim(e, ENEMY_ATTACK[e.type]);
        if (e.type === 1)
          spawnFx("muzzle_flash", "burst", dir > 0 ? e.x + e.w + 6 : e.x - 6, e.y + 20, dir);
        shots.push({ x: e.x, y: e.y + 22, vx: dir * 240, vy: 0, life: 3, good: false });
      }
    }
    if (touching) hit(e.x + e.w / 2, e.type === 3 ? 340 : 260);
    if (Math.abs(e.x - world.llama) < 240 && world.spit <= 0) {
      // La llama escupe hacia el enemigo, no hacia donde mira el héroe.
      const sdir = e.x + e.w / 2 >= world.llama + 12 ? 1 : -1;
      shots.push({
        x: world.llama + 12,
        y: GROUND - 48,
        vx: sdir * 400,
        vy: 0,
        life: 0.65,
        good: true,
        damage: 1,
        spit: true,
      });
      world.spit = 2.8;
      restartAnim(llamaS, "spit");
      llamaS.spitT = 0;
      llamaS.face = sdir;
    }
  }
  for (const s of shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.fire) s.vy += 200 * dt;
    if (s.bola) {
      s.vy += 700 * dt;
      if (s.y > GROUND - 6) s.life = 0;
    }
    s.life -= dt;
    if (s.life <= 0) continue;
    if (s.good) {
      for (const e of enemies)
        if (!e.dead && hitsEnemy(s, e)) {
          s.life = 0;
          burst(s.x, s.y, s.fire ? "#f09e47" : "#eddb9c", 5);
          if (s.bola) {
            e.stun = e.type === 3 ? 0.7 : 2;
            e.wind = 0;
            e.lunge = 0;
            restartAnim(e, e.type === 3 ? "hurt" : "stunned");
          }
          damageEnemy(e, s.damage, s.vx, s.x + 4, s.y + 4);
          break;
        }
    } else if (overlap(s, player)) {
      s.life = 0;
      hit(s.x - s.vx, 160);
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
  resolveDeath();
}
// Perro alano: corre hacia el héroe y muerde con una embestida corta (sin balas).
const DOG = { speed: 70, range: 150, lunge: 0.36, lungeV: 400, cool: 1.3 };
function updateDog(e, dir, dt, touching) {
  if (e.lunge > 0) {
    e.lunge -= dt;
    e.x += e.lvx * dt;
    return;
  }
  e.face = dir;
  const dx = Math.abs(e.x + e.w / 2 - (player.x + player.w / 2));
  if (e.cool <= 0 && dx < DOG.range && canFire(e)) {
    e.lunge = DOG.lunge;
    e.lvx = dir * DOG.lungeV;
    e.cool = DOG.cool + DOG.lunge;
    restartAnim(e, "lunge");
    spawnFx("dust", "puff", e.x + e.w / 2, e.y + e.h - 4);
    tone(240);
    return;
  }
  // Tras morder se queda un instante quieto (ventana para contraatacar).
  if (!touching && e.cool < DOG.cool - 0.45) e.x += dir * DOG.speed * dt;
  if (e.anim !== "lunge" || e.animT > animDur("perro", "lunge", 0.375)) setAnim(e, "run");
}
// Capitán: anuncia cada disparo (pose 'shoot' + destello + marca de altura) y alterna
// disparos altos (quedarse en el suelo) y bajos (saltar). Fase 2 con <50 % de vida.
function updateBoss(e, dir, dt) {
  const p2 = e.hp <= e.max / 2;
  if (e.wind > 0) {
    e.wind -= dt;
    e.face = e.wdir;
    if (e.wind > 0) return;
    if (!canFire(e)) {
      // Salió de cámara durante la preparación: se cancela (nunca dispara sin verse).
      e.cool = 0.4;
      setAnim(e, "walk");
      return;
    }
    const y = e.pat === "high" ? e.y + 22 : e.y + 55;
    spawnFx("muzzle_flash", "burst", e.wdir > 0 ? e.x + e.w + 6 : e.x - 6, y + 4, e.wdir);
    shots.push({
      x: e.wdir > 0 ? e.x + e.w - 8 : e.x,
      y,
      vx: e.wdir * (p2 ? 330 : 300),
      vy: 0,
      life: 3,
      good: false,
    });
    e.cool = p2 ? 0.95 : 1.35;
    tone(160);
    return;
  }
  if (e.cool <= 0 && canFire(e)) {
    e.pat = BOSS_PATTERN[e.shotN++ % BOSS_PATTERN.length];
    e.wind = p2 ? BOSS_WIND_P2 : BOSS_WIND;
    e.wdir = dir;
    e.face = dir;
    restartAnim(e, "shoot");
  }
}
const ENEMY_ATTACK = ["lunge", "fire", "thrust", "shoot"];
function enemyAnim(e, dir, prevX) {
  if (e.type === 3 && e.wind > 0) return; // preparando disparo: mantiene la pose
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
  } else setAnim(e, "walk");
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
  piles.forEach((x, i) => {
    const near = player && Math.abs(player.x - x) < 85;
    // Bandera izada solo en la apacheta activada (punto de reaparición).
    const active = !!world && world.cpPile === i;
    if (SP) {
      resetSpr();
      SPR.active = active;
      sprite("stone_pile", active ? "active" : "idle", renderT, x - 15, GROUND - 70, 40, 70, 1);
    } else {
      for (let i = 0; i < 5; i++) rect(x - 15 + i * 8, GROUND - 9 - (i % 2) * 7, 12, 9, "#c5c6ae");
      rect(x, GROUND - (active ? 67 : 30), 3, active ? 45 : 8, "#b39f72");
      if (active) rect(x + 3, GROUND - 67, 34, 19, "#dcb55d");
    }
    if (near) {
      ctx.fillStyle = "#fff0bc";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("E · RECARGAR", x - 40, GROUND - 83);
    }
  });
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
    if (e.type === 3 && !e.dead && e.wind > 0) drawTelegraph(e);
    if (e.type === 3 && !e.dead) {
      rect(e.x - 10, e.y - 20, 110, 7, "#342f2a");
      rect(e.x - 10, e.y - 20, (110 * e.hp) / e.max, 7, "#db7052");
    }
  }
}
// Aviso del jefe: el cuerpo parpadea y una marca indica la altura del disparo
// (alto = quédate en el suelo, bajo = salta).
function drawTelegraph(e) {
  const on = Math.floor(e.wind * 14) % 2 === 0;
  const y = e.pat === "high" ? e.y + 22 : e.y + 55;
  const x = e.wdir > 0 ? e.x + e.w + 4 : e.x - 22;
  if (SP && on) {
    resetSpr();
    SPR.flash = true;
    SPR.alpha = 0.55;
    sprite("capitan", e.anim || "shoot", e.animT, e.x, e.y, e.w, e.h, e.face);
  }
  rect(x, y - 2, 18, 12, on ? "#ffdf6b" : "#d9472f");
  ctx.fillStyle = "#1b1410";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("!", x + 7, y + 8);
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
  if (player.melee > 0) {
    // Golpe de macana: arco corto delante del héroe.
    const cx = player.x + player.w / 2 + player.face * 12,
      cy = player.y + 26,
      k = 1 - player.melee / 0.16;
    ctx.strokeStyle = "#fff0bc";
    ctx.lineWidth = 4;
    ctx.beginPath();
    const a0 = player.face > 0 ? -1.3 + k * 0.9 : Math.PI + 1.3 - k * 0.9;
    ctx.arc(
      cx,
      cy,
      MELEE.reach - 8,
      Math.min(a0, a0 + player.face * 1.4),
      Math.max(a0, a0 + player.face * 1.4),
    );
    ctx.stroke();
    rect(player.face > 0 ? cx + 14 : cx - 30, cy - 4, 16, 6, "#6b4a32");
  }
}
function drawShots() {
  for (const s of shots) {
    if (SP) {
      resetSpr();
      const kind = s.bola
        ? "boleadora"
        : s.spit
          ? "spit"
          : s.good
            ? s.fire
              ? "fire_stone"
              : "stone"
            : "bullet";
      sprite(kind, s.bola ? "spin" : "fly", world.time, s.x, s.y, 8, 8, s.vx < 0 ? -1 : 1);
    } else
      rect(
        s.x,
        s.y,
        s.fire || s.bola ? 13 : 7,
        s.fire || s.bola ? 10 : 6,
        s.good
          ? s.bola
            ? "#c9a46a"
            : s.fire
              ? "#ff9e49"
              : s.spit
                ? "#b3deac"
                : "#eee0b3"
          : "#ef7356",
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
  rect(18, 18, HUD_W, 58, "#102b30e8");
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#f3d394";
  ctx.fillText("CHANKAS", 34, 42);
  if (player) {
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#f6e9cc";
    ctx.fillText(hudLine(), 34, 63);
    ctx.textAlign = "right";
    ctx.fillText("QUIPU " + score, W - 28, 38);
    ctx.fillText(Math.round((player.x / END) * 100) + "% DEL CAMINO", W - 28, 60);
    ctx.textAlign = "left";
    if (player.ammo === 0) {
      ctx.fillStyle = "#f8d48c";
      ctx.fillText("Manta vacía: J golpea con la macana · recarga en una apacheta (E)", 230, 128);
    }
    if (player.x > 3400) {
      ctx.fillStyle = "#f8d48c";
      ctx.fillText("CAPITÁN DE LA EXPEDICIÓN", 580, 100);
    }
  }
}
const HUD_W = 470;
// Corazones con tope: nunca desbordan el panel (con más vida se muestra «♥×N»).
function hudHearts(hp) {
  hp = Math.max(0, Math.floor(hp));
  return hp > HUD_HEARTS ? "♥×" + hp : "♥".repeat(hp);
}
function hudLine() {
  return (
    "VIDA " +
    hudHearts(player.hp) +
    "   PIEDRAS " +
    player.ammo +
    "/" +
    MAX_AMMO +
    "   FUEGO " +
    player.fire +
    "   BOLAS " +
    player.bola
  );
}
// ---------------------------------------------------------------------------
// Mapa de misiones (art/map.js). Solo la etapa 1 es jugable; las demás se pueden
// seleccionar para leer su ficha. El progreso (etapas completadas) se guarda en
// localStorage; si el módulo del mapa falta o no puede prepararse, se va directo al nivel.
const PROGRESS_KEY = "chankas.progress.v1",
  MAP_WALK = 2.2; // segundos que tarda el héroe entre dos etapas
const mapS = { progress: 0, selected: 0, heroT: 0, walk: null, msg: 0 };
let mapOk = null;
function mapReady() {
  if (mapOk === null) {
    try {
      mapOk = !!(MAP && MAP.stages && MAP.stages.length && MAP.prepare());
    } catch {
      mapOk = false;
    }
  }
  return mapOk;
}
function stageCount() {
  return MAP && MAP.stages ? MAP.stages.length : 1;
}
function clampProgress(v) {
  v = Math.floor(Number(v));
  return Number.isFinite(v) ? Math.max(0, Math.min(stageCount(), v)) : 0;
}
function loadProgress() {
  let v = 0;
  try {
    const raw = window.localStorage?.getItem(PROGRESS_KEY);
    if (raw != null) v = JSON.parse(raw)?.progress;
  } catch {}
  return (mapS.progress = clampProgress(v));
}
function saveProgress(v) {
  mapS.progress = clampProgress(v);
  try {
    window.localStorage?.setItem(PROGRESS_KEY, JSON.stringify({ progress: mapS.progress }));
  } catch {}
}
// Abre el mapa. afterWin: la etapa 1 queda completada y el héroe camina a la siguiente.
function openMap(afterWin = false) {
  if (!mapReady()) return false;
  if (afterWin) {
    saveProgress(Math.max(loadProgress(), 1));
    const last = stageCount() - 1;
    const to = Math.min(mapS.progress, last);
    mapS.walk = to > 0 ? { from: to - 1, to, t: 0 } : null;
    mapS.heroT = mapS.walk ? mapS.walk.from : to;
    mapS.selected = to;
  } else {
    loadProgress();
    mapS.walk = null;
    mapS.heroT = mapS.selected = Math.min(mapS.progress, stageCount() - 1);
  }
  mapS.msg = 0;
  state = "map";
  keys.clear();
  overlay.style.display = "none";
  restartBtn.hidden = true;
  return true;
}
function stagePlayable(i) {
  const s = MAP && MAP.stages && MAP.stages[i];
  if (!s || !s.playable) return false;
  return (MAP.statusOf ? MAP.statusOf(i, mapS.progress) : "current") !== "locked";
}
function playStage(i) {
  if (state !== "map") return false;
  if (!stagePlayable(i)) {
    mapS.msg = 1.6; // aviso «Próximamente» en pantalla
    tone(160);
    return false;
  }
  mapS.walk = null;
  if (canvas.style) canvas.style.cursor = "default";
  reset();
  return true;
}
function mapKey(code) {
  if (state !== "map") return;
  const n = stageCount();
  if (code === "ArrowLeft" || code === "KeyA") mapS.selected = Math.max(0, mapS.selected - 1);
  else if (code === "ArrowRight" || code === "KeyD")
    mapS.selected = Math.min(n - 1, mapS.selected + 1);
  else if (code === "Enter" || code === "NumpadEnter" || code === "KeyJ" || code === "Space")
    playStage(mapS.selected);
  else return;
  tone(code.startsWith("Arrow") || code === "KeyA" || code === "KeyD" ? 520 : 420);
}
function updateMap(dt) {
  if (mapS.msg > 0) mapS.msg = Math.max(0, mapS.msg - dt);
  const w = mapS.walk;
  if (!w) return;
  w.t += dt / MAP_WALK;
  if (w.t >= 1) {
    mapS.heroT = w.to;
    mapS.walk = null;
  } else mapS.heroT = w.from + (w.to - w.from) * w.t;
}
function drawMap() {
  MAP.draw(ctx, renderT, {
    width: W,
    height: H,
    progress: mapS.progress,
    selected: mapS.selected,
    heroT: mapS.heroT,
  });
  if (mapS.msg > 0) {
    ctx.globalAlpha = Math.min(1, mapS.msg * 2);
    rect(150, 236, 420, 56, "#1b1210ee");
    ctx.textAlign = "center";
    ctx.font = "bold 18px Georgia, serif";
    ctx.fillStyle = "#f2c14e";
    ctx.fillText("Próximamente", 360, 260);
    ctx.font = "13px Georgia, serif";
    ctx.fillStyle = "#f6e9cc";
    ctx.fillText("La próxima etapa está en construcción.", 360, 280);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}
// Ratón / toque en el mapa: un toque selecciona; tocar la etapa ya elegida la juega.
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
  if (!r || !r.width) return [e.offsetX ?? 0, e.offsetY ?? 0];
  return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
}
function mapPointer(x, y) {
  if (state !== "map" || !MAP.stageAt) return -1;
  const i = MAP.stageAt(x, y);
  if (i < 0) return -1;
  if (i === mapS.selected) playStage(i);
  else {
    mapS.selected = i;
    tone(520);
  }
  return i;
}
canvas.onpointerdown = (e) => {
  if (state !== "map") return;
  e.preventDefault?.();
  mapPointer(...canvasPoint(e));
};
canvas.onpointermove = (e) => {
  if (state !== "map" || !MAP.stageAt || !canvas.style) return;
  canvas.style.cursor = MAP.stageAt(...canvasPoint(e)) >= 0 ? "pointer" : "default";
};
function loop(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  renderT += dt;
  if (state === "map") {
    updateMap(dt);
    drawMap();
  } else {
    if (state === "playing") update(dt);
    else if (state === "won" || state === "lost") updateFx(dt);
    draw();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

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
// Interfaz HTML (ui.js): HUD, título, pausa y panel del mapa. Sin ella, el HUD se dibuja en el canvas.
const UI = window.ChankasUI && window.ChankasUI.ready ? window.ChankasUI : null;
const ENEMY_KIND = ["perro", "arcabucero", "piquero", "capitan"];
const SPR = { facing: 1, fill: 1, flash: false, alpha: 1, rotation: 0, active: false, outline: null, w: 0, h: 0 };
// El borde oscuro del propio sprite integra al guerrero con el escenario.
const HERO_RIM = null;
// Configuración de contenido: las siguientes etapas podrán aportar su propio recorrido.
const STAGE_CONFIG = {
  id: "sacsayhuaman", length: 5670, bossX: 5350,
  piles: [180, 850, 1600, 2450, 3200, 4000, 4700, 5100],
  enemies: [620, 980, 1360, 1750, 2150, 2600, 2940, 3300, 3660, 4020, 4440, 4760],
  platforms: [
    { x: 580, y: 350, w: 180 }, { x: 1250, y: 340, w: 200 },
    { x: 2100, y: 345, w: 180 }, { x: 2820, y: 330, w: 220 },
    { x: 3500, y: 350, w: 220 }, { x: 3660, y: 270, w: 220 },
    { x: 4310, y: 345, w: 190 }, { x: 4750, y: 340, w: 180 },
  ],
  optional: { x: 3750, y: 238, w: 28, h: 28 },
};
const DIFFICULTIES = {
  chasqui: { name: "Chasqui", speed: 0.8, attacks: 0.8, projectiles: 0.85, fire: 7, refill: 10 },
  inka: { name: "Inka", speed: 1, attacks: 1, projectiles: 1, fire: 5, refill: 8 },
  pachacutec: { name: "Pachacútec", speed: 1.2, attacks: 1.25, projectiles: 1.15, fire: 3, refill: 6 },
};
const COMPETITION = window.ChankasCompetition || null;
let difficultyId = "inka", difficulty = DIFFICULTIES.inka;
const BG_OPTS = { width: 960, height: 540, levelLength: STAGE_CONFIG.length };
const DOG_W = 44,
  DOG_H = 26;
const W = 960,
  H = 540,
  GROUND = 440,
  END = STAGE_CONFIG.length;
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
// Alforjas de la llama: E junto a ella (lejos de una apacheta) da piedras y gasta una carga.
// Las cargas se reponen al activar una apacheta nueva.
const LLAMA_LOADS = 5,
  LLAMA_REFILL = 8,
  LLAMA_RANGE = 120;
// Escupitajo de la llama (H o botón táctil): reserva propia, independiente de las alforjas.
// Recupera una carga cada SPIT.recharge segundos de juego (en pausa no avanza) y apunta al
// enemigo visible más cercano dentro de SPIT.range. Sin objetivo no gasta la carga.
const SPIT = {
  max: 3,
  recharge: 6,
  damage: 1,
  stun: 0.5,
  bossStun: 0.5, // sujeto a balance: bajar a 0,3 si el jefe resulta demasiado fácil
  bossFirstStun: 0.8, // primer impacto: se limpia la cara y mira a la llama
  range: 240,
  gap: 0.4, // pausa mínima entre escupitajos (deja terminar la animación)
  lead: 0.2, // de la orden al «¡ptuá!»: prepara la cabeza e infla los cachetes
  speed: 460,
  gravity: 260,
  splat: 1.1, // segundos que la mancha sigue en la cara (sin sprites)
  huff: 0.8, // indignación visible tras el aturdimiento
};
// Obstáculos sólidos que el escupitajo no atraviesa ({x, y, w, h}). En Sacsayhuamán no hay
// muros: las terrazas solo se pisan por arriba y todos los proyectiles pasan por delante.
const SOLIDS = [];
// La última apacheta está en la entrada de la arena del capitán: punto de reaparición
// y recarga justo antes del jefe (ARENA_PILE).
const piles = STAGE_CONFIG.piles;
const ARENA_PILE = piles.length - 1,
  ARENA_RELOADS = 1, // recargas en la apacheta de la arena por vida, con el jefe vivo
  BOSS_RESPAWN_HP = 0.6; // al reaparecer en la arena, el jefe recupera hasta el 60 % si tenía menos
const platforms = STAGE_CONFIG.platforms;
// Contexto de audio solo con el sonido activado (todos los efectos pasan por aquí).
function audioCtx() {
  if (!sound) return null;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    return audio;
  } catch {
    return null;
  }
}
function tone(freq = 350) {
  const a = audioCtx();
  if (!a) return;
  try {
    const o = a.createOscillator(),
      g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.04, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    o.start();
    o.stop(a.currentTime + 0.12);
  } catch {}
}
// Efectos sintetizados de la llama (Web Audio, sin archivos): «¡ptuá!», «¡plaf!», recarga y
// la queja del capitán. Respetan el botón de sonido como tone().
let noiseBuf = null;
function noiseSrc(a) {
  if (!noiseBuf) {
    const n = Math.floor(a.sampleRate * 0.5);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}
function env(g, t, peak, attack, end) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + end);
}
function sfx(name) {
  const a = audioCtx();
  if (!a) return;
  try {
    const t = a.currentTime,
      out = a.destination;
    if (name === "spit") {
      // «Pt»: chasquido agudo que cae rápido…
      const o = a.createOscillator(),
        g = a.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(1100, t);
      o.frequency.exponentialRampToValueAtTime(320, t + 0.07);
      env(g, t, 0.05, 0.004, 0.09);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.1);
      // …y «uá» húmedo: ruido filtrado que burbujea (modulado a ~30 Hz).
      const n = noiseSrc(a),
        f = a.createBiquadFilter(),
        g2 = a.createGain(),
        wob = a.createGain(),
        lfo = a.createOscillator(),
        depth = a.createGain();
      f.type = "bandpass";
      f.Q.value = 2.5;
      f.frequency.setValueAtTime(2000, t + 0.03);
      f.frequency.exponentialRampToValueAtTime(650, t + 0.3);
      env(g2, t + 0.03, 0.09, 0.015, 0.3);
      lfo.type = "square";
      lfo.frequency.value = 31;
      depth.gain.value = 0.45;
      wob.gain.value = 0.55;
      lfo.connect(depth).connect(wob.gain);
      n.connect(f).connect(g2).connect(wob).connect(out);
      n.start(t + 0.03);
      n.stop(t + 0.33);
      lfo.start(t);
      lfo.stop(t + 0.33);
    } else if (name === "splat") {
      // «¡Plaf!»: más grave y húmedo que el golpe seco de una piedra.
      const n = noiseSrc(a),
        f = a.createBiquadFilter(),
        g = a.createGain(),
        o = a.createOscillator(),
        g2 = a.createGain();
      f.type = "lowpass";
      f.frequency.setValueAtTime(1200, t);
      f.frequency.exponentialRampToValueAtTime(180, t + 0.2);
      env(g, t, 0.12, 0.006, 0.21);
      n.connect(f).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.22);
      o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      env(g2, t, 0.07, 0.005, 0.19);
      o.connect(g2).connect(out);
      o.start(t);
      o.stop(t + 0.2);
    } else if (name === "recharge") {
      // Discreto: se oye cada 6 s en combate.
      const o = a.createOscillator(),
        g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(660, t);
      o.frequency.exponentialRampToValueAtTime(990, t + 0.08);
      env(g, t, 0.018, 0.01, 0.11);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.12);
    } else if (name === "grumble") {
      // Queja caricaturesca del capitán («¡Mal-di-ta lla-ma!»): voz de sierra con un formante.
      const o = a.createOscillator(),
        f = a.createBiquadFilter(),
        g = a.createGain();
      o.type = "sawtooth";
      f.type = "bandpass";
      f.frequency.value = 850;
      f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t);
      [200, 235, 185, 260, 165].forEach((hz, i) => {
        const s = t + i * 0.12;
        o.frequency.setValueAtTime(hz, s);
        o.frequency.linearRampToValueAtTime(hz * (i === 3 ? 1.25 : 0.9), s + 0.1);
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.06, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.11);
      });
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.62);
    }
  } catch {}
}
function reset() {
  const selected = COMPETITION ? COMPETITION.getDifficulty() : difficultyId;
  difficultyId = Object.hasOwn(DIFFICULTIES, selected) ? selected : "inka";
  difficulty = DIFFICULTIES[difficultyId];
  if (COMPETITION) COMPETITION.begin(difficultyId);
  player = {
    x: 70,
    y: GROUND - 58,
    w: 28,
    h: 58,
    vy: 0,
    hp: MAX_HP,
    ammo: MAX_AMMO,
    fire: difficulty.fire,
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
    weapon: "J", // última arma usada (resaltada en el HUD): J huaraca, K fuego, L boleadora
  };
  shots = [];
  particles = [];
  score = 0;
  cam = 0;
  world = {
    time: 0,
    llama: 20,
    checkpoint: 70,
    cpPile: -1,
    deaths: 0,
    loads: LLAMA_LOADS,
    eHeld: false,
    arenaReloads: ARENA_RELOADS,
    kills: 0,
    shots: 0,
    hits: 0,
    llamaHits: 0,
    optionalCompleted: false,
    // Escupitajo: cargas, progreso de la siguiente (s), pausa entre escupitajos, orden en
    // curso, si el jugador lo usó en esta vida y si ya hubo rescate automático en la partida.
    spitCharges: SPIT.max,
    spitRecharge: 0,
    spitCool: 0,
    spitHeld: false,
    spitPending: null,
    spitUsed: false,
    spitRescueUsed: false,
    tip: null, // aviso contextual { text, t }
    speech: [], // globos de diálogo { e, text, t }
  };
  fx = [];
  llamaS = { anim: "idle", animT: 0, face: 1, prev: world.llama, spitT: 9, react: "", reactT: 0, still: 0 };
  enemies = [];
  STAGE_CONFIG.enemies.forEach((x, i) => {
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
    x: STAGE_CONFIG.bossX,
    y: GROUND - 96,
    w: 72,
    h: 96,
    hp: 32,
    max: 32,
    type: 3,
    cool: 1.5,
    home: STAGE_CONFIG.bossX,
    dead: false,
    ...animFields(),
  });
  state = "playing";
  overlay.style.display = "none";
  restartBtn.hidden = true;
}
// Revivir en la última apacheta activada: los enemigos derrotados siguen derrotados,
// los vivos vuelven a su puesto (el jefe conserva el daño recibido, salvo en la apacheta
// de la arena: allí recupera hasta el 60 %) y la munición sube a un mínimo razonable.
function respawn() {
  world.deaths++;
  world.arenaReloads = ARENA_RELOADS;
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
    e.aggro = false;
    e.alert = 0;
    e.hitDone = false;
    e.spat = 0;
    e.huff = 0;
    // En la apacheta de la arena, el capitán recupera el aliento: hasta el 60 % de su vida
    // (si tenía más, la conserva). En las demás apachetas conserva el daño recibido.
    if (e.type === 3 && world.cpPile === ARENA_PILE)
      e.hp = Math.max(e.hp, Math.ceil(e.max * BOSS_RESPAWN_HP));
    restartAnim(e, "");
  }
  shots = [];
  particles = [];
  world.llama = player.x - 80;
  // La llama reaparece con todos sus escupitajos. El rescate automático no se repite.
  Object.assign(world, {
    spitCharges: SPIT.max,
    spitRecharge: 0,
    spitCool: 0,
    spitPending: null,
    spitUsed: false,
    tip: null,
    speech: [],
  });
  llamaS.prev = world.llama;
  llamaS.react = "";
  llamaS.reactT = 0;
  restartAnim(llamaS, "idle");
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
    pdir: -1, // piquero: sentido de la patrulla
    hitDone: false, // piquero: la estocada en curso ya hirió
    aggro: false, // perro: ya vio al héroe
    alert: 0, // perro: segundos de alerta restantes antes de correr
    spat: 0, // escupitajo en la cara (s restantes de la mancha)
    huff: 0, // indignación tras el escupitajo
    spatOnce: false, // capitán: ya hizo su reacción especial
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
document.querySelector("#sound").onclick = (e) => {
  toggleSound();
  e?.currentTarget?.blur?.(); // el foco no se queda en el botón (Espacio = saltar)
};
function toggleSound() {
  sound = !sound;
  if (!UI) document.querySelector("#sound").textContent = "Sonido: " + (sound ? "sí" : "no");
  tone();
}
function pause() {
  if (state === "playing") {
    state = "paused";
    holdKeys();
    if (!UI) show("Un respiro en el camino", "Tu expedición te espera.", "Continuar →");
  } else if (state === "paused") {
    state = "playing";
    overlay.style.display = "none";
  }
}
// Teclas usadas en el mapa y en los menús: se ignoran (incluidas sus repeticiones) hasta
// soltarlas, para que la tecla que confirma no dispare ni salte al empezar el nivel.
const swallowed = new Set();
const ACTIVATE = ["Enter", "NumpadEnter", "Space"];
function onControl(e) {
  const el = e.target;
  return !!(el && el.closest && el.closest("button, input, select, textarea, a"));
}
addEventListener("keydown", (e) => {
  if (e.target && e.target.closest && e.target.closest("input, select, textarea")) return;
  if (state === "map") {
    // Con el foco en un botón (p. ej. «Sonido»), Enter/Espacio son del botón.
    if (onControl(e) && ACTIVATE.includes(e.code)) {
      if (!e.repeat) swallowed.add(e.code);
      else e.preventDefault(); // sin autorrepetición sobre el botón
      return;
    }
    if (!e.repeat || e.code.startsWith("Arrow")) {
      if (mapKey(e.code)) {
        e.preventDefault();
        swallowed.add(e.code);
        if (UI) UI.sync(); // el foco sigue a la etapa ya, no en el próximo frame
      }
    } else if (swallowed.has(e.code)) e.preventDefault();
    return;
  }
  // Enter/Espacio sobre un botón enfocado activan solo ese botón (también jugando).
  if (onControl(e) && ACTIVATE.includes(e.code)) {
    if (!e.repeat) swallowed.add(e.code);
    else e.preventDefault();
    return;
  }
  if (state !== "playing") {
    if (state === "paused" && (e.code === "KeyP" || e.code === "Escape")) {
      e.preventDefault();
      if (!e.repeat) pause();
      return;
    }
    // Flechas: mover el foco por el menú; Enter: activar la opción principal.
    if (UI && UI.menuKey && UI.menuKey(e.code, e.repeat)) {
      e.preventDefault();
      swallowed.add(e.code);
      return;
    }
    // Fuera del juego ninguna tecla llega a `keys`: queda retenida hasta soltarla, así una
    // tecla mantenida en un menú no dispara ni salta al empezar o reanudar.
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
    swallowed.add(e.code);
    return;
  }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
    e.preventDefault();
  if (swallowed.has(e.code)) return;
  if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat) {
    pause();
    if (state === "paused") return; // la tecla de pausa no queda «pulsada» en el juego
  }
  keys.add(e.code);
});
// Al salir de «playing», las teclas pulsadas pasan a retenidas (no se reactivan al volver).
function holdKeys() {
  for (const k of keys) swallowed.add(k);
  keys.clear();
}
addEventListener("keyup", (e) => {
  swallowed.delete(e.code);
  keys.delete(e.code);
});
addEventListener("blur", () => {
  keys.clear();
  swallowed.clear();
  if (state === "playing") pause();
});
// Controles en pantalla: barra de botones (escritorio) y mandos táctiles superpuestos (cruceta,
// botón de disparo y fila de armas). Todos alimentan el mismo `keys` que el teclado.
function selectWeapon(w) {
  if (state !== "playing" || !player || !["J", "K", "L"].includes(w)) return false;
  if (player.weapon !== w) tone(520);
  player.weapon = w;
  return true;
}
// Mantener pulsado: la tecla se elige al tocar (pick) y se suelta al levantar el dedo.
function holdControl(b, pick) {
  let held = null;
  const release = () => {
    if (held) keys.delete(held);
    held = null;
  };
  b.onpointerdown = (e) => {
    e.preventDefault();
    if (state === "map") return void (b.dataset.key && mapKey(b.dataset.key));
    if (state !== "playing") return; // en menús, los toques no se acumulan como teclas
    const k = pick();
    if (!k) return;
    b.setPointerCapture?.(e.pointerId);
    release();
    held = k;
    keys.add(k);
  };
  b.onpointerup = b.onpointercancel = b.onlostpointercapture = release;
}
// Cruceta: cada dedo (pointerId) aporta sus teclas; deslizar el pulgar cambia de dirección.
function bindPad(el) {
  const held = new Map();
  // Cada dedo aporta sus teclas; solo se sueltan las que ya no aporta ningún dedo.
  const set = (id, ks) => {
    const before = new Set([...held.values()].flat());
    if (ks.length) held.set(id, ks);
    else held.delete(id);
    const now = new Set([...held.values()].flat());
    for (const k of before) if (!now.has(k)) keys.delete(k);
    for (const k of now) keys.add(k);
    const dir = [...now].join(" ");
    if (el.dataset && el.dataset.dir !== dir) el.dataset.dir = dir;
  };
  const at = (e) => {
    const r = el.getBoundingClientRect();
    return padKeys(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2);
  };
  el.onpointerdown = (e) => {
    e.preventDefault();
    const ks = at(e);
    if (state === "map") return void (ks[0] && mapKey(ks[0]));
    if (state !== "playing") return;
    el.setPointerCapture?.(e.pointerId);
    set(e.pointerId, ks);
  };
  el.onpointermove = (e) => {
    if (held.has(e.pointerId) || (e.buttons && state === "playing" && el.hasPointerCapture?.(e.pointerId)))
      set(e.pointerId, state === "playing" ? at(e) : []);
  };
  el.onpointerup = el.onpointercancel = el.onlostpointercapture = (e) => set(e.pointerId, []);
}
document.querySelectorAll("[data-key]").forEach((b) =>
  holdControl(b, () => {
    // En el modo táctil, Huaraca/Fuego/Bola eligen el arma del botón de disparo.
    if (b.dataset.weapon && controlLayout(viewport()) === "touch") return void selectWeapon(b.dataset.weapon);
    return b.dataset.key;
  }),
);
// Activación sin puntero (lector de pantalla, teclado: click con detail 0): elige el arma.
document.querySelectorAll("[data-weapon][data-key]").forEach((b) => {
  b.onclick = (e) => {
    if (e && e.detail === 0) selectWeapon(b.dataset.weapon);
  };
});
document.querySelectorAll("[data-fire]").forEach((b) => holdControl(b, () => fireKey(player)));
document.querySelectorAll("[data-pad]").forEach(bindPad);
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
  if (state !== "playing" || player.inv > 0 || player.hp <= 0) return false;
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
  // La llama gira la cabeza hacia el guerrero, sorprendida.
  llamaReact("surprise", 0.6, pc >= world.llama + 18 ? 1 : -1);
  return true;
}
function resolveDeath() {
  if (state !== "playing" || player.hp > 0) return;
  state = "lost";
  holdKeys();
  show(
    "El camino aún te necesita",
    "Vuelves a la última apacheta con piedras de reserva. Los caídos no se levantan.",
    "Continuar desde la apacheta →",
    true,
  );
}
function win() {
  if (state !== "playing") return;
  state = "won";
  holdKeys();
  if (world && player) {
    world.tip = null;
    llamaReact("celebrate", 999, player.x + player.w / 2 >= world.llama + 18 ? 1 : -1);
  }
  if (COMPETITION) COMPETITION.finish({
    completed: true, kills: world.kills, shots: world.shots, hits: world.hits,
    llamaHits: world.llamaHits, deaths: world.deaths,
    optionalCompleted: world.optionalCompleted, durationMs: Math.round(world.time * 1000),
  });
  score += Math.max(0, 500 - world.deaths * 100) + Math.max(0, 300 - Math.floor(world.time));
  const withMap = mapReady();
  if (withMap) saveProgress(Math.max(mapS.progress, 1));
  show(
    "¡El paso es nuestro!",
    "Modalidad " + difficulty.name + ". Abriste el camino junto a tu llama. Quipu: " +
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
  player.weapon = "J";
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
  world.shots++;
  player.cool = 0.5;
  player.weapon = "L";
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
function damageEnemy(e, dmg, vx, fxX, fxY, spark = "hit_spark") {
  e.hp -= dmg;
  e.flash = 0.1;
  spawnFx(spark, "burst", fxX, fxY);
  if (e.hp <= 0) {
    e.dead = true;
    e.wind = 0;
    defeat(e, vx);
    score += e.type === 3 ? 1000 : 100;
    burst(e.x, e.y, "#d6c5a3", 22);
    tone(700);
    if (e.type === 3) win();
    // De vez en cuando (una de cada dos victorias) la llama levanta la cabeza, orgullosa.
    else if (world.kills++ % 2 === 0) llamaReact("proud", 0.9);
  }
}
function shoot(fire) {
  if (!fire && player.ammo <= 0) return melee();
  if (player.cool > 0 || player.ammo <= 0 || (fire && player.fire <= 0)) return;
  player.ammo--;
  world.shots++;
  if (fire) player.fire--;
  player.weapon = fire ? "K" : "J";
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
  return onScreen(e) && Math.abs(e.x + e.w / 2 - (player.x + player.w / 2)) < FIRE_RANGE;
}
function onScreen(e) {
  return e.x + e.w > cam + FIRE_MARGIN && e.x < cam + W - FIRE_MARGIN;
}
function arenaLive() {
  return enemies.some((e) => e.type === 3 && !e.dead);
}
function nearPile() {
  return piles.findIndex((x) => Math.abs(player.x - x) < 85);
}
function nearLlama() {
  return Math.abs(player.x + player.w / 2 - (world.llama + 18)) < LLAMA_RANGE;
}
// Recarga desde las alforjas: +LLAMA_REFILL piedras (con tope) y una carga menos.
function llamaReload() {
  if (!nearLlama() || world.loads <= 0 || player.ammo >= MAX_AMMO) return false;
  player.ammo = Math.min(MAX_AMMO, player.ammo + difficulty.refill);
  world.loads--;
  tone(600);
  spawnFx("dust", "puff", world.llama + 18, GROUND - 40);
  return true;
}
// ---------------------------------------------------------------------------
// Escupitajo de la llama. Pulsar H (o el botón táctil) ordena un escupitajo; mantenerla no
// repite. La carga se gasta al dar la orden (con objetivo válido) y el proyectil sale
// SPIT.lead s después, cuando la llama termina de inflar los cachetes.
function rechargeLlamaSpit(dt) {
  if (world.spitCharges >= SPIT.max) {
    world.spitRecharge = 0;
    return;
  }
  world.spitRecharge += dt;
  if (world.spitRecharge >= SPIT.recharge) {
    world.spitCharges++;
    world.spitRecharge = world.spitCharges < SPIT.max ? world.spitRecharge - SPIT.recharge : 0;
    sfx("recharge");
  }
}
function canLlamaSpit() {
  return (
    state === "playing" &&
    player.hp > 0 &&
    world.spitCharges > 0 &&
    world.spitCool <= 0 &&
    !world.spitPending
  );
}
const LLAMA_MID = 18; // centro de la llama respecto a world.llama
// Boca de la llama mirando en el sentido dir (la cabeza va delante y arriba).
function llamaMouth(dir) {
  return { x: world.llama + LLAMA_MID + dir * 30, y: GROUND - 84 };
}
// ¿Hay un obstáculo sólido entre x0 y x1 a la altura del escupitajo?
function spitBlocked(x0, x1) {
  const a = Math.min(x0, x1),
    b = Math.max(x0, x1);
  return SOLIDS.some((s) => s.x < b && s.x + s.w > a && s.y < GROUND - 30 && s.y + s.h > GROUND - 90);
}
// Altura de la cara de cada enemigo (adonde apunta el escupitajo).
function faceY(e) {
  return e.type === 3 ? e.y + 22 : e.type === 0 ? e.y + 6 : e.y + 10;
}
function faceX(e) {
  const f = e.face >= 0 ? 1 : -1;
  return e.x + e.w / 2 + f * (e.type === 3 ? 10 : e.type === 0 ? e.w / 2 - 6 : 4);
}
// Enemigo vivo y visible más cercano a la llama (distancia al borde), sin obstáculos.
function findLlamaTarget() {
  const lx = world.llama + LLAMA_MID;
  let best = null,
    bestD = Infinity;
  for (const e of enemies) {
    if (e.dead || !onScreen(e)) continue;
    const d = Math.max(0, e.x - lx, lx - (e.x + e.w));
    if (d > SPIT.range || d >= bestD) continue;
    const dir = e.x + e.w / 2 >= lx ? 1 : -1;
    if (spitBlocked(llamaMouth(dir).x, e.x + e.w / 2)) continue;
    best = e;
    bestD = d;
  }
  return best;
}
// Da la orden de escupir. auto = rescate automático (no cuenta como uso del jugador).
function activateLlamaSpit(auto = false) {
  if (!canLlamaSpit()) return false;
  const target = findLlamaTarget();
  if (!target) return false; // sin objetivo no se gasta la carga
  const dir = target.x + target.w / 2 >= world.llama + LLAMA_MID ? 1 : -1;
  world.spitCharges--;
  world.spitCool = SPIT.gap;
  world.spitPending = { t: SPIT.lead, target, dir };
  if (!auto) world.spitUsed = true;
  llamaS.face = dir; // gira hacia el objetivo…
  llamaS.react = "";
  llamaS.reactT = 0;
  restartAnim(llamaS, "spit"); // …levanta la cabeza e infla los cachetes
  llamaS.spitT = 0;
  return true;
}
// Sale el escupitajo: arco corto desde la boca hasta la cara del objetivo.
function releaseLlamaSpit(p) {
  const m = llamaMouth(p.dir),
    e = p.target,
    alive = e && !e.dead;
  const tx = alive ? e.x + e.w / 2 : m.x + p.dir * SPIT.range,
    ty = alive ? faceY(e) : m.y + 30;
  const t = Math.max(0.12, Math.abs(tx - m.x) / SPIT.speed);
  shots.push({
    x: m.x - 6,
    y: m.y - 5,
    w: 12,
    h: 10,
    vx: p.dir * SPIT.speed,
    vy: (ty - m.y - 0.5 * SPIT.gravity * t * t) / t,
    life: t + 0.3,
    good: true,
    damage: SPIT.damage,
    spit: true,
  });
  sfx("spit");
  for (let i = 0; i < 4; i++)
    particles.push({
      x: m.x,
      y: m.y,
      vx: p.dir * (60 + Math.random() * 90),
      vy: -40 - Math.random() * 80,
      t: 0.3,
      color: i % 2 ? "#c3eaa8" : "#79b46b",
    });
}
function updateLlamaSpit(dt) {
  world.spitCool -= dt;
  rechargeLlamaSpit(dt);
  const pressed = keys.has("KeyH") && !world.spitHeld;
  world.spitHeld = keys.has("KeyH");
  if (pressed && !activateLlamaSpit() && world.spitCharges > 0 && !world.spitPending)
    llamaReact("look", 0.6); // sin nadie a quien escupir: mira alrededor (no gasta carga)
  tryAutomaticLlamaRescue();
  const p = world.spitPending;
  if (p && (p.t -= dt) <= 0) {
    world.spitPending = null;
    releaseLlamaSpit(p);
  }
}
// Salpicadura verde (partículas + efecto de arte) y «¡plaf!».
function splash(x, y, n = 10) {
  for (let i = 0; i < n; i++)
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 220,
      vy: -Math.random() * 200,
      t: 0.45,
      color: i % 3 ? "#c3eaa8" : "#79b46b",
    });
  sfx("splat");
}
// Impacto en un enemigo: 1 de daño, aturdimiento corto (sin acumularse), retroceso,
// mancha en la cara y reacción cómica. El capitán reacciona a lo grande la primera vez.
function applySpitImpact(e, s) {
  world.llamaHits++;
  const dir = s.vx >= 0 ? 1 : -1;
  e.face = -dir; // mira hacia la llama
  const x = faceX(e),
    y = faceY(e);
  splash(x, y);
  const boss = e.type === 3,
    first = boss && !e.spatOnce;
  damageEnemy(e, SPIT.damage, s.vx, x, y, "splat");
  if (e.dead || state !== "playing") return;
  e.stun = Math.max(e.stun, boss ? (first ? SPIT.bossFirstStun : SPIT.bossStun) : SPIT.stun);
  e.wind = 0;
  e.lunge = 0;
  e.spat = SPIT.splat;
  e.huff = e.stun + SPIT.huff;
  e.x += dir * (boss ? 6 : 10); // retrocede un poco
  restartAnim(e, "spat");
  if (first) {
    e.spatOnce = true;
    say(e, "¡Maldita llama!", 1.8);
    sfx("grumble");
    llamaReact("proud", 1.4); // la llama levanta la cabeza, orgullosa
  } else if (e.type === 1 || e.type === 2) say(e, "¡Puaj!", 0.8);
}
function say(e, text, t) {
  world.speech = world.speech.filter((b) => b.e !== e);
  world.speech.push({ e, text, t });
}
// Rescate automático: si el jugador llega al capitán sin haber escupido en esta vida, la
// llama escupe una vez sola y enseña la habilidad. Solo una vez por partida.
const COARSE =
  typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
function rescueTip() {
  return COARSE && COARSE.matches
    ? "¡Tu llama también sabe defenderse! Toca el botón LLAMA para ayudarla"
    : "¡Tu llama también sabe defenderse! Pulsa H para ayudarla";
}
function tryAutomaticLlamaRescue() {
  if (world.spitRescueUsed || world.spitUsed || !canLlamaSpit()) return false;
  if (player.x < piles[ARENA_PILE]) return false; // aún no llegó al enfrentamiento final
  const boss = enemies.find((e) => e.type === 3 && !e.dead);
  if (!boss || findLlamaTarget() !== boss || !activateLlamaSpit(true)) return false;
  world.spitRescueUsed = true;
  world.tip = { text: rescueTip(), t: 4.5 };
  return true;
}
// Gestos de la llama (sorpresa, orgullo, celebración…): secundarios, nunca cortan un escupitajo.
function llamaReact(anim, dur, face) {
  if (!world || !llamaS) return;
  const spitting = llamaS.anim === "spit" && llamaS.spitT < animDur("llama", "spit", 0.5);
  llamaS.react = anim;
  llamaS.reactT = dur;
  if (spitting) return;
  if (face) llamaS.face = face;
  restartAnim(llamaS, anim);
}
function update(dt) {
  world.time += dt;
  if (!world.optionalCompleted && overlap(player, STAGE_CONFIG.optional)) {
    world.optionalCompleted = true;
    score += 300;
    player.fire += 1;
    world.tip = { text: "¡Terraza descubierta! +300 quipu y una piedra de fuego", t: 4 };
    tone(850);
  }
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
    world.loads = LLAMA_LOADS; // la llama repone sus alforjas en la apacheta
    tone(620);
    spawnFx("dust", "puff", piles[pi] + 5, GROUND - 6);
  }
  const ePressed = keys.has("KeyE") && !world.eHeld;
  world.eHeld = keys.has("KeyE");
  if (pi === ARENA_PILE && arenaLive()) {
    // En la arena, con el capitán vivo, la apacheta recarga una sola vez por vida y con
    // una pulsación (no se puede mantener E para piedras y boleadoras infinitas).
    if (ePressed && world.arenaReloads > 0) {
      world.arenaReloads--;
      player.ammo = MAX_AMMO;
      player.bola = Math.max(player.bola, MAX_BOLA);
      tone(600);
    }
  } else if (keys.has("KeyE") && pi >= 0) {
    player.ammo = MAX_AMMO;
    player.bola = Math.max(player.bola, MAX_BOLA);
  } else if (ePressed) llamaReload();
  world.llama += (player.x - 80 - world.llama) * dt * 3;
  if (player.hp > 0) updateLlamaSpit(dt);
  if (world.tip && (world.tip.t -= dt) <= 0) world.tip = null;
  for (const b of world.speech) b.t -= dt;
  world.speech = world.speech.filter((b) => b.t > 0 && !b.e.dead);
  for (const e of enemies) {
    if (e.dead) continue;
    // Los estados temporales corren aunque el enemigo esté fuera de la ventana de activación.
    e.stun -= dt;
    e.spat -= dt;
    e.huff -= dt;
    if (Math.abs(e.x - player.x) > 850) {
      e.wind = 0; // un ataque pendiente no se dispara al volver
      e.lunge = 0;
      continue;
    }
    const dir = player.x > e.x ? 1 : -1;
    e.cool -= dt * difficulty.attacks;
    e.animT += dt;
    e.flash -= dt;
    const touching = overlap(player, e);
    if (e.stun > 0) {
      // Aturdido (boleadora o escupitajo): ni se mueve ni ataca (sí hace daño al tocarlo).
      e.wind = 0;
      e.lunge = 0;
      if (e.anim !== "spat") setAnim(e, e.type === 3 ? "hurt" : "stunned");
    } else if (e.type === 0) updateDog(e, dir, dt, touching);
    else if (e.type === 2) updatePiquero(e, dir, dt, touching);
    else {
      if (e.type === 3 && !touching && e.wind <= 0) e.x += dir * 45 * difficulty.speed * dt;
      enemyAnim(e, dir);
      if (e.type === 3) updateBoss(e, dir, dt);
      else if (e.cool <= 0 && canFire(e)) {
        // Arcabucero: el único soldado que dispara balas.
        e.cool = 1.8;
        e.face = dir;
        restartAnim(e, ENEMY_ATTACK[e.type]);
        spawnFx("muzzle_flash", "burst", dir > 0 ? e.x + e.w + 6 : e.x - 6, e.y + 20, dir);
        shots.push({ x: e.x, y: e.y + 22, vx: dir * 240 * difficulty.projectiles, vy: 0, life: 3, good: false });
      }
    }
    if (touching && hit(e.x + e.w / 2, e.type === 3 ? 340 : 260) && e.type === 0) {
      // El perro que muerde se aparta un rato (no encadena mordiscos).
      e.cool = DOG.sated;
      e.lunge = 0;
      e.wind = 0;
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
    if (s.spit) {
      s.vy += SPIT.gravity * dt;
      // Contra el suelo o un obstáculo sólido: se aplasta ahí (no lo atraviesa).
      if (s.y + s.h > GROUND || SOLIDS.some((o) => overlap(s, o))) {
        s.life = 0;
        splash(s.x + s.w / 2, Math.min(s.y + s.h / 2, GROUND - 4), 6);
        continue;
      }
    }
    s.life -= dt;
    if (s.life <= 0) continue;
    if (s.good) {
      for (const e of enemies)
        if (!e.dead && hitsEnemy(s, e)) {
          s.life = 0;
          if (s.spit) {
            applySpitImpact(e, s);
            break;
          }
          world.hits++;
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
// Solo se activa al verse en pantalla (tras un instante de «alerta»), se agacha antes de
// embestir (wind) y, si muerde, se aparta un rato: quien sigue caminando pierde como mucho
// un corazón con él.
const DOG = {
  speed: 70,
  range: 150,
  notice: 0.7, // alerta al entrar en pantalla antes de correr
  wind: 0.28, // agachado antes de embestir
  lunge: 0.36,
  lungeV: 400,
  cool: 1.3,
  sated: 2.6, // tras morder: pausa larga antes de volver a embestir
};
function updateDog(e, dir, dt, touching) {
  if (e.lunge > 0) {
    e.lunge -= dt;
    e.x += e.lvx * dt;
    return;
  }
  if (e.wind > 0) {
    // Preparación visible: agachado (primer fotograma de 'lunge'), sin moverse.
    e.wind -= dt;
    e.face = e.wdir;
    e.animT = 0;
    if (e.wind > 0) return;
    e.lunge = DOG.lunge;
    e.lvx = e.wdir * DOG.lungeV * difficulty.speed;
    e.cool = DOG.cool + DOG.lunge;
    e.animT = 1 / 8; // salta al fotograma del salto
    spawnFx("dust", "puff", e.x + e.w / 2, e.y + e.h - 4);
    tone(240);
    return;
  }
  if (!e.aggro) {
    // Quieto (sentado) hasta verse en pantalla; luego un instante de alerta.
    setAnim(e, "idle");
    if (!canFire(e)) return;
    e.aggro = true;
    e.alert = DOG.notice;
    e.face = dir;
    return;
  }
  if (e.alert > 0) {
    // Alerta: mira al héroe sin moverse ni atacar.
    e.alert -= dt;
    e.face = dir;
    setAnim(e, "idle");
    return;
  }
  if (e.cool > DOG.cool + DOG.lunge) {
    // Recién ha mordido: se aparta trotando antes de volver a la carga.
    e.face = -dir;
    e.x -= dir * 60 * dt;
    setAnim(e, "run");
    return;
  }
  e.face = dir;
  const dx = Math.abs(e.x + e.w / 2 - (player.x + player.w / 2));
  if (e.cool <= 0 && dx < DOG.range && canFire(e) && player.hp > 0) {
    e.wind = DOG.wind;
    e.wdir = dir;
    restartAnim(e, "lunge");
    return;
  }
  // Tras morder se queda un instante quieto (ventana para contraatacar).
  if (!touching && e.cool < DOG.cool - 0.45) e.x += dir * DOG.speed * difficulty.speed * dt;
  if (e.anim !== "lunge" || e.animT > animDur("perro", "lunge", 0.375)) setAnim(e, "run");
}
// Piquero: cuerpo a cuerpo con la pica (sin balas). Patrulla; al ver al héroe se acerca,
// anuncia la estocada echando la pica atrás (PIQ.wind) y la lanza con un alcance largo
// por delante. Se puede saltar por encima o interrumpir con la boleadora.
const PIQ = {
  aggro: 320, // distancia (centros) a la que deja de patrullar
  speed: 62,
  patrol: 85, // semiancho de la patrulla alrededor de su puesto
  leash: 240, // no persigue más allá de su puesto ± leash
  reach: 64, // alcance de la pica por delante del cuerpo
  wind: 0.35, // retroceso visible antes de la estocada
  thrust: 0.3, // duración de la estocada
  active: [0.05, 0.24], // ventana con daño dentro de la estocada
  cool: 1.4,
};
// Caja de daño de la pica: franja a la altura de la cintura del héroe, delante del cuerpo.
function thrustBox(e) {
  const d = e.wdir >= 0 ? 1 : -1;
  return { x: d > 0 ? e.x + e.w : e.x - PIQ.reach, y: e.y + e.h - 42, w: PIQ.reach, h: 20 };
}
function updatePiquero(e, dir, dt, touching) {
  if (e.lunge > 0) {
    // Estocada en curso: solo hiere una vez y dentro de su ventana activa.
    e.lunge -= dt;
    e.face = e.wdir;
    const t = PIQ.thrust - e.lunge;
    if (!e.hitDone && t >= PIQ.active[0] && t <= PIQ.active[1] && overlap(player, thrustBox(e))) {
      e.hitDone = true;
      hit(e.x + e.w / 2, 300);
    }
    if (e.lunge <= 0) e.cool = PIQ.cool;
    return;
  }
  if (e.wind > 0) {
    e.wind -= dt;
    e.face = e.wdir;
    e.animT = 0; // pica atrás (primer fotograma de 'thrust')
    if (e.wind > 0) return;
    e.lunge = PIQ.thrust;
    e.hitDone = false;
    e.animT = 0.1; // fotogramas de empuje
    tone(200);
    return;
  }
  const pc = player.x + player.w / 2,
    ec = e.x + e.w / 2;
  const gap = dir > 0 ? player.x - (e.x + e.w) : e.x - (player.x + player.w);
  if (player.hp > 0 && canFire(e) && Math.abs(pc - ec) < PIQ.aggro) {
    e.face = dir;
    if (e.cool <= 0 && gap < PIQ.reach - 14) {
      e.wind = PIQ.wind;
      e.wdir = dir;
      restartAnim(e, "thrust");
      return;
    }
    const nx = e.x + dir * PIQ.speed * difficulty.speed * dt;
    if (!touching && gap > PIQ.reach - 26 && Math.abs(nx - e.home) < PIQ.leash) {
      e.x = nx;
      setAnim(e, "walk");
    } else if (e.anim !== "thrust" || e.animT > animDur("piquero", "thrust", 0.4)) setAnim(e, "idle");
    return;
  }
  // Patrulla de ida y vuelta alrededor de su puesto.
  if (e.x < e.home - PIQ.patrol) e.pdir = 1;
  else if (e.x > e.home + PIQ.patrol) e.pdir = -1;
  e.x += e.pdir * 40 * dt;
  e.face = e.pdir;
  setAnim(e, "walk");
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
      vx: e.wdir * (p2 ? 330 : 300) * difficulty.projectiles,
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
// Estado del aviso del jefe (puro, lo usan el dibujo y las pruebas): altura del disparo
// ('high' = quédate en el suelo, 'low' = salta), y del cañón, sentido y tiempo restante.
function bossTelegraph(e) {
  if (!e || e.type !== 3 || e.dead || !(e.wind > 0)) return null;
  return {
    height: e.pat === "high" ? "high" : "low",
    y: e.pat === "high" ? e.y + 22 : e.y + 55,
    dir: e.wdir >= 0 ? 1 : -1,
    left: e.wind,
  };
}
// Arcabucero y capitán (el perro y el piquero animan en su propia actualización).
function enemyAnim(e, dir) {
  if (e.type === 3 && e.wind > 0) return; // preparando disparo: mantiene la pose
  const busy = e.animT < animDur(ENEMY_KIND[e.type], e.anim, 0.4);
  e.face = dir;
  if (e.anim === ENEMY_ATTACK[e.type] && busy) return;
  if (e.type === 1) setAnim(e, e.cool > 0.6 ? "reload" : "aim");
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
  llamaS.reactT -= dt;
  if (llamaS.anim === "spit" && llamaS.spitT < animDur("llama", "spit", 0.5)) return;
  // Gestos breves (sorpresa, orgullo…); caminar para seguir al guerrero los interrumpe.
  const speed = Math.abs(v);
  if (llamaS.react && llamaS.reactT > 0 && speed <= 150) return setAnim(llamaS, llamaS.react);
  llamaS.react = "";
  if (speed > 5) llamaS.face = v > 0 ? 1 : -1;
  if (speed > 12) {
    llamaS.still = 0;
    return setAnim(llamaS, speed > 150 ? "run" : "walk");
  }
  // Quieta: preocupada si al guerrero le queda poca vida; si no, de vez en cuando mira
  // alrededor y mueve las orejas (4 s quieta → 2,5 s mirando).
  llamaS.still += dt;
  if (llamaS.still > 6.5) llamaS.still = 0;
  if (player.hp > 0 && player.hp <= 2) setAnim(llamaS, "worry");
  else setAnim(llamaS, llamaS.still > 4 ? "look" : "idle");
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
  SPR.outline = null;
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
  });
}
// Avisos «E · RECARGAR» de apachetas y llama: se dibujan al final, sobre los personajes.
function drawPrompts() {
  if (player.hp > 0) {
    const pi = nearPile();
    if (pi >= 0 && !(pi === ARENA_PILE && arenaLive() && world.arenaReloads <= 0))
      drawKeyPrompt(piles[pi] + 5, GROUND - 100, "E", "RECARGAR");
  }
  if (llamaPromptVisible()) drawKeyPrompt(world.llama + 18, GROUND - 112, "E", "RECARGAR");
}
// Sombra suave en el suelo bajo los personajes (elipse, sin reservar memoria).
function shadow(cx, y, rx, a) {
  ctx.globalAlpha = a;
  ctx.fillStyle = "#140c08";
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, Math.max(2, rx * 0.26), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
// Suelo bajo el héroe (plataforma o terreno) para colocar su sombra al saltar.
function floorUnder(o) {
  let f = GROUND;
  const feet = o.y + o.h;
  for (const p of platforms)
    if (o.x + o.w > p.x && o.x < p.x + p.w && feet <= p.y + 2) f = Math.min(f, p.y);
  return f;
}
function drawShadows() {
  shadow(world.llama + 18, GROUND - 1, 22, 0.24);
  for (const e of enemies) {
    if (e.dead || e.gone) continue;
    shadow(e.x + e.w / 2, e.y + e.h - 1, e.type === 3 ? 42 : e.w * 0.6, 0.26);
  }
  // El héroe: sombra más marcada (se encoge y aclara al saltar).
  const f = floorUnder(player),
    k = Math.max(0.45, 1 - (f - player.y - player.h) / 170);
  shadow(player.x + player.w / 2, f - 1, 21 * k, 0.5 * k);
}
// Aviso contextual como en el diseño: caja oscura, borde dorado de 2 px y tecla en «kbd».
// (cx, y) = centro superior de la caja, en coordenadas del mundo.
const PROMPT_FONT = "15px 'Atkinson Hyperlegible', 'Segoe UI', sans-serif",
  KBD_FONT = "bold 14px 'Pixelify Sans', ui-monospace, monospace";
// En pantallas estrechas el canvas se reduce mucho: los avisos crecen para seguir legibles.
let promptScale = 1;
if (typeof ResizeObserver !== "undefined")
  new ResizeObserver((en) => {
    const w = en[0] && en[0].contentRect.width;
    promptScale = w ? Math.max(1, Math.min(2.2, 720 / w)) : 1;
  }).observe(canvas);
function drawKeyPrompt(cx, y, key, label) {
  if (promptScale !== 1) {
    ctx.save();
    ctx.translate(cx, y + 32);
    ctx.scale(promptScale, promptScale);
    ctx.translate(-cx, -(y + 32));
  }
  ctx.font = KBD_FONT;
  const kw = Math.max(18, ctx.measureText(key).width + 12);
  ctx.font = PROMPT_FONT;
  const lw = ctx.measureText(label).width;
  const w = Math.round(10 + kw + 8 + lw + 12),
    h = 32,
    x = Math.round(cx - w / 2);
  rect(x - 2, y - 2, w + 4, h + 4, "#E9B53B");
  rect(x, y, w, h, "#0B080D");
  rect(x + 10, y + 7, kw, 18 + 3, "#8A7D66");
  rect(x + 10, y + 7, kw, 18, "#F2E6CC");
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#16121A";
  ctx.font = KBD_FONT;
  ctx.fillText(key, x + 10 + kw / 2, y + 16.5);
  ctx.textAlign = "left";
  ctx.fillStyle = "#F2E6CC";
  ctx.font = PROMPT_FONT;
  ctx.fillText(label, x + 10 + kw + 8, y + 16.5);
  ctx.textBaseline = "alphabetic";
  if (promptScale !== 1) ctx.restore();
}
// Banda de aviso en pantalla (coordenadas de pantalla), centrada.
function drawNotice(text, y, color = "#F2E6CC") {
  ctx.font = PROMPT_FONT;
  const w = Math.round(ctx.measureText(text).width + 28),
    x = Math.round(W / 2 - w / 2),
    k = Math.min(promptScale, (W - 24) / w); // nunca más ancho que el canvas
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(k, k);
  ctx.translate(-W / 2, -y);
  rect(x, y, w, 30, "#0B080Dd9");
  rect(x, y + 30, w, 2, "#A8301F");
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 14, y + 15.5);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}
// Mostrar «E · RECARGAR» sobre la llama solo cuando la recarga sirve de verdad.
function llamaPromptVisible() {
  return (
    !!player &&
    player.hp > 0 &&
    nearPile() < 0 &&
    world.loads > 0 &&
    player.ammo <= MAX_AMMO - difficulty.refill &&
    nearLlama()
  );
}
function drawLlama() {
  const lx = world.llama;
  if (SP) {
    resetSpr();
    sprite("llama", llamaS.anim, llamaS.animT, lx - 2, GROUND - 70, 40, 70, llamaS.face);
  } else {
    // Sin sprites: llama geométrica (mirando a la derecha, espejada si mira a la izquierda).
    // La cabeza avanza al escupir y se levanta con orgullo.
    const f = llamaS.face < 0 ? -1 : 1,
      c = lx + LLAMA_MID,
      a = llamaS.anim,
      hx = a === "spit" ? (llamaS.spitT < 0.2 ? -3 : 5) : a === "surprise" ? -5 : 0,
      hy = a === "proud" || a === "celebrate" ? -5 : a === "worry" ? 4 : 0;
    const R = (x, y, w, h, col) => rect(f > 0 ? c + x : c - x - w, y, w, h, col);
    R(-28, GROUND - 39, 42, 20, "#e6d6ad");
    R(5 + hx / 2, GROUND - 62 + hy / 2, 11, 37, "#e6d6ad");
    R(5 + hx, GROUND - 67 + hy, 22, 12, "#e6d6ad");
    R(7 + hx, GROUND - 77 + hy, 4, 12, "#e6d6ad");
    R(-23, GROUND - 20, 6, 20, "#cab98f");
    R(5, GROUND - 20, 6, 20, "#cab98f");
    R(-18, GROUND - 40, 22, 16, "#a04d39");
  }
  if (llamaS.anim === "surprise") {
    // «!» sobre la cabeza.
    const x = Math.round(lx + LLAMA_MID + llamaS.face * 6),
      y = GROUND - 122;
    rect(x - 3, y - 2, 8, 24, "#0B080D");
    rect(x - 1, y, 4, 12, "#F2C14E");
    rect(x - 1, y + 15, 4, 4, "#F2C14E");
  }
}
// Mancha en la cara (sin sprites; con ellos la dibuja la animación «spat»), indignación
// tras el aturdimiento y globos de diálogo.
function drawSpitReactions() {
  for (const e of enemies) {
    if (e.dead || e.gone) continue;
    if (!SP && e.spat > 0) {
      ctx.globalAlpha = Math.min(1, e.spat / 0.4);
      const x = faceX(e),
        y = faceY(e);
      rect(x - 6, y - 4, 12, 8, "#c3eaa8");
      rect(x - 3, y - 6, 6, 2, "#c3eaa8");
      rect(x - 4, y + 4, 3, 5, "#79b46b");
      ctx.globalAlpha = 1;
    }
    if (e.huff > 0 && !(e.stun > 0)) drawHuff(e);
  }
  for (const b of world.speech) drawSpeech(b);
}
// Marca de enfado (cuatro ángulos rojos) junto a la cabeza.
function drawHuff(e) {
  const pulse = reducedMotion() ? 0 : Math.round(Math.sin(world.time * 18));
  const x = Math.round(faceX(e) + (e.face >= 0 ? 10 : -22)),
    y = Math.round(e.y - (e.type === 3 ? 10 : e.type === 0 ? 14 : 34)) - pulse;
  for (const [dx, dy, w, h] of [
    [0, 0, 4, 2],
    [0, 0, 2, 4],
    [8, 0, 4, 2],
    [10, 0, 2, 4],
    [0, 10, 4, 2],
    [0, 8, 2, 4],
    [8, 10, 4, 2],
    [10, 8, 2, 4],
  ])
    rect(x + dx, y + dy, w, h, "#D8432F");
}
// Globo de diálogo sobre el personaje (pico hacia abajo), legible en pantallas pequeñas.
function drawSpeech(b) {
  const e = b.e,
    cx = Math.max(cam + 90, Math.min(cam + W - 90, e.x + e.w / 2)),
    y = e.y - (e.type === 3 ? 118 : e.type === 0 ? 52 : 78);
  ctx.save();
  if (promptScale !== 1) {
    ctx.translate(cx, y + 32);
    ctx.scale(promptScale, promptScale);
    ctx.translate(-cx, -(y + 32));
  }
  ctx.globalAlpha = Math.min(1, b.t * 4);
  ctx.font = "bold " + PROMPT_FONT;
  const w = Math.round(ctx.measureText(b.text).width + 24),
    x = Math.round(cx - w / 2);
  rect(x - 2, y - 2, w + 4, 34, "#E9B53B");
  rect(x, y, w, 30, "#F2E6CC");
  rect(cx - 5, y + 32, 10, 3, "#E9B53B");
  rect(cx - 3, y + 35, 6, 3, "#E9B53B");
  rect(cx - 3, y + 30, 6, 4, "#F2E6CC");
  ctx.fillStyle = "#16121A";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(b.text, cx, y + 15.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
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
    if (e.type === 2 && !e.dead && e.wind > 0) drawPikeGlint(e);
    if (e.type === 3 && !e.dead) {
      rect(e.x - 10, e.y - 20, 110, 7, "#342f2a");
      rect(e.x - 10, e.y - 20, (110 * e.hp) / e.max, 7, "#db7052");
    }
    if (e.type === 3 && !e.dead && e.wind > 0) drawTelegraph(e);
  }
}
function reducedMotion() {
  return !!(REDUCED_MOTION && REDUCED_MOTION.matches);
}
// Aviso del jefe durante toda la preparación (≥0,42 s): globo «!» de píxel (oro sobre
// oscuro, borde de 2 px como la interfaz) sobre su cabeza y una flecha a la altura del
// disparo (alta = quédate en el suelo, baja = salta). El cuerpo se ilumina; con
// «reducir movimiento» la luz es fija (sin parpadeo).
function drawTelegraph(e) {
  const tg = bossTelegraph(e);
  if (!tg) return;
  const steady = reducedMotion(),
    on = steady || Math.floor(tg.left * 8) % 2 === 0;
  if (SP && on) {
    resetSpr();
    SPR.flash = true;
    SPR.alpha = steady ? 0.35 : 0.5;
    sprite("capitan", e.anim || "shoot", e.animT, e.x, e.y, e.w, e.h, e.face);
  }
  // Globo: 34×42 con pico hacia el capitán, encima de la barra de vida.
  const bx = Math.round(e.x + e.w / 2 - 17),
    by = Math.round(e.y - 74);
  rect(bx, by, 34, 42, "#E9B53B");
  rect(bx + 2, by + 2, 30, 38, "#0B080D");
  rect(bx + 12, by + 42, 10, 2, "#E9B53B");
  rect(bx + 14, by + 44, 6, 2, "#E9B53B");
  rect(bx + 16, by + 46, 2, 2, "#E9B53B");
  rect(bx + 13, by + 7, 8, 18, "#F2C14E");
  rect(bx + 13, by + 7, 2, 18, "#FFE79A");
  rect(bx + 13, by + 29, 8, 7, "#F2C14E");
  // Flecha a la altura del disparo, delante del cañón.
  const d = tg.dir,
    x0 = d > 0 ? e.x + e.w + 2 : e.x - 2,
    y = Math.round(tg.y + 2),
    len = 40;
  const lx = d > 0 ? x0 : x0 - len;
  rect(lx - 1, y - 3, len + 2, 8, "#0B080D");
  rect(lx, y - 1, len, 4, "#E9B53B");
  for (let i = 0; i < 4; i++) {
    const ax = d > 0 ? x0 + len + i * 2 : x0 - len - i * 2 - 2;
    rect(ax, y - 7 + i * 2, 2, 16 - i * 4, "#0B080D");
    if (i < 3) rect(ax, y - 5 + i * 2, 2, 12 - i * 4, "#E9B53B");
  }
}
// Piquero preparando la estocada: brillo en la punta de la pica echada atrás.
function drawPikeGlint(e) {
  if (!reducedMotion() && Math.floor(e.wind * 16) % 2) return;
  const cx = e.x + e.w / 2 + e.wdir * 44,
    cy = e.y + e.h - 33;
  rect(cx - 4, cy - 1, 8, 2, "#FFF5B8");
  rect(cx - 1, cy - 4, 2, 8, "#FFF5B8");
  rect(cx - 1, cy - 1, 2, 2, "#ffffff");
}
function drawPlayer() {
  const blink = player.inv > 0 && Math.floor(player.inv * 10) % 2 !== 0;
  if (SP) {
    resetSpr();
    SPR.fill = player.ammo / 24;
    SPR.flash = player.flash > 0;
    SPR.alpha = blink ? 0.45 : 1;
    SPR.outline = HERO_RIM;
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
      const sw = s.spit ? s.w || 8 : 8,
        sh = s.spit ? s.h || 8 : 8;
      sprite(kind, s.bola ? "spin" : "fly", world.time, s.x, s.y, sw, sh, s.vx < 0 ? -1 : 1);
    } else
      rect(
        s.x,
        s.y,
        s.fire || s.bola || s.spit ? 13 : 7,
        s.fire || s.bola || s.spit ? 10 : 6,
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
    if (world && !world.optionalCompleted) {
      const o = STAGE_CONFIG.optional;
      rect(o.x, o.y, o.w, o.h, "#e9b53b");
      rect(o.x + 7, o.y + 7, 14, 14, "#a8301f");
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#f2e6cc";
      ctx.textAlign = "center";
      ctx.fillText("TERRAZA SECRETA", o.x + o.w / 2, o.y - 12);
      ctx.textAlign = "left";
    }
    drawShadows();
    drawLlama();
    drawEnemies(false);
    drawPlayer(); // el héroe va delante de la llama y de las apachetas
    drawShots();
    drawFx();
    for (const p of particles) rect(p.x, p.y, 4, 4, p.color);
    drawSpitReactions();
    drawPrompts();
  }
  ctx.restore();
  if (BG && BG.drawForeground) BG.drawForeground(ctx, camR, renderT, BG_OPTS);
  if (UI) return drawCanvasNotices(); // el HUD vive en HTML (ui.js); aquí solo avisos
  drawTip(140);
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
    if (player.x > piles[ARENA_PILE] - 100) {
      ctx.fillStyle = "#f8d48c";
      ctx.fillText("CAPITÁN DE LA EXPEDICIÓN", 580, 100);
    }
  }
}
// Con el HUD HTML superpuesto (vida y provisiones arriba a la izquierda, etapa y pausa a la
// derecha), los avisos del canvas van por debajo de esa franja.
const NOTICE_Y = 150;
function drawCanvasNotices() {
  if (!player || state !== "playing") return;
  if (player.ammo === 0)
    drawNotice("Manta vacía: J golpea con la macana · E recarga en la apacheta o la llama", NOTICE_Y);
  else if (player.x > piles[ARENA_PILE] - 100 && enemies.some((e) => e.type === 3 && !e.dead))
    drawNotice("CAPITÁN DE LA EXPEDICIÓN", NOTICE_Y, "#E9B53B");
  drawTip(NOTICE_Y + 44);
}
// Aviso del rescate automático (enseña la tecla H / el botón de la llama).
function drawTip(y) {
  if (!player || state !== "playing" || !world.tip) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, world.tip.t * 2);
  drawNotice(world.tip.text, y, "#c3eaa8");
  ctx.restore();
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
    player.bola +
    "   LLAMA " +
    "●".repeat(world.spitCharges) +
    "○".repeat(SPIT.max - world.spitCharges)
  );
}
// ---------------------------------------------------------------------------
// Mapa de misiones (art/map.js). Solo la etapa 1 es jugable; las demás se pueden
// seleccionar para leer su ficha. El progreso (etapas completadas) se guarda en
// localStorage; si el módulo del mapa falta o no puede prepararse, se va directo al nivel.
const PROGRESS_KEY = "chankas.progress.v1",
  MAP_WALK = 2.2; // segundos que tarda el héroe entre dos etapas
// armed: etapa elegida con un toque/clic previo (el segundo toque sobre ella la juega).
const mapS = { progress: 0, selected: 0, heroT: 0, walk: null, msg: 0, armed: -1 };
let mapOk = null, cloudProgress = 0;
function restoreCloudProgress(progress) {
  const completed = progress && progress.completedStages;
  if (!Array.isArray(completed)) return;
  cloudProgress = completed.includes(1) ? 1 : 0;
  saveProgress(Math.max(mapS.progress, cloudProgress));
}
addEventListener("chankas-profile", event => restoreCloudProgress(event.detail && event.detail.progress));
// El perfil puede haber llegado mientras el navegador descargaba game.js.
if (COMPETITION && COMPETITION.getProgress) restoreCloudProgress(COMPETITION.getProgress());
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
  return (mapS.progress = clampProgress(Math.max(Number(v) || 0, cloudProgress)));
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
  if (COMPETITION && state !== "won") COMPETITION.reset();
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
  mapS.armed = -1;
  state = "map";
  holdKeys();
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
  curStage = i;
  reset();
  return true;
}
// Devuelve true si el mapa gestionó la tecla.
function mapKey(code) {
  if (state !== "map") return false;
  const n = stageCount();
  // Izquierda/arriba = etapa anterior; derecha/abajo = siguiente (lista vertical del panel).
  if (code === "ArrowLeft" || code === "KeyA" || code === "ArrowUp" || code === "KeyW")
    mapS.selected = Math.max(0, mapS.selected - 1);
  else if (code === "ArrowRight" || code === "KeyD" || code === "ArrowDown" || code === "KeyS")
    mapS.selected = Math.min(n - 1, mapS.selected + 1);
  else if (code === "Enter" || code === "NumpadEnter" || code === "KeyJ" || code === "Space") {
    playStage(mapS.selected);
    return true;
  } else return false;
  mapS.armed = -1;
  tone(520);
  return true;
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
// Mapa en pantallas estrechas: con la interfaz HTML (el panel va debajo), el canvas pasa a
// un encuadre vertical 3:4 (780×1040) centrado en el Perú; al salir del mapa vuelve a 960×540.
const MAP_PORTRAIT = { w: 780, h: 1040, maxStage: 640 };
const MAP_HTML_CARTOUCHE = 1000; // = @container stage (min-width: 1000px) de style.css
let stageW = 0; // ancho CSS del escenario (ResizeObserver)
if (typeof ResizeObserver !== "undefined" && canvas.parentElement)
  new ResizeObserver((en) => {
    stageW = (en[0] && en[0].contentRect.width) || 0;
  }).observe(canvas.parentElement);
function mapLayout() {
  return state === "map" && UI && stageW > 0 && stageW < MAP_PORTRAIT.maxStage ? "portrait" : "landscape";
}
function fitCanvas() {
  const layout = mapLayout(),
    p = layout === "portrait";
  const cw = p ? MAP_PORTRAIT.w : W,
    ch = p ? MAP_PORTRAIT.h : H;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  if (canvas.dataset && canvas.dataset.layout !== layout) canvas.dataset.layout = layout;
  return layout;
}
function drawMap() {
  const layout = fitCanvas(),
    cw = canvas.width || W,
    ch = canvas.height || H;
  MAP.draw(ctx, renderT, {
    width: cw,
    height: ch,
    layout,
    progress: mapS.progress,
    selected: mapS.selected,
    heroT: mapS.heroT,
    card: !UI, // con ui.js la ficha es el panel HTML «Las cinco cuerdas»
    // En escritorio ancho la página muestra su cartela HTML encima: no se duplica.
    cartouche: !(UI && stageW >= MAP_HTML_CARTOUCHE),
  });
  if (mapS.msg > 0) {
    // Centrado en la zona del mapa (sin la ficha del canvas, en todo el ancho).
    const mx = UI || layout === "portrait" ? cw / 2 : 360,
      my = layout === "portrait" ? ch / 2 : 264,
      k = layout === "portrait" ? 1.6 : 1;
    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(k, k);
    ctx.globalAlpha = Math.min(1, mapS.msg * 2);
    rect(-210, -28, 420, 56, "#1b1210ee");
    ctx.textAlign = "center";
    ctx.font = "bold 18px Georgia, serif";
    ctx.fillStyle = "#f2c14e";
    ctx.fillText("Próximamente", 0, -4);
    ctx.font = "13px Georgia, serif";
    ctx.fillStyle = "#f6e9cc";
    ctx.fillText("La próxima etapa está en construcción.", 0, 16);
    ctx.restore();
    ctx.textAlign = "left";
  }
}
// Ratón / toque en el mapa: un toque selecciona; tocar la etapa ya elegida la juega.
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
  if (!r || !r.width) return [e.offsetX ?? 0, e.offsetY ?? 0];
  // En el encuadre vertical el canvas mide 780×1040: se escala con su tamaño real.
  const cw = canvas.width || W,
    ch = canvas.height || H;
  return [((e.clientX - r.left) * cw) / r.width, ((e.clientY - r.top) * ch) / r.height];
}
function mapPointer(x, y) {
  if (state !== "map") return -1;
  // Botón de la ficha: juega la etapa elegida (o avisa «Próximamente»).
  if (!UI && MAP.buttonAt && MAP.buttonAt(x, y)) {
    playStage(mapS.selected);
    return mapS.selected;
  }
  const i = MAP.stageAt ? MAP.stageAt(x, y) : -1;
  if (i < 0) return -1;
  if (i === mapS.selected && mapS.armed === i) playStage(i);
  else {
    mapS.selected = mapS.armed = i;
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
  const [x, y] = canvasPoint(e);
  canvas.style.cursor =
    MAP.stageAt(x, y) >= 0 || (!UI && MAP.buttonAt && MAP.buttonAt(x, y)) ? "pointer" : "default";
};
// ---------------------------------------------------------------------------
// Modelos de vista para la interfaz HTML (funciones puras: se prueban en tests/game.cjs).
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"],
  START_FIRE = 5;
let curStage = 0; // etapa que se está jugando (índice en MAP.stages)
function quipu(n) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(4, "0");
}
function clampN(v, lo, hi) {
  v = Number(v);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}
// HUD: vida, armas, cargas de la llama y quipu. p/w pueden faltar (título): valores iniciales.
function hudView(p, w, sc) {
  const hp = p ? Math.floor(clampN(p.hp, 0, MAX_HP)) : MAX_HP;
  const loads = w && w.loads != null ? Math.floor(clampN(w.loads, 0, LLAMA_LOADS)) : LLAMA_LOADS;
  const spit = w && w.spitCharges != null ? Math.floor(clampN(w.spitCharges, 0, SPIT.max)) : SPIT.max;
  // Progreso de la carga que se está recuperando (0..1, en pasos de 5 % para no tocar el DOM
  // en cada frame).
  const spitFill = spit < SPIT.max ? Math.floor(clampN(w.spitRecharge / SPIT.recharge, 0, 1) * 20) / 20 : 0;
  return {
    spit,
    spitMax: SPIT.max,
    spitFill,
    spitLabel:
      "Escupitajos de la llama: " + spit + " de " + SPIT.max + (spit < SPIT.max ? ", recuperando" : ""),
    spitHint: !!(w && w.tip),
    hp,
    maxHp: MAX_HP,
    lifeLabel: "Vida: " + hp + " de " + MAX_HP,
    ammo: p ? p.ammo : MAX_AMMO,
    maxAmmo: MAX_AMMO,
    fire: p ? p.fire : START_FIRE,
    bola: p ? p.bola : MAX_BOLA,
    weapon: (p && p.weapon) || "J",
    loads,
    maxLoads: LLAMA_LOADS,
    loadLabel: "Carga de la llama: " + loads + " de " + LLAMA_LOADS,
    quipu: quipu(sc),
  };
}
// Barra de ruta: n etapas en columnas iguales; el marcador avanza desde la etapa actual hacia la
// siguiente según el % recorrido del nivel. Posiciones en % del ancho de la barra.
function routeView(stage, pct, n) {
  n = Math.max(1, Math.floor(n) || 1);
  stage = Math.floor(clampN(stage, 0, n - 1));
  pct = Math.round(clampN(pct, 0, 100));
  const at = (i) => ((i + 0.5) / n) * 100;
  const next = stage < n - 1 ? at(stage + 1) : at(stage);
  const marker = Math.round((at(stage) + ((next - at(stage)) * pct) / 100) * 10) / 10;
  return {
    stage,
    roman: ROMAN[stage] || String(stage + 1),
    pct,
    start: at(0),
    end: at(n - 1),
    marker,
    fill: Math.round((marker - at(0)) * 10) / 10,
  };
}
// Disposición de los controles según el tipo de puntero (no el user agent): con puntero
// grueso (táctil) los mandos van sobre el juego; con ratón, barra bajo el juego + teclado.
// (COARSE se define junto a rescueTip.)
function viewport() {
  return {
    w: Number(window.innerWidth) || W,
    h: Number(window.innerHeight) || H,
    coarse: !!(COARSE && COARSE.matches),
  };
}
function controlLayout(vp) {
  return vp && vp.coarse ? "touch" : "desktop";
}
// «Gira tu teléfono»: en táctil y en vertical, solo mientras se juega (o en su pausa).
function needsRotate(layout, w, h, st) {
  return layout === "touch" && Number(h) > Number(w) && (st === "playing" || st === "paused");
}
// Pausa automática al girar a vertical y reanudación al volver a horizontal (solo si la pausa
// la puso el giro). held = la pausa actual es del giro.
function rotateStep(st, rotate, held) {
  if (rotate && st === "playing") return { act: "pause", held: true };
  if (!held) return { act: null, held: false };
  if (st !== "paused") return { act: null, held: false }; // se salió de la pausa por otra vía
  return rotate ? { act: null, held: true } : { act: "resume", held: false };
}
// Cruceta: desplazamiento (dx, dy) desde el centro y radio r → teclas. Zona muerta central;
// arriba = saltar. Abajo no tiene acción (el juego no agacha).
function padKeys(dx, dy, r) {
  const out = [];
  if (!(r > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return out;
  const nx = dx / r,
    ny = dy / r;
  if (Math.hypot(nx, ny) < 0.25) return out;
  if (nx <= -0.35) out.push("ArrowLeft");
  else if (nx >= 0.35) out.push("ArrowRight");
  if (ny <= -0.5) out.push("ArrowUp");
  return out;
}
// Botón de disparo táctil: dispara el arma elegida; sin munición de esa arma, la huaraca
// (que a su vez golpea con la macana si la manta está vacía).
function fireKey(p) {
  const w = (p && p.weapon) || "J";
  if (w === "K" && p.fire > 0) return "KeyK";
  if (w === "L" && p.bola > 0) return "KeyL";
  return "KeyJ";
}
let rotateHeld = false;
function stageInfo() {
  return MAP && MAP.stages && MAP.stages.length
    ? MAP.stages.map((s) => ({
        id: s.id,
        name: s.name,
        place: s.place || "",
        year: s.year || "",
        fictional: !!s.fictional,
      }))
    : [{ id: "sacsayhuaman", name: "El paso de los andenes", place: "Cusco", year: "1536", fictional: false }];
}
function stageNames() {
  return MAP && MAP.stages && MAP.stages.length
    ? MAP.stages.map((s) => s.name)
    : ["El paso de los andenes"];
}
function statusLabel(i) {
  const st = MAP && MAP.statusOf ? MAP.statusOf(i, mapS.progress) : "current";
  if (st === "completed") return { status: st, label: "COMPLETADA" };
  if (st === "locked") return { status: st, label: "Bloqueada" };
  return { status: st, label: stagePlayable(i) ? "EN CURSO" : "PRÓXIMAMENTE" };
}
// Panel del mapa «Las cinco cuerdas».
function mapPanelView() {
  const stages = (MAP && MAP.stages) || [];
  const sel = Math.floor(clampN(mapS.selected, 0, Math.max(0, stages.length - 1)));
  const s = stages[sel] || {};
  const fiction = String(s.fiction || "").replace(/^Ficción:\s*/, "");
  const playable = stagePlayable(sel);
  return {
    selected: sel,
    rows: stages.map((st, i) => ({ roman: ROMAN[i] || String(i + 1), name: st.name, ...statusLabel(i) })),
    history: s.history || "",
    fiction: fiction ? fiction[0].toUpperCase() + fiction.slice(1) : "",
    playable,
    playLabel: playable ? "Jugar etapa " + (ROMAN[sel] || sel + 1) : "Próximamente",
    notice: mapS.msg > 0 ? "Próximamente: la etapa " + (ROMAN[sel] || sel + 1) + " está en construcción." : "",
  };
}
function uiView() {
  const names = stageNames(),
    info = stageInfo(),
    vp = viewport(),
    layout = controlLayout(vp),
    cur = info[Math.min(curStage, info.length - 1)];
  return {
    layout,
    rotate: needsRotate(layout, vp.w, vp.h, state),
    // Recargar contextual (táctil): junto a una apacheta o a la llama con carga.
    reload: !!(
      state === "playing" &&
      player &&
      world &&
      (nearPile() >= 0 || (nearLlama() && world.loads > 0))
    ),
    stages: info,
    stagePlace: cur.place,
    stageYear: cur.year,
    state,
    difficulty: difficultyId,
    difficultyName: difficulty.name,
    sound,
    hasMap: !!(MAP && MAP.stages && MAP.stages.length),
    hud: hudView(player, world, score),
    route: routeView(curStage, player ? (player.x / END) * 100 : 0, names.length),
    stageNames: names,
    stageName: names[Math.min(curStage, names.length - 1)],
    map: state === "map" ? mapPanelView() : null,
  };
}
// Volver a la pantalla de título (la partida en curso se abandona).
function goTitle() {
  if (COMPETITION) COMPETITION.reset();
  state = "menu";
  player = null;
  world = null;
  shots = [];
  enemies = [];
  particles = [];
  fx = [];
  cam = 0;
  holdKeys();
  mapS.walk = null;
  overlay.style.display = "none";
  restartBtn.hidden = true;
  return true;
}
// Acciones de la interfaz HTML. game.js decide; la interfaz solo refleja el estado.
function uiAction(name, arg) {
  switch (name) {
    case "start": // título → etapa I
      if (state !== "menu") return false;
      curStage = 0;
      reset();
      return true;
    case "map":
      if (state === "map") return false;
      return openMap(state === "won");
    case "pause": // botón táctil
      if (state !== "playing" && state !== "paused") return false;
      pause();
      return true;
    case "suspend": // salir de pantalla completa, pestaña oculta: pausa sin alternar
      // Una suspensión explícita retira la reanudación automática al volver a horizontal.
      if (state === "paused" && rotateHeld) return !(rotateHeld = false);
      if (state !== "playing") return false;
      pause();
      return true;
    case "weapon":
      return selectWeapon(["J", "K", "L"][arg]);
    case "resume":
      if (state !== "paused") return false;
      pause();
      return true;
    case "restart":
      if (state !== "paused" && state !== "lost" && state !== "won") return false;
      reset();
      return true;
    case "title":
      return goTitle();
    case "sound":
      toggleSound();
      return true;
    case "select": {
      if (state !== "map") return false;
      const i = Math.floor(clampN(arg, 0, stageCount() - 1));
      // Elegir la etapa ya elegida la juega (como el segundo toque en el canvas).
      if (i === mapS.selected) return playStage(i);
      tone(520);
      mapS.selected = i;
      mapS.armed = -1;
      return true;
    }
    case "play":
      return playStage(mapS.selected);
  }
  return false;
}
const REDUCED_MOTION =
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function loop(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  // prefers-reduced-motion: fuera del juego (título, pausa, mapa) se congelan las
  // animaciones decorativas del escenario; jugando siguen, son información de juego.
  if (state === "playing" || !REDUCED_MOTION || !REDUCED_MOTION.matches) renderT += dt;
  if (state === "map") {
    updateMap(dt);
    drawMap();
  } else {
    fitCanvas(); // fuera del mapa, siempre 960×540
    if (state === "playing") update(dt);
    else if (state === "won" || state === "lost") {
      updateFx(dt);
      if (llamaS) llamaS.animT += dt; // la llama sigue celebrando tras la victoria
    }
    draw();
  }
  if (UI) {
    const vp = viewport(),
      r = rotateStep(state, needsRotate(controlLayout(vp), vp.w, vp.h, state), rotateHeld);
    rotateHeld = r.held;
    if (r.act) pause(); // pausa al girar a vertical / reanuda al volver a horizontal
    UI.sync();
  }
  if (COMPETITION) COMPETITION.sync(uiView());
  requestAnimationFrame(loop);
}
if (UI) UI.init({ view: uiView, action: uiAction });
else overlay.style.display = "flex"; // sin ui.js: la tarjeta clásica hace de título
requestAnimationFrame(loop);

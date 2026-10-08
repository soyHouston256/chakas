/*
 * art/background.js — CHANKAS · Fondo pixel-art andino (Sacsayhuamán / Cusco, 1536)
 *
 * Script clásico (sin módulos). Expone window.ChankasBackground.
 *
 * Todo se dibuja a resolución interna baja (alto 180 px) en buffers offscreen y se
 * escala con imageSmoothingEnabled=false (×3 para un canvas de 960×540).
 * Las capas estáticas se pre-renderizan UNA vez (por tamaño/levelLength); por frame solo
 * se hacen drawImage + unos pocos fillRect (nubes, cóndor, humo, fuego, banderas, ichu).
 *
 * Coordenadas:
 *  - drawBackground / drawForeground: coordenadas de PANTALLA (llamar sin translate).
 *  - drawGround / drawPlatform: coordenadas de MUNDO (llamar dentro de ctx.translate(-cam,0),
 *    igual que game.js dibuja el suelo y las plataformas). cameraX solo se usa para culling.
 */
(function (root) {
  'use strict';

  var LOW_H = 180;
  var PARALLAX = { far: 0.08, midfar: 0.2, mid: 0.45, fg: 1.3, cloud: 0.03, condor: 0.05 };

  // ---------------------------------------------------------------- utilidades
  function hex(h) {
    if (h.charAt(0) === '#') h = h.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function css(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function mix(a, b, t) {
    return [(a[0] + (b[0] - a[0]) * t + 0.5) | 0, (a[1] + (b[1] - a[1]) * t + 0.5) | 0, (a[2] + (b[2] - a[2]) * t + 0.5) | 0];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function makeRng(a) {
    a = a | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(n, s) {
    var x = Math.imul((n | 0) ^ Math.imul(s | 0, 0x9E3779B1), 0x85EBCA6B);
    x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function hash2(x, y, s) { return hash((x | 0) * 73856093 ^ (y | 0) * 19349663, s); }
  // ruido de valor 1D (period opcional para tiles que se repiten)
  function noise1(x, seed, period) {
    var i = Math.floor(x), f = x - i, j = i + 1;
    if (period) { i = ((i % period) + period) % period; j = ((j % period) + period) % period; }
    var a = hash(i, seed), b = hash(j, seed), u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
  function fbm(x, seed) {
    return noise1(x, seed) * 0.6 + noise1(x * 2.03, seed + 7) * 0.28 + noise1(x * 4.1, seed + 13) * 0.12;
  }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

  function makeCanvas(w, h) {
    var c = root.document && root.document.createElement ? root.document.createElement('canvas') : null;
    if (!c) c = { width: w, height: h, getContext: function () { return null; } };
    c.width = w; c.height = h;
    return c;
  }

  // buffer de píxeles RGBA (se vuelca a canvas con putImageData, una sola vez)
  function Buf(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  Buf.prototype.set = function (x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = (y * this.w + x) * 4, d = this.d;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  };
  Buf.prototype.has = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.d[(y * this.w + x) * 4 + 3] > 0;
  };
  Buf.prototype.get = function (x, y) {
    var i = (y * this.w + x) * 4, d = this.d;
    return [d[i], d[i + 1], d[i + 2]];
  };
  Buf.prototype.fill = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  Buf.prototype.ellipse = function (cx, cy, rx, ry, colorFn) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, colorFn(x, y, dx, dy));
      }
  };
  Buf.prototype.toCanvas = function () {
    var cv = makeCanvas(this.w, this.h), g = cv.getContext('2d');
    if (g && g.createImageData) {
      var img = g.createImageData(this.w, this.h);
      img.data.set(this.d);
      g.putImageData(img, 0, 0);
    }
    return cv;
  };

  /*
   * Perspectiva atmosférica (QA visual): comprime el rango tonal de una capa lejana hacia
   * un color de bruma y le quita saturación, para que la capa jugable (suelo, plataformas,
   * sprites con contorno oscuro) se lea siempre por delante del fondo.
   */
  Buf.prototype.haze = function (col, amt, desat) {
    var d = this.d;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var r = d[i], g = d[i + 1], bl = d[i + 2], l = r * 0.3 + g * 0.59 + bl * 0.11;
      r += (l - r) * desat; g += (l - g) * desat; bl += (l - bl) * desat;
      d[i] = r + (col[0] - r) * amt; d[i + 1] = g + (col[1] - g) * amt; d[i + 2] = bl + (col[2] - bl) * amt;
    }
    return this;
  };

  // ---------------------------------------------------------------- paleta andina
  var P = (function () {
    var src = {
      sky: ['#163262', '#1b3a6e', '#22447b', '#2a4f88', '#335c95', '#3f69a0', '#5079ab', '#668ab3', '#829cba', '#a3aeb8', '#c4bba5', '#dfc797', '#ecd09a'],
      sunCore: '#fff7de', sunRim: '#f9e2a2', sunGlow: '#f3d79c',
      cloudLit: '#f6e7c8', cloudMid: '#dccdb6', cloudShade: '#a9a3b2', cloudWarm: '#f2cf9a',
      condor: '#1d1a1c', condorWhite: '#d9d4cb', condorHead: '#b9765f',
      apuBack: '#9badc9', rockLit: '#8b93ac', rockShade: '#5c6a8d', snowLit: '#f3ece0', snowShade: '#a8b8d3', apuHaze: '#a9bbd2',
      hillHaze: '#a7b0a1',
      fields: ['#7c8a45', '#8d8a48', '#a08c4c', '#6f7e40', '#97904f', '#b39a55'],
      andenWall: '#8f8670', andenJoint: '#5f584a', andenShadow: '#596334',
      valley: ['#7f8c4c', '#8f9152', '#a59656', '#77834a', '#b1a060'],
      plaza: '#c6b086', cityWall: '#bcae90', cityWallSh: '#958a73', thatch: '#c8a14a', thatchSh: '#95752f',
      burnt: '#3a302a', ember: '#d0602a', fire1: '#f08a2a', fire2: '#ffd36a', gold: '#e4b847', door: '#3a3028',
      ichu: ['#b39a4c', '#a68c42', '#8a8442', '#97874a', '#bba356'], ichuRim: '#d4bd6a', ichuRim2: '#c4aa5c', ichuDeep: '#7a6a36',
      tuft: '#d8c070', tuftSh: '#a88f45',
      path: '#cdb78e', pathEdge: '#957f5c',
      stone: ['#a39d8f', '#968f82', '#b0a896', '#9b9384', '#aba08a'], stoneLight: '#dad0b8', stoneDark: '#6a6357', stoneJoint: '#463f37', lichen: '#b4ad78', stoneDeep: '#5a544b',
      wallShade: '#6d7387', hazeMid: '#8f97a3', hazeFar: '#a9b4bf',
      platOutline: '#2a211b', platWarm: '#c79a5c',
      tTrunk: '#9a5638', tTrunkSh: '#6a3826', qLeaf: ['#6f8248', '#4e6233', '#34442a'],
      mTrunk: '#5a4030', mLeaf: ['#9ab45c', '#7d9748', '#5d7535'], berry: '#b8424a',
      pole: '#4a3526', flagW: '#eee5d2', flagR: '#a3242b', flagWSh: '#c9bfae',
      smoke: ['#3b3531', '#5d5651', '#8a837d', '#aaa39b'],
      grassRim: '#b9a85a', grass: ['#7f8040', '#8f8c45', '#a6984a', '#76783c'],
      earth: ['#7b5d3d', '#6e5236', '#86683f'], earthDark: '#58422c', earthDeep: '#4a3726', pebble: '#a39a88', pebbleSh: '#5a4430',
      fgIchu: ['#6e5a26', '#8a7232', '#a48a40'], fgStone: '#57524a', fgStoneLit: '#7f776a', fgStem: '#3f4a2a',
      cantuta: ['#a8264f', '#b83a2e', '#c2386a'], cantutaTip: '#d9a03a'
    };
    var o = {};
    for (var k in src) o[k] = Array.isArray(src[k]) ? src[k].map(hex) : hex(src[k]);
    return o;
  })();

  // ---------------------------------------------------------------- piedra poligonal inca
  /*
   * Rellena un muro de piedras poligonales encajadas: hiladas irregulares con bordes
   * inclinados, juntas finas, esquinas biseladas (almohadillado) y luz de tarde (derecha).
   * topFn(x) -> y superior (global), botY -> y inferior. shadeFn(x,y,c) -> color final.
   */
  function renderStones(b, x0, x1, topFn, botY, st, seed, shadeFn) {
    var n = x1 - x0;
    if (n <= 0) return;
    var rng = makeRng(seed);
    var tops = new Array(n), minTop = 1e9, i;
    for (i = 0; i < n; i++) { tops[i] = Math.round(topFn(x0 + i)); if (tops[i] < minTop) minTop = tops[i]; }
    if (minTop > botY) return;
    var bounds = [], prev = new Array(n + 1);
    for (i = 0; i <= n; i++) prev[i] = botY + 1;
    bounds.push(prev);
    var yb = botY + 1, jit = st.jit || 1;
    while (yb > minTop) {
      yb -= st.minH + Math.floor(rng() * (st.maxH - st.minH + 1));
      var arr = new Array(n + 1), vx = 0, vy = yb + Math.round(rng() * 2 * jit - jit);
      var nx = Math.min(n, 3 + Math.floor(rng() * 6)), ny = yb + Math.round(rng() * 2 * jit - jit);
      for (i = 0; i <= n; i++) {
        while (i > nx) { vx = nx; vy = ny; nx = Math.min(n, vx + 3 + Math.floor(rng() * 6)); ny = yb + Math.round(rng() * 2 * jit - jit); }
        var tt = nx === vx ? 0 : (i - vx) / (nx - vx);
        var v = Math.round(vy + (ny - vy) * tt);
        if (v > prev[i] - 2) v = prev[i] - 2;
        arr[i] = v;
      }
      bounds.push(arr); prev = arr;
    }
    var slant = st.slant || 1;
    for (var k = 0; k < bounds.length - 1; k++) {
      var bot = bounds[k], top = bounds[k + 1];
      var joints = [], jx = -Math.floor(rng() * st.maxW);
      while (jx < n + st.maxW) {
        joints.push([jx + Math.round(rng() * 2 * slant - slant), jx + Math.round(rng() * 2 * slant - slant)]);
        jx += st.minW + Math.floor(rng() * (st.maxW - st.minW + 1));
      }
      var ptr = 0;
      for (i = 0; i < n; i++) {
        var yt = top[i], ybb = bot[i], ys = Math.max(yt, tops[i]);
        if (ys >= ybb) continue;
        while (ptr + 1 < joints.length && Math.max(joints[ptr + 1][0], joints[ptr + 1][1]) < i) ptr++;
        for (var y = ys; y < ybb; y++) {
          var t = (y - yt) / Math.max(1, ybb - 1 - yt);
          var j = ptr;
          while (j + 1 < joints.length && Math.round(joints[j + 1][0] + (joints[j + 1][1] - joints[j + 1][0]) * t) <= i) j++;
          while (j > 0 && Math.round(joints[j][0] + (joints[j][1] - joints[j][0]) * t) > i) j--;
          var rl = Math.round(joints[j][0] + (joints[j][1] - joints[j][0]) * t);
          var rr = j + 1 < joints.length ? Math.round(joints[j + 1][0] + (joints[j + 1][1] - joints[j + 1][0]) * t) : 1e9;
          var dy = y - yt, dyb = ybb - 1 - y, dl = i - rl, dr = rr - 1 - i, col;
          if (dy === 0 || dl === 0) col = st.joint;
          else if ((dy === 1 || dyb === 0) && (dl === 1 || dr === 0)) col = st.joint;
          else {
            var sid = hash(k * 7919 + j, seed);
            col = st.tones[Math.floor(sid * st.tones.length)];
            if (dy === 1) col = mix(col, st.light, 0.45);
            else if (dyb === 0) col = mix(col, st.dark, 0.45);
            else if (dl === 1) col = mix(col, st.light, 0.18);
            else if (dr === 0) col = mix(col, st.dark, 0.3);
            var hs = hash2(x0 + i, y, seed + 3);
            if (hs < 0.05) col = mix(col, st.dark, 0.3);
            else if (hs > 0.965) col = mix(col, st.lichen, 0.5);
          }
          if (y === tops[i] && col !== st.joint) col = mix(col, st.light, 0.35);
          if (shadeFn) col = shadeFn(x0 + i, y, col);
          b.set(x0 + i, y, col);
        }
      }
    }
  }
  function stoneStyle(minW, maxW, minH, maxH, slant, jit) {
    return { minW: minW, maxW: maxW, minH: minH, maxH: maxH, slant: slant, jit: jit,
      tones: P.stone, light: P.stoneLight, dark: P.stoneDark, joint: P.stoneJoint, lichen: P.lichen };
  }

  // ---------------------------------------------------------------- 1. cielo
  function buildSky(w) {
    var b = new Buf(w, LOW_H), stops = P.sky, n = stops.length;
    var sunX = Math.round(w * 0.74), sunY = 50;
    for (var y = 0; y < LOW_H; y++) {
      var t = Math.min(1, Math.pow(y / 118, 1.1)), f = t * (n - 1), i0 = Math.floor(f), fr = f - i0;
      for (var x = 0; x < w; x++) {
        var c = stops[fr > bayer(x, y) ? Math.min(n - 1, i0 + 1) : i0];
        var dx = x - sunX, dy = y - sunY, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 5.5) c = P.sunCore;
        else if (d <= 7) c = P.sunRim;
        else if (d < 32) {
          var g = 1 - d / 32; g *= g;
          var lv = Math.floor(g * 3 + bayer(x, y));
          if (lv > 0) c = mix(c, P.sunGlow, lv * 0.18);
        }
        b.set(x, y, c);
      }
    }
    return b.toCanvas();
  }
  function buildCloud(seed, w, h) {
    var r = makeRng(seed), b = new Buf(w, h), blobs = [], nb = 3 + Math.floor(r() * 3);
    for (var i = 0; i < nb; i++) blobs.push({ x: w * (0.2 + 0.6 * r()), y: h * (0.45 + 0.2 * r()), rx: w * (0.14 + 0.16 * r()), ry: h * (0.3 + 0.25 * r()) });
    blobs.push({ x: w * 0.5, y: h * 0.62, rx: w * 0.42, ry: h * 0.22 });
    function inside(x, y) {
      if (y > h * 0.86 || x < 0 || y < 0 || x >= w) return false;
      for (var k = 0; k < blobs.length; k++) {
        var dx = (x - blobs[k].x) / blobs[k].rx, dy = (y - blobs[k].y) / blobs[k].ry;
        if (dx * dx + dy * dy <= 1) return true;
      }
      return false;
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      var edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge && ((x + y) & 1)) continue;
      var yy = y / h, c = yy < 0.38 ? P.cloudLit : yy < 0.66 ? P.cloudMid : P.cloudShade;
      if (x > w * 0.62 && yy < 0.55) c = P.cloudWarm;
      b.set(x, y, c);
    }
    return b.toCanvas();
  }
  function buildCondor(frame) {
    var w = 17, h = 7, b = new Buf(w, h), cx = 8, cy = 3;
    for (var dx = -8; dx <= 8; dx++) {
      var a = Math.abs(dx), lift = Math.round(a * (frame ? 0.24 : 0.1)), y = cy - lift;
      if (a === 0) continue;
      b.set(cx + dx, y, P.condor);
      if (a < 6) b.set(cx + dx, y + 1, P.condor);
      if (a >= 3 && a <= 5) b.set(cx + dx, y, P.condorWhite);
      if (a >= 7 && (a & 1)) b.set(cx + dx, y - 1, P.condor);
    }
    b.set(cx, cy - 1, P.condorHead); b.set(cx, cy, P.condorWhite);
    b.set(cx, cy + 1, P.condor); b.set(cx, cy + 2, P.condor);
    return b.toCanvas();
  }

  // ---------------------------------------------------------------- 2. Apus nevados
  function buildFar(w) {
    var b = new Buf(w, LOW_H), rng = makeRng(11), peaks = [], x = -30, base = 116;
    while (x < w + 50) {
      var sharp = rng() < 0.4;
      peaks.push(sharp
        ? { cx: x, h: 56 + rng() * 14, sl: 1.25 + rng() * 0.4, sr: 1.05 + rng() * 0.4, massif: false }
        : { cx: x, h: 42 + rng() * 12, sl: 0.65 + rng() * 0.3, sr: 0.55 + rng() * 0.3, massif: true });
      x += 58 + rng() * 52;
    }
    // Salkantay (piramidal) hacia el centro y Ausangate (macizo ancho) hacia el final
    var hero = Math.floor(peaks.length * 0.4);
    peaks[hero].h = 74; peaks[hero].sl = 1.5; peaks[hero].sr = 1.2; peaks[hero].massif = false;
    var aus = Math.min(peaks.length - 2, Math.floor(peaks.length * 0.78));
    peaks[aus].h = 62; peaks[aus].sl = 0.6; peaks[aus].sr = 0.5; peaks[aus].massif = true;

    function peakH(p, xx) {
      var dx = xx - p.cx, v = p.h - Math.abs(dx) * (dx < 0 ? p.sl : p.sr);
      if (p.massif) v += 4 * Math.abs(Math.sin(dx * 0.22)) - 2;
      return v;
    }
    for (x = 0; x < w; x++) {
      // cordillera lejana
      var tb = Math.round(base - 22 - fbm(x * 0.03, 5) * 18);
      for (var y = tb; y < LOW_H; y++) b.set(x, y, mix(P.apuBack, P.apuHaze, y > base - 8 ? 0.5 : 0.15));
      // picos principales
      var best = -1e9, bp = peaks[0];
      for (var k = 0; k < peaks.length; k++) { var hv = peakH(peaks[k], x); if (hv > best) { best = hv; bp = peaks[k]; } }
      best += (fbm(x * 0.15, 21) - 0.5) * 5;
      if (best < 4) continue;
      var top = Math.round(base - best), snowline = 38 + fbm(x * 0.1, 31) * 7 - (bp.massif ? 6 : 0);
      var couloir = noise1(x * 0.7, 41) > 0.6;
      for (y = top; y < LOW_H; y++) {
        var alt = base - y;
        var ridge = bp.cx + Math.sin(y * 0.45 + bp.cx) * 1.6 + (top - y) * 0.05;
        var lit = x > ridge;
        var snow = alt > snowline || (couloir && alt > snowline - 4 - noise1(x * 0.9, 43) * 12) ||
          (alt > snowline - 3 && bayer(x, y) < (alt - snowline + 3) / 3);
        var c = snow ? (lit ? P.snowLit : P.snowShade) : (lit ? P.rockLit : P.rockShade);
        if (y === top && snow) c = lit ? P.snowLit : mix(P.snowShade, P.snowLit, 0.4);
        if (alt < 22) c = mix(c, P.apuHaze, Math.floor(((22 - alt) / 22) * 4 + bayer(x, y)) / 4 * 0.7);
        b.set(x, y, c);
      }
    }
    return b.toCanvas();
  }

  // ---------------------------------------------------------------- 3. valle del Cusco
  function buildMidFar(w) {
    var b = new Buf(w, LOW_H), rng = makeRng(77), x, y, burning = [], smokes = [];
    // colinas del fondo con andenes
    for (x = 0; x < w; x++) {
      var ta = Math.round(86 + fbm(x * 0.02, 51) * 14);
      var terr = noise1(x * 0.015, 53) > 0.45;
      for (y = ta; y < LOW_H; y++) {
        var c = mix(P.valley[0], P.hillHaze, 0.42);
        if (y === ta) c = mix(P.ichuRim, P.hillHaze, 0.45);
        else if (terr && y - ta > 2) {
          var rm = (y + Math.round(noise1(x * 0.06, 55) * 1.5)) % 3;
          c = rm === 0 ? mix(P.andenJoint, P.hillHaze, 0.45) : mix(P.fields[Math.floor(y / 3) % P.fields.length], P.hillHaze, 0.42);
        } else if (hash2(x, y, 9) < 0.18) c = mix(P.valley[2], P.hillHaze, 0.42);
        b.set(x, y, c);
      }
    }
    // laderas laterales (más altas a los extremos del valle) con andenes
    for (x = 0; x < w; x++) {
      var u = x / w;
      var bump = Math.max(smooth((0.2 - u) / 0.2), smooth((u - 0.62) / 0.25), 0.25 + 0.2 * noise1(x * 0.03, 61));
      var tb = Math.round(114 - bump * 24 - fbm(x * 0.05, 63) * 6);
      var terraced = noise1(x * 0.02, 65) > 0.35;
      for (y = tb; y < LOW_H; y++) {
        var cc;
        if (y === tb) cc = mix(P.ichuRim, P.hillHaze, 0.25);
        else if (terraced && y - tb > 1) {
          var r2 = (y + Math.round(noise1(x * 0.05, 67) * 2)) % 4;
          if (r2 === 0) cc = ((x >> 1) & 1) ? P.andenWall : P.andenJoint;
          else if (r2 === 1) cc = P.andenShadow;
          else cc = P.fields[(Math.floor(y / 4) + (x > w / 2 ? 1 : 0)) % P.fields.length];
          cc = mix(cc, P.hillHaze, 0.22);
        } else {
          cc = P.ichu[Math.floor(hash2(x, y, 69) * 0.5 * P.ichu.length + noise1(x * 0.1, 70) * 0.5 * P.ichu.length) % P.ichu.length];
          cc = mix(cc, P.hillHaze, 0.25);
        }
        b.set(x, y, cc);
      }
    }
    // fondo del valle: chacras (parcelas)
    for (x = 0; x < w; x++) {
      var tv = 113 + Math.round(noise1(x * 0.05, 71) * 2);
      for (y = tv; y < LOW_H; y++) {
        var cell = hash2(Math.floor((x + y * 0.6) / 9), Math.floor(y / 3), 73);
        var fc = P.valley[Math.floor(cell * P.valley.length)];
        if (y === tv) fc = mix(fc, P.ichuRim, 0.4);
        if ((y % 3 === 0) && hash2(x, y, 75) < 0.3) fc = mix(fc, P.andenJoint, 0.4);
        b.set(x, y, mix(fc, P.hillHaze, 0.15));
      }
    }
    // ciudad del Cusco: canchas de piedra con techos de ichu; algunos ardiendo (asedio de 1536)
    var c0 = Math.floor(w * 0.18), c1 = Math.floor(w * 0.66), plaza0 = w * 0.37, plaza1 = w * 0.43;
    for (y = 117; y < 121; y++) for (x = Math.floor(plaza0); x < plaza1; x++) b.set(x, y, mix(P.plaza, P.hillHaze, 0.12));
    var rows = [114, 117, 120, 123, 126];
    for (var r = 0; r < rows.length; r++) {
      x = c0 + Math.floor(rng() * 4);
      while (x < c1) {
        if (x > plaza0 - 3 && x < plaza1 && r > 0 && r < 4) { x += 3; continue; }
        var bw = 4 + Math.floor(rng() * 4), wh = 2 + (r > 2 ? 1 : 0) + Math.floor(rng() * 2), rh = 2 + Math.floor(rng() * 2);
        var by = rows[r] + Math.floor(rng() * 2), burn = rng() < 0.2;
        drawHouse(b, x, by, bw, wh, rh, burn, 0.14 - r * 0.02);
        if (burn) burning.push({ x: x + (bw >> 1), y: by - wh - rh + 1 });
        x += bw + 1 + Math.floor(rng() * 4);
      }
      // muros de cancha (recintos)
      if (r === 2 || r === 4) for (x = c0; x < c1; x++) if (hash(x >> 3, 81 + r) < 0.6 && !(x > plaza0 - 3 && x < plaza1)) b.set(x, rows[r] + 2, mix(P.cityWallSh, P.hillHaze, 0.1));
    }
    // Qorikancha: recinto mayor con franja de oro
    var qx = Math.floor(w * 0.5), qy = 125;
    drawHouse(b, qx, qy, 13, 4, 3, false, 0.05);
    for (x = qx + 1; x < qx + 12; x++) b.set(x, qy - 3, P.gold);
    // humo: hasta 7 columnas repartidas
    burning.sort(function (a, c) { return a.x - c.x; });
    var step = Math.max(1, Math.floor(burning.length / 7));
    for (var s = 0; s < burning.length; s += step) {
      var e = burning[s];
      smokes.push({ x: e.x, y: e.y, seed: hash(s, 91), speed: 0.11 + hash(s, 92) * 0.06, height: 30 + hash(s, 93) * 22, drift: -10 - hash(s, 94) * 10 });
    }
    b.haze(P.hazeFar, 0.16, 0.25);
    return { canvas: b.toCanvas(), smokes: smokes, fires: burning };
  }
  function drawHouse(b, x, by, bw, wh, rh, burn, haze) {
    var y, i;
    for (y = by - wh + 1; y <= by; y++) for (i = 0; i < bw; i++)
      b.set(x + i, y, mix(i >= bw / 2 ? P.cityWall : P.cityWallSh, P.hillHaze, haze));
    if (bw >= 5) b.set(x + 1, by, P.door);
    for (var ry = 0; ry < rh; ry++) {
      var rw = bw + 1 - ry * 2, rx = x - 0.5 + ry;
      for (i = 0; i < rw; i++) {
        var px = Math.round(rx + i), py = by - wh - ry;
        var c = burn ? (hash2(px, py, 5) < 0.3 ? P.ember : P.burnt) : (i >= rw / 2 ? P.thatch : P.thatchSh);
        b.set(px, py, mix(c, P.hillHaze, burn ? haze * 0.5 : haze));
      }
    }
  }

  // ---------------------------------------------------------------- 4. Sacsayhuamán
  function buildMid(w) {
    var b = new Buf(w, LOW_H), x, y, i, rng = makeRng(303), smokes = [], banners = [];
    var hillA = 131 - Math.sin(0.32 * 14) * 3;
    function gTop(xx) {
      var u = xx / w, base;
      if (u < 0.32) base = 131 - Math.sin(u * 14) * 3 - 16 * Math.exp(-Math.pow((u - 0.12) / 0.06, 2));
      else if (u < 0.58) { var k = smooth((u - 0.32) / 0.26); base = hillA * (1 - k) + 76 * k; }
      else base = 76;
      return Math.round(base - fbm(xx * 0.05, 301) * 5 + 2);
    }
    var tops = new Array(w);
    for (x = 0; x < w; x++) tops[x] = gTop(x);

    // ladera de ichu (puna) y andenes al inicio
    for (x = 0; x < w; x++) {
      var u = x / w, top = tops[x], terr = u < 0.27 && noise1(x * 0.03, 305) > 0.3;
      for (y = top; y < LOW_H; y++) {
        var d = y - top, c;
        if (d === 0) c = P.ichuRim;
        else if (d === 1) c = P.ichuRim2;
        else if (terr && d >= 3) {
          var rm = (y + Math.round(noise1(x * 0.05, 307) * 2)) % 6;
          if (rm === 0) c = (hash((x + (Math.floor(y / 6) & 1) * 2) >> 2, 309) < 0.5) ? P.andenWall : mix(P.andenWall, P.stoneLight, 0.3);
          else if (rm === 1) c = P.andenShadow;
          else c = P.fields[(Math.floor(y / 6) + Math.floor(x / 90)) % P.fields.length];
          if (rm > 1 && hash2(x, y, 311) < 0.08) c = mix(c, P.ichuDeep, 0.4);
        } else {
          var nn = hash2(x, y, 313) * 0.5 + noise1(x * 0.08, 315) * 0.5;
          c = P.ichu[Math.floor(nn * P.ichu.length) % P.ichu.length];
          c = mix(c, P.ichuDeep, Math.min(0.35, d / 50));
        }
        b.set(x, y, c);
      }
    }
    // Qhapaq Ñan: camino inca que sube hacia la fortaleza
    for (x = Math.floor(w * 0.02); x < Math.floor(w * 0.56); x++) {
      var py = tops[x] + 5 + Math.round(Math.sin(x * 0.045) * 2.5 + 2.5);
      if (py > 144) continue;
      b.set(x, py, P.path); b.set(x, py + 1, P.path); b.set(x, py + 2, P.pathEdge);
      if (Math.abs(tops[x + 1] - tops[x]) > 0 && (x & 1)) b.set(x, py, P.pathEdge);
    }
    // qollqas (depósitos) en hileras sobre la ladera
    for (var row = 0; row < 2; row++) {
      for (x = Math.floor(w * 0.37) + row * 6; x < w * 0.5; x += 13) {
        var qy = tops[x] + 8 + row * 10;
        if (qy > 143) continue;
        drawQollqa(b, x, qy);
      }
    }
    // muros en zigzag: tres terrazas de piedra poligonal
    var tiers = [
      { bot: 150, h: 27, P: 36, ph: 0, s: 0.44, f: 0.52, st: stoneStyle(5, 13, 5, 10, 2, 2) },
      { bot: 117, h: 16, P: 30, ph: 9, s: 0.5, f: 0.57, st: stoneStyle(4, 10, 3, 7, 1, 1) },
      { bot: 97, h: 13, P: 24, ph: 4, s: 0.54, f: 0.6, st: stoneStyle(3, 8, 3, 6, 1, 1) }
    ];
    tiers.forEach(function (T, ti) {
      var x0 = Math.floor(w * T.s), ramp = function (xx) { return smooth((xx / w - T.s) / (T.f - T.s)); };
      function zig(xx) { var z = (((xx + T.ph) % T.P) + T.P) % T.P / T.P; return z; }
      var topFn = function (xx) {
        var r = ramp(xx), z = zig(xx), c = Math.abs(z - 0.5) * 2;
        return T.bot - T.h * r - Math.round(c * 5) + Math.round(noise1(xx * 0.3, 320 + ti) * 4 * (1 - r));
      };
      renderStones(b, x0, w, topFn, T.bot, T.st, 400 + ti * 17, function (xx, yy, col) {
        var z = zig(xx);
        if (z * T.P < 1) return mix(col, P.stoneLight, 0.35);                 // arista saliente
        if (z >= 0.5) return mix(col, P.wallShade, 0.58);
        if (z * T.P > T.P * 0.5 - 1) return mix(col, P.stoneJoint, 0.3);                      // cara en sombra
        return mix(col, P.cloudWarm, 0.08);                                    // cara iluminada (tarde)
      });
      // sombra proyectada en la terraza bajo el muro superior
      if (ti > 0) for (x = x0; x < w; x++) if (ramp(x) > 0.3) b.set(x, T.bot + 1, mix(b.get(x, T.bot + 1), P.stoneDeep, 0.4));
    });
    // portadas trapezoidales (tipo Tiopuncu) en el muro inferior
    [0.66, 0.84].forEach(function (u) { drawGate(b, Math.floor(w * u), 146); });
    // torres en la cima: Sallaq Marka (rect), Muyuq Marka (redonda), Paucar Marka
    drawRectTower(b, Math.floor(w * 0.74), 79, 14, 18, 501);
    smokes.push({ x: Math.floor(w * 0.74) + 7, y: 60, seed: 0.3, speed: 0.09, height: 42, drift: -14 });
    drawRoundTower(b, Math.floor(w * 0.86), 80, 9, 24);
    smokes.push({ x: Math.floor(w * 0.86), y: 56, seed: 0.7, speed: 0.08, height: 50, drift: -16 });
    drawRectTower(b, Math.floor(w * 0.95), 79, 11, 13, 507);
    // astas de las banderas españolas (las telas se animan por frame)
    [0.67, 0.8, 0.92, 0.985].forEach(function (u, k) {
      var bx = Math.floor(w * u), by = k % 2 ? 97 - 13 : 76;
      if (k === 0) by = 117 - 16;
      for (y = by - 15; y <= by; y++) b.set(bx, y, P.pole);
      b.set(bx, by - 16, P.gold);
      banners.push({ x: bx + 1, y: by - 15 });
    });
    // árboles nativos: queñua y molle (sin eucaliptos)
    var trees = [];
    for (i = 0; i < 26; i++) {
      var u2 = rng() * 0.56;
      x = Math.floor(u2 * w);
      var room = 143 - tops[x] - 4;
      if (room < 2) continue;
      trees.push({ x: x, y: tops[x] + 3 + Math.floor(rng() * Math.min(18, room)), molle: rng() < 0.45 });
    }
    trees.push({ x: Math.floor(w * 0.6), y: 115, molle: true });
    trees.push({ x: Math.floor(w * 0.71), y: 96, molle: false });
    trees.sort(function (a, c) { return a.y - c.y; });
    trees.forEach(function (t) { if (t.molle) drawMolle(b, t.x, t.y, rng); else drawQuenua(b, t.x, t.y, rng); });
    // matas de ichu
    for (i = 0; i < w * 0.9; i++) {
      x = Math.floor(rng() * w);
      var ty = tops[x] + 2 + Math.floor(rng() * 30);
      if (ty > 145 || x / w > 0.45 && ty > tops[x] + 4) continue;
      var lc = rng() < 0.5 ? P.tuft : P.tuftSh;
      b.set(x, ty, lc); b.set(x - 1, ty - 1, lc); b.set(x + 1, ty - 1, lc); b.set(x, ty - 2, P.tuft);
    }
    b.haze(P.hazeMid, 0.2, 0.3);
    return { canvas: b.toCanvas(), smokes: smokes, banners: banners };
  }
  function drawQollqa(b, x, y) {
    // depósito circular: muro de 7×4 con sombra a la izquierda, puerta y techo cónico de ichu
    var i, j;
    for (j = 0; j < 4; j++) for (i = 0; i < 7; i++) b.set(x + i, y - j, i >= 4 ? P.cityWall : (i === 0 ? P.stoneDark : P.cityWallSh));
    b.set(x + 3, y, P.door); b.set(x + 3, y - 1, P.door);
    var widths = [9, 7, 5, 3, 1];
    for (j = 0; j < widths.length; j++) for (i = 0; i < widths[j]; i++) {
      var px = x + 3 - (widths[j] >> 1) + i;
      b.set(px, y - 4 - j, j === 0 ? P.thatchSh : (px >= x + 3 ? P.thatch : P.thatchSh));
    }
  }
  function drawGate(b, cx, by) {
    var hgt = 15, y;
    for (y = 0; y < hgt; y++) {
      var half = Math.round(4 - y * 1.2 / hgt * 1.5);
      for (var i = -half; i <= half; i++) b.set(cx + i, by - y, y > hgt - 3 ? P.stoneJoint : P.door);
    }
    for (var k = -6; k <= 6; k++) { b.set(cx + k, by - hgt - 1, P.stoneLight); b.set(cx + k, by - hgt, P.stone[1]); b.set(cx + k, by - hgt + 1, P.stoneDark); }
  }
  function drawRectTower(b, cx, by, tw, th, seed) {
    var x0 = cx - (tw >> 1);
    renderStones(b, x0, x0 + tw, function (xx) { return by - th + Math.round(hash(xx, seed) * 2); }, by, stoneStyle(3, 5, 2, 3, 1, 0), seed,
      function (xx, yy, c) { return xx < cx ? mix(c, P.wallShade, 0.3) : c; });
    for (var k = 0; k < 2; k++) { var wx = x0 + 3 + k * (tw - 7); b.set(wx, by - th + 5, P.door); b.set(wx + 1, by - th + 5, P.door); b.set(wx, by - th + 6, P.door); b.set(wx + 1, by - th + 6, P.door); b.set(wx - 0, by - th + 4, P.door); }
    // techo de ichu quemado
    for (var j = 0; j < 4; j++) for (var i = -(tw >> 1) - 1 + j; i <= (tw >> 1) + 1 - j; i++)
      b.set(cx + i, by - th - 1 - j, hash2(i, j, seed) < 0.35 ? P.ember : (i > 0 ? P.thatchSh : P.burnt));
  }
  function drawRoundTower(b, cx, by, r, th) {
    for (var y = by - th; y <= by; y++) {
      var ragged = y - (by - th) < 3;
      for (var dx = -r; dx <= r; dx++) {
        if (ragged && hash(dx + 40, 611 + y) < 0.5) continue;
        var n = dx / r, course = Math.floor((by - y) / 2), off = (course & 1) * 2;
        var joint = (by - y) % 2 === 0 || Math.round(n * 6 + off) % 4 === 0 && Math.abs(n) < 0.9;
        var lum = clamp(0.55 + 0.5 * n - n * n * 0.3, 0, 1);
        var c = mix(P.stoneDeep, mix(P.stone[2], P.stoneLight, 0.4), lum);
        if (joint) c = mix(c, P.stoneJoint, 0.55);
        if (Math.abs(n) > 0.92) c = mix(c, P.stoneJoint, 0.4);
        b.set(cx + dx, y, c);
      }
    }
    // borde superior en ruinas: interior oscuro visto en elipse
    for (var ex = -r + 2; ex <= r - 2; ex++) if (hash(ex + 40, 611 + by - th + 3) >= 0.5) b.set(cx + ex, by - th + 3, P.stoneJoint);
    // ventanas trapezoidales
    [[-3, 8], [3, 8], [0, 15]].forEach(function (p) { for (var j = 0; j < 3; j++) { b.set(cx + p[0], by - th + p[1] + j, P.door); if (j > 0) b.set(cx + p[0] + 1, by - th + p[1] + j, P.door); } });
  }
  function drawQuenua(b, x, y) {
    var trunk = [[0, 0], [0, -1], [1, -2], [0, -3], [-1, -4], [1, -4], [2, -5]];
    trunk.forEach(function (p, i) { b.set(x + p[0], y + p[1], i & 1 ? P.tTrunkSh : P.tTrunk); });
    [[-2, -6, 2.6, 1.6], [2, -7, 2.6, 1.7], [0, -8.5, 2.2, 1.5]].forEach(function (cl) {
      b.ellipse(x + cl[0], y + cl[1], cl[2], cl[3], function (px, py, dx, dy) {
        return dy < -0.3 && dx > -0.2 ? P.qLeaf[0] : (dy > 0.4 ? P.qLeaf[2] : P.qLeaf[1]);
      });
    });
  }
  function drawMolle(b, x, y, rng) {
    for (var j = 0; j < 4; j++) b.set(x, y - j, P.mTrunk);
    b.set(x - 1, y - 4, P.mTrunk); b.set(x + 1, y - 4, P.mTrunk);
    b.ellipse(x, y - 7, 5.2, 3, function (px, py, dx, dy) {
      return dy < -0.35 && dx > -0.3 ? P.mLeaf[0] : (dy > 0.45 ? P.mLeaf[2] : P.mLeaf[1]);
    });
    // ramas colgantes (molle llorón) y bayas rosadas
    for (var i = -5; i <= 5; i++) if (hash(i + x, 707) < 0.55) {
      var len = 1 + Math.floor(hash(i + x, 708) * 3);
      for (var k = 1; k <= len; k++) b.set(x + i, y - 5 + k, P.mLeaf[2]);
    }
    for (var n = 0; n < 4; n++) b.set(x - 3 + Math.floor(rng() * 7), y - 8 + Math.floor(rng() * 4), P.berry);
  }

  // ---------------------------------------------------------------- suelo y plataformas
  var GROUND_STRIP_W = 512, GROUND_MARGIN = 5;
  function buildGroundStrip(hl) {
    var Wd = GROUND_STRIP_W, M = GROUND_MARGIN, b = new Buf(Wd, hl + M), x, y, rng = makeRng(901);
    var TAU = Math.PI * 2;
    for (x = 0; x < Wd; x++) {
      var gd = 3 + Math.floor(noise1(x * 0.12, 903, Math.round(Wd * 0.12)) * 3);
      var s1 = 14 + Math.round(Math.sin(TAU * x / Wd * 3) * 2), s2 = 26 + Math.round(Math.sin(TAU * x / Wd * 5 + 1) * 2);
      for (y = 0; y < hl; y++) {
        var c;
        if (y === 0) c = P.grassRim;
        else if (y < gd) c = P.grass[Math.floor(hash2(x, y, 905) * P.grass.length)];
        else if (y < gd + 2 && hash2(x, y, 907) < 0.45) c = P.grass[3];
        else {
          var n = hash2(x, y, 909);
          c = n < 0.3 ? P.earth[0] : n < 0.8 ? P.earth[1] : P.earth[2];
          if (y === s1 || y === s2) c = P.earthDark;
          var deep = clamp(y / hl, 0, 1) * 0.55;
          c = mix(c, P.earthDeep, Math.floor(deep * 4 + bayer(x, y)) / 4);
        }
        b.set(x, y + M, c);
      }
    }
    // piedrecitas
    for (var k = 0; k < 70; k++) {
      x = Math.floor(rng() * (Wd - 3)); y = M + 5 + Math.floor(rng() * Math.max(1, hl - 8));
      var pw = 2 + Math.floor(rng() * 2), ph = 1 + Math.floor(rng() * 2);
      b.fill(x, y, pw, ph, P.pebble); b.set(x, y, P.stoneLight); b.fill(x, y + ph, pw, 1, P.pebbleSh);
    }
    // matas de ichu sobresaliendo del borde
    for (x = 2; x < Wd - 3; x += 6 + Math.floor(rng() * 12)) {
      var hgt = 2 + Math.floor(rng() * 4), col = rng() < 0.5 ? P.tuft : P.tuftSh;
      for (var j = 1; j <= hgt; j++) { b.set(x, M - j, col); if (j < hgt - 1) { b.set(x - Math.ceil(j / 2), M - j + 1, P.tuftSh); b.set(x + Math.ceil(j / 2), M - j + 1, col); } }
    }
    return b.toCanvas();
  }
  function buildPlatform(cw, ch, seed) {
    // Capa jugable: piedra más cálida y clara que los muros del fondo (que llevan bruma),
    // contorno oscuro de 1 px (3 px en pantalla) y labio superior iluminado con pasto.
    var b = new Buf(cw, ch);
    renderStones(b, 1, cw - 1, function () { return 2; }, ch - 1, stoneStyle(4, 9, 3, 6, 1, 1), seed, function (xx, yy, c) {
      c = mix(c, P.platWarm, 0.22);
      return mix(c, P.stoneDeep, Math.floor(clamp(yy / ch, 0, 1) * 0.45 * 4 + bayer(xx, yy)) / 4);
    });
    for (var x = 0; x < cw; x++) {
      b.set(x, 0, P.platOutline);
      b.set(x, 1, hash(x, seed) < 0.3 ? P.grassRim : P.stoneLight);
      b.set(x, 2, mix(P.stone[2], P.stoneLight, 0.55));
      b.set(x, 3, mix(b.get(x, 3), P.stoneLight, 0.2));
      b.set(x, ch - 1, P.platOutline);
    }
    for (var y = 0; y < ch; y++) {
      b.set(0, y, P.platOutline); b.set(cw - 1, y, P.platOutline);
      if (y > 1 && y < ch - 1) { b.set(1, y, mix(b.get(1, y), P.stoneLight, 0.35)); b.set(cw - 2, y, mix(b.get(cw - 2, y), P.stoneJoint, 0.45)); }
    }
    // matas de ichu en el borde superior (no tapan la cara de colisión: se dibujan sobre y=1)
    for (x = 3; x < cw - 3; x += 7 + Math.floor(hash(x, seed + 3) * 9)) { b.set(x, 1, P.tuft); b.set(x + 1, 1, P.tuftSh); }
    return b.toCanvas();
  }

  // ---------------------------------------------------------------- caché
  var cache = null, groundCache = {}, platCache = {}, lastScale = 3;
  function prepare(opts) {
    opts = opts || {};
    var W = opts.width || 960, H = opts.height || 540, L = opts.levelLength || 4200;
    var key = W + 'x' + H + 'x' + L;
    if (cache && cache.key === key) return cache;
    var S = H / LOW_H, lw = Math.ceil(W / S), range = Math.max(0, L - W);
    function layerW(f) { return Math.ceil((W + f * range) / S) + 4; }
    var mf = buildMidFar(layerW(PARALLAX.midfar)), mid = buildMid(layerW(PARALLAX.mid));
    cache = {
      key: key, W: W, H: H, L: L, S: S, lw: lw, range: range,
      sky: buildSky(lw),
      clouds: [buildCloud(3, 46, 12), buildCloud(5, 30, 9), buildCloud(8, 62, 14), buildCloud(13, 24, 7), buildCloud(21, 40, 10)],
      condor: [buildCondor(0), buildCondor(1)],
      far: buildFar(layerW(PARALLAX.far)),
      midfar: mf.canvas, mfSmokes: mf.smokes, mfFires: mf.fires,
      mid: mid.canvas, midSmokes: mid.smokes, banners: mid.banners
    };
    lastScale = S;
    return cache;
  }

  // ---------------------------------------------------------------- dibujo por frame
  function blit(ctx, cv, off, S, W) {
    var sx = Math.floor(off / S), dx = -(off - sx * S);
    var sw = Math.min(cv.width - sx, Math.ceil((W - dx) / S) + 1);
    if (sw <= 0) return;
    ctx.drawImage(cv, sx, 0, sw, cv.height, Math.round(dx), 0, sw * S, cv.height * S);
  }
  function drawSmoke(ctx, em, sx, sy, S, t) {
    var N = 12;
    for (var i = 0; i < N; i++) {
      var a = (t * em.speed + i / N + em.seed) % 1;
      var size = 2 + Math.floor(a * 4);
      var dx = Math.round(a * a * em.drift + Math.sin(t * 0.8 + i * 1.7 + em.seed * 6) * 1.5 * a - size / 2);
      var dy = Math.round(-a * em.height - size / 2);
      ctx.globalAlpha = (1 - a) * 0.7;
      ctx.fillStyle = css(P.smoke[Math.min(3, Math.floor(a * 4))]);
      ctx.fillRect(sx + dx * S, sy + dy * S, size * S, size * S);
      if (size > 1) ctx.fillRect(sx + (dx + 1) * S, sy + (dy - 1) * S, (size - 1) * S, S);
    }
    ctx.globalAlpha = 1;
  }
  function drawBanner(ctx, sx, sy, S, t, k) {
    // Cruz de Borgoña: aspa roja irregular sobre blanco (estandarte de los Austrias)
    for (var c = 0; c < 8; c++) {
      var wave = Math.round(Math.sin(t * 4 + c * 0.8 + k) * 0.8 * (c / 7));
      for (var r = 0; r < 5; r++) {
        if (c === 7 && (r === 0 || r === 4) && Math.sin(t * 5 + k) > 0) continue;
        var d1 = Math.abs(r - c * 4 / 7), d2 = Math.abs(r - (4 - c * 4 / 7));
        var col = d1 < 0.7 || d2 < 0.7 ? P.flagR : (wave < 0 ? P.flagWSh : P.flagW);
        ctx.fillStyle = css(col);
        ctx.fillRect(sx + c * S, sy + (r + wave) * S, S, S);
      }
    }
  }

  function drawBackground(ctx, cameraX, timeSeconds, opts) {
    opts = opts || {};
    var cv = ctx.canvas || {};
    var W = opts.width || cv.width || 960, H = opts.height || cv.height || 540;
    var C = prepare({ width: W, height: H, levelLength: opts.levelLength || 4200 });
    var S = C.S, t = timeSeconds || 0, cam = clamp(cameraX || 0, 0, C.range);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 1. cielo
    ctx.drawImage(C.sky, 0, 0, C.sky.width, C.sky.height, 0, 0, C.sky.width * S, C.sky.height * S);
    var wrap = C.lw + 90;
    var cloudDefs = [[0, 10, 1.1], [1, 24, 0.7], [2, 4, 0.9], [3, 34, 0.5], [4, 17, 0.8]];
    for (var i = 0; i < cloudDefs.length; i++) {
      var cd = cloudDefs[i], img = C.clouds[cd[0]];
      var cx = (((i * 97 - t * cd[2] - cam * PARALLAX.cloud / S) % wrap) + wrap) % wrap - 70;
      ctx.drawImage(img, 0, 0, img.width, img.height, Math.round(cx) * S, cd[1] * S, img.width * S, img.height * S);
    }
    // 2. Apus
    blit(ctx, C.far, Math.round(cam * PARALLAX.far), S, W);
    // cóndor: planea cada ~45 s durante ~22 s
    var cyc = t % 45;
    if (cyc < 22) {
      var k = cyc / 22, dir = Math.floor(t / 45) % 2 ? -1 : 1;
      var px = dir > 0 ? -20 + k * (C.lw + 40) : C.lw + 20 - k * (C.lw + 40);
      px -= cam * PARALLAX.condor / S;
      var py = 30 + Math.sin(k * Math.PI * 2) * 8 + Math.sin(t * 0.7) * 2;
      var fr = C.condor[Math.sin(t * 1.3) > 0.85 ? 1 : 0];
      ctx.drawImage(fr, 0, 0, fr.width, fr.height, Math.round(px) * S, Math.round(py) * S, fr.width * S, fr.height * S);
    }
    // 3. valle del Cusco + humo e incendios
    var offMF = Math.round(cam * PARALLAX.midfar);
    blit(ctx, C.midfar, offMF, S, W);
    var f8 = Math.floor(t * 8);
    for (i = 0; i < C.mfFires.length; i++) {
      var fe = C.mfFires[i], fx = Math.round(fe.x * S - offMF);
      if (fx < -S * 2 || fx > W) continue;
      var hf = hash(f8 + i * 13, 17);
      ctx.fillStyle = css(hf < 0.5 ? P.fire1 : P.fire2);
      ctx.fillRect(fx + (hf < 0.3 ? -S : 0), Math.round(fe.y * S) - S, S, S);
    }
    for (i = 0; i < C.mfSmokes.length; i++) {
      var sm = C.mfSmokes[i], ssx = Math.round(sm.x * S - offMF);
      if (ssx < -80 || ssx > W + 80) continue;
      drawSmoke(ctx, sm, ssx, Math.round(sm.y * S), S, t);
    }
    // 4. Sacsayhuamán
    var offM = Math.round(cam * PARALLAX.mid);
    blit(ctx, C.mid, offM, S, W);
    for (i = 0; i < C.banners.length; i++) {
      var bn = C.banners[i], bx = Math.round(bn.x * S - offM);
      if (bx < -10 * S || bx > W) continue;
      drawBanner(ctx, bx, Math.round(bn.y * S), S, t, i);
    }
    for (i = 0; i < C.midSmokes.length; i++) {
      var ms = C.midSmokes[i], mx = Math.round(ms.x * S - offM);
      if (mx < -80 || mx > W + 80) continue;
      drawSmoke(ctx, ms, mx, Math.round(ms.y * S), S, t);
    }
    ctx.restore();
  }

  // 5. primer plano: ichu meciéndose, piedras y cantutas (coordenadas de pantalla)
  function drawForeground(ctx, cameraX, timeSeconds, opts) {
    opts = opts || {};
    var cv = ctx.canvas || {};
    var W = opts.width || cv.width || 960, H = opts.height || cv.height || 540;
    var S = H / LOW_H, t = timeSeconds || 0, off = (cameraX || 0) * PARALLAX.fg / S, sp = 11;
    var k0 = Math.floor((off - 20) / sp), k1 = Math.ceil((off + W / S + 20) / sp);
    ctx.save();
    for (var k = k0; k <= k1; k++) {
      var h0 = hash(k, 77);
      if (h0 > 0.5) continue;
      var type = hash(k, 78), bx = Math.round((k * sp + hash(k, 79) * 7 - off) * S);
      if (type < 0.66) {
        var n = 4 + Math.floor(hash(k, 80) * 4), sway = Math.sin(t * 1.6 + k * 0.7) * 1.3 + Math.sin(t * 2.7 + k) * 0.4;
        for (var bl = 0; bl < n; bl++) {
          var lean = (bl - (n - 1) / 2) * 0.45, len = 5 + Math.floor(hash(k * 31 + bl, 81) * 7) - Math.abs(Math.round(lean * 2));
          ctx.fillStyle = css(P.fgIchu[bl % 3]);
          var runX = null, runY0 = 0;
          for (var s = 1; s <= len + 1; s++) {
            var pxs = s <= len ? Math.round(lean * s * 0.55 + sway * (s / len) * (s / len)) : null;
            if (pxs !== runX) {
              if (runX !== null) ctx.fillRect(bx + runX * S, H - (s - 1) * S, S, (s - runY0) * S);
              runX = pxs; runY0 = s;
            }
          }
        }
      } else if (type < 0.86) {
        var sw = 4 + Math.floor(hash(k, 82) * 4);
        ctx.fillStyle = css(P.fgStone);
        ctx.fillRect(bx, H - 3 * S, sw * S, 3 * S);
        ctx.fillRect(bx + S, H - 4 * S, (sw - 2) * S, S);
        ctx.fillStyle = css(P.fgStoneLit);
        ctx.fillRect(bx + 2 * S, H - 4 * S, (sw - 3) * S, S);
      } else {
        var sh = 7 + Math.floor(hash(k, 83) * 4), sv = Math.round(Math.sin(t * 1.4 + k) * 0.6);
        ctx.fillStyle = css(P.fgStem);
        ctx.fillRect(bx, H - sh * S, S, sh * S);
        ctx.fillRect(bx + sv * S + S, H - (sh - 1) * S, S, S);
        ctx.fillRect(bx - S, H - (sh - 3) * S, S, S);
        for (var fl = 0; fl < 3; fl++) {
          var fx = bx + (fl - 1) * 2 * S + sv * S, fy = H - (sh - fl * 2 - 1) * S;
          ctx.fillStyle = css(P.cantuta[fl % 3]);
          ctx.fillRect(fx, fy, S, 3 * S);
          ctx.fillStyle = css(P.cantutaTip);
          ctx.fillRect(fx, fy + 3 * S, S, S);
        }
      }
    }
    ctx.restore();
  }

  // Suelo: coordenadas de MUNDO (dentro de ctx.translate(-cam,0)). Tierra apisonada + pasto/ichu.
  function drawGround(ctx, x, y, w, h, cameraX) {
    var S = lastScale, hl = Math.ceil(h / S);
    var strip = groundCache[hl] || (groundCache[hl] = buildGroundStrip(hl));
    var viewW = (ctx.canvas && ctx.canvas.width) || 960, cam = cameraX || 0;
    var xs = Math.max(x, cam - S * 2), xe = Math.min(x + w, cam + viewW + S * 2);
    if (xe <= xs) return;
    var period = GROUND_STRIP_W * S;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    var X = x + Math.floor((xs - x) / S) * S;
    while (X < xe) {
      var local = (X - x) % period, sx = Math.floor(local / S);
      var n = Math.min(GROUND_STRIP_W - sx, Math.ceil((xe - X) / S));
      if (n <= 0) break;
      ctx.drawImage(strip, sx, 0, n, strip.height, X, y - GROUND_MARGIN * S, n * S, strip.height * S);
      X += n * S;
    }
    ctx.restore();
  }

  // Plataforma de piedra poligonal inca: coordenadas de MUNDO. (x,y)=esquina sup. izq.;
  // la cara superior está exactamente en y (coincide con la colisión de game.js).
  function drawPlatform(ctx, x, y, w, h, cameraX) {
    var viewW = (ctx.canvas && ctx.canvas.width) || 960, cam = cameraX || 0;
    if (cameraX !== undefined && (x + w < cam - 10 || x > cam + viewW + 10)) return;
    var S = lastScale, cw = Math.max(3, Math.ceil(w / S)), ch = Math.max(3, Math.ceil(h / S));
    var key = Math.round(x) + ',' + cw + ',' + ch;
    var cvs = platCache[key] || (platCache[key] = buildPlatform(cw, ch, 1000 + Math.round(x) * 7 + cw));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cvs, 0, 0, cw, ch, Math.round(x), Math.round(y), cw * S, ch * S);
    ctx.restore();
  }

  root.ChankasBackground = {
    drawBackground: drawBackground,
    drawForeground: drawForeground,
    drawGround: drawGround,
    drawPlatform: drawPlatform,
    drawStoneBlock: drawPlatform,
    prepare: prepare,
    PARALLAX: PARALLAX,
    LOW_H: LOW_H
  };
})(typeof window !== 'undefined' ? window : this);

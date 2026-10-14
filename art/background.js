/*
 * art/background.js — CHANKAS · Fondo pixel-art andino (Sacsayhuamán / Cusco, 1536)
 *
 * Script clásico (sin módulos). Expone window.ChankasBackground.
 *
 * Todo se dibuja a resolución interna (alto 270 px) en buffers offscreen y se escala con
 * imageSmoothingEnabled=false (×2 para un canvas de 960×540). Las capas estáticas se
 * pre-renderizan UNA vez (por tamaño/levelLength); por frame solo se hacen unos pocos
 * drawImage (capas, nubes sueltas, cóndor, cascada, estandartes y humo).
 *
 * Recorrido (por cameraX): andenes verdes y estandarte del Inti al inicio → quebrada con
 * cascada y puente de madera → campamento español (torre, tiendas, cruz de Borgoña) delante
 * de los muros en zigzag de Sacsayhuamán en la arena del jefe.
 *
 * Coordenadas:
 *  - drawBackground / drawForeground: coordenadas de PANTALLA (llamar sin translate).
 *  - drawGround / drawPlatform: coordenadas de MUNDO (llamar dentro de ctx.translate(-cam,0),
 *    igual que game.js dibuja el suelo y las plataformas). cameraX solo se usa para culling.
 */
(function (root) {
  'use strict';

  var LOW_H = 270;
  // Profundidad: capas lejanas casi quietas y capa media más rápida (paralaje más marcado).
  var PARALLAX = { far: 0.05, midfar: 0.24, mid: 0.56, fg: 1.45, cloud: 0.03, condor: 0.06 };

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
  function noise2(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y, seed) { return noise2(x, y, seed) * 0.55 + noise2(x * 2.1, y * 2.1, seed + 5) * 0.3 + noise2(x * 4.3, y * 4.3, seed + 11) * 0.15; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  // escoge un tono de una rampa con tramado ordenado (v en 0..1)
  function ramp(arr, v, x, y) {
    var f = clamp(v, 0, 1) * (arr.length - 1), i = Math.floor(f);
    return arr[Math.min(arr.length - 1, f - i > bayer(x, y) ? i + 1 : i)];
  }

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
    x = clamp(Math.floor(x), 0, this.w - 1); y = clamp(Math.floor(y), 0, this.h - 1);
    var i = (y * this.w + x) * 4, d = this.d;
    return [d[i], d[i + 1], d[i + 2]];
  };
  Buf.prototype.tint = function (x, y, c, t) { if (this.has(x, y)) this.set(x, y, mix(this.get(x, y), c, t)); };
  Buf.prototype.fill = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  Buf.prototype.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 2000; n++) {
      this.set(x0, y0, typeof c === 'function' ? c(x0, y0) : c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  Buf.prototype.ellipse = function (cx, cy, rx, ry, colorFn) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, typeof colorFn === 'function' ? colorFn(x, y, dx, dy) : colorFn);
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
  // Perspectiva atmosférica: acerca una capa al color de la bruma y le quita saturación.
  Buf.prototype.haze = function (col, amt, desat, y0, y1, extra) {
    var d = this.d, w = this.w;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var a = amt;
      if (extra) { var y = ((i >> 2) / w) | 0; a += smooth((y - y0) / (y1 - y0)) * extra; }
      var r = d[i], g = d[i + 1], bl = d[i + 2], l = r * 0.3 + g * 0.59 + bl * 0.11;
      r += (l - r) * desat; g += (l - g) * desat; bl += (l - bl) * desat;
      d[i] = r + (col[0] - r) * a; d[i + 1] = g + (col[1] - g) * a; d[i + 2] = bl + (col[2] - bl) * a;
    }
    return this;
  };

  // ---------------------------------------------------------------- paleta andina (tarde clara)
  var P = (function () {
    var src = {
      sky: ['#2c68c2', '#3471c8', '#3d7bce', '#4785d3', '#5390d8', '#5f9bdc', '#6ca5e0', '#7aafe3', '#89b9e7', '#98c3ea', '#a8cced', '#b7d5ef', '#c5ddf1', '#d2e4f2'],
      sunGlow: '#fff3d2',
      cloud: ['#8a93b0', '#a8b0c6', '#c9cddb', '#e6e6ea', '#fbf8f1', '#ffecc4'],
      snow: ['#7486b4', '#93a6cd', '#b7c6e1', '#dfe6f2', '#ffffff'],
      rock: ['#3f3a58', '#524a68', '#6b5f76', '#877379', '#a48a82'],
      rangeA: ['#4e6ea6', '#5a7bb0', '#6888ba', '#7896c4', '#89a5cd'],
      rangeB: ['#355f7c', '#3f6b85', '#4b7890', '#5b879a', '#6e98a3'],
      rangeC: ['#2f5a3c', '#3b6a42', '#4c7c46', '#65904c', '#82a656'],
      haze: '#b4cde6', hazeWarm: '#cfd8c8',
      hill: ['#33461f', '#43592a', '#566e30', '#6d8636', '#869c3e', '#a2b04a', '#c0c25c'],
      field: ['#7a8a34', '#8f9c3a', '#a7aa44', '#bfb752', '#d6c766'],
      terrWall: ['#7a776d', '#87837a', '#6c6a63', '#949086', '#81796c'], terrWallLit: '#c9c1aa', terrWallDk: '#45433e', terrJoint: '#38362f',
      cliff: ['#3d3634', '#4f4642', '#655953', '#7f6f63', '#9a8670', '#b39e80'],
      water: ['#2f6aa8', '#3f7fbc', '#5d9ad0', '#8bbde2', '#c6e2f4', '#ffffff'],
      wood: ['#2e1f15', '#4a3220', '#66472c', '#86603a', '#a57b4a'],
      canvas: ['#7e7b78', '#a9a59d', '#cfcac0', '#ebe7dd', '#fbf9f3'],
      flagW: '#f2eee4', flagWSh: '#c9c2b4', flagR: '#b3202a', flagRSh: '#7e1620',
      incaR: '#b5262a', incaRSh: '#7a1719', incaRLt: '#d8473a', gold: '#f2c23a', goldSh: '#b07f1a', goldLt: '#ffe58a',
      pole: '#4a3526', poleLt: '#7a5a3a',
      condor: '#1c1719', condorMid: '#3a3133', condorWhite: '#e8e2d6', condorHead: '#c47a5e',
      stone: ['#5b5a57', '#666460', '#545558', '#6d6860', '#5f5b56', '#73706a'], stoneLight: '#aaa597', stoneDark: '#343437', stoneJoint: '#1c1c1f', lichen: '#8c9c48',
      sacsa: ['#a8a296', '#b6af9f', '#9a958b', '#aea692', '#bdb5a3'], sacsaLight: '#e2dbc8', sacsaDark: '#6c6860', sacsaJoint: '#4a4741',
      grass: ['#d8cf5e', '#b9b746', '#98a33a', '#76882f', '#566a27', '#3f5021'],
      tuft: '#d0c752', tuftSh: '#93a036', tuftDk: '#5a7228',
      smoke: ['#5b5651', '#7d776f', '#a19b92', '#c4beb4'],
      fgGrass: ['#4f6420', '#6a7f28', '#8c9a32', '#b2b444', '#d6cc5c'], fgStone: '#47453f', fgStoneLit: '#7a756a', fgStem: '#3f5a22',
      cantuta: ['#a8264f', '#c2386a', '#b83a2e'], cantutaTip: '#e9b23a',
      tree: ['#1f361c', '#2b4a24', '#3b622c', '#507c34', '#6b963e'], trunk: '#4e3524',
      platOutline: '#16130f'
    };
    var o = {};
    for (var k in src) o[k] = Array.isArray(src[k]) ? src[k].map(hex) : hex(src[k]);
    return o;
  })();

  // ---------------------------------------------------------------- piedra poligonal inca
  /*
   * Rellena un muro de piedras poligonales encajadas: hiladas irregulares con bordes
   * inclinados, juntas finas, aristas almohadilladas y luz de tarde (arriba a la izquierda).
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
        while (i > nx) { vx = nx; vy = ny; nx = Math.min(n, vx + 3 + Math.floor(rng() * 8)); ny = yb + Math.round(rng() * 2 * jit - jit); }
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
            // almohadillado: arista superior/izquierda con luz, inferior/derecha en sombra
            if (dy === 1) col = mix(col, st.light, 0.6);
            else if (dy === 2) col = mix(col, st.light, 0.22);
            else if (dyb === 0) col = mix(col, st.dark, 0.55);
            else if (dyb === 1) col = mix(col, st.dark, 0.22);
            if (dl === 1) col = mix(col, st.light, 0.4);
            else if (dl === 2) col = mix(col, st.light, 0.12);
            else if (dr === 0) col = mix(col, st.dark, 0.45);
            var hs = hash2(x0 + i, y, seed + 3);
            if (hs < 0.05) col = mix(col, st.dark, 0.3);
            else if (hs > 0.975) col = mix(col, st.lichen, 0.4);
            else if (hs > 0.92) col = mix(col, st.light, 0.2);
            if (dy > 2 && dyb > 1 && dl > 2 && dr > 0)
              col = mix(col, st.dark, bayer(x0 + i, y) < t * 0.5 ? 0.14 : 0);
          }
          if (y === tops[i] && col !== st.joint) col = mix(col, st.light, 0.35);
          if (shadeFn) col = shadeFn(x0 + i, y, col);
          b.set(x0 + i, y, col);
        }
      }
    }
  }
  function stoneStyle(minW, maxW, minH, maxH, slant, jit, pal) {
    pal = pal || 'stone';
    var s = pal === 'sacsa'
      ? { tones: P.sacsa, light: P.sacsaLight, dark: P.sacsaDark, joint: P.sacsaJoint }
      : { tones: P.stone, light: P.stoneLight, dark: P.stoneDark, joint: P.stoneJoint };
    s.minW = minW; s.maxW = maxW; s.minH = minH; s.maxH = maxH; s.slant = slant; s.jit = jit; s.lichen = P.lichen;
    return s;
  }

  // ---------------------------------------------------------------- nubes volumétricas
  var LIGHT = (function () { var x = -0.55, y = -0.62, z = 0.56, l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();
  function paintCumulus(b, cx, baseY, wid, hgt, seed, hazeAmt, hazeCol) {
    var r = makeRng(seed), blobs = [], n = Math.max(4, Math.round(wid / 6)), i;
    for (i = 0; i < n; i++) {
      var u = r() * 2 - 1, env = Math.sqrt(Math.max(0, 1 - u * u * 0.92));
      var rad = hgt * (0.2 + 0.45 * env) * (0.7 + 0.3 * r());
      blobs.push({ x: cx + u * wid * 0.5, y: baseY - rad * (0.45 + 0.3 * r()) - env * hgt * 0.3, r: rad });
    }
    var nb = blobs.length;
    for (i = 0; i < nb; i++) if (r() < 0.7) {
      var B = blobs[i], a = -Math.PI * (0.15 + 0.7 * r());
      blobs.push({ x: B.x + Math.cos(a) * B.r * 0.75, y: B.y + Math.sin(a) * B.r * 0.75, r: B.r * (0.32 + 0.22 * r()) });
    }
    var X0 = Math.floor(cx - wid / 2 - hgt), X1 = Math.ceil(cx + wid / 2 + hgt), Y0 = Math.floor(baseY - hgt * 1.7);
    for (var y = Math.max(0, Y0); y <= baseY + 1 && y < b.h; y++) for (var x = Math.max(0, X0); x <= X1 && x < b.w; x++) {
      if (y > baseY + (noise1(x * 0.25, seed) - 0.5) * 3) continue;
      var best = -1, nx = 0, ny = 0;
      for (i = 0; i < blobs.length; i++) {
        var Bb = blobs[i], dx = (x + 0.5 - Bb.x) / Bb.r, dy = (y + 0.5 - Bb.y) / Bb.r, q = 1 - dx * dx - dy * dy;
        if (q > best) { best = q; nx = dx; ny = dy; }
      }
      if (best < 0) continue;
      var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      var lum = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) * 0.5 + 0.5;
      var kb = (y - (baseY - hgt * 0.5)) / (hgt * 0.5);
      if (kb > 0) lum -= kb * 0.38;
      lum += (fbm2(x * 0.15, y * 0.15, seed) - 0.5) * 0.12;
      var c = ramp(P.cloud.slice(0, 5), lum * 1.12 - 0.08, x, y);
      if (best < 0.09 && lum > 0.62) c = P.cloud[5];
      if (hazeAmt) c = mix(c, hazeCol, hazeAmt);
      b.set(x, y, c);
    }
  }

  // ---------------------------------------------------------------- cordilleras
  /*
   * Picos con arista: cada columna pertenece al pico más alto; la cara izquierda recibe luz
   * y la derecha queda en sombra. Las costillas (paralelas a la pendiente) rompen las caras
   * y, con opts.snow, la nieve baja por las canaletas.
   */
  function paintPeaks(b, peaks, o) {
    var w = b.w, H = b.h;
    for (var x = 0; x < w; x++) {
      var top = 1e9, p = null;
      for (var k = 0; k < peaks.length; k++) {
        var q = peaks[k], dx = x - q.x;
        var tv = q.y + Math.abs(dx) * (dx < 0 ? q.sl : q.sr);
        if (tv < top) { top = tv; p = q; }
      }
      top += (fbm(x * 0.05, o.seed) - 0.5) * o.jag + (noise1(x * 0.4, o.seed + 3) - 0.5) * o.jag * 0.35;
      top = Math.round(top);
      if (top >= H) continue;
      for (var y = Math.max(0, top); y < H; y++) {
        var depth = y - p.y;
        var ridge = p.x + depth * p.skew + (noise1(y * 0.09, o.seed + p.i * 5) - 0.5) * 7 * Math.min(1, depth / 30);
        var lit = x < ridge;
        var s = lit ? x + depth / p.sl : x - depth / p.sr;
        var f = fbm(s * 0.11, o.seed + 17 + p.i);
        var rib = lit ? f > 0.6 : f > 0.64;
        var tex = fbm2(x * 0.12, y * 0.12, o.seed + 31);
        var c;
        var snowLine = p.snow ? p.y + p.snow + (fbm(x * 0.04, o.seed + 9) - 0.5) * 24 : -1;
        var snowy = p.snow && (y < snowLine || (f < 0.42 && y < snowLine + 34 * (0.42 - f) / 0.42) || (y < snowLine + 4 && bayer(x, y) < (snowLine + 4 - y) / 4));
        if (snowy) {
          if (lit) c = rib ? P.snow[2] : (tex > 0.6 ? P.snow[3] : P.snow[4]);
          else c = (x - ridge < 2.5) ? P.snow[0] : (rib ? P.snow[2] : (tex > 0.58 ? P.snow[2] : P.snow[1]));
        } else {
          var pal = o.pal;
          if (lit) c = rib ? pal[2] : ramp(pal.slice(2), 0.35 + (tex - 0.5) * 1.4 + (y === top ? 0.5 : 0), x, y);
          else c = rib ? pal[2] : ramp(pal.slice(0, 3), (tex - 0.3) * 1.2, x, y);
        }
        if (o.green && !snowy) {
          var gv = smooth((y - (o.green - 20 + (fbm(x * 0.03, o.seed + 41) - 0.5) * 30)) / 28);
          if (gv > bayer(x, y)) c = mix(c, lit ? P.rangeC[3] : P.rangeC[1], 0.55);
        }
        var hz = o.haze + smooth((y - o.hy0) / (o.hy1 - o.hy0)) * o.hazeBot;
        if (hz > 0) c = mix(c, o.hazeCol || P.haze, hz);
        b.set(x, y, c);
      }
    }
  }
  function peakList(rng, w, base, spacing, hmin, hmax, slope, snow) {
    var arr = [], x = -20 - rng() * spacing[0], i = 0;
    while (x < w + 60) {
      var h = hmin + rng() * (hmax - hmin);
      arr.push({ i: i++, x: x, y: base - h, sl: slope[0] + rng() * slope[1], sr: slope[0] + rng() * slope[1], skew: (rng() - 0.5) * 0.3, snow: snow ? snow[0] + rng() * snow[1] : 0 });
      x += spacing[0] + rng() * spacing[1];
    }
    return arr;
  }

  // ---------------------------------------------------------------- 1. cielo, nubes y Apus
  function buildFar(w) {
    var b = new Buf(w, LOW_H), stops = P.sky, n = stops.length, x, y;
    var sunX = -30, sunY = -10;
    for (y = 0; y < LOW_H; y++) {
      var t = Math.min(1, Math.pow(y / 205, 1.05)), f = t * (n - 1), i0 = Math.floor(f), fr = f - i0;
      for (x = 0; x < w; x++) {
        var c = stops[fr > bayer(x, y) ? Math.min(n - 1, i0 + 1) : i0];
        var dx = x - sunX, dy = (y - sunY) * 1.4, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 170) {
          var g = 1 - d / 170; g *= g;
          var lv = Math.floor(g * 5 + bayer(x, y));
          if (lv > 0) c = mix(c, P.sunGlow, lv * 0.12);
        }
        b.set(x, y, c);
      }
    }
    // cúmulos altos (arriba a la izquierda, como en el arte clave) y un par a la derecha
    paintCumulus(b, 30, 62, 120, 46, 101, 0, null);
    paintCumulus(b, 95, 92, 110, 34, 103, 0.04, P.haze);
    paintCumulus(b, Math.round(w * 0.72), 40, 60, 16, 105, 0.05, P.haze);
    paintCumulus(b, Math.round(w * 0.93), 70, 70, 20, 107, 0.05, P.haze);
    // Apus: Salkantay piramidal dominante y cordillera nevada
    var rng = makeRng(11), peaks = peakList(rng, w, 168, [70, 70], 45, 85, [0.9, 0.5], [30, 26]);
    var sx = Math.round(w * 0.47);
    peaks = peaks.filter(function (p) { return Math.abs(p.x - sx) > 70; });
    peaks.push({ i: 99, x: sx, y: 14, sl: 0.92, sr: 0.8, skew: 0.08, snow: 84 });
    peaks.push({ i: 98, x: sx - 52, y: 66, sl: 1.1, sr: 1.0, skew: -0.1, snow: 34 });
    peaks.push({ i: 97, x: sx + 58, y: 58, sl: 0.9, sr: 0.9, skew: 0.12, snow: 36 });
    paintPeaks(b, peaks, { seed: 21, jag: 9, pal: P.rock, haze: 0.04, hy0: 110, hy1: 200, hazeBot: 0.45 });
    // banco de nubes al pie de las montañas
    for (var k = 0; k < 9; k++) {
      var cxk = Math.round((k / 8) * w + (hash(k, 109) - 0.5) * 40);
      paintCumulus(b, cxk, 168 + Math.round(hash(k, 110) * 12), 70 + hash(k, 111) * 50, 26 + hash(k, 112) * 18, 120 + k, 0.08, P.haze);
    }
    return b.toCanvas();
  }
  function buildCloudSprite(seed, w, h) {
    var b = new Buf(w, h);
    paintCumulus(b, w / 2, h - 2, w * 0.62, h * 0.8, seed, 0, null);
    return b.toCanvas();
  }
  // cóndor andino planeando (alas con dedos y banda blanca)
  function buildCondor(frame) {
    var w = 31, h = 13, b = new Buf(w, h), cx = 15, cy = 6;
    var lift = [0, -0.18, 0.12][frame];
    for (var side = -1; side <= 1; side += 2) {
      for (var a = 1; a <= 14; a++) {
        var y = cy - Math.round(a * lift + (a > 9 ? (a - 9) * 0.25 : 0) * (frame === 1 ? -1 : 1));
        var th = a < 4 ? 3 : a < 9 ? 2 : 1;
        for (var j = 0; j < th; j++) b.set(cx + side * a, y + j - (a < 4 ? 1 : 0), P.condor);
        if (a >= 3 && a <= 8) b.set(cx + side * a, y + (a < 4 ? 0 : 1), P.condorWhite);
        if (a >= 11 && (a & 1)) b.set(cx + side * a, y + 1, P.condor);
        if (a >= 12 && !(a & 1)) b.set(cx + side * (a + 1), y - 1, P.condorMid);
      }
    }
    b.ellipse(cx, cy + 1, 3, 2, P.condor);
    b.set(cx + 3, cy, P.condorWhite); b.set(cx + 4, cy, P.condorWhite);
    b.set(cx + 5, cy, P.condorHead); b.set(cx + 6, cy + 1, P.condorHead);
    b.set(cx - 4, cy + 1, P.condorMid); b.set(cx - 5, cy + 2, P.condor);
    return b.toCanvas();
  }

  // ---------------------------------------------------------------- 2. cordilleras azul-verdes
  function buildMidFar(w) {
    var b = new Buf(w, LOW_H), rng = makeRng(77);
    paintPeaks(b, peakList(rng, w, 205, [80, 110], 55, 100, [0.55, 0.6], null),
      { seed: 51, jag: 12, pal: P.rangeA, haze: 0.1, hy0: 140, hy1: 210, hazeBot: 0.35 });
    for (var k = 0; k < 10; k++)
      paintCumulus(b, Math.round((k / 9) * w + (hash(k, 201) - 0.5) * 60), 172 + Math.round(hash(k, 202) * 14), 40 + hash(k, 203) * 60, 12 + hash(k, 204) * 12, 220 + k, 0.1, P.haze);
    paintPeaks(b, peakList(rng, w, 228, [70, 90], 35, 72, [0.45, 0.5], null),
      { seed: 61, jag: 10, pal: P.rangeB, haze: 0.03, hy0: 170, hy1: 240, hazeBot: 0.25, green: 196 });
    paintPeaks(b, peakList(rng, w, 250, [60, 70], 20, 46, [0.35, 0.35], null),
      { seed: 71, jag: 6, pal: P.rangeC, haze: 0.0, hy0: 210, hy1: 260, hazeBot: 0.12 });
    // arbolitos y parcelas lejanas sobre las lomas verdes
    for (var i = 0; i < w * 0.35; i++) {
      var x = Math.floor(rng() * w), y = 214 + Math.floor(rng() * 40);
      if (!b.has(x, y)) continue;
      var c = b.get(x, y);
      if (c[1] < c[2] + 5) continue;
      b.set(x, y, P.tree[1]); b.set(x + 1, y, P.tree[0]); b.set(x, y - 1, P.tree[2]);
    }
    return { canvas: b.toCanvas(), smokes: [] };
  }

  // ---------------------------------------------------------------- 3. capa media (recorrido)
  function paintTree(b, x, y, s, seed) {
    for (var j = 0; j < s; j++) b.set(x, y - j, P.trunk);
    var r = makeRng(seed), n = 3 + Math.floor(s / 2);
    for (var k = 0; k < n; k++) {
      var cx = x + (r() - 0.5) * s * 1.4, cy = y - s - (r() * s * 0.8), rr = s * (0.45 + r() * 0.3);
      b.ellipse(cx, cy, rr, rr * 0.8, function (px, py, dx, dy) {
        var l = -dx * 0.6 - dy * 0.8 + (hash2(px, py, seed) - 0.5) * 0.6;
        return ramp(P.tree, 0.45 + l * 0.45, px, py);
      });
    }
  }
  // Andenes: bandas que siguen el contorno de la loma (pasto + muro de piedra con luz de tarde).
  function paintTerraces(b, x0, x1, topFn, seed) {
    var T = 13, WH = 5, top0 = topFn(x0);
    for (var x = x0; x < x1; x++) {
      var top = Math.round(topFn(x)), bend = Math.round((top - top0) * 0.6 + Math.sin(x * 0.021 + seed) * 2.2 + (fbm(x * 0.012, seed + 40) - 0.5) * 14);
      for (var y = Math.max(0, top); y < LOW_H; y++) {
        var d = y - top, yi = y - bend, k = Math.floor(yi / T), ph = yi - k * T, c;
        if (d < 2) c = ramp(P.hill, 0.98 - d * 0.2, x, y);
        else if (ph < T - WH) {
          var base = 0.5 + (hash(k, seed) - 0.5) * 0.45 + (noise1(x * 0.05, seed + k) - 0.5) * 0.3;
          var fv = ph === 0 ? base - 0.35 : ph === T - WH - 1 ? 1.05 : base + (ph < 3 ? -0.08 : 0.06);
          c = ramp(P.field, fv, x, y);
          if (ph > 0 && ph < T - WH - 1 && ((x + k * 3) % 6 === 0)) c = mix(c, P.hill[3], 0.35);
          if (ph > 1 && hash2(x, y, seed + 3) < 0.05) c = P.hill[3];
        } else {
          var r = ph - (T - WH), row = k * 2 + (r > 1 ? 1 : 0), bw = 4 + Math.floor(hash(row, seed + 7) * 4);
          var sh = hash(row, seed) * 20, bx = Math.floor((x + sh) / bw), edge = Math.floor((x - 1 + sh) / bw) !== bx;
          c = P.terrWall[Math.floor(hash2(bx, row, seed) * P.terrWall.length)];
          if (r === 0) c = P.terrWallLit;
          else if (r === WH - 1) c = P.terrWallDk;
          else if (edge) c = P.terrJoint;
          else if (r === 1) c = mix(c, P.terrWallLit, 0.3);
        }
        if (d >= 2 && d < 5) c = mix(c, P.hill[5], 0.3);
        b.set(x, y, c);
      }
    }
  }
  // Farallón rocoso con estratos, grietas y pasto en la cima. edgeR/edgeL(y): bordes hacia la quebrada.
  function paintCliff(b, x0, x1, topFn, seed, edgeR, edgeL) {
    for (var x = x0; x < x1; x++) {
      var top = Math.round(topFn(x));
      for (var y = Math.max(0, top); y < LOW_H; y++) {
        var er = edgeR ? edgeR(y) : 1e9, el = edgeL ? edgeL(y) : -1e9;
        if (x > er || x < el) continue;
        var d = y - top, c;
        if (d < 3) c = ramp(P.hill, 0.9 - d * 0.18, x, y);
        else if (d < 7 && hash(x, seed) < 0.6 - (d - 3) * 0.15) c = P.hill[2 + (hash(x, seed + 1) < 0.5 ? 1 : 0)];
        else {
          var strata = fbm2(x * 0.03, y * 0.25, seed), tx = fbm2(x * 0.18, y * 0.18, seed + 3);
          var v = 0.42 + (strata - 0.5) * 0.7 + (tx - 0.5) * 0.4;
          if (noise1(x * 0.3, seed + 5) > 0.84 && noise1(y * 0.2, seed + 6) > 0.3) v -= 0.35;
          if (er - x < 10) v -= (10 - (er - x)) / 10 * 0.5;
          if (x - el < 6) v += (6 - (x - el)) / 6 * 0.3;
          if (x === Math.round(er)) v = 0;
          c = ramp(P.cliff, v, x, y);
          if (hash2(x, y, seed + 7) < 0.015) c = P.hill[3];
        }
        b.set(x, y, c);
      }
    }
  }
  function paintPole(b, x, y0, y1) {
    for (var y = y0; y <= y1; y++) { b.set(x, y, P.pole); b.set(x + 1, y, P.poleLt); }
    b.ellipse(x + 1, y0 - 1, 1.6, 1.6, P.gold);
  }
  function paintTent(b, cx, by, w, h) {
    var apex = by - h;
    for (var y = apex; y <= by; y++) {
      var t = (y - apex) / h, half = w / 2 * (0.12 + 0.88 * Math.pow(t, 0.8)) + (t > 0.85 ? (t - 0.85) * 8 : 0);
      for (var x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        var u = (x - cx) / Math.max(1, half);
        var v = 0.75 - u * 0.45 - t * 0.1;
        if (Math.abs(Math.round(u * 4)) % 2 === 1 && Math.abs(u * 4 - Math.round(u * 4)) < 0.12) v -= 0.18;
        var c = ramp(P.canvas, v, x, y);
        if (Math.abs(y - (apex + h * 0.42)) < 1) c = P.flagR;
        if (y === by) c = P.canvas[0];
        b.set(x, y, c);
      }
    }
    // entrada abierta
    for (var j = 0; j < h * 0.45; j++) for (var i = -j * 0.35; i <= j * 0.12; i++) b.set(Math.round(cx + 2 + i), by - Math.round(h * 0.45) + j, j < 2 ? P.canvas[1] : P.wood[0]);
    b.set(cx, apex - 1, P.pole); b.set(cx, apex - 2, P.pole); b.set(cx + 1, apex - 2, P.flagR); b.set(cx + 2, apex - 2, P.flagR);
  }
  function paintTower(b, cx, by) {
    var platY = by - 64, i, y;
    var legs = [[-11, 1], [11, 1], [-8, 0], [8, 0]];
    legs.forEach(function (l) {
      for (y = platY; y <= by; y++) {
        var lx = Math.round(cx + l[0] + (l[0] < 0 ? -1 : 1) * (y - platY) * 0.06);
        b.set(lx, y, l[1] ? P.wood[3] : P.wood[1]); b.set(lx + 1, y, l[1] ? P.wood[2] : P.wood[0]);
      }
    });
    for (var s = platY + 4; s < by - 6; s += 18) {
      b.line(cx - 11, s, cx + 11, s + 16, P.wood[2]); b.line(cx + 11, s, cx - 11, s + 16, P.wood[1]);
      b.line(cx - 11, s, cx + 12, s, P.wood[3]);
    }
    // plataforma y barandilla de tablas
    for (y = platY - 10; y <= platY; y++) for (i = -15; i <= 15; i++) {
      var c = (i + 15) % 4 === 0 ? P.wood[1] : (i < 4 ? P.wood[3] : P.wood[2]);
      if (y === platY - 10) c = P.wood[4];
      if (y === platY) c = P.wood[0];
      b.set(cx + i, y, c);
    }
    // techo a cuatro aguas
    for (y = 0; y < 14; y++) {
      var half = 2 + y * 1.35;
      for (i = -half; i <= half; i++) b.set(Math.round(cx + i), platY - 26 + y, i < -half * 0.2 ? P.wood[2] : (((i + y) & 3) === 0 ? P.wood[0] : P.wood[1]));
    }
    for (i = -14; i <= 14; i += 7) for (y = platY - 13; y < platY - 10; y++) b.set(cx + i, y, P.wood[1]);
    // escalera
    for (y = platY; y < by; y++) { b.set(cx + 4, y, P.wood[3]); b.set(cx + 8, y, P.wood[3]); if (y % 4 === 0) b.line(cx + 4, y, cx + 8, y, P.wood[4]); }
    paintPole(b, cx, platY - 52, platY - 26);
    return { x: cx + 2, y: platY - 50 };
  }
  function paintBridge(b, x0, x1, y, riverY) {
    var x, j;
    // pilares y tornapuntas de madera
    [0.3, 0.7].forEach(function (u) {
      var px = Math.round(x0 + (x1 - x0) * u);
      for (j = y + 3; j < riverY; j++) { b.set(px, j, P.wood[2]); b.set(px + 1, j, P.wood[1]); }
      b.line(px, y + 4, px - 12, y + 18, P.wood[1]); b.line(px + 1, y + 4, px + 13, y + 18, P.wood[1]);
    });
    b.line(x0 + 2, y + 3, x0 + 14, y + 22, P.wood[1]); b.line(x1 - 2, y + 3, x1 - 14, y + 22, P.wood[1]);
    for (x = x0; x <= x1; x++) {
      b.set(x, y, (x % 3 === 0) ? P.wood[2] : P.wood[4]);
      b.set(x, y + 1, (x % 3 === 0) ? P.wood[1] : P.wood[3]);
      b.set(x, y + 2, P.wood[1]); b.set(x, y + 3, P.wood[0]);
      var sag = Math.round(Math.sin((x - x0) / (x1 - x0) * Math.PI) * 2);
      b.set(x, y - 7 + sag, P.wood[3]);
      if ((x - x0) % 9 === 0) for (j = y - 7; j < y; j++) b.set(x, j, P.wood[2]);
      if ((x - x0) % 3 === 0) b.set(x, y - 4 + sag, P.wood[1]);
    }
  }
  // media anchura de la cascada (se abre al caer); la usan la capa estática y la animación
  function fallHalf(yy) { return 8 * (0.45 + 0.55 * smooth(yy / 16)) + (noise1(yy * 0.3, 345) - 0.5) * 1.6; }
  function paintWaterfall(b, x0, x1, y0, y1, seed) {
    var cx = (x0 + x1) / 2;
    for (var x = x0 - 6; x < x1 + 6; x++) { b.set(x, y0 - 1, P.cliff[1]); b.set(x, y0 - 2, P.hill[3]); }
    for (var y = y0; y < y1; y++) {
      var hw = fallHalf(y - y0);
      for (var x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
        var u = (x - (cx - hw)) / (2 * hw), streak = noise1(x * 0.8, seed) * 0.6 + noise2(x * 0.5, y * 0.08, seed) * 0.5;
        var v = 0.45 + streak * 0.6 - Math.abs(u - 0.5) * 0.7;
        b.set(x, y, ramp(P.water.slice(1), v, x, y));
      }
    }
  }
  function paintRiver(b, x0, x1, y0, y1, seed) {
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      var v = 0.3 + (y - y0) / (y1 - y0) * 0.3 + (noise2(x * 0.15, y * 0.6, seed) - 0.5) * 0.7;
      var foam = noise2(x * 0.3, y * 1.1, seed + 3) > 0.72;
      b.set(x, y, foam ? P.water[4] : ramp(P.water, v, x, y));
    }
  }

  function buildMid(w) {
    var b = new Buf(w, LOW_H), x, y, i, rng = makeRng(303), smokes = [], banners = [], incas = [], falls = [];
    var gL = Math.round(w * 0.40), gc = Math.round(w * 0.505), cS = Math.round(w * 0.655);
    var gapL = gc - 44, gapR = gc + 44, riverY = 206, deckY = 150;
    // --- valle verde y ladera de fondo (todo el ancho)
    for (x = 0; x < w; x++) {
      var vt = Math.round(200 + (fbm(x * 0.02, 301) - 0.5) * 10);
      for (y = vt; y < LOW_H; y++) {
        var c = ramp(P.hill, 0.75 - (y - vt) * 0.03 + (fbm2(x * 0.06, y * 0.1, 302) - 0.5) * 0.5, x, y);
        if (y === vt) c = P.hill[6];
        b.set(x, y, c);
      }
    }
    // --- 1. andenes en la ladera izquierda
    var tx1 = Math.round(w * 0.27);
    function tTop(xx) { var u = xx / tx1; return 40 + 170 * Math.pow(u, 1.25) - 14 * Math.exp(-Math.pow((u - 0.35) / 0.12, 2)) + (fbm(xx * 0.025, 305) - 0.5) * 12; }
    paintTerraces(b, 0, tx1, tTop, 7);
    for (i = 0; i < 30; i++) {
      x = Math.floor(rng() * tx1 * 0.97);
      var ty = Math.round(tTop(x)) + 4 + Math.floor(rng() * 70);
      if (ty > 206) continue;
      paintTree(b, x, ty, 3 + Math.floor(rng() * 3), 500 + i);
    }
    // estandarte inca del Inti (asta en el pie de los andenes)
    var bx = Math.round(w * 0.165);
    paintPole(b, bx, 112, 214);
    incas.push({ x: bx + 2, y: 116 });
    // --- 2. quebrada: ladera brumosa al fondo, cascada, río, farallones y puente
    for (x = gapL - 60; x < gapR + 60; x++) {
      var bt = Math.round(120 + Math.abs(x - gc) * 0.3 + (fbm(x * 0.05, 331) - 0.5) * 12);
      for (y = bt; y < LOW_H; y++) {
        var bc = ramp(P.hill, 0.62 - (y - bt) * 0.01 + (fbm2(x * 0.07, y * 0.09, 332) - 0.5) * 0.5, x, y);
        if (y - bt > 5 && fbm2(x * 0.05, y * 0.12, 333) > 0.56) bc = ramp(P.cliff, 0.3 + (fbm2(x * 0.2, y * 0.2, 334) - 0.5), x, y);
        b.set(x, y, mix(bc, P.rangeB[3], 0.4));
      }
    }
    paintWaterfall(b, gc - 8, gc + 8, FALL_Y, riverY, 340);
    falls.push({ x: gc - 8, y: FALL_Y });
    paintRiver(b, gapL - 40, gapR + 40, riverY, LOW_H, 350);
    for (i = 0; i < 40; i++) b.ellipse(gc + (rng() - 0.5) * 30, riverY - 1 + rng() * 4, 2 + rng() * 3, 1.5 + rng(), P.water[4 + (rng() < 0.5 ? 1 : 0)]);
    function lcTop(xx) { return 150 + (fbm(xx * 0.08, 360) - 0.5) * 8 + Math.max(0, 14 - (xx - gL)) * 1.5; }
    function rcTop(xx) { return 148 + (fbm(xx * 0.08, 370) - 0.5) * 8 + smooth((xx - (cS - 70)) / 60) * 46; }
    paintCliff(b, gL - 10, gapL + 16, lcTop, 361, function (yy) { return gapL + 4 - (yy - deckY) * 0.1 + (noise1(yy * 0.3, 362) - 0.5) * 4; }, null);
    paintCliff(b, gapR - 16, cS - 4, rcTop, 371, null, function (yy) { return gapR - 4 + (yy - deckY) * 0.1 + (noise1(yy * 0.3, 372) - 0.5) * 4; });
    paintBridge(b, gapL - 8, gapR + 8, deckY, riverY);
    for (i = 0; i < 6; i++) paintTree(b, gL + 6 + i * 18 + Math.floor(rng() * 8), Math.round(lcTop(gL + 6 + i * 18)) + 2, 3 + Math.floor(rng() * 3), 600 + i);
    for (i = 0; i < 5; i++) { x = gapR + 14 + i * 22 + Math.floor(rng() * 8); if (x < cS - 60) paintTree(b, x, Math.round(rcTop(x)) + 2, 3 + Math.floor(rng() * 3), 650 + i); }
    // --- 3. Sacsayhuamán: loma con muros en zigzag tras el campamento
    for (x = cS - 50; x < w; x++) {
      var ht = Math.round(150 - smooth((x - (cS - 50)) / 90) * 10 + (fbm(x * 0.011, 380) - 0.5) * 50 + (fbm(x * 0.05, 382) - 0.5) * 8);
      if (x < cS) ht += (cS - x) * 1.2;
      for (y = Math.max(ht, 0); y < 200; y++) {
        var hc = ramp(P.hill, (y - ht < 2 ? 1 : 0.78) - (y - ht) * 0.012 + (fbm2(x * 0.08, y * 0.1, 381) - 0.5) * 0.45, x, y);
        if (y - ht > 4 && fbm2(x * 0.04, y * 0.08, 383) > 0.6) hc = ramp(P.tree, 0.45 + (hash2(x, y, 384) - 0.5) * 0.6, x, y);
        b.set(x, y, mix(hc, P.rangeB[3], 0.28));
      }
    }
    var tiers = [
      { bot: 198, h: 18, Pz: 28, ph: 0, st: stoneStyle(5, 12, 4, 8, 2, 1, 'sacsa') },
      { bot: 177, h: 13, Pz: 22, ph: 9, st: stoneStyle(4, 9, 3, 6, 1, 1, 'sacsa') }
    ];
    tiers.forEach(function (T, ti) {
      var x0 = cS + 6 + ti * 16;
      function zig(xx) { return ((((xx + T.ph) % T.Pz) + T.Pz) % T.Pz) / T.Pz; }
      renderStones(b, x0, w, function (xx) {
        var z = zig(xx), cc = Math.abs(z - 0.5) * 2, r = smooth((xx - x0) / 30);
        return T.bot - T.h * r - Math.round(cc * 5);
      }, T.bot, T.st, 400 + ti * 17, function (xx, yy, col) {
        var z = zig(xx);
        if (z * T.Pz < 1) return mix(col, P.sacsaLight, 0.3);
        if (z >= 0.5) return mix(col, P.sacsaDark, 0.42);
        return mix(col, P.sunGlow, 0.06);
      });
      for (x = x0; x < w; x++) b.tint(x, T.bot + 1, P.hill[0], 0.4);
    });
    // --- 4. campamento español: empalizada, tiendas, torre y estandartes
    var cw = w - cS;
    for (x = cS + 8; x < w; x++) {
      if (((x - cS) % 140) > 100) continue;
      var stake = (x % 3), hh = 13 + Math.round(hash(x >> 1, 390) * 3);
      if (stake === 2) continue;
      for (y = 214 - hh; y < 214; y++) b.set(x, y, y === 214 - hh ? P.wood[4] : (stake ? P.wood[1] : P.wood[3]));
    }
    for (x = cS + 8; x < w; x++) if (((x - cS) % 140) <= 100) { b.set(x, 203, P.wood[0]); b.set(x, 209, P.wood[0]); }
    var tentXs = [0.1, 0.2, 0.31, 0.7, 0.8, 0.92];
    tentXs.forEach(function (u, k) { paintTent(b, Math.round(cS + cw * u), 206 - (k % 2) * 3, 26 + (k % 3) * 6, 24 + (k % 2) * 6); });
    var tower = paintTower(b, Math.round(cS + cw * 0.52), 212);
    banners.push({ x: tower.x, y: tower.y });
    [0.42, 0.62, 0.985].forEach(function (u, k) {
      var px = Math.round(cS + cw * u), top = 128 + k * 6;
      paintPole(b, px, top, 212);
      banners.push({ x: px + 2, y: top + 2 });
    });
    smokes.push({ x: Math.round(cS + cw * 0.37), y: 196, seed: 0.3, speed: 0.09, height: 60, drift: -22 });
    smokes.push({ x: Math.round(cS + cw * 0.86), y: 192, seed: 0.7, speed: 0.08, height: 70, drift: -26 });
    b.haze(P.haze, 0.03, 0.05);
    return { canvas: b.toCanvas(), smokes: smokes, banners: banners, incas: incas, falls: falls };
  }

  // ---------------------------------------------------------------- suelo y plataformas
  var GROUND_STRIP_W = 512, GROUND_MARGIN = 8, FALL_Y = 126, FALL_H = 206 - FALL_Y;
  function grassLip(b, x0, x1, y0, seed, deep) {
    for (var x = x0; x < x1; x++) {
      var hang = 2 + Math.floor(noise1(x * 0.25, seed, Math.round((x1 - x0) * 0.25)) * (deep || 4));
      if (hash(x, seed + 1) < 0.12) hang += 2;
      for (var j = 0; j <= hang; j++) {
        var v = 1 - j / (hang + 1);
        b.set(x, y0 + j, j === 0 ? P.grass[0] : ramp(P.grass.slice(1, 5), v, x, y0 + j));
      }
    }
  }
  function tufts(b, x0, x1, baseY, seed, density) {
    var r = makeRng(seed);
    for (var x = x0 + 2; x < x1 - 3; x += 2 + Math.floor(r() * density)) {
      var n = 2 + Math.floor(r() * 3);
      for (var k = 0; k < n; k++) {
        var hgt = 3 + Math.floor(r() * 6), lean = (k - (n - 1) / 2) * 0.5 + (r() - 0.5) * 0.4;
        var col = k % 3 === 0 ? P.tuft : k % 3 === 1 ? P.tuftSh : P.grass[1];
        for (var j = 1; j <= hgt; j++) b.set(x + k + Math.round(lean * j * 0.6), baseY - j, j > hgt - 2 ? P.grass[0] : col);
      }
    }
  }
  function buildGroundStrip(hl) {
    var Wd = GROUND_STRIP_W, M = GROUND_MARGIN, b = new Buf(Wd, hl + M);
    // muro de piedra inca (bloques grandes) — se repite cada Wd sin costura visible
    renderStones(b, 0, Wd, function () { return M + 2; }, hl + M - 1, stoneStyle(9, 20, 7, 13, 2, 2), 905, function (xx, yy, c) {
      return mix(c, P.stoneDark, Math.floor(clamp((yy - M) / hl, 0, 1) * 0.5 * 4 + bayer(xx, yy)) / 4);
    });
    for (var y = M + 2; y < hl + M; y++) b.set(0, y, P.stoneJoint);
    grassLip(b, 0, Wd, M, 907, 5);
    tufts(b, 0, Wd, M, 909, 9);
    return b.toCanvas();
  }
  function buildPlatform(cw, ch, seed) {
    // Capa jugable: muro de piedra poligonal oscuro con contorno, arista superior iluminada y pasto.
    var M = 6, b = new Buf(cw, ch + M);
    renderStones(b, 1, cw - 1, function () { return M + 1; }, ch + M - 1, stoneStyle(7, 15, 6, 11, 1, 1), seed, function (xx, yy, c) {
      return mix(c, P.stoneDark, Math.floor(clamp((yy - M) / ch, 0, 1) * 0.45 * 4 + bayer(xx, yy)) / 4);
    });
    for (var y = M; y < ch + M; y++) {
      b.set(0, y, P.platOutline); b.set(cw - 1, y, P.platOutline);
      if (y > M + 1) { b.tint(1, y, P.stoneLight, 0.35); b.tint(cw - 2, y, P.stoneJoint, 0.45); }
    }
    for (var x = 0; x < cw; x++) { b.set(x, M, P.platOutline); b.set(x, ch + M - 1, P.platOutline); }
    grassLip(b, 1, cw - 1, M, seed + 5, 3);
    tufts(b, 1, cw - 1, M, seed + 9, 10);
    return b.toCanvas();
  }

  // ---------------------------------------------------------------- caché
  var cache = null, groundCache = {}, platCache = {}, lastScale = 2;
  function prepare(opts) {
    opts = opts || EMPTY_OPTS;
    var W = opts.width || 960, H = opts.height || 540, L = opts.levelLength || 4200;
    var key = W + 'x' + H + 'x' + L;
    if (cache && cache.key === key) return cache;
    var S = H / LOW_H, lw = Math.ceil(W / S), range = Math.max(0, L - W);
    function layerW(f) { return Math.ceil((W + f * range) / S) + 4; }
    prepareAnimated();
    var mf = buildMidFar(layerW(PARALLAX.midfar)), mid = buildMid(layerW(PARALLAX.mid));
    cache = {
      key: key, W: W, H: H, L: L, S: S, lw: lw, range: range,
      clouds: [buildCloudSprite(3, 64, 22), buildCloudSprite(5, 44, 16), buildCloudSprite(8, 80, 26)],
      condor: [buildCondor(0), buildCondor(1), buildCondor(2)],
      far: buildFar(layerW(PARALLAX.far)),
      midfar: mf.canvas,
      mid: mid.canvas, midSmokes: mid.smokes, banners: mid.banners, incas: mid.incas, falls: mid.falls
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
      ctx.globalAlpha = (1 - a) * 0.6;
      var puff = animated.smoke[Math.min(3, Math.floor(a * 4))][size - 2];
      ctx.drawImage(puff, sx + dx * S, sy + (dy - 1) * S, size * S, (size + 1) * S);
    }
    ctx.globalAlpha = 1;
  }
  // Cruz de Borgoña: aspa roja de troncos nudosos sobre blanco (estandarte de los Austrias)
  function rasterBanner(ctx, ph) {
    var Wf = 14, Hf = 20;
    for (var c = 0; c < Wf; c++) {
      var wave = Math.sin(ph + c * 0.55) * 1.2 * (c / (Wf - 1));
      var wy = Math.round(wave);
      for (var r = 0; r < Hf; r++) {
        if (c === Wf - 1 && (r % 5 === 0) && Math.sin(ph * 1.3) > 0) continue;
        var u = c / (Wf - 1), v = r / (Hf - 1);
        var d1 = Math.abs(v - u), d2 = Math.abs(v - (1 - u));
        var knot = (Math.floor(r / 3) % 2) ? 0.02 : 0;
        var red = d1 < 0.085 + knot || d2 < 0.085 + knot;
        var shade = Math.cos(ph + c * 0.55) < -0.3;
        var col = red ? (shade ? P.flagRSh : P.flagR) : (shade ? P.flagWSh : P.flagW);
        ctx.fillStyle = css(col);
        ctx.fillRect(c, r + wy + 2, 1, 1);
      }
    }
  }
  // Estandarte inca: paño rojo con borde de oro y el Inti (sol de oro con rayos)
  function rasterInca(ctx, ph) {
    var Wf = 22, Hf = 32, cx = 10.5, cy = 13;
    for (var c = 0; c < Wf; c++) {
      var sway = Math.sin(ph + c * 0.3) * 0.8 * (c / Wf);
      for (var r = 0; r < Hf; r++) {
        var bottomCut = r > Hf - 4 && Math.abs(c - (Wf - 1) / 2) < (r - (Hf - 4)) * 2.2;
        if (bottomCut) continue;
        var dx = c - cx, dy = r - cy, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
        var col = P.incaR;
        if (c === 0 || c === Wf - 1 || r === 0) col = P.goldSh;
        else if (c === 1 || c === Wf - 2 || r === 1) col = P.gold;
        else if (r > Hf - 7 && r < Hf - 5) col = P.gold;
        else if (d < 4.2) col = d < 1.5 ? P.goldLt : P.gold;
        else if (d < 5.2) col = P.goldSh;
        else if (d < 8.5 && Math.cos(a * 12) > 0.35 - (d - 5) * 0.08) col = d < 7 ? P.gold : P.goldSh;
        else if (Math.sin(ph + c * 0.3) < -0.4) col = P.incaRSh;
        else if (c < 4) col = P.incaRLt;
        if (d < 3.6 && (Math.abs(dy + 0.8) < 0.6 && Math.abs(Math.abs(dx) - 1.4) < 0.6)) col = P.goldSh; // ojos del Inti
        if (d < 3.6 && Math.abs(dy - 1.6) < 0.5 && Math.abs(dx) < 1.3) col = P.goldSh; // boca
        ctx.fillStyle = css(col);
        ctx.fillRect(c, Math.round(r + sway) + 1, 1, 1);
      }
    }
    ctx.fillStyle = css(P.pole); ctx.fillRect(0, 0, Wf, 1);
  }
  function rasterFall(ctx, w, h, ph) {
    for (var x = 0; x < w; x++) for (var y = 0; y < h; y++) {
      var hw = fallHalf(y);
      if (x < Math.round(w / 2 - hw) || x >= Math.round(w / 2 + hw)) continue;
      var v = hash2(x, Math.floor((((y - ph * h / 6) % h) + h) % h / 3), 77);
      if (v > 0.78) { ctx.fillStyle = css(v > 0.92 ? P.water[5] : P.water[4]); ctx.fillRect(x, y, 1, 1); }
    }
    for (x = 0; x < w; x++) {
      var m = hash2(x, ph, 79);
      if (m > 0.35) { ctx.fillStyle = css(m > 0.7 ? P.water[5] : P.water[4]); ctx.fillRect(x, h - 3 + Math.round(m * 3), 1, 1); }
    }
  }

  var animated = null;
  var FG_W = 960, FG_H = 24;
  function prepareAnimated() {
    if (animated) return animated;
    var a = { banners: [], incas: [], falls: [], foreground: [], smoke: [] };
    for (var phase = 0; phase < 12; phase++) {
      var ph = phase / 12 * Math.PI * 2;
      var banner = makeCanvas(14, 24), bc = banner.getContext('2d');
      if (bc) rasterBanner(bc, ph);
      a.banners.push(banner);
      var inca = makeCanvas(22, 34), ic = inca.getContext('2d');
      if (ic) rasterInca(ic, ph);
      a.incas.push(inca);
      var fg = makeCanvas(FG_W, FG_H), fc = fg.getContext('2d');
      if (fc) rasterForeground(fc, ph / 1.6, FG_W, FG_H);
      a.foreground.push(fg);
    }
    for (var f = 0; f < 6; f++) {
      var fall = makeCanvas(16, FALL_H + 4), fl = fall.getContext('2d');
      if (fl) rasterFall(fl, 16, FALL_H, f);
      a.falls.push(fall);
    }
    for (var tone = 0; tone < 4; tone++) {
      var row = [];
      for (var size = 2; size <= 5; size++) {
        var puff = makeCanvas(size, size + 1), pc = puff.getContext('2d');
        if (pc) { pc.fillStyle = css(P.smoke[tone]); pc.fillRect(0, 1, size, size); pc.fillRect(1, 0, size - 1, 1); }
        row.push(puff);
      }
      a.smoke.push(row);
    }
    animated = a;
    return a;
  }
  function phaseOf(t, speed, k) { var p = Math.floor((t * speed + k) / (Math.PI * 2) * 12); return ((p % 12) + 12) % 12; }

  // primer plano: pasto meciéndose, piedras y cantutas (tira pre-renderizada a resolución interna)
  function rasterForeground(ctx, t, Wd, Hh) {
    var sp = 9;
    for (var k = -2; k * sp < Wd + 20; k++) {
      var id = ((k % 107) + 107) % 107;
      if (hash(id, 77) > 0.62) continue;
      var type = hash(id, 78), bx = Math.round(k * sp + hash(id, 79) * 6);
      bx = ((bx % Wd) + Wd) % Wd;
      if (type < 0.7) {
        var n = 4 + Math.floor(hash(id, 80) * 5), sway = Math.sin(t * 1.6 + id * 0.7) * 1.4 + Math.sin(t * 3.2 + id) * 0.4;
        for (var bl = 0; bl < n; bl++) {
          var lean = (bl - (n - 1) / 2) * 0.5, len = 8 + Math.floor(hash(id * 31 + bl, 81) * 12) - Math.abs(Math.round(lean * 2));
          for (var s = 1; s <= len; s++) {
            var px = bx + Math.round(lean * s * 0.5 + sway * (s / len) * (s / len));
            ctx.fillStyle = css(P.fgGrass[Math.min(4, Math.floor((s / len) * 4 + (bl % 2)))]);
            for (var dup = 0; dup < 2; dup++) ctx.fillRect(((px + dup * Wd) % Wd + Wd) % Wd, Hh - s, 1, 1);
          }
        }
      } else if (type < 0.86) {
        var sw = 5 + Math.floor(hash(id, 82) * 6);
        ctx.fillStyle = css(P.fgStone); ctx.fillRect(bx, Hh - 4, sw, 4); ctx.fillRect(bx + 1, Hh - 5, sw - 2, 1);
        ctx.fillStyle = css(P.fgStoneLit); ctx.fillRect(bx + 1, Hh - 5, sw - 3, 1); ctx.fillRect(bx, Hh - 4, 1, 2);
      } else {
        var sh = 10 + Math.floor(hash(id, 83) * 6), sv = Math.round(Math.sin(t * 1.6 + id) * 0.8);
        ctx.fillStyle = css(P.fgStem);
        ctx.fillRect(bx, Hh - sh, 1, sh);
        ctx.fillRect(bx + sv + 1, Hh - (sh - 2), 1, 1);
        ctx.fillRect(bx - 1, Hh - (sh - 4), 1, 1);
        for (var fl = 0; fl < 3; fl++) {
          var fx = bx + (fl - 1) * 2 + sv, fy = Hh - (sh - fl * 2 - 1);
          ctx.fillStyle = css(P.cantuta[fl % 3]); ctx.fillRect(fx, fy, 1, 3);
          ctx.fillStyle = css(P.cantutaTip); ctx.fillRect(fx, fy + 3, 1, 1);
        }
      }
    }
  }
  function drawForeground(ctx, cameraX, timeSeconds, opts) {
    opts = opts || EMPTY_OPTS;
    var W = opts.width || ctx.canvas.width || 960, H = opts.height || ctx.canvas.height || 540;
    var S = H / LOW_H, a = prepareAnimated();
    var cv = a.foreground[phaseOf(timeSeconds || 0, 1.6, 0)];
    var offset = Math.floor((cameraX || 0) * PARALLAX.fg / S);
    var start = -(((offset % cv.width) + cv.width) % cv.width) * S;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (var x = start; x < W; x += cv.width * S)
      ctx.drawImage(cv, x, H - cv.height * S, cv.width * S, cv.height * S);
    ctx.restore();
  }
  var EMPTY_OPTS = {};
  var CLOUD_DEFS = [[0, 30, 1.0], [1, 52, 0.6], [2, 14, 0.8]];

  function drawBackground(ctx, cameraX, timeSeconds, opts) {
    opts = opts || EMPTY_OPTS;
    var cv = ctx.canvas || {};
    var W = opts.width || cv.width || 960, H = opts.height || cv.height || 540;
    var L = opts.levelLength || 4200;
    var C = cache && cache.W === W && cache.H === H && cache.L === L ? cache : prepare({ width: W, height: H, levelLength: L });
    var S = C.S, t = timeSeconds || 0, cam = clamp(cameraX || 0, 0, C.range), a = animated, i;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 1. cielo + Apus + cúmulos (una sola capa opaca)
    blit(ctx, C.far, Math.round(cam * PARALLAX.far), S, W);
    var wrap = C.lw + 120;
    for (i = 0; i < CLOUD_DEFS.length; i++) {
      var cd = CLOUD_DEFS[i], img = C.clouds[cd[0]];
      var cx = (((i * 173 + 140 - t * cd[2] - cam * PARALLAX.cloud / S) % wrap) + wrap) % wrap - 90;
      ctx.drawImage(img, 0, 0, img.width, img.height, Math.round(cx) * S, cd[1] * S, img.width * S, img.height * S);
    }
    // cóndor: planea cada ~40 s durante ~24 s
    var cyc = t % 40;
    if (cyc < 24) {
      var k = cyc / 24, dir = Math.floor(t / 40) % 2 ? -1 : 1;
      var px = dir > 0 ? -30 + k * (C.lw + 60) : C.lw + 30 - k * (C.lw + 60);
      px -= cam * PARALLAX.condor / S;
      var py = 34 + Math.sin(k * Math.PI * 2) * 12 + Math.sin(t * 0.7) * 3;
      var flap = Math.sin(t * 1.3);
      var fr = C.condor[flap > 0.9 ? 1 : flap < -0.93 ? 2 : 0];
      ctx.save();
      ctx.translate(Math.round(px) * S + (dir < 0 ? fr.width * S : 0), Math.round(py) * S);
      if (dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(fr, 0, 0, fr.width, fr.height, 0, 0, fr.width * S, fr.height * S);
      ctx.restore();
    }
    // 2. cordilleras azul-verdes
    blit(ctx, C.midfar, Math.round(cam * PARALLAX.midfar), S, W);
    // 3. capa media: andenes, quebrada, campamento
    var offM = Math.round(cam * PARALLAX.mid);
    blit(ctx, C.mid, offM, S, W);
    var ph = phaseOf(t, 4, 0);
    for (i = 0; i < C.falls.length; i++) {
      var fa = C.falls[i], fx = Math.round(fa.x * S - offM);
      if (fx < -16 * S || fx > W) continue;
      var ff = a.falls[Math.floor(t * 10) % a.falls.length];
      ctx.drawImage(ff, fx, Math.round(fa.y * S), ff.width * S, ff.height * S);
    }
    for (i = 0; i < C.incas.length; i++) {
      var ib = C.incas[i], ix = Math.round(ib.x * S - offM);
      if (ix < -24 * S || ix > W) continue;
      var icv = a.incas[phaseOf(t, 2.2, i)];
      ctx.drawImage(icv, ix, Math.round(ib.y * S), icv.width * S, icv.height * S);
    }
    for (i = 0; i < C.banners.length; i++) {
      var bn = C.banners[i], bx = Math.round(bn.x * S - offM);
      if (bx < -16 * S || bx > W) continue;
      var bcv = a.banners[(ph + i * 3) % 12];
      ctx.drawImage(bcv, bx, Math.round(bn.y * S) - 2 * S, bcv.width * S, bcv.height * S);
    }
    for (i = 0; i < C.midSmokes.length; i++) {
      var ms = C.midSmokes[i], mx = Math.round(ms.x * S - offM);
      if (mx < -80 || mx > W + 80) continue;
      drawSmoke(ctx, ms, mx, Math.round(ms.y * S), S, t);
    }
    ctx.restore();
  }

  // Suelo: coordenadas de MUNDO (dentro de ctx.translate(-cam,0)). Muro inca con pasto encima.
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
  // la cara superior está exactamente en y (coincide con la colisión de game.js); el pasto
  // sobresale unos píxeles por encima.
  function drawPlatform(ctx, x, y, w, h, cameraX) {
    var viewW = (ctx.canvas && ctx.canvas.width) || 960, cam = cameraX || 0;
    if (cameraX !== undefined && (x + w < cam - 10 || x > cam + viewW + 10)) return;
    var S = lastScale, cw = Math.max(3, Math.ceil(w / S)), ch = Math.max(3, Math.ceil(h / S));
    var key = Math.round(x) + ',' + cw + ',' + ch;
    var cvs = platCache[key] || (platCache[key] = buildPlatform(cw, ch, 1000 + Math.round(x) * 7 + cw));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cvs, 0, 0, cvs.width, cvs.height, Math.round(x), Math.round(y) - 6 * S, cvs.width * S, cvs.height * S);
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

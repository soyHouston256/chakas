/*
 * CHANKAS — sprites pixel art (script clásico, sin módulos ni build).
 *
 * Todo el arte está definido en código: cabezas, cascos y piezas como filas
 * de caracteres indexados a una paleta común, y los cuerpos se posan con
 * esqueletos 2D (IK de dos huesos) dibujados píxel a píxel. Cada fotograma se
 * construye una sola vez (perezosamente) en un canvas offscreen y luego se
 * escala sin suavizado.
 *
 * API: window.ChankasSprites
 *   draw(ctx, kind, anim, timeSeconds, x, y, opts)  -> boolean
 *        (x, y) = esquina superior izquierda del hitbox tal como lo usa game.js.
 *        opts: { facing: 1|-1, scale, flash (bool|0..1), alpha, rotation (rad),
 *                fill (0..1, carga de la manta del héroe), active (bool, apacheta),
 *                w, h (hitbox si difiere del por defecto), frame (forzar índice),
 *                outline ('#rrggbb': contorno claro de 1 px de arte alrededor de la silueta;
 *                         se pre-renderiza una vez por fotograma y color y queda en caché) }
 *   list()          -> { kind: { box, scale, anchor, anims: { anim: {frames, fps, loop} } } }
 *   size(kind)      -> { w, h, anchor, scale, frameW, frameH }
 *   kindFor(entity) -> nombre de kind según los campos de game.js
 *   animFor(entity, kind, worldTime) -> animación sugerida (best effort)
 *   prerender()     -> construye todos los fotogramas por adelantado
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Paleta (una sola para todo el juego)                                */
  /* ------------------------------------------------------------------ */
  var HEX = {
    k: '#1b1210', // contorno
    n: '#251b18', // cabello / barba
    s: '#bd7946', S: '#87502c', h: '#da9a63', // piel bronce
    C: '#dfae88', K: '#a5714f', X: '#f1cda6', // piel europea (españoles): distingue del héroe
    r: '#bf3127', R: '#7b1c1e', q: '#e45a3a', // rojo cochinilla
    o: '#dda23c', O: '#9a6420', // ocre
    t: '#2db3a3', T: '#1b766f', // turquesa
    g: '#f6d24c', G: '#b48b1d', // oro
    w: '#f4ead3', W: '#cdbd99', v: '#86735a', // lana / crema
    x: '#ffffff',
    b: '#7e4b29', B: '#4a2a17', // cuero
    m: '#e4ddd0', M: '#aab4bb', N: '#596779', // acero
    d: '#535262', D: '#292b3c', // paño negro
    e: '#7d2b2d', E: '#4e1a1f', // rojo oscuro
    u: '#94612f', U: '#5c3a1b', // madera
    y: '#b48652', Y: '#7a5531', z: '#3c2818', // atigrado
    f: '#ffc93c', F: '#ff7b1c', i: '#fff5b8', I: '#d13c16', // fuego
    p: '#c3eaa8', P: '#79b46b', // saliva
    a: '#bab5a3', A: '#7b7669', c: '#e5e1ce', // piedra
    H: '#f1bd86', V: '#ead8b5', Z: '#d9ad70', // luz cálida: piel, lana, alano
    j: '#e3579b', J: '#7b3f9f', // pompones
    '7': '#40312e', // brillo del cabello
    '8': '#f07a2a', // pluma naranja
    '9': '#5e331d'  // sombra profunda de la piel
  };
  var RGBA_SOFT = { l: [255, 244, 214, 150], L: [150, 142, 136, 140], Q: [255, 255, 255, 120] };
  // Colores que no generan contorno (brillos, humo, fuego).
  var SOFT = { l: 1, L: 1, Q: 1, i: 1, f: 1, F: 1, I: 1 };

  var RGBA = {};
  function rgba(c) {
    if (RGBA[c]) return RGBA[c];
    var v = RGBA_SOFT[c];
    if (!v) {
      var hx = HEX[c];
      if (!hx) throw new Error('ChankasSprites: color desconocido "' + c + '"');
      v = [parseInt(hx.substr(1, 2), 16), parseInt(hx.substr(3, 2), 16), parseInt(hx.substr(5, 2), 16), 255];
    }
    RGBA[c] = v;
    return v;
  }

  /* ------------------------------------------------------------------ */
  /* Rejilla de píxeles indexados                                        */
  /* ------------------------------------------------------------------ */
  function Grid(w, h, oy) {
    this.w = w; this.h = h; this.oy = oy || 0;
    this.d = new Array(w * h);
    for (var i = 0; i < w * h; i++) this.d[i] = '.';
  }
  var GP = Grid.prototype;
  GP.set = function (x, y, c) {
    if (!c || c === '.' || c === ' ') return;
    x = Math.round(x); y = Math.round(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  };
  GP.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.d[y * this.w + x];
  };
  GP.rect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  GP.blit = function (rows, x, y, flip) {
    x = Math.round(x); y = Math.round(y);
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      for (var i = 0; i < r.length; i++) this.set(x + i, y + j, r.charAt(flip ? r.length - 1 - i : i));
    }
  };
  GP.dot = function (x, y, c, b) {
    b = b || 1; x = Math.round(x); y = Math.round(y);
    var o = b === 3 ? -1 : 0;
    for (var j = 0; j < b; j++) for (var i = 0; i < b; i++) this.set(x + i + o, y + j + o, c);
  };
  GP.line = function (x0, y0, x1, y1, c, b) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 500; n++) {
      this.dot(x0, y0, c, b);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  GP.ellipse = function (cx, cy, rx, ry, c) {
    if (rx <= 0 || ry <= 0) return;
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var u = (x - cx) / rx, v = (y - cy) / ry;
        if (u * u + v * v <= 1) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
      }
    }
  };
  GP.outline = function (c) {
    c = c || 'k';
    var w = this.w, h = this.h, d = this.d, add = [];
    function solid(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      var v = d[y * w + x];
      return v !== '.' && !SOFT[v];
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (d[y * w + x] !== '.') continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push(y * w + x);
    }
    for (var i = 0; i < add.length; i++) d[add[i]] = c;
    return this;
  };
  // Sel-out y luz cenital izquierda, únicamente durante el prerenderizado.
  GP.finish = function () {
    var src = this.d.slice(), w = this.w, h = this.h;
    var lit = { s: 'h', h: 'H', C: 'X', r: 'q', o: 'g', b: 'u',
      w: 'V', W: 'w', y: 'Z', M: 'm', m: 'x', d: 'N', a: 'c' };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = src[y * w + x];
      if (!lit[c]) continue;
      var top = y === 0 || src[(y - 1) * w + x] === '.';
      var left = x === 0 || src[y * w + x - 1] === '.';
      if (top || left && ((x + y) & 1) === 0) this.d[y * w + x] = lit[c];
    }
    this.outline();
    // El borde iluminado usa un valor intermedio; la sombra conserva el contorno.
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      var at = y * w + x;
      if (this.d[at] !== 'k' || src[at] !== '.') continue;
      c = src[at + w];
      if (src[at - w] === '.' && (c === 'm' || c === 'M' || c === 'w' || c === 'V'))
        this.d[at] = c === 'm' || c === 'M' ? 'M' : 'v';
    }
    return this;
  };
  GP.bbox = function () {
    var x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (this.d[y * this.w + x] !== '.') {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  };
  GP.raw = function () { var g = new Grid(this.w, this.h); g.d = this.d.slice(); return g; };
  GP.shift = function (dx, dy) {
    var g = new Grid(this.w, this.h);
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      var v = this.d[y * this.w + x];
      if (v !== '.') g.set(x + dx, y + dy, v);
    }
    return g;
  };
  // Rotación 90° antihoraria en una rejilla cuadrada (cabeza a la izquierda, cara arriba).
  GP.rotCCW = function () {
    var g = new Grid(this.h, this.w);
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      g.d[(this.w - 1 - x) * g.w + y] = this.d[y * this.w + x];
    }
    return g;
  };
  GP.fit = function (w, h) { // recorta/rellena a w×h anclado arriba-izquierda
    var g = new Grid(w, h);
    for (var y = 0; y < Math.min(h, this.h); y++) for (var x = 0; x < Math.min(w, this.w); x++) g.d[y * w + x] = this.d[y * this.w + x];
    return g;
  };
  // Apoya el contenido en la fila `row` y lo centra en la columna `cx`.
  GP.settle = function (row, cx) {
    var b = this.bbox();
    if (b.x1 < 0) return this;
    return this.shift(cx == null ? 0 : Math.round(cx - (b.x0 + b.x1) / 2), row - b.y1);
  };

  /*
   * Rejilla de alta resolución (×2). Acepta las mismas coordenadas "de arte" que Grid
   * (las poses y esqueletos no cambian), pero las líneas y elipses se rasterizan con el
   * doble de detalle; hset/hline/hblit/hrect trabajan directamente en píxeles finos para
   * rostros, tocapus, cascos y adornos. Tras finishHi() es una Grid normal de w*2 × h*2.
   */
  function HGrid(w, h, oy) { Grid.call(this, w * 2, h * 2, (oy || 0) * 2); }
  var HP = HGrid.prototype = Object.create(GP);
  HP.constructor = HGrid;
  HP.hset = GP.set;
  HP.set = function (x, y, c) {
    var X = Math.round(x) * 2, Y = Math.round(y) * 2;
    this.hset(X, Y, c); this.hset(X + 1, Y, c); this.hset(X, Y + 1, c); this.hset(X + 1, Y + 1, c);
  };
  HP.line = function (x0, y0, x1, y1, c, b) {
    b = b || 1;
    var o = b === 3 ? -2 : 0, s = 2 * b;
    var X0 = Math.round(x0 * 2), Y0 = Math.round(y0 * 2), X1 = Math.round(x1 * 2), Y1 = Math.round(y1 * 2);
    var dx = Math.abs(X1 - X0), sx = X0 < X1 ? 1 : -1, dy = -Math.abs(Y1 - Y0), sy = Y0 < Y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 1000; n++) {
      for (var j = 0; j < s; j++) for (var i = 0; i < s; i++) this.hset(X0 + i + o, Y0 + j + o, c);
      if (X0 === X1 && Y0 === Y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; X0 += sx; }
      if (e2 <= dx) { err += dx; Y0 += sy; }
    }
  };
  HP.ellipse = function (cx, cy, rx, ry, c) {
    if (rx <= 0 || ry <= 0) return;
    for (var Y = Math.floor((cy - ry) * 2) - 1; Y <= Math.ceil((cy + ry) * 2) + 1; Y++) {
      for (var X = Math.floor((cx - rx) * 2) - 1; X <= Math.ceil((cx + rx) * 2) + 1; X++) {
        var u = (X / 2 - 0.25 - cx) / rx, v = (Y / 2 - 0.25 - cy) / ry;
        if (u * u + v * v <= 1) this.hset(X, Y, typeof c === 'function' ? c(Math.floor(X / 2), Math.floor(Y / 2), X, Y) : c);
      }
    }
  };
  HP.hline = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 1000; n++) {
      this.hset(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  HP.hrect = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.hset(x + i, y + j, c); };
  HP.hblit = function (rows, x, y) {
    x = Math.round(x); y = Math.round(y);
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) this.hset(x + i, y + j, rows[j].charAt(i));
  };
  // Dibuja una pieza aparte y la pega con su propio contorno (brazo delantero sobre el torso).
  HP.stamp = function (fn, oc) {
    var t = new HGrid(1, 1); t.w = this.w; t.h = this.h; t.oy = this.oy; t.d = new Array(this.w * this.h);
    for (var i = 0; i < t.d.length; i++) t.d[i] = '.';
    fn(t);
    t.outline(oc || 'k');
    for (i = 0; i < t.d.length; i++) if (t.d[i] !== '.' && (t.d[i] !== (oc || 'k') || this.d[i] !== '.')) this.d[i] = t.d[i];
    return this;
  };
  // Luz arriba-izquierda, sombra abajo-derecha, contorno y sel-out (solo al prerenderizar).
  var LITH = { s: 'h', h: 'H', S: 's', C: 'X', K: 'C', r: 'q', R: 'r', o: 'g', O: 'o', b: 'u', B: 'b', w: 'V', W: 'w', v: 'W',
    y: 'Z', Y: 'y', M: 'm', m: 'x', N: 'M', d: 'N', D: 'd', a: 'c', A: 'a', e: 'r', E: 'e', n: '7', U: 'u', T: 't' };
  var DKH = { s: 'S', h: 's', H: 'h', S: '9', r: 'R', q: 'r', o: 'O', g: 'G', w: 'W', V: 'w', W: 'v', m: 'M', M: 'N', N: 'D',
    d: 'D', b: 'B', y: 'Y', Z: 'y', C: 'K', X: 'C', a: 'A', c: 'a', t: 'T', e: 'E', u: 'U', j: 'J', x: 'm', '7': 'n' };
  GP.finishHi = function () {
    var src = this.d.slice(), w = this.w, h = this.h, x, y;
    function e(xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h || src[yy * w + xx] === '.'; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var c = src[y * w + x];
      if (c === '.' || SOFT[c]) continue;
      if ((e(x, y - 1) || e(x - 1, y)) && LITH[c]) this.d[y * w + x] = LITH[c];
      else if ((e(x, y + 1) || e(x + 1, y)) && DKH[c]) this.d[y * w + x] = DKH[c];
    }
    this.outline();
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      var at = y * w + x;
      if (this.d[at] !== 'k' || src[at] !== '.') continue;
      c = src[at + w];
      if (src[at - w] === '.' && (c === 'm' || c === 'M' || c === 'w' || c === 'V' || c === 'x'))
        this.d[at] = c === 'w' || c === 'V' ? 'v' : 'N';
    }
    return this;
  };

  /* ------------------------------------------------------------------ */
  /* Utilidades de pose                                                  */
  /* ------------------------------------------------------------------ */
  var DEG = Math.PI / 180;
  function ik(ax, ay, tx, ty, l1, l2, bend) {
    var dx = tx - ax, dy = ty - ay, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var dd = Math.min(d, l1 + l2 - 0.001);
    var ca = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd);
    ca = Math.max(-1, Math.min(1, ca));
    var ang = Math.atan2(dy, dx) - bend * Math.acos(ca);
    var jx = ax + Math.cos(ang) * l1, jy = ay + Math.sin(ang) * l1, ex = tx, ey = ty;
    if (d > l1 + l2) {
      var ux = tx - jx, uy = ty - jy, ul = Math.sqrt(ux * ux + uy * uy) || 1;
      ex = jx + ux / ul * l2; ey = jy + uy / ul * l2;
    }
    return [jx, jy, ex, ey];
  }
  // Extremidad de dos huesos. bend=+1 articulación hacia delante (rodilla), -1 hacia atrás (codo).
  function limb(g, ax, ay, tx, ty, l1, l2, bend, c1, c2, b) {
    var r = ik(ax, ay, tx, ty, l1, l2, bend);
    g.line(ax, ay, r[0], r[1], c1, b);
    g.line(r[0], r[1], r[2], r[3], c2, b);
    return r;
  }
  function arc(cx, cy, rx, ry, a0, a1, step) {
    var pts = [], s = step || 12;
    for (var a = a0; a1 > a0 ? a <= a1 : a >= a1; a += (a1 > a0 ? s : -s)) pts.push([cx + Math.cos(a * DEG) * rx, cy + Math.sin(a * DEG) * ry]);
    return pts;
  }
  function dots(g, pts, c) { for (var i = 0; i < pts.length; i++) g.set(pts[i][0], pts[i][1], c); }
  // Escupitajo de la llama en la cara (x, y = centro). lvl 3 = recién llegado … 0 = solo gotas
  // que salen volando al sacudir la cabeza. k agranda la mancha (capitán).
  function splatFace(g, x, y, lvl, k) {
    k = k || 1;
    if (lvl >= 3) {
      g.ellipse(x, y, 2.2 * k, 1.7 * k, 'p'); g.set(x + 1, y - 1, 'x');
      g.set(x - 1, y + 2 * k, 'P'); g.set(x - 1, y + 2 * k + 1, 'P');
      g.set(x + 3 * k + 1, y - 2, 'p'); g.set(x - 3 * k, y - 1, 'p');
    } else if (lvl === 2) {
      g.ellipse(x, y, 1.6 * k, 1.2 * k, 'p'); g.set(x - 1, y + 2, 'P');
      g.set(x + 3 * k, y - 2, 'p');
    } else if (lvl === 1) {
      g.line(x - 2 * k, y + 1, x + 2 * k, y + 1, 'P', 1); g.set(x + 1, y, 'p');
    } else {
      g.set(x + 4 * k, y - 3, 'p'); g.set(x - 4 * k, y - 2, 'p'); g.set(x + 5 * k, y, 'P');
    }
  }
  // Estrellitas de aturdimiento orbitando.
  function stars(g, cx, cy, i, rx) {
    for (var k = 0; k < 3; k++) {
      var a = i * 40 + k * 120;
      var x = Math.round(cx + Math.cos(a * DEG) * rx), y = Math.round(cy + Math.sin(a * DEG) * rx * 0.3);
      g.set(x, y, 'i'); g.set(x - 1, y, 'g'); g.set(x + 1, y, 'g'); g.set(x, y - 1, 'g'); g.set(x, y + 1, 'g');
    }
  }
  // Fogonazo (sin contorno).
  function flashAt(g, x, y, s) {
    g.line(x, y, x + s * 2 + 1, y, 'F', 1);
    g.line(x, y - 1, x + s * 2, y - 1, 'f', 1);
    g.line(x + 1, y - s, x + s, y, 'F', 1);
    g.line(x + 1, y + s, x + s, y, 'F', 1);
    g.line(x + s, y - s + 1, x + s + 1, y, 'f', 1);
    g.rect(x, y - 1, s + 1, 2, 'i');
  }
  function puff(g, x, y, r) {
    g.ellipse(x, y, r, r * 0.8, 'L');
    g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.55, r * 0.45, 'l');
  }

  /* ------------------------------------------------------------------ */
  /* Registro de tipos y caché                                            */
  /* ------------------------------------------------------------------ */
  var KINDS = {};
  var CACHE = {};

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  function toCanvas(g, white) {
    var cv = makeCanvas(g.w, g.h);
    if (!cv) return null;
    var cx = cv.getContext('2d');
    var im = cx.createImageData(g.w, g.h), a = im.data;
    for (var i = 0; i < g.d.length; i++) {
      var c = g.d[i];
      if (c === '.') continue;
      var v = rgba(c);
      a[i * 4] = white ? 255 : v[0];
      a[i * 4 + 1] = white ? 255 : v[1];
      a[i * 4 + 2] = white ? 255 : v[2];
      a[i * 4 + 3] = v[3];
    }
    cx.putImageData(im, 0, 0);
    return cv;
  }
  function getFrame(kind, anim, i, variant) {
    var key = kind + '|' + anim + '|' + i + '|' + variant;
    var f = CACHE[key];
    if (f) return f;
    var K = KINDS[kind], A = K.anims[anim];
    var g = A.build(i, variant);
    if (g.w !== K.fw || g.h !== K.fh) g = g.fit(K.fw, K.fh);
    f = CACHE[key] = { grid: g, canvas: null, white: null, rim: null, rimColor: '' };
    return f;
  }
  // Contorno exterior (1 px de arte, w+2 × h+2) del color pedido: los píxeles vacíos que
  // tocan la silueta (incluidas diagonales). Se construye una vez y se guarda en el fotograma.
  var rimBuilt = 0;
  function rimCanvas(g, color, th) {
    th = th || 1;
    var w = g.w + 2 * th, h = g.h + 2 * th, cv = makeCanvas(w, h);
    if (!cv) return null;
    var cx = cv.getContext('2d'), im = cx.createImageData(w, h), a = im.data;
    var r = parseInt(color.substr(1, 2), 16), gg = parseInt(color.substr(3, 2), 16), b = parseInt(color.substr(5, 2), 16);
    function solid(x, y) {
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
      var v = g.d[y * g.w + x];
      return v !== '.' && !SOFT[v];
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var sx = x - th, sy = y - th, hit = false;
      if (solid(sx, sy)) continue;
      for (var j = -th; j <= th && !hit; j++) for (var i = -th; i <= th; i++) {
        if ((i === -th || i === th) && (j === -th || j === th) && th > 1) continue;
        if (solid(sx + i, sy + j)) { hit = true; break; }
      }
      if (hit) {
        var k = (y * w + x) * 4;
        a[k] = r; a[k + 1] = gg; a[k + 2] = b; a[k + 3] = 235;
      }
    }
    cx.putImageData(im, 0, 0);
    rimBuilt++;
    return cv;
  }

  /* ------------------------------------------------------------------ */
  /* HÉROE — guerrero inca                                              */
  /* ------------------------------------------------------------------ */
  // Perfil compacto: una mirada clara, mandíbula definida y llauto tejido.
  // La cara usa masas de color, no dientes ni píxeles blancos que parezcan una mueca.
  var HEAD_HERO = [
    '....nnnnnn....',
    '..nnn77nnnnn..',
    '.nnn77nnnnnnn.',
    '.nnnnnnnnnnnn.',
    '.rrrrrrrrrrrr.',
    '.RRgRRRRgRRRR.',
    '.nnnnnhhhhhs..',
    '.nnnnshhhhhh..',
    '.nnngshhhkhhs.',
    '.nnnGshhhhhhs.',
    '.nnnnSshhhhhs.',
    '..nnnSshhhss..',
    '..nnnSSssss...',
    '...nn.Ssss....',
    '......Sss.....',
    '......SS......'
  ];
  var TOC = [['o', 't', 'g', 'r', 'o'], ['t', 'r', 'o', 'g', 't'], ['g', 'o', 't', 'o', 'g']];
  var DARK = { o: 'O', t: 'T', g: 'G', r: 'R' };
  var TOCH = ['g', 't', 'w', 'q', 'o', 'T'];

  // Unku de caída recta: cuello, faja y una banda tejida; los pliegues siguen
  // el volumen del torso y dejan leer las piernas en vez de formar una falda rígida.
  function unku(g, x, y, ln) {
    var X = x * 2, Y = y * 2, R = 26;
    for (var r = 0; r < R; r++) {
      var flare = r > 19 ? 1 : 0, ww = 20 + flare;
      var sx = X + Math.round(ln * 2 * (R - 1 - r) / (R - 1));
      for (var i = 0; i < ww; i++) {
        if (r === 0 && (i < 3 || i > ww - 4)) continue;
        if (r === 1 && (i < 1 || i > ww - 2)) continue;
        var c = i < 3 ? 'r' : i > ww - 5 ? 'E' : 'e';
        if (r < 4 && Math.abs(i - 10) <= 3 - r) c = r < 2 ? 'S' : 'W';
        // Cuello en V de lana crema y un pequeño pendiente central.
        if (r >= 2 && r <= 8 && Math.abs(i - 10) === 8 - r) c = 'W';
        if ((r === 8 || r === 9) && (i === 9 || i === 10)) c = 'g';
        if (r === 14 || r === 17) c = 'B';
        if (r === 15 || r === 16) {
          c = 'O';
          if (i >= 3 && i <= ww - 4) c = (i + r) % 6 < 2 ? 'w' : 'R';
        }
        if (r > 18 && (i === 5 || i === 14)) c = 'E';
        if (r >= R - 4) {
          var triangle = Math.abs((i % 6) - 3);
          c = triangle <= r - (R - 4) ? 'W' : 'e';
        }
        g.hset(sx + i, Y + r, c);
      }
    }
  }
  // Manta compacta: se reconoce la reserva sin tapar el torso con un bulto blanco.
  function bag(g, lvl, x, y) {
    if (lvl <= 0) {
      g.rect(x - 2, y + 3, 2, 7, 'W');
      g.line(x - 2, y + 3, x - 2, y + 9, 'R');
      return;
    }
    var rx = [0, 1.5, 1.8, 2.1][lvl], ry = [0, 3, 3.3, 3.6][lvl];
    var cx = x - rx + 1, cy = y + 7;
    g.ellipse(cx, cy, rx, ry, function (px, py, X, Y) {
      if (Y === Math.round((cy - 1) * 2) || Y === Math.round((cy + 2) * 2)) return 'R';
      if (Y === Math.round(cy * 2)) return 'O';
      return px < cx ? 'b' : 'v';
    });
    if (lvl >= 2) g.hrect(Math.round(cx * 2) - 1, Math.round((cy - ry) * 2), 3, 2, 'a');
    g.hline(Math.round(cx * 2), Math.round((cy - ry) * 2) + 2, Math.round(cx * 2) + 3, Math.round((cy - ry) * 2) + 3, 'b');
  }
  function heroLeg(g, hx, hy, f, c, sc) {
    var r = limb(g, hx, hy, f[0], f[1], 5, 5, 1, c, c, 2);
    var fx = Math.round(r[2] * 2), fy = Math.round(r[3] * 2);
    // Ojota con planta y tira: menos adornos para que el tobillo no parezca una bota.
    g.hrect(fx - 1, fy + 1, 7, 2, sc);
    g.hline(fx, fy - 1, fx + 3, fy + 1, 'b');
    g.hset(fx + 4, fy, c);
  }
  function slingHang(dx, dy) {
    return function (g, hx, hy) {
      var X = hx * 2 + 2, Y = hy * 2 + 2, ex = X + dx * 2, ey = Y + dy * 2;
      g.hline(X, Y, ex, ey, 'w');
      g.hrect(ex - 1, ey + 1, 3, 2, 'b');
    };
  }
  function slingSpin(sx, sy, trail) {
    return function (g, hx, hy) {
      if (trail) for (var i = 0; i < trail.length; i++) g.hset(trail[i][0] * 2, trail[i][1] * 2, 'l');
      g.hline(hx * 2 + 2, hy * 2, sx * 2 + 1, sy * 2 + 1, 'w');
      g.hrect(sx * 2, sy * 2, 4, 4, 'a'); g.hset(sx * 2, sy * 2, 'c'); g.hset(sx * 2 + 1, sy * 2, 'c');
    };
  }
  function heroFrame(p, lvl) {
    var g = new HGrid(40, 40);
    var bx = p.bx || 0, by = p.by || 0, ln = p.lean || 0;
    var hipX = 20 + bx, hipY = 28 + by, shY = 19 + by;
    var shBX = 16 + bx + ln, shFX = 22 + bx + ln;
    limb(g, shBX, shY, p.hb[0], p.hb[1], 5, 4, -1, 'S', 'S', 2);
    if (lvl != null) bag(g, lvl, 15 + bx + ln, 18 + by);
    heroLeg(g, hipX - 1, hipY, p.fb, 'S', 'B');
    heroLeg(g, hipX + 1, hipY, p.ff, 's', 'b');
    g.ellipse(shBX + 0.5, shY + 0.6, 1.5, 1.3, 'S'); // hombro posterior
    unku(g, 15 + bx, 17 + by, ln);
    if (lvl != null) { g.hline((16 + bx + ln) * 2, (19 + by) * 2, (21 + bx + ln) * 2 + 1, (21 + by) * 2 + 1, 'b'); }
    var hx = 17 + bx + ln + (p.hdx || 0), hy = 10 + by + (p.hdy || 0);
    var HX = hx * 2 - 1, HY = hy * 2 - 1;
    // Llauto rojo y cabello oscuro como en la referencia del guerrero chanka.
    // Una silueta compacta evita que un adorno alto parezca una antena.
    g.hblit(HEAD_HERO, HX, HY);
    g.hrect(HX + 2, HY + 13, 3, 3, 'n');
    if (p.eye) g.hset(HX + 9, HY + 8, p.eye === 'S' ? 's' : p.eye);
    if (p.mouth) g.hset(HX + 10, HY + 11, 'S');
    g.stamp(function (t) {
      g.ellipse.call(t, shFX + 0.3, shY + 0.6, 1.5, 1.3, 's');
      var a = limb(t, shFX, shY, p.hf[0], p.hf[1], 5, 4, -1, 's', 's', 2);
      t.hrect(Math.round(a[0] * 2) - 1, Math.round(a[1] * 2) - 1, 3, 1, 'O'); // brazalete
      t.hrect(Math.round(a[2] * 2) - 1, Math.round(a[3] * 2) - 3, 3, 1, 'b'); // muñequera
      t.ellipse(a[2] + 0.4, a[3] + 0.4, 1, 1, 'h');
      if (p.sling) p.sling(t, Math.round(a[2]), Math.round(a[3]));
    }, '9');
    return g.finishHi();
  }
  var RUNC = [[5, 38], [2, 38], [-1, 38], [-4, 37], [-6, 35], [-4, 33], [0, 33], [4, 35]];
  var RUNBY = [0, 1, 0, -1, 0, 1, 0, -1];
  function heroRun(i) {
    var by = RUNBY[i], ph = i / 8 * Math.PI * 2, s = -Math.cos(ph), shY = 19 + by;
    return {
      by: by, lean: 1,
      ff: [20 + RUNC[i][0], RUNC[i][1]], fb: [18 + RUNC[(i + 4) % 8][0], RUNC[(i + 4) % 8][1]],
      hf: [24 + s * 5, shY + 7 - (s > 0 ? s * 3 : 0)], hb: [17 - s * 5, shY + 7 - (s < 0 ? -s * 3 : 0)],
      fs: i % 2, sling: slingHang(-2 - Math.round(s), 3)
    };
  }
  var HERO_POSES = {
    idle: function (i) {
      var by = [0, 0, 1, 1][i];
      return { by: by, lean: 1, fb: [17, 38], ff: [24, 38], hb: [16, 26 + by], hf: [25, 26 + by], fs: [0, 1, 1, 0][i], sling: slingHang(0, 4) };
    },
    run: heroRun,
    jump: function (i) {
      return { by: -1, fb: [15, 35], ff: [24, 34 - i], hb: [11, 21 - i], hf: [27, 14 - i], fs: -1, sling: slingHang(-1, 4) };
    },
    fall: function (i) {
      return { by: 0, fb: [16, 38], ff: [23, 37], hb: [11, 15 + i], hf: [28, 14 + i], fs: 1, sling: slingHang(-2, 3 + i) };
    },
    crouch: function (i) {
      return { by: 5, lean: 1, fb: [14, 38], ff: [24, 38], hb: [15, 33], hf: [27, 32 + i], fs: i, sling: slingHang(1, 3) };
    },
    throw: function (i) {
      switch (i) {
        case 0: return { bx: -1, lean: -1, by: 1, fb: [15, 38], ff: [24, 38], hb: [20, 28], hf: [13, 25], sling: slingHang(-3, 3) };
        case 1: return { lean: 0, fb: [15, 38], ff: [24, 38], hb: [14, 26], hf: [26, 11], sling: slingSpin(17, 6) };
        case 2: return { fb: [15, 38], ff: [24, 38], hb: [14, 26], hf: [26, 10], sling: slingSpin(33, 6, arc(26, 7, 7, 2.5, 190, 345, 10)) };
        case 3: return { fb: [15, 38], ff: [24, 38], hb: [14, 26], hf: [26, 10], sling: slingSpin(18, 8, arc(26, 7, 7, 2.5, 15, 165, 10)) };
        case 4: return {
          bx: 1, lean: 2, fb: [14, 38], ff: [26, 38], hb: [13, 25], hf: [30, 18],
          sling: function (g, hx, hy) {
            g.hline(hx * 2 + 2, hy * 2, hx * 2 + 14, hy * 2 - 3, 'w'); g.hrect(hx * 2 + 13, hy * 2 - 4, 3, 2, 'b');
            g.hline(hx * 2 + 17, hy * 2 - 5, hx * 2 + 24, hy * 2 - 6, 'l'); g.hline(hx * 2 + 16, hy * 2 - 3, hx * 2 + 22, hy * 2 - 3, 'l');
          }
        };
        default: return { bx: 1, lean: 1, fb: [15, 38], ff: [25, 38], hb: [14, 27], hf: [28, 25], sling: slingHang(2, 4) };
      }
    },
    hurt: function (i) {
      return { bx: -1, lean: -2, fb: [17, 38], ff: [23, 37], hb: [11, 17 + i], hf: [26, 14 + i], eye: 'S', mouth: 'k', hdx: -1, fs: 2 };
    },
    dead: function () {
      return { bx: 0, lean: 0, fb: [17, 38], ff: [22, 38], hb: [13, 21], hf: [27, 21], eye: 'S', mouth: 'k', fs: 1 };
    }
  };
  function heroBuild(anim) {
    return function (i, lvl) {
      if (anim === 'dead') {
        var g0 = heroFrame(HERO_POSES.dead(0), lvl);
        return g0.rotCCW().settle(79, 40);
      }
      return heroFrame(HERO_POSES[anim](i), lvl);
    };
  }
  function A(n, fps, loop, build) { return { n: n, fps: fps, loop: loop !== false, build: build }; }
  KINDS.hero = {
    box: { w: 28, h: 58 }, anchor: 'feet', scale: 2, res: 2, fw: 80, fh: 80, ax: 40, ay: 80, def: 'idle',
    variant: function (o) { var f = o && o.fill != null ? o.fill : 0.67; return Math.max(0, Math.min(3, Math.round(f * 3))); },
    anims: {
      idle: A(4, 4, true, heroBuild('idle')),
      run: A(8, 14, true, heroBuild('run')),
      jump: A(2, 6, true, heroBuild('jump')),
      fall: A(2, 6, true, heroBuild('fall')),
      crouch: A(2, 3, true, heroBuild('crouch')),
      throw: A(6, 16, false, heroBuild('throw')),
      hurt: A(2, 8, true, heroBuild('hurt')),
      dead: A(1, 1, false, heroBuild('dead'))
    }
  };

  /* ------------------------------------------------------------------ */
  /* SOLDADOS de la expedición (arcabucero, piquero)                     */
  /* ------------------------------------------------------------------ */
  // Morrión de acero con cresta y ala en media luna (alta resolución, 26×12) y rostro barbado.
  var HELM = [
    '............xm............',
    '...........xmMN...........',
    '..........xmMMND..........',
    '.........xmMMMND..........',
    '........mmMMMMMND.........',
    '.......mxxMMMMMMND........',
    '......mxxMMMMMMMNND.......',
    '......MgMMMgMMMgNND.......',
    'NN...mMMMMMMMMMMMNND....ND',
    '.NN.mMMMMMMMMMMMMMNND..NND',
    '..NNNNNNNNNNNNNNNNNNNNNNND',
    '...DDDDDDDDDDDDDDDDDDDDDD.'
  ];
  var FACE_SP = [
    'nnKKKKKKKK..',
    'nnCCCCCCCCC.',
    'nnCCCCCkCCC.',
    'nnXCCCCkCCCC',
    'nnCCCCCCCCCC',
    'nnnCCCCCCCK.',
    'nnnnCCnnnnn.',
    'nnnnnnnnCnn.',
    'nnnnnnnnnnn.',
    '.nnnnnnnnnn.',
    '..nnnnnnnn..',
    '....nnnn....'
  ];
  // Jubón acuchillado rojo y blanco, gorjal de acero, bandolera con frasquitos de pólvora.
  function torsoArc(g, x, y, ln) {
    var X = x * 2, Y = y * 2;
    for (var r = 0; r < 18; r++) {
      var sx = X + Math.round(ln * 2 * (17 - r) / 17);
      for (var i = 0; i < 16; i++) {
        var c;
        if (r < 3) { if (r === 0 && (i < 2 || i > 13)) continue; c = r === 2 ? 'M' : 'm'; }
        else if (r === 14) c = i === 11 || i === 12 ? 'g' : 'B';
        else if (r > 14) c = (i % 4 < 2) ? 'r' : 'w';
        else c = (Math.floor((i + 1) / 3) % 2) ? 'w' : 'r';
        if (c === 'w' && i > 12) c = 'W';
        g.hset(sx + i, Y + r, c);
      }
    }
    g.hline(X + ln * 2 + 2, Y + 3, X + 11, Y + 13, 'B'); g.hline(X + ln * 2 + 3, Y + 3, X + 12, Y + 13, 'B');
    g.hrect(X + ln * 2 + 4, Y + 6, 2, 3, 'u'); g.hrect(X + 8, Y + 9, 2, 3, 'u');
  }
  // Sobreveste blanca con cruz roja sobre peto de acero (piquero).
  function torsoPiq(g, x, y, ln) {
    var X = x * 2, Y = y * 2;
    for (var r = 0; r < 18; r++) {
      var sx = X + Math.round(ln * 2 * (17 - r) / 17);
      for (var i = 0; i < 16; i++) {
        var c;
        if (r < 3) { if (r === 0 && (i < 2 || i > 13)) continue; c = r === 2 ? 'M' : 'm'; }
        else if (r >= 16) c = i % 3 === 2 ? 'N' : 'M';
        else {
          c = i > 13 ? 'W' : 'w';
          if ((i === 7 || i === 8) && r >= 4 && r <= 14) c = 'r';
          if ((r === 7 || r === 8) && i >= 3 && i <= 12) c = 'r';
          if (r === 15) c = 'B';
        }
        g.hset(sx + i, Y + r, c);
      }
    }
  }
  // Escudo blanco con cruz roja (adarga), en píxeles finos; X,Y = esquina superior izquierda.
  function shield(g, X, Y) {
    for (var j = 0; j < 16; j++) {
      var half = j < 9 ? 6 : Math.max(1, Math.round(6 * (1 - (j - 8) / 8)));
      for (var i = -half; i < half; i++) {
        var c = (Math.abs(i + 0.5) < 1.2 && j > 1 && j < 14) || (j >= 5 && j <= 6 && Math.abs(i + 0.5) < half - 1) ? 'r' : (i > 2 ? 'W' : 'w');
        if (i === -half || i === half - 1 || j === 0) c = 'M';
        g.hset(X + 6 + i, Y + j, c);
      }
    }
  }
  function breeches(g, x, y, c1, c2) {
    for (var r = 0; r < 5; r++) for (var i = 0; i < 9; i++) {
      if ((r === 0 || r === 4) && (i === 0 || i === 8)) continue;
      g.set(x + i, y + r, i === 8 ? c2 : (i % 2 ? c1 : c2));
    }
  }
  function sLeg(g, hx, hy, f, c) {
    var r = limb(g, hx, hy, f[0], f[1], 4, 4, 1, c, c, 2);
    g.dot(r[2], r[3] - 1, 'B', 2);
    g.set(r[2] + 2, r[3] + 1, 'B');
  }
  function soldier(spec, p) {
    var g = new HGrid(spec.W, spec.H, spec.oy);
    var bx = p.bx || 0, by = p.by || 0, ln = p.lean || 0;
    var hipX = 19 + bx, hipY = 31 + by, shY = 23 + by, shB = 17 + bx + ln, shF = 22 + bx + ln;
    if (p.under) p.under(g);
    var ab = limb(g, shB, shY, p.hb[0], p.hb[1], 4, 4, -1, spec.sleeve[1], spec.sleeve[1], 2);
    if (spec.shield) shield(g, shB * 2 - 13, shY * 2 - 1);
    sLeg(g, hipX - 1, hipY, p.fb, spec.hose[1]);
    sLeg(g, hipX + 1, hipY, p.ff, spec.hose[0]);
    breeches(g, 15 + bx, 29 + by, spec.breech[0], spec.breech[1]);
    spec.torso(g, 16 + bx, 22 + by, ln);
    var hx = 17 + bx + ln + (p.hdx || 0), hy = 17 + by + (p.hdy || 0);
    g.hblit(FACE_SP, hx * 2, hy * 2);
    g.hblit(HELM, hx * 2 - 7, hy * 2 - 10);
    if (p.item) p.item(g);
    if (p.backHand !== false) g.dot(ab[2], ab[3], 'K', 2);
    g.stamp(function (t) {
      var af = limb(t, shF, shY, p.hf[0], p.hf[1], 4, 4, -1, spec.sleeve[0], spec.sleeve[0], 2);
      t.ellipse(shF + 0.4, shY + 0.4, 1.8, 1.5, spec.sleeve[0]);
      t.dot(af[2], af[3], 'C', 2);
    }, 'E');
    if (p.after) p.after(g);
    g.oy = 0;
    return g.finishHi();
  }
  var WALKC = [[3, 38], [1, 38], [-1, 38], [-3, 38], [-1, 36], [2, 36]];
  var WALKBY = [0, 1, 0, 0, 1, 0];
  function walkLegs(i, k) {
    k = k || 1;
    var a = WALKC[i], b = WALKC[(i + 3) % 6];
    return { ff: [20 + a[0] * k, a[1]], fb: [18 + b[0] * k, b[1]], by: WALKBY[i] };
  }
  function mix(a, b) { for (var key in b) a[key] = b[key]; return a; }

  // Arcabuz: culata en (bx,by), ángulo en grados.
  function arquebus(bx, by, deg, i, fire) {
    var ca = Math.cos(deg * DEG), sa = Math.sin(deg * DEG);
    function P(d) { return [bx + ca * d, by + sa * d]; }
    return function (g) {
      var a = P(0), b = P(6), c = P(5), e = P(18), l = P(7);
      g.line(a[0], a[1], b[0], b[1], 'u', 2);
      g.line(c[0], c[1], e[0], e[1], 'N', 1);
      g.set(P(12)[0], P(12)[1] - 1, 'M');
      g.set(l[0], l[1] - 1, 'M');
      // mecha encendida y su humo
      g.set(l[0] - 1, l[1] - 2, 'F');
      for (var k = 0; k < 3; k++) g.set(l[0] - 1 + Math.round(Math.sin((i + k) * 1.7)), l[1] - 4 - k * 2 - (i % 2), 'L');
      if (fire === 1) flashAt(g, e[0] + 1, e[1], 4);
      if (fire === 2) { flashAt(g, e[0] + 1, e[1], 2); puff(g, e[0] + 7, e[1] - 2, 2.5); }
      if (fire === 3) { puff(g, e[0] + 5, e[1] - 3, 3.2); puff(g, e[0] + 10, e[1] - 5, 2); }
    };
  }
  function gunHands(bx, by, deg) {
    var ca = Math.cos(deg * DEG), sa = Math.sin(deg * DEG);
    return { hb: [bx + ca * 4, by + sa * 4], hf: [bx + ca * 10, by + sa * 10 + 1] };
  }
  // Soldado escupido (0,5 s): retrocede con la mancha en la cara, se limpia con la mano y
  // sacude la cabeza, indignado. item = arma sujeta con la otra mano.
  function soldierSpat(i, item) {
    var F = [
      { bx: -2, lean: -2, hdx: -1, hf: [21, 26] },
      { bx: -1, lean: -1, hdx: 0, hf: [19, 19] },
      { bx: -1, lean: -1, hdx: 1, hf: [23, 19] },
      { bx: 0, lean: 0, hdx: -1, hf: [24, 31] }
    ][i];
    var hx = 17 + F.bx + F.lean + F.hdx, hy = 17;
    return { bx: F.bx, lean: F.lean, hdx: F.hdx, fb: [15, 38], ff: [24, 38], hb: [16, 31], hf: F.hf, item: item, after: function (g) { splatFace(g, hx + 3, hy + 2, 3 - i); } };
  }
  var ARC = { W: 48, H: 40, oy: 0, sleeve: ['r', 'R'], hose: ['d', 'D'], breech: ['r', 'w'], torso: torsoArc };
  function arcPose(anim, i) {
    var p, gh;
    switch (anim) {
      case 'idle':
        gh = gunHands(16, 33, -42);
        return mix({ by: [0, 0, 1, 1][i], fb: [17, 38], ff: [22, 38], item: arquebus(16, 33, -42, i) }, gh);
      case 'walk':
        gh = gunHands(16, 33 + WALKBY[i], -42);
        return mix(mix({ item: arquebus(16, 33 + WALKBY[i], -42, i) }, walkLegs(i)), gh);
      case 'aim':
        return { by: i, fb: [15, 38], ff: [24, 38], hdx: 1, hdy: 1, item: arquebus(16, 26 + i, 0, i), hb: [20, 27 + i], hf: [27, 27 + i] };
      case 'fire':
        return { bx: i === 0 ? -1 : 0, by: 0, fb: [15, 38], ff: [24, 38], hdx: 1, hdy: 1, item: arquebus(16 + (i === 0 ? -1 : 0), 26, i === 0 ? -4 : 0, i, i + 1), hb: [19, 27], hf: [26, 27] };
      case 'reload':
        var hy = [16, 17, 19, 21, 19, 17][i];
        return {
          lean: 1, fb: [16, 38], ff: [22, 38], hb: [23, 30],
          item: function (g) {
            g.line(26, 21, 26, hy - 2, 'U', 1);              // baqueta
            arquebus(26, 39, -90, i)(g);
          },
          hf: [25, hy]
        };
      case 'stunned':
        return { bx: [0, 1, 0, -1][i], hdy: 1, fb: [16, 38], ff: [23, 38], hb: [16, 31], hf: [24, 32], item: arquebus(17, 29, 35, i), after: function (g) { stars(g, 19 + [0, 1, 0, -1][i], 9, i, 6); } };
      case 'spat':
        return soldierSpat(i, arquebus(17, 29, 35, i));
      case 'hit':
        return { bx: -2, lean: -2, fb: [15, 37], ff: [25, 35 - i], hb: [12, 15], hf: [27, 15 + i], hdx: -1 };
    }
  }
  function soldierBuild(spec, poseFn, anim) {
    return function (i) {
      if (anim === 'dead') {
        var g0 = soldier(spec, poseFn('hit', 0));
        var sq = g0.fit(Math.max(g0.w, g0.h), Math.max(g0.w, g0.h));
        return sq.rotCCW().settle(spec.H * 2 - 1, spec.ax * 2).fit(spec.W * 2, spec.H * 2);
      }
      return soldier(spec, poseFn(anim, i));
    };
  }
  ARC.ax = 20;
  KINDS.arcabucero = {
    box: { w: 30, h: 48 }, anchor: 'feet', scale: 2, res: 2, fw: 96, fh: 80, ax: 40, ay: 80, def: 'idle',
    anims: {
      idle: A(4, 4, true, soldierBuild(ARC, arcPose, 'idle')),
      walk: A(6, 8, true, soldierBuild(ARC, arcPose, 'walk')),
      aim: A(2, 3, true, soldierBuild(ARC, arcPose, 'aim')),
      fire: A(3, 10, false, soldierBuild(ARC, arcPose, 'fire')),
      reload: A(6, 4, true, soldierBuild(ARC, arcPose, 'reload')),
      stunned: A(4, 6, true, soldierBuild(ARC, arcPose, 'stunned')),
      spat: A(4, 8, false, soldierBuild(ARC, arcPose, 'spat')),
      hit: A(2, 10, true, soldierBuild(ARC, arcPose, 'hit')),
      dead: A(1, 1, false, soldierBuild(ARC, arcPose, 'dead'))
    }
  };

  // Pica: regatón en (bx,by), ángulo en grados, longitud 40.
  function pike(bx, by, deg, smear) {
    var ca = Math.cos(deg * DEG), sa = Math.sin(deg * DEG);
    function P(d) { return [bx + ca * d, by + sa * d]; }
    return function (g) {
      var a = P(0), e = P(36), t = P(40);
      if (smear) g.line(P(20)[0], P(20)[1] + 2, P(34)[0], P(34)[1] + 2, 'l', 1);
      g.line(a[0], a[1], e[0], e[1], 'u', 1);
      g.set(a[0], a[1], 'N');
      g.line(e[0], e[1], t[0], t[1], 'm', 1);
      var m = P(37);
      g.set(m[0] - sa, m[1] + ca, 'M'); g.set(m[0] + sa, m[1] - ca, 'x');
      var f = P(35); g.set(f[0] - sa, f[1] + ca, 'r'); // borla roja
    };
  }
  function pikeHands(bx, by, deg, d1, d2) {
    var ca = Math.cos(deg * DEG), sa = Math.sin(deg * DEG);
    return { hb: [bx + ca * d1, by + sa * d1], hf: [bx + ca * d2, by + sa * d2] };
  }
  var PIQ = { W: 64, H: 44, oy: 4, ax: 20, sleeve: ['r', 'R'], hose: ['e', 'E'], breech: ['d', 'D'], torso: torsoPiq, shield: true };
  function piqPose(anim, i) {
    switch (anim) {
      case 'idle':
        return mix({ by: [0, 0, 1, 1][i], fb: [17, 38], ff: [22, 38], item: pike(17, 38, -70) }, pikeHands(17, 38, -70, 9, 14));
      case 'walk':
        var w = walkLegs(i), b = WALKBY[i];
        return mix(mix({ item: pike(17, 38 + b, -70) }, w), pikeHands(17, 38 + b, -70, 9, 14));
      case 'thrust':
        var cfg = [[-2, -1, 2], [1, 1, 10], [2, 2, 18], [1, 1, 12]][i];
        return mix({ bx: cfg[0], lean: cfg[1], fb: [13 + cfg[0], 38], ff: [25 + cfg[0], 38], item: pike(cfg[2], 28, 0, i === 2) }, pikeHands(cfg[2], 28, 0, 13, 19));
      case 'stunned':
        return { bx: [0, 1, 0, -1][i], hdy: 1, fb: [16, 38], ff: [23, 38], hb: [16, 31], hf: [23, 31], item: pike(6, 38, -60 - i * 3), after: function (g) { stars(g, 19 + [0, 1, 0, -1][i], 9, i, 6); } };
      case 'spat':
        return soldierSpat(i, pike(6, 38, -60));
      case 'hit':
        return { bx: -2, lean: -2, fb: [15, 37], ff: [25, 35 - i], hb: [12, 15], hf: [27, 15 + i], hdx: -1 };
    }
  }
  KINDS.piquero = {
    box: { w: 30, h: 48 }, anchor: 'feet', scale: 2, res: 2, fw: 128, fh: 88, ax: 40, ay: 88, def: 'walk',
    anims: {
      idle: A(4, 4, true, soldierBuild(PIQ, piqPose, 'idle')),
      walk: A(6, 8, true, soldierBuild(PIQ, piqPose, 'walk')),
      thrust: A(4, 10, false, soldierBuild(PIQ, piqPose, 'thrust')),
      stunned: A(4, 6, true, soldierBuild(PIQ, piqPose, 'stunned')),
      spat: A(4, 8, false, soldierBuild(PIQ, piqPose, 'spat')),
      hit: A(2, 10, true, soldierBuild(PIQ, piqPose, 'hit')),
      dead: A(1, 1, false, soldierBuild(PIQ, piqPose, 'dead'))
    }
  };

  /* ------------------------------------------------------------------ */
  /* CAPITÁN (jefe)                                                      */
  /* ------------------------------------------------------------------ */
  var HELM_CAP = [
    '.........xm.........',
    '........xmmM........',
    '.......xmmmMN.......',
    '......xmmmmmMN......',
    '.....xmmmmmmMMN.....',
    'm...xmmmmmmmmMMN..mm',
    'mm.mmmgmmmmgmmMMN.mN',
    'mmmmmmmmmmmmmmmMMNNN',
    '.NggNNNNNNNNNNNNggN.'
  ];
  HELM_CAP = HELM_CAP.map(function (r) { return r.replace(/[mMNx]/g, function (c) { return { m: 'M', M: 'N', N: 'D', x: 'm' }[c]; }); });
  var FACE_CAP = [
    'nnKKKKKKKK',
    'nnXXCCCCCC',
    'nnXCCCkCCC',
    'nnCCCCCCCX',
    'nnNCCCCCCX',
    'nnnCCCCCXX',
    'nnnnnnnnnC',
    '.nnnnnnnn.',
    '..nnnnnn..',
    '...nnnn...'
  ];
  function capTorso(g, x, y, ln) {
    var H = 20, W = 14;
    for (var r = 0; r < H; r++) {
      var sx = x + Math.round(ln * (H - 1 - r) / (H - 1));
      for (var i = 0; i < W; i++) {
        var c;
        if (r <= 1) { if (i < 2 || i > 11) continue; c = r === 0 ? 'm' : 'M'; }
        else if (r <= 12) {
          c = i <= 2 ? 'm' : (i <= 6 ? 'M' : (i <= 9 ? 'm' : (i === 10 ? 'M' : 'N')));
          if (r === 3 && i <= 2) c = 'x';
          if (r === 12) c = 'N';
          if (r === 4 && i === 8) c = 'x';
        } else {
          if (i < 1 || i > 12) continue;
          c = (r - 13) % 2 === 0 ? 'M' : 'N'; // escarcelas
          if (r === H - 1) c = 'N';
        }
        g.set(sx + i, y + r, c);
      }
    }
    // banda roja ancha en diagonal, lazo y flecos dorados (sin goteos)
    for (var k = 0; k < 11; k++) {
      var sy = y + 2 + k, sxx = x + 12 - k + Math.round(ln * (H - 1 - (2 + k)) / (H - 1));
      g.set(sxx, sy, 'q'); g.set(sxx - 1, sy, 'r'); g.set(sxx - 2, sy, 'r'); g.set(sxx - 3, sy, 'R');
    }
    g.rect(x - 1, y + 12, 5, 3, 'r'); g.set(x - 1, y + 12, 'q'); g.set(x, y + 12, 'q'); g.set(x + 1, y + 13, 'R');
    g.rect(x - 1, y + 15, 2, 2, 'r'); g.rect(x + 2, y + 15, 2, 2, 'R');
    g.set(x - 1, y + 17, 'g'); g.set(x, y + 17, 'G'); g.set(x + 2, y + 17, 'g'); g.set(x + 3, y + 17, 'G');
  }
  function cape(g, x, y, ln, i, flare) {
    for (var r = 0; r < 26; r++) {
      var t = r / 25;
      var left = Math.round(x + 1 + ln * (1 - t) - t * (10 + flare) + Math.sin(r * 0.5 + i * 1.6) * (0.6 + t * 1.6));
      var right = x + 6 + Math.round(ln * (1 - t));
      for (var xx = left; xx <= right; xx++) g.set(xx, y + r - (flare > 6 ? Math.round(t * flare * 0.6) : 0), xx === left ? 'g' : ((xx - left + Math.round(t * 3)) % 5 === 0 ? 'R' : (xx < left + 3 ? 'e' : 'r')));
    }
  }
  function plume(g, hx, hy, s) {
    g.line(hx + 4, hy + 4, hx - 1, hy - 3, 'r', 2);
    g.line(hx - 1, hy - 3, hx - 7 + s, hy - 4, 'r', 2);
    g.line(hx - 7 + s, hy - 4, hx - 11 + s * 2, hy + 1, 'R', 2);
    g.line(hx + 3, hy + 2, hx - 1, hy - 4, 'q', 1);
    g.line(hx - 2, hy - 4, hx - 7 + s, hy - 5, 'q', 1);
    g.line(hx + 6, hy + 2, hx + 2, hy - 6, 'q', 1);
    g.line(hx + 2, hy - 6, hx - 2 + s, hy - 8, 'r', 2);
  }
  function sword(hx, hy, deg, smear) {
    var ca = Math.cos(deg * DEG), sa = Math.sin(deg * DEG);
    return function (g) {
      if (smear) dots(g, smear, 'Q');
      g.line(hx + ca * 3, hy + sa * 3, hx + ca * 26, hy + sa * 26, 'm', 1);
      g.set(hx + ca * 12, hy + sa * 12, 'x');
      g.line(hx + ca * 2 - sa * 3, hy + sa * 2 + ca * 3, hx + ca * 2 + sa * 3, hy + sa * 2 - ca * 3, 'g', 1); // gavilanes
      g.set(hx + ca * 3, hy + sa * 3, 'G');
      g.set(hx - ca * 2, hy - sa * 2, 'g'); // pomo
    };
  }
  function matchlock(hx, hy, deg, fire) {
    var ca = Math.cos(deg * DEG), sa = Math.sin(deg * DEG);
    return function (g) {
      g.line(hx - ca * 1 + sa * 1, hy - sa * 1 - ca * 1 + 2, hx - ca * 3, hy + 3, 'u', 2);
      // Arcabuz corto de mecha: culata, cañón largo y serpentín visible.
      g.line(hx - ca * 3, hy - sa * 3, hx + ca * 5, hy + sa * 5, 'u', 2);
      g.line(hx + ca * 3, hy + sa * 3, hx + ca * 16, hy + sa * 16, 'N', 1);
      g.line(hx + ca * 6, hy + sa * 6 - 1, hx + ca * 15, hy + sa * 15 - 1, 'M', 1);
      g.set(hx + ca * 4, hy + sa * 4 - 2, 'F');
      g.set(hx + 1, hy - 1, 'g');
      var mx = hx + ca * 17, my = hy + sa * 17;
      if (fire === 1) flashAt(g, mx + 1, my, 5);
      if (fire === 2) puff(g, mx + 4, my - 3, 3.5);
    };
  }
  function capLeg(g, hx, hy, f, c) {
    var r = limb(g, hx, hy, f[0], f[1], 8, 8, 1, c, 'B', 3);
    g.dot(r[0], r[1], 'b', 3); // vuelta de la bota
    g.rect(Math.round(r[2]) - 1, Math.round(r[3]) + 2, 6, 1, 'B');
  }
  function capFrame(p, i) {
    var g = new HGrid(88, 72);
    var bx = p.bx || 0, by = p.by || 0, ln = p.lean || 0;
    var hipX = 35 + bx, hipY = 55 + by, shY = 40 + by, shB = 31 + bx + ln, shF = 41 + bx + ln;
    cape(g, 28 + bx, 37 + by, ln, i, p.flare || 0);
    if (p.backItem) p.backItem(g);
    var ab = limb(g, shB, shY, p.hb[0], p.hb[1], 7, 7, -1, 'R', 'R', 3);
    g.dot(ab[2], ab[3], 'N', 3);
    capLeg(g, hipX - 2, hipY, p.fb, 'D');
    capLeg(g, hipX + 2, hipY, p.ff, 'd');
    for (var r = 0; r < 5; r++) for (var k = 0; k < 15; k++) g.set(hipX - 7 + k, hipY - 1 + r, k % 3 === 0 ? 'g' : (k % 3 === 1 ? 'r' : 'R'));
    capTorso(g, 29 + bx, 36 + by, ln);
    var hx = 32 + bx + ln + (p.hdx || 0), hy = 27 + by + (p.hdy || 0);
    g.blit(FACE_CAP, hx, hy);
    if (p.eye) g.set(hx + 6, hy + 2, p.eye);
    plume(g, hx - 1, hy - 8, p.fs || 0);
    g.blit(HELM_CAP, hx - 5, hy - 8);
    g.rect(hx + 1, hy + 9, 9, 1, 'w'); // cuello de camisa
    if (p.item) p.item(g);
    var af;
    g.stamp(function (t) {
      af = limb(t, shF, shY, p.hf[0], p.hf[1], 7, 7, -1, 'r', 'r', 3);
      for (var q = 0.25; q < 0.9; q += 0.3) t.dot(shF + (af[0] - shF) * q, shY + (af[1] - shY) * q, 'w', 1); // acuchillado
      t.ellipse(shF, shY - 1, 3.5, 2.6, function (x, y) { return y < shY - 1 ? 'm' : 'M'; }); // hombrera
      t.hline(shF * 2 - 6, shY * 2, shF * 2 + 6, shY * 2, 'g');
      t.dot(af[2], af[3], 'M', 3);
    }, 'E');
    if (p.after) p.after(g, af);
    return g.finishHi();
  }
  var CWALK = [[5, 69], [2, 69], [-2, 69], [-5, 69], [-2, 65], [3, 65]];
  var CRUN = [[9, 68], [1, 69], [-8, 67], [-2, 62]];
  function capPose(anim, i) {
    switch (anim) {
      case 'idle':
        var b = [0, 0, 1, 1][i];
        return { by: b, fb: [30, 69], ff: [41, 69], hb: [29, 52 + b], hf: [45, 51 + b], fs: [0, 1, 1, 0][i], item: sword(46, 51 + b, 62) };
      case 'walk':
        var a = CWALK[i], c = CWALK[(i + 3) % 6], wb = WALKBY[i], s = Math.sin(i / 6 * Math.PI * 2);
        return { by: wb, ff: [37 + a[0], a[1]], fb: [33 + c[0], c[1]], hb: [30 - s * 3, 52 + wb], hf: [45 + s * 2, 51 + wb], fs: i % 2, item: sword(46 + s * 2, 51 + wb, 55) };
      case 'slash':
        var S = [
          { bx: -1, lean: -2, hf: [38, 30], d: -115, fs: -1 },
          { bx: -2, lean: -3, hf: [36, 27], d: -150, fs: -2 },
          { bx: 2, lean: 2, hf: [52, 42], d: 0, fs: 2, smear: arc(40, 42, 24, 22, -150, -5, 6).concat(arc(40, 42, 21, 19, -140, -10, 8)) },
          { bx: 2, lean: 1, hf: [50, 52], d: 55, fs: 2 },
          { bx: 0, lean: 0, hf: [46, 50], d: 60, fs: 0 }
        ][i];
        var wide = i >= 2 && i <= 3;
        return { bx: S.bx, lean: S.lean, fs: S.fs, fb: wide ? [27, 69] : [30, 69], ff: wide ? [47, 69] : [41, 69], hb: [27, 49], hf: S.hf, item: null, after: function (g, af) { sword(af[2], af[3], S.d, S.smear)(g); } };
      case 'shoot':
        var H = [[44, 49, 70], [50, 41, 0], [50, 41, 0], [49, 37, -25]][i];
        return { fb: [30, 69], ff: [41, 69], hb: [30, 53], hf: [H[0], H[1]], hdx: i ? 1 : 0, backItem: sword(30, 53, 100), after: function (g, af) { matchlock(af[2], af[3], H[2], i === 2 ? 1 : (i === 3 ? 2 : 0))(g); } };
      case 'charge':
        var f1 = CRUN[i], f2 = CRUN[(i + 2) % 4];
        return { bx: 2, lean: 4, by: [0, 1, 0, -1][i], flare: 8, fs: 3, ff: [39 + f1[0], f1[1]], fb: [35 + f2[0], f2[1]], hb: [26, 46 + i % 2], hf: [52, 46], after: function (g, af) { sword(af[2], af[3], -4)(g); } };
      case 'hurt':
        return { bx: -2, lean: -3, fs: 3, fb: [31, 69], ff: [42, 68], hb: [24, 34 + i], hf: [46, 33 - i], hdx: -1, eye: 'x', after: function (g, af) { sword(af[2], af[3], -70)(g); } };
      case 'spat':
        // Recibe el escupitajo, se limpia la cara y fulmina a la llama con la mirada
        // (el último fotograma se mantiene mientras dura el aturdimiento).
        var C = [
          { bx: -2, lean: -3, hdx: -1, hf: [44, 36], lvl: 3 },
          { bx: -1, lean: -2, hdx: 0, hf: [39, 31], lvl: 2 },
          { bx: -1, lean: -1, hdx: 1, hf: [44, 31], lvl: 1 },
          { bx: 0, lean: 0, hdx: 1, hf: [45, 51], lvl: 0 }
        ][i];
        var chx = 32 + C.bx + C.lean + C.hdx, chy = 27;
        return {
          bx: C.bx, lean: C.lean, hdx: C.hdx, fs: 2, fb: [31, 69], ff: [42, 69], hb: [30, 53], hf: C.hf,
          eye: i < 3 ? 'x' : 'k', backItem: sword(30, 53, 100),
          after: function (g) {
            splatFace(g, chx + 6, chy + 4, C.lvl, 1.4);
            if (i === 3) g.line(chx + 4, chy + 1, chx + 7, chy + 2, 'k', 1); // ceño fruncido
          }
        };
      case 'defeated':
        if (i === 0) return { bx: -1, lean: -2, by: 2, fb: [31, 69], ff: [42, 69], hb: [27, 50], hf: [44, 54], eye: 'x', fs: 2, after: function (g, af) { sword(af[2], af[3], 95)(g); } };
        return { by: 9, lean: 1, hdy: 2, hdx: 1, fb: [27, 69], ff: [44, 69], hb: [30, 60], hf: [47, 52], eye: 'x', fs: -2, item: sword(48, 52, 90) };
    }
  }
  function capBuild(anim) {
    return function (i) {
      if (anim === 'defeated' && i === 2) {
        var g0 = capFrame(capPose('hurt', 0), 0);
        return g0.fit(176, 176).rotCCW().settle(143, 80).fit(176, 144);
      }
      return capFrame(capPose(anim, i), i);
    };
  }
  KINDS.capitan = {
    box: { w: 72, h: 96 }, anchor: 'feet', scale: 2, res: 2, fw: 176, fh: 144, ax: 72, ay: 144, def: 'idle',
    anims: {
      idle: A(8, 8, true, function (i) { var p = capPose('idle', Math.floor(i / 2)); p.fs = [0, 1, 2, 1, 0, -1, -2, -1][i]; return capFrame(p, i * 0.5); }),
      walk: A(6, 7, true, capBuild('walk')),
      slash: A(5, 10, false, capBuild('slash')),
      shoot: A(4, 8, false, capBuild('shoot')),
      charge: A(4, 12, true, capBuild('charge')),
      hurt: A(2, 8, true, capBuild('hurt')),
      spat: A(4, 8, false, capBuild('spat')),
      defeated: A(3, 3, false, capBuild('defeated'))
    }
  };

  /* ------------------------------------------------------------------ */
  /* PERRO alano                                                         */
  /* ------------------------------------------------------------------ */
  var HEAD_DOG = [
    '.zz.........',
    'zyyz........',
    'yyyyyyy.....',
    'yyyyyyyyy...',
    'yyyykyyyzz..',
    'yyyyyyyzzzzD',
    'Yyyyyyzzzzzz',
    '.YYYYzzzzzk.',
    '..YYYYzzz...',
    '...YYYY.....'
  ];
  var HEAD_DOG_OPEN = [
    '.zz.........',
    'zyyz........',
    'yyyyyyy.....',
    'yyyyyyyyy...',
    'yyyykyyyzz..',
    'yyyyyyyzzzzD',
    'Yyyyyyzzxxx.',
    '.YYYYzj.....',
    '..YYYzzxx...',
    '...YYYzzz...'
  ];
  function dogFrame(p) {
    var g = new HGrid(52, 32);
    var by = p.by || 0, bx = p.bx || 0, pt = p.pitch || 0;
    function Y(x, y) { return y + by + Math.round((x - 24) * pt); }
    var sh = [31 + bx, Y(31, 20)], hp = [14 + bx, Y(14, 19)];
    // patas lejanas
    var r1 = limb(g, sh[0] - 1, sh[1], p.ff[0], p.ff[1], 6, 6, -1, 'Y', 'Y', 2); g.dot(r1[2], r1[3], 'z', 2);
    var r2 = limb(g, hp[0] - 1, hp[1], p.rf[0], p.rf[1], 6, 6, -1, 'Y', 'Y', 2); g.dot(r2[2], r2[3], 'z', 2);
    // cola
    var tw = p.tail || 0;
    g.line(9 + bx, Y(9, 14), 5 + bx, Y(5, 15 + tw), 'y', 2);
    g.line(5 + bx, Y(5, 15 + tw), 3 + bx, Y(3, 20 + tw * 2), 'Y', 1);
    // cuerpo atigrado
    function coat(cy) {
      return function (x, y) {
        if (y > cy + 2) return 'Y';
        if ((x + Math.floor(y * 0.6)) % 4 === 0) return 'z';
        return y < cy - 3 ? 'Z' : ((x + y) % 7 === 0 ? 'Y' : 'y');
      };
    }
    g.ellipse(23 + bx, Y(23, 17), 10, 4.6, coat(Y(23, 17)));
    g.ellipse(14 + bx, Y(14, 16), 5, 5, coat(Y(14, 16)));
    g.ellipse(31 + bx, Y(31, 18), 5, 5.8, coat(Y(31, 18)));
    g.set(35 + bx, Y(35, 19), 'w'); g.set(35 + bx, Y(35, 20), 'w'); g.set(34 + bx, Y(34, 21), 'W'); // pecho blanco
    // cuello y cabeza
    g.ellipse(35 + bx, Y(35, 12) + (p.hdy || 0) / 2, 3.2, 4.2, coat(Y(35, 12)));
    var hx = 34 + bx + (p.hdx || 0), hy = Y(34, 4) + (p.hdy || 0);
    g.blit(p.open ? HEAD_DOG_OPEN : HEAD_DOG, hx, hy);
    if (p.eye) g.set(hx + 4, hy + 4, p.eye);
    // collar de púas
    g.line(hx - 1, hy + 5, hx + 1, hy + 10, 'd', 2);
    g.set(hx - 2, hy + 5, 'm'); g.set(hx - 2, hy + 8, 'm'); g.set(hx - 1, hy + 11, 'm'); g.set(hx, hy + 7, 'x');
    // patas cercanas
    var r3 = limb(g, sh[0] + 1, sh[1], p.fn[0], p.fn[1], 6, 6, -1, 'y', 'y', 2); g.dot(r3[2], r3[3], 'D', 2);
    var r4 = limb(g, hp[0] + 1, hp[1], p.rn[0], p.rn[1], 6, 6, -1, 'y', 'Y', 2); g.dot(r4[2], r4[3], 'D', 2);
    if (p.after) p.after(g);
    return g.finishHi();
  }
  var GALLOP = [
    { by: 0, fn: [40, 26], ff: [42, 25], rn: [6, 26], rf: [8, 27], tail: 1 },
    { by: 1, fn: [36, 30], ff: [34, 30], rn: [11, 24], rf: [13, 25], tail: 0 },
    { by: 1, fn: [31, 30], ff: [29, 29], rn: [17, 26], rf: [19, 27], tail: -1 },
    { by: 0, fn: [26, 28], ff: [24, 26], rn: [21, 30], rf: [19, 30], tail: -1 },
    { by: -1, fn: [34, 24], ff: [36, 23], rn: [15, 30], rf: [13, 30], tail: 0 },
    { by: -1, fn: [38, 25], ff: [40, 24], rn: [9, 29], rf: [10, 28], tail: 1 }
  ];
  function dogPose(anim, i) {
    switch (anim) {
      case 'idle': return { by: 0, fn: [33, 30], ff: [31, 30], rn: [15, 30], rf: [13, 30], open: i % 2 === 1, tail: i % 2 ? 1 : -1 };
      case 'run': return GALLOP[i];
      case 'lunge': return [
        { by: 2, pitch: 0.06, hdy: 1, fn: [33, 30], ff: [31, 30], rn: [18, 30], rf: [16, 30], tail: -1 },
        { by: -3, pitch: -0.14, fn: [43, 19], ff: [42, 21], rn: [7, 28], rf: [9, 29], open: true, tail: 2 },
        { by: -2, pitch: -0.05, fn: [45, 21], ff: [44, 23], rn: [5, 24], rf: [7, 26], open: true, tail: 2 }
      ][i];
      case 'stunned': return { bx: [-1, 0, 1, 0][i], hdy: 3, hdx: -1, eye: 'x', fn: [36, 30], ff: [32, 30], rn: [10, 30], rf: [15, 30], tail: -2, after: function (g) { stars(g, 40, 3, i, 6); } };
      case 'spat':
        // Sacude la cabeza para quitarse el escupitajo.
        var sb = [-2, -1, 0, 0][i], sh = [-2, 1, -2, 0][i];
        return { bx: sb, hdx: sh, hdy: 2, eye: 'x', open: i % 2 === 1, fn: [36, 30], ff: [32, 30], rn: [10, 30], rf: [15, 30], tail: -2, after: function (g) { splatFace(g, 34 + sb + sh + 5, 9, 3 - i); } };
      case 'hit': return { by: -2, pitch: -0.1, eye: 'x', open: true, fn: [39, 19 + i], ff: [36, 17], rn: [7, 19], rf: [12, 22 - i], tail: 2 };
    }
  }
  function dogBuild(anim) {
    return function (i) {
      if (anim === 'dead') {
        // Alano de lado: lomo horizontal, cabeza apoyada y patas relajadas.
        var g = new HGrid(52, 32);
        g.line(11, 23, 5, 25, 'Y', 2); g.line(5, 25, 3, 28, 'y', 1);
        g.line(17, 25, 13, 30, 'Y', 2); g.line(29, 25, 34, 30, 'Y', 2);
        g.ellipse(23, 25, 13, 4, function (x, y) {
          if (y > 27) return 'Y';
          if ((x + Math.floor(y / 2)) % 5 === 0) return 'z';
          return y < 24 ? 'Z' : 'y';
        });
        g.ellipse(35, 26, 5, 3, 'y');
        g.blit(HEAD_DOG, 35, 20); g.line(39, 24, 41, 24, 'z');
        g.line(34, 23, 34, 28, 'd', 2); g.set(33, 24, 'm');
        g.line(18, 27, 21, 29, 'Z', 2); g.line(21, 29, 17, 30, 'y', 2);
        g.line(30, 27, 32, 29, 'Z', 2); g.line(32, 29, 37, 30, 'y', 2);
        return g.finishHi();
      }
      return dogFrame(dogPose(anim, i));
    };
  }
  KINDS.perro = {
    box: { w: 30, h: 48 }, anchor: 'feet', scale: 2, res: 2, fw: 104, fh: 64, ax: 48, ay: 64, def: 'run',
    anims: {
      idle: A(2, 4, true, dogBuild('idle')),
      run: A(6, 14, true, dogBuild('run')),
      lunge: A(3, 8, false, dogBuild('lunge')),
      stunned: A(4, 6, true, dogBuild('stunned')),
      spat: A(4, 8, false, dogBuild('spat')),
      hit: A(2, 10, true, dogBuild('hit')),
      dead: A(1, 1, false, dogBuild('dead'))
    }
  };

  /* ------------------------------------------------------------------ */
  /* LLAMA compañera                                                     */
  /* ------------------------------------------------------------------ */
  // Cabeza de llama en alta resolución (20×14): cráneo redondo, hocico largo, ojo con brillo.
  var HEAD_LLAMA = [
    '....wwwwwww.............',
    '..wwwwwwwwwww...........',
    '.wwwwwwwwwwwwww.........',
    '.wwwwwwwwwwwwwww........',
    'wwwwwwwkkkwwwwwww.......',
    'wwwwwwkkxkwwwwwwwww.....',
    'wwwwwwwkkkwwwwwwwwwww...',
    'wwwwwwwwwwwwwwwwwwwwwv..',
    'Wwwwwwwwwwwwwwwwwwwwwwv.',
    'Wwwwwwwwwwwwwwwwwwwwwkv.',
    'WWwwwwwwwwwwwwwwwwwwwwv.',
    '.WWwwwwwwwwwwwwwwwwwwv..',
    '..WWwwwwwwwwwwwwwWWWk...',
    '...WWWwwwwwwwwWWWWv.....',
    '....WWWWWWWWWWWWW.......',
    '.....WWWWWWWWWW.........',
    '.......WWWWWW...........'
  ];
  var YARN = ['o', 'j', 't', 'g'];
  function pompom(g, X, Y, c1, c2) {
    for (var j = -2; j <= 2; j++) for (var i = -2; i <= 2; i++) if (i * i + j * j <= 5) g.hset(X + i, Y + j, j > 0 || i > 0 ? c2 : c1);
    g.hset(X - 1, Y - 1, 'x');
  }
  function woolTex(g, X0, Y0, X1, Y1, seed) {
    for (var Y = Y0; Y < Y1; Y++) for (var X = X0; X < X1; X++) {
      if (X < 0 || Y < 0 || X >= g.w || Y >= g.h) continue;
      var at = Y * g.w + X;
      if (g.d[at] !== 'w') continue;
      var hsh = ((X * 73856093) ^ (Y * 19349663) ^ seed) >>> 0, v = (hsh % 1000) / 1000;
      if (v < 0.07) g.d[at] = 'V'; else if (v < 0.12) g.d[at] = 'W';
    }
  }
  // Manta tejida (q'epi) sobre el lomo: bandas de rombos, franja turquesa y flecos de colores.
  function saddle(g, X0, Y0) {
    for (var r = 0; r < 16; r++) for (var i = 0; i < 30; i++) {
      var c = 'r';
      if (r === 0 || r === 15) c = 'R';
      else if (r === 1 || r === 14) c = 'g';
      else if (r === 2 || r === 13) c = 'r';
      else if (r <= 5 || r >= 10) {
        var rr = r >= 10 ? r - 10 : r - 3, v = Math.abs((i + (r >= 10 ? 3 : 0)) % 6 - 2.5);
        c = Math.abs(v - rr) < 0.75 ? 'w' : (r >= 10 ? 'j' : 'q');
      } else {
        c = ((i >> 1) + r) % 2 ? 't' : 'T';
        if (i % 8 === 3 || i % 8 === 4) c = r === 7 || r === 8 ? 'g' : 'o';
      }
      if (i === 0 || i === 29) c = 'R';
      g.hset(X0 + i, Y0 + r, c);
    }
    for (var k = 1; k < 29; k += 2) {
      var len = 2 + (k % 3);
      for (var j = 0; j < len; j++) g.hset(X0 + k, Y0 + 16 + j, YARN[(k >> 1) % 4]);
    }
    pompom(g, X0 - 1, Y0 + 15, 'j', 'J'); pompom(g, X0 + 30, Y0 + 15, 't', 'T');
  }
  function llamaFrame(p, i) {
    var g = new HGrid(48, 56, 4);
    var by = p.by || 0, hdx = p.hdx || 0, hdy = p.hdy || 0;
    var sh = [25, 35 + by], hp = [11, 35 + by];
    function lleg(h, f, c1, c2, hoof) {
      var r = limb(g, h[0], h[1], f[0], f[1], 8, 8, -1, c1, c2, 2);
      g.hrect(Math.round(r[2] * 2), Math.round(r[3] * 2) + 2, 4, 2, hoof);
    }
    lleg([sh[0] - 1, sh[1]], p.ff, 'W', 'W', 'v');
    lleg([hp[0] - 1, hp[1]], p.rf, 'W', 'W', 'v');
    // cola
    g.ellipse(6, 28 + by, 2, 2.4, 'w');
    // cuerpo de lana
    var cy = 31 + by;
    g.ellipse(18, cy, 11.5, 6.6, function (x, y) {
      if (y > cy + 4) return 'W';
      return y < cy - 3 ? 'V' : 'w';
    });
    // cuello hacia la cabeza (en píxeles finos)
    var top = 12 + by + hdy, nx = 29 + hdx, Yt = top * 2, Yb = (30 + by) * 2;
    for (var Y = Yt; Y <= Yb; Y++) {
      var t = (Y - Yt) / (Yb - Yt), cx = Math.round(nx * 2 + (48 - nx * 2) * t) + 1;
      for (var k = -5; k <= 4; k++) g.hset(cx + k, Y, k >= 3 ? 'W' : 'w');
    }
    woolTex(g, 0, 0, g.w, g.h, 7 + i);
    saddle(g, 20, (23 + by) * 2);
    // cabeza, orejas y borlas
    var hx = 27 + hdx, hy = 5 + by + hdy, HX = hx * 2, HY = hy * 2;
    var e1 = p.ear ? -3 : 0, e2 = i % 3 === 0 ? 1 : 0, k2;
    if (p.earsDown) {
      for (k2 = 0; k2 < 3; k2++) g.hline(HX + 1 + k2, HY, HX - 10 + k2, HY - 3 + k2, 'W');
      for (k2 = 0; k2 < 3; k2++) g.hline(HX + 5 + k2, HY - 1, HX - 6 + k2, HY - 6 + k2, k2 === 1 ? 'j' : 'w');
    } else {
      for (k2 = 0; k2 < 3; k2++) g.hline(HX + k2, HY - 1, HX - 1 + e1 + k2, HY - 13, 'W');
      for (k2 = 0; k2 < 3; k2++) g.hline(HX + 5 + k2, HY - 1, HX + 6 + e2 + k2, HY - 13, k2 === 1 ? 'j' : 'w');
    }
    g.hblit(HEAD_LLAMA, HX - 2, HY - 3);
    // borlas de lana (aretes) rosada y turquesa colgando de las orejas
    pompom(g, HX - 2, HY - 2, 'j', 'J'); g.hline(HX - 2, HY + 1, HX - 3, HY + 5, 'j'); g.hline(HX - 1, HY + 1, HX - 1, HY + 4, 'o');
    pompom(g, HX + 10, HY - 3, 't', 'T'); g.hline(HX + 10, HY, HX + 11, HY + 3, 't'); g.hset(HX + 9, HY + 1, 'g');
    var EX = HX + 6, EY = HY + 2;
    if (p.eyeWide) { g.hrect(EX - 1, EY - 1, 4, 4, 'k'); g.hset(EX, EY - 1, 'x'); g.hset(EX + 1, EY - 1, 'x'); }
    if (p.happy) { g.hrect(EX - 1, EY - 1, 3, 3, 'w'); g.hset(EX - 2, EY + 1, 'k'); g.hset(EX - 1, EY, 'k'); g.hset(EX, EY - 1, 'k'); g.hset(EX + 1, EY - 1, 'k'); g.hset(EX + 2, EY, 'k'); g.hset(EX + 3, EY + 1, 'k'); }
    if (p.worry) { g.hset(EX - 1, EY - 3, 'v'); g.hset(EX, EY - 3, 'v'); g.hset(EX + 1, EY - 2, 'v'); g.hset(EX - 2, EY + 4, 't'); g.hset(EX - 2, EY + 5, 'T'); }
    if (p.cheeks) { for (var cyy = -2; cyy <= 2; cyy++) for (var cxx = -3; cxx <= 3; cxx++) if (cxx * cxx / 9 + cyy * cyy / 4 <= 1) g.hset(HX + 15 + cxx, HY + 9 + cyy, cyy === 2 ? 'W' : 'w'); }
    if (p.chew) { g.hset(HX + 16, HY + 10, 'W'); g.hset(HX + 15, HY + 10, 'k'); }
    if (p.open) { g.hrect(HX + 15, HY + 9, 4, 1, 'k'); g.hset(HX + 16, HY + 10, 'R'); }
    if (p.puff) { g.hset(HX + 16, HY + 7, 'W'); g.hset(HX + 17, HY + 7, 'W'); }
    lleg([sh[0] + 1, sh[1]], p.fn, 'w', 'w', 'v');
    lleg([hp[0] + 1, hp[1]], p.rn, 'w', 'W', 'v');
    if (p.after) p.after(g, hx, hy);
    g.oy = 0;
    return g.finishHi();
  }
  function llamaPose(anim, i) {
    switch (anim) {
      case 'idle':
        return { fn: [27, 50], ff: [24, 50], rn: [13, 50], rf: [10, 50], ear: i === 2, chew: i % 2 === 1, hdy: i === 3 ? 1 : 0 };
      case 'walk':
        return [
          { fn: [29, 50], rn: [15, 50], ff: [22, 50], rf: [8, 50] },
          { by: -1, fn: [26, 47], rn: [12, 47], ff: [24, 50], rf: [10, 50], hdy: 1 },
          { fn: [22, 50], rn: [8, 50], ff: [29, 50], rf: [15, 50] },
          { by: -1, fn: [24, 50], rn: [10, 50], ff: [26, 47], rf: [12, 47], hdy: 1 }
        ][i];
      case 'run':
        return [
          { by: 0, hdx: 2, fn: [32, 49], rn: [17, 50], ff: [20, 50], rf: [5, 49] },
          { by: -2, hdx: 2, hdy: 1, fn: [28, 44], rn: [14, 45], ff: [23, 48], rf: [9, 48] },
          { by: 0, hdx: 2, fn: [20, 50], rn: [5, 49], ff: [32, 49], rf: [17, 50] },
          { by: -2, hdx: 2, hdy: 1, fn: [23, 48], rn: [9, 48], ff: [28, 44], rf: [14, 45] }
        ][i];
      case 'spit':
        // Preparación, cachetes inflados, escupitajo, sacudida y orgullo (0,5 s).
        var base = { fn: [27, 50], ff: [24, 50], rn: [13, 50], rf: [10, 50] };
        if (i === 0) return mix(base, { hdx: -1, hdy: -2, ear: true });
        if (i === 1) return mix(base, { hdx: -2, hdy: -1, cheeks: true, ear: true });
        if (i === 2) return mix(base, { hdx: 3, hdy: 1, open: true, after: function (g, hx, hy) { g.ellipse(hx + 13, hy + 5, 2, 1.5, 'p'); g.set(hx + 12, hy + 6, 'P'); g.set(hx + 10, hy + 4, 'p'); g.set(hx + 16, hy + 3, 'p'); } });
        if (i === 3) return mix(base, { hdx: 2, ear: true, after: function (g, hx, hy) { g.set(hx - 2, hy + 2, 'L'); g.set(hx - 3, hy + 4, 'L'); g.set(hx + 11, hy + 3, 'L'); } });
        return mix(base, { hdx: -1, hdy: -3, happy: true });
      case 'proud':
        return { fn: [27, 50], ff: [24, 50], rn: [13, 50], rf: [10, 50], hdx: -1, hdy: -3 - (i % 2), happy: true, ear: i === 1, after: function (g, hx, hy) { if (i === 0) { g.set(hx + 11, hy - 1, 'g'); g.set(hx + 12, hy, 'G'); } } };
      case 'surprise':
        return { by: i === 0 ? -1 : 0, fn: [27, 50], ff: [24, 50], rn: [13, 50], rf: [10, 50], hdx: -3, hdy: -1, eyeWide: true };
      case 'look':
        return { fn: [27, 50], ff: [24, 50], rn: [13, 50], rf: [10, 50], hdx: [-2, -2, 1, 1][i], ear: i === 1 || i === 3, chew: i === 2 };
      case 'worry':
        return { fn: [27, 50], ff: [24, 50], rn: [13, 50], rf: [10, 50], hdx: -1, hdy: 2, earsDown: true, worry: true, chew: i === 1 };
      case 'celebrate':
        var hop = [0, -3, -4, -1][i], tuck = hop < -2 ? 2 : 0;
        return {
          by: hop, hdx: -1, hdy: -2, happy: true, ear: i % 2 === 1,
          fn: [28, 50 + hop - tuck], ff: [25, 50 + hop], rn: [14, 50 + hop - tuck], rf: [11, 50 + hop],
          after: function (g, hx, hy) { g.set(hx + 11, hy - 1 + (i % 2), 'g'); g.set(hx - 4, hy + 1 - (i % 2), 'g'); g.set(hx + 13, hy + 3, 'G'); }
        };
    }
  }
  function llamaBuild(anim) { return function (i) { return llamaFrame(llamaPose(anim, i), i); }; }
  KINDS.llama = {
    box: { w: 40, h: 70 }, anchor: 'feet', scale: 2, res: 2, fw: 96, fh: 112, ax: 40, ay: 112, def: 'idle',
    anims: {
      idle: A(8, 6, true, function (i) { var p = llamaPose('idle', Math.floor(i / 2)); p.ear = i === 3 || i === 6; return llamaFrame(p, i); }),
      walk: A(4, 6, true, llamaBuild('walk')),
      run: A(4, 10, true, llamaBuild('run')),
      spit: A(5, 10, false, llamaBuild('spit')),
      proud: A(2, 4, true, llamaBuild('proud')),
      surprise: A(2, 8, true, llamaBuild('surprise')),
      look: A(4, 3, true, llamaBuild('look')),
      worry: A(2, 2, true, llamaBuild('worry')),
      celebrate: A(4, 8, true, llamaBuild('celebrate'))
    }
  };

  /* ------------------------------------------------------------------ */
  /* Proyectiles y efectos                                               */
  /* ------------------------------------------------------------------ */
  function stoneAt(g, cx, cy, i, r) {
    r = r || 2.2;
    var hl = [[-1, -1], [1, -1], [1, 1], [-1, 1]][i % 4];
    g.ellipse(cx, cy, r, r * 0.85, function (x, y) {
      var dx = x - cx, dy = y - cy;
      if (dx * hl[0] + dy * hl[1] > 0.9) return 'c';
      if (dx * hl[0] + dy * hl[1] < -0.9) return 'A';
      return 'a';
    });
  }
  function fx(w, h, ax, ay, fn) { return function (i) { var g = new Grid(w, h); fn(g, i); return g; }; }
  var FLAMEP = [[0, 0, 'i'], [-1, 0, 'f'], [-2, -1, 'f'], [-3, 0, 'F'], [-4, 1, 'F'], [-5, -1, 'I'], [-2, 1, 'F'], [-6, 0, 'I'], [-1, -1, 'f'], [-3, -1, 'F'], [-4, -2, 'I']];
  KINDS.stone = {
    box: { w: 7, h: 6 }, anchor: 'center', scale: 2, fw: 8, fh: 8, ax: 4, ay: 4, def: 'fly',
    anims: { fly: A(4, 16, true, fx(8, 8, 4, 4, function (g, i) { stoneAt(g, 3.5, 3.5, i, 2.3); g.outline(); })) }
  };
  KINDS.fire_stone = {
    box: { w: 13, h: 10 }, anchor: 'center', scale: 2, fw: 16, fh: 10, ax: 8, ay: 5, def: 'fly',
    anims: {
      fly: A(4, 16, true, fx(16, 10, 8, 5, function (g, i) {
        for (var k = 0; k < FLAMEP.length; k++) {
          var q = FLAMEP[(k + i * 3) % FLAMEP.length];
          g.set(9 + q[0] - (k % 3 === i % 3 ? 1 : 0), 5 + q[1] + ((k + i) % 4 === 0 ? 1 : 0), q[2]);
          g.set(7 + q[0] - (k % 2), 5 + q[1] - ((k + i) % 3 === 0 ? 1 : 0), k < 3 ? 'f' : 'F');
        }
        g.set(2 + (i % 2), 4 + (i % 3) - 1, 'I'); g.set(4, 3 + (i % 2) * 3, 'F');
        stoneAt(g, 11, 5, i, 2.3);
        g.set(12, 4, 'F'); g.set(11, 6, 'I');
        g.outline();
        g.set(10, 3, 'f'); g.set(9, 7, 'F');
      }))
    }
  };
  KINDS.boleadora = {
    box: { w: 20, h: 20 }, anchor: 'center', scale: 2, fw: 18, fh: 18, ax: 9, ay: 9, def: 'spin',
    anims: {
      spin: A(4, 14, true, fx(18, 18, 9, 9, function (g, i) {
        var pts = [];
        for (var k = 0; k < 3; k++) { var a = (i * 30 + k * 120) * DEG; pts.push([8.5 + Math.cos(a) * 6, 8.5 + Math.sin(a) * 6]); }
        for (k = 0; k < 3; k++) g.line(8.5, 8.5, pts[k][0], pts[k][1], 'W', 1);
        for (k = 0; k < 3; k++) stoneAt(g, pts[k][0], pts[k][1], i + k, 1.6);
        g.dot(8, 8, 'b', 2);
        g.outline();
      }))
    }
  };
  KINDS.bullet = {
    box: { w: 7, h: 6 }, anchor: 'center', scale: 2, fw: 12, fh: 6, ax: 6, ay: 3, def: 'fly',
    anims: {
      fly: A(2, 20, true, fx(12, 6, 6, 3, function (g, i) {
        g.line(1 + i, 3, 7, 3, 'l', 1); g.line(4, 2, 7, 2, 'l', 1);
        g.rect(8, 2, 2, 2, 'M'); g.set(8, 2, 'm');
        g.outline();
        g.set(10, 2 + i, 'F');
      }))
    }
  };
  // Escupitajo: gota ovalada e irregular, verde claro con brillo amarillento, gotitas y estela.
  KINDS.spit = {
    box: { w: 12, h: 10 }, anchor: 'center', scale: 2, fw: 12, fh: 8, ax: 6, ay: 4, def: 'fly',
    anims: {
      fly: A(3, 14, true, fx(12, 8, 6, 4, function (g, i) {
        g.ellipse(7.5, 4, 2.8 - (i === 1 ? 0.3 : 0), 1.8 + (i === 2 ? 0.4 : 0), 'p');
        g.set(10, 3 + (i % 2), 'p'); g.set(8, 3, 'x'); g.set(9, 3, 'i');
        g.set(6, 5, 'P'); g.set(5, 5, 'P');
        g.set(3, 3 + (i % 2), 'p'); g.set(1, 4 - (i % 2), 'P'); g.set(2, 6 - (i % 3), 'p');
        g.outline('T');
      }))
    }
  };
  // Salpicadura del escupitajo (impacto): mancha verde que se abre en gotas.
  KINDS.splat = {
    box: { w: 22, h: 22 }, anchor: 'center', scale: 2, fw: 16, fh: 16, ax: 8, ay: 8, def: 'burst',
    anims: {
      burst: A(4, 14, false, fx(16, 16, 8, 8, function (g, i) {
        var r = [2.6, 3.8, 4.2, 0][i];
        if (r) { g.ellipse(8, 8, r, r * 0.75, 'P'); g.ellipse(7.5, 7.5, r * 0.6, r * 0.45, 'p'); g.set(7, 7, 'x'); }
        for (var k = 0; k < 6; k++) {
          var a = (k * 60 + i * 17) * DEG, d = 3 + i * 1.8;
          g.set(8 + Math.cos(a) * d, 8 + Math.sin(a) * d * 0.8, k % 2 ? 'p' : 'P');
        }
        if (i < 2) g.outline('T');
      }))
    }
  };
  KINDS.muzzle_flash = {
    box: { w: 12, h: 12 }, anchor: 'center', scale: 2, fw: 16, fh: 14, ax: 3, ay: 7, def: 'burst',
    anims: {
      burst: A(3, 18, false, fx(16, 14, 3, 7, function (g, i) {
        if (i === 0) flashAt(g, 1, 7, 6);
        else if (i === 1) { flashAt(g, 1, 7, 3); puff(g, 9, 6, 3); }
        else { puff(g, 6, 6, 3.5); puff(g, 11, 4, 2); }
      }))
    }
  };
  KINDS.dust = {
    box: { w: 24, h: 12 }, anchor: 'feet', scale: 2, fw: 20, fh: 12, ax: 10, ay: 12, def: 'puff',
    anims: {
      puff: A(5, 12, false, fx(20, 12, 10, 12, function (g, i) {
        var r = 1.6 + i * 0.9;
        if (i < 4) { g.ellipse(10 - i * 1.6, 9 - i * 0.6, r, r * 0.7, 'W'); g.ellipse(10 + i * 1.6, 9 - i * 0.6, r * 0.9, r * 0.6, 'W'); g.ellipse(10, 9 - i, r * 0.8, r * 0.6, 'w'); }
        else { puff(g, 4, 6, 2); puff(g, 16, 6, 2); }
        if (i >= 2 && i < 4) { g.set(10 - i * 3, 8 - i, 'L'); g.set(10 + i * 3, 8 - i, 'L'); }
      }))
    }
  };
  KINDS.hit_spark = {
    box: { w: 16, h: 16 }, anchor: 'center', scale: 2, fw: 14, fh: 14, ax: 7, ay: 7, def: 'burst',
    anims: {
      burst: A(4, 20, false, fx(14, 14, 7, 7, function (g, i) {
        var L = [6, 5, 4, 2][i], c = 7;
        if (i < 3) {
          g.line(c - L, c, c + L, c, i ? 'f' : 'i', 1); g.line(c, c - L, c, c + L, i ? 'f' : 'i', 1);
          var d = Math.round(L * 0.6);
          g.line(c - d, c - d, c + d, c + d, 'F', 1); g.line(c - d, c + d, c + d, c - d, 'F', 1);
          g.rect(c - 1, c - 1, 2, 2, 'i');
        } else {
          g.set(c - 4, c - 3, 'f'); g.set(c + 4, c + 2, 'f'); g.set(c + 2, c - 5, 'F'); g.set(c - 3, c + 4, 'F');
        }
      }))
    }
  };
  // Apacheta / montón de piedras de recarga. Hitbox 40×70, x = centro del montón - 20.
  function pileBase(g) {
    var S = [[13, 35, 3.2], [20, 35, 3.6], [27, 35, 3.2], [16, 31, 3], [24, 31, 3.1], [20, 27.5, 2.8]];
    for (var k = 0; k < S.length; k++) stoneAt(g, S[k][0], S[k][1], k, S[k][2]);
  }
  KINDS.stone_pile = {
    box: { w: 40, h: 70 }, anchor: 'feet', scale: 2, fw: 40, fh: 39, ax: 20, ay: 39, def: 'idle',
    anims: {
      idle: A(1, 1, true, fx(40, 39, 20, 39, function (g) {
        g.line(21, 26, 21, 14, 'u', 1); g.set(21, 14, 'U');
        pileBase(g); g.outline();
      })),
      active: A(4, 6, true, fx(40, 39, 20, 39, function (g, i) {
        g.line(21, 26, 21, 4, 'u', 1); g.set(21, 3, 'g');
        for (var x = 0; x < 14; x++) {
          var wv = Math.round(Math.sin(x * 0.55 - i * 1.57) * (x / 13) * 1.6);
          for (var y = 0; y < 8; y++) {
            var c = 'o';
            if (y === 0 || y === 7) c = 'r';
            else if (y >= 2 && y <= 5) c = TOC[Math.floor((y - 2) / 2) % 3][Math.floor(x / 2) % 5];
            if (y >= 2 && y <= 5 && (y - 2) % 2 === 1) c = DARK[c] || c;
            if (x === 13 && (y === 0 || y === 7)) continue;
            g.set(22 + x, 5 + y + wv, c);
          }
        }
        pileBase(g); g.outline();
      }))
    }
  };

  /* ------------------------------------------------------------------ */
  /* API pública                                                          */
  /* ------------------------------------------------------------------ */
  function frameIndex(A, t, o) {
    if (o && o.frame != null) return ((Math.floor(o.frame) % A.n) + A.n) % A.n;
    var f = Math.floor((t || 0) * A.fps);
    if (!A.loop) return Math.max(0, Math.min(A.n - 1, f));
    return ((f % A.n) + A.n) % A.n;
  }
  function draw(ctx, kind, anim, t, x, y, o) {
    var K = KINDS[kind];
    if (!K || !ctx) return false;
    o = o || {};
    if (kind === 'stone_pile' && o.active && anim !== 'active') anim = 'active';
    var A = K.anims[anim] ? anim : K.def, An = K.anims[A];
    var i = frameIndex(An, t, o), variant = K.variant ? K.variant(o) : 0;
    var f = getFrame(kind, A, i, variant);
    if (!f.canvas) f.canvas = toCanvas(f.grid, false);
    if (!f.canvas) return false;
    var res = K.res || 1, s = (o.scale != null ? o.scale : K.scale) / res;
    var bw = o.w != null ? o.w : K.box.w, bh = o.h != null ? o.h : K.box.h;
    var px = x + bw / 2, py = K.anchor === 'center' ? y + bh / 2 : y + bh;
    var face = o.facing < 0 ? -1 : 1;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.rotation) {
      var cy = y + bh / 2;
      ctx.translate(px, cy); ctx.rotate(o.rotation); ctx.translate(-px, -cy);
    }
    ctx.translate(Math.round(px), Math.round(py));
    ctx.scale(face * s, s);
    if (o.outline) {
      if (f.rimColor !== o.outline) { f.rim = rimCanvas(f.grid, o.outline, res); f.rimColor = o.outline; }
      if (f.rim) ctx.drawImage(f.rim, -K.ax - res, -K.ay - res);
    }
    ctx.drawImage(f.canvas, -K.ax, -K.ay);
    if (o.flash) {
      if (!f.white) f.white = toCanvas(f.grid, true);
      ctx.globalAlpha *= (o.flash === true ? 0.85 : Math.max(0, Math.min(1, o.flash)));
      ctx.drawImage(f.white, -K.ax, -K.ay);
    }
    ctx.restore();
    return true;
  }
  function list() {
    var out = {};
    for (var k in KINDS) {
      var K = KINDS[k], an = {};
      for (var a in K.anims) an[a] = { frames: K.anims[a].n, fps: K.anims[a].fps, loop: K.anims[a].loop };
      out[k] = { box: { w: K.box.w, h: K.box.h }, anchor: K.anchor, scale: K.scale, anims: an };
    }
    return out;
  }
  function size(kind) {
    var K = KINDS[kind];
    if (!K) return null;
    var res = K.res || 1;
    return { w: K.box.w, h: K.box.h, anchor: K.anchor, scale: K.scale, frameW: K.fw / res, frameH: K.fh / res, anchorX: K.ax / res, anchorY: K.ay / res, detail: res };
  }
  var ENEMY_TYPES = ['perro', 'arcabucero', 'piquero', 'capitan'];
  var ALIASES = {
    hero: 'hero', player: 'hero', guerrero: 'hero',
    dog: 'perro', perro: 'perro', alano: 'perro', chaser: 'perro', runner: 'perro',
    shooter: 'arcabucero', arcabucero: 'arcabucero', gunner: 'arcabucero',
    patrol: 'piquero', piquero: 'piquero', pikeman: 'piquero', melee: 'piquero',
    boss: 'capitan', capitan: 'capitan', captain: 'capitan',
    llama: 'llama', pile: 'stone_pile', checkpoint: 'stone_pile', apacheta: 'stone_pile'
  };
  function kindFor(e) {
    if (e == null) return null;
    if (typeof e === 'number') return 'stone_pile';           // piles: [x, ...]
    if (typeof e === 'string') return KINDS[e] ? e : (ALIASES[e] || null);
    if (e.kind && KINDS[e.kind]) return e.kind;
    if (typeof e.type === 'string') return ALIASES[e.type] || (KINDS[e.type] ? e.type : null);
    if (typeof e.type === 'number') return ENEMY_TYPES[e.type] || null;  // enemigos de game.js
    if (e.ammo != null || e.hp != null && e.face != null) return 'hero';  // player
    if (e.life != null || e.vx != null) {                       // shots
      if (e.bola || e.boleadora) return 'boleadora';
      if (e.spit) return 'spit';
      if (e.fire) return 'fire_stone';
      return e.good ? 'stone' : 'bullet';
    }
    if (e.llama) return 'llama';
    return null;
  }
  // Animación sugerida a partir del estado que hoy guarda game.js.
  function animFor(e, kind, time) {
    kind = kind || kindFor(e);
    if (!e || typeof e !== 'object') return KINDS[kind] ? KINDS[kind].def : null;
    switch (kind) {
      case 'hero':
        if (e.hp != null && e.hp <= 0) return 'dead';
        if (e.inv != null && e.inv > 1.2) return 'hurt';
        if (e.ground === false) return e.vy < 0 ? 'jump' : 'fall';
        if (e.cool != null && e.cool > 0.05) return 'throw';
        if (e.crouch) return 'crouch';
        return e.moving || e.vx ? 'run' : 'idle';
      case 'perro': return e.dead ? 'hit' : (e.stun > 0 ? 'stunned' : 'run');
      case 'arcabucero':
        if (e.dead) return 'hit';
        if (e.stun > 0) return 'stunned';
        if (e.cool != null) { if (e.cool > 1.4) return 'fire'; if (e.cool > 0.6) return 'reload'; return 'aim'; }
        return 'idle';
      case 'piquero': return e.dead ? 'hit' : (e.stun > 0 ? 'stunned' : 'walk');
      case 'capitan': return e.dead ? 'defeated' : (e.cool != null && e.cool > 0.7 ? 'shoot' : 'walk');
      default: return KINDS[kind] ? KINDS[kind].def : null;
    }
  }
  function prerender() {
    for (var k in KINDS) {
      var K = KINDS[k], vs = k === 'hero' ? [0, 1, 2, 3] : [0];
      for (var a in K.anims) for (var i = 0; i < K.anims[a].n; i++) for (var v = 0; v < vs.length; v++) {
        var f = getFrame(k, a, i, vs[v]);
        if (!f.canvas) f.canvas = toCanvas(f.grid, false);
      }
    }
  }

  root.ChankasSprites = {
    draw: draw, list: list, size: size, kindFor: kindFor, animFor: animFor, prerender: prerender,
    frameIndex: function (kind, anim, t) { var K = KINDS[kind]; return K && K.anims[anim] ? frameIndex(K.anims[anim], t) : 0; },
    duration: function (kind, anim) { var K = KINDS[kind]; return K && K.anims[anim] ? K.anims[anim].n / K.anims[anim].fps : 0; },
    _grid: function (kind, anim, i, variant) { return getFrame(kind, anim, i, variant || 0).grid; },
    _rimsBuilt: function () { return rimBuilt; },
    palette: HEX
  };
})(typeof window !== 'undefined' ? window : this);

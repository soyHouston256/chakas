/*
 * CHANKAS — mapa de misiones (estilo «mission map» pixel art) del Perú, 1536.
 * Script clásico, sin módulos ni build. Requiere art/peru-data.js (ChankasPeruData)
 * y, opcionalmente, art/sprites.js (ChankasSprites) para la ficha del héroe y la llama.
 *
 * API: window.ChankasMap
 *   prepare()                       -> bool  pre-renderiza las capas estáticas (perezoso en draw)
 *   draw(ctx, t, opts)              -> dibuja el mapa completo
 *        opts: { width, height, progress (etapas completadas, 0..5),
 *                selected (índice de etapa), heroT (posición del héroe en la ruta, 0..4;
 *                fraccional = caminando entre etapas), card (false = sin ficha a la derecha),
 *                layout ('landscape' | 'portrait'; por defecto se deduce de width/height),
 *                cartouche (false = sin la cartela del título; la muestra otra capa) }
 *        'portrait' (pantallas estrechas): encuadre vertical 3:4 centrado en el Perú y la
 *        ruta, con rótulos más grandes; la ficha del canvas no se dibuja.
 *   stages                          -> [{ id, name, place, lat, lon, year, history, fiction,
 *                                         status ('jugable'|'proximamente'), playable }]
 *   statusOf(i, progress)           -> 'completed' | 'current' | 'locked'
 *   stageAt(x, y, opts?)            -> índice de etapa bajo (x, y) en coordenadas del canvas
 *                                      del último draw (o de opts), o -1; acepta el icono
 *                                      y el rótulo con el nombre
 *   buttonAt(x, y)                  -> true si (x, y) cae sobre el botón de la ficha
 *   project(lat, lon)               -> { x, y } en el sistema base 960×540
 *   viewFor(opts)                   -> { layout, sc, tx, ty }: pantalla = base·sc + (tx, ty)
 *   toScreen(bx, by, opts?)         -> [x, y] de un punto base en el canvas
 *   cartoucheLayout(measure, maxW, boost) -> tamaño de la cartela del título y cuerpo de
 *                                      letra para que el texto quepa (función pura)
 *
 * Estilo: capas estáticas a 320×180 (mar, desierto, Andes con relieve y nieve, selva,
 * Titicaca, ríos, vecinos tenues, rosa de los vientos con chakana, cartela) escaladas
 * ×3 sin suavizado; ruta del Qhapaq Ñan, iconos, héroe y ficha se dibujan encima.
 */
(function (root) {
  'use strict';

  var W = 960, H = 540, S = 3, LW = W / S, LH = H / S;
  // Proyección equirectangular ajustada a Perú (lat −18.35…−0.04, lon −81.34…−68.69).
  var LAT0 = 0.2, LON_E = -68.4, X_E = 560, Y0 = 14, SY = 27.2;
  var SX = SY * Math.cos((9.3 * Math.PI) / 180);
  function px(lon) { return X_E + (lon - LON_E) * SX; }
  function py(lat) { return Y0 + (LAT0 - lat) * SY; }
  function project(lat, lon) { return { x: px(lon), y: py(lat) }; }

  /* ------------------------------------------------------------------ */
  /* Encuadres: apaisado (todo el lienzo base) y vertical (Perú y ruta)  */
  /* ------------------------------------------------------------------ */
  // x, y, w, h: recorte del sistema base; k: píxeles de lienzo por unidad base con que se
  // pre-renderizan los textos; boost/labelBoost: aumento de los rótulos. Posiciones de la
  // cartela, rosa de los vientos, leyenda y «Mar del Sur» en unidades base.
  var LAYOUT = {
    landscape: {
      name: 'landscape', x: 0, y: 0, w: W, h: H, k: 1, boost: 1, labelBoost: 1,
      cart: [18, 18], cartMax: 300, compass: [84, 450], sea: [150, 250], legend: [30, 518],
      labelDx: [0, 0, 0, 0, 0], over: {}
    },
    portrait: {
      name: 'portrait', x: 188, y: 10, w: 390, h: 520, k: 2, boost: 1.15, labelBoost: 1.45,
      cart: [204, 22], cartMax: 288, compass: [530, 100], sea: [270, 476], legend: null,
      labelDx: [-20, -16, -42, 0, 0], over: { COLLASUYU: [498, 510], Titicaca: [534, 474], CUNTISUYU: [392, 474] }
    }
  };
  function viewFor(o) {
    o = o || {};
    var cw = +o.width || W, ch = +o.height || H;
    var name = o.layout === 'portrait' || o.layout === 'landscape' ? o.layout : ch > cw ? 'portrait' : 'landscape';
    var P = LAYOUT[name], sc = Math.min(cw / P.w, ch / P.h);
    return { layout: name, P: P, sc: sc, tx: (cw - P.w * sc) / 2 - P.x * sc, ty: (ch - P.h * sc) / 2 - P.y * sc, cw: cw, ch: ch };
  }
  var lastView = null;
  function toScreen(bx, by, o) {
    var V = o ? viewFor(o) : lastView || viewFor();
    return [bx * V.sc + V.tx, by * V.sc + V.ty];
  }
  function toBase(x, y, o) {
    var V = o ? viewFor(o) : lastView || viewFor();
    return [(x - V.tx) / V.sc, (y - V.ty) / V.sc];
  }

  // Cartela del título: el marco se ajusta al texto medido (múltiplo del píxel del mapa) y,
  // si aun así no cabe en maxW, se reduce el cuerpo de letra. Nunca recorta el texto.
  // measure(texto, px) -> ancho del texto en 'bold {px}px Georgia'.
  var CART_T1 = 'CAMINO DE LA RESISTENCIA', CART_T2 = '— 1536 —', CART_PAD = 14, CART_STROKE = 4;
  function cartoucheLayout(measure, maxW, boost) {
    boost = boost || 1;
    maxW = Math.floor((maxW || 300) / S) * S;
    var f1 = Math.round(15 * boost), f2 = Math.round(14 * boost);
    function need() { return Math.max(measure(CART_T1, f1), measure(CART_T2, f2)) + CART_STROKE + CART_PAD * 2; }
    while (need() > maxW && f1 > 8) { f1--; if (f2 > f1) f2 = f1; }
    var w = Math.min(maxW, Math.ceil(need() / S) * S);
    var h = Math.ceil(((f1 + f2) * 2.07) / S) * S;
    return { w: w, h: h, f1: f1, f2: f2, t1: CART_T1, t2: CART_T2, y1: Math.round(h * 0.37), y2: Math.round(h * 0.72), textW: need() - CART_PAD * 2 };
  }

  /* ------------------------------------------------------------------ */
  /* Etapas                                                              */
  /* ------------------------------------------------------------------ */
  // node: posición del icono en pantalla (base 960×540). Las etapas están muy juntas a esta
  // escala (Lima y El Callao distan 0.1°), así que el icono se separa y una línea de guía
  // señala el punto geográfico real.
  var stages = [
    {
      id: 'sacsayhuaman', name: 'Sacsayhuamán', place: 'Cusco', lat: -13.51, lon: -71.98,
      year: '1536', node: [510, 412], icon: 'fort',
      history: 'Mayo de 1536: Manco Inca cerca el Cusco. En el asalto a Sacsayhuamán muere Juan Pizarro, pero la fortaleza cae en manos españolas.',
      fiction: 'Ficción: tu guerrero y su llama abren el paso de los andenes.',
      status: 'jugable', playable: true
    },
    {
      id: 'ollantaytambo', name: 'Ollantaytambo', place: 'Valle Sagrado', lat: -13.26, lon: -72.26,
      year: '1537', node: [452, 344], icon: 'terraces',
      history: 'Enero de 1537: Manco Inca desvía las aguas e inunda la llanura; la caballería de Hernando Pizarro se retira de noche.',
      fiction: 'Ficción: el jefe será Hernando Pizarro a caballo.',
      status: 'proximamente', playable: false
    },
    {
      id: 'desfiladeros', name: 'Los desfiladeros', place: 'Parcos, cuenca del Mantaro', lat: -12.63, lon: -74.62,
      year: '1536', node: [392, 420], icon: 'gorge',
      history: '1536: las tropas de Quizo Yupanqui emboscan en las quebradas a las columnas de auxilio; la de Diego Pizarro cae cerca de Parcos.',
      fiction: 'Ficción: las rocas vuelven a rodar desde las laderas.',
      status: 'proximamente', playable: false
    },
    {
      id: 'lima', name: 'Ciudad de los Reyes', place: 'Lima', lat: -12.05, lon: -77.04,
      year: '1536', node: [344, 292], icon: 'city',
      history: 'Agosto de 1536: Quizo Yupanqui asalta Lima, pero es rechazado y herido de muerte; sus tropas vuelven a la sierra.',
      fiction: 'Ficción: el juego imagina otro final. Jefe: Francisco Pizarro.',
      status: 'proximamente', playable: false
    },
    {
      id: 'callao', name: 'El Callao', place: 'Bahía de Lima', lat: -12.06, lon: -77.15,
      year: '1536', node: [262, 360], icon: 'ships',
      history: 'La bahía del Callao era el fondeadero de Lima; por mar, Pizarro pidió auxilio a Panamá, Guatemala y Nicaragua.',
      fiction: 'Ficción: batalla inventada. Quema los galeones «La Codiciosa» y «San Avaricio».',
      status: 'proximamente', playable: false
    }
  ];
  // Puntos intermedios de la ruta (Qhapaq Ñan por la sierra): Pisac/Calca, Abancay–Vilcas,
  // Jauja, valle del Rímac. Coordenadas de pantalla base.
  var WAYPOINTS = [
    [[492, 368]],
    [[418, 372]],
    [[372, 360], [362, 318]],
    [[300, 300]]
  ];

  function statusOf(i, progress) {
    progress = clampProgress(progress);
    return i < progress ? 'completed' : i === progress ? 'current' : 'locked';
  }
  function clampProgress(p) {
    p = Math.floor(+p || 0);
    return p < 0 ? 0 : p > stages.length ? stages.length : p;
  }

  /* ------------------------------------------------------------------ */
  /* Ruta: Catmull-Rom por nodos y puntos intermedios                    */
  /* ------------------------------------------------------------------ */
  var route = null; // { pts: [[x,y,dist]], nodeDist: [] , total }
  function buildRoute() {
    var ctrl = [], nodeIdx = [];
    for (var i = 0; i < stages.length; i++) {
      nodeIdx.push(ctrl.length);
      ctrl.push(stages[i].node);
      if (i < WAYPOINTS.length) for (var j = 0; j < WAYPOINTS[i].length; j++) ctrl.push(WAYPOINTS[i][j]);
    }
    var pts = [], nodeDist = [], d = 0, prev = null;
    for (var k = 0; k < ctrl.length - 1; k++) {
      var p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
      for (var s = 0; s < 24; s++) {
        var t = s / 24, t2 = t * t, t3 = t2 * t;
        var x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        var y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        if (prev) d += Math.hypot(x - prev[0], y - prev[1]);
        if (s === 0 && nodeIdx.indexOf(k) >= 0) nodeDist.push(d);
        prev = [x, y, d];
        pts.push(prev);
      }
    }
    var last = ctrl[ctrl.length - 1];
    d += Math.hypot(last[0] - prev[0], last[1] - prev[1]);
    pts.push([last[0], last[1], d]);
    nodeDist.push(d);
    route = { pts: pts, nodeDist: nodeDist, total: d };
  }
  function routeAt(dist) {
    var P = route.pts, lo = 0, hi = P.length - 1;
    if (dist <= 0) return P[0];
    if (dist >= route.total) return P[hi];
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (P[m][2] < dist) lo = m; else hi = m; }
    var a = P[lo], b = P[hi], f = (dist - a[2]) / (b[2] - a[2] || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, dist];
  }
  function distOfT(heroT) {
    var n = route.nodeDist, T = Math.max(0, Math.min(n.length - 1, +heroT || 0)), i = Math.floor(T);
    if (i >= n.length - 1) return n[n.length - 1];
    return n[i] + (n[i + 1] - n[i]) * (T - i);
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades: ruido, dithering, paleta                                */
  /* ------------------------------------------------------------------ */
  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { return vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var C = {
    deep: rgb('#173f63'), sea: rgb('#1f5680'), shelf: rgb('#2c6f98'), foam: rgb('#d8eef2'), wave: rgb('#5b9cc0'),
    sand: rgb('#d9b46a'), sand2: rgb('#c49650'), sand3: rgb('#e6c789'),
    hill: rgb('#9a7448'), rock: rgb('#7d6450'), rock2: rgb('#5f4a3c'), high: rgb('#8e8478'), snow: rgb('#eef3f4'), snowS: rgb('#b9c6cf'),
    puna: rgb('#a39058'), ceja: rgb('#3e7a3a'), jungle: rgb('#2f6b34'), jungle2: rgb('#245428'), jungle3: rgb('#4c8f42'),
    lake: rgb('#2a78a8'), lake2: rgb('#3f93c0'), river: rgb('#3f8fc0'),
    coast: rgb('#10283c'), border: rgb('#3a1f14'), nbBorder: rgb('#6d5a4a'), fade: rgb('#c9b99a')
  };
  function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }

  // Eje de la cordillera (lat, lon) y semiancho en grados.
  var AXIS = [[3, -77.6], [0, -78.3], [-2, -79.0], [-3.5, -79.5], [-5.5, -79.2], [-7.2, -78.1], [-9.5, -77.2], [-10.7, -76.3],
    [-12.1, -75.3], [-13.2, -74.1], [-13.8, -72.4], [-14.6, -71.0], [-16.0, -70.4], [-17.5, -69.8], [-21, -68.6]];
  function axisAt(lat) {
    for (var i = 0; i < AXIS.length - 1; i++) {
      var a = AXIS[i], b = AXIS[i + 1];
      if (lat <= a[0] && lat >= b[0]) {
        var f = (lat - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * f;
      }
    }
    return lat > 0 ? AXIS[0][1] : AXIS[AXIS.length - 1][1];
  }
  function halfWidth(lat) {
    if (lat > -6) return 1.3;
    if (lat > -11) return 1.3 + ((-6 - lat) / 5) * 0.5;
    if (lat > -14) return 1.8 + ((-11 - lat) / 3) * 0.4;
    return 2.2 + Math.min(1, (-14 - lat) / 3) * 0.4;
  }

  /* ------------------------------------------------------------------ */
  /* Rasterizado de polígonos (punto en polígono, sin canvas)            */
  /* ------------------------------------------------------------------ */
  function polyLL(poly) { // [lat,lon] -> [x,y] en baja resolución
    var out = [];
    for (var i = 0; i < poly.length; i++) out.push([px(poly[i][1]) / S, py(poly[i][0]) / S]);
    return out;
  }
  function fillPoly(mask, poly, id) {
    // relleno por filas (regla par-impar) en el centro de cada píxel
    var n = poly.length;
    for (var y = 0; y < LH; y++) {
      var cy = y + 0.5, xs = [];
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var a = poly[i], b = poly[j];
        if ((a[1] > cy) !== (b[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(LW - 1, Math.floor(xs[k + 1] - 0.5));
        for (var x = x0; x <= x1; x++) mask[y * LW + x] = id;
      }
    }
  }
  function linePix(buf, ids, a, b, col, onlyLand) {
    var x0 = Math.round(a[0]), y0 = Math.round(a[1]), x1 = Math.round(b[0]), y1 = Math.round(b[1]);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) {
      if (x0 >= 0 && y0 >= 0 && x0 < LW && y0 < LH) {
        var k = y0 * LW + x0;
        if (!onlyLand || (ids[k] > 0 && ids[k] !== LAKE)) { buf[k * 4] = col[0]; buf[k * 4 + 1] = col[1]; buf[k * 4 + 2] = col[2]; }
      }
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Capas estáticas                                                     */
  /* ------------------------------------------------------------------ */
  var PERU = 1, LAKE = 9;
  var L = null; // { base, waves[], overlay, icons{}, grey{}, cards{}, labels{}, routes[], frame }
  function canvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext && c.getContext('2d');
    return g ? c : null;
  }

  function terrain(lat, lon, x, y, ids, k) {
    var d = lon - axisAt(lat), hw = halfWidth(lat);
    var n = fbm(x * 0.09, y * 0.09);
    var e = 1 - Math.abs(d) / hw + (n - 0.5) * 0.55;
    // Altiplano (sur-este): meseta alta y amarillenta alrededor del Titicaca
    var alti = lat < -14.2 && d > -0.6 && d < 1.6;
    if (e > 0) {
      // Macizos separados, luz del noroeste y barrancos oblicuos al eje.
      var ridge = Math.sin(y * 0.43 + d * 3.4 + vnoise(x * 0.18, y * 0.18) * 5);
      var valley = Math.abs(Math.sin(y * 0.24 + d * 4.7));
      var core = Math.max(0, 1 - Math.abs(d) / 0.85);
      var col = alti ? mix(C.puna, C.hill, n * 0.5) :
        e < 0.22 ? mix(d < 0 ? C.sand2 : C.ceja, C.hill, 0.65) :
        mix(C.hill, C.high, core * 0.55);
      if (ridge > 0.35) col = mix(col, C.sand3, 0.27);
      if (ridge < -0.15 || valley < 0.2) col = mix(col, C.rock2, 0.48);
      if (d > 0.15 && ridge < 0.35) col = mix(col, C.rock2, 0.28);
      if (valley > 0.93 && ridge > 0) col = mix(col, C.sand3, 0.2);
      return col;
    }
    if (d < 0) {
      // desierto costero: ocre con dunas
      var dune = Math.sin(y * 0.8 + x * 0.3 + vnoise(x * 0.12, y * 0.12) * 5);
      return dune > 0.8 ? C.sand3 : dune < -0.82 ? C.sand2 : C.sand;
    }
    // Copas redondeadas y escalonadas con claros irregulares.
    var ty = Math.floor(y / 5), tx = Math.floor((x + (ty & 1) * 2) / 5);
    var seed = hash(tx, ty), ox = (x + (ty & 1) * 2) % 5 - 2;
    var oy = y % 5 - 2, crown = Math.abs(ox) + Math.abs(oy);
    var jn = vnoise(x * 0.12, y * 0.12);
    ox -= seed > 0.6 ? 1 : 0;
    if (seed < 0.15 || crown > 3 || (oy > 1 && ox > 0)) return C.jungle2;
    if (oy < 0 && ox <= 0 && seed > 0.35) return jn > 0.5 ? C.jungle3 : C.ceja;
    return oy > 0 && ox > 0 ? C.jungle2 : jn > 0.62 ? C.ceja : C.jungle;

  }

  function buildBase() {
    var D = root.ChankasPeruData;
    if (!D) return null;
    var ids = new Uint8Array(LW * LH);
    var nb = ['Ecuador', 'Colombia', 'Brazil', 'Bolivia', 'Chile'];
    for (var i = 0; i < nb.length; i++) {
      var polys = (D.neighbors && D.neighbors[nb[i]]) || [];
      for (var j = 0; j < polys.length; j++) fillPoly(ids, polyLL(polys[j]), 2 + i);
    }
    fillPoly(ids, polyLL(D.peru), PERU);
    if (D.titicaca) fillPoly(ids, polyLL(D.titicaca), LAKE);
    var base = canvas(LW, LH), g = base.getContext('2d');
    var img = g.createImageData(LW, LH), buf = img.data;
    // distancia a tierra (para la plataforma costera)
    var near = new Float32Array(LW * LH).fill(99);
    for (var y = 0; y < LH; y++) for (var x = 0; x < LW; x++) if (ids[y * LW + x] && ids[y * LW + x] !== LAKE) near[y * LW + x] = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (y = 0; y < LH; y++) for (x = 0; x < LW; x++) {
        var k = y * LW + x, v = near[k];
        if (pass === 0) {
          if (x > 0) v = Math.min(v, near[k - 1] + 1);
          if (y > 0) v = Math.min(v, near[k - LW] + 1);
          if (x > 0 && y > 0) v = Math.min(v, near[k - LW - 1] + 1.4);
          if (x < LW - 1 && y > 0) v = Math.min(v, near[k - LW + 1] + 1.4);
        }
        near[k] = v;
      }
      if (pass === 0) for (y = LH - 1; y >= 0; y--) for (x = LW - 1; x >= 0; x--) {
        k = y * LW + x; v = near[k];
        if (x < LW - 1) v = Math.min(v, near[k + 1] + 1);
        if (y < LH - 1) v = Math.min(v, near[k + LW] + 1);
        if (x < LW - 1 && y < LH - 1) v = Math.min(v, near[k + LW + 1] + 1.4);
        if (x > 0 && y < LH - 1) v = Math.min(v, near[k + LW - 1] + 1.4);
        near[k] = v;
      }
    }
    for (y = 0; y < LH; y++) for (x = 0; x < LW; x++) {
      k = y * LW + x;
      var id = ids[k], col;
      var lat = LAT0 - ((y + 0.5) * S - Y0) / SY, lon = LON_E + ((x + 0.5) * S - X_E) / SX;
      if (id === 0) {
        var dd = near[k], dt = bayer(x, y);
        col = dd < 3 + dt * 2 ? C.shelf : dd < 9 + dt * 4 ? C.sea : C.deep;
      } else if (id === LAKE) {
        var shore = x > 0 && x < LW - 1 && y > 0 && y < LH - 1 &&
          (ids[k - 1] !== LAKE || ids[k + 1] !== LAKE || ids[k - LW] !== LAKE || ids[k + LW] !== LAKE);
        col = shore ? C.shelf : (y % 4 === 0 && (x + y * 2) % 7 < 3) ? [136, 193, 205] : C.lake;
      } else {
        col = terrain(lat, lon, x, y, ids, k);
        if (id !== PERU) col = mix(col, C.fade, 0.55);
      }
      buf[k * 4] = col[0]; buf[k * 4 + 1] = col[1]; buf[k * 4 + 2] = col[2]; buf[k * 4 + 3] = 255;
    }
    // Cumbres cónicas escalonadas; su sombra se proyecta al este.
    var peaks = [[-5.4, -79.1, 4], [-7.3, -78.0, 5], [-9.1, -77.5, 8],
      [-9.8, -77.1, 6], [-11.5, -75.7, 6], [-13.0, -74.1, 5],
      [-13.7, -72.6, 7], [-14.7, -71.2, 6], [-16.0, -70.5, 7], [-17.1, -69.9, 5]];
    function paint(x, y, color) {
      if (x < 0 || y < 0 || x >= LW || y >= LH) return;
      var k = y * LW + x;
      if (!ids[k] || ids[k] === LAKE) return;
      if (ids[k] !== PERU) color = mix(color, C.fade, 0.55);
      buf[k * 4] = color[0]; buf[k * 4 + 1] = color[1]; buf[k * 4 + 2] = color[2];
    }
    for (i = 0; i < peaks.length; i++) {
      var peak = peaks[i], cx = Math.round(px(peak[1]) / S), cy = Math.round(py(peak[0]) / S), ph = peak[2];
      for (var yy = 0; yy <= ph; yy++) {
        for (var xx = 0; xx <= Math.floor(yy * 0.7); xx++) paint(cx + xx + 2, cy + yy + 2, C.rock2);
      }
      for (yy = ph; yy >= 0; yy--) {
        var span = Math.floor(yy * 0.7);
        for (xx = -span; xx <= span; xx++) {
          var snowy = yy < ph * 0.42 || (yy < ph * 0.65 && (xx === -1 || xx === 1));
          paint(cx + xx, cy + yy, snowy ? (xx <= 0 ? C.snow : C.snowS) :
            xx < 0 ? C.high : xx === 0 ? C.rock : C.rock2);
        }
      }
    }
    // ríos (antes de los bordes)
    var rivers = D.rivers || [];
    for (i = 0; i < rivers.length; i++) {
      var r = polyLL(rivers[i].pts);
      for (j = 0; j + 1 < r.length; j++) {
        var large = rivers[i].pts[j][0] > -10;
        if (large) linePix(buf, ids, [r[j][0] + 1, r[j][1]], [r[j + 1][0] + 1, r[j + 1][1]], C.shelf, true);
        linePix(buf, ids, r[j], r[j + 1], large ? [112, 180, 198] : C.river, true);
      }
    }
    // bordes: costa (oscura), frontera de Perú (marrón), fronteras vecinas (punteadas tenues)
    for (y = 0; y < LH; y++) for (x = 0; x < LW; x++) {
      k = y * LW + x; id = ids[k];
      if (!id || id === LAKE) continue;
      var nbs = [x > 0 ? ids[k - 1] : id, x < LW - 1 ? ids[k + 1] : id, y > 0 ? ids[k - LW] : id, y < LH - 1 ? ids[k + LW] : id];
      var sea = false, other = false, lake = false;
      for (var q = 0; q < 4; q++) { if (nbs[q] === 0) sea = true; else if (nbs[q] === LAKE) lake = true; else if (nbs[q] !== id) other = true; }
      col = null;
      if (sea) col = id === PERU ? C.coast : mix(C.coast, C.fade, 0.45);
      else if (lake) col = C.coast;
      else if (other && (id === PERU || ((x + y) & 1))) col = id === PERU || nbs.indexOf(PERU) >= 0 ? C.border : C.nbBorder;
      if (col) { buf[k * 4] = col[0]; buf[k * 4 + 1] = col[1]; buf[k * 4 + 2] = col[2]; }
    }
    g.putImageData(img, 0, 0);
    return { canvas: base, ids: ids, near: near };
  }

  // Olas: 4 fotogramas transparentes con trazos «~» que derivan y espuma en la costa.
  function buildWaves(ids, near) {
    var frames = [];
    for (var f = 0; f < 4; f++) {
      var c = canvas(LW, LH), g = c.getContext('2d'), img = g.createImageData(LW, LH), b = img.data;
      for (var y = 0; y < LH; y++) for (var x = 0; x < LW; x++) {
        var k = y * LW + x;
        if (ids[k] !== 0) continue;
        var col = null, a = 255;
        if (near[k] <= 1.5) {
          if ((x + y + f) % 5 !== 0) col = C.foam;
        } else if (near[k] < 6 && Math.abs(near[k] - (2.8 + f * 0.6)) < 0.65 && (x + y) % 7 < 5) {
          col = C.wave; a = 180;
        } else if (y % 7 === (x >> 4) % 7) {
          var cell = Math.floor((x + f * 2) / 7), h = hash(cell, y);
          var off = (x + f * 2) % 7;
          if (h > 0.62 && off < 3) col = near[k] < 10 ? C.foam : C.wave, a = near[k] < 10 ? 150 : 255;
        }
        if (col) { b[k * 4] = col[0]; b[k * 4 + 1] = col[1]; b[k * 4 + 2] = col[2]; b[k * 4 + 3] = a; }
      }
      g.putImageData(img, 0, 0);
      frames.push(c);
    }
    return frames;
  }

  /* --- iconos pixel art (dibujados a 1 px, escalados ×3) --- */
  var PAL = {
    k: '#1b1210', s: '#a79c8c', S: '#cfc5b3', d: '#6f6558', g: '#5fae4a', G: '#3f7c34', h: '#7a5a3a', H: '#a8814f',
    b: '#3f8fc0', B: '#9fd3ea', w: '#f3ecd8', r: '#b0392b', R: '#d8623f', y: '#f2c14e', o: '#e97f2c', t: '#c5703f'
  };
  function grid(rows) {
    var c = canvas(rows[0].length, rows.length), g = c.getContext('2d');
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (ch === '.' || !PAL[ch]) continue;
      var base = PAL[ch];
      if ('sHhwgR'.indexOf(ch) >= 0) {
        var light = x < rows[y].length / 2 && (x + y * 3) % 5 === 0;
        var dark = x > rows[y].length * 0.65 && (x + y) % 3 === 0;
        var color = mix(rgb(base), light ? [255, 237, 184] : [46, 31, 27], light ? 0.3 : dark ? 0.22 : 0);
        base = 'rgb(' + color.map(Math.round).join(',') + ')';
      }
      g.fillStyle = base;
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  var ICON_ROWS = {
    fort: [
      '.......kkk........',
      '.......kyk........',
      '.......kk.........',
      '...k.k.k.k.k.k....',
      '..kskskskskskssk..',
      '..kSssdssdssdsSk..',
      '.k.k.k.k.k.k.k.k.k',
      'kskskskskskskskssk',
      'kSssdsssdsssdssSsk',
      'kssdsssdsssdssdssk',
      'kgggggggggggggggggk'.slice(0, 18),
      '.kkkkkkkkkkkkkkkk.'
    ],
    terraces: [
      '.......kkkk.......',
      '......kSssSk......',
      '......kskksk......',
      '.....kggggggk.....',
      '.....kdsdsdsk.....',
      '....kGggggggGk....',
      '....kdssdssdsk....',
      '...kGgggggggggk...',
      '...kssdssdssdssk..',
      '..kGggggggggggGGk.',
      '..kdssdssdssdssdk.',
      '.kkkkkkkkkkkkkkkkk'
    ],
    gorge: [
      'kk..............kk',
      'Hhk......s.....kHh',
      'HHhk..........khHH',
      'hHHhk...s....khHHh',
      'HhHHhk......khHHhH',
      'hHhhHhk....khhHhHh',
      'HHhHhHhk..khHhHhHH',
      'hHHhHHhhkkhhHHhHHh',
      'HhHHhHhkbBkhHhHHhH',
      'hHhHHhkbBbbkhHHhHh',
      'kkkkkkkkkkkkkkkkkk'
    ],
    city: [
      '.......k..........',
      '......kyk.........',
      '.......k..........',
      '......kwk.........',
      '.....kwwwk...kk...',
      '..kk.kwkwk.kkRRk..',
      '.kRRkkwwwkkRRRRRk.',
      'kRRRRkwwwkwwwwwwk.',
      'k.k.k.k.k.k.k.k.k.',
      'kSkSkSkSkSkSkSkSk.',
      'kSssSssSssSssSssk.',
      'ksdsssdsskkssdssk.',
      'kssdsssdkkksssdsk.',
      'kkkkkkkkkkkkkkkkk.'
    ],
    ships: [
      '....k.........k...',
      '...kwk.......kwk..',
      '..kwwwk.....kwwwk.',
      '..kwrwk.....kwrwk.',
      '..kwwwk.....kwwwk.',
      '....k.........k...',
      'kkkkkkkkk.kkkkkkkk',
      'kHhhHhhHk.kHhhHhHk',
      '.khhhhhk...khhhhk.',
      'bBbkkkbbBbbbkkkbbB',
      'bbBbbbBbbbBbbbBbbb'
    ]
  };
  function greyOf(src) {
    var c = canvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    var im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.75 + 30;
      d[i] = v * 0.95; d[i + 1] = v * 0.93; d[i + 2] = v;
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  // Rosa de los vientos con chakana y cartela del título (en baja resolución).
  function drawCompass(g, cx, cy) {
    var P = function (x, y, c) { g.fillStyle = c; g.fillRect(cx + x, cy + y, 1, 1); };
    var i;
    for (i = -12; i <= 12; i++) { P(i, 0, '#e8d7a8'); P(0, i, '#e8d7a8'); }
    for (i = -7; i <= 7; i++) { P(i, i, '#9e8a62'); P(i, -i, '#9e8a62'); }
    // puntas
    g.fillStyle = '#f2c14e';
    for (i = 0; i < 6; i++) { g.fillRect(cx - (5 - i) / 2.5, cy - 12 + i * 2, ((5 - i) / 2.5) * 2 + 1, 2); }
    g.fillStyle = '#b0392b';
    for (i = 0; i < 6; i++) { g.fillRect(cx - (5 - i) / 2.5, cy + 10 - i * 2, ((5 - i) / 2.5) * 2 + 1, 2); }
    // chakana (cruz escalonada) en el centro
    var ch = ['..kkk..', '.kkykk.', 'kkyyykk', 'kyyRyyk', 'kkyyykk', '.kkykk.', '..kkk..'];
    for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) {
      var c = ch[y][x];
      if (c !== '.') P(x - 3, y - 3, PAL[c]);
    }
  }
  function drawCartouche(g, x, y, w, h) {
    g.fillStyle = '#1b1210'; g.fillRect(x, y, w, h);
    g.fillStyle = '#e8d7a8'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#d6bf8a'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#8a5a2b';
    // greca andina (escalones) arriba y abajo
    for (var i = 3; i < w - 3; i += 4) {
      g.fillRect(x + i, y + 3, 2, 1); g.fillRect(x + i + 1, y + 4, 2, 1);
      g.fillRect(x + i, y + h - 4, 2, 1); g.fillRect(x + i + 1, y + h - 5, 2, 1);
    }
    // enrollados laterales
    g.fillStyle = '#1b1210'; g.fillRect(x - 2, y + 2, 2, h - 4); g.fillRect(x + w, y + 2, 2, h - 4);
    g.fillStyle = '#b48f55'; g.fillRect(x - 1, y + 3, 1, h - 6); g.fillRect(x + w, y + 3, 1, h - 6);
  }

  function outlineText(g, txt, x, y, fill, stroke, lw) {
    g.lineJoin = 'round';
    g.lineWidth = lw || 4;
    g.strokeStyle = stroke || '#1b1210';
    g.strokeText(txt, x, y);
    g.fillStyle = fill;
    g.fillText(txt, x, y);
  }

  function regionLabel(g, text, x, y, fill, stroke) {
    var spacing = 1.3, width = -spacing;
    for (var i = 0; i < text.length; i++) width += g.measureText(text[i]).width + spacing;
    g.save(); g.textAlign = 'left';
    x -= width / 2;
    for (i = 0; i < text.length; i++) {
      outlineText(g, text[i], x, y + 1, fill, stroke, 3);
      x += g.measureText(text[i]).width + spacing;
    }
    g.restore();
  }

  // Capa de textos y adornos de un encuadre, pre-renderizada a P.k píxeles por unidad base
  // y recortada a P (x, y, w, h). Incluye la cartela, la rosa de los vientos y la leyenda.
  function buildOverlay(P) {
    var c = canvas(Math.round(P.w * P.k), Math.round(P.h * P.k)), g = c.getContext('2d');
    var B = P.boost, O = P.over;
    function font(style, px) { return style + ' ' + Math.round(px * B * 10) / 10 + 'px Georgia, serif'; }
    function at(name, x, y) { var v = O[name]; return v && v.length ? v : [x, y]; }
    g.scale(P.k, P.k);
    g.translate(-P.x, -P.y);
    g.textBaseline = 'middle';
    // regiones del Tawantinsuyu (aprox.) y mar
    g.textAlign = 'center';
    g.font = font('italic bold', 15);
    outlineText(g, 'MAR DEL SUR', P.sea[0], P.sea[1], '#bfe0ee', '#0f2f4a', 4);
    g.font = font('italic', 11);
    outlineText(g, '(océano Pacífico)', P.sea[0], P.sea[1] + 18 * B, '#9fc6da', '#0f2f4a', 3);
    g.font = font('bold', 12);
    g.globalAlpha = 0.9;
    var rg = [['CHINCHAYSUYU', 322, 128, '#f3e3b8', '#3a2414'], ['ANTISUYU', 520, 228, '#d8f0c8', '#173a1c'],
      ['CUNTISUYU', 410, 468, '#f3e3b8', '#3a2414'], ['COLLASUYU', 590, 512, '#f3e3b8', '#3a2414']];
    for (var r = 0; r < rg.length; r++) {
      var rp = at(rg[r][0], rg[r][1], rg[r][2]);
      regionLabel(g, rg[r][0], rp[0], rp[1], rg[r][3], rg[r][4]);
    }
    g.globalAlpha = 1;
    g.font = font('italic', 10);
    var tt = project(-15.75, -69.4);
    var tp = at('Titicaca', tt.x + 30, tt.y - 4);
    outlineText(g, 'Titicaca', tp[0], tp[1], '#cfeaf6', '#0f2f4a', 3);
    // ríos principales (etiquetas pequeñas)
    g.font = font('italic', 9);
    var rl = [['Urubamba', -12.1, -72.95, -1.2], ['Apurímac', -14.1, -72.85, 0.9], ['Mantaro', -11.5, -75.35, -0.9], ['Ucayali', -8.4, -74.45, -1.1], ['Marañón', -5.4, -76.2, 0.6]];
    for (var i = 0; i < rl.length; i++) {
      var p = project(rl[i][1], rl[i][2]);
      g.save(); g.translate(p.x, p.y); g.rotate(rl[i][3]);
      outlineText(g, rl[i][0], 0, 0, '#bfe6ff', '#0f2f4a', 3);
      g.restore();
    }
    // líneas guía al punto geográfico real
    var s;
    for (i = 0; i < stages.length; i++) {
      s = stages[i]; p = project(s.lat, s.lon);
      g.strokeStyle = 'rgba(27,18,16,0.85)';
      g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(s.node[0], s.node[1]); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#1b1210'; g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
      g.fillStyle = '#d8623f'; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    }
    g.imageSmoothingEnabled = false;
    // rosa de los vientos (pixel art a baja resolución, ×3) con la N encima
    var cc = canvas(27, 27);
    drawCompass(cc.getContext('2d'), 13, 13);
    g.drawImage(cc, P.compass[0] - 40, P.compass[1] - 40, 81, 81);
    g.font = font('bold', 13);
    outlineText(g, 'N', P.compass[0], P.compass[1] - 54, '#f2c14e', '#1b1210', 3);
    // leyenda inferior (en vertical no cabe: la ruta ya la explica el panel)
    if (P.legend) {
      g.textAlign = 'left';
      g.font = font('', 11);
      outlineText(g, 'Qhapaq Ñan · ruta del juego', P.legend[0], P.legend[1], '#e8d7a8', '#10283c', 3);
    }
    return c;
  }
  // Cartela del título, a la medida del texto, en su propio lienzo (se omite cuando la
  // página ya muestra la cartela HTML: opts.cartouche === false).
  function buildCartouche(P) {
    var mc = canvas(4, 4), mg = mc.getContext('2d');
    var lay = cartoucheLayout(function (t, px) { mg.font = 'bold ' + px + 'px Georgia, serif'; return mg.measureText(t).width; }, P.cartMax, P.boost);
    var lw = lay.w / S, lh = lay.h / S, lc = canvas(lw + 4, lh);
    drawCartouche(lc.getContext('2d'), 2, 0, lw, lh);
    var bw = lay.w + 12, c = canvas(Math.round(bw * P.k), Math.round(lay.h * P.k)), g = c.getContext('2d');
    g.scale(P.k, P.k);
    g.imageSmoothingEnabled = false;
    g.drawImage(lc, 0, 0, bw, lay.h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var sw = P.k > 1 ? 3 : 4;
    g.font = 'bold ' + lay.f1 + 'px Georgia, serif';
    outlineText(g, lay.t1, 6 + lay.w / 2, lay.y1, '#f2c14e', '#3a1f14', sw);
    g.font = 'bold ' + lay.f2 + 'px Georgia, serif';
    outlineText(g, lay.t2, 6 + lay.w / 2, lay.y2, '#f6e9cc', '#3a1f14', sw);
    c.bw = bw; c.bh = lay.h;
    return c;
  }
  function cartoucheFor(P) {
    return L.carts[P.name] || (L.carts[P.name] = buildCartouche(P));
  }
  function overlayFor(P) {
    return L.overlays[P.name] || (L.overlays[P.name] = buildOverlay(P));
  }
  // Rótulo con el nombre de la etapa (fondo translúcido y contorno), por encuadre.
  function labelFor(i, st, selected, P) {
    var key = P.name + '|' + i + '|' + st + '|' + (selected ? 1 : 0);
    if (L.labels[key]) return L.labels[key];
    var LB = P.labelBoost, w = Math.round(210 * LB), h = Math.round(30 * LB);
    var label = canvas(Math.round(w * P.k), Math.round(h * P.k)), lg = label.getContext('2d');
    lg.scale(P.k, P.k);
    lg.textAlign = 'center'; lg.textBaseline = 'alphabetic';
    lg.font = 'bold ' + Math.round((selected ? 13 : 11) * LB) + 'px Georgia, serif';
    lg.fillStyle = 'rgba(15,19,18,0.4)';
    var tw = Math.ceil(lg.measureText(stages[i].name).width);
    lg.fillRect(Math.floor((w - tw) / 2) - 5 * LB, 7 * LB, tw + 10 * LB, 17 * LB);
    outlineText(lg, stages[i].name, w / 2, 20 * LB, selected ? '#f2c14e' : st === 'locked' ? '#c7bcae' : '#f6e9cc', '#1b1210', 3 * LB);
    label.bw = w; label.bh = h;
    return (L.labels[key] = label);
  }

  function buildFrame(LW, LH) {
    var c = canvas(LW, LH), g = c.getContext('2d');
    for (var i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(12,20,22,' + (0.24 - i * 0.028) + ')';
      g.fillRect(i, i, LW - i * 2, 1); g.fillRect(i, LH - i - 1, LW - i * 2, 1);
      g.fillRect(i, i, 1, LH - i * 2); g.fillRect(LW - i - 1, i, 1, LH - i * 2);
    }
    g.strokeStyle = '#9e8353'; g.lineWidth = 1; g.strokeRect(1.5, 1.5, LW - 3, LH - 3);
    g.strokeStyle = '#302b25'; g.strokeRect(2.5, 2.5, LW - 5, LH - 5);
    g.fillStyle = '#e3c681';
    for (var q = 0; q < 4; q++) {
      var x = q & 1 ? LW - 9 : 3, y = q & 2 ? LH - 9 : 3;
      g.fillRect(x, y, 6, 1); g.fillRect(x, y, 1, 6); g.fillRect(x + 2, y + 2, 2, 2);
    }
    return c;
  }

  function prepare() {
    if (L) return true;
    if (!root.ChankasPeruData) return false;
    if (!canvas(1, 1)) return false;
    if (!route) buildRoute();
    var B = buildBase();
    if (!B) return false;
    var icons = {}, grey = {};
    for (var k in ICON_ROWS) { icons[k] = grid(ICON_ROWS[k]); grey[k] = greyOf(icons[k]); }
    L = { base: B.canvas, waves: buildWaves(B.ids, B.near), overlays: {}, carts: {}, icons: icons, grey: grey, frame: buildFrame(LW, LH), frameP: null, cards: {}, labels: {}, routes: [], card: null, cardKey: '' };
    overlayFor(LAYOUT.landscape); // el encuadre vertical se prepara al pedirlo por primera vez
    var states = ['completed', 'current', 'locked'];
    for (var i = 0; i < stages.length; i++) for (var j = 0; j < states.length; j++) {
      L.card = null; buildCard(i, states[j]); L.cards[i + '|' + states[j]] = L.card;
      for (var selected = 0; selected < 2; selected++) labelFor(i, states[j], selected, LAYOUT.landscape);
    }
    for (i = 0; i <= stages.length; i++) {
      var rc = canvas(W, H), rg = rc.getContext('2d');
      var done = route.nodeDist[Math.min(i, route.nodeDist.length - 1)];
      if (i < stages.length - 1) dotsAlong(rg, done, route.nodeDist[i + 1], 'rgba(255,198,76,0.08)', 12, 9, 0);
      dotsAlong(rg, 0, done, 'rgba(255,198,76,0.13)', 12, 9, 0);
      dotsAlong(rg, 0, route.total, '#1b1210', 9, 9, 0);
      dotsAlong(rg, done, route.total, '#b29a6c', 6, 9, 0);
      dotsAlong(rg, done, route.total, '#7c6a52', 3, 9, 0);
      dotsAlong(rg, 0, done, '#ffd25a', 6, 9, 0);
      dotsAlong(rg, 0, done, '#fff0ac', 3, 9, 0);
      L.routes.push(rc);
    }
    L.card = null;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Ficha de etapa                                                      */
  /* ------------------------------------------------------------------ */
  var CARD = { x: 640, y: 16, w: 304, h: 508 };
  function wrap(g, text, maxW) {
    var words = text.split(' '), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var tst = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(tst).width > maxW && line) { lines.push(line); line = words[i]; } else line = tst;
    }
    if (line) lines.push(line);
    return lines;
  }
  function buildCard(i, st) {
    var s = stages[i], c = L.card || canvas(CARD.w, CARD.h), g = c.getContext('2d'), w = CARD.w, h = CARD.h;
    g.clearRect(0, 0, w, h);
    // marco: madera oscura con borde dorado y esquinas escalonadas
    g.fillStyle = '#1b1210'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c99a3c'; g.fillRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#231915'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#2d211b'; g.fillRect(9, 9, w - 18, 88);
    g.fillStyle = '#c99a3c';
    for (var q = 0; q < 4; q++) {
      var cx = q & 1 ? w - 15 : 9, cy = q & 2 ? h - 15 : 9;
      g.fillRect(cx, cy, 6, 6);
    }
    g.fillStyle = '#655035'; g.fillRect(12, 98, w - 24, 3);
    g.fillStyle = '#ddbb6b'; g.fillRect(12, 98, w - 24, 1);
    g.fillStyle = '#382820';
    for (var stripe = 105; stripe < h - 98; stripe += 6) g.fillRect(12, stripe, w - 24, 1);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.font = 'bold 12px Georgia, serif';
    g.fillStyle = '#c99a3c';
    g.fillText('ETAPA ' + (i + 1) + ' DE ' + stages.length + '  ·  ' + s.year, 22, 30);
    // nombre en una sola línea (reduce el cuerpo si hace falta) para no pisar el separador
    var fs = 24;
    do { g.font = 'bold ' + fs + 'px Georgia, serif'; } while (g.measureText(s.name).width > w - 120 && (fs -= 2) > 16);
    var nl = wrap(g, s.name, w - 120), y = 58;
    for (var k = 0; k < nl.length; k++) { outlineText(g, nl[k], 22, y, '#f2c14e', '#000', 4); y += fs + 2; }
    y = Math.max(y, 84);
    g.font = 'italic 14px Georgia, serif';
    g.fillStyle = '#e8d7a8';
    g.fillText(s.place, 22, y - 4);
    // icono grande
    var ic = st === 'locked' ? L.grey[s.icon] : L.icons[s.icon];
    g.imageSmoothingEnabled = false;
    g.drawImage(ic, w - 22 - ic.width * 4, 22, ic.width * 4, ic.height * 4);
    // insignia de estado
    var badge = st === 'completed' ? ['LIBERADA', '#3f7c34'] : st === 'current' ? (s.playable ? ['EN CURSO', '#b0392b'] : ['PRÓXIMAMENTE', '#6f6558']) : ['PRÓXIMAMENTE', '#4a413a'];
    y = Math.max(118, y + 22);
    g.font = 'bold 12px Georgia, serif';
    var bw = g.measureText(badge[0]).width + 20;
    g.fillStyle = '#000'; g.fillRect(20, y - 15, bw + 4, 22);
    g.fillStyle = badge[1]; g.fillRect(22, y - 13, bw, 18);
    g.fillStyle = '#f6e9cc'; g.fillText(badge[0], 32, y);
    y += 30;
    g.font = 'bold 12px Georgia, serif'; g.fillStyle = '#c99a3c'; g.fillText('HISTORIA', 22, y); y += 20;
    g.font = '14px Georgia, serif'; g.fillStyle = '#f6e9cc';
    var hl = wrap(g, s.history, w - 44);
    for (k = 0; k < hl.length; k++) { g.fillText(hl[k], 22, y); y += 19; }
    y += 12;
    g.font = 'bold 12px Georgia, serif'; g.fillStyle = '#d8623f'; g.fillText('FICCIÓN', 22, y); y += 20;
    g.font = 'italic 14px Georgia, serif'; g.fillStyle = '#efc9a8';
    var ft = s.fiction.replace(/^Ficción:\s*/, '');
    var fl = wrap(g, ft.charAt(0).toUpperCase() + ft.slice(1), w - 44);
    for (k = 0; k < fl.length; k++) { g.fillText(fl[k], 22, y); y += 19; }
    // botón / estado
    var by = h - 92;
    var play = s.playable && st !== 'locked';
    g.fillStyle = '#000'; g.fillRect(18, by, w - 36, 40);
    g.fillStyle = play ? '#c99a3c' : '#4a413a'; g.fillRect(20, by + 2, w - 40, 36);
    g.fillStyle = play ? '#2d211b' : '#3a322c'; g.fillRect(23, by + 5, w - 46, 30);
    g.textAlign = 'center';
    g.font = 'bold 16px Georgia, serif';
    outlineText(g, play ? '▶ Enter: jugar' : 'Próximamente', w / 2, by + 26, play ? '#f2c14e' : '#bdb2a4', '#000', 3);
    g.font = '11px Georgia, serif';
    g.fillStyle = '#bdb2a4';
    if (!play && st === 'current') g.fillText('La próxima etapa está en construcción', w / 2, by + 56);
    else g.fillText('← → elegir etapa  ·  clic o toque', w / 2, by + 56);
    g.font = 'italic 10px Georgia, serif';
    g.fillStyle = '#8f8478';
    g.fillText('Historia alternativa: mezcla hechos y ficción.', w / 2, h - 18);
    L.card = c;
  }

  /* ------------------------------------------------------------------ */
  /* Dibujo por fotograma                                                */
  /* ------------------------------------------------------------------ */
  function snap(v) { return Math.round(v / S) * S; }
  function dotsAlong(ctx, d0, d1, color, size, step, phase) {
    ctx.fillStyle = color;
    var start = Math.ceil((d0 - phase) / step) * step + phase;
    for (var d = start; d <= d1; d += step) {
      var p = routeAt(d);
      ctx.fillRect(snap(p[0]) - Math.floor(size / (2 * S)) * S, snap(p[1]) - Math.floor(size / (2 * S)) * S, size, size);
    }
  }

  function draw(ctx, t, o) {
    if (!ctx) return false;
    o = o || {};
    var V = viewFor(o), P = V.P;
    lastView = V;
    if (!L && !prepare()) return false;
    var progress = clampProgress(o.progress);
    var sel = o.selected == null ? Math.min(progress, stages.length - 1) : Math.max(0, Math.min(stages.length - 1, o.selected | 0));
    var heroT = o.heroT == null ? Math.min(progress, stages.length - 1) : +o.heroT;
    t = +t || 0;

    ctx.save();
    if (V.tx || V.ty) ctx.translate(V.tx, V.ty);
    if (V.sc !== 1) ctx.scale(V.sc, V.sc);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(L.base, 0, 0, W, H);
    ctx.drawImage(L.waves[Math.floor(t * 3) & 3], 0, 0, W, H);
    ctx.drawImage(overlayFor(P), P.x, P.y, P.w, P.h);
    if (o.cartouche !== false) {
      var ct = cartoucheFor(P);
      ctx.drawImage(ct, P.cart[0] - 6, P.cart[1], ct.bw, ct.bh);
    }

    var i, s;

    // ruta punteada: tramo recorrido brillante, futuro tenue, tramo en curso con brillo móvil
    var nd = route.nodeDist, done = nd[Math.min(progress, nd.length - 1)];
    ctx.drawImage(L.routes[progress], 0, 0);
    if (progress < stages.length - 1) {
      var segEnd = nd[progress + 1], ph = (t * 18) % 9;
      ctx.globalAlpha = 0.8;
      dotsAlong(ctx, done, segEnd, '#f6e9cc', 3, 9, ph);
      ctx.globalAlpha = 1;
    }

    // iconos de etapa
    for (i = 0; i < stages.length; i++) {
      s = stages[i];
      var st = statusOf(i, progress), ic = st === 'locked' ? L.grey[s.icon] : L.icons[s.icon];
      var iw = ic.width * S, ih = ic.height * S, ix = snap(s.node[0] - iw / 2), iy = snap(s.node[1] - ih + 6);
      if (st === 'current') {
        var pulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.strokeStyle = 'rgba(242,193,78,' + (0.35 + pulse * 0.55).toFixed(3) + ')';
        ctx.lineWidth = 3;
        var r = 22 + pulse * 6;
        ctx.beginPath();
        ctx.moveTo(s.node[0], s.node[1] - r); ctx.lineTo(s.node[0] + r, s.node[1]);
        ctx.lineTo(s.node[0], s.node[1] + r); ctx.lineTo(s.node[0] - r, s.node[1]); ctx.closePath();
        ctx.stroke();
      }
      // pedestal
      ctx.fillStyle = 'rgba(16,10,8,0.55)';
      ctx.fillRect(ix - 3, iy + ih - 6, iw + 6, 6);
      ctx.drawImage(ic, ix, iy, iw, ih);
      if (s.icon === 'ships' && st !== 'locked') smoke(ctx, ix, iy, t);
      if (st === 'completed') flag(ctx, ix + iw - 6, iy - 6, t);
      if (st === 'locked') lock(ctx, ix + iw - 9, iy + 3);
      var lab = labelFor(i, st, i === sel, P);
      ctx.drawImage(lab, s.node[0] + P.labelDx[i] - lab.bw / 2, s.node[1], lab.bw, lab.bh);
    }

    // flecha de selección (rebota)
    s = stages[sel];
    var ay = s.node[1] - 52 + Math.round(Math.sin(t * 6) * 3);
    ctx.fillStyle = '#1b1210';
    ctx.fillRect(s.node[0] - 9, ay - 3, 18, 6); ctx.fillRect(s.node[0] - 6, ay + 3, 12, 3); ctx.fillRect(s.node[0] - 3, ay + 6, 6, 3);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(s.node[0] - 6, ay - 1, 12, 3); ctx.fillRect(s.node[0] - 3, ay + 2, 6, 3);

    heroToken(ctx, heroT, t);

    // ficha (opts.card === false: la dibuja otra capa, p. ej. el panel HTML de la página)
    if (o.card !== false && P.name === 'landscape') {
      var key = sel + '|' + statusOf(sel, progress);
      if (L.cardKey !== key || !L.card) { L.card = L.cards[key]; L.cardKey = key; }
      ctx.drawImage(L.card, CARD.x, CARD.y);
    }
    if (P.name === 'landscape') {
      ctx.drawImage(L.frame, 0, 0, W, H);
      ctx.restore();
      return true;
    }
    ctx.restore();
    // marco del encuadre vertical, en coordenadas del canvas (píxel de 6 px de lienzo)
    var fw = Math.max(16, Math.round(V.cw / 6)), fh = Math.max(16, Math.round(V.ch / 6));
    if (!L.frameP || L.frameP.width !== fw || L.frameP.height !== fh) L.frameP = buildFrame(fw, fh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(L.frameP, 0, 0, V.cw, V.ch);
    ctx.restore();
    return true;
  }

  function smoke(ctx, ix, iy, t) {
    for (var k = 0; k < 4; k++) {
      var f = (t * 0.6 + k / 4) % 1;
      var x = ix + 12 + k * 9 + Math.sin(t * 2 + k) * 3, y = iy + 6 - f * 26;
      ctx.globalAlpha = 0.75 * (1 - f);
      ctx.fillStyle = k & 1 ? '#5b524c' : '#3a3330';
      var sz = 6 + Math.round(f * 3) * 3;
      ctx.fillRect(snap(x), snap(y), sz, sz);
      if (f < 0.3) { ctx.fillStyle = '#e97f2c'; ctx.fillRect(snap(x) + 3, snap(y) + 9, 3, 3); }
    }
    ctx.globalAlpha = 1;
  }
  function flag(ctx, x, y, t) {
    ctx.fillStyle = '#1b1210'; ctx.fillRect(x, y, 3, 24);
    var wv = Math.round(Math.sin(t * 6)) * 3;
    ctx.fillStyle = '#1b1210'; ctx.fillRect(x + 3, y - 1, 17, 13);
    ctx.fillStyle = '#b0392b'; ctx.fillRect(x + 3, y, 15, 5 + (wv > 0 ? 1 : 0));
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + 3, y + 5, 15, 5);
  }
  function lock(ctx, x, y) {
    ctx.fillStyle = '#1b1210'; ctx.fillRect(x - 1, y - 1, 14, 14);
    ctx.fillStyle = '#8e8478'; ctx.fillRect(x + 2, y - 4, 2, 5); ctx.fillRect(x + 8, y - 4, 2, 5); ctx.fillRect(x + 2, y - 6, 8, 2);
    ctx.fillStyle = '#c9b99a'; ctx.fillRect(x, y + 1, 12, 10);
    ctx.fillStyle = '#1b1210'; ctx.fillRect(x + 5, y + 4, 2, 4);
  }

  function heroToken(ctx, heroT, t) {
    var dist = distOfT(heroT), p = routeAt(dist);
    var moving = Math.abs(heroT - Math.round(heroT)) > 1e-3;
    var ahead = routeAt(Math.min(route.total, dist + 4)), face = ahead[0] >= p[0] ? 1 : -1;
    if (!moving) face = 1;
    var lp = routeAt(Math.max(0, dist - 16));
    var SP = root.ChankasSprites;
    // en una etapa, el héroe espera junto al icono (no encima); al caminar sigue la ruta
    var fr = heroT - Math.floor(heroT), wgt = moving ? Math.max(0, 1 - Math.min(fr, 1 - fr) * 6) : 1;
    var ox = -32 * wgt, oy = -4 * wgt;
    var hx = snap(p[0] + ox), hy = snap(p[1] + oy) + 4;
    var lx = moving ? snap(lp[0] + ox) : hx - 21, ly = moving ? snap(lp[1] + oy) + 4 : hy;
    ctx.fillStyle = 'rgba(16,10,8,0.5)';
    ctx.fillRect(hx - 9, hy - 2, 18, 4);
    ctx.fillRect(lx - 9, ly - 2, 18, 4);
    if (SP && SP.draw) {
      SP.draw(ctx, 'llama', moving ? 'walk' : 'idle', t, lx - 20, ly - 70, { scale: 0.75, facing: face });
      SP.draw(ctx, 'hero', moving ? 'run' : 'idle', t, hx - 14, hy - 58, { scale: 1, facing: face });
      return;
    }
    // sin sprites: ficha simple
    ctx.fillStyle = '#1b1210'; ctx.fillRect(hx - 6, hy - 22, 12, 22);
    ctx.fillStyle = '#b0392b'; ctx.fillRect(hx - 4, hy - 20, 8, 12);
    ctx.fillStyle = '#c5703f'; ctx.fillRect(hx - 3, hy - 26, 6, 6);
    ctx.fillStyle = '#e6d6ad'; ctx.fillRect(lx - 8, ly - 12, 14, 8); ctx.fillRect(lx + 4, ly - 20, 4, 10);
  }

  // Etapa bajo (x, y) del canvas: primero el icono (radio 30 base); si no, el rótulo con el
  // nombre (ancho aproximado por número de letras, del tamaño del encuadre).
  function stageAt(x, y, o) {
    if (!route) buildRoute();
    var V = o ? viewFor(o) : lastView || viewFor(), P = V.P, b = toBase(x, y, o);
    var bx = b[0], by = b[1], best = -1, bd = 30 * 30, i, s;
    for (i = 0; i < stages.length; i++) {
      var dx = bx - stages[i].node[0], dy = by - (stages[i].node[1] - 10), d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
    var LB = P.labelBoost;
    for (i = 0; i < stages.length; i++) {
      s = stages[i];
      var half = Math.max(24, s.name.length * 3.6 * LB), cx = s.node[0] + P.labelDx[i];
      if (bx >= cx - half && bx <= cx + half && by >= s.node[1] + 4 * LB && by <= s.node[1] + 26 * LB) return i;
    }
    return -1;
  }

  // ¿(x, y) cae sobre el botón «Enter: jugar / Próximamente» de la ficha? (solo apaisado)
  function buttonAt(x, y) {
    var V = lastView || viewFor();
    if (V.layout !== 'landscape') return false;
    var b = toBase(x, y), bx = b[0], by = b[1];
    return bx >= CARD.x + 18 && bx <= CARD.x + CARD.w - 18 && by >= CARD.y + CARD.h - 92 && by <= CARD.y + CARD.h - 52;
  }

  buildRoute();
  root.ChankasMap = {
    prepare: prepare,
    draw: draw,
    stages: stages,
    statusOf: statusOf,
    stageAt: stageAt,
    buttonAt: buttonAt,
    project: project,
    viewFor: function (o) { var V = viewFor(o); return { layout: V.layout, sc: V.sc, tx: V.tx, ty: V.ty }; },
    toScreen: toScreen,
    cartoucheLayout: cartoucheLayout,
    routeLength: function () { return route.total; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

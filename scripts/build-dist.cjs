#!/usr/bin/env node
// Copia SOLO los archivos que el juego necesita en tiempo de ejecución a un directorio de salida.
// Uso: node scripts/build-dist.cjs <dir-salida> [--no-404]
//
// - La lista RUNTIME es la fuente de verdad de lo que se publica (Docker y zip de itch.io).
// - Se valida contra las etiquetas <script src> y <link rel="stylesheet" href> locales de
//   index.html: si index.html referencia un archivo que no está en la lista (o al revés), falla.
// - Cada JS/CSS se copia con el hash de su contenido en el nombre (game.<hash>.js) y la copia de
//   index.html apunta a esos nombres: el servidor puede cachearlos como inmutables.
// - Nunca se copian data.txt, docs/, tests/, art/preview-*.html ni nada fuera de la lista.
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = [
  "style.css",
  "art/sprites.js",
  "art/background.js",
  "art/peru-data.js",
  "art/map.js",
  "ui.js",
  "game.js",
];

const args = process.argv.slice(2);
const outArg = args.find((a) => !a.startsWith("--"));
if (!outArg) {
  console.error("Uso: node scripts/build-dist.cjs <dir-salida> [--no-404]");
  process.exit(2);
}
const out = path.resolve(outArg);
const with404 = !args.includes("--no-404");
// Protección: no borrar nunca la raíz del proyecto ni un ancestro suyo.
if (ROOT === out || ROOT.startsWith(out + path.sep)) {
  console.error("Directorio de salida inseguro: " + out);
  process.exit(2);
}

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// Referencias locales (no http(s)://, no //) en <script src> y <link rel="stylesheet" href>.
const refRe = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>|<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"[^>]*>/g;
const local = new Set();
for (const m of html.matchAll(refRe)) {
  const ref = m[1] || m[2];
  if (!/^(https?:)?\/\//.test(ref)) local.add(ref);
}
const missing = [...local].filter((r) => !ASSETS.includes(r));
const unused = ASSETS.filter((a) => !local.has(a));
if (missing.length || unused.length) {
  console.error("La lista RUNTIME no coincide con index.html.");
  if (missing.length) console.error("  Referenciados pero no listados: " + missing.join(", "));
  if (unused.length) console.error("  Listados pero no referenciados: " + unused.join(", "));
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "art"), { recursive: true });

const written = [];
for (const rel of ASSETS) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const v = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
  // Nombre físico con hash (game.<hash>.js): el archivo servido ES esa versión, así que puede
  // cachearse como inmutable incluso durante despliegues graduales.
  const hashed = rel.replace(/\.(js|css)$/, `.${v}.$1`);
  fs.writeFileSync(path.join(out, hashed), buf);
  written.push(hashed);
  const attr = rel.endsWith(".css") ? "href" : "src";
  const before = `${attr}="${rel}"`;
  if (!html.includes(before)) throw new Error("No se encontró " + before + " en index.html");
  html = html.split(before).join(`${attr}="${hashed}"`);
}
fs.writeFileSync(path.join(out, "index.html"), html);
if (with404) fs.copyFileSync(path.join(ROOT, "deploy/404.html"), path.join(out, "404.html"));

const files = ["index.html", ...written, ...(with404 ? ["404.html"] : [])];
const total = files.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log(`dist: ${files.length} archivos, ${(total / 1024).toFixed(1)} KiB → ${out}`);

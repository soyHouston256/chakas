/*
 * CHANKAS — interfaz HTML (HUD, título, pausa, panel del mapa, barra de ruta).
 * Script clásico que se carga ANTES de game.js. game.js sigue siendo la fuente de verdad:
 * aquí solo se refleja su estado (uiView) y se envían acciones (uiAction).
 *
 * API: window.ChankasUI
 *   ready            -> true si la página tiene el HUD HTML (si no, game.js dibuja el HUD en canvas)
 *   init(api)        -> api = { view(): modelo de vista, action(nombre, arg): bool }
 *   sync()           -> se llama una vez por frame; solo toca el DOM cuando cambia un valor
 *   menuKey(code)    -> flechas/Enter en título, pausa y derrota/victoria; true si la gestionó
 */
(function () {
  "use strict";
  const doc = typeof document !== "undefined" ? document : null;
  const byId = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const stage = byId("stage");
  if (!stage || !byId("hud")) return;

  const HEART =
    '<svg width="21" height="18" viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">' +
    '<path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/>' +
    '<rect x="1" y="1" width="1" height="1" fill="#F2E6CC"/></svg>';
  const LOCK =
    '<svg width="12" height="14" viewBox="0 0 6 7" shape-rendering="crispEdges" role="img" aria-label="Bloqueada">' +
    '<path d="M1 0h4v1h1v2H5V1H1v2H0V1h1zM0 3h6v4H0z" fill="#8A7D66"/></svg>';
  // Colores de cuerda: lista del mapa (diseño Mapa-v2) y nudos de la barra de ruta (Main-v2).
  const CORD = ["#E9B53B", "#E9B53B", "#F2E6CC", "#6E8A47", "#5B7BB0"];
  const KNOT = ["#D8432F", "#E9B53B", "#F2E6CC", "#6E8A47", "#5B7BB0"];
  const KNOTS = [[5], [4, 4], [3, 3, 3], [3, 3, 3, 2], [2, 2, 2, 2, 2]];

  const el = {
    body: doc.body,
    game: byId("game-section"),
    hearts: byId("hud-hearts"),
    loads: byId("hud-loads"),
    ammo: byId("hud-ammo"),
    ammoMax: byId("hud-ammo-max"),
    fire: byId("hud-fire"),
    bola: byId("hud-bola"),
    quipu: byId("hud-quipu"),
    weapons: Array.from(doc.querySelectorAll("[data-weapon]")),
    routeFill: byId("route-fill"),
    routeMarker: byId("route-marker"),
    routePct: byId("route-pct"),
    routeStages: byId("route-stages"),
    routeSr: byId("route-sr"),
    title: byId("title-screen"),
    pause: byId("pause-screen"),
    result: byId("overlay"),
    pauseStage: byId("pause-stage"),
    pauseName: byId("pause-stage-name"),
    pauseQuipu: byId("pause-quipu"),
    pauseAmmo: byId("pause-ammo"),
    pauseFire: byId("pause-fire"),
    pauseBola: byId("pause-bola"),
    pauseLoads: byId("pause-loads"),
    mpList: byId("mp-list"),
    mpHistory: byId("mp-history"),
    mpFiction: byId("mp-fiction"),
    mpPlay: byId("mp-play"),
    mpPlayLabel: byId("mp-play-label"),
    mpNotice: byId("mp-notice"),
    header: doc.querySelector(".site-header"),
  };
  let api = null,
    hearts = [],
    pips = [],
    routeItems = [],
    rows = [];
  const last = Object.create(null);
  // Escribe en el DOM solo si el valor cambió desde el último frame.
  function put(key, value, apply) {
    if (last[key] === value) return false;
    last[key] = value;
    apply(value);
    return true;
  }
  const setText = (node) => (v) => node && (node.textContent = v);

  function build(v) {
    const h = v.hud;
    el.hearts.innerHTML = "";
    hearts = [];
    for (let i = 0; i < h.maxHp; i++) {
      const s = doc.createElement("span");
      s.className = "heart";
      s.innerHTML = HEART;
      el.hearts.appendChild(s);
      hearts.push(s);
    }
    el.loads.innerHTML = "";
    pips = [];
    for (let i = 0; i < h.maxLoads; i++) {
      const s = doc.createElement("span");
      s.className = "pip";
      el.loads.appendChild(s);
      pips.push(s);
    }
    if (el.ammoMax) el.ammoMax.textContent = h.maxAmmo;
    // Barra de ruta: una columna por etapa, con nudos de quipu (1..5) del color de la etapa.
    el.routeStages.innerHTML = "";
    el.routeStages.style.setProperty("--n", v.stageNames.length);
    routeItems = v.stageNames.map((name, i) => {
      const li = doc.createElement("li");
      const knot = doc.createElement("span");
      knot.className = "knot";
      knot.setAttribute("aria-hidden", "true");
      const color = KNOT[i % KNOT.length];
      knot.style.background = color;
      const sizes = KNOTS[i] || KNOTS[KNOTS.length - 1];
      knot.style.gap = sizes.length > 1 && sizes[0] === 4 ? "2px" : "1px";
      for (const hgt of sizes) {
        const k = doc.createElement("span");
        k.style.height = hgt + "px";
        k.style.background = color;
        knot.appendChild(k);
      }
      const label = doc.createElement("span");
      label.innerHTML =
        roman(i) + '<span class="route-name"> · ' + escapeHtml(name) + "</span>";
      li.append(knot, label);
      el.routeStages.appendChild(li);
      return li;
    });
    // Lista del mapa: un botón por etapa (clic/toque selecciona).
    el.mpList.innerHTML = "";
    rows = v.stageNames.map((name, i) => {
      const li = doc.createElement("li");
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "mp-row";
      b.dataset.action = "select";
      b.dataset.arg = String(i);
      b.innerHTML =
        '<span class="mp-cord"></span><span class="mp-name">' +
        roman(i) +
        " · " +
        escapeHtml(name) +
        '</span><span class="mp-state"></span>';
      // Color por CSSOM (no atributo style en el HTML): compatible con una CSP sin 'unsafe-inline'.
      b.querySelector(".mp-cord").style.background = CORD[i % CORD.length];
      li.appendChild(b);
      el.mpList.appendChild(li);
      return { button: b, state: b.querySelector(".mp-state") };
    });
    doc.querySelectorAll("[data-needs-map]").forEach((n) => (n.hidden = !v.hasMap));
  }
  function roman(i) {
    return ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][i] || String(i + 1);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  // Pantalla activa con menú navegable por teclado según el estado.
  function activeScreen(state) {
    if (state === "menu") return el.title;
    if (state === "paused") return el.pause;
    if (state === "lost" || state === "won") return el.result;
    return null;
  }
  function menuItems(box) {
    return box
      ? Array.from(box.querySelectorAll("button")).filter((b) => !b.hidden && b.offsetParent !== null)
      : [];
  }
  function focusQuiet(node) {
    if (node && node.focus) node.focus({ preventScroll: true });
  }
  function setCurrent(box, item) {
    if (!box || !item) return;
    box.querySelectorAll(".menu-item.is-current").forEach((b) => b !== item && b.classList.remove("is-current"));
    if (item.classList.contains("menu-item")) item.classList.add("is-current");
  }
  function onState(s, prev) {
    stage.dataset.state = s;
    el.body.dataset.state = s;
    // Pausa y derrota/victoria son modales: la cabecera queda inerte (sin foco ni clic).
    const modal = s === "paused" || s === "lost" || s === "won";
    if (el.header) el.header.inert = modal;
    if (prev === undefined) return; // primera carga: no se roba el foco a la página
    const box = activeScreen(s);
    let target = null;
    if (box) {
      target = box.querySelector(".menu-item") || box.querySelector("button:not([hidden])");
      setCurrent(box, target);
    } else if (s === "map") {
      // Foco en la etapa elegida (Enter sobre ella la juega); en móvil se desplaza a la vista.
      const row = rows[last.mSel] || rows[0];
      target = row ? row.button : el.mpPlay;
      if (target && target.focus) {
        target.focus({ preventScroll: true });
        if (target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
        target = null;
      }
    }
    if (target) focusQuiet(target);
    else if (s === "playing") {
      // Jugando: el foco no se queda en un botón (Espacio = saltar, no «pulsar»).
      const a = doc.activeElement;
      if (a && a !== el.body && a.blur && (stage.contains(a) || (el.header && el.header.contains(a))))
        a.blur();
    }
  }

  function syncHud(h) {
    put("hp", h.hp, (hp) => hearts.forEach((n, i) => n.classList.toggle("is-empty", i >= hp)));
    put("hpLabel", h.lifeLabel, (t) => el.hearts.setAttribute("aria-label", t));
    put("ammo", h.ammo, setText(el.ammo));
    put("fire", h.fire, setText(el.fire));
    put("bola", h.bola, setText(el.bola));
    put("quipu", h.quipu, setText(el.quipu));
    put("weapon", h.weapon, (w) =>
      el.weapons.forEach((n) => {
        const on = n.dataset.weapon === w;
        n.classList.toggle("is-selected", on);
        if (on) n.setAttribute("aria-current", "true");
        else n.removeAttribute("aria-current");
      }),
    );
    put("loads", h.loads, (l) => pips.forEach((n, i) => n.classList.toggle("is-empty", i >= l)));
    put("loadLabel", h.loadLabel, (t) => el.loads.setAttribute("aria-label", t));
  }
  function syncRoute(r, names) {
    put("rStart", r.start + "|" + r.end, () => {
      const line = el.routeFill.previousElementSibling;
      if (line) {
        line.style.left = r.start + "%";
        line.style.right = 100 - r.end + "%";
      }
      el.routeFill.style.left = r.start + "%";
    });
    put("rMarker", r.marker, (m) => {
      el.routeMarker.style.left = m + "%";
      el.routePct.style.left = m + "%";
    });
    put("rFill", r.fill, (f) => (el.routeFill.style.width = f + "%"));
    put("rPct", r.pct, (p) => (el.routePct.textContent = p + "%"));
    put("rStage", r.stage, (s) => routeItems.forEach((li, i) => li.classList.toggle("is-current", i === s)));
    put("rSr", r.roman + "|" + r.pct, () => {
      el.routeSr.textContent =
        "Etapa " + r.roman + " de " + roman(names.length - 1) + ", " + names[r.stage] + ": " + r.pct + " % del camino.";
    });
  }
  function syncPause(v) {
    put("pStage", v.route.roman + "/" + v.stageNames.length, () => {
      el.pauseStage.textContent = "ETAPA " + v.route.roman + " DE " + roman(v.stageNames.length - 1);
    });
    put("pName", v.stageName, setText(el.pauseName));
    put("pQuipu", v.hud.quipu, setText(el.pauseQuipu));
    put("pAmmo", v.hud.ammo, setText(el.pauseAmmo));
    put("pFire", v.hud.fire, setText(el.pauseFire));
    put("pBola", v.hud.bola, setText(el.pauseBola));
    put("pLoads", v.hud.loads, (l) => (el.pauseLoads.textContent = l + " de " + v.hud.maxLoads));
  }
  function syncMap(m) {
    const prevSel = last.mSel;
    m.rows.forEach((r, i) => {
      const row = rows[i];
      if (!row) return;
      put("mRow" + i, r.status + "|" + r.label + "|" + (i === m.selected), () => {
        if (i === m.selected) row.button.setAttribute("aria-current", "true");
        else row.button.removeAttribute("aria-current");
        row.state.className = "mp-state" + (r.status === "locked" ? "" : " mp-status is-" + r.status);
        row.state.innerHTML = r.status === "locked" ? LOCK : escapeHtml(r.label);
      });
    });
    put("mSel", m.selected, (sel) => {
      // Si el foco estaba en la lista, sigue a la etapa elegida con las flechas.
      const a = doc.activeElement;
      if (prevSel !== undefined && a && el.mpList.contains(a) && rows[sel]) focusQuiet(rows[sel].button);
    });
    put("mHist", m.history, setText(el.mpHistory));
    put("mFic", m.fiction, setText(el.mpFiction));
    put("mPlay", m.playLabel, setText(el.mpPlayLabel));
    put("mPlayable", m.playable, (p) => el.mpPlay.setAttribute("aria-disabled", p ? "false" : "true"));
    put("mNotice", m.notice, setText(el.mpNotice));
  }
  function syncSound(on) {
    put("sound", on, (s) => {
      doc.querySelectorAll("[data-sound-label]").forEach((n) => (n.textContent = s ? "sí" : "no"));
      doc
        .querySelectorAll("#sound, .menu-sound")
        .forEach((b) => b.setAttribute("aria-pressed", s ? "true" : "false"));
    });
  }

  const UI = {
    ready: true,
    init(a) {
      api = a;
      el.body.classList.add("has-ui"); // activa las capas HTML (sin ui.js quedan ocultas)
      const v = api.view();
      build(v);
      put("state", v.state, (s) => onState(s, undefined));
      // Acciones declarativas: data-action en botones (título, pausa, mapa, cabecera).
      doc.addEventListener("click", (e) => {
        const b = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
        if (!b || !api) return;
        api.action(b.dataset.action, b.dataset.arg != null ? Number(b.dataset.arg) : undefined);
        UI.sync();
      });
      // La fila «actual» del menú sigue al foco y al puntero.
      for (const box of [el.title, el.pause]) {
        box.addEventListener("focusin", (e) => setCurrent(box, e.target.closest(".menu-item")));
        box.addEventListener("pointerover", (e) => {
          const it = e.target.closest && e.target.closest(".menu-item");
          if (it) setCurrent(box, it);
        });
      }
      UI.sync();
    },
    sync() {
      if (!api) return;
      const v = api.view();
      const prev = last.state;
      if (v.map) syncMap(v.map);
      if (v.state === "paused") syncPause(v);
      put("state", v.state, (s) => onState(s, prev));
      syncHud(v.hud);
      syncRoute(v.route, v.stageNames);
      syncSound(v.sound);
    },
    menuKey(code) {
      const box = activeScreen(last.state);
      const items = menuItems(box);
      if (!items.length) return false;
      const i = items.indexOf(doc.activeElement);
      const cur = i >= 0 ? i : Math.max(0, items.findIndex((b) => b.classList.contains("is-current")));
      const back = code === "ArrowUp" || code === "ArrowLeft" || code === "KeyW";
      const fwd = code === "ArrowDown" || code === "ArrowRight" || code === "KeyS";
      if (back || fwd) {
        const n = i < 0 ? cur : (cur + (fwd ? 1 : -1) + items.length) % items.length;
        focusQuiet(items[n]);
        setCurrent(box, items[n]);
        return true;
      }
      if (code === "Enter" || code === "NumpadEnter") {
        items[cur].click();
        return true;
      }
      return false;
    },
  };
  window.ChankasUI = UI;
})();

/*
 * CHANKAS — interfaz HTML (HUD superpuesto, controles en pantalla, título, pausa, panel del
 * mapa, franja inferior con la ruta y pantalla completa).
 * Script clásico que se carga ANTES de game.js. game.js sigue siendo la fuente de verdad:
 * aquí solo se refleja su estado (uiView) y se envían acciones (uiAction).
 *
 * API: window.ChankasUI
 *   ready            -> true si la página tiene el HUD HTML (si no, game.js dibuja el HUD en canvas)
 *   init(api)        -> api = { view(): modelo de vista, action(nombre, arg): bool }
 *   sync()           -> se llama una vez por frame; solo toca el DOM cuando cambia un valor
 *   menuKey(code)    -> flechas/Enter en título, pausa y derrota/victoria; true si la gestionó
 *   toggleFullscreen(on?) -> pantalla completa (API nativa o modo inmersivo CSS en iPhone)
 */
(function () {
  "use strict";
  const doc = typeof document !== "undefined" ? document : null;
  const byId = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const stage = byId("stage");
  if (!stage || !byId("hud")) return;

  // Iconos pixel art (SVG en línea, generados desde rejillas ASCII; sin estilos en línea).
  const HEART = '<svg viewBox="0 0 9 8" shape-rendering="crispEdges" aria-hidden="true"><path class="o" d="M1 0h3v1H1zM5 0h3v1H5zM0 1h1v1H0zM4 1h1v1H4zM8 1h1v1H8zM0 2h1v1H0zM8 2h1v1H8zM0 3h1v1H0zM8 3h1v1H8zM1 4h1v1H1zM7 4h1v1H7zM2 5h1v1H2zM6 5h1v1H6zM3 6h1v1H3zM5 6h1v1H5zM4 7h1v1H4z"/><path class="f" d="M1 1h1v1H1zM3 1h1v1H3zM5 1h3v1H5zM1 2h7v1H1zM1 3h6v1H1zM2 4h4v1H2zM3 5h2v1H3z"/><path class="h" d="M2 1h1v1H2z"/><path class="s" d="M7 3h1v1H7zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4z"/></svg>';
  const LANDMARK = {
    sacsayhuaman:
      '<svg viewBox="0 0 18 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M7 0h4v1H7zM6 1h1v1H6zM11 1h1v1H11zM3 2h12v1H3zM2 3h1v1H2zM4 3h1v1H4zM6 3h1v1H6zM8 3h1v1H8zM10 3h1v1H10zM12 3h1v1H12zM14 3h2v1H14zM1 4h16v1H1zM1 5h1v1H1zM3 5h2v1H3zM6 5h2v1H6zM9 5h2v1H9zM12 5h2v1H12zM15 5h2v1H15zM0 6h18v1H0zM0 7h1v1H0zM2 7h3v1H2zM6 7h3v1H6zM10 7h3v1H10zM14 7h4v1H14zM0 8h18v1H0z"/><path class="rt" d="M7 1h4v1H7zM3 3h1v1H3zM5 3h1v1H5zM7 3h1v1H7zM9 3h1v1H9zM11 3h1v1H11zM13 3h1v1H13zM2 5h1v1H2zM5 5h1v1H5zM8 5h1v1H8zM11 5h1v1H11zM14 5h1v1H14zM1 7h1v1H1zM5 7h1v1H5zM9 7h1v1H9zM13 7h1v1H13z"/></svg>',
    ollantaytambo:
      '<svg viewBox="0 0 18 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M8 0h2v1H8zM7 1h4v1H7zM5 3h8v1H5zM3 5h12v1H3zM1 7h16v1H1z"/><path class="rt" d="M6 2h6v1H6zM4 4h10v1H4zM2 6h14v1H2zM0 8h18v1H0z"/></svg>',
    laconvencion:
      '<svg viewBox="0 0 18 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M7 0h1v1H7zM6 1h3v1H6zM5 2h1v1H5zM9 2h1v1H9zM14 2h1v1H14zM4 3h3v1H4zM8 3h3v1H8zM13 3h3v1H13zM3 4h11v1H3zM15 4h2v1H15zM2 5h5v1H2zM8 5h5v1H8zM16 5h1v1H16zM1 6h6v1H1zM9 6h4v1H9zM17 6h1v1H17zM0 7h7v1H0zM10 7h2v1H10zM17 7h1v1H17z"/><path class="rl" d="M6 2h3v1H6zM7 3h1v1H7z"/><path class="rt" d="M14 4h1v1H14zM7 5h1v1H7zM13 5h3v1H13zM7 6h2v1H7zM13 6h4v1H13zM7 7h3v1H7zM12 7h5v1H12z"/></svg>',
    vilcabamba:
      '<svg viewBox="0 0 18 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 0h6v1H6zM6 1h1v1H6zM8 1h2v1H8zM11 1h1v1H11zM4 2h10v1H4zM4 3h2v1H4zM7 3h4v1H7zM12 3h2v1H12zM2 4h14v1H2zM2 5h6v1H2zM10 5h6v1H10zM0 6h8v1H0zM10 6h8v1H10zM0 7h8v1H0zM10 7h8v1H10z"/><path class="rt" d="M7 1h1v1H7zM10 1h1v1H10zM6 3h1v1H6zM11 3h1v1H11z"/></svg>',
    callao:
      '<svg viewBox="0 0 18 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M0 0h1v1H0zM2 0h1v1H2zM4 0h1v1H4zM11 0h1v1H11zM13 0h1v1H13zM15 0h1v1H15zM0 1h5v1H0zM7 1h1v1H7zM9 1h1v1H9zM11 1h5v1H11zM0 2h2v1H0zM3 2h2v1H3zM7 2h3v1H7zM11 2h2v1H11zM14 2h2v1H14zM0 3h16v1H0zM0 4h16v1H0zM0 5h6v1H0zM11 5h6v1H11zM0 6h6v1H0zM11 6h6v1H11z"/><path class="rw" d="M2 2h1v1H2zM13 2h1v1H13zM0 7h18v1H0z"/></svg>'
  };
  const LOCK =
    '<svg width="12" height="14" viewBox="0 0 6 7" shape-rendering="crispEdges" role="img" aria-label="Bloqueada">' +
    '<path d="M1 0h4v1h1v2H5V1H1v2H0V1h1zM0 3h6v4H0z" fill="#8A7D66"/></svg>';
  // Colores de cuerda de la lista del mapa (diseño Mapa-v2).
  const CORD = ["#E9B53B", "#E9B53B", "#F2E6CC", "#6E8A47", "#5B7BB0"];

  const el = {
    body: doc.body,
    game: byId("game-section"),
    hearts: byId("hud-hearts"),
    loads: byId("hud-loads"),
    loadsN: byId("hud-loads-n"),
    touchSpit: byId("touch-spit"),
    touchSpitCount: byId("touch-spit-count"),
    ctlFire: byId("ctl-fire"),
    ctlBola: byId("ctl-bola"),
    pauseSpit: byId("pause-spit"),
    ammo: byId("hud-ammo"),
    fire: byId("hud-fire"),
    bola: byId("hud-bola"),
    quipu: byId("hud-quipu"),
    stageName: byId("hud-stage-name"),
    stageSub: byId("hud-stage-sub"),
    weapons: Array.from(doc.querySelectorAll("[data-weapon]")),
    fsButtons: Array.from(doc.querySelectorAll("[data-fs]")),
    fsHint: byId("fs-hint"),
    routeFill: byId("route-fill"),
    routeMarker: byId("route-marker"),
    routeStages: byId("route-stages"),
    routeSr: byId("route-sr"),
    title: byId("title-screen"),
    pause: byId("pause-screen"),
    result: byId("overlay"),
    rotate: byId("rotate-screen"),
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
    // Fuera de la sección del juego: queda inerte mientras hay un diálogo modal.
    outside: Array.from(doc.querySelectorAll(".page > :not(#game-section)")),
    strip: byId("strip"),
    hud: byId("hud"),
    controls: byId("controls"),
    pad: byId("pad"),
    play: byId("play"),
  };
  let api = null,
    hearts = [],
    routeItems = [],
    rows = [],
    hintTimer = 0;
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
    // Franja inferior: un nodo y un hito (icono) por etapa sobre la línea de la ruta.
    el.routeStages.innerHTML = "";
    el.routeStages.style.setProperty("--n", v.stages.length);
    routeItems = v.stages.map((s, i) => {
      const li = doc.createElement("li");
      li.className = "route-stage" + (s.fictional ? " is-fiction" : "");
      li.innerHTML =
        '<span class="route-node" aria-hidden="true"></span>' +
        '<span class="route-ico">' + (LANDMARK[s.id] || LANDMARK.sacsayhuaman) + "</span>" +
        '<span class="route-label">' + roman(i) + '<span class="route-name"> · ' + escapeHtml(s.name) + "</span>" +
        (s.fictional ? '<span class="sr-only"> (ficción)</span>' : "") + "</span>";
      if (s.fictional) li.title = "Etapa de ficción";
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
    // Pausa y derrota/victoria son modales: el resto de la página queda inerte.
    setInert();
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
    else if (s === "playing") blurControls();
  }
  // Diálogos modales (pausa, derrota/victoria, «Gira tu teléfono»): todo lo demás queda inerte,
  // incluidos el HUD y los mandos del juego.
  function setInert() {
    const s = last.state,
      rotate = last.rotate === true,
      modal = rotate || s === "paused" || s === "lost" || s === "won";
    el.outside.forEach((n) => (n.inert = modal));
    for (const n of [el.strip, el.hud, el.controls, el.pad]) if (n) n.inert = modal;
    if (el.play) el.play.inert = rotate;
  }
  // Jugando, el foco no se queda en un botón (Espacio = saltar, no «pulsar»).
  function blurControls() {
    const a = doc.activeElement;
    if (a && a !== el.body && a.blur && el.game && el.game.contains(a)) a.blur();
  }

  function syncHud(v) {
    const h = v.hud;
    put("hp", h.hp, (hp) => hearts.forEach((n, i) => n.classList.toggle("is-empty", i >= hp)));
    put("hpLabel", h.lifeLabel, (t) => el.hearts.setAttribute("aria-label", t));
    put("ammo", h.ammo, setText(el.ammo));
    put("fire", h.fire, (f) => {
      setText(el.fire)(f);
      setText(el.ctlFire)(f);
    });
    put("bola", h.bola, (b) => {
      setText(el.bola)(b);
      setText(el.ctlBola)(b);
    });
    put("quipu", h.quipu, setText(el.quipu));
    put("weapon", h.weapon, (w) =>
      el.weapons.forEach((n) => {
        const on = n.dataset.weapon === w;
        n.classList.toggle("is-selected", on);
        if (n.tagName === "BUTTON") n.setAttribute("aria-pressed", on ? "true" : "false");
        else if (on) n.setAttribute("aria-current", "true");
        else n.removeAttribute("aria-current");
      }),
    );
    put("loads", h.loads, setText(el.loadsN));
    put("loadLabel", h.loadLabel, (t) => el.loads && el.loads.setAttribute("aria-label", t));
    // Escupitajos en el botón de la llama: cargas y la que se recupera (relleno de abajo arriba).
    put("spitBtn", h.spit, (c) => {
      if (el.touchSpitCount) el.touchSpitCount.textContent = c;
      if (el.touchSpit) {
        el.touchSpit.classList.toggle("is-empty", c <= 0);
        el.touchSpit.setAttribute("aria-disabled", c <= 0 ? "true" : "false");
      }
    });
    put("spitFill", h.spitFill, (f) => el.touchSpit && el.touchSpit.style.setProperty("--fill", String(f)));
    put("spitLabel", h.spitLabel, (t) => {
      if (!el.touchSpit) return;
      el.touchSpit.setAttribute("aria-label", t + " (H)");
      el.touchSpit.title = t + " (H)"; // tooltip: en barras estrechas el botón queda solo con icono
    });
    // Durante el aviso del rescate se resalta el botón de la llama.
    put("spitHint", h.spitHint, (on) => el.touchSpit && el.touchSpit.classList.toggle("is-hint", on));
    // Insignia de la etapa (arriba a la derecha).
    put("stageBadge", v.route.roman + "|" + v.stageName, () => {
      el.stageName.textContent = v.route.roman + " · " + v.stageName;
    });
    put("stageSub", v.stagePlace + "|" + v.stageYear + "|" + v.difficultyName, () => {
      el.stageSub.textContent = [v.stagePlace, v.stageYear, v.difficultyName].filter(Boolean).join(" · ");
    });
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
    put("rMarker", r.marker, (m) => (el.routeMarker.style.left = m + "%"));
    put("rFill", r.fill, (f) => (el.routeFill.style.width = f + "%"));
    put("rStage", r.stage, (s) =>
      routeItems.forEach((li, i) => {
        li.classList.toggle("is-current", i === s);
        li.classList.toggle("is-done", i < s);
        if (i === s) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      }),
    );
    put("rSr", r.roman + "|" + r.pct, () => {
      el.routeSr.textContent =
        "Etapa " + r.roman + " de " + roman(names.length - 1) + ", " + names[r.stage] + ": " + r.pct + " % del camino.";
    });
  }
  function syncPause(v) {
    put("pStage", v.route.roman + "/" + v.stageNames.length, () => {
      el.pauseStage.textContent = "ETAPA " + v.route.roman + " DE " + roman(v.stageNames.length - 1);
    });
    put("pName", v.stageName + (v.difficultyName ? " · " + v.difficultyName : ""), setText(el.pauseName));
    put("pQuipu", v.hud.quipu, setText(el.pauseQuipu));
    put("pAmmo", v.hud.ammo, setText(el.pauseAmmo));
    put("pFire", v.hud.fire, setText(el.pauseFire));
    put("pBola", v.hud.bola, setText(el.pauseBola));
    put("pSpit", v.hud.spit, setText(el.pauseSpit));
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
  // Disposición (táctil/escritorio), aviso de giro y Recargar contextual: atributos del body.
  function syncLayout(v) {
    put("layout", v.layout, (l) => (el.body.dataset.layout = l));
    put("rotate", v.rotate, (r) => {
      el.body.dataset.rotate = r ? "true" : "false";
      setInert();
      if (r && el.rotate) focusQuiet(el.rotate);
    });
    put("reload", v.reload, (r) => (el.body.dataset.reload = r ? "true" : "false"));
  }

  /* --- Pantalla completa ------------------------------------------------ */
  // API nativa sobre la sección del juego (con prefijo webkit para Safari de escritorio/iPad).
  // En iPhone no existe la pantalla completa de elementos: modo inmersivo con CSS (fijo, 100dvh)
  // y una pista para «Añadir a pantalla de inicio» (el manifiesto abre en pantalla completa).
  const fsTarget = el.game;
  const fsElement = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
  const fsNative = () =>
    !!(
      fsTarget &&
      (fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen) &&
      (doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
    );
  const isFs = () => !!fsElement() || el.body.classList.contains("is-immersive");
  function standalone() {
    try {
      return (
        navigator.standalone === true ||
        (typeof matchMedia === "function" && matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches)
      );
    } catch (e) {
      return false;
    }
  }
  function hint(text) {
    if (!el.fsHint) return;
    el.fsHint.textContent = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (el.fsHint.textContent = ""), 7000);
  }
  function lockLandscape() {
    try {
      const o = screen.orientation;
      if (o && o.lock) o.lock("landscape").catch(() => {});
    } catch (e) {
      /* no compatible: el aviso «Gira tu teléfono» cubre el caso */
    }
  }
  function refreshFs() {
    const on = isFs();
    el.body.classList.toggle("is-fs", on);
    el.fsButtons.forEach((b) => {
      b.setAttribute("aria-pressed", on ? "true" : "false");
      const label = on ? "Salir de pantalla completa (F)" : "Pantalla completa (F)";
      b.setAttribute("aria-label", label);
      b.title = label;
    });
  }
  function immersive(on) {
    el.body.classList.toggle("is-immersive", on);
    if (on && !standalone())
      hint("En iPhone: Compartir → «Añadir a pantalla de inicio» para jugar a pantalla completa de verdad.");
    if (on && window.scrollTo) window.scrollTo(0, 0);
    refreshFs();
    if (!on && api) api.action("suspend");
  }
  function toggleFullscreen(want) {
    const on = want == null ? !isFs() : !!want;
    if (on === isFs()) return Promise.resolve(on);
    if (!on) {
      if (fsElement()) {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        return Promise.resolve(exit && exit.call(doc)).catch(() => {});
      }
      immersive(false);
      return Promise.resolve(false);
    }
    if (!fsNative()) {
      immersive(true);
      return Promise.resolve(true);
    }
    let req;
    try {
      req = fsTarget.requestFullscreen ? fsTarget.requestFullscreen({ navigationUI: "hide" }) : fsTarget.webkitRequestFullscreen();
    } catch (e) {
      req = Promise.reject(e);
    }
    return Promise.resolve(req).then(
      () => (lockLandscape(), true),
      () => (immersive(true), true),
    );
  }
  function onFsChange() {
    refreshFs();
    // Al salir de la pantalla completa nativa (Esc, gesto del sistema), la partida se pausa.
    if (!fsElement() && api) {
      api.action("suspend");
      UI.sync();
    }
  }

  /* --- Sin zoom nunca ---------------------------------------------------- */
  // iOS ignora user-scalable=no: se cancelan el pellizco (gesture*), el doble toque y el
  // movimiento con varios dedos. Los mandos usan pointerdown, así que siguen respondiendo.
  function preventZoom() {
    const stop = (e) => e.cancelable && e.preventDefault();
    const opts = { passive: false };
    ["gesturestart", "gesturechange", "gestureend"].forEach((t) => doc.addEventListener(t, stop, opts));
    doc.addEventListener("dblclick", stop, opts);
    doc.addEventListener("touchmove", (e) => e.touches && e.touches.length > 1 && stop(e), opts);
    // Doble toque rápido sobre el juego (fuera de botones y campos): sin zoom ni clic fantasma.
    let lastEnd = 0;
    doc.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now(),
          t = e.target;
        const free = !(t && t.closest && t.closest("button, a, input, select, textarea, label"));
        if (now - lastEnd < 350 && free && el.game && el.game.contains(t)) stop(e);
        lastEnd = now;
      },
      opts,
    );
  }

  const UI = {
    ready: true,
    toggleFullscreen,
    init(a) {
      api = a;
      el.body.classList.add("has-ui"); // activa las capas HTML (sin ui.js quedan ocultas)
      const v = api.view();
      build(v);
      syncLayout(v);
      put("state", v.state, (s) => onState(s, undefined));
      // Acciones declarativas: data-action en botones (título, pausa, mapa, HUD).
      doc.addEventListener("click", (e) => {
        const b = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
        if (!b || !api) return;
        const name = b.dataset.action;
        if (name === "fullscreen") toggleFullscreen();
        else if (name === "fullscreen-start") {
          toggleFullscreen(true);
          api.action("start");
        } else api.action(name, b.dataset.arg != null ? Number(b.dataset.arg) : undefined);
        UI.sync();
        if (last.state === "playing") blurControls();
      });
      // F: pantalla completa (no en campos de texto). Esc la cierra (nativo del navegador).
      doc.addEventListener("keydown", (e) => {
        if (e.code !== "KeyF" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target && e.target.closest && e.target.closest("input, select, textarea")) return;
        toggleFullscreen();
      });
      doc.addEventListener("fullscreenchange", onFsChange);
      doc.addEventListener("webkitfullscreenchange", onFsChange);
      doc.addEventListener("visibilitychange", () => {
        if (doc.hidden && api) {
          api.action("suspend");
          UI.sync();
        }
      });
      // La fila «actual» del menú sigue al foco y al puntero.
      for (const box of [el.title, el.pause]) {
        box.addEventListener("focusin", (e) => setCurrent(box, e.target.closest(".menu-item")));
        box.addEventListener("pointerover", (e) => {
          const it = e.target.closest && e.target.closest(".menu-item");
          if (it) setCurrent(box, it);
        });
      }
      // Sin menú contextual ni selección al mantener pulsado un mando táctil.
      doc.querySelectorAll(".controls, .pad").forEach((n) => n.addEventListener("contextmenu", (e) => e.preventDefault()));
      preventZoom();
      refreshFs();
      UI.sync();
    },
    sync() {
      if (!api) return;
      const v = api.view();
      const prev = last.state;
      if (v.map) syncMap(v.map);
      if (v.state === "paused") syncPause(v);
      put("state", v.state, (s) => onState(s, prev));
      syncLayout(v);
      syncHud(v);
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

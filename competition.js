(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = { chasqui: 'Chasqui', inka: 'Inka', pachacutec: 'Pachacútec' };
  const badges = { first_victory: 'Primera victoria', steady_step: 'Paso firme', precise_huaraca: 'Huaraca precisa', road_companions: 'Compañeros del camino', terrace_explorer: 'Explorador de las terrazas', pachacutec_challenge: 'Desafío Pachacútec' };
  const ranks = [[7000, 'Leyenda de los Andes'], [3500, 'Protector de las Cumbres'], [1500, 'Guerrero de la Huaraca'], [500, 'Guardián del Camino'], [0, 'Caminante']];
  const key = 'chankas-local-competition-v1';
  let local = { alias: 'Caminante', xp: 0, badges: [] };
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && Number.isFinite(saved.xp) && saved.xp >= 0 && saved.xp <= 100000000 && Array.isArray(saved.badges)) local = saved; } catch (_) {}
  let player = local, connected = false, current = null, requestVersion = 0, profileRequest, lastSync, profileProgress = null;
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(local)); } catch (_) {} };
  const rankOf = xp => ranks.find(([threshold]) => xp >= threshold)[1];
  function drawProfile() {
    $('player-rank').textContent = player.rank || rankOf(player.xp || 0);
    $('player-xp').textContent = `${player.xp || 0} XP${connected ? '' : ' locales'}`;
    if (document.activeElement !== $('player-alias')) $('player-alias').value = player.alias || 'Caminante';
    $('player-badges').replaceChildren();
    const earned = player.badges || [];
    for (const id of earned) { const li = document.createElement('li'); li.textContent = badges[id] || id; $('player-badges').append(li); }
    if (!earned.length) { const li = document.createElement('li'); li.textContent = 'Tu primera victoria abre el camino'; $('player-badges').append(li); }
    $('profile-status').textContent = connected ? 'Perfil invitado guardado en este navegador. Conserva sus datos para mantener tu identidad.' : 'Sin conexión: progreso local. Las partidas locales no entran en el ranking ni se suben después.';
  }
  async function api(path, method = 'GET', body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (!response.ok) throw new Error('Servidor no disponible');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function loadProfile() {
    try { const data = await api('/profile'); player = data.player; profileProgress = data.progress; connected = true; window.dispatchEvent(new CustomEvent('chankas-profile', { detail: data })); }
    catch (_) { connected = false; player = local; }
    drawProfile();
  }
  const time = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  async function refreshRanking() {
    const version = ++requestVersion;
    $('ranking-status').textContent = 'Consultando clasificación…';
    try {
      const data = await api(`/leaderboard?stage=1&difficulty=${$('ranking-difficulty').value}&period=${$('ranking-period').value}`);
      if (version !== requestVersion) return;
      $('ranking-entries').replaceChildren();
      for (const entry of data.entries) {
        const row = document.createElement('tr');
        if (data.personal && entry.position === data.personal.position) row.className = 'is-self';
        const medal = $('ranking-period').value === 'weekly' ? ['', '🥇 ', '🥈 ', '🥉 '][entry.position] || '' : '';
        for (const value of [`${medal}${entry.position}`, entry.alias, entry.rank, (entry.badges || []).map(id => badges[id] || id).join(', ') || '—', entry.score, time(entry.durationMs)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
        $('ranking-entries').append(row);
      }
      $('ranking-personal').textContent = data.personal ? `Tu posición: ${data.personal.position} · ${data.personal.score} puntos` : 'Completa una partida validada en esta modalidad para entrar.';
      $('ranking-status').textContent = data.entries.length ? 'La clasificación conserva la mejor partida de cada jugador.' : 'El camino espera a sus primeros campeones.';
    } catch (_) {
      if (version !== requestVersion) return;
      $('ranking-entries').replaceChildren(); $('ranking-personal').textContent = '';
      $('ranking-status').textContent = 'Clasificación no disponible. Puedes seguir jugando y ganar progreso local.';
    }
  }
  function localReward(metrics, difficulty) {
    const score = 1000 + metrics.kills * 100 + (metrics.optionalCompleted ? 300 : 0) + Math.max(0, 500 - metrics.deaths * 100) + Math.max(0, 300 - Math.floor(metrics.durationMs / 1000));
    const xpEarned = 100 + Math.floor(score / 20);
    const earned = ['first_victory'];
    if (!metrics.deaths) earned.push('steady_step');
    if (metrics.shots >= 10 && metrics.hits / metrics.shots >= .7) earned.push('precise_huaraca');
    if (metrics.llamaHits >= 5) earned.push('road_companions');
    if (metrics.optionalCompleted) earned.push('terrace_explorer');
    if (difficulty === 'pachacutec') earned.push('pachacutec_challenge');
    const newBadges = earned.filter(id => !local.badges.includes(id));
    local.xp += xpEarned; local.badges = [...new Set([...local.badges, ...earned])]; persist();
    return { score, xpEarned, newBadges, player: local, ranked: false };
  }
  function getDifficulty() { return document.querySelector('input[name="difficulty"]:checked').value; }
  function begin(difficulty = getDifficulty()) {
    const run = { difficulty, finished: false, promise: null }; current = run;
    $('competition-result').textContent = `${names[difficulty]} · Expedición en curso${connected ? '' : ' · Sin clasificación'}`;
    run.promise = (async () => {
      await profileRequest;
      // Decide after the initial session request; offline runs are never uploaded later.
      if (!connected || current !== run) return null;
      try { return await api('/runs', 'POST', { difficulty, stage: 1, version: 1 }); } catch (_) { return null; }
    })();
    return run;
  }
  async function finish(input) {
    const run = current;
    if (!run || run.finished || input.completed === false) return;
    run.finished = true;
    const metrics = { completed: true, kills: 0, shots: 0, hits: 0, llamaHits: 0, deaths: 0, optionalCompleted: false, durationMs: 0, ...input };
    $('competition-result').textContent = 'Anudando tu quipu…';
    const start = await run.promise;
    if (current !== run) return;
    let reward;
    if (start && start.runId) {
      const path = `/runs/${encodeURIComponent(start.runId)}/finish`;
      try { reward = await api(path, 'POST', metrics); }
      catch (_) {
        // The API is idempotent: recover a response lost after committing.
        if (current !== run) return;
        try { reward = await api(path, 'POST', metrics); } catch (_) {}
      }
    }
    if (current !== run) return;
    if (!reward) reward = localReward(metrics, run.difficulty);
    player = reward.player; connected = reward.ranked === true; drawProfile();
    if (reward.progress) { profileProgress = reward.progress; window.dispatchEvent(new CustomEvent("chankas-profile", { detail: reward })); }
    $('competition-result').textContent = `${names[run.difficulty]} · ${reward.score} puntos · +${reward.xpEarned} XP · ${reward.ranked ? 'Partida clasificada' : 'Progreso local, sin clasificación'}${reward.newBadges.length ? ` · Nuevas insignias: ${reward.newBadges.map(id => badges[id] || id).join(', ')}` : ''}`;
    refreshRanking();
  }
  function sync(view) {
    const state = typeof view === 'string' ? view : view?.state;
    const signature = `${state}:${current?.difficulty || getDifficulty()}`;
    if (signature === lastSync) return;
    lastSync = signature;
    const locked = !['menu', 'title', 'map'].includes(state);
    $('difficulty-selector').disabled = locked;
    $('difficulty-note').textContent = locked ? `${names[current?.difficulty || getDifficulty()]} · Modalidad fijada. Vuelve al título para cambiarla.` : 'La modalidad se fija al comenzar. Nombres temáticos inspirados en los Andes.';
  }
  function reset() { current = null; }
  $('alias-form').addEventListener('submit', async event => {
    event.preventDefault();
    const alias = $('player-alias').value.trim();
    if (!/^[\p{L}\p{N} _-]{3,24}$/u.test(alias)) { $('profile-status').textContent = 'Usa entre 3 y 24 letras, números, espacios, guiones o guiones bajos.'; return; }
    if (connected) {
      try { const data = await api('/profile', 'PATCH', { alias }); player = data.player || data; drawProfile(); refreshRanking(); }
      catch (_) { $('profile-status').textContent = 'No se pudo guardar el alias. Inténtalo nuevamente.'; }
    } else { local.alias = alias; persist(); player = local; drawProfile(); }
  });
  for (const id of ['ranking-difficulty', 'ranking-period']) $(id).addEventListener('change', refreshRanking);
  $('ranking-refresh').addEventListener('click', async () => { await loadProfile(); refreshRanking(); });
  document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener('change', () => { $('ranking-difficulty').value = getDifficulty(); refreshRanking(); }));
  window.ChankasCompetition = { getDifficulty, begin, finish, reset, sync, getProgress: () => profileProgress };
  drawProfile(); profileRequest = loadProfile(); profileRequest.then(refreshRanking);
})();

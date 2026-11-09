// HUD, joystick, radar and menus (DOM overlay)
import { MINERALS, MINERAL_KEYS, TIERS, STATION_LEVELS, WEAPONS, WEAPON_KEYS, UPGRADES, upgradeCost, xpForLevel, LEVEL_TITLES, sectorAt, BOSS_LAIR } from './data.js?v=3';
import { fmt, clamp } from './util.js?v=3';
import { FloatText } from './fx.js?v=3';
import { Preview } from './preview.js?v=3';

const $ = (id) => document.getElementById(id);
const TIER_CROPS = [[18, 368, 120, 100], [122, 305, 232, 190], [320, 228, 275, 255], [495, 220, 385, 310], [745, 105, 530, 490]];
const CRYSTAL = '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2l6 6-6 14-6-14z" fill="#bfe9ff" stroke="#7fd7ff" stroke-width="1"/><path d="M6 8h12M12 2v20" stroke="#6ab" stroke-width=".6"/></svg>';

export class UI {
  constructor(game, audio, opts) {
    this.g = game; this.audio = audio; this.opts = opts;
    this.modalOpen = null; this.tab = 'market'; this.toastQ = [];
    this.float3 = new FloatText($('floats'), game.camera);
    this.radar = $('radar'); this.rctx = this.radar.getContext('2d');
    this.joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = {};
    this.tiersImg = new Image(); this.tiersImg.src = 'art/tiers.jpg';
    this.bind();
    this.hudT = 0; this.radarT = 0; this.liveT = 0; this.preview = new Preview(); this.pvTier = null; this.confirmKey = null;
    game.ui = this;
  }
  float(x, y, z, t, c, big) { this.float3.spawn(x, y, z, t, c, big); }

  // ---------- input ----------
  bind() {
    const canvas = this.opts.canvas; const joy = $('joy'), knob = $('joyKnob');
    const rest = () => { joy.style.left = ''; joy.style.top = ''; joy.classList.remove('live'); knob.style.transform = 'translate(-50%,-50%)'; };
    const start = (e) => {
      if (this.joy.active || this.modalOpen) return;
      this.audio.init();
      this.joy.active = true; this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.x = this.joy.y = 0;
      joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('live');
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      $('hint').classList.add('gone');
    };
    const move = (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.id) return;
      const R = 56; let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.joy.x = dx / R; this.joy.y = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const end = (e) => { if (e.pointerId !== this.joy.id) return; this.joy.active = false; this.joy.x = this.joy.y = 0; rest(); };
    canvas.addEventListener('pointerdown', start); window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    joy.addEventListener('pointerdown', (e) => { e.preventDefault(); start(e); });
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true; this.audio.init();
      if (e.code === 'Escape') this.close();
      if (this.modalOpen) return;
      if (e.code === 'KeyU') this.open('upgrades'); if (e.code === 'KeyM') this.open('missions'); if (e.code === 'KeyF') this.open('station', 'factory'); if (e.code === 'KeyH') this.stationBtn();
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) $('hint').classList.add('gone');
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); this.audio.init(); this.audio.click(); fn(); });
    click('btnSettings', () => this.open('settings'));
    click('btnUpgrades', () => this.open('upgrades'));
    click('btnFactory', () => this.open('station', 'factory'));
    click('btnMissions', () => this.open('missions'));
    click('credPanel', () => this.open('upgrades'));
    click('btnStation', () => this.stationBtn());
    click('questCard', () => { if (this.g.storyDone()) { this.g.claimStory(); this.refreshHud(true); } else this.open('missions'); });
    click('modalClose', () => this.close());
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.close(); });
    $('modalBody').addEventListener('click', (e) => this.onAction(e));
    // live volume sliders (applied while dragging, saved on release)
    $('modalBody').addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.vol; if (!k) return; const v = clamp(+e.target.value / 100, 0, 1); this.g.s.settings[k] = v;
      if (k === 'musicVol') this.g.s.settings.music = v > 0; if (k === 'sfxVol') this.g.s.settings.sfx = v > 0; const l = $('vol_' + k); if (l) l.textContent = Math.round(v * 100) + '%'; this.opts.applySettings(true); });
    $('modalBody').addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.vol) { this.g.save(); if (e.target.dataset.vol !== 'musicVol') this.audio.click(); } });
    $('modalTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { this.audio.click(); this.tab = t.dataset.tab; this.render(); } });
  }
  readInput() {
    let x = this.joy.x, z = this.joy.y;
    const k = this.keys;
    const kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), kz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (kx || kz) { const d = Math.hypot(kx, kz); x = kx / d; z = kz / d; }
    if (this.modalOpen) { x = 0; z = 0; }
    this.g.input.x = x; this.g.input.z = z;
  }
  stationBtn() {
    if (this.g.docked) this.open('station', 'market');
    else if (this.g.dead) return;
    else { this.g.autopilot = !this.g.autopilot; if (this.g.autopilot) this.audio.boost(); this.toast(this.g.autopilot ? 'Autopilot engaged: returning to station' : 'Autopilot off'); }
  }

  // ---------- feedback ----------
  toast(msg, kind = '') {
    const box = $('toasts'); const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
  }
  sectorBanner(sec) {
    const b = $('banner'); b.innerHTML = `<small>SECTOR ${sec.id}</small>${sec.name.toUpperCase()}<em>${['Safe zone', 'Low pirate activity', 'High pirate activity', 'Extreme danger'][sec.danger]}</em>`;
    b.className = 'show d' + sec.danger; clearTimeout(this.bannerT); this.bannerT = setTimeout(() => (b.className = ''), 2800);
  }
  hurtFlash() { const h = $('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
  cargoFull() { $('cargoPanel').classList.add('full'); }
  onDock() { this.toast('Docked at station. Hull repaired.', 'good'); $('btnStation').classList.add('docked'); }

  // ---------- HUD per frame ----------
  update(dt, w, h) {
    this.readInput();
    this.float3.update(dt, w, h);
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.12; this.refreshHud(); }
    this.radarT -= dt; if (this.radarT <= 0) { this.radarT = 1 / 20; this.drawRadar(); }
    this.liveT -= dt; if (this.modalOpen && this.liveT <= 0) { this.liveT = 0.25; this.live(); }
    if (this.modalOpen) this.preview.render(dt);
    this.homeArrow(w, h);
  }
  refreshHud(force) {
    const g = this.g, s = g.s, st = g.stats();
    $('lvlNum').textContent = s.level;
    $('lvlTitle').textContent = LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((s.level - 1) / 3))].toUpperCase();
    const need = xpForLevel(s.level); $('xpFill').style.width = (100 * s.xp / need).toFixed(1) + '%'; $('xpText').textContent = `${fmt(s.xp)} / ${fmt(need)} XP`;
    $('credits').textContent = fmt(s.credits);
    const ct = g.cargoTotal(); $('cargoNum').textContent = `${ct} / ${st.cargo}`; $('cargoFill').style.width = (100 * ct / st.cargo).toFixed(1) + '%';
    $('cargoPanel').classList.toggle('full', ct >= st.cargo);
    let top = null; for (const k of MINERAL_KEYS) if (s.cargo[k] && (!top || s.cargo[k] > s.cargo[top])) top = k;
    $('cargoType').innerHTML = top ? `<b style="color:${MINERALS[top].css}">${MINERALS[top].name.toUpperCase()}</b><br>${s.cargo[top]} UNITS` : 'EMPTY<br>&nbsp;';
    $('hullFill').style.width = (100 * Math.max(0, g.player.hp) / g.player.maxHp).toFixed(1) + '%';
    $('hullFill').classList.toggle('low', g.player.hp / g.player.maxHp < 0.3);
    // quest
    const q = g.currentStory(); const qc = $('questCard');
    if (q) {
      const prog = g.questState(q, s.storyProg); const done = prog >= q.need;
      $('qTitle').textContent = q.title.toUpperCase(); $('qDesc').textContent = q.desc;
      $('qFill').style.width = (100 * prog / q.need) + '%'; $('qNum').textContent = done ? 'CLAIM ▸' : `${fmt(prog)} / ${fmt(q.need)}`;
      qc.classList.toggle('done', done);
    } else { $('qTitle').textContent = 'FRONTIER MASTERED'; $('qDesc').textContent = 'Keep completing contracts!'; $('qFill').style.width = '100%'; $('qNum').textContent = ''; }
    const contractsReady = s.contracts.some((c) => g.questState(c, c.prog) >= c.need);
    $('btnMissions').classList.toggle('alert', contractsReady);
    // factory indicator
    const fr = g.factoryRates(); const ff = s.factory.stored / fr.capacity;
    $('facFill').style.width = (100 * ff).toFixed(1) + '%'; $('btnFactory').classList.toggle('alert', ff >= 0.999);
    // upgrade affordability indicator
    const canUp = UPGRADES.some((u) => s.upgrades[u.key] < u.max && s.credits >= upgradeCost(u, s.upgrades[u.key]));
    $('btnUpgrades').classList.toggle('alert', canUp);
    // heat
    const sec = sectorAt(Math.hypot(g.player.x, g.player.z));
    $('heatWrap').classList.toggle('show', sec.danger > 0); $('heatFill').style.width = g.heat.toFixed(1) + '%';
    $('sectorName').textContent = `S${sec.id} · ${sec.name.toUpperCase()}`; $('sectorName').className = 'd' + sec.danger;
    // boss
    const b = g.boss; $('bossBar').classList.toggle('show', !!(b && !b.dead && b.state === 'attack'));
    if (b) $('bossFill').style.width = (100 * Math.max(0, b.hp) / b.maxHp) + '%';
    // station button
    const sb = $('btnStation'); sb.classList.toggle('docked', g.docked); sb.classList.toggle('auto', g.autopilot);
    $('stationLbl').textContent = g.docked ? 'OPEN' : g.autopilot ? 'AUTO ▸' : 'STATION';
    $('dockTag').classList.toggle('show', g.docked);
    if (this.opts.showFps) $('fps').textContent = this.opts.fpsText();
  }
  homeArrow(w, h) {
    const g = this.g; const v = g.tmpV.set(0, 0, 0).project(g.camera); const a = $('homeArrow');
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const off = x < 0 || x > w || y < 0 || y > h || v.z > 1;
    a.classList.toggle('show', off && !g.dead);
    if (!off) return;
    const cx = w / 2, cy = h / 2; let dx = x - cx, dy = y - cy; if (v.z > 1) { dx = -dx; dy = -dy; }
    const ang = Math.atan2(dy, dx); const m = 46; const k = Math.min((cx - m) / Math.abs(Math.cos(ang) || 1e-6), (cy - m - 60) / Math.abs(Math.sin(ang) || 1e-6));
    a.style.transform = `translate(${cx + Math.cos(ang) * k}px, ${cy + Math.sin(ang) * k}px) translate(-50%,-50%)`;
    a.querySelector('i').style.transform = `rotate(${ang}rad)`;
    a.querySelector('span').textContent = Math.round(Math.hypot(g.player.x, g.player.z)) + 'm';
  }
  drawRadar() {
    const c = this.radar, ctx = this.rctx, g = this.g; const S = c.width, R = S / 2;
    const T = TIERS[g.s.tier - 1]; const range = 85 * T.cam; const k = (R - 6) / range; const px = g.player.x, pz = g.player.z;
    ctx.clearRect(0, 0, S, S);
    ctx.save(); ctx.beginPath(); ctx.arc(R, R, R - 3, 0, Math.PI * 2); ctx.clip();
    const grd = ctx.createRadialGradient(R, R, 0, R, R, R); grd.addColorStop(0, 'rgba(10,40,60,0.75)'); grd.addColorStop(1, 'rgba(4,14,26,0.85)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(80,210,255,0.22)'; ctx.lineWidth = 1;
    for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(R, R, (R - 3) * f, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(R, 4); ctx.lineTo(R, S - 4); ctx.moveTo(4, R); ctx.lineTo(S - 4, R); ctx.stroke();
    // sweep
    const sa = (g.time * 1.6) % (Math.PI * 2); const sg = ctx.createConicGradient ? ctx.createConicGradient(sa, R, R) : null;
    if (sg) { sg.addColorStop(0, 'rgba(80,220,255,0.28)'); sg.addColorStop(0.12, 'rgba(80,220,255,0)'); sg.addColorStop(1, 'rgba(80,220,255,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, S, S); }
    // sector boundary rings
    ctx.strokeStyle = 'rgba(255,90,110,0.35)'; ctx.setLineDash([3, 4]);
    for (const rr of [190, 400, 650]) { const d = Math.hypot(px, pz); if (Math.abs(d - rr) < range * 1.5) { ctx.beginPath(); ctx.arc(R + (0 - px) * k, R + (0 - pz) * k, rr * k, 0, Math.PI * 2); ctx.stroke(); } }
    ctx.setLineDash([]);
    const dot = (x, z, r, col) => { const sx = R + (x - px) * k, sy = R + (z - pz) * k; if ((sx - R) ** 2 + (sy - R) ** 2 > (R - 4) ** 2) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); };
    for (const a of g.field.list) if (a.alive) dot(a.x, a.z, Math.max(1.2, a.r * k * 0.9), a.rich ? '#ffcf5a' : 'rgba(150,170,190,0.65)');
    for (const m of g.minerals.list) dot(m.x, m.z, 1, MINERALS[m.type].css);
    for (const e of g.enemies) if (!e.dead) dot(e.x, e.z, e.type === 'boss' ? 6 : e.type === 'gunship' ? 3.2 : 2.4, e.type === 'boss' ? '#ff3df2' : e.type === 'sentinel' ? '#ffaa33' : '#ff4455');
    // station
    const edge = (x, z, col, label) => {
      let sx = (x - px) * k, sy = (z - pz) * k; const d = Math.hypot(sx, sy); const lim = R - 10;
      if (d > lim) { sx *= lim / d; sy *= lim / d; }
      ctx.fillStyle = col; ctx.strokeStyle = '#012'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(R + sx - 4, R + sy - 4, 8, 8); ctx.fill(); ctx.stroke();
      if (label) { ctx.font = 'bold 8px sans-serif'; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(label, R + sx, R + sy - 7); }
    };
    edge(0, 0, '#4dffb8', 'HOME');
    if (g.s.maxSector >= 3 || Math.hypot(px - BOSS_LAIR.x, pz - BOSS_LAIR.z) < 300) edge(BOSS_LAIR.x, BOSS_LAIR.z, '#ff3df2', '☠');
    ctx.restore();
    // player arrow
    ctx.save(); ctx.translate(R, R); ctx.rotate(Math.PI - g.player.yaw);
    ctx.fillStyle = '#5fe3ff'; ctx.shadowColor = '#5fe3ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(90,220,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- modals ----------
  open(which, tab) {
    this.audio.init(); if (!this.modalOpen) this.audio.menuOpen();
    this.modalOpen = which; if (tab) this.tab = tab; else if (which === 'station' && !this.tab) this.tab = 'market';
    $('modal').classList.remove('hidden'); $('modal').dataset.kind = which;
    this.render(true);
  }
  close() {
    if (!this.modalOpen) return; this.modalOpen = null; this.preview.hide(); this.confirmKey = null; this.audio.menuClose();
    $('modal').classList.add('hidden'); if (this.opts.isPlaying()) this.g.save();
  }
  render(resetScroll) {
    const body = $('modalBody'); const st = body.scrollTop;
    const which = this.modalOpen; let title = '', tabs = '', html = '';
    if (which === 'station') {
      title = STATION_LEVELS[this.g.s.stationLvl - 1].name.toUpperCase();
      const T = [['market', 'Market'], ['factory', 'Factory'], ['expand', 'Expand'], ['shipyard', 'Shipyard'], ['loadout', 'Loadout']];
      if (!T.find((t) => t[0] === this.tab)) this.tab = 'market';
      tabs = T.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('');
      html = this['tab_' + this.tab]();
    } else if (which === 'upgrades') { title = 'SHIP UPGRADES'; html = this.renderUpgrades(); }
    else if (which === 'missions') { title = 'MISSIONS'; html = this.renderMissions(); }
    else if (which === 'settings') { title = 'SETTINGS'; html = this.renderSettings(); }
    else if (which === 'saves') { title = 'SAVE / LOAD'; html = this.renderSaves(); }
    $('modalTitle').textContent = title; $('modalTabs').innerHTML = tabs; $('modalTabs').style.display = tabs ? '' : 'none';
    body.innerHTML = html; body.scrollTop = resetScroll ? 0 : st;
    if (resetScroll) { body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter'); }
    this.attachPreview();
    this.live();
  }
  live() {
    // update dynamic parts without re-render
    const g = this.g, s = g.s; $('modalCredits').innerHTML = CRYSTAL + fmt(s.credits);
    document.querySelectorAll('#modalBody [data-cost]').forEach((b) => { const ok = s.credits >= +b.dataset.cost && b.dataset.block !== '1'; b.classList.toggle('dis', !ok); });
    const ff = $('facStored'); if (ff) { const r = g.factoryRates(); ff.textContent = fmt(s.factory.stored); $('facBar').style.width = (100 * s.factory.stored / r.capacity) + '%'; $('facClaim').classList.toggle('dis', s.factory.stored < 1); }
  }
  attachPreview() {
    const slot = document.querySelector('#modalBody .pvSlot');
    if (!slot) { this.preview.hide(); return; }
    const ok = this.preview.show(slot, slot.dataset.kind, +slot.dataset.arg);
    slot.classList.toggle('noPv', !ok);
  }
  dockNote() { return this.g.docked ? '' : `<div class="note">🚀 Dock at the station to use this. <button class="btn sm" data-act="autopilot">Autopilot home</button></div>`; }
  matsHtml(mats) { if (!mats) return ''; return Object.entries(mats).map(([k, n]) => `<span class="mat ${this.g.s.vault[k] >= n ? '' : 'miss'}" style="--c:${MINERALS[k].css}">${this.g.s.vault[k]}/${n} ${MINERALS[k].name}</span>`).join(' '); }
  tab_market() {
    const g = this.g, s = g.s; const ct = g.cargoTotal();
    let h = this.dockNote();
    h += `<div class="card"><div class="row"><div><h4>CARGO HOLD</h4><p>${ct} / ${g.stats().cargo} units. Cargo is sold automatically when you dock. Rare ores (Viridium, Crimsonite, Voidstone) go to the vault for construction.</p></div></div>
      <div class="chips">${MINERAL_KEYS.map((k) => `<span class="chip" style="--c:${MINERALS[k].css}">${MINERALS[k].name} <b>${s.cargo[k]}</b><small>${MINERALS[k].value} cr</small></span>`).join('')}</div>
      <button class="btn wide ${g.docked && ct ? '' : 'dis'}" data-act="sell">SELL CARGO</button></div>`;
    h += `<div class="card"><h4>STATION VAULT</h4><p>Rare materials for station expansion and new ship hulls. Sell surplus for credits.</p>`;
    for (const k of MINERAL_KEYS.filter((k) => MINERALS[k].vault)) h += `<div class="row vrow"><span class="chip" style="--c:${MINERALS[k].css}">${MINERALS[k].name} <b>${s.vault[k]}</b></span><button class="btn sm ${g.docked && s.vault[k] >= 10 ? '' : 'dis'}" data-act="sellvault" data-k="${k}">Sell 10 (+${10 * MINERALS[k].value})</button></div>`;
    h += `</div>`;
    return h;
  }
  tab_factory() {
    const g = this.g, s = g.s, r = g.factoryRates();
    const ci = g.factoryUpCost('inc'), cc = g.factoryUpCost('cap');
    return `<div class="card fac"><div class="row"><div class="facIcon">🏭</div><div style="flex:1"><h4>REFINERY FACTORY</h4><p>Produces credits around the clock, even while you're away.</p></div></div>
      <div class="stats3"><div><small>INCOME</small><b>${fmt(r.income + g.droneIncome())}/min</b></div><div><small>CAPACITY</small><b>${fmt(r.capacity)}</b></div><div><small>STORED</small><b id="facStored">${fmt(s.factory.stored)}</b></div></div>
      <div class="bar big"><i id="facBar"></i></div>
      <button id="facClaim" class="btn wide gold" data-act="claim">CLAIM</button></div>
      <div class="card up"><div class="upi">⇪</div><div class="upt"><h4>Income · Lv ${s.factory.inc + 1}</h4><p>+30% credits per minute</p></div><button class="btn" data-act="facup" data-w="inc" data-cost="${ci}">${CRYSTAL}${fmt(ci)}</button></div>
      <div class="card up"><div class="upi">▤</div><div class="upt"><h4>Capacity · Lv ${s.factory.cap + 1}</h4><p>+45% storage before it's full</p></div><button class="btn" data-act="facup" data-w="cap" data-cost="${cc}">${CRYSTAL}${fmt(cc)}</button></div>
      <div class="card up"><div class="upi">⛏</div><div class="upt"><h4>Mining drones · ${g.droneCount()}</h4><p>${g.droneCount() ? `Station drones mine nearby rocks: +${fmt(g.droneIncome())} cr/min into the factory${s.stationLvl >= 3 ? ' and the odd Viridium for the vault' : ''}.` : 'Expand the station to Lv 2 to launch mining drones.'}</p></div></div>
      <p class="muted">Station level multiplies factory output (×${STATION_LEVELS[s.stationLvl - 1].mult}).</p>`;
  }
  tab_expand() {
    const g = this.g, s = g.s; const inf = g.stationUpgradeInfo();
    let h = this.dockNote();
    h += `<div class="card"><div class="pvSlot station" data-kind="station" data-arg="${s.stationLvl}"><div class="stationArt" style="background-position:${['0%', '0%', '50%', '50%', '100%', '100%'][s.stationLvl - 1]} 50%"></div><span class="pvTag">LIVE VIEW · LV ${s.stationLvl}</span></div>
      <h4>LEVEL ${s.stationLvl}: ${STATION_LEVELS[s.stationLvl - 1].name.toUpperCase()}</h4><p>${STATION_LEVELS[s.stationLvl - 1].desc}</p>
      <div class="pips">${STATION_LEVELS.map((l) => `<i class="${l.lvl <= s.stationLvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
    if (inf) {
      const n = inf.next; const block = !g.docked || !inf.ok;
      h += `<div class="card"><h4>NEXT: ${n.name.toUpperCase()}</h4><p>${n.desc}</p><p>Factory output ×${n.mult} · sell bonus +${n.lvl * 10 - 10}%</p><div class="mats">${this.matsHtml(n.mats)}</div>
        <button class="btn wide gold" data-act="station" data-cost="${n.cost}" data-block="${block ? 1 : 0}">EXPAND ${CRYSTAL}${fmt(n.cost)}</button></div>`;
    } else h += `<div class="card"><h4>MAXIMUM LEVEL</h4><p>Your Frontier Citadel is complete.</p></div>`;
    return h;
  }
  tierCanvas(i) { return `<canvas class="tierArt" data-tier="${i}" width="200" height="120"></canvas>`; }
  tab_shipyard() {
    const g = this.g, s = g.s; let h = this.dockNote();
    const pt = this.pvTier || Math.min(5, s.tier + 1); const PT = TIERS[pt - 1];
    h += `<div class="card pvCard"><div class="pvSlot" data-kind="ship" data-arg="${pt}"><span class="pvTag">TIER ${pt} · ${PT.name.toUpperCase()}</span></div>
      <div class="seg pvSel">${TIERS.map((T) => `<button class="${pt === T.tier ? 'on' : ''}" data-act="pvtier" data-t="${T.tier}">T${T.tier}</button>`).join('')}</div></div>`;
    TIERS.forEach((T, i) => {
      const owned = s.tier >= T.tier, next = T.tier === s.tier + 1; const inf = g.tierInfo(T.tier);
      const req = T.tier > 1 ? `Requires station Lv ${T.station}` : '';
      h += `<div class="card tier ${owned ? 'owned' : ''} ${s.tier === T.tier ? 'cur' : ''}">${this.tierCanvas(i)}<div class="tinfo"><small>TIER ${T.tier} · ${T.cls.toUpperCase()}</small><h4>${T.name}</h4>
        <p>${T.slots} weapon slot${T.slots > 1 ? 's' : ''} · Hull ${T.hp} · Cargo ${T.cargo}${T.tier >= 4 ? ' · escort drones' : ''}</p>
        ${owned ? `<span class="tag">${s.tier === T.tier ? 'ACTIVE' : 'OWNED'}</span>` : `<p class="${s.stationLvl >= T.station ? 'okreq' : 'req'}">${req}</p><div class="mats">${this.matsHtml(T.mats)}</div>
        ${next ? `<button class="btn gold" data-act="tier" data-t="${T.tier}" data-cost="${T.cost}" data-block="${!g.docked || !inf.ok ? 1 : 0}">BUILD ${CRYSTAL}${fmt(T.cost)}</button>` : '<span class="tag dim">LOCKED</span>'}`}</div></div>`;
    });
    setTimeout(() => this.drawTierArt(), 0);
    return h;
  }
  drawTierArt() {
    const img = this.tiersImg; if (!img.complete) { img.onload = () => this.drawTierArt(); return; }
    document.querySelectorAll('canvas.tierArt').forEach((c) => {
      const [x, y, w, h] = TIER_CROPS[+c.dataset.tier]; const ctx = c.getContext('2d');
      const s = Math.min(c.width / w, c.height / h); const dw = w * s, dh = h * s;
      ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, x, y, w, h, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    });
  }
  tab_loadout() {
    const g = this.g, s = g.s; const slots = g.stats().slots;
    let h = `<p class="muted">Weapons fire automatically at anything in range. Lasers prefer asteroids; cannons, missiles and pulses prioritise pirates. Bigger hulls add more slots.</p>`;
    h += `<div class="card"><h4>WEAPON SLOTS (${slots})</h4>`;
    for (let i = 0; i < slots; i++) {
      const cur = g.slotWeapon(i);
      h += `<div class="slot"><span class="sn">${i + 1}</span><div class="opts">${WEAPON_KEYS.map((k) => `<button class="wpn ${cur === k ? 'on' : ''} ${s.weapons[k] ? '' : 'lock'}" data-act="slot" data-i="${i}" data-k="${k}" style="--c:${WEAPONS[k].color}">${WEAPONS[k].short}</button>`).join('')}</div></div>`;
    }
    h += `</div>`;
    for (const k of WEAPON_KEYS) {
      const W = WEAPONS[k]; const owned = s.weapons[k]; const lockLvl = s.level < W.unlock;
      h += `<div class="card up"><div class="upi" style="color:${W.color}">${{ laser: '⌁', cannon: '⁂', missile: '➹', pulse: '◉' }[k]}</div><div class="upt"><h4>${W.name}</h4><p>${W.desc}</p></div>
        ${owned ? '<span class="tag">OWNED</span>' : lockLvl ? `<span class="tag dim">LV ${W.unlock}</span>` : `<button class="btn" data-act="buyw" data-k="${k}" data-cost="${W.price}">${CRYSTAL}${fmt(W.price)}</button>`}</div>`;
    }
    return h;
  }
  renderUpgrades() {
    const g = this.g, s = g.s; let h = `<p class="muted">Upgrades apply to every ship you fly. Costs rise with each level.</p>`;
    for (const u of UPGRADES) {
      const l = s.upgrades[u.key]; const max = l >= u.max; const c = upgradeCost(u, l);
      h += `<div class="card up"><div class="upi">${u.icon}</div><div class="upt"><h4>${u.name} <small>Lv ${l}</small></h4><p>${u.fmt(l)} → <b>${u.fmt(l + 1).replace(/^\+/, '+')}</b></p><div class="bar thin"><i style="width:${100 * l / u.max}%"></i></div></div>
        ${max ? '<span class="tag">MAX</span>' : `<button class="btn" data-act="up" data-k="${u.key}" data-cost="${c}">${CRYSTAL}${fmt(c)}</button>`}</div>`;
    }
    return h;
  }
  renderMissions() {
    const g = this.g, s = g.s; const q = g.currentStory(); let h = '';
    if (q) {
      const p = g.questState(q, s.storyProg); const done = p >= q.need;
      h += `<div class="card mission main ${done ? 'done' : ''}"><small>STORY MISSION ${s.story + 1}/20</small><h4>${q.title}</h4><p>${q.desc}</p><div class="bar"><i style="width:${100 * p / q.need}%"></i></div>
        <div class="row"><span class="rew">${CRYSTAL}${fmt(q.reward.credits)} · ${fmt(q.reward.xp)} XP</span><span>${fmt(p)} / ${fmt(q.need)}</span></div>
        ${done ? '<button class="btn wide gold" data-act="claimstory">CLAIM REWARD</button>' : ''}</div>`;
    }
    h += `<h5>CONTRACTS</h5>`;
    s.contracts.forEach((c, i) => {
      const p = g.questState(c, c.prog); const done = p >= c.need;
      h += `<div class="card mission ${done ? 'done' : ''}"><small>${c.title.toUpperCase()}</small><h4>${c.desc}</h4><div class="bar"><i style="width:${100 * p / c.need}%"></i></div>
        <div class="row"><span class="rew">${CRYSTAL}${fmt(c.reward.credits)} · ${fmt(c.reward.xp)} XP</span>${done ? `<button class="btn gold sm" data-act="claimc" data-i="${i}">CLAIM</button>` : `<span>${fmt(p)} / ${fmt(c.need)}</span>`}</div></div>`;
    });
    const st = s.stats;
    h += `<h5>CAREER</h5><div class="card stats"><span>Ore mined <b>${fmt(st.mined)}</b></span><span>Asteroids <b>${fmt(st.rocks)}</b></span><span>Pirates <b>${fmt(st.kills)}</b></span><span>Units sold <b>${fmt(st.sold)}</b></span><span>Warlords <b>${st.bosses}</b></span><span>Furthest <b>Sector ${s.maxSector}</b></span></div>`;
    return h;
  }
  renderSettings() {
    const st = this.g.s.settings; const tg = (k, label) => `<div class="card row"><span>${label}</span><button class="toggle ${st[k] ? 'on' : ''}" data-act="toggle" data-k="${k}">${st[k] ? 'ON' : 'OFF'}</button></div>`;
    const sl = (k, label) => { const v = Math.round((st[k] ?? 0) * 100); return `<div class="card row vol"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${v}" data-vol="${k}" aria-label="${label} volume"><b class="volv" id="vol_${k}">${v}%</b></div>`; };
    return `<div class="card"><h4>AUDIO</h4></div>` + sl('masterVol', 'Master') + sl('musicVol', 'Music') + sl('sfxVol', 'Sound effects') + tg('mute', 'Mute all') + tg('shake', 'Camera shake') + tg('fps', 'Show FPS') +
      `<div class="card row"><span>Graphics quality</span><div class="seg">${['auto', 'low', 'medium', 'high'].map((q) => `<button class="${st.quality === q ? 'on' : ''}" data-act="quality" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div></div>
      <div class="card"><h4>CONTROLS</h4><p>Touch: drag anywhere to steer (virtual joystick). Weapons fire automatically.<br>Desktop: WASD / arrow keys or drag with the mouse. U = upgrades, M = missions, F = factory, H = station/autopilot, Esc = close.</p></div>
      <div class="card row"><span>Progress autosaves every few seconds.</span><span class="btnrow"><button class="btn sm gold" data-act="save">Save game</button><button class="btn sm" data-act="saves">Save / Load…</button></span></div>
      <div class="card row"><span>Erase all progress</span><button class="btn sm danger" data-act="reset" data-confirm="1">Reset</button></div>
      <p class="muted">Stellar Frontier v3.0 · Built with three.js · All sound and music synthesised in real time</p>`;
  }
  slotCard(i) {
    const g = this.g; const auto = i === 'auto'; const m = g.slotMeta(i); const name = auto ? 'AUTOSAVE' : `SLOT ${i}`;
    const when = (t) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const pt = (sec) => { sec = Math.floor(sec || 0); const h = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60; return h ? `${h}h ${mm}m` : `${mm}m ${sec % 60}s`; };
    let h = `<div class="card slot ${m ? '' : 'empty'}" data-slot="${i}"><div class="sHead"><span class="sName">${name}</span><span class="sDate">${m ? when(m.savedAt) : 'Empty slot'}</span></div>`;
    if (m) h += `<div class="sGrid"><span><small>SHIP</small><b>T${m.tier} ${m.tierName}</b></span><span><small>LEVEL</small><b>${m.level}</b></span><span><small>CREDITS</small><b>${fmt(m.credits)}</b></span>
      <span><small>STATION</small><b>Lv ${m.station}</b></span><span><small>SECTOR</small><b>${m.sector}</b></span><span><small>PLAYTIME</small><b>${pt(m.playTime)}</b></span></div>`;
    h += `<div class="sBtns">`;
    if (!auto) h += `<button class="btn sm gold" data-act="slotsave" data-i="${i}" ${m ? 'data-confirm="1"' : ''}>${m ? 'OVERWRITE' : 'SAVE HERE'}</button>`;
    if (m) h += `<button class="btn sm" data-act="slotload" data-i="${i}" data-confirm="1">LOAD</button>`;
    if (m && !auto) h += `<button class="btn sm danger" data-act="slotdel" data-i="${i}" data-confirm="1">DELETE</button>`;
    return h + `</div></div>`;
  }
  renderSaves() {
    const g = this.g; let h = `<p class="muted">Three manual slots plus the autosave. Saves live in this browser; use Export to move progress to another device.</p>`;
    h += this.slotCard('auto'); for (let i = 1; i <= g.slotCount(); i++) h += this.slotCard(i);
    h += `<h5>TRANSFER</h5><div class="card"><h4>EXPORT</h4><p>Copy a save code or download a save file.</p>
      <div class="btnrow"><button class="btn sm" data-act="export">SHOW CODE</button><button class="btn sm" data-act="copycode">COPY CODE</button><button class="btn sm" data-act="download">DOWNLOAD FILE</button></div>
      <textarea id="exportBox" class="code ${this.exportShown ? '' : 'hidden'}" readonly></textarea></div>
      <div class="card"><h4>IMPORT</h4><p>Paste a save code or pick a save file. This replaces your current game.</p>
      <textarea id="importBox" class="code" placeholder="Paste SF2.… code here"></textarea>
      <div class="btnrow"><button class="btn sm gold" data-act="importcode" data-confirm="1">IMPORT CODE</button><label class="btn sm filebtn">IMPORT FILE<input id="importFile" type="file" accept=".sfsave,.txt,.json,text/plain,application/json"></label></div></div>`;
    setTimeout(() => {
      const eb = $('exportBox'); if (eb && this.exportShown) eb.value = g.exportSave();
      const f = $('importFile'); if (f) f.onchange = () => { const file = f.files[0]; if (!file) return; if (file.size > 2e6) { this.toast('That file is too large to be a save', 'warn'); return; }
        file.text().then((t) => this.doImport(t)).catch(() => this.toast('Could not read that file', 'warn')); f.value = ''; };
    }, 0);
    return h;
  }
  doImport(text) {
    const r = this.g.importSave(text);
    if (!r.ok) { this.toast('Import failed: ' + r.error, 'warn'); return false; }
    this.toast('Save imported', 'good'); this.audio.saved(); this.afterLoad(); return true;
  }
  afterLoad() { this.close(); this.refreshHud(true); this.opts.onLoaded && this.opts.onLoaded(); }
  onAction(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const g = this.g; const a = b.dataset.act; this.audio.click();
    // tap-again confirmation for destructive actions (window.confirm is unreliable inside some webviews)
    if (b.dataset.confirm === '1') {
      const key = a + ':' + (b.dataset.i || '');
      if (this.confirmKey !== key) {
        this.confirmKey = key; document.querySelectorAll('#modalBody .confirming').forEach((x) => { x.classList.remove('confirming'); x.textContent = x.dataset.label; });
        b.dataset.label = b.textContent; b.textContent = 'TAP AGAIN TO CONFIRM'; b.classList.add('confirming');
        clearTimeout(this.confirmT); this.confirmT = setTimeout(() => { if (this.confirmKey === key) { this.confirmKey = null; if (b.isConnected) { b.classList.remove('confirming'); b.textContent = b.dataset.label; } } }, 3500);
        return;
      }
      this.confirmKey = null;
    }
    if (b.classList.contains('dis') && !['slot', 'toggle', 'quality', 'reset', 'save', 'autopilot', 'saves', 'pvtier'].includes(a)) { this.toast(b.dataset.block === '1' && !g.docked ? 'Dock at the station first' : 'Not enough credits or materials', 'warn'); return; }
    switch (a) {
      case 'sell': { const r = g.sellCargo(); if (r) this.toast(`Sold: +${r.credits} cr`, 'good'); break; }
      case 'sellvault': g.sellVault(b.dataset.k, 10); break;
      case 'claim': { const n = g.claimFactory(); if (n) this.toast(`Claimed ${fmt(n)} credits from the factory`, 'good'); break; }
      case 'facup': g.upgradeFactory(b.dataset.w); break;
      case 'station': g.upgradeStation(); break;
      case 'tier': g.buyTier(+b.dataset.t); break;
      case 'buyw': if (g.buyWeapon(b.dataset.k)) this.toast(`${WEAPONS[b.dataset.k].name} purchased and equipped`, 'good'); break;
      case 'slot': if (!g.s.weapons[b.dataset.k]) { this.toast(`Buy the ${WEAPONS[b.dataset.k].name} first`, 'warn'); return; } g.setSlot(+b.dataset.i, b.dataset.k); break;
      case 'up': g.buyUpgrade(b.dataset.k); break;
      case 'claimstory': g.claimStory(); break;
      case 'claimc': g.claimContract(+b.dataset.i); break;
      case 'autopilot': this.close(); g.autopilot = true; this.audio.boost(); this.toast('Autopilot engaged: returning to station'); return;
      case 'toggle': { const k = b.dataset.k; g.s.settings[k] = !g.s.settings[k]; this.opts.applySettings(); g.save(); break; }
      case 'quality': g.s.settings.quality = b.dataset.q; this.opts.applySettings(); g.save(); break;
      case 'save': { const ok = g.save(); if (ok) this.audio.saved(); this.toast(ok ? 'Game saved' : 'Save failed: storage is unavailable', ok ? 'good' : 'warn'); break; }
      case 'saves': this.open('saves'); return;
      case 'pvtier': this.pvTier = +b.dataset.t; break;
      case 'slotsave': { const ok = g.saveSlot(+b.dataset.i); if (ok) this.audio.saved(); this.toast(ok ? `Game saved to slot ${b.dataset.i}` : 'Save failed: storage is unavailable', ok ? 'good' : 'warn'); break; }
      case 'slotload': { const i = b.dataset.i === 'auto' ? 'auto' : +b.dataset.i; if (g.loadSlot(i)) { this.toast(i === 'auto' ? 'Autosave loaded' : `Slot ${i} loaded`, 'good'); this.afterLoad(); } else this.toast('That save could not be read', 'warn'); return; }
      case 'slotdel': g.deleteSlot(+b.dataset.i); this.toast(`Slot ${b.dataset.i} deleted`); break;
      case 'export': this.exportShown = true; break;
      case 'copycode': { const code = g.exportSave(); this.exportShown = true; const done = () => this.toast('Save code copied', 'good');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => this.toast('Copy blocked: select the code and copy it manually', 'warn')); else this.toast('Select the code and copy it manually', 'warn'); break; }
      case 'download': { const code = g.exportSave(); const blob = new Blob([code], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
        const el = document.createElement('a'); el.href = url; el.download = `stellar-frontier-${new Date().toISOString().slice(0, 10)}.sfsave`; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
        this.toast('Save file downloaded', 'good'); break; }
      case 'importcode': { const t = ($('importBox') || {}).value || ''; if (!t.trim()) { this.toast('Paste a save code first', 'warn'); return; } this.doImport(t); return; }
      case 'reset': g.reset(); return;
    }
    this.render(); this.refreshHud();
  }
}

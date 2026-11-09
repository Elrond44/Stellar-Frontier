// HUD, joystick, radar and menus (DOM overlay)
import { MINERALS, MINERAL_KEYS, TIERS, STATION_LEVELS, UPGRADES, upgradeCost, xpForLevel, LEVEL_TITLES, sectorAt, BOSS_LAIR } from './data.js?v=4';
import { BRANCHES, SKILLS, SKILL_BY_ID, ABILITIES, skillCost } from './rpg.js?v=4';
import { RARITIES, TEMPLATES, CATS, SPECIALS, itemStats, itemPower, upgradeCost as itemUpCost, salvageValue, merchantStock } from './items.js?v=4';
import { FACTIONS, INSIGNIA, GSECTORS, SECTOR_BY_ID, RINGS, MAP_R, gsectorAt, outposts, caches, liberation, owner, isPirate, threatLabel, neighbours, killsNeeded, NEUTRAL } from './galaxy.js?v=4';
import { INV_CAP } from './save.js?v=4';
import { fmt, clamp } from './util.js?v=4';
import { FloatText } from './fx.js?v=4';
import { Preview } from './preview.js?v=4';

const $ = (id) => document.getElementById(id);
const TIER_CROPS = [[18, 368, 120, 100], [122, 305, 232, 190], [320, 228, 275, 255], [495, 220, 385, 310], [745, 105, 530, 490]];
const ABIL_ICON = { dash: '⇶', emp: 'ϟ', overload: '⛨', barrage: '➹', surge: '✷', drones: '✣' };
const STAT_ROWS = [['dps', 'DPS', 1], ['dmg', 'Damage', 1], ['rate', 'Fire rate', 2], ['range', 'Range', 1], ['energy', 'Energy use', 1, true], ['heat', 'Heat', 1, true], ['speed', 'Proj. speed', 0], ['shieldMul', 'vs Shields', 2], ['pen', 'Armor pen.', 'pct'], ['crit', 'Crit bonus', 'pct']];
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
    this.upTab = 'skills'; this.branch = 'weapons'; this.selSkill = null; this.selItem = null; this.invFilter = 'all'; this.mapView = null; this.mapSel = null; this.abilKey = '';
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
      if (e.code === 'KeyU') this.open('upgrades'); if (e.code === 'KeyM') this.open('missions'); if (e.code === 'KeyG') this.open('map'); if (e.code === 'KeyK') this.open('upgrades', null, 'skills'); if (e.code === 'KeyI') this.open('upgrades', null, 'gear');
      { const ab = this.g.abilities(); const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code); if (n >= 0 && ab[n]) this.g.useAbility(ab[n]); if (e.code === 'Space' && ab.includes('dash')) this.g.useAbility('dash'); } if (e.code === 'KeyF') this.open('station', 'factory'); if (e.code === 'KeyH') this.stationBtn();
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) $('hint').classList.add('gone');
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); this.audio.init(); this.audio.click(); fn(); });
    click('btnSettings', () => this.open('settings'));
    click('btnUpgrades', () => this.open('upgrades'));
    click('btnFactory', () => this.open('station', 'factory'));
    click('btnMissions', () => this.open('missions'));
    click('credPanel', () => this.open('upgrades', null, 'systems'));
    click('spChip', () => this.open('upgrades', null, 'skills'));
    click('btnMap', () => this.open('map'));
    click('sectorName', () => this.open('map'));
    $('radar').addEventListener('click', (e) => { e.stopPropagation(); this.audio.init(); this.audio.click(); this.open('map'); });
    $('abilities').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-ab]'); if (!b) return; e.preventDefault(); e.stopPropagation(); this.audio.init(); if (this.g.useAbility(b.dataset.ab)) { b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); } });
    $('libNotice').addEventListener('click', (e) => { e.stopPropagation(); if (e.target.closest('[data-act="libclose"]')) { this.audio.click(); $('libNotice').classList.add('hidden'); } });
    click('btnStation', () => this.stationBtn());
    click('questCard', () => { if (this.g.storyDone()) { this.g.claimStory(); this.refreshHud(true); } else this.open('missions'); });
    click('modalClose', () => this.close());
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.close(); });
    $('modalBody').addEventListener('click', (e) => this.onAction(e));
    // live volume sliders (applied while dragging, saved on release)
    $('modalBody').addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.vol; if (!k) return; const v = clamp(+e.target.value / 100, 0, 1); this.g.s.settings[k] = v;
      if (k === 'musicVol') this.g.s.settings.music = v > 0; if (k === 'sfxVol') this.g.s.settings.sfx = v > 0; const l = $('vol_' + k); if (l) l.textContent = Math.round(v * 100) + '%'; this.opts.applySettings(true); });
    $('modalBody').addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.vol) { this.g.save(); if (e.target.dataset.vol !== 'musicVol') this.audio.click(); } });
    $('modalTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { this.audio.click(); if (this.modalOpen === 'upgrades') this.upTab = t.dataset.tab; else this.tab = t.dataset.tab; this.render(true); } });
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
  insignia(id, color, cls = 'ins') { const d = INSIGNIA[id] || INSIGNIA.neutral; return `<svg class="${cls}" viewBox="0 0 1 1" aria-hidden="true"><path d="${d}" fill="${color}" fill-rule="evenodd"/></svg>`; }
  threatPips(t) { return `<span class="pips5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= t ? 'on t' + t : ''}"></i>`).join('')}</span>`; }
  sectorBanner(sec, o = {}) {
    if (!sec || !sec.ring) { const g = this.g; sec = g.gsec; } // legacy call
    const g = this.g; const own = owner(sec, g.s.galaxy); const b = $('banner');
    const status = sec.faction === 'haven' ? 'SAFE HAVEN' : g.s.galaxy.liberated[sec.id] ? 'LIBERATED SPACE' : sec.faction === 'neutral' ? 'UNCLAIMED SPACE' : `${own.name.toUpperCase()} TERRITORY`;
    b.innerHTML = `<div class="bIns">${this.insignia(own.id, own.color)}</div><small>SECTOR ${sec.id} · ${status}</small>${sec.name.toUpperCase()}<em>THREAT ${this.threatPips(sec.threat)} ${threatLabel(sec.threat).toUpperCase()}</em>${o.fresh ? `<em class="disc">◆ NEW SECTOR DISCOVERED · +${o.xp} XP</em>` : ''}`;
    b.style.setProperty('--fc', own.color); b.className = 'show t' + sec.threat; clearTimeout(this.bannerT); this.bannerT = setTimeout(() => (b.className = ''), o.fresh ? 3800 : 2800);
  }
  liberationNotice(d) {
    const el = $('libNotice'); const R = RARITIES[d.item.r]; const F = d.faction;
    el.innerHTML = `<div class="libIn"><div class="libIns">${this.insignia('liberated', '#4fd2ff', 'ins big')}${F ? `<span class="libOld">${this.insignia(F.id, F.color)}</span>` : ''}</div>
      <small>SECTOR ${d.sec.id} · ${F ? F.name.toUpperCase() + ' DRIVEN OUT' : ''}</small><h2>SECTOR LIBERATED</h2><h3>${d.sec.name.toUpperCase()}</h3>
      <div class="libRew"><span>${CRYSTAL}<b>+${fmt(d.credits)}</b></span><span><b>+${fmt(d.xp)}</b> XP</span><span><b>+${d.parts}</b> components</span></div>
      <div class="libItem" style="--rc:${R.color}">◆ ${R.name.toUpperCase()} reward dropped: ${d.item.name}</div>
      <p>Pirate raids have stopped here and the sector now shows as liberated on your galaxy map.</p><button class="btn gold" data-act="libclose">CONTINUE</button></div>`;
    el.classList.remove('hidden'); clearTimeout(this.libT); this.libT = setTimeout(() => el.classList.add('hidden'), 9000);
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
    this.homeArrow(w, h); this.wpArrow(w, h); this.updateAbilities();
  }
  updateAbilities() {
    const g = this.g; const ab = g.abilities(); const key = ab.join(',');
    const box = $('abilities');
    if (key !== this.abilKey) { this.abilKey = key; box.innerHTML = ab.map((id, i) => `<button class="abil" data-ab="${id}" style="--ac:${ABILITIES[id].color}" aria-label="${ABILITIES[id].name}"><span class="aic">${ABIL_ICON[id]}</span><i class="cdr"></i><b class="cdt"></b><small>${ABILITIES[id].short}</small><em class="hk">${i + 1}</em></button>`).join(''); }
    for (const b of box.children) {
      const st = g.abilityState(b.dataset.ab); const deg = Math.round(st.frac * 360);
      if (b._deg !== deg) { b._deg = deg; b.querySelector('.cdr').style.background = deg > 0 ? `conic-gradient(rgba(2,8,16,.78) ${deg}deg, transparent ${deg}deg)` : 'none'; }
      const txt = st.rem > 0 ? Math.ceil(st.rem) : ''; if (b._t !== txt) { b._t = txt; b.querySelector('.cdt').textContent = txt; }
      b.classList.toggle('ready', st.ready); b.classList.toggle('noen', st.rem <= 0 && !st.energyOk);
      const act = (b.dataset.ab === 'overload' && g.overT > 0) || (b.dataset.ab === 'surge' && g.surgeT > 0) || (b.dataset.ab === 'drones' && g.allies.length > 0); b.classList.toggle('active', act);
    }
  }
  wpArrow(w, h) {
    const g = this.g; const wp = g.s.galaxy.wp; const a = $('wpArrow');
    if (!wp || g.dead) { a.classList.remove('show'); return; }
    const v = g.tmpV.set(wp.x, 0, wp.z).project(g.camera); const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const off = x < 0 || x > w || y < 0 || y > h || v.z > 1; a.classList.add('show'); a.classList.toggle('on', !off);
    const dist = Math.round(Math.hypot(wp.x - g.player.x, wp.z - g.player.z)); a.querySelector('span').textContent = `${wp.label.toUpperCase()} · ${dist}m`;
    if (!off) { a.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%)`; a.querySelector('i').style.transform = 'rotate(90deg)'; return; }
    const cx = w / 2, cy = h / 2; let dx = x - cx, dy = y - cy; if (v.z > 1) { dx = -dx; dy = -dy; }
    const ang = Math.atan2(dy, dx); const m = 60; const k = Math.min((cx - m) / Math.abs(Math.cos(ang) || 1e-6), (cy - m - 80) / Math.abs(Math.sin(ang) || 1e-6));
    a.style.transform = `translate(${cx + Math.cos(ang) * k}px, ${cy + Math.sin(ang) * k}px) translate(-50%,-50%)`; a.querySelector('i').style.transform = `rotate(${ang}rad)`;
  }
  refreshHud(force) {
    const g = this.g, s = g.s, st = g.stats();
    $('lvlNum').textContent = s.level;
    $('lvlTitle').textContent = LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((s.level - 1) / 3))].toUpperCase();
    const need = xpForLevel(s.level); $('xpFill').style.width = (100 * s.xp / need).toFixed(1) + '%'; $('xpText').textContent = `${fmt(s.xp)} / ${fmt(need)} XP`;
    const sp = g.spAvail(); const chip = $('spChip'); chip.firstChild.textContent = sp; chip.classList.toggle('has', sp > 0);
    const p = g.player; $('shFill').style.width = (st.shield ? 100 * Math.max(0, p.sh) / st.shield : 0).toFixed(1) + '%'; $('enFill').style.width = (100 * Math.max(0, p.energy) / st.energyMax).toFixed(1) + '%';
    $('shFill').parentNode.classList.toggle('over', g.overT > 0);
    const gs = g.gsec; const lib = isPirate(gs) && !s.galaxy.liberated[gs.id]; $('libWrap').classList.toggle('show', lib);
    if (lib) { const lp = liberation(gs, s.galaxy); $('libFill').style.width = (100 * lp).toFixed(1) + '%'; const os = outposts(gs); $('libLbl').textContent = `LIBERATION ${Math.floor(lp * 100)}% · ${os.filter((o) => s.galaxy.inst[o.id]).length}/${os.length} OUTPOSTS`; }
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
    $('btnUpgrades').classList.toggle('alert', canUp || sp > 0);
    // heat
    const own = owner(gs, s.galaxy); const danger = gs.faction === 'haven' || s.galaxy.liberated[gs.id] ? 0 : 1;
    $('heatWrap').classList.toggle('show', danger > 0); $('heatFill').style.width = g.heat.toFixed(1) + '%';
    const sn = $('sectorName'); const key = gs.id + own.id; if (sn._k !== key) { sn._k = key; sn.innerHTML = `${this.insignia(own.id, own.color)}<span>${gs.id} · ${gs.name.toUpperCase()}</span>`; sn.style.setProperty('--fc', own.color); sn.className = 't' + gs.threat; }
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
    const T = TIERS[g.s.tier - 1]; const st = g.stats(); const range = 85 * T.cam * st.radar; const k = (R - 6) / range; const px = g.player.x, pz = g.player.z; const fx = st.fx;
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
    // galaxy sector boundaries (faint radial lines)
    ctx.strokeStyle = 'rgba(120,200,255,0.18)';
    for (const RG of RINGS) { if (RG.id === 'H') continue; const d0 = Math.hypot(px, pz); if (d0 + range < RG.r0 || d0 - range > Math.min(RG.r1, 1100)) continue; for (let i = 0; i < RG.n; i++) { const a = RG.off + i / RG.n * Math.PI * 2; ctx.beginPath(); ctx.moveTo(R + (Math.cos(a) * RG.r0 - px) * k, R + (Math.sin(a) * RG.r0 - pz) * k); ctx.lineTo(R + (Math.cos(a) * Math.min(RG.r1, 1100) - px) * k, R + (Math.sin(a) * Math.min(RG.r1, 1100) - pz) * k); ctx.stroke(); } }
    for (const l of g.loot) { const sx = R + (l.x - px) * k, sy = R + (l.z - pz) * k; ctx.fillStyle = RARITIES[l.it.r].color; ctx.beginPath(); ctx.moveTo(sx, sy - 3.5); ctx.lineTo(sx + 3, sy); ctx.lineTo(sx, sy + 3.5); ctx.lineTo(sx - 3, sy); ctx.fill(); }
    for (const [, c] of g.liveCaches) if (c.obj.visible) dot(c.c.x, c.c.z, 3, '#5dff98');
    for (const e of g.enemies) { if (e.dead || e.cloaked) continue;
      if (e.D.inst) { const F = FACTIONS[e.faction]; const sx = R + (e.x - px) * k, sy = R + (e.z - pz) * k; if ((sx - R) ** 2 + (sy - R) ** 2 > (R - 4) ** 2) continue; const sz = e.type === 'inst_core' ? 5 : 2.6; ctx.fillStyle = F ? F.color : '#ff4455'; ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz); if (e.type === 'inst_core') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(sx - sz / 2 - 1.5, sy - sz / 2 - 1.5, sz + 3, sz + 3); } continue; }
      dot(e.x, e.z, e.type === 'boss' ? 6 : e.type === 'gunship' ? 3.2 : 2.4, e.type === 'boss' ? '#ff3df2' : e.type === 'sentinel' ? '#ffaa33' : e.faction ? FACTIONS[e.faction].color : '#ff4455');
      if (e.elite && fx.eliteDmg) { const sx = R + (e.x - px) * k, sy = R + (e.z - pz) * k; ctx.strokeStyle = '#ffb238'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.stroke(); } }
    // known outposts beyond radar range (Installation Detection reveals them)
    if (fx.detect) for (const sec of [g.gsec, ...neighbours(g.gsec)]) { if (!isPirate(sec) || g.s.galaxy.liberated[sec.id]) continue; for (const o of outposts(sec)) { if (g.s.galaxy.inst[o.id] || g.liveOutposts.has(o.id)) continue; const sx = R + (o.x - px) * k, sy = R + (o.z - pz) * k; if ((sx - R) ** 2 + (sy - R) ** 2 > (R - 4) ** 2) continue; ctx.strokeStyle = FACTIONS[sec.faction].color; ctx.lineWidth = 1.5; ctx.strokeRect(sx - 3, sy - 3, 6, 6); } }
    // station
    const edge = (x, z, col, label) => {
      let sx = (x - px) * k, sy = (z - pz) * k; const d = Math.hypot(sx, sy); const lim = R - 10;
      if (d > lim) { sx *= lim / d; sy *= lim / d; }
      ctx.fillStyle = col; ctx.strokeStyle = '#012'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(R + sx - 4, R + sy - 4, 8, 8); ctx.fill(); ctx.stroke();
      if (label) { ctx.font = 'bold 8px sans-serif'; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(label, R + sx, R + sy - 7); }
    };
    edge(0, 0, '#4dffb8', 'HOME');
    if (g.s.galaxy.wp) edge(g.s.galaxy.wp.x, g.s.galaxy.wp.z, '#ffd166', 'WP');
    if (g.s.maxSector >= 3 || Math.hypot(px - BOSS_LAIR.x, pz - BOSS_LAIR.z) < 300) edge(BOSS_LAIR.x, BOSS_LAIR.z, '#ff3df2', '☠');
    ctx.restore();
    // player arrow
    ctx.save(); ctx.translate(R, R); ctx.rotate(Math.PI - g.player.yaw);
    ctx.fillStyle = '#5fe3ff'; ctx.shadowColor = '#5fe3ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(90,220,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- modals ----------
  open(which, tab, upTab) {
    this.audio.init(); if (!this.modalOpen) this.audio.menuOpen();
    if (upTab) this.upTab = upTab;
    this.modalOpen = which; if (tab) this.tab = tab; else if (which === 'station' && !this.tab) this.tab = 'market';
    $('modal').classList.remove('hidden'); $('modal').dataset.kind = which;
    this.render(true);
  }
  close() {
    if (!this.modalOpen) return; this.modalOpen = null; this.preview.hide(); this.confirmKey = null; this.audio.menuClose(); this.mapCanvas = null;
    $('modal').classList.add('hidden'); if (this.opts.isPlaying()) this.g.save();
  }
  render(resetScroll) {
    const body = $('modalBody'); const st = body.scrollTop;
    const which = this.modalOpen; let title = '', tabs = '', html = '';
    if (which === 'station') {
      title = STATION_LEVELS[this.g.s.stationLvl - 1].name.toUpperCase();
      const T = [['market', 'Market'], ['factory', 'Factory'], ['expand', 'Expand'], ['shipyard', 'Shipyard'], ['armory', 'Armory']];
      if (!T.find((t) => t[0] === this.tab)) this.tab = 'market';
      tabs = T.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('');
      html = this['tab_' + this.tab]();
    } else if (which === 'upgrades') {
      const T = [['skills', 'Skills'], ['gear', 'Gear'], ['systems', 'Systems']]; if (!T.find((t) => t[0] === this.upTab)) this.upTab = 'skills';
      title = { skills: 'SKILL TREE', gear: 'WEAPONS & GEAR', systems: 'SHIP SYSTEMS' }[this.upTab];
      tabs = T.map(([k, n]) => `<button data-tab="${k}" class="${this.upTab === k ? 'on' : ''}">${n}${k === 'skills' && this.g.spAvail() > 0 ? ` <b class="badgeN">${this.g.spAvail()}</b>` : ''}</button>`).join('');
      html = this.upTab === 'skills' ? this.renderSkills() : this.upTab === 'gear' ? this.renderGear() : this.renderUpgrades();
    } else if (which === 'map') { title = 'GALAXY MAP'; html = this.renderMap(); }
    else if (which === 'missions') { title = 'MISSIONS'; html = this.renderMissions(); }
    else if (which === 'settings') { title = 'SETTINGS'; html = this.renderSettings(); }
    else if (which === 'saves') { title = 'SAVE / LOAD'; html = this.renderSaves(); }
    $('modalTitle').textContent = title; $('modalTabs').innerHTML = tabs; $('modalTabs').style.display = tabs ? '' : 'none';
    body.innerHTML = html; body.scrollTop = resetScroll ? 0 : st;
    if (resetScroll) { body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter'); }
    this.attachPreview();
    if (which === 'map') this.attachMap();
    this.live();
  }
  live() {
    // update dynamic parts without re-render
    const g = this.g, s = g.s; $('modalCredits').innerHTML = CRYSTAL + fmt(s.credits);
    document.querySelectorAll('#modalBody [data-cost]').forEach((b) => { const ok = s.credits >= +b.dataset.cost && b.dataset.block !== '1'; b.classList.toggle('dis', !ok); });
    if (this.modalOpen === 'map') this.drawMap();
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
  tab_armory() {
    const g = this.g, s = g.s; let h = this.dockNote();
    h += `<div class="card row"><span>Inventory ${s.inv.length}/${INV_CAP} · ${fmt(s.parts)} components</span><button class="btn sm" data-act="gotogear">MANAGE GEAR ▸</button></div>`;
    h += `<p class="muted">The station Armory sells standard-issue Common and Uncommon weapons. Rare, Epic, Legendary and Exotic gear only drops from pirates, outposts, hidden caches, liberations and bosses.</p>`;
    for (const o of merchantStock(s.level)) {
      const T = TEMPLATES[o.t]; const R = RARITIES[o.r]; const C = CATS[T.cat]; const block = !g.docked || o.locked;
      h += `<div class="card up item r${o.r}" style="--rc:${R.color}"><div class="upi" style="color:${C.color}">${C.icon}</div><div class="upt"><h4>${T.name} <small style="color:${R.color}">${R.name}</small></h4><p>${C.name} · item level ${o.il} · ${T.desc}</p></div>
        ${o.locked ? `<span class="tag dim">LV ${o.lvl}</span>` : `<button class="btn" data-act="buyitem" data-t="${o.t}" data-cost="${o.price}" data-block="${block ? 1 : 0}">${CRYSTAL}${fmt(o.price)}</button>`}</div>`;
    }
    return h;
  }
  // ---------- skill tree ----------
  renderSkills() {
    const g = this.g, s = g.s; const sp = g.spAvail(); const B = BRANCHES.find((b) => b.id === this.branch) || BRANCHES[0];
    let h = `<div class="spHead"><div><small>SHIP LEVEL ${s.level}</small><b>${sp}</b> skill point${sp === 1 ? '' : 's'} available</div><span class="muted">+1 SP per level · +1 bonus every 5th level</span></div>`;
    h += `<div class="branches">${BRANCHES.map((b) => { const n = SKILLS.filter((k) => k.b === b.id); const own = n.filter((k) => s.skills[k.id]).length; const avail = n.some((k) => g.skillInfo(k.id).canBuy);
      return `<button class="br ${b.id === B.id ? 'on' : ''} ${avail ? 'avail' : ''}" data-act="branch" data-b="${b.id}" style="--bc:${b.color}"><span>${b.icon}</span><small>${b.short}</small><em>${own}/${n.length}</em></button>`; }).join('')}</div>`;
    // tree: 4 tiers x 3 columns, prerequisites drawn as SVG links
    const nodes = SKILLS.filter((k) => k.b === B.id); const X = (c) => 16.67 + c * 33.33, Y = (t) => 12.5 + (t - 1) * 25;
    let lines = '';
    for (const n of nodes) for (const q of n.req || []) { const r = SKILL_BY_ID[q]; const lit = s.skills[q] > 0; const on = lit && s.skills[n.id] > 0;
      lines += `<line x1="${X(r.col)}" y1="${Y(r.tier)}" x2="${X(n.col)}" y2="${Y(n.tier)}" class="${on ? 'on' : lit ? 'lit' : ''}"/>`; }
    h += `<div class="tree" style="--bc:${B.color}"><svg class="links" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>`;
    for (let t = 1; t <= 4; t++) h += `<div class="tierLbl" style="top:${Y(t)}%">T${t}</div>`;
    for (const n of nodes) {
      const inf = g.skillInfo(n.id); const st = inf.state; const sel = this.selSkill === n.id;
      h += `<button class="node ${st} ${inf.canBuy ? 'buy' : ''} ${sel ? 'sel' : ''} ${n.ability ? 'abil' : ''}" style="left:${X(n.col)}%;top:${Y(n.tier)}%" data-act="skill" data-k="${n.id}" aria-label="${n.name}">
        <span class="ni">${n.ability ? ABIL_ICON[n.ability] : B.icon}</span><span class="nr">${inf.r}/${n.max}</span>${st === 'locked' && !inf.lvlOk ? `<span class="nl">LV${n.lvl}</span>` : ''}<small>${n.name}</small></button>`;
    }
    h += `</div>`;
    h += this.skillInspect();
    const rs = g.respecInfo();
    h += `<div class="card row"><div><h4>RESPEC</h4><p>Refund all ${rs.spent} spent SP. Costs ${fmt(rs.cost)} cr${rs.docked ? '' : ' · dock at the station first'}.</p></div><button class="btn sm danger" data-act="respec" data-confirm="1" data-cost="${rs.cost}" data-block="${!rs.docked || !rs.spent ? 1 : 0}">RESPEC</button></div>`;
    return h;
  }
  skillInspect() {
    const g = this.g; const id = this.selSkill; if (!id || !SKILL_BY_ID[id]) return `<div class="card inspect muted">Tap a node to inspect it. Lit nodes are unlocked, bright outlines can be bought now, dim nodes need prerequisites or a higher ship level.</div>`;
    const n = SKILL_BY_ID[id]; const inf = g.skillInfo(id); const B = BRANCHES.find((b) => b.id === n.b); const cost = skillCost(n);
    const reqs = (n.req || []).map((q) => `<span class="${g.s.skills[q] ? 'ok' : 'miss'}">${SKILL_BY_ID[q].name}</span>`).join(' ');
    const A = n.ability ? ABILITIES[n.ability] : null;
    let h = `<div class="card inspect" style="--bc:${B.color}"><div class="row"><div><small>${B.name.toUpperCase()} · TIER ${n.tier}${n.ability ? ' · ACTIVE ABILITY' : ''}</small><h4>${n.name} <small>rank ${inf.r}/${n.max}</small></h4></div><span class="tag ${inf.state === 'locked' ? 'dim' : ''}">${inf.state.toUpperCase()}</span></div>
      <p>${n.desc}</p>`;
    if (A) h += `<p class="ab">⏱ ${A.cd}s cooldown · ⚡ ${A.energy} energy · ${A.desc}</p>`;
    h += `<p>${inf.r ? `Now: <b>${n.fmt(inf.r)}</b>` : ''}${inf.r < n.max ? `${inf.r ? ' → ' : ''}Next: <b>${n.fmt(inf.r + 1)}</b>` : ' · MAXED'}</p>
      <p class="reqs">Requires: ship level <span class="${g.s.level >= (n.lvl || 1) ? 'ok' : 'miss'}">${n.lvl || 1}</span>${reqs ? ' · ' + reqs : ''} · Cost <b>${cost} SP</b>/rank</p>`;
    if (inf.r < n.max) h += `<button class="btn wide ${inf.canBuy ? 'gold' : 'dis'}" data-act="buyskill" data-k="${id}" ${inf.canBuy ? 'data-confirm="1"' : ''} data-block="${inf.canBuy ? 0 : 1}">${inf.canBuy ? `UNLOCK RANK ${inf.r + 1} · ${cost} SP` : inf.reqMissing && inf.reqMissing.length ? 'PREREQUISITE NEEDED' : !inf.lvlOk ? `REACH LEVEL ${n.lvl}` : 'NOT ENOUGH SP'}</button>`;
    return h + `</div>`;
  }
  // ---------- gear / inventory ----------
  statBlock(it, cmp) {
    const S = itemStats(it); const C = cmp ? itemStats(cmp) : null; const dps = (x) => (x.beh === 'beam' ? x.dmg : x.dmg * x.rate * (x.beh === 'missile' ? 2 : 1));
    const val = (x, k) => (k === 'dps' ? dps(x) : x[k]);
    const f = (v, d) => (d === 'pct' ? Math.round(v * 100) + '%' : d === 2 ? v.toFixed(2) : Math.round(v * 10) / 10);
    let h = `<div class="statGrid">`;
    for (const [k, l, d, low] of STAT_ROWS) {
      if (k === 'speed' && S.beh !== 'bolt' && S.beh !== 'missile') continue; if ((k === 'crit') && !S.crit) continue;
      const v = val(S, k); let delta = '';
      if (C) { const c = val(C, k); const diff = v - c; if (Math.abs(diff) > 1e-3 * Math.max(1, Math.abs(c))) { const better = low ? diff < 0 : diff > 0; delta = `<i class="${better ? 'up' : 'dn'}">${better ? '▲' : '▼'}${f(Math.abs(diff), d)}</i>`; } }
      h += `<span><small>${l}${k === 'dmg' && S.beh === 'beam' ? '/s' : ''}</small><b>${f(v, d)}</b>${delta}</span>`;
    }
    h += `</div>`;
    if (it.sp.length) h += `<div class="specials">${it.sp.map((k) => `<span class="spc"><b>${SPECIALS[k].name}</b> ${SPECIALS[k].desc}</span>`).join('')}</div>`;
    return h;
  }
  itemRow(it, eqSlot) {
    const R = RARITIES[it.r]; const T = TEMPLATES[it.t]; const C = CATS[T.cat]; const sel = this.selItem === it.id;
    return `<button class="irow r${it.r} ${sel ? 'sel' : ''} ${it.il > this.g.s.level ? 'lvllock' : ''}" data-act="item" data-id="${it.id}" style="--rc:${R.color}"><span class="iic" style="color:${C.color}">${C.icon}</span>
      <span class="inm"><b>${it.name}${it.up ? ` +${it.up}` : ''}</b><small>${R.name} ${C.name} · iLvl ${it.il}${it.sp.length ? ' · ' + it.sp.map((k) => SPECIALS[k].name).join(', ') : ''}</small></span>
      <span class="ipw"><b>${itemPower(it)}</b><small>POWER</small></span>${eqSlot != null ? `<em class="eqb">SLOT ${eqSlot + 1}</em>` : ''}</button>`;
  }
  renderGear() {
    const g = this.g, s = g.s; g.ensureEquipSlots(); const slots = g.stats().slots;
    let h = `<div class="gearHead"><span>HARDPOINTS <b>${slots}</b></span><span>INVENTORY <b>${s.inv.length}/${INV_CAP}</b></span><span>COMPONENTS <b>${fmt(s.parts)}</b></span></div>`;
    h += `<h5>EQUIPPED (${s.equip.filter(Boolean).length}/${slots}) · ship tier sets the hardpoint count</h5>`;
    for (let i = 0; i < slots; i++) { const it = g.item(s.equip[i]); h += it ? this.itemRow(it, i) : `<div class="irow empty"><span class="iic">＋</span><span class="inm"><b>Empty hardpoint ${i + 1}</b><small>Select an item below and equip it here</small></span></div>`; }
    const sel = g.item(this.selItem); if (sel) h += this.itemDetail(sel);
    const eq = g.equippedIds(); const cats = ['all', ...Object.keys(CATS)];
    h += `<h5>INVENTORY</h5><div class="seg filt">${cats.map((c) => `<button class="${this.invFilter === c ? 'on' : ''}" data-act="ifilter" data-c="${c}">${c === 'all' ? 'ALL' : CATS[c].icon}</button>`).join('')}</div>`;
    const list = s.inv.filter((it) => !eq.has(it.id) && (this.invFilter === 'all' || TEMPLATES[it.t].cat === this.invFilter)).sort((a, b) => b.r - a.r || itemPower(b) - itemPower(a));
    h += list.length ? list.map((it) => this.itemRow(it)).join('') : `<p class="muted">No spare weapons${this.invFilter !== 'all' ? ' in this category' : ''}. Pirates, outposts and hidden caches drop new gear; the station Armory sells basics.</p>`;
    h += `<div class="legend">${RARITIES.map((r) => `<span style="--rc:${r.color}">◆ ${r.name}</span>`).join('')}</div>`;
    return h;
  }
  itemDetail(it) {
    const g = this.g, s = g.s; const R = RARITIES[it.r]; const T = TEMPLATES[it.t]; const C = CATS[T.cat];
    const eqi = s.equip.indexOf(it.id); const equipped = eqi >= 0;
    // compare against the weakest equipped weapon of any kind (or the slot it would replace)
    const others = s.equip.map((id) => g.item(id)).filter((x) => x && x.id !== it.id); const cmp = equipped ? null : others.sort((a, b) => itemPower(a) - itemPower(b))[0];
    const uc = itemUpCost(it); const maxed = it.up >= R.maxUp; const sv = salvageValue(it);
    let h = `<div class="card idetail r${it.r}" style="--rc:${R.color}"><div class="row"><div><small style="color:${R.color}">${R.name.toUpperCase()} · ${C.name.toUpperCase()} · ITEM LEVEL ${it.il}</small><h4>${it.name}${it.up ? ` +${it.up}` : ''}</h4></div><span class="tag" style="border-color:${R.color};color:${R.color}">${itemPower(it)} PWR</span></div>
      <p>${T.desc}</p><p class="muted">Source: ${it.src} · upgrades ${it.up}/${R.maxUp}${it.il > s.level ? ` · <b class="miss">needs ship level ${it.il}</b>` : ''}</p>
      ${cmp ? `<p class="cmpN">Compared with equipped <b style="color:${RARITIES[cmp.r].color}">${cmp.name}</b></p>` : ''}${this.statBlock(it, cmp)}`;
    h += `<div class="slotPick">`;
    if (equipped) h += `<button class="btn sm" data-act="unequip" data-i="${eqi}">UNEQUIP</button>`;
    else for (let i = 0; i < s.equip.length; i++) { const cur = g.item(s.equip[i]); h += `<button class="btn sm ${cur ? '' : 'gold'} ${it.il > s.level ? 'dis' : ''}" data-act="equip" data-id="${it.id}" data-i="${i}">${cur ? `SWAP SLOT ${i + 1}` : `EQUIP SLOT ${i + 1}`}</button>`; }
    h += `</div><div class="btnrow">`;
    h += maxed ? `<span class="tag">MAX UPGRADE</span>` : `<button class="btn sm gold ${s.credits >= uc.credits && s.parts >= uc.parts ? '' : 'dis'}" data-act="itemup" data-id="${it.id}" data-cost="${uc.credits}" data-block="${s.parts >= uc.parts ? 0 : 1}">UPGRADE +${it.up + 1} · ${CRYSTAL}${fmt(uc.credits)} · ${uc.parts}⚙</button>`;
    if (!equipped) h += `<button class="btn sm danger" data-act="salvage" data-id="${it.id}" data-i="${it.id}" data-confirm="1">SALVAGE +${sv.parts}⚙ +${fmt(sv.credits)}</button>`;
    return h + `</div></div>`;
  }
  renderUpgrades() {
    const g = this.g, s = g.s; let h = `<p class="muted">Credit-funded ship systems. They apply to every hull you fly and stack with your skill tree. Costs rise with each level.</p>`;
    for (const u of UPGRADES) {
      const l = s.upgrades[u.key]; const max = l >= u.max; const c = upgradeCost(u, l);
      h += `<div class="card up"><div class="upi">${u.icon}</div><div class="upt"><h4>${u.name} <small>Lv ${l}</small></h4><p>${u.fmt(l)} → <b>${u.fmt(l + 1).replace(/^\+/, '+')}</b></p><div class="bar thin"><i style="width:${100 * l / u.max}%"></i></div></div>
        ${max ? '<span class="tag">MAX</span>' : `<button class="btn" data-act="up" data-k="${u.key}" data-cost="${c}">${CRYSTAL}${fmt(c)}</button>`}</div>`;
    }
    return h;
  }
  // ---------- holographic galaxy map ----------
  revealed(sec) { const g = this.g.s.galaxy; if (g.explored[sec.id]) return true; if (!this.g.skillFx().intel) return false; return neighbours(sec).some((n) => g.explored[n.id]); }
  renderMap() {
    const g = this.g; const exp = Object.keys(g.s.galaxy.explored).length; const lib = Object.keys(g.s.galaxy.liberated).length; const pir = GSECTORS.filter(isPirate).length;
    let h = `<div class="mapWrap"><canvas id="mapC"></canvas><div class="mapBtns"><button data-act="mapzoom" data-d="1.4" aria-label="Zoom in">＋</button><button data-act="mapzoom" data-d="0.71" aria-label="Zoom out">－</button><button data-act="mapcenter" aria-label="Center on ship">◎</button><button data-act="mapfit" aria-label="Show whole galaxy">⤢</button></div>
      <div class="mapStat">CHARTED ${exp}/${GSECTORS.length} · LIBERATED ${lib}/${pir}</div></div>`;
    h += `<div id="mapInfo">${this.mapInfo()}</div>`;
    h += `<div class="legend map">${Object.values(FACTIONS).map((f) => `<span style="--rc:${f.color}">${this.insignia(f.id, f.color)}${f.name}</span>`).join('')}<span style="--rc:#4fd2ff">${this.insignia('liberated', '#4fd2ff')}Liberated</span><span style="--rc:${NEUTRAL.color}">${this.insignia('neutral', NEUTRAL.color)}Unclaimed</span><span style="--rc:#5a6b80">▒ Uncharted</span></div>`;
    return h;
  }
  mapInfo() {
    const g = this.g, G = g.s.galaxy; const sec = this.mapSel ? SECTOR_BY_ID[this.mapSel] : g.gsec; const rev = this.revealed(sec); const own = owner(sec, G);
    const here = sec === g.gsec; const wp = G.wp;
    if (!rev) return `<div class="card sinfo fog"><small>SECTOR ${sec.id}${here ? ' · YOU ARE HERE' : ''}</small><h4>UNCHARTED SPACE</h4><p>No scan data. Fly into this sector to chart it and reveal who controls it (+${60 * Math.max(1, sec.ringI)} XP for the discovery).</p>
      <div class="btnrow"><button class="btn sm gold" data-act="wpsector">SET WAYPOINT</button>${wp ? '<button class="btn sm" data-act="wpclear">CLEAR WAYPOINT</button>' : ''}</div></div>`;
    const os = outposts(sec); const done = os.filter((o) => G.inst[o.id]).length; const lp = liberation(sec, G); const pir = isPirate(sec);
    const cs = caches(sec); const found = cs.filter((c) => G.caches[c.id]).length;
    const F = FACTIONS[sec.faction];
    let h = `<div class="card sinfo" style="--fc:${own.color}"><div class="row"><div class="sIns">${this.insignia(own.id, own.color)}</div><div style="flex:1"><small>SECTOR ${sec.id} · ${RINGS.find((r) => r.id === sec.ring).name.toUpperCase()} RING${here ? ' · YOU ARE HERE' : ''}</small><h4>${sec.name}</h4>
      <p style="color:${own.color}">${G.liberated[sec.id] ? `Liberated from the ${F.name}` : own.name}</p></div><div class="thr"><small>THREAT</small>${this.threatPips(sec.threat)}<b>${threatLabel(sec.threat)}</b></div></div>`;
    if (F && !G.liberated[sec.id]) h += `<p class="muted">${F.tactic}</p>`;
    if (pir) h += `<div class="libRow"><span>LIBERATION</span><div class="bar lib"><i style="width:${(lp * 100).toFixed(0)}%"></i></div><b>${Math.floor(lp * 100)}%</b></div>
      <p class="muted">Outposts destroyed ${done}/${os.length} · patrol kills ${Math.min(G.kills[sec.id] || 0, killsNeeded(sec))}/${killsNeeded(sec)} · caches found ${found}/${cs.length}</p>`;
    else h += `<p class="muted">${sec.faction === 'haven' ? 'Your home station. No pirate activity.' : 'Unclaimed space: light raider traffic, no faction outposts.'} Caches found ${found}/${cs.length}.</p>`;
    const nextO = os.filter((o) => !G.inst[o.id]).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
    h += `<div class="btnrow"><button class="btn sm gold" data-act="wpsector">WAYPOINT TO SECTOR</button>${pir && nextO && !G.liberated[sec.id] ? `<button class="btn sm gold" data-act="wpoutpost" data-x="${nextO.x}" data-z="${nextO.z}" data-n="${nextO.name}">WAYPOINT TO OUTPOST</button>` : ''}${wp ? '<button class="btn sm" data-act="wpclear">CLEAR WAYPOINT</button>' : ''}</div>`;
    return h + `</div>`;
  }
  attachMap() {
    const c = $('mapC'); if (!c) return; this.mapCanvas = c; const wrap = c.parentNode;
    const dpr = Math.min(2, window.devicePixelRatio || 1); const w = wrap.clientWidth, h = Math.round(Math.min(window.innerHeight * 0.5, w * 1.05));
    c.style.height = h + 'px'; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); this.mapDpr = dpr;
    if (!this.mapView) this.mapView = { cx: 0, cz: 0, zoom: 1 };
    const ptrs = new Map(); let start = null, pinch = null;
    const toWorld = (ex, ey) => { const r = c.getBoundingClientRect(); const v = this.mapView; const sc = this.mapScale(); return { x: v.cx + ((ex - r.left) * dpr - c.width / 2) / sc, z: v.cz + ((ey - r.top) * dpr - c.height / 2) / sc }; };
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) start = { x: e.clientX, y: e.clientY, t: performance.now(), cx: this.mapView.cx, cz: this.mapView.cz, moved: false };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.mapView.zoom }; if (start) start.moved = true; } });
    c.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; this.mapView.zoom = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d), 0.6, 8); this.drawMap(); return; }
      if (start) { const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.hypot(dx, dy) > 6) start.moved = true; if (start.moved) { const sc = this.mapScale() / dpr; this.mapView.cx = start.cx - dx / sc; this.mapView.cz = start.cz - dy / sc; this.drawMap(); } } });
    const up = (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { if (start && !start.moved && performance.now() - start.t < 600) { const wpt = toWorld(e.clientX, e.clientY); if (Math.hypot(wpt.x, wpt.z) < 1150) { const sec = gsectorAt(wpt.x, wpt.z); this.mapSel = sec.id; this.audio.click(); $('mapInfo').innerHTML = this.mapInfo(); this.drawMap(); } } start = null; pinch = null; } };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.mapView.zoom = clamp(this.mapView.zoom * (e.deltaY < 0 ? 1.15 : 0.87), 0.6, 8); this.drawMap(); }, { passive: false });
    this.drawMap();
  }
  mapScale() { const c = this.mapCanvas; return Math.min(c.width, c.height) / 2 / (MAP_R + 60) * this.mapView.zoom; }
  drawMap() {
    const c = this.mapCanvas; if (!c || !c.isConnected) return; const ctx = c.getContext('2d'); const g = this.g, G = g.s.galaxy; const dpr = this.mapDpr; const fx = g.skillFx();
    const W = c.width, H = c.height, v = this.mapView, sc = this.mapScale(); const X = (x) => W / 2 + (x - v.cx) * sc, Y = (z) => H / 2 + (z - v.cz) * sc; const t = performance.now() / 1000;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), (MAP_R + 100) * sc); bg.addColorStop(0, 'rgba(8,40,70,0.95)'); bg.addColorStop(1, 'rgba(2,8,18,0.98)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // hatch pattern for fog
    if (!this.fogPat) { const pc = document.createElement('canvas'); pc.width = pc.height = 12; const p2 = pc.getContext('2d'); p2.strokeStyle = 'rgba(120,150,190,0.22)'; p2.lineWidth = 2; p2.beginPath(); p2.moveTo(0, 12); p2.lineTo(12, 0); p2.stroke(); this.fogPat = ctx.createPattern(pc, 'repeat'); }
    const wedge = (sec) => { ctx.beginPath(); if (sec.ring === 'H') { ctx.arc(X(0), Y(0), sec.r1 === 1e9 ? MAP_R * sc : 190 * sc, 0, Math.PI * 2); return; } const r1 = Math.min(sec.r1, MAP_R); ctx.arc(X(0), Y(0), r1 * sc, sec.a0, sec.a1); ctx.arc(X(0), Y(0), sec.r0 * sc, sec.a1, sec.a0, true); ctx.closePath(); };
    for (const sec of GSECTORS) {
      const rev = this.revealed(sec); const own = owner(sec, G); const sel = this.mapSel === sec.id;
      wedge(sec);
      if (rev) { ctx.fillStyle = own.color + (G.liberated[sec.id] ? '44' : sec.threat >= 5 ? '55' : '33'); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(10,18,30,0.9)'; ctx.fill(); ctx.fillStyle = this.fogPat; ctx.fill(); }
      ctx.lineWidth = (sel ? 3 : 1.2) * dpr; ctx.strokeStyle = sel ? '#ffffff' : rev ? own.color + 'aa' : 'rgba(110,140,180,0.35)'; ctx.shadowColor = rev ? own.color : 'transparent'; ctx.shadowBlur = sel ? 14 * dpr : 6 * dpr; ctx.stroke(); ctx.shadowBlur = 0;
      // label
      const rm = sec.ring === 'H' ? 0 : sec.rm, lx = X(Math.cos(sec.am) * rm), ly = Y(Math.sin(sec.am) * rm); const fs = Math.max(8, Math.min(14, 12 * Math.sqrt(v.zoom))) * dpr;
      ctx.textAlign = 'center'; ctx.font = `700 ${fs}px Rajdhani, sans-serif`; ctx.fillStyle = rev ? '#e8fbff' : 'rgba(150,170,200,0.7)';
      ctx.fillText(rev ? (v.zoom > 1.3 ? sec.name.toUpperCase() : sec.id) : '?', lx, ly);
      if (rev && sec.threat && v.zoom > 0.9) { const n = sec.threat; for (let i = 0; i < n; i++) { ctx.fillStyle = n >= 4 ? '#ff5a6a' : n >= 3 ? '#ffb070' : '#9fffd0'; ctx.fillRect(lx - n * 3 * dpr + i * 6 * dpr, ly + 4 * dpr, 4 * dpr, 3 * dpr); } }
      if (rev && G.liberated[sec.id] && v.zoom > 0.9) { ctx.fillStyle = '#4fd2ff'; ctx.font = `700 ${fs * 0.75}px Rajdhani, sans-serif`; ctx.fillText('LIBERATED', lx, ly + 16 * dpr); }
      else if (rev && isPirate(sec) && v.zoom > 1.3) { const lp = liberation(sec, G); if (lp > 0) { ctx.fillStyle = '#4fd2ff'; ctx.font = `700 ${fs * 0.75}px Rajdhani, sans-serif`; ctx.fillText(`${Math.floor(lp * 100)}%`, lx, ly + 16 * dpr); } }
      // outposts & caches
      if (isPirate(sec) && (G.explored[sec.id] || fx.detect)) for (const o of outposts(sec)) { const ox = X(o.x), oy = Y(o.z); const s2 = 4 * dpr * Math.min(2, Math.sqrt(v.zoom));
        if (G.inst[o.id] || G.liberated[sec.id]) { ctx.strokeStyle = 'rgba(160,170,180,0.7)'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(ox - s2, oy - s2); ctx.lineTo(ox + s2, oy + s2); ctx.moveTo(ox + s2, oy - s2); ctx.lineTo(ox - s2, oy + s2); ctx.stroke(); }
        else { ctx.fillStyle = FACTIONS[sec.faction].color; ctx.fillRect(ox - s2, oy - s2, s2 * 2, s2 * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * dpr; ctx.strokeRect(ox - s2 - 2 * dpr, oy - s2 - 2 * dpr, s2 * 2 + 4 * dpr, s2 * 2 + 4 * dpr); } }
      if (fx.anomaly) for (const cc of caches(sec)) if (!G.caches[cc.id]) { ctx.fillStyle = '#5dff98'; ctx.beginPath(); ctx.arc(X(cc.x), Y(cc.z), 2.5 * dpr, 0, Math.PI * 2); ctx.fill(); }
    }
    // ring guides
    ctx.strokeStyle = 'rgba(95,227,255,0.25)'; ctx.lineWidth = 1 * dpr; ctx.setLineDash([4 * dpr, 6 * dpr]); for (const r of [190, 400, 650, MAP_R]) { ctx.beginPath(); ctx.arc(X(0), Y(0), r * sc, 0, Math.PI * 2); ctx.stroke(); } ctx.setLineDash([]);
    // warlord lair
    if (G.explored[gsectorAt(BOSS_LAIR.x, BOSS_LAIR.z).id] || g.s.maxSector >= 3) { ctx.font = `${14 * dpr}px sans-serif`; ctx.fillStyle = '#ff3df2'; ctx.fillText('☠', X(BOSS_LAIR.x), Y(BOSS_LAIR.z) + 5 * dpr); }
    // station
    ctx.fillStyle = '#4dffb8'; ctx.save(); ctx.translate(X(0), Y(0)); ctx.rotate(Math.PI / 4); ctx.fillRect(-4 * dpr, -4 * dpr, 8 * dpr, 8 * dpr); ctx.restore();
    // waypoint + route
    const p = g.player; const wp = G.wp;
    if (wp) { ctx.strokeStyle = 'rgba(255,209,102,0.8)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.lineDashOffset = -t * 20 * dpr; ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.z)); ctx.lineTo(X(wp.x), Y(wp.z)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); const wx = X(wp.x), wy = Y(wp.z), r = 7 * dpr; ctx.moveTo(wx, wy - r); ctx.lineTo(wx + r * 0.7, wy); ctx.lineTo(wx, wy + r); ctx.lineTo(wx - r * 0.7, wy); ctx.fill(); }
    // player
    const pr = (1 + 0.25 * Math.sin(t * 4)) * 10 * dpr; ctx.strokeStyle = 'rgba(95,227,255,0.6)'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(X(p.x), Y(p.z), pr, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(X(p.x), Y(p.z)); ctx.rotate(Math.PI - p.yaw); ctx.fillStyle = '#5fe3ff'; ctx.shadowColor = '#5fe3ff'; ctx.shadowBlur = 10 * dpr; ctx.beginPath(); ctx.moveTo(0, -8 * dpr); ctx.lineTo(6 * dpr, 6 * dpr); ctx.lineTo(0, 3 * dpr); ctx.lineTo(-6 * dpr, 6 * dpr); ctx.closePath(); ctx.fill(); ctx.restore();
    // scanlines
    ctx.fillStyle = 'rgba(95,227,255,0.035)'; for (let y = (t * 30 * dpr) % (4 * dpr); y < H; y += 4 * dpr) ctx.fillRect(0, y, W, 1 * dpr);
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
    h += `<h5>CAREER</h5><div class="card stats"><span>Ore mined <b>${fmt(st.mined)}</b></span><span>Asteroids <b>${fmt(st.rocks)}</b></span><span>Pirates <b>${fmt(st.kills)}</b></span><span>Units sold <b>${fmt(st.sold)}</b></span><span>Warlords <b>${st.bosses}</b></span><span>Furthest <b>Sector ${s.maxSector}</b></span><span>Outposts <b>${fmt(st.outposts)}</b></span><span>Liberated <b>${fmt(st.liberated)}</b></span><span>Caches <b>${fmt(st.caches)}</b></span><span>Items found <b>${fmt(st.items)}</b></span><span>Charted <b>${Object.keys(s.galaxy.explored).length}/${GSECTORS.length}</b></span></div>`;
    return h;
  }
  renderSettings() {
    const st = this.g.s.settings; const tg = (k, label) => `<div class="card row"><span>${label}</span><button class="toggle ${st[k] ? 'on' : ''}" data-act="toggle" data-k="${k}">${st[k] ? 'ON' : 'OFF'}</button></div>`;
    const sl = (k, label) => { const v = Math.round((st[k] ?? 0) * 100); return `<div class="card row vol"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${v}" data-vol="${k}" aria-label="${label} volume"><b class="volv" id="vol_${k}">${v}%</b></div>`; };
    return `<div class="card"><h4>AUDIO</h4></div>` + sl('masterVol', 'Master') + sl('musicVol', 'Music') + sl('sfxVol', 'Sound effects') + tg('mute', 'Mute all') + this.renderMusicCard() + tg('shake', 'Camera shake') + tg('fps', 'Show FPS') +
      `<div class="card row"><span>Graphics quality</span><div class="seg">${['auto', 'low', 'medium', 'high'].map((q) => `<button class="${st.quality === q ? 'on' : ''}" data-act="quality" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div></div>
      <div class="card"><h4>CONTROLS</h4><p>Touch: drag anywhere to steer (virtual joystick). Weapons fire automatically. Tap the round ability buttons on the right; tap the radar for the galaxy map.<br>Desktop: WASD / arrow keys or drag with the mouse. 1–6 = abilities, Space = Quantum Dash, G = galaxy map, K = skills, I = gear, U = upgrades, M = missions, F = factory, H = station/autopilot, Esc = close.</p></div>
      <div class="card row"><span>Progress autosaves every few seconds.</span><span class="btnrow"><button class="btn sm gold" data-act="save">Save game</button><button class="btn sm" data-act="saves">Save / Load…</button></span></div>
      <div class="card row"><span>Erase all progress</span><button class="btn sm danger" data-act="reset" data-confirm="1">Reset</button></div>
      <p class="muted">Stellar Frontier v4 · Built with three.js · Skill tree, loot, factions & liberation · Sound effects synthesised in real time</p>`;
  }
  renderMusicCard() {
    const st = this.g.s.settings, a = this.audio; const ts = a.trackState(); const n = (a.tracks || []).length; const sound = st.musicMode !== 'generated';
    if (!n) return `<div class="card row"><span>Music</span><span class="muted">Dynamic score: the mood follows where you are and what you are fighting</span></div>`;
    const seg = `<div class="seg">${[['soundtrack', 'SOUNDTRACK'], ['generated', 'GENERATED']].map(([k, l]) => `<button class="${(sound ? 'soundtrack' : 'generated') === k ? 'on' : ''}" data-act="musicmode" data-m="${k}">${l}</button>`).join('')}</div>`;
    let np = '';
    if (sound && n && !(a.st && a.st.dead)) { const title = ts ? ts.title : (a.tracks[st.trackIdx] || a.tracks[0]).title; const idx = ts ? ts.idx : st.trackIdx;
      np = `<div class="card row np"><span>♪ ${idx + 1}/${n} · ${title}</span><span class="btnrow"><button class="btn sm" data-act="track" data-d="-1" aria-label="Previous track">◀ PREV</button><button class="btn sm" data-act="track" data-d="1" aria-label="Next track">NEXT ▶</button></span></div>`; }
    else if (sound) np = `<div class="card row"><span class="muted">Soundtrack unavailable, playing generated music</span></div>`;
    return `<div class="card row"><span>Music</span>${seg}</div>` + np;
  }
  slotCard(i) {
    const g = this.g; const auto = i === 'auto'; const m = g.slotMeta(i); const name = auto ? 'AUTOSAVE' : `SLOT ${i}`;
    const when = (t) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const pt = (sec) => { sec = Math.floor(sec || 0); const h = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60; return h ? `${h}h ${mm}m` : `${mm}m ${sec % 60}s`; };
    let h = `<div class="card slot ${m ? '' : 'empty'}" data-slot="${i}"><div class="sHead"><span class="sName">${name}</span><span class="sDate">${m ? when(m.savedAt) : 'Empty slot'}</span></div>`;
    if (m) h += `<div class="sGrid"><span><small>SHIP</small><b>T${m.tier} ${m.tierName}</b></span><span><small>LEVEL</small><b>${m.level}</b></span><span><small>CREDITS</small><b>${fmt(m.credits)}</b></span>
      <span><small>STATION</small><b>Lv ${m.station}</b></span><span><small>LIBERATED</small><b>${m.liberated}</b></span><span><small>PLAYTIME</small><b>${pt(m.playTime)}</b></span></div>`;
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
      <textarea id="importBox" class="code" placeholder="Paste SF4.… code here (older SF2 codes work too)"></textarea>
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
    if (b.dataset.confirm === '1' && !b.classList.contains('dis')) {
      const key = a + ':' + (b.dataset.i || '');
      if (this.confirmKey !== key) {
        this.confirmKey = key; document.querySelectorAll('#modalBody .confirming').forEach((x) => { x.classList.remove('confirming'); x.textContent = x.dataset.label; });
        b.dataset.label = b.textContent; b.textContent = 'TAP AGAIN TO CONFIRM'; b.classList.add('confirming');
        clearTimeout(this.confirmT); this.confirmT = setTimeout(() => { if (this.confirmKey === key) { this.confirmKey = null; if (b.isConnected) { b.classList.remove('confirming'); b.textContent = b.dataset.label; } } }, 3500);
        return;
      }
      this.confirmKey = null;
    }
    if (b.classList.contains('dis') && !['toggle', 'quality', 'musicmode', 'track', 'reset', 'save', 'autopilot', 'saves', 'pvtier', 'equip', 'buyskill'].includes(a)) { this.toast(b.dataset.block === '1' && !g.docked && ['respec', 'buyitem', 'station', 'tier'].includes(a) ? 'Dock at the station first' : a === 'itemup' ? 'Not enough credits or components' : 'Not enough credits or materials', 'warn'); this.audio.denied(); return; }
    switch (a) {
      case 'sell': { const r = g.sellCargo(); if (r) this.toast(`Sold: +${r.credits} cr`, 'good'); break; }
      case 'sellvault': g.sellVault(b.dataset.k, 10); break;
      case 'claim': { const n = g.claimFactory(); if (n) this.toast(`Claimed ${fmt(n)} credits from the factory`, 'good'); break; }
      case 'facup': g.upgradeFactory(b.dataset.w); break;
      case 'station': g.upgradeStation(); break;
      case 'tier': g.buyTier(+b.dataset.t); break;
      case 'buyitem': { if (!g.docked) { this.toast('Dock at the station first', 'warn'); return; } const it = g.buyItem(b.dataset.t); if (it) this.selItem = it.id; break; }
      case 'gotogear': this.open('upgrades', null, 'gear'); return;
      case 'branch': this.branch = b.dataset.b; this.selSkill = null; break;
      case 'skill': this.selSkill = b.dataset.k; break;
      case 'buyskill': if (b.dataset.block === '1') { this.audio.denied(); return; } g.buySkill(b.dataset.k); break;
      case 'respec': g.respec(); break;
      case 'item': this.selItem = this.selItem === b.dataset.id ? null : b.dataset.id; break;
      case 'ifilter': this.invFilter = b.dataset.c; break;
      case 'equip': g.equip(b.dataset.id, +b.dataset.i); break;
      case 'unequip': g.unequip(+b.dataset.i); break;
      case 'itemup': g.upgradeItem(b.dataset.id); break;
      case 'salvage': if (g.salvageItem(b.dataset.id)) this.selItem = null; break;
      case 'wpsector': { const sec = this.mapSel ? SECTOR_BY_ID[this.mapSel] : g.gsec; const r = sec.ring === 'H' ? 0 : sec.rm; g.setWaypoint(Math.cos(sec.am) * r, Math.sin(sec.am) * r, sec.name); this.toast(`Waypoint set: ${sec.name}`, 'good'); break; }
      case 'wpoutpost': g.setWaypoint(+b.dataset.x, +b.dataset.z, b.dataset.n); this.toast(`Waypoint set: ${b.dataset.n}`, 'good'); break;
      case 'wpclear': g.clearWaypoint(); this.toast('Waypoint cleared'); break;
      case 'mapzoom': this.mapView.zoom = clamp(this.mapView.zoom * +b.dataset.d, 0.6, 8); this.drawMap(); return;
      case 'mapcenter': this.mapView.cx = g.player.x; this.mapView.cz = g.player.z; this.mapView.zoom = Math.max(this.mapView.zoom, 2.5); this.drawMap(); return;
      case 'mapfit': this.mapView = { cx: 0, cz: 0, zoom: 1 }; this.drawMap(); return;
      case 'up': g.buyUpgrade(b.dataset.k); break;
      case 'claimstory': g.claimStory(); break;
      case 'claimc': g.claimContract(+b.dataset.i); break;
      case 'autopilot': this.close(); g.autopilot = true; this.audio.boost(); this.toast('Autopilot engaged: returning to station'); return;
      case 'toggle': { const k = b.dataset.k; g.s.settings[k] = !g.s.settings[k]; this.opts.applySettings(); g.save(); break; }
      case 'musicmode': g.s.settings.musicMode = b.dataset.m; this.audio.setMusicMode(b.dataset.m); g.save(); break;
      case 'track': this.audio.nextTrack(+b.dataset.d); break;
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
    if (a === 'skill' || a === 'item') { const el = document.querySelector(a === 'skill' ? '#modalBody .card.inspect' : '#modalBody .card.idetail'); if (el && el.scrollIntoView) { const r = el.getBoundingClientRect(); if (r.bottom > innerHeight - 10 || r.top < 0) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
  }
}

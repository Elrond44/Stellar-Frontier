// Ship progression: XP curve, skill points, the 5-branch skill tree and active abilities
export const BRANCHES = [
  { id: 'weapons', name: 'Weapons & Combat', short: 'WEAPONS', color: '#ff7a45', icon: '✷' },
  { id: 'defense', name: 'Shields & Defense', short: 'DEFENSE', color: '#4fb8ff', icon: '⛨' },
  { id: 'engines', name: 'Engines & Mobility', short: 'ENGINES', color: '#5dff98', icon: '⇧' },
  { id: 'tech', name: 'Technology & Exploration', short: 'TECH', color: '#c27bff', icon: '◎' },
  { id: 'tactical', name: 'Tactical Abilities', short: 'TACTICAL', color: '#ffd166', icon: '✦' },
];
const pct = (v) => `${Math.round(v * 100)}%`;
// fx: per-rank values summed into stats. col: 0..2 position inside the branch row. cost: SP per rank.
export const SKILLS = [
  // ---- A. Weapons & Combat ----
  { id: 'w_laser', b: 'weapons', tier: 1, col: 0, name: 'Focused Emitters', max: 3, fx: { beamDmg: 0.1 }, desc: 'Enhanced laser damage: lasers and particle beams hit harder.', fmt: (r) => `+${pct(0.1 * r)} beam damage` },
  { id: 'w_velocity', b: 'weapons', tier: 1, col: 2, name: 'Mass Drivers', max: 3, fx: { projSpeed: 0.1 }, desc: 'Increased projectile velocity for every bolt and missile.', fmt: (r) => `+${pct(0.1 * r)} projectile speed` },
  { id: 'w_crit', b: 'weapons', tier: 2, col: 0, name: 'Targeting Matrix', max: 3, req: ['w_laser'], fx: { crit: 0.03 }, desc: 'Improved critical-hit probability.', fmt: (r) => `+${(3 * r)}% critical chance` },
  { id: 'w_eff', b: 'weapons', tier: 2, col: 1, name: 'Energy Efficiency', max: 3, req: ['w_laser'], fx: { weaponEnergy: -0.12 }, desc: 'Energy weapon efficiency: every weapon draws less energy.', fmt: (r) => `-${pct(0.12 * r)} weapon energy use` },
  { id: 'w_cool', b: 'weapons', tier: 2, col: 2, name: 'Rapid Cyclers', max: 3, req: ['w_velocity'], fx: { fireRate: 0.05, heat: -0.1 }, desc: 'Faster weapon cooldowns and cooler barrels.', fmt: (r) => `+${pct(0.05 * r)} fire rate, -${pct(0.1 * r)} heat` },
  { id: 'w_ap', b: 'weapons', tier: 3, col: 2, name: 'Armor-Piercing Rounds', max: 2, lvl: 8, req: ['w_cool'], fx: { pen: 0.15 }, desc: 'Armor-piercing ammunition ignores part of enemy armor.', fmt: (r) => `+${pct(0.15 * r)} armor penetration` },
  { id: 'w_missile', b: 'weapons', tier: 3, col: 1, name: 'Seeker Guidance', max: 2, lvl: 6, req: ['w_velocity'], fx: { missileDmg: 0.15, missileTurn: 0.25 }, desc: 'Advanced missile targeting: tighter turns, bigger warheads.', fmt: (r) => `+${pct(0.15 * r)} missile damage, +${pct(0.25 * r)} tracking` },
  { id: 'w_hardpoint', b: 'weapons', tier: 3, col: 0, name: 'Auxiliary Hardpoint', max: 1, lvl: 12, req: ['w_crit'], fx: { slots: 1 }, desc: 'Additional weapon hardpoint on any hull.', fmt: () => '+1 weapon slot' },
  { id: 'w_multi', b: 'weapons', tier: 4, col: 1, name: 'Multi-Target Tracking', max: 1, lvl: 16, req: ['w_missile', 'w_ap'], fx: { multi: 1 }, desc: 'Each turret picks a different target, and missile volleys fire one extra missile.', fmt: () => 'Turrets split targets, +1 missile' },
  { id: 'w_overcharge', b: 'weapons', tier: 4, col: 0, name: 'Overcharged Systems', max: 2, lvl: 20, req: ['w_hardpoint', 'w_eff'], fx: { overcharge: 0.15 }, desc: 'Overcharged weapon systems: bonus damage while energy is above 70%.', fmt: (r) => `+${pct(0.15 * r)} damage above 70% energy` },
  // ---- B. Shields & Defense ----
  { id: 'd_cap', b: 'defense', tier: 1, col: 1, name: 'Shield Capacitors', max: 3, fx: { shieldCap: 0.2 }, desc: 'Increased maximum shield capacity.', fmt: (r) => `+${pct(0.2 * r)} max shield` },
  { id: 'd_regen', b: 'defense', tier: 2, col: 0, name: 'Rapid Recharge', max: 3, req: ['d_cap'], fx: { shieldRegen: 0.25, shieldDelay: -0.5 }, desc: 'Faster shield regeneration that starts sooner after a hit.', fmt: (r) => `+${pct(0.25 * r)} regen, -${(0.5 * r).toFixed(1)}s delay` },
  { id: 'd_energy', b: 'defense', tier: 2, col: 1, name: 'Dispersal Field', max: 3, req: ['d_cap'], fx: { resEnergy: 0.08 }, desc: 'Reduced incoming energy damage (pirate lasers and plasma).', fmt: (r) => `-${pct(0.08 * r)} energy damage taken` },
  { id: 'd_armor', b: 'defense', tier: 2, col: 2, name: 'Reactive Armor', max: 3, req: ['d_cap'], fx: { resKinetic: 0.08 }, desc: 'Improved armor resistance vs cannons, missiles and collisions.', fmt: (r) => `-${pct(0.08 * r)} kinetic & explosive damage` },
  { id: 'd_collision', b: 'defense', tier: 3, col: 2, name: 'Impact Dampers', max: 1, lvl: 6, req: ['d_armor'], fx: { collision: 1 }, desc: 'Reduced collision damage: ramming asteroids at speed no longer hurts.', fmt: () => 'No asteroid collision damage' },
  { id: 'd_emergency', b: 'defense', tier: 3, col: 0, name: 'Emergency Restore', max: 1, lvl: 8, req: ['d_regen'], fx: { emergencyShield: 1 }, desc: 'Emergency shield restoration when the hull drops below 30% (60 s cooldown).', fmt: () => 'Auto full shield at 30% hull' },
  { id: 'd_barrier', b: 'defense', tier: 3, col: 1, name: 'Barrier Projector', max: 2, lvl: 10, req: ['d_energy'], fx: { barrier: 2 }, desc: 'Temporary defensive barriers: Shield Overload lasts longer.', fmt: (r) => `+${2 * r}s Shield Overload` },
  { id: 'd_repair', b: 'defense', tier: 4, col: 1, name: 'Auto-Repair Protocols', max: 2, lvl: 14, req: ['d_emergency', 'd_armor'], fx: { autoRepair: 0.01 }, desc: 'Automatic hull-repair protocols run even in combat.', fmt: (r) => `+${r}% hull per second` },
  // ---- C. Engines & Mobility ----
  { id: 'e_speed', b: 'engines', tier: 1, col: 0, name: 'Afterburner Tuning', max: 3, fx: { speed: 0.06 }, desc: 'Increased maximum flight speed.', fmt: (r) => `+${pct(0.06 * r)} top speed` },
  { id: 'e_accel', b: 'engines', tier: 1, col: 2, name: 'Thrust Vectoring', max: 3, fx: { accel: 0.12 }, desc: 'Improved acceleration.', fmt: (r) => `+${pct(0.12 * r)} acceleration` },
  { id: 'e_dashcost', b: 'engines', tier: 2, col: 0, name: 'Efficient Injectors', max: 2, req: ['e_speed'], fx: { dashCost: -0.2, dashCd: -0.12 }, desc: 'Reduced boost energy consumption for Quantum Dash.', fmt: (r) => `Dash: -${pct(0.2 * r)} energy, -${pct(0.12 * r)} cooldown` },
  { id: 'e_turn', b: 'engines', tier: 2, col: 2, name: 'Gyro Stabilizers', max: 2, req: ['e_accel'], fx: { turn: 0.2 }, desc: 'Faster rotational maneuvering.', fmt: (r) => `+${pct(0.2 * r)} turn rate` },
  { id: 'e_dashlen', b: 'engines', tier: 3, col: 0, name: 'Extended Burn', max: 2, lvl: 6, req: ['e_dashcost'], fx: { dashLen: 0.25 }, desc: 'Extended boost duration: Quantum Dash travels further.', fmt: (r) => `+${pct(0.25 * r)} dash distance` },
  { id: 'e_evade', b: 'engines', tier: 3, col: 2, name: 'Evasive Maneuvers', max: 3, lvl: 8, req: ['e_turn'], fx: { evade: 0.05 }, desc: 'Improved evasive maneuvers: chance to dodge shots while moving.', fmt: (r) => `${5 * r}% dodge while thrusting` },
  { id: 'e_hyper', b: 'engines', tier: 3, col: 1, name: 'Hyperspace Efficiency', max: 2, lvl: 10, req: ['e_dashlen'], fx: { hyper: 0.3 }, desc: 'Advanced hyperspace efficiency: much faster autopilot cruising.', fmt: (r) => `+${pct(0.3 * r)} autopilot speed` },
  { id: 'e_emergency', b: 'engines', tier: 4, col: 2, name: 'Emergency Thrust', max: 1, lvl: 14, req: ['e_evade'], fx: { emergencyThrust: 1 }, desc: 'Emergency evasive thrust: below 25% hull the ship dashes clear and gets a speed burst (45 s cooldown).', fmt: () => 'Auto escape burn at 25% hull' },
  // ---- D. Technology & Exploration ----
  { id: 't_radar', b: 'tech', tier: 1, col: 0, name: 'Long-Range Scanners', max: 3, fx: { radar: 0.2 }, desc: 'Increased radar detection range.', fmt: (r) => `+${pct(0.2 * r)} radar range` },
  { id: 't_resource', b: 'tech', tier: 1, col: 2, name: 'Resource Scanner', max: 3, fx: { ore: 0.1 }, desc: 'Improved resource scanning: more ore from every asteroid.', fmt: (r) => `+${pct(0.1 * r)} ore yield` },
  { id: 't_ident', b: 'tech', tier: 2, col: 0, name: 'Threat Identification', max: 2, req: ['t_radar'], fx: { eliteDmg: 0.1 }, desc: 'Advanced enemy identification: elites and installations are marked and take extra damage.', fmt: (r) => `+${pct(0.1 * r)} damage vs elites & installations` },
  { id: 't_rare', b: 'tech', tier: 2, col: 2, name: 'Rare Salvage', max: 3, req: ['t_resource'], fx: { luck: 0.15 }, desc: 'Rare-item discovery bonus: better loot rarity and more drops.', fmt: (r) => `+${pct(0.15 * r)} loot luck` },
  { id: 't_target', b: 'tech', tier: 3, col: 0, name: 'Targeting Computer', max: 2, lvl: 6, req: ['t_ident'], fx: { range: 0.08 }, desc: 'Enhanced targeting computers extend weapon range.', fmt: (r) => `+${pct(0.08 * r)} weapon range` },
  { id: 't_hidden', b: 'tech', tier: 3, col: 1, name: 'Installation Detection', max: 1, lvl: 6, req: ['t_ident'], fx: { detect: 1 }, desc: 'Hidden installation detection: pirate outposts show on the radar and galaxy map before you find them.', fmt: () => 'Reveal outposts' },
  { id: 't_anomaly', b: 'tech', tier: 3, col: 2, name: 'Anomaly Detection', max: 1, lvl: 8, req: ['t_rare'], fx: { anomaly: 1 }, desc: 'Advanced anomaly detection: hidden cargo caches appear on the radar and map.', fmt: () => 'Reveal hidden caches' },
  { id: 't_intel', b: 'tech', tier: 4, col: 1, name: 'Sector Intelligence', max: 1, lvl: 10, req: ['t_hidden'], fx: { intel: 1 }, desc: 'Sector intelligence gathering: the map shows owner and threat of sectors next to any you have explored.', fmt: () => 'Reveal neighbouring sectors' },
  // ---- E. Tactical abilities ----
  { id: 'a_dash', b: 'tactical', tier: 1, col: 0, name: 'Quantum Dash', max: 1, lvl: 2, ability: 'dash', desc: 'Active: rapidly blink forward in your flight direction, briefly untouchable.', fmt: () => 'Unlocks Quantum Dash' },
  { id: 'a_emp', b: 'tactical', tier: 1, col: 2, name: 'EMP Pulse', max: 1, lvl: 3, ability: 'emp', desc: 'Active: a shockwave that knocks out enemy weapons, engines and shields nearby.', fmt: () => 'Unlocks EMP Pulse' },
  { id: 'a_power', b: 'tactical', tier: 2, col: 1, name: 'Capacitor Bank', max: 3, req: ['a_dash'], fx: { energyMax: 0.2, energyRegen: 0.15 }, desc: 'Bigger, faster-charging energy capacitors for weapons and abilities.', fmt: (r) => `+${pct(0.2 * r)} max energy, +${pct(0.15 * r)} regen` },
  { id: 'a_overload', b: 'tactical', tier: 2, col: 0, name: 'Shield Overload', max: 1, lvl: 5, req: ['a_dash'], ability: 'overload', desc: 'Active: instantly refill shields and block most damage for a few seconds.', fmt: () => 'Unlocks Shield Overload' },
  { id: 'a_barrage', b: 'tactical', tier: 2, col: 2, name: 'Missile Barrage', max: 1, lvl: 8, req: ['a_emp'], ability: 'barrage', desc: 'Active: launch a swarm of guided missiles at every nearby target.', fmt: () => 'Unlocks Missile Barrage' },
  { id: 'a_cdr', b: 'tactical', tier: 3, col: 1, name: 'Tactical Cooldowns', max: 3, lvl: 9, req: ['a_power'], fx: { cdr: 0.08 }, desc: 'All active abilities recharge faster.', fmt: (r) => `-${pct(0.08 * r)} ability cooldowns` },
  { id: 'a_surge', b: 'tactical', tier: 3, col: 0, name: 'Energy Surge', max: 1, lvl: 10, req: ['a_overload'], ability: 'surge', desc: 'Active: overdrive every weapon for extra damage and fire rate.', fmt: () => 'Unlocks Energy Surge' },
  { id: 'a_drones', b: 'tactical', tier: 3, col: 2, name: 'Drone Deployment', max: 1, lvl: 14, req: ['a_barrage'], ability: 'drones', desc: 'Active: release autonomous combat drones that hunt pirates.', fmt: () => 'Unlocks Drone Deployment' },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillCost = (sk) => (sk.tier >= 3 ? 2 : 1);

export const ABILITIES = {
  dash:     { name: 'Quantum Dash',    short: 'DASH',  cd: 8,  energy: 25, color: '#5dff98', desc: 'Blink ~26 m forward; untouchable while dashing.' },
  emp:      { name: 'EMP Pulse',       short: 'EMP',   cd: 24, energy: 45, color: '#4fd2ff', desc: 'Disables enemy weapons and engines within 24 m for 3.5 s and strips their shields.' },
  overload: { name: 'Shield Overload', short: 'SHIELD', cd: 32, energy: 50, color: '#4fb8ff', desc: 'Refills shields and blocks 75% of damage for 5 s.' },
  barrage:  { name: 'Missile Barrage', short: 'SWARM', cd: 28, energy: 55, color: '#ff8a3d', desc: 'Fires 12 homing missiles at nearby targets.' },
  surge:    { name: 'Energy Surge',    short: 'SURGE', cd: 40, energy: 40, color: '#ffd166', desc: '+50% weapon damage and +30% fire rate for 6 s.' },
  drones:   { name: 'Drone Deployment', short: 'DRONES', cd: 55, energy: 60, color: '#c27bff', desc: 'Deploys 3 combat drones for 20 s.' },
};
export const ABILITY_ORDER = ['dash', 'emp', 'overload', 'barrage', 'surge', 'drones'];

// XP & skill points. One level system: the ship level (formerly "pilot level").
export const xpForLevel = (l) => Math.round(80 * Math.pow(l, 1.55));
export const spEarned = (level) => (level - 1) + Math.floor(level / 5); // 1 SP per level, +1 bonus every 5th level
export function spSpent(skills) { let n = 0; for (const id in skills) { const sk = SKILL_BY_ID[id]; if (sk) n += skillCost(sk) * skills[id]; } return n; }
export const respecCost = (level) => 250 + level * level * 40;

// Aggregate passive effects
export function skillFx(skills) {
  const fx = {};
  for (const id in skills) { const sk = SKILL_BY_ID[id]; const r = skills[id]; if (!sk || !r || !sk.fx) continue; for (const k in sk.fx) fx[k] = (fx[k] || 0) + sk.fx[k] * r; }
  return fx;
}
export function skillState(skills, id, level, sp) {
  const sk = SKILL_BY_ID[id]; const r = skills[id] || 0;
  if (r >= sk.max) return { state: 'maxed', r };
  const reqMissing = (sk.req || []).filter((q) => !(skills[q] > 0));
  const lvlOk = level >= (sk.lvl || 1); const cost = skillCost(sk);
  if (reqMissing.length || !lvlOk) return { state: r > 0 ? 'unlocked' : 'locked', r, reqMissing, lvlOk, cost, canBuy: false };
  return { state: r > 0 ? 'unlocked' : 'available', r, reqMissing, lvlOk, cost, canBuy: sp >= cost };
}

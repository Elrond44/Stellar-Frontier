// Faction flagships (multi-phase bosses) and sector commanders.
// Attack primitives are executed by the campaign runtime (telegraphed: every damaging attack is preceded by a
// visible warning zone): bombard, salvo, spread, nova, charge, lance, sweep, cloak, drain, gravity, mines.
import { FACTIONS } from './galaxy.js?v=5';

export const ATTACKS = {
  bombard: { name: 'Heavy Bombardment', warn: 'BOMBARDMENT' },
  salvo: { name: 'Missile Salvo', warn: 'MISSILE SALVO' },
  spread: { name: 'Scatter Volley' },
  nova: { name: 'Overload Nova', warn: 'OVERLOAD: GET CLEAR' },
  charge: { name: 'Ramming Charge', warn: 'RAMMING SPEED' },
  lance: { name: 'Lance Strike', warn: 'LANCE LOCK' },
  sweep: { name: 'Prism Sweep', warn: 'PRISM SWEEP' },
  cloak: { name: 'Phase Cloak', warn: 'TARGET VANISHED' },
  drain: { name: 'EW Drain Field', warn: 'ENERGY DRAIN FIELD' },
  gravity: { name: 'Gravity Well', warn: 'GRAVITY WELL' },
  mines: { name: 'Mine Layer', warn: 'MINEFIELD' },
};

// parts: k = cannon | missile | engine | prism | dish | bay | shroud | core ; weak = attack weakened (halved) / disabled when destroyed
export const BOSSES = {
  crimson: {
    id: 'varkos', fk: 'crimson', name: 'Admiral Varkos', title: 'The Crimson Dread', ship: 'Dread Sovereign', hp: 15000, armor: 0.3, radius: 10, speed: 5.5, dmg: 18,
    desc: 'A massive armoured battleship with heavy plasma cannons, missile batteries and reinforced shield generators.',
    parts: [{ k: 'cannon', name: 'Port Plasma Battery', x: -4.6, z: 3.5, weak: 'bombard' }, { k: 'cannon', name: 'Starboard Plasma Battery', x: 4.6, z: 3.5, weak: 'bombard' }, { k: 'missile', name: 'Missile Battery', x: 0, z: -2.5, weak: 'salvo' }, { k: 'engine', name: 'Engine Block', x: 0, z: -8.5, weak: 'speed' }],
    phases: [
      { at: 1, name: 'Heavy Cannon Bombardment', attacks: ['bombard', 'spread', 'bombard'], every: 4.2 },
      { at: 0.75, name: 'Interceptor Squadrons', attacks: ['bombard', 'salvo', 'spread'], every: 4.5, summon: { types: ['interceptor', 'interceptor', 'interceptor', 'interceptor'], every: 16 } },
      { at: 0.5, name: 'Shield Generator Overload', attacks: ['nova', 'spread', 'bombard'], every: 4, shieldGens: 3 },
      { at: 0.25, name: 'Aggressive Final Assault', attacks: ['charge', 'bombard', 'salvo', 'spread'], every: 2.8, rage: true, summon: { types: ['gunship', 'interceptor', 'interceptor'], every: 22 } },
    ],
    reward: { t: 'plasma_cannon', r: 4, name: 'Dreadfire Plasma Cannon', sp: ['burn', 'splash', 'overclock'], bp: 'bp_dreadfire', cost: { credits: 60000, parts: 400, crimsonite: 40 } },
    intro: '"You dare enter the Maw? My guns will make a cinder of you!"', outro: 'The Crimson Dread breaks apart. Crimson Marauder control is crumbling.',
  },
  void: {
    id: 'nyx', fk: 'void', name: 'Matriarch Nyx', title: 'The Silent Requiem', ship: 'Requiem', hp: 12500, armor: 0.15, radius: 9, speed: 7, dmg: 16,
    desc: 'A blade-thin stealth cruiser that fights from the dark with phase cloaks, drain fields and void lances.',
    parts: [{ k: 'shroud', name: 'Shroud Emitter', x: -5, z: -2, weak: 'cloak' }, { k: 'dish', name: 'EW Array', x: 5, z: -2, weak: 'drain' }, { k: 'prism', name: 'Void Lance Prism', x: 0, z: 6, weak: 'lance' }],
    phases: [
      { at: 1, name: 'Ambush Strikes', attacks: ['cloak', 'lance', 'spread'], every: 4.5 },
      { at: 0.7, name: 'Electronic Warfare Storm', attacks: ['drain', 'lance', 'spread'], every: 4.2, summon: { types: ['ew', 'interceptor', 'interceptor'], every: 18 } },
      { at: 0.45, name: 'Shroud Pylons', attacks: ['mines', 'sweep', 'cloak'], every: 4, shieldGens: 2 },
      { at: 0.2, name: 'Requiem', attacks: ['sweep', 'cloak', 'lance', 'drain'], every: 2.8, rage: true },
    ],
    reward: { t: 'ion_blaster', r: 5, name: 'Requiem Disruptor', sp: ['stun', 'chain', 'pierce'], bp: 'bp_requiem', cost: { credits: 80000, parts: 520, voidstone: 30 } },
    intro: '"You never saw us coming. You never will."', outro: 'The Requiem goes dark forever. The Void Reavers scatter.',
  },
  iron: {
    id: 'kordan', fk: 'iron', name: 'Marshal Kordan', title: 'The Iron Bastion', ship: 'Bastion of Iron', hp: 19000, armor: 0.45, radius: 11, speed: 4, dmg: 20,
    desc: 'A flying fortress: artillery turrets, a drone carrier bay and an armour-projection field.',
    parts: [{ k: 'cannon', name: 'Siege Artillery', x: -5, z: 2, weak: 'bombard' }, { k: 'cannon', name: 'Siege Artillery', x: 5, z: 2, weak: 'bombard' }, { k: 'bay', name: 'Carrier Bay', x: 0, z: -5, weak: 'summon' }, { k: 'core', name: 'Armour Projector', x: 0, z: 3, weak: 'armor' }],
    phases: [
      { at: 1, name: 'Fortress Barrage', attacks: ['bombard', 'spread', 'bombard'], every: 4.5 },
      { at: 0.7, name: 'Carrier Deployment', attacks: ['mines', 'bombard', 'spread'], every: 4.5, summon: { types: ['gunship', 'support', 'interceptor'], every: 18 } },
      { at: 0.45, name: 'Bastion Shield', attacks: ['nova', 'bombard'], every: 4, shieldGens: 4 },
      { at: 0.2, name: 'Ram Protocol', attacks: ['charge', 'bombard', 'mines', 'charge'], every: 3, rage: true },
    ],
    reward: { t: 'railgun', r: 4, name: 'Bastion Breaker', sp: ['pierce', 'shred', 'overclock'], bp: 'bp_bastion', cost: { credits: 70000, parts: 450, crimsonite: 30, voidstone: 10 } },
    intro: '"Iron does not yield. Iron does not break."', outro: 'The Bastion falls. Iron Dominion lines are broken.',
  },
  eclipse: {
    id: 'vale', fk: 'eclipse', name: 'Archon Seraphine Vale', title: 'The Penumbra', ship: 'Penumbra', hp: 13500, armor: 0.2, radius: 9.5, speed: 6, dmg: 17,
    desc: 'An experimental ring-ship that bends light into prism lances and folds space into gravity wells.',
    parts: [{ k: 'prism', name: 'Prism Array', x: -5.5, z: 0, weak: 'sweep' }, { k: 'prism', name: 'Prism Array', x: 5.5, z: 0, weak: 'lance' }, { k: 'core', name: 'Graviton Core', x: 0, z: -4, weak: 'gravity' }],
    phases: [
      { at: 1, name: 'Prism Lances', attacks: ['lance', 'spread', 'lance'], every: 4 },
      { at: 0.7, name: 'Gravity Well', attacks: ['gravity', 'lance', 'spread'], every: 4.4, summon: { types: ['sniper', 'support', 'ew'], every: 20 } },
      { at: 0.45, name: 'Prism Shield', attacks: ['sweep', 'nova'], every: 4, shieldGens: 3 },
      { at: 0.2, name: 'Singularity Overload', attacks: ['sweep', 'gravity', 'salvo', 'lance'], every: 2.8, rage: true },
    ],
    reward: { t: 'particle_beam', r: 5, name: 'Penumbra Lance', sp: ['shred', 'leech', 'overclock'], bp: 'bp_penumbra', cost: { credits: 90000, parts: 560, voidstone: 35 } },
    intro: '"Your technology is quaint. Let me show you the future."', outro: 'The Penumbra collapses into light. Eclipse research is lost.',
  },
  ashen: {
    id: 'rook', fk: 'ashen', name: 'Captain Rook Ashgrave', title: 'The Cinderwake', ship: 'Cinderwake', hp: 12000, armor: 0.15, radius: 9, speed: 9, dmg: 16,
    desc: 'A fast raider-carrier that saturates space with missiles and burning strafing runs.',
    parts: [{ k: 'missile', name: 'Port Missile Rack', x: -4.5, z: 1, weak: 'salvo' }, { k: 'missile', name: 'Starboard Missile Rack', x: 4.5, z: 1, weak: 'salvo' }, { k: 'engine', name: 'Afterburners', x: 0, z: -7.5, weak: 'charge' }],
    phases: [
      { at: 1, name: 'Missile Storm', attacks: ['salvo', 'spread', 'salvo'], every: 4 },
      { at: 0.7, name: 'Strafing Runs', attacks: ['charge', 'salvo', 'spread'], every: 3.8 },
      { at: 0.45, name: 'Firewing Squadron', attacks: ['mines', 'salvo', 'spread'], every: 4, summon: { types: ['interceptor', 'interceptor', 'interceptor', 'sniper'], every: 14 }, shieldGens: 2 },
      { at: 0.2, name: 'Burning Ram', attacks: ['charge', 'salvo', 'bombard', 'charge'], every: 2.6, rage: true },
    ],
    reward: { t: 'missile_pod', r: 4, name: 'Cinderwake Swarm', sp: ['burn', 'splash', 'overclock'], bp: 'bp_cinderwake', cost: { credits: 65000, parts: 420, crimsonite: 35 } },
    intro: '"Catch me if you can, miner!"', outro: 'The Cinderwake burns out. The Ashen Corsairs lose their nerve.',
  },
};
export const BOSS_BY_BP = Object.fromEntries(Object.values(BOSSES).map((b) => [b.reward.bp, b]));

// Sector commanders: a deterministic named officer per sector with a faction doctrine and an adaptive second phase
const FIRST = ['Vex', 'Mara', 'Draal', 'Kessa', 'Orin', 'Thal', 'Ysolde', 'Brakk', 'Cyra', 'Dorn', 'Ilya', 'Juno', 'Rhee', 'Sorrel', 'Tamsin', 'Varo'];
const LAST = ['Kreel', 'Ashby', 'Voss', 'Morrow', 'Hale', 'Quist', 'Rane', 'Sable', 'Teague', 'Wyrd', 'Corrin', 'Faulk'];
const DOCTRINE = { crimson: ['charge', 'bombard'], void: ['cloak', 'lance'], iron: ['mines', 'bombard'], eclipse: ['lance', 'drain'], ashen: ['salvo', 'charge'] };
export function commanderFor(sec, fk) {
  const h = [...sec.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const name = `Commander ${FIRST[h % FIRST.length]} ${LAST[(h >> 3) % LAST.length]}`; const d = DOCTRINE[fk] || ['spread', 'bombard'];
  return {
    id: 'cmd_' + sec.id, fk, name, title: `${FACTIONS[fk] ? FACTIONS[fk].name : 'Pirate'} Sector Commander`, ship: 'Command Cruiser', commander: true,
    hp: 2600 * (0.7 + sec.ringI * 0.55), armor: 0.25, radius: 4.2, speed: 8, dmg: 10 + sec.ringI * 3,
    parts: [{ k: 'dish', name: 'Command Uplink', x: 0, z: -1.8, weak: 'summon' }],
    phases: [
      { at: 1, name: 'Command Doctrine', attacks: ['spread', d[1], 'spread'], every: 4.6, summon: { types: ['interceptor', 'interceptor'], every: 22 } },
      { at: 0.5, name: 'Adaptive Tactics', attacks: ['spread', d[0], d[1]], every: 3.6, adapt: true, summon: { types: ['support', 'interceptor', 'sniper'], every: 20 } },
    ],
    reward: null,
  };
}

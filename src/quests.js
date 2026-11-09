// Story missions + rotating contracts
import { MINERALS } from './data.js';
import { pick, randInt } from './util.js';

// kind: event-driven counters ('collect', 'collect:<type>', 'sell', 'upgrade', 'claim', 'kill', 'rock', 'boss')
// or state checks ('station', 'tier', 'sector', 'level')
export const STORY = [
  { id: 's1', title: 'First Haul', desc: 'Mine asteroids and collect 25 ore', kind: 'collect', need: 25, reward: { credits: 120, xp: 40 } },
  { id: 's2', title: 'Return to Base', desc: 'Fly back to the station to sell your cargo', kind: 'sell', need: 1, reward: { credits: 150, xp: 40 } },
  { id: 's3', title: 'Tune Up', desc: 'Buy any ship upgrade', kind: 'upgrade', need: 1, reward: { credits: 150, xp: 50 } },
  { id: 's4', title: 'Factory Online', desc: 'Claim your factory income', kind: 'claim', need: 1, reward: { credits: 200, xp: 50 } },
  { id: 's5', title: 'Grow the Station', desc: 'Upgrade the station to level 2', kind: 'station', need: 2, reward: { credits: 300, xp: 120 } },
  { id: 's6', title: 'Bigger Hull', desc: 'Buy the Tier 2 Frigate Hauler', kind: 'tier', need: 2, reward: { credits: 500, xp: 150 } },
  { id: 's7', title: 'Into the Frontier', desc: 'Fly out to Sector 2: Frontier Drift', kind: 'sector', need: 2, reward: { credits: 400, xp: 150 } },
  { id: 's8', title: 'Pirate Trouble', desc: 'Destroy 10 pirate ships', kind: 'kill', need: 10, reward: { credits: 900, xp: 300 } },
  { id: 's9', title: 'Green Gold', desc: 'Collect 20 Viridium', kind: 'collect:viridium', need: 20, reward: { credits: 900, xp: 300 } },
  { id: 's10', title: 'Factory Station', desc: 'Upgrade the station to level 3', kind: 'station', need: 3, reward: { credits: 1500, xp: 500 } },
  { id: 's11', title: 'Destroyer', desc: 'Buy the Tier 3 Destroyer', kind: 'tier', need: 3, reward: { credits: 2000, xp: 600 } },
  { id: 's12', title: 'Pirate Reach', desc: 'Push into Sector 3: Pirate Reach', kind: 'sector', need: 3, reward: { credits: 1500, xp: 600 } },
  { id: 's13', title: 'Blood Crystals', desc: 'Collect 30 Crimsonite from rich asteroids', kind: 'collect:crimsonite', need: 30, reward: { credits: 3500, xp: 1000 } },
  { id: 's14', title: 'Orbital Works', desc: 'Upgrade the station to level 4', kind: 'station', need: 4, reward: { credits: 5000, xp: 1500 } },
  { id: 's15', title: 'Heavy Metal', desc: 'Buy the Tier 4 Heavy Cruiser', kind: 'tier', need: 4, reward: { credits: 6000, xp: 1800 } },
  { id: 's16', title: "Warlord's Maw", desc: 'Enter Sector 4, home of the Warlord', kind: 'sector', need: 4, reward: { credits: 5000, xp: 2000 } },
  { id: 's17', title: 'Slay the Warlord', desc: 'Destroy the Warlord Dreadnought', kind: 'boss', need: 1, reward: { credits: 20000, xp: 6000 } },
  { id: 's18', title: 'Industrial Hub', desc: 'Upgrade the station to level 5', kind: 'station', need: 5, reward: { credits: 15000, xp: 5000 } },
  { id: 's19', title: 'Sovereign', desc: 'Commission the Tier 5 Capital Dreadnought', kind: 'tier', need: 5, reward: { credits: 30000, xp: 8000 } },
  { id: 's20', title: 'Frontier Citadel', desc: 'Upgrade the station to level 6', kind: 'station', need: 6, reward: { credits: 60000, xp: 15000 } },
];

export function makeContract(level, maxSector) {
  const mineralsBySector = [['ferrite', 'stellarite'], ['ferrite', 'stellarite', 'viridium'], ['stellarite', 'viridium', 'crimsonite'], ['viridium', 'crimsonite', 'voidstone']];
  const opts = ['mine', 'rock', 'sell'];
  if (maxSector >= 2) opts.push('kill', 'kill');
  const t = pick(opts); const scale = 1 + level * 0.25;
  const id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  if (t === 'mine') {
    const pool = mineralsBySector[Math.min(maxSector, 4) - 1]; const m = pick(pool);
    const need = Math.round(randInt(15, 30) * scale / (MINERALS[m].value / 5 + 0.6));
    return { id, title: 'Ore Contract', desc: `Collect ${need} ${MINERALS[m].name}`, kind: 'collect:' + m, need: Math.max(8, need), reward: { credits: Math.round(need * MINERALS[m].value * 2.2), xp: Math.round(need * 3) } };
  }
  if (t === 'rock') { const need = Math.round(randInt(12, 20) * Math.sqrt(scale)); return { id, title: 'Clear the Lanes', desc: `Destroy ${need} asteroids`, kind: 'rock', need, reward: { credits: Math.round(need * 18 * scale), xp: need * 6 } }; }
  if (t === 'sell') { const need = Math.round(randInt(40, 80) * scale); return { id, title: 'Supply Run', desc: `Sell ${need} units of ore at the station`, kind: 'sellunits', need, reward: { credits: Math.round(need * 4), xp: Math.round(need * 1.5) } }; }
  const need = randInt(6, 14); return { id, title: 'Bounty Board', desc: `Destroy ${need} pirates`, kind: 'kill', need, reward: { credits: Math.round(need * 60 * scale), xp: need * 20 } };
}

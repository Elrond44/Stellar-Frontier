// Balance model (v5). Player DPS grows ~19% per level (gear + upgrades + skills), so fixed enemy HP
// collapses into one-shots by mid-game. Instead, v5 content targets a time-to-kill measured against a
// reference *effective* DPS curve (≈ half of the paper DPS of an on-level build, accounting for aim, heat and range).
// Over-levelling still helps: only 75% of the levels above a ring's entry level are matched, so TTK roughly
// halves every ~5 levels above the ring instead of every ~4.
export const RING_L0 = { H: 1, F: 4, R: 11, M: 19 };
export const FLAGSHIP_L0 = 22;
export const refDps = (L) => 80 * Math.pow(1.19, L - 5);
export const effLevel = (lv, L0) => L0 + 0.75 * Math.max(0, lv - L0);
// hp multiplier for regular ships (their v4 base HP was tuned at the ring's entry level)
export const shipK = (lv, L0) => Math.pow(1.19, 0.75 * Math.max(0, lv - L0));
// enemy damage tracks player hull growth (~4% per level) beyond the ring's entry level
export const dmgK = (lv, L0) => Math.pow(1.04, Math.max(0, lv - L0));
// target seconds-to-kill at reference effective DPS
// (measured with real auto-fire: stationary/huge targets take ~full paper DPS, so these sit ~2x above the 'effective' design time)
export const TTK = { inst_comm: 18, inst_res: 20, inst_yard: 26, inst_def: 26, inst_hq: 60, inst_gen: 5, inst_turret: 4, inst_reactor: 6, inst_hangar: 6, commander: 70, flagship: 230 };
export const ttkHp = (key, lv, L0, armor = 0) => TTK[key] * refDps(effLevel(lv, L0)) / Math.max(0.2, 1 - armor);

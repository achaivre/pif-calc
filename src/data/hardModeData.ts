/**
 * Hard Mode logic for PIF.
 *
 * Hard Mode gives all trainers a 10% stat boost.
 * Important trainers (gym leaders, E4, rivals, Giovanni) also receive
 * competitive EV spreads for their Pokemon.
 */
import type { SmogonStatSet } from '../types/game';

// ---------------------------------------------------------------------------
// Trainer tier detection
// ---------------------------------------------------------------------------

export type TrainerTier = 'elite' | 'regular';

const ELITE_PATTERNS = [
  /^LEADER_/i,
  /^ELITEFOUR_/i,
  /^CHAMPION_/i,
  /^GIOVANNI/i,
  /^RIVAL/i,
  /^ROCKET_BOSS/i,
];

export function getTrainerTier(trainerType: string): TrainerTier {
  for (const pattern of ELITE_PATTERNS) {
    if (pattern.test(trainerType)) return 'elite';
  }
  return 'regular';
}

// ---------------------------------------------------------------------------
// Hard Mode: 10% base stat boost for ALL trainers
// ---------------------------------------------------------------------------

export function applyHardModeStatBoost(base: SmogonStatSet): SmogonStatSet {
  return {
    hp:  Math.floor(base.hp  * 1.1),
    atk: Math.floor(base.atk * 1.1),
    def: Math.floor(base.def * 1.1),
    spa: Math.floor(base.spa * 1.1),
    spd: Math.floor(base.spd * 1.1),
    spe: Math.floor(base.spe * 1.1),
  };
}

// ---------------------------------------------------------------------------
// Competitive EV spread generation for elite trainers
// ---------------------------------------------------------------------------

/**
 * Generate a competitive EV spread for a Pokemon.
 * Strategy:
 *   - If physical attacker (Atk > SpA): 252 Atk + 252 Spe + 6 HP
 *   - If special attacker (SpA >= Atk): 252 SpA + 252 Spe + 6 HP
 *   - If tank (HP is highest + defense): 252 HP + 128 Def + 128 SpD
 */
export function generateEliteEVs(base: SmogonStatSet): SmogonStatSet {
  const { hp, atk, def, spa, spd, spe } = base;
  const maxStat = Math.max(hp, atk, def, spa, spd, spe);

  // Check if it looks like a defensive tank (HP is very high and offense is low)
  const avgOffense = (atk + spa) / 2;
  const avgDefense = (def + spd) / 2;
  const isTank = hp === maxStat && avgDefense > avgOffense;

  if (isTank) {
    return { hp: 252, atk: 0, def: 128, spa: 0, spd: 128, spe: 4 };
  }

  if (atk >= spa) {
    // Physical attacker
    return { hp: 6, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 };
  }

  // Special attacker
  return { hp: 6, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 };
}

/**
 * Generate a nature for elite trainer Pokemon based on their role.
 */
export function generateEliteNature(base: SmogonStatSet, existingNature?: string): string {
  if (existingNature && existingNature !== 'Hardy') return existingNature;

  const { atk, def, spa, spd, spe } = base;
  const avgDefense = (def + spd) / 2;
  const avgOffense = (atk + spa) / 2;
  const isTank = avgDefense > avgOffense * 1.2;

  if (isTank) {
    // Favor bulk: Calm (SpD) or Impish (Def)
    return spd >= def ? 'Calm' : 'Impish';
  }

  if (atk >= spa) {
    // Physical: Jolly (no SpA drop) or Adamant (more power)
    return spe >= atk ? 'Jolly' : 'Adamant';
  }

  // Special: Timid or Modest
  return spe >= spa ? 'Timid' : 'Modest';
}

/**
 * Generate 31 IVs for elite trainers.
 */
export const ELITE_IVS: SmogonStatSet = {
  hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31,
};

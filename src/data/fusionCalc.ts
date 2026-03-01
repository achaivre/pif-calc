/**
 * Pokemon Infinite Fusion stat calculation formulas.
 *
 * Formula source: the PIF game engine (Pokemon Essentials-based).
 * Head pokemon contributes more to SpA/SpD.
 * Body pokemon contributes more to Atk/Def.
 */
import type { PifSpeciesData, SmogonStatSet } from '../types/game';

/** Convert PIF base stats to smogon format */
export function pifToSmogonStats(s: PifSpeciesData['base_stats']): SmogonStatSet {
  return {
    hp: s.HP,
    atk: s.ATTACK,
    def: s.DEFENSE,
    spa: s.SPECIAL_ATTACK,
    spd: s.SPECIAL_DEFENSE,
    spe: s.SPEED,
  };
}

/**
 * Compute fusion base stats given head and body species.
 *
 * Head provides: HP (50%), Atk (33%), Def (33%), SpA (67%), SpD (67%), Spe (33%)
 * Body provides: HP (50%), Atk (67%), Def (67%), SpA (33%), SpD (33%), Spe (67%)
 *
 * No bonus stats — pure weighted averages.
 */
export function calcFusionStats(
  head: PifSpeciesData,
  body: PifSpeciesData
): SmogonStatSet {
  const h = head.base_stats;
  const b = body.base_stats;

  return {
    hp:  Math.floor((h.HP  + b.HP)  / 2),
    atk: Math.floor((h.ATTACK  + 2 * b.ATTACK)  / 3),
    def: Math.floor((h.DEFENSE + 2 * b.DEFENSE) / 3),
    spa: Math.floor((2 * h.SPECIAL_ATTACK  + b.SPECIAL_ATTACK)  / 3),
    spd: Math.floor((2 * h.SPECIAL_DEFENSE + b.SPECIAL_DEFENSE) / 3),
    spe: Math.floor((h.SPEED + 2 * b.SPEED) / 3),
  };
}

/**
 * Compute fusion types.
 * - Type 1 comes from the head's primary type.
 * - Type 2: prefer body's secondary type first (if it exists and ≠ type1),
 *   then body's primary type (if ≠ type1), then head's secondary type.
 */
export function calcFusionTypes(
  head: PifSpeciesData,
  body: PifSpeciesData
): [string, string | null] {
  const type1 = head.type1;
  const candidates = [body.type2, body.type1, head.type2].filter(Boolean) as string[];
  const type2 = candidates.find(t => t !== type1) ?? null;
  return [type1, type2];
}

/**
 * Determine which abilities the fusion can have.
 * Returns an array of PIF ability IDs (strings).
 * Follows PIF convention: head's abilities first, then body's.
 */
export function calcFusionAbilities(
  head: PifSpeciesData,
  body: PifSpeciesData
): string[] {
  const all = [
    ...(head.abilities ?? []),
    ...(head.hidden_abilities ?? []),
    ...(body.abilities ?? []),
    ...(body.hidden_abilities ?? []),
  ];
  // Deduplicate while preserving order
  return Array.from(new Set(all));
}

// ---------------------------------------------------------------------------
// Stat calculator (final stat from base/iv/ev/level/nature)
// Follows Gen 3+ formula used by smogon and PIF
// ---------------------------------------------------------------------------

const NATURE_MODS: Record<string, Partial<Record<keyof SmogonStatSet, number>>> = {
  Lonely:  { atk: 1.1, def: 0.9 },
  Brave:   { atk: 1.1, spe: 0.9 },
  Adamant: { atk: 1.1, spa: 0.9 },
  Naughty: { atk: 1.1, spd: 0.9 },
  Bold:    { def: 1.1, atk: 0.9 },
  Relaxed: { def: 1.1, spe: 0.9 },
  Impish:  { def: 1.1, spa: 0.9 },
  Lax:     { def: 1.1, spd: 0.9 },
  Timid:   { spe: 1.1, atk: 0.9 },
  Hasty:   { spe: 1.1, def: 0.9 },
  Jolly:   { spe: 1.1, spa: 0.9 },
  Naive:   { spe: 1.1, spd: 0.9 },
  Modest:  { spa: 1.1, atk: 0.9 },
  Mild:    { spa: 1.1, def: 0.9 },
  Quiet:   { spa: 1.1, spe: 0.9 },
  Rash:    { spa: 1.1, spd: 0.9 },
  Calm:    { spd: 1.1, atk: 0.9 },
  Gentle:  { spd: 1.1, def: 0.9 },
  Sassy:   { spd: 1.1, spe: 0.9 },
  Careful: { spd: 1.1, spa: 0.9 },
};

export function calcSingleStat(
  stat: keyof SmogonStatSet,
  base: number,
  iv: number,
  ev: number,
  level: number,
  nature: string
): number {
  if (stat === 'hp') {
    // HP formula: floor((2*base + iv + floor(ev/4)) * level / 100) + level + 10
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  // Other stats: floor((floor((2*base + iv + floor(ev/4)) * level / 100) + 5) * natureMod)
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  const mod = NATURE_MODS[nature]?.[stat] ?? 1.0;
  return Math.floor(raw * mod);
}

export function calcAllStats(
  base: SmogonStatSet,
  ivs: SmogonStatSet,
  evs: SmogonStatSet,
  level: number,
  nature: string
): SmogonStatSet {
  const stats: Partial<SmogonStatSet> = {};
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
    stats[stat] = calcSingleStat(stat, base[stat], ivs[stat], evs[stat], level, nature);
  }
  return stats as SmogonStatSet;
}

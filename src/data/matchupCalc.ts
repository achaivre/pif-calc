/**
 * Pure TypeScript type-based matchup scoring.
 * No async — uses a hardcoded Gen 6+ type chart for speed.
 * The scoring is intentionally fast: O(boxSize * enemyTeamSize * types).
 */

// Attacker type → { defender type → multiplier }
const TYPE_CHART: Record<string, Record<string, number>> = {
  NORMAL:   { ROCK: 0.5, GHOST: 0, STEEL: 0.5 },
  FIRE:     { FIRE: 0.5, WATER: 0.5, GRASS: 2, ICE: 2, BUG: 2, ROCK: 0.5, DRAGON: 0.5, STEEL: 2 },
  WATER:    { FIRE: 2, WATER: 0.5, GRASS: 0.5, GROUND: 2, ROCK: 2, DRAGON: 0.5 },
  ELECTRIC: { WATER: 2, ELECTRIC: 0.5, GRASS: 0.5, GROUND: 0, FLYING: 2, DRAGON: 0.5 },
  GRASS:    { FIRE: 0.5, WATER: 2, GRASS: 0.5, POISON: 0.5, GROUND: 2, FLYING: 0.5, BUG: 0.5, ROCK: 2, DRAGON: 0.5, STEEL: 0.5 },
  ICE:      { WATER: 0.5, GRASS: 2, ICE: 0.5, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: 0.5 },
  FIGHTING: { NORMAL: 2, ICE: 2, POISON: 0.5, FLYING: 0.5, PSYCHIC: 0.5, BUG: 0.5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2, FAIRY: 0.5 },
  POISON:   { GRASS: 2, POISON: 0.5, GROUND: 0.5, ROCK: 0.5, GHOST: 0.5, STEEL: 0, FAIRY: 2 },
  GROUND:   { FIRE: 2, ELECTRIC: 2, GRASS: 0.5, POISON: 2, FLYING: 0, BUG: 0.5, ROCK: 2, STEEL: 2 },
  FLYING:   { ELECTRIC: 0.5, GRASS: 2, FIGHTING: 2, BUG: 2, ROCK: 0.5, STEEL: 0.5 },
  PSYCHIC:  { FIGHTING: 2, POISON: 2, PSYCHIC: 0.5, DARK: 0, STEEL: 0.5 },
  BUG:      { FIRE: 0.5, GRASS: 2, FIGHTING: 0.5, POISON: 0.5, FLYING: 0.5, PSYCHIC: 2, GHOST: 0.5, DARK: 2, STEEL: 0.5, FAIRY: 0.5 },
  ROCK:     { FIRE: 2, ICE: 2, FIGHTING: 0.5, GROUND: 0.5, FLYING: 2, BUG: 2, STEEL: 0.5 },
  GHOST:    { NORMAL: 0, PSYCHIC: 2, GHOST: 2, DARK: 0.5 },
  DRAGON:   { DRAGON: 2, STEEL: 0.5, FAIRY: 0 },
  DARK:     { FIGHTING: 0.5, PSYCHIC: 2, GHOST: 2, DARK: 0.5, FAIRY: 0.5 },
  STEEL:    { FIRE: 0.5, WATER: 0.5, ELECTRIC: 0.5, ICE: 2, ROCK: 2, STEEL: 0.5, FAIRY: 2 },
  FAIRY:    { FIRE: 0.5, FIGHTING: 2, POISON: 0.5, DRAGON: 2, DARK: 2, STEEL: 0.5 },
};

/** Effectiveness of a single attacker type vs one or more defender types */
export function typeEff(atkType: string, defTypes: string[]): number {
  const row = TYPE_CHART[atkType.toUpperCase()] ?? {};
  return defTypes.reduce((m, dt) => m * (row[dt.toUpperCase()] ?? 1), 1);
}

/** Best offensive multiplier given attacker has `atkTypes` vs defender's `defTypes` */
export function bestOffense(atkTypes: string[], defTypes: string[]): number {
  if (atkTypes.length === 0 || defTypes.length === 0) return 1;
  return Math.max(...atkTypes.map(t => typeEff(t, defTypes)));
}

/** Worst (highest) incoming multiplier from enemy attack types vs our defense types */
export function worstIncoming(enemyAtkTypes: string[], ourDefTypes: string[]): number {
  if (enemyAtkTypes.length === 0 || ourDefTypes.length === 0) return 1;
  return Math.max(...enemyAtkTypes.map(t => typeEff(t, ourDefTypes)));
}

export interface EnemySnapshot {
  /** Enemy's own types (used as offensive fallback if no move types) */
  types: string[];
  /** Non-status move types; if present, used instead of types for defense calc */
  moveTypes?: string[];
}

export interface MatchupScore {
  /** Average best offensive multiplier vs each enemy (higher = better attacker) */
  offenseScore: number;
  /** Average worst incoming multiplier from each enemy (lower = more resistant) */
  defenseScore: number;
  /** 1 / defenseScore — higher is more resilient */
  resilienceScore: number;
  /** Weighted: (offense*2 + resilience) / 3 */
  totalScore: number;
}

/**
 * Score a Pokemon with the given `boxTypes` against an enemy team.
 * Pure sync — call from a useEffect or worker.
 */
export function scoreMatchup(boxTypes: string[], enemies: EnemySnapshot[]): MatchupScore {
  if (enemies.length === 0) {
    return { offenseScore: 1, defenseScore: 1, resilienceScore: 1, totalScore: 1 };
  }

  let totalOff = 0;
  let totalDef = 0;

  for (const e of enemies) {
    const atkTypes = (e.moveTypes && e.moveTypes.length > 0) ? e.moveTypes : e.types;
    totalOff += bestOffense(boxTypes, e.types);
    totalDef += worstIncoming(atkTypes, boxTypes);
  }

  const n = enemies.length;
  const offenseScore = totalOff / n;
  const defenseScore = totalDef / n;
  const resilienceScore = defenseScore > 0 ? 1 / defenseScore : 2;
  const totalScore = (offenseScore * 2 + resilienceScore) / 3;

  return { offenseScore, defenseScore, resilienceScore, totalScore };
}

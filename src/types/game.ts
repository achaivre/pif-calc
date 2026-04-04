// ---------------------------------------------------------------------------
// Raw data types (matching the __ivars__ structure in public/data/*.json)
// ---------------------------------------------------------------------------

export interface PifBaseStats {
  HP: number;
  ATTACK: number;
  DEFENSE: number;
  SPECIAL_ATTACK: number;
  SPECIAL_DEFENSE: number;
  SPEED: number;
}

export interface PifSpeciesData {
  id: string;
  id_number: number;
  real_name: string;
  type1: string;
  type2: string | null;
  base_stats: PifBaseStats;
  moves: Array<[number, string]>;
  tutor_moves?: string[];
  egg_moves?: string[];
  abilities: string[];
  hidden_abilities?: string[];
  evolutions?: Array<[string, string, unknown, unknown]>; // [targetId, method, param, flag]
}

export interface PifMoveData {
  id: string;
  id_number: number;
  real_name: string;
  function_code: string;
  base_damage: number;
  type: string;
  category: number; // 0=Physical, 1=Special, 2=Status
  accuracy: number;
  total_pp: number;
  effect_chance: number;
  real_description: string;
}

export interface PifAbilityData {
  id: string;
  id_number: number;
  real_name: string;
  real_description: string;
}

export interface PifItemData {
  id: string;
  id_number: number;
  real_name: string;
  real_description: string;
}

export interface PifTypeData {
  id: string;
  real_name: string;
  weaknesses: string[];
  resistances: string[];
  immunities: string[];
}

export interface PifTrainerPokemon {
  species: string;
  level: number;
  nature?: string;
  ability?: string;
  item?: string;
  moves?: string[];
  iv?: PifBaseStats;
  ev?: PifBaseStats;
  happiness?: number;
}

export interface PifTrainerData {
  id_number: number;
  trainer_type: string;
  real_name: string;
  version: number;
  items?: string[];
  pokemon: PifTrainerPokemon[];
  location?: string;
  real_lose_text?: string;
}

// ---------------------------------------------------------------------------
// App-level state types
// ---------------------------------------------------------------------------

/** Stat set in smogon/calc format (lowercase keys) */
export interface SmogonStatSet {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/** A fusion is defined by its head and body species string IDs */
export interface FusionSpeciesId {
  head: string; // e.g. "BULBASAUR"
  body: string; // e.g. "SQUIRTLE"
}

/** Either a base species string ID or a fusion */
export type SpeciesId = string | FusionSpeciesId;

export function isFusion(id: SpeciesId): id is FusionSpeciesId {
  return typeof id === 'object' && 'head' in id;
}

/** A player's pokemon (in their box or active in calc) */
export interface PlayerPokemon {
  id: string; // unique UUID for this slot
  nickname?: string;
  speciesId: SpeciesId;
  level: number;
  nature: string; // e.g. "Adamant"
  ability: string; // e.g. "Hustle"
  item: string; // e.g. "Life Orb"
  ivs: SmogonStatSet;
  evs: SmogonStatSet;
  moves: string[]; // up to 4 PIF move string IDs (e.g. "QUICKATTACK")
  /**
   * Soul link number — any positive integer.
   * Pokemon across different players' boxes with the same linkNumber are soul-linked.
   * Survives JSON export/import because it's just a number, not a UUID.
   */
  linkNumber?: number;
  /**
   * Current HP override (1 to computed max HP).
   * When set below ⅓ max HP, abilities like Blaze/Torrent/Overgrow/Swarm activate.
   * Omit (or set to computed max HP) for full health.
   */
  currentHp?: number;
}

/** One player's data: their name + their box */
export interface PlayerData {
  name: string;
  box: PlayerPokemon[];
}

export interface SideConditions {
  isReflect: boolean;
  isLightScreen: boolean;
  isAuroraVeil: boolean;
  isTailwind: boolean;
  isSR: boolean;
  spikes: number; // 0-3
}

export interface FieldConditions {
  weather: string | null; // 'Sun' | 'Rain' | 'Sand' | 'Hail' | null
  terrain: string | null; // 'Electric' | 'Grassy' | 'Psychic' | 'Misty' | null
  attackerSide: SideConditions;
  defenderSide: SideConditions;
  isGravity: boolean;
  isMagicRoom: boolean;
  isWonderRoom: boolean;
}

/** Computed output for one move's damage */
export interface MoveCalcResult {
  moveId: string;
  moveName: string;
  basePower: number;          // base power (0 for status)
  category: 'Physical' | 'Special' | 'Status';
  moveDescription: string;    // from PIF move data (what the move does)
  damageMin: number;          // min damage as % of defender HP
  damageMax: number;          // max damage as % of defender HP
  damageMinHP: number;        // min damage in raw HP
  damageMaxHP: number;        // max damage in raw HP
  defenderMaxHP: number;      // defender's computed max HP
  koText: string;             // e.g. "guaranteed OHKO" or "56.3% chance to 2HKO"
  desc: string;               // full smogon calc description
  isStatus: boolean;
  effectiveness: number;      // 0, 0.25, 0.5, 1, 2, or 4
  moveType: string;           // uppercase PIF type e.g. "FIRE"
}

/** All computed info for a pokemon for display */
export interface ResolvedPokemon {
  displayName: string;      // e.g. "Bulbasaur" or "Spearow / Rattata"
  types: string[];          // 1 or 2 type strings (PIF format, e.g. "FIRE")
  baseStats: SmogonStatSet;
  ability: string;
  item: string;
  level: number;
  nature: string;
  ivs: SmogonStatSet;
  evs: SmogonStatSet;
  moves: string[];
}

export const DEFAULT_IVS: SmogonStatSet = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const DEFAULT_EVS: SmogonStatSet = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export const DEFAULT_SIDE: SideConditions = {
  isReflect: false,
  isLightScreen: false,
  isAuroraVeil: false,
  isTailwind: false,
  isSR: false,
  spikes: 0,
};

export const DEFAULT_FIELD: FieldConditions = {
  weather: null,
  terrain: null,
  attackerSide: { ...DEFAULT_SIDE },
  defenderSide: { ...DEFAULT_SIDE },
  isGravity: false,
  isMagicRoom: false,
  isWonderRoom: false,
};

export const NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
];

export const STAT_LABELS: Record<keyof SmogonStatSet, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export const TYPE_COLORS: Record<string, string> = {
  NORMAL: '#A8A878', FIRE: '#F08030', WATER: '#6890F0', ELECTRIC: '#F8D030',
  GRASS: '#78C850', ICE: '#98D8D8', FIGHTING: '#C03028', POISON: '#A040A0',
  GROUND: '#E0C068', FLYING: '#A890F0', PSYCHIC: '#F85888', BUG: '#A8B820',
  ROCK: '#B8A038', GHOST: '#705898', DRAGON: '#7038F8', DARK: '#705848',
  STEEL: '#B8B8D0', FAIRY: '#EE99AC',
};

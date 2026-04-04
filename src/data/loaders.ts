/**
 * Loaders for PIF game data from public/data/*.json
 * All functions are cached after first call.
 */
import type { PifSpeciesData, PifMoveData, PifAbilityData, PifTrainerData, PifItemData, PifTypeData, PifBaseStats } from '../types/game';

/** Expert trainer pokemon entry (from expert_leaders.json) */
export interface ExpertPokemonEntry {
  species: string;
  level: number;
  nature: string | null;
  ability: string | null;
  item: string | null;
  ev: PifBaseStats | null;
  iv: PifBaseStats | null;
  moves: string[];
}

export interface ExpertLeaderEntry {
  real_name: string;
  pokemon: ExpertPokemonEntry[];
}

// ---------------------------------------------------------------------------
// Internal caches
// ---------------------------------------------------------------------------
let _speciesByNum: Map<number, PifSpeciesData> | null = null;
let _speciesById: Map<string, PifSpeciesData> | null = null;
let _movesById: Map<string, PifMoveData> | null = null;
let _movesByRealName: Map<string, PifMoveData> | null = null;
let _abilitiesById: Map<string, PifAbilityData> | null = null;
let _trainers: PifTrainerData[] | null = null;
let _itemsById: Map<string, PifItemData> | null = null;
let _typesById: Map<string, PifTypeData> | null = null;
let _expertLeaders: Record<string, ExpertLeaderEntry> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Only keep numeric-keyed entries (skip __ref__ alias keys) */
function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawEntry = { __ivars__: any } | { __ref__: string };

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

export async function loadSpecies(): Promise<{
  byNum: Map<number, PifSpeciesData>;
  byId: Map<string, PifSpeciesData>;
}> {
  if (_speciesByNum && _speciesById) {
    return { byNum: _speciesByNum, byId: _speciesById };
  }

  const res = await fetch(`${import.meta.env.BASE_URL}data/species.json`);
  const raw: Record<string, RawEntry> = await res.json();

  _speciesByNum = new Map();
  _speciesById = new Map();

  for (const [key, val] of Object.entries(raw)) {
    if (!isNumericKey(key) || !val || '__ref__' in val) continue;
    const data: PifSpeciesData = val.__ivars__;
    if (!data?.id) continue;
    _speciesByNum.set(data.id_number, data);
    _speciesById.set(data.id, data);
  }

  return { byNum: _speciesByNum, byId: _speciesById };
}

export async function getSpeciesById(id: string): Promise<PifSpeciesData | undefined> {
  const { byId } = await loadSpecies();
  return byId.get(id);
}

export async function getSpeciesByNum(num: number): Promise<PifSpeciesData | undefined> {
  const { byNum } = await loadSpecies();
  return byNum.get(num);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export async function loadMoves(): Promise<Map<string, PifMoveData>> {
  if (_movesById) return _movesById;

  const res = await fetch(`${import.meta.env.BASE_URL}data/moves.json`);
  const raw: Record<string, RawEntry> = await res.json();

  _movesById = new Map();
  _movesByRealName = new Map();

  for (const [key, val] of Object.entries(raw)) {
    if (!isNumericKey(key) || !val || '__ref__' in val) continue;
    const data: PifMoveData = val.__ivars__;
    if (!data?.id) continue;
    _movesById.set(data.id, data);
    _movesByRealName.set(data.real_name.toLowerCase(), data);
  }

  return _movesById;
}

export async function getMoveById(id: string): Promise<PifMoveData | undefined> {
  const moves = await loadMoves();
  return moves.get(id);
}

export async function getMoveByRealName(name: string): Promise<PifMoveData | undefined> {
  await loadMoves();
  return _movesByRealName!.get(name.toLowerCase());
}

/** Return all moves as array, sorted by real_name */
export async function getAllMoves(): Promise<PifMoveData[]> {
  const moves = await loadMoves();
  return Array.from(moves.values()).sort((a, b) => a.real_name.localeCompare(b.real_name));
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

export async function loadAbilities(): Promise<Map<string, PifAbilityData>> {
  if (_abilitiesById) return _abilitiesById;

  const res = await fetch(`${import.meta.env.BASE_URL}data/abilities.json`);
  const raw: Record<string, RawEntry> = await res.json();

  _abilitiesById = new Map();

  for (const [key, val] of Object.entries(raw)) {
    if (!isNumericKey(key) || !val || '__ref__' in val) continue;
    const data: PifAbilityData = val.__ivars__;
    if (!data?.id) continue;
    _abilitiesById.set(data.id, data);
  }

  return _abilitiesById;
}

export async function getAbilityById(id: string): Promise<PifAbilityData | undefined> {
  const abilities = await loadAbilities();
  return abilities.get(id);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function loadItems(): Promise<Map<string, PifItemData>> {
  if (_itemsById) return _itemsById;

  const res = await fetch(`${import.meta.env.BASE_URL}data/items.json`);
  const raw: Record<string, RawEntry> = await res.json();

  _itemsById = new Map();

  for (const [key, val] of Object.entries(raw)) {
    if (!isNumericKey(key) || !val || '__ref__' in val) continue;
    const data: PifItemData = val.__ivars__;
    if (!data?.id) continue;
    _itemsById.set(data.id, data);
  }

  return _itemsById;
}

export async function getItemById(id: string): Promise<PifItemData | undefined> {
  const items = await loadItems();
  return items.get(id);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export async function loadTypes(): Promise<Map<string, PifTypeData>> {
  if (_typesById) return _typesById;

  const res = await fetch(`${import.meta.env.BASE_URL}data/types.json`);
  const raw: Record<string, RawEntry> = await res.json();

  _typesById = new Map();

  for (const [key, val] of Object.entries(raw)) {
    if (!isNumericKey(key) || !val || '__ref__' in val) continue;
    const data: PifTypeData = val.__ivars__;
    if (!data?.id) continue;
    _typesById.set(data.id, data);
  }

  return _typesById;
}

/**
 * Calculate type effectiveness multiplier for a move type vs a set of defending types.
 * Returns 0, 0.25, 0.5, 1, 2, or 4.
 */
export async function getTypeEffectiveness(
  moveType: string,
  defenderTypes: string[]
): Promise<number> {
  const typesMap = await loadTypes();
  const mt = moveType.toUpperCase();

  let multiplier = 1;
  for (const defType of defenderTypes) {
    const dt = defType.toUpperCase();
    const typeEntry = typesMap.get(dt);
    if (!typeEntry) continue;
    if (typeEntry.immunities.map(t => t.toUpperCase()).includes(mt)) {
      multiplier *= 0;
    } else if (typeEntry.weaknesses.map(t => t.toUpperCase()).includes(mt)) {
      multiplier *= 2;
    } else if (typeEntry.resistances.map(t => t.toUpperCase()).includes(mt)) {
      multiplier *= 0.5;
    }
  }

  return multiplier;
}

// ---------------------------------------------------------------------------
// Trainers (Regular mode = trainers.json; Hard Mode applied in smogonBridge)
// ---------------------------------------------------------------------------

export async function loadTrainers(): Promise<PifTrainerData[]> {
  if (_trainers) return _trainers;

  const res = await fetch(`${import.meta.env.BASE_URL}data/trainers.json`);
  const json = await res.json();

  // New format: { trainers: [...] }
  const arr: PifTrainerData[] = Array.isArray(json) ? json : (json.trainers ?? []);
  // Deduplicate by id_number (the data has exact duplicate entries)
  const seenIds = new Set<number>();
  _trainers = arr.filter(t => {
    if (!t?.trainer_type) return false;
    if (seenIds.has(t.id_number)) return false;
    seenIds.add(t.id_number);
    return true;
  });

  return _trainers;
}

// ---------------------------------------------------------------------------
// Fusion species parsing
// ---------------------------------------------------------------------------

/**
 * Parse a trainer pokemon species string.
 * Base species: "BULBASAUR" → returns { kind: 'base', id: 'BULBASAUR' }
 * Fusion species: "B19H21" → returns { kind: 'fusion', bodyNum: 19, headNum: 21 }
 */
export type ParsedSpecies =
  | { kind: 'base'; id: string }
  | { kind: 'fusion'; bodyNum: number; headNum: number };

export function parseTrainerSpecies(species: string): ParsedSpecies {
  const match = species.match(/^B(\d+)H(\d+)$/i);
  if (match) {
    return { kind: 'fusion', bodyNum: parseInt(match[1]), headNum: parseInt(match[2]) };
  }
  return { kind: 'base', id: species };
}

// ---------------------------------------------------------------------------
// Expert Leaders (gym leaders / E4 / Giovanni with full competitive spreads)
// ---------------------------------------------------------------------------

export async function loadExpertLeaders(): Promise<Record<string, ExpertLeaderEntry>> {
  if (_expertLeaders) return _expertLeaders;
  const res = await fetch(`${import.meta.env.BASE_URL}data/expert_leaders.json`);
  const json = await res.json();

  // New format: { trainers: [...] } — key by trainer_type, use version 0
  const arr: Array<{ trainer_type: string; real_name: string; version: number; pokemon: ExpertPokemonEntry[] }> =
    Array.isArray(json) ? json : (json.trainers ?? []);

  _expertLeaders = {};
  for (const t of arr) {
    if (!t?.trainer_type) continue;
    const key = t.trainer_type;
    // Keep version 0 (first encounter); don't overwrite with rematch versions
    if (!_expertLeaders[key] || t.version === 0) {
      _expertLeaders[key] = { real_name: t.real_name, pokemon: t.pokemon ?? [] };
    }
  }

  return _expertLeaders;
}

// ---------------------------------------------------------------------------
// Preloader — kick off all fetches at app start
// ---------------------------------------------------------------------------

export async function preloadAllData(): Promise<void> {
  await Promise.all([
    loadSpecies(),
    loadMoves(),
    loadAbilities(),
    loadTrainers(),
    loadItems(),
    loadTypes(),
    loadExpertLeaders(),
  ]);
}

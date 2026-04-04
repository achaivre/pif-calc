/**
 * Bridge between PIF data and @smogon/calc.
 */
import { Generations, Pokemon, Move, Field, Side, calculate } from '@smogon/calc';
import type { Weather, Terrain } from '@smogon/calc';
import type {
  PlayerPokemon,
  PifTrainerPokemon,
  SmogonStatSet,
  FieldConditions,
  MoveCalcResult,
} from '../types/game';
import { isFusion, DEFAULT_IVS } from '../types/game';
import {
  loadSpecies,
  loadMoves,
  loadAbilities,
  loadItems,
  loadExpertLeaders,
  parseTrainerSpecies,
  getTypeEffectiveness,
} from './loaders';
import { calcFusionStats, calcFusionTypes, pifToSmogonStats } from './fusionCalc';
import {
  getTrainerTier,
  generateEliteEVs,
  generateEliteNature,
  ELITE_IVS,
} from './hardModeData';

const GEN = Generations.get(7);

function pifTypeToSmogon(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedTrainerPokemon {
  displayName: string;
  types: string[];
  baseStats: SmogonStatSet;
  availableAbilities: string[];
  ability: string;
  abilityName: string;
  abilityDescription: string;
  item: string;
  itemName: string;
  itemDescription: string;
  level: number;
  nature: string;
  ivs: SmogonStatSet;
  evs: SmogonStatSet;
  moves: string[];
  tier: 'elite' | 'regular';
}

export interface EnemyOverrides {
  ability?: string;
  item?: string;
  nature?: string;
  evs?: SmogonStatSet;
  ivs?: SmogonStatSet;
}

// ---------------------------------------------------------------------------
// Resolve trainer pokemon
// ---------------------------------------------------------------------------

export async function resolveTrainerPokemon(
  tp: PifTrainerPokemon,
  trainerType: string,
  expertMode: boolean,
  pokemonIndexInTeam: number
): Promise<ResolvedTrainerPokemon> {
  const { byId: speciesById, byNum: speciesByNum } = await loadSpecies();
  const movesMap = await loadMoves();
  const abilitiesMap = await loadAbilities();
  const itemsMap = await loadItems();

  const tier = getTrainerTier(trainerType);

  // Expert mode: overlay expert leader data for elite trainers
  let effectiveTp: PifTrainerPokemon = tp;
  if (expertMode && tier === 'elite') {
    const expertLeaders = await loadExpertLeaders();
    const entry = expertLeaders[trainerType];
    if (entry && entry.pokemon[pokemonIndexInTeam]) {
      const ep = entry.pokemon[pokemonIndexInTeam];
      effectiveTp = {
        species: ep.species ?? tp.species,
        level: ep.level ?? tp.level,
        nature: ep.nature ?? tp.nature,
        ability: ep.ability ?? tp.ability,
        item: ep.item ?? tp.item,
        moves: ep.moves?.length ? ep.moves : tp.moves,
        iv: ep.iv ?? tp.iv,
        ev: ep.ev ?? tp.ev,
      };
    }
  }

  const parsed = parseTrainerSpecies(effectiveTp.species);

  let displayName: string;
  let types: string[];
  let baseStats: SmogonStatSet;
  let abilityId = effectiveTp.ability ?? '';
  let availableAbilities: string[] = [];

  if (parsed.kind === 'fusion') {
    const head = speciesByNum.get(parsed.headNum);
    const body = speciesByNum.get(parsed.bodyNum);
    if (head && body) {
      displayName = `${head.real_name} / ${body.real_name}`;
      const [t1, t2] = calcFusionTypes(head, body);
      types = t2 ? [pifTypeToSmogon(t1), pifTypeToSmogon(t2)] : [pifTypeToSmogon(t1)];
      baseStats = calcFusionStats(head, body);
      availableAbilities = Array.from(new Set([
        ...(head.abilities ?? []),
        ...(head.hidden_abilities ?? []),
        ...(body.abilities ?? []),
        ...(body.hidden_abilities ?? []),
      ]));
      if (!abilityId && head.abilities.length > 0) abilityId = head.abilities[0];
    } else {
      displayName = effectiveTp.species;
      types = ['Normal'];
      baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
    }
  } else {
    const species = speciesById.get(parsed.id);
    if (species) {
      displayName = species.real_name;
      types = species.type2
        ? [pifTypeToSmogon(species.type1), pifTypeToSmogon(species.type2)]
        : [pifTypeToSmogon(species.type1)];
      baseStats = pifToSmogonStats(species.base_stats);
      availableAbilities = Array.from(new Set([
        ...(species.abilities ?? []),
        ...(species.hidden_abilities ?? []),
      ]));
      if (!abilityId && species.abilities.length > 0) abilityId = species.abilities[0];
    } else {
      displayName = parsed.id;
      types = ['Normal'];
      baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
    }
  }

  // Hard Mode: 10% level boost only (IVs/EVs come from trainer data)
  const level = Math.ceil(effectiveTp.level * 1.1);

  // ev/iv may be partial objects (some keys missing) — default missing to 0/31
  const safeIv = effectiveTp.iv as Record<string, number> | undefined;
  const ivs: SmogonStatSet = safeIv && Object.keys(safeIv).length > 0
    ? { hp: safeIv.HP ?? 31, atk: safeIv.ATTACK ?? 31, def: safeIv.DEFENSE ?? 31, spa: safeIv.SPECIAL_ATTACK ?? 31, spd: safeIv.SPECIAL_DEFENSE ?? 31, spe: safeIv.SPEED ?? 31 }
    : tier === 'elite' ? { ...ELITE_IVS } : { ...DEFAULT_IVS };

  const safeEv = effectiveTp.ev as Record<string, number> | undefined;
  let evs: SmogonStatSet;
  if (safeEv && Object.keys(safeEv).length > 0) {
    evs = { hp: safeEv.HP ?? 0, atk: safeEv.ATTACK ?? 0, def: safeEv.DEFENSE ?? 0, spa: safeEv.SPECIAL_ATTACK ?? 0, spd: safeEv.SPECIAL_DEFENSE ?? 0, spe: safeEv.SPEED ?? 0 };
  } else if (tier === 'elite') {
    evs = generateEliteEVs(baseStats);
  } else {
    evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  }

  const moves: string[] = (effectiveTp.moves ?? []).map(mid => {
    const m = movesMap.get(mid);
    return m ? m.real_name : mid;
  });

  let nature = effectiveTp.nature
    ? effectiveTp.nature.charAt(0) + effectiveTp.nature.slice(1).toLowerCase()
    : '';
  if (!nature || nature === 'Hardy') {
    nature = tier === 'elite' ? generateEliteNature(baseStats, nature) : 'Hardy';
  }

  const abilityEntry = abilityId ? abilitiesMap.get(abilityId) : undefined;
  const abilityName = abilityEntry?.real_name ?? abilityId;
  const abilityDescription = abilityEntry?.real_description ?? '';

  const itemId = effectiveTp.item ?? '';
  const itemEntry = itemId ? itemsMap.get(itemId) : undefined;
  const itemName = itemEntry?.real_name ?? itemId;
  const itemDescription = itemEntry?.real_description ?? '';

  return {
    displayName,
    types,
    baseStats,
    availableAbilities,
    ability: abilityId,
    abilityName,
    abilityDescription,
    item: itemId,
    itemName,
    itemDescription,
    level,
    nature,
    ivs,
    evs,
    moves,
    tier,
  };
}

// ---------------------------------------------------------------------------
// Build smogon objects
// ---------------------------------------------------------------------------

async function buildSmogonPokemon(pp: PlayerPokemon): Promise<Pokemon> {
  const [{ byId }, abilitiesMap] = await Promise.all([loadSpecies(), loadAbilities()]);
  let displayName = 'Bulbasaur';
  let baseStats: SmogonStatSet;
  let types: string[];

  if (isFusion(pp.speciesId)) {
    const head = byId.get(pp.speciesId.head);
    const body = byId.get(pp.speciesId.body);
    if (head && body) {
      displayName = `${head.real_name} / ${body.real_name}`;
      baseStats = calcFusionStats(head, body);
      const [t1, t2] = calcFusionTypes(head, body);
      types = t2 ? [pifTypeToSmogon(t1), pifTypeToSmogon(t2)] : [pifTypeToSmogon(t1)];
    } else {
      baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
      types = ['Normal'];
    }
  } else {
    const sp = byId.get(pp.speciesId);
    if (sp) {
      displayName = sp.real_name;
      baseStats = pifToSmogonStats(sp.base_stats);
      types = sp.type2
        ? [pifTypeToSmogon(sp.type1), pifTypeToSmogon(sp.type2)]
        : [pifTypeToSmogon(sp.type1)];
    } else {
      baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
      types = ['Normal'];
    }
  }

  // smogon/calc's hasAbility() uses direct string comparison (case-sensitive).
  // PIF stores ability IDs as ALL_CAPS (e.g. "BLAZE"), so we must resolve the
  // real_name ("Blaze") from the abilities map before passing to smogon.
  const abilityRealName = pp.ability
    ? (abilitiesMap.get(pp.ability)?.real_name ?? pp.ability)
    : pp.ability;

  return new Pokemon(GEN, displayName, {
    level: pp.level,
    nature: pp.nature,
    ability: abilityRealName,
    item: pp.item,
    ivs: pp.ivs,
    evs: pp.evs,
    curHP: pp.currentHp,
    overrides: { baseStats, types },
  });
}

function buildSmogonPokemonFromResolved(r: ResolvedTrainerPokemon, overrides?: EnemyOverrides): Pokemon {
  return new Pokemon(GEN, r.displayName.split(' / ')[0] || 'Bulbasaur', {
    level: r.level,
    nature: overrides?.nature ?? r.nature,
    ability: overrides?.ability ?? r.ability,
    item: overrides?.item ?? (r.itemName || r.item),
    ivs: overrides?.ivs ?? r.ivs,
    evs: overrides?.evs ?? r.evs,
    overrides: { baseStats: r.baseStats, types: r.types },
  });
}

// ---------------------------------------------------------------------------
// Build Field
// ---------------------------------------------------------------------------

function buildField(f: FieldConditions): Field {
  return new Field({
    weather: (f.weather ?? undefined) as Weather | undefined,
    terrain: (f.terrain ?? undefined) as Terrain | undefined,
    isGravity: f.isGravity,
    isMagicRoom: f.isMagicRoom,
    isWonderRoom: f.isWonderRoom,
    attackerSide: new Side({
      isReflect: f.attackerSide.isReflect,
      isLightScreen: f.attackerSide.isLightScreen,
      isAuroraVeil: f.attackerSide.isAuroraVeil,
      isTailwind: f.attackerSide.isTailwind,
      isSR: f.attackerSide.isSR,
      spikes: f.attackerSide.spikes,
    }),
    defenderSide: new Side({
      isReflect: f.defenderSide.isReflect,
      isLightScreen: f.defenderSide.isLightScreen,
      isAuroraVeil: f.defenderSide.isAuroraVeil,
      isTailwind: f.defenderSide.isTailwind,
      isSR: f.defenderSide.isSR,
      spikes: f.defenderSide.spikes,
    }),
  });
}

// ---------------------------------------------------------------------------
// Core damage helper
// ---------------------------------------------------------------------------

async function calcMoveDamage(
  attacker: Pokemon,
  defender: Pokemon,
  field: Field,
  movesMap: Map<string, import('../types/game').PifMoveData>,
  moveIds: string[],
  defenderTypes: string[]
): Promise<MoveCalcResult[]> {
  const results: MoveCalcResult[] = [];

  for (const moveId of moveIds.filter(Boolean)) {
    const pifMove = movesMap.get(moveId);
    if (!pifMove) continue;

    const isStatus = pifMove.category === 2 || pifMove.base_damage === 0;
    const category = pifMove.category === 0 ? 'Physical' : pifMove.category === 1 ? 'Special' : 'Status';
    const moveType = pifMove.type.toUpperCase();
    const effectiveness = await getTypeEffectiveness(moveType, defenderTypes);

    const defenderMaxHP = defender.maxHP();
    const moveDescription = pifMove.real_description || '';

    if (isStatus) {
      results.push({
        moveId, moveName: pifMove.real_name,
        basePower: 0, category: 'Status', moveDescription,
        damageMin: 0, damageMax: 0, damageMinHP: 0, damageMaxHP: 0,
        defenderMaxHP, koText: '', desc: moveDescription || pifMove.real_name,
        isStatus: true, effectiveness, moveType,
      });
      continue;
    }

    const moveOverrides = {
      basePower: pifMove.base_damage,
      type: pifTypeToSmogon(pifMove.type),
      category: category as 'Physical' | 'Special' | 'Status',
    };

    let smogonMove: Move | null = null;
    try {
      smogonMove = new Move(GEN, pifMove.real_name, { overrides: moveOverrides });
    } catch {
      try { smogonMove = new Move(GEN, 'Tackle', { overrides: moveOverrides }); } catch { smogonMove = null; }
    }

    if (!smogonMove) {
      results.push({
        moveId, moveName: pifMove.real_name,
        basePower: pifMove.base_damage, category: category as 'Physical' | 'Special' | 'Status', moveDescription,
        damageMin: 0, damageMax: 0, damageMinHP: 0, damageMaxHP: 0,
        defenderMaxHP, koText: '', desc: pifMove.real_name,
        isStatus: false, effectiveness, moveType,
      });
      continue;
    }

    try {
      const result = calculate(GEN, attacker, defender, smogonMove, field);
      const [minDmg, maxDmg] = result.range();
      results.push({
        moveId,
        moveName: pifMove.real_name,
        basePower: pifMove.base_damage,
        category: category as 'Physical' | 'Special' | 'Status',
        moveDescription,
        damageMin: parseFloat(((minDmg / defenderMaxHP) * 100).toFixed(1)),
        damageMax: parseFloat(((maxDmg / defenderMaxHP) * 100).toFixed(1)),
        damageMinHP: minDmg,
        damageMaxHP: maxDmg,
        defenderMaxHP,
        koText: result.kochance().text,
        desc: result.desc(),
        isStatus: false,
        effectiveness,
        moveType,
      });
    } catch {
      results.push({
        moveId, moveName: pifMove.real_name,
        basePower: pifMove.base_damage, category: category as 'Physical' | 'Special' | 'Status', moveDescription,
        damageMin: 0, damageMax: 0, damageMinHP: 0, damageMaxHP: 0,
        defenderMaxHP, koText: '', desc: `${pifMove.real_name} — calc error`,
        isStatus: false, effectiveness: 1, moveType,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Exported calc functions
// ---------------------------------------------------------------------------

export async function runCalc(
  attackerPP: PlayerPokemon,
  defenderResolved: ResolvedTrainerPokemon,
  fieldConditions: FieldConditions,
  enemyOverrides?: EnemyOverrides
): Promise<MoveCalcResult[]> {
  const movesMap = await loadMoves();
  const attacker = await buildSmogonPokemon(attackerPP);
  const defender = buildSmogonPokemonFromResolved(defenderResolved, enemyOverrides);
  const field = buildField(fieldConditions);
  const defenderTypes = defenderResolved.types.map(t => t.toUpperCase());
  return calcMoveDamage(attacker, defender, field, movesMap, attackerPP.moves, defenderTypes);
}

export async function runReverseCalc(
  enemyResolved: ResolvedTrainerPokemon,
  defenderPP: PlayerPokemon,
  fieldConditions: FieldConditions,
  enemyOverrides?: EnemyOverrides
): Promise<MoveCalcResult[]> {
  const movesMap = await loadMoves();
  const attacker = buildSmogonPokemonFromResolved(enemyResolved, enemyOverrides);
  const defender = await buildSmogonPokemon(defenderPP);

  const flippedField = buildField({
    ...fieldConditions,
    attackerSide: fieldConditions.defenderSide,
    defenderSide: fieldConditions.attackerSide,
  });

  const movesByRealName = new Map<string, string>();
  for (const [id, m] of movesMap.entries()) {
    movesByRealName.set(m.real_name.toLowerCase(), id);
  }
  const enemyMoveIds = enemyResolved.moves.map(name => movesByRealName.get(name.toLowerCase()) ?? name);

  const { byId } = await loadSpecies();
  let defenderTypes: string[] = ['NORMAL'];
  if (isFusion(defenderPP.speciesId)) {
    const head = byId.get(defenderPP.speciesId.head);
    const body = byId.get(defenderPP.speciesId.body);
    if (head && body) {
      const [t1, t2] = calcFusionTypes(head, body);
      defenderTypes = t2 ? [t1.toUpperCase(), t2.toUpperCase()] : [t1.toUpperCase()];
    }
  } else {
    const sp = byId.get(defenderPP.speciesId);
    if (sp) {
      defenderTypes = sp.type2
        ? [sp.type1.toUpperCase(), sp.type2.toUpperCase()]
        : [sp.type1.toUpperCase()];
    }
  }

  return calcMoveDamage(attacker, defender, flippedField, movesMap, enemyMoveIds, defenderTypes);
}

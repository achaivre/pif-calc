/**
 * Info modal for a box Pokemon.
 * Shows: type weaknesses/resistances, abilities + descriptions, level-up moves.
 */
import { useState, useEffect } from 'react';
import type { PlayerPokemon, PifSpeciesData, SmogonStatSet, SpeciesId } from '../../types/game';
import { isFusion, STAT_LABELS } from '../../types/game';
import { loadSpecies, loadAbilities, loadTypes, loadMoves } from '../../data/loaders';
import { calcFusionTypes, calcFusionStats, pifToSmogonStats, calcAllStats } from '../../data/fusionCalc';
import TypeBadge from '../common/TypeBadge';
import StatBar from '../common/StatBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AbilityInfo {
  id: string;
  name: string;
  description: string;
  isHidden: boolean;
}

interface ResolvedMove {
  moveId: string;
  level?: number;        // only for level-up moves
  moveName: string;
  bp: number;
  category: 'Physical' | 'Special' | 'Status';
  moveType: string;      // uppercase e.g. "FIRE"
  description: string;
}

interface EvolveOption {
  label: string;
  newSpeciesId: SpeciesId;
}

interface ResolvedInfo {
  displayName: string;
  types: string[];
  baseStats: SmogonStatSet;
  abilities: AbilityInfo[];
  levelMoves: ResolvedMove[];
  tutorMoves: ResolvedMove[];
  // Type effectiveness
  effectiveness: { type: string; mult: number }[];
  evolveOptions: EvolveOption[];
}

// ---------------------------------------------------------------------------
// Compute type effectiveness for a defending pokemon
// ---------------------------------------------------------------------------

async function computeEffectiveness(
  defTypes: string[]
): Promise<{ type: string; mult: number }[]> {
  const typesMap = await loadTypes();
  const ALL_TYPES = [
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY',
  ];

  return ALL_TYPES.map(atk => {
    let mult = 1;
    for (const defType of defTypes) {
      const entry = typesMap.get(defType.toUpperCase());
      if (!entry) continue;
      if (entry.immunities.map(t => t.toUpperCase()).includes(atk)) { mult *= 0; break; }
      else if (entry.weaknesses.map(t => t.toUpperCase()).includes(atk)) mult *= 2;
      else if (entry.resistances.map(t => t.toUpperCase()).includes(atk)) mult *= 0.5;
    }
    return { type: atk, mult };
  }).filter(e => e.mult !== 1); // only non-neutral
}

// ---------------------------------------------------------------------------
// Resolve full info for a PlayerPokemon
// ---------------------------------------------------------------------------

function resolveMove(
  moveId: string,
  movesMap: Map<string, import('../../types/game').PifMoveData>,
  level?: number
): ResolvedMove {
  const m = movesMap.get(moveId);
  if (!m) return { moveId, level, moveName: moveId, bp: 0, category: 'Status', moveType: 'NORMAL', description: '' };
  const category: 'Physical' | 'Special' | 'Status' =
    m.category === 0 ? 'Physical' : m.category === 1 ? 'Special' : 'Status';
  return {
    moveId,
    level,
    moveName: m.real_name,
    bp: m.base_damage,
    category,
    moveType: m.type.toUpperCase(),
    description: m.real_description,
  };
}

async function resolveInfo(pokemon: PlayerPokemon): Promise<ResolvedInfo | null> {
  const [{ byId }, abilitiesMap, movesMap] = await Promise.all([
    loadSpecies(),
    loadAbilities(),
    loadMoves(),
  ]);

  let displayName = '';
  let types: string[] = [];
  let baseStats: SmogonStatSet = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
  let rawAbilityIds: string[] = [];
  let rawHiddenAbilityIds: string[] = [];
  let rawLevelMoves: Array<[number, string]> = [];
  let rawTutorMoves: string[] = [];

  let headSp: PifSpeciesData | undefined;
  let bodySp: PifSpeciesData | undefined;
  let singleSp: PifSpeciesData | undefined;

  if (isFusion(pokemon.speciesId)) {
    headSp = byId.get(pokemon.speciesId.head);
    bodySp = byId.get(pokemon.speciesId.body);
    if (!headSp || !bodySp) return null;

    displayName = `${headSp.real_name} / ${bodySp.real_name}`;
    const [t1, t2] = calcFusionTypes(headSp, bodySp);
    types = t2 ? [t1.toUpperCase(), t2.toUpperCase()] : [t1.toUpperCase()];
    baseStats = calcFusionStats(headSp, bodySp);

    rawAbilityIds = [...(headSp.abilities ?? []), ...(bodySp.abilities ?? [])];
    rawHiddenAbilityIds = [...(headSp.hidden_abilities ?? []), ...(bodySp.hidden_abilities ?? [])];
    rawLevelMoves = headSp.moves ?? [];
    // De-duplicate tutor moves from both head and body
    rawTutorMoves = Array.from(new Set([...(headSp.tutor_moves ?? []), ...(bodySp.tutor_moves ?? [])]));
  } else {
    singleSp = byId.get(pokemon.speciesId as string);
    if (!singleSp) return null;

    displayName = singleSp.real_name;
    types = singleSp.type2
      ? [singleSp.type1.toUpperCase(), singleSp.type2.toUpperCase()]
      : [singleSp.type1.toUpperCase()];
    baseStats = pifToSmogonStats(singleSp.base_stats);
    rawAbilityIds = singleSp.abilities ?? [];
    rawHiddenAbilityIds = singleSp.hidden_abilities ?? [];
    rawLevelMoves = singleSp.moves ?? [];
    rawTutorMoves = singleSp.tutor_moves ?? [];
  }

  // Build evolve options (only forward evolutions that exist in the dex)
  const evolveOptions: EvolveOption[] = [];
  if (headSp && bodySp && isFusion(pokemon.speciesId)) {
    for (const [targetId] of (headSp.evolutions ?? [])) {
      const tgt = byId.get(targetId as string);
      if (tgt) evolveOptions.push({ label: `Head → ${tgt.real_name}`, newSpeciesId: { head: targetId as string, body: pokemon.speciesId.body } });
    }
    for (const [targetId] of (bodySp.evolutions ?? [])) {
      const tgt = byId.get(targetId as string);
      if (tgt) evolveOptions.push({ label: `Body → ${tgt.real_name}`, newSpeciesId: { head: pokemon.speciesId.head, body: targetId as string } });
    }
  } else if (singleSp) {
    for (const [targetId] of (singleSp.evolutions ?? [])) {
      const tgt = byId.get(targetId as string);
      if (tgt) evolveOptions.push({ label: `→ ${tgt.real_name}`, newSpeciesId: targetId as string });
    }
  }

  // Resolve ability info
  const seenAbilities = new Set<string>();
  const abilities: AbilityInfo[] = [];
  for (const id of [...rawAbilityIds, ...rawHiddenAbilityIds]) {
    if (seenAbilities.has(id)) continue;
    seenAbilities.add(id);
    const entry = abilitiesMap.get(id);
    abilities.push({
      id,
      name: entry?.real_name ?? id,
      description: entry?.real_description ?? '',
      isHidden: rawHiddenAbilityIds.includes(id),
    });
  }

  const levelMoves = rawLevelMoves
    .map(([lvl, id]) => resolveMove(id, movesMap, lvl))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  // De-duplicate tutor moves, skip any already in level-up moves
  const levelMoveIds = new Set(levelMoves.map(m => m.moveId));
  const tutorMoves = rawTutorMoves
    .filter((id, idx, arr) => arr.indexOf(id) === idx && !levelMoveIds.has(id))
    .map(id => resolveMove(id, movesMap));

  const effectiveness = await computeEffectiveness(types);

  return {
    displayName,
    types,
    baseStats,
    abilities,
    levelMoves,
    tutorMoves,
    effectiveness,
    evolveOptions,
  };
}

// ---------------------------------------------------------------------------
// Effectiveness display
// ---------------------------------------------------------------------------

function multClass(mult: number): string {
  if (mult === 0) return 'eff-mult-x0';
  if (mult >= 4) return 'eff-mult-x4';
  if (mult >= 2) return 'eff-mult-x2';
  if (mult <= 0.25) return 'eff-mult-x025';
  return 'eff-mult-half';
}

function multLabel(mult: number): string {
  if (mult === 0) return '0×';
  if (mult === 4) return '4×';
  if (mult === 2) return '2×';
  if (mult === 0.5) return '½×';
  if (mult === 0.25) return '¼×';
  return `${mult}×`;
}

// ---------------------------------------------------------------------------
// Resolve summary (saved Pokemon data)
// ---------------------------------------------------------------------------

interface SummaryData {
  abilityName: string;
  abilityDesc: string;
  savedMoves: ResolvedMove[];   // resolved from pokemon.moves[]
  baseStats: SmogonStatSet;
  computedStats: SmogonStatSet;
}

async function resolveSummary(
  pokemon: PlayerPokemon,
  baseStats: SmogonStatSet
): Promise<SummaryData> {
  const [abilitiesMap, movesMap] = await Promise.all([loadAbilities(), loadMoves()]);

  const abilityEntry = pokemon.ability ? abilitiesMap.get(pokemon.ability) : undefined;
  const abilityName = abilityEntry?.real_name ?? pokemon.ability ?? '';
  const abilityDesc = abilityEntry?.real_description ?? '';

  const savedMoves: ResolvedMove[] = (pokemon.moves ?? [])
    .filter(Boolean)
    .map(id => {
      const m = movesMap.get(id);
      if (!m) return { moveId: id, moveName: id, bp: 0, category: 'Status' as const, moveType: 'NORMAL', description: '' };
      const category: 'Physical' | 'Special' | 'Status' =
        m.category === 0 ? 'Physical' : m.category === 1 ? 'Special' : 'Status';
      return { moveId: id, moveName: m.real_name, bp: m.base_damage, category, moveType: m.type.toUpperCase(), description: m.real_description };
    });

  const computedStats = calcAllStats(baseStats, pokemon.ivs, pokemon.evs, pokemon.level, pokemon.nature);

  return { abilityName, abilityDesc, savedMoves, baseStats, computedStats };
}

// ---------------------------------------------------------------------------
// Move row component
// ---------------------------------------------------------------------------

function MoveRow({ move, showLevel }: { move: ResolvedMove; showLevel?: boolean }) {
  const catLabel = move.category === 'Physical' ? 'Phys' : move.category === 'Special' ? 'Spec' : 'Status';
  const catClass = move.category === 'Physical' ? 'cat-phys' : move.category === 'Special' ? 'cat-spec' : 'cat-status';
  return (
    <div className="info-move-row">
      <div className="info-move-row-main">
        {showLevel && (
          <span className="info-move-level">Lv.{move.level ?? '—'}</span>
        )}
        <TypeBadge type={move.moveType} small />
        <span className={`damage-cat ${catClass}`}>{catLabel}</span>
        <span className="info-move-name">{move.moveName}</span>
        {move.category !== 'Status' && move.bp > 0 && (
          <span className="damage-bp">BP {move.bp}</span>
        )}
      </div>
      {move.description && (
        <div className="info-move-desc">{move.description}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface Props {
  pokemon: PlayerPokemon;
  onClose: () => void;
  onEvolve?: (newSpeciesId: SpeciesId) => void;
}

export default function PokemonInfoModal({ pokemon, onClose, onEvolve }: Props) {
  const [info, setInfo] = useState<ResolvedInfo | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'summary' | 'type' | 'abilities' | 'moves'>('summary');

  useEffect(() => {
    setLoading(true);
    setSummary(null);
    resolveInfo(pokemon).then(r => {
      setInfo(r);
      if (r) {
        resolveSummary(pokemon, r.baseStats).then(s => {
          setSummary(s);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, [pokemon]);

  const title = pokemon.nickname
    ? `${pokemon.nickname} (${info?.displayName ?? '…'})`
    : (info?.displayName ?? '…');

  const TAB_LABELS: Record<typeof tab, string> = {
    summary: 'Summary',
    type: 'Type Chart',
    abilities: 'Abilities',
    moves: 'Learnset',
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {info && (
              <div className="info-types-row" style={{ marginTop: 4 }}>
                {info.types.map(t => <TypeBadge key={t} type={t} />)}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Lv. {pokemon.level}</span>
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="player-tabs" style={{ padding: '4px 1rem 0', margin: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          {(['summary', 'type', 'abilities', 'moves'] as const).map(t => (
            <button
              key={t}
              className={`player-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {loading && <div className="loading-msg">Loading…</div>}

          {!loading && !info && (
            <div className="error-msg">Could not load species data.</div>
          )}

          {/* ── Summary tab: actual saved Pokemon data ── */}
          {!loading && info && summary && tab === 'summary' && (
            <>
              {/* Level / Nature / Ability / Item */}
              <div className="editor-section">
                <div className="summary-meta-grid">
                  <div className="summary-meta-cell">
                    <span className="field-label">Level</span>
                    <span className="summary-meta-value">{pokemon.level}</span>
                  </div>
                  <div className="summary-meta-cell">
                    <span className="field-label">Nature</span>
                    <span className="summary-meta-value">{pokemon.nature || '—'}</span>
                  </div>
                  <div className="summary-meta-cell">
                    <span className="field-label">Ability</span>
                    <span className="summary-meta-value" title={summary.abilityDesc || undefined}>
                      {summary.abilityName || '—'}
                    </span>
                  </div>
                  <div className="summary-meta-cell">
                    <span className="field-label">Item</span>
                    <span className="summary-meta-value">{pokemon.item || '—'}</span>
                  </div>
                </div>
                {summary.abilityDesc && (
                  <p className="detail-description" style={{ marginTop: 4 }}>{summary.abilityDesc}</p>
                )}
              </div>

              {/* Saved moves */}
              <div className="editor-section">
                <span className="field-label">Moves</span>
                {summary.savedMoves.length === 0 ? (
                  <div className="empty-msg">No moves saved.</div>
                ) : (
                  <div className="info-move-rows">
                    {summary.savedMoves.map(m => (
                      <MoveRow key={m.moveId} move={m} />
                    ))}
                  </div>
                )}
              </div>

              {/* Computed stats */}
              <div className="editor-section">
                <div className="editor-section-header">
                  <span className="field-label">Stats</span>
                  <span className="hp-display">
                    <span className="hp-value">{summary.computedStats.hp}</span>
                    <span className="hp-label">HP</span>
                  </span>
                </div>
                <StatBar baseStats={info.baseStats} actualStats={summary.computedStats} nature={pokemon.nature} compact />
              </div>

              {/* EVs / IVs */}
              <div className="editor-section">
                <span className="field-label">EVs / IVs</span>
                <div className="summary-stat-table">
                  <div className="summary-stat-header">
                    <span />
                    {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map(s => (
                      <span key={s} className="summary-stat-col-label">{STAT_LABELS[s]}</span>
                    ))}
                  </div>
                  <div className="summary-stat-row">
                    <span className="summary-stat-row-label">EV</span>
                    {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map(s => (
                      <span key={s} className={`summary-stat-val ${pokemon.evs[s] > 0 ? 'ev-nonzero' : ''}`}>
                        {pokemon.evs[s]}
                      </span>
                    ))}
                  </div>
                  <div className="summary-stat-row">
                    <span className="summary-stat-row-label">IV</span>
                    {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map(s => (
                      <span key={s} className={`summary-stat-val ${pokemon.ivs[s] < 31 ? 'iv-imperfect' : ''}`}>
                        {pokemon.ivs[s]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Evolve */}
              {onEvolve && info.evolveOptions.length > 0 && (
                <div className="editor-section">
                  <span className="field-label">Evolve</span>
                  <div className="evolve-btn-row">
                    {info.evolveOptions.map((opt, i) => (
                      <button
                        key={i}
                        className="btn btn-primary evolve-btn"
                        onClick={() => onEvolve(opt.newSpeciesId)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && info && tab === 'type' && (
            <>
              <div className="editor-section">
                <span className="field-label">Base Stats</span>
                <StatBar baseStats={info.baseStats} compact />
              </div>
              <div className="editor-section">
                <span className="field-label">Weaknesses &amp; Resistances</span>
                {info.effectiveness.length === 0 ? (
                  <div className="empty-msg">No notable type interactions.</div>
                ) : (
                  <div className="effectiveness-grid">
                    {info.effectiveness
                      .sort((a, b) => b.mult - a.mult)
                      .map(({ type, mult }) => (
                        <div key={type} className="effectiveness-entry">
                          <span className={`effectiveness-mult ${multClass(mult)}`}>
                            {multLabel(mult)}
                          </span>
                          <TypeBadge type={type} small />
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </>
          )}

          {!loading && info && tab === 'abilities' && (
            <div className="editor-section">
              {info.abilities.length === 0
                ? <div className="empty-msg">No ability data.</div>
                : info.abilities.map(a => (
                  <div key={a.id} className="info-ability-row">
                    <span className="info-ability-name">
                      {a.name}
                      {a.isHidden && <span style={{ color: 'var(--accent2)', fontSize: '0.65rem', marginLeft: 4 }}>(Hidden)</span>}
                    </span>
                    {a.description && <span className="info-ability-desc">{a.description}</span>}
                  </div>
                ))
              }
            </div>
          )}

          {!loading && info && tab === 'moves' && (
            <>
              {info.levelMoves.length > 0 && (
                <div className="editor-section">
                  <span className="field-label">Level-up Moves</span>
                  <div className="info-move-rows">
                    {info.levelMoves.map(m => (
                      <MoveRow key={`${m.level}-${m.moveId}`} move={m} showLevel />
                    ))}
                  </div>
                </div>
              )}
              {info.tutorMoves.length > 0 && (
                <div className="editor-section">
                  <span className="field-label">Tutor / TM Moves</span>
                  <div className="info-move-rows">
                    {info.tutorMoves.map(m => (
                      <MoveRow key={m.moveId} move={m} />
                    ))}
                  </div>
                </div>
              )}
              {info.levelMoves.length === 0 && info.tutorMoves.length === 0 && (
                <div className="empty-msg">No move data available.</div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

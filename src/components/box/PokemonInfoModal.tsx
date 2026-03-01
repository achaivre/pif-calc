/**
 * Info modal for a box Pokemon.
 * Shows: type weaknesses/resistances, abilities + descriptions, level-up moves.
 */
import { useState, useEffect } from 'react';
import type { PlayerPokemon, PifSpeciesData, SmogonStatSet } from '../../types/game';
import { isFusion } from '../../types/game';
import { loadSpecies, loadAbilities, loadTypes } from '../../data/loaders';
import { calcFusionTypes, calcFusionStats, pifToSmogonStats } from '../../data/fusionCalc';
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

interface LevelMove {
  level: number;
  moveId: string;
}

interface ResolvedInfo {
  displayName: string;
  types: string[];
  baseStats: SmogonStatSet;
  abilities: AbilityInfo[];
  levelMoves: LevelMove[];       // from species moves array
  tutorMoves: string[];
  eggMoves: string[];
  // Type effectiveness
  effectiveness: { type: string; mult: number }[];
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

async function resolveInfo(pokemon: PlayerPokemon): Promise<ResolvedInfo | null> {
  const { byId } = await loadSpecies();
  const abilitiesMap = await loadAbilities();

  let displayName = '';
  let types: string[] = [];
  let baseStats: SmogonStatSet = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
  let rawAbilityIds: string[] = [];
  let rawHiddenAbilityIds: string[] = [];
  let levelMoves: LevelMove[] = [];
  let tutorMoves: string[] = [];
  let eggMoves: string[] = [];

  if (isFusion(pokemon.speciesId)) {
    const head = byId.get(pokemon.speciesId.head);
    const body = byId.get(pokemon.speciesId.body);
    if (!head || !body) return null;

    displayName = `${head.real_name} / ${body.real_name}`;
    const [t1, t2] = calcFusionTypes(head, body);
    types = t2 ? [t1.toUpperCase(), t2.toUpperCase()] : [t1.toUpperCase()];
    baseStats = calcFusionStats(head, body);

    // Fusion inherits head abilities + body abilities
    rawAbilityIds = [...(head.abilities ?? []), ...(body.abilities ?? [])];
    rawHiddenAbilityIds = [...(head.hidden_abilities ?? []), ...(body.hidden_abilities ?? [])];

    // Level moves from head (since head determines the learnset in PIF)
    levelMoves = (head.moves ?? []).map(([lvl, id]) => ({ level: lvl, moveId: id }));
    tutorMoves = [...(head.tutor_moves ?? []), ...(body.tutor_moves ?? [])];
    eggMoves = [...(head.egg_moves ?? []), ...(body.egg_moves ?? [])];
  } else {
    const sp = byId.get(pokemon.speciesId as string);
    if (!sp) return null;

    displayName = sp.real_name;
    types = sp.type2
      ? [sp.type1.toUpperCase(), sp.type2.toUpperCase()]
      : [sp.type1.toUpperCase()];
    baseStats = pifToSmogonStats(sp.base_stats);
    rawAbilityIds = sp.abilities ?? [];
    rawHiddenAbilityIds = sp.hidden_abilities ?? [];
    levelMoves = (sp.moves ?? []).map(([lvl, id]) => ({ level: lvl, moveId: id }));
    tutorMoves = sp.tutor_moves ?? [];
    eggMoves = sp.egg_moves ?? [];
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

  const effectiveness = await computeEffectiveness(types);

  return {
    displayName,
    types,
    baseStats,
    abilities,
    levelMoves: levelMoves.sort((a, b) => a.level - b.level),
    tutorMoves,
    eggMoves,
    effectiveness,
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
// Main modal
// ---------------------------------------------------------------------------

interface Props {
  pokemon: PlayerPokemon;
  onClose: () => void;
}

export default function PokemonInfoModal({ pokemon, onClose }: Props) {
  const [info, setInfo] = useState<ResolvedInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'type' | 'abilities' | 'moves'>('type');

  useEffect(() => {
    setLoading(true);
    resolveInfo(pokemon).then(r => {
      setInfo(r);
      setLoading(false);
    });
  }, [pokemon]);

  const title = pokemon.nickname
    ? `${pokemon.nickname} (${info?.displayName ?? '…'})`
    : (info?.displayName ?? '…');

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
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
          {(['type', 'abilities', 'moves'] as const).map(t => (
            <button
              key={t}
              className={`player-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'type' ? 'Type Chart' : t === 'abilities' ? 'Abilities' : 'Moves'}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {loading && <div className="loading-msg">Loading…</div>}

          {!loading && !info && (
            <div className="error-msg">Could not load species data.</div>
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
                  <div className="info-move-list">
                    {info.levelMoves.map(({ level, moveId }) => (
                      <span key={`${level}-${moveId}`} className="info-move-tag">
                        <span className="info-move-level">Lv.{level}</span>
                        {moveId}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {info.tutorMoves.length > 0 && (
                <div className="editor-section">
                  <span className="field-label">Tutor / TM Moves</span>
                  <div className="info-move-list">
                    {info.tutorMoves.map(m => (
                      <span key={m} className="info-move-tag">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {info.eggMoves.length > 0 && (
                <div className="editor-section">
                  <span className="field-label">Egg Moves</span>
                  <div className="info-move-list">
                    {info.eggMoves.map(m => (
                      <span key={m} className="info-move-tag">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {info.levelMoves.length === 0 && info.tutorMoves.length === 0 && info.eggMoves.length === 0 && (
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

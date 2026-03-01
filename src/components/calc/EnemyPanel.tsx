/**
 * Right panel — enemy trainer + Smogon-style editable Pokemon detail.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../../context/AppContext';
import { loadTrainers } from '../../data/loaders';
import { resolveTrainerPokemon, runReverseCalc } from '../../data/smogonBridge';
import type { EnemyOverrides } from '../../data/smogonBridge';
import type { PifTrainerData, MoveCalcResult, SmogonStatSet } from '../../types/game';
import { STAT_LABELS, NATURES } from '../../types/game';
import TypeBadge from '../common/TypeBadge';
import StatBar from '../common/StatBar';
import type { ResolvedTrainerPokemon } from '../../data/smogonBridge';
import { getTrainerTier } from '../../data/hardModeData';
import { calcAllStats } from '../../data/fusionCalc';

// ---------------------------------------------------------------------------
// Type effectiveness label
// ---------------------------------------------------------------------------

function EffLabel({ eff }: { eff: number }) {
  if (eff === 0) return <span className="eff-label eff-immune">Immune</span>;
  if (eff >= 4)  return <span className="eff-label eff-super2">4×</span>;
  if (eff >= 2)  return <span className="eff-label eff-super">SE</span>;
  if (eff <= 0.25) return <span className="eff-label eff-resist2">¼×</span>;
  if (eff <= 0.5)  return <span className="eff-label eff-resist">NVE</span>;
  return null;
}

// ---------------------------------------------------------------------------
// Damage row
// ---------------------------------------------------------------------------

function DamageRow({ result }: { result: MoveCalcResult }) {
  const isKO  = result.koText.toLowerCase().includes('ohko') || result.koText.toLowerCase().includes('guaranteed');
  const is2HKO = result.koText.toLowerCase().includes('2hko');
  const catLabel = result.category === 'Physical' ? 'Phys' : result.category === 'Special' ? 'Spec' : 'Status';
  const catClass = result.category === 'Physical' ? 'cat-phys' : result.category === 'Special' ? 'cat-spec' : 'cat-status';
  return (
    <div
      className={`damage-row-enhanced ${isKO ? 'damage-ko' : is2HKO ? 'damage-2hko' : ''} ${result.effectiveness >= 2 ? 'eff-super-row' : result.effectiveness === 0 ? 'eff-immune-row' : ''}`}
    >
      <div className="damage-row-main">
        <TypeBadge type={result.moveType} small />
        <span className={`damage-cat ${catClass}`}>{catLabel}</span>
        <span className="damage-move-name">{result.moveName}</span>
        {!result.isStatus && result.basePower > 0 && (
          <span className="damage-bp">BP {result.basePower}</span>
        )}
        <EffLabel eff={result.effectiveness} />
        {result.isStatus ? (
          <span className="damage-status">Status</span>
        ) : (
          <>
            <span className="damage-range">{result.damageMin}–{result.damageMax}%</span>
            {result.damageMinHP > 0 && (
              <span className="damage-hp-range">
                ({result.damageMinHP}–{result.damageMaxHP}/{result.defenderMaxHP} HP)
              </span>
            )}
            {result.koText && (
              <span className={`damage-ko-text ${isKO ? 'ko' : is2HKO ? 'twohko' : ''}`}>
                {result.koText}
              </span>
            )}
          </>
        )}
      </div>
      {result.moveDescription && (
        <div className="damage-row-desc" title={result.desc}>{result.moveDescription}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact stat input
// ---------------------------------------------------------------------------

function StatInputRow({
  label, value, max, onChange, natureModifier,
}: {
  label: string; value: number; max: number; onChange: (v: number) => void; natureModifier?: number;
}) {
  return (
    <div className="stat-input-group">
      <label className={`stat-input-label ${natureModifier && natureModifier > 1 ? 'stat-nature-up' : natureModifier && natureModifier < 1 ? 'stat-nature-down' : ''}`}>
        {label}
      </label>
      <input
        className="pif-input pif-input--stat"
        type="number" min={0} max={max} value={value}
        onChange={e => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pokemon card (compact team slot)
// ---------------------------------------------------------------------------

function TrainerPokemonCard({
  resolved, isSelected, onClick,
}: {
  resolved: ResolvedTrainerPokemon | null; isSelected: boolean; onClick: () => void;
}) {
  if (!resolved) {
    return <div className={`enemy-poke-card loading ${isSelected ? 'selected' : ''}`} onClick={onClick}>…</div>;
  }
  return (
    <div
      className={`enemy-poke-card ${isSelected ? 'selected' : ''} ${resolved.tier === 'elite' ? 'elite-poke' : ''}`}
      onClick={onClick}
    >
      <div className="enemy-poke-header">
        <span className="enemy-poke-name">{resolved.displayName}</span>
        <span className="enemy-poke-level">Lv. {resolved.level}</span>
      </div>
      <div className="enemy-poke-types">
        {resolved.types.map(t => <TypeBadge key={t} type={t.toUpperCase()} small />)}
      </div>
      {resolved.abilityName && (
        <span className="enemy-poke-ability" title={resolved.abilityDescription}>{resolved.abilityName}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main EnemyPanel
// ---------------------------------------------------------------------------

const DEFAULT_OVR: EnemyOverrides = {};

export default function EnemyPanel() {
  const { state, dispatch } = useAppState();
  const [allTrainers, setAllTrainers]       = useState<PifTrainerData[]>([]);
  const [filteredTrainers, setFiltered]     = useState<PifTrainerData[]>([]);
  const [loading, setLoading]               = useState(true);
  const [reverseResults, setReverseResults] = useState<MoveCalcResult[]>([]);

  // Per-selected-pokemon overrides (reset when enemy changes)
  const [overrides, setOverrides] = useState<EnemyOverrides>(DEFAULT_OVR);

  // Load trainers
  useEffect(() => {
    loadTrainers().then(trainers => {
      setAllTrainers(trainers);
      setLoading(false);
    });
  }, []);

  // Filter (search + hide rematches)
  useEffect(() => {
    let list = allTrainers;
    if (state.hideRematches) list = list.filter(t => (t.version ?? 0) === 0);
    const q = state.trainerSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(t =>
        t.real_name.toLowerCase().includes(q) || t.trainer_type.toLowerCase().includes(q)
      );
    }
    setFiltered(list.slice(0, 120));
  }, [state.trainerSearch, state.hideRematches, allTrainers]);

  // Resolve team when trainer or expertMode changes
  const resolveTeam = useCallback(async (trainer: PifTrainerData) => {
    dispatch({ type: 'SET_RESOLVED_ENEMY_TEAM', team: [] });
    const resolved = await Promise.all(
      trainer.pokemon.map((p, i) =>
        resolveTrainerPokemon(p, trainer.trainer_type, state.expertMode, i)
      )
    );
    dispatch({ type: 'SET_RESOLVED_ENEMY_TEAM', team: resolved });
  }, [dispatch, state.expertMode]);

  const selectTrainer = useCallback((trainer: PifTrainerData) => {
    dispatch({ type: 'SET_TRAINER', trainer });
    setOverrides(DEFAULT_OVR);
    resolveTeam(trainer);
  }, [dispatch, resolveTeam]);

  // Re-resolve when expertMode changes
  useEffect(() => {
    if (state.selectedTrainer) resolveTeam(state.selectedTrainer);
  }, [state.expertMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset overrides when selected pokemon changes
  useEffect(() => { setOverrides(DEFAULT_OVR); }, [state.selectedEnemyIndex]);

  // Reverse calc
  useEffect(() => {
    const activePP = state.activePokemon[state.activePlayerTab];
    const enemy = state.resolvedEnemyTeam[state.selectedEnemyIndex];
    if (!activePP || !enemy || enemy.moves.length === 0) { setReverseResults([]); return; }
    runReverseCalc(enemy, activePP, state.field, overrides)
      .then(setReverseResults)
      .catch(() => setReverseResults([]));
  }, [state.activePokemon, state.activePlayerTab, state.resolvedEnemyTeam, state.selectedEnemyIndex, state.field, overrides]);

  const selectedEnemy = state.resolvedEnemyTeam[state.selectedEnemyIndex] ?? null;
  const tier = state.selectedTrainer ? getTrainerTier(state.selectedTrainer.trainer_type) : 'regular';

  // Effective values (overrides applied on top of resolved)
  const effAbility = overrides.ability ?? selectedEnemy?.ability ?? '';
  const effItem    = overrides.item    ?? selectedEnemy?.itemName ?? '';
  const effNature  = overrides.nature  ?? selectedEnemy?.nature   ?? 'Hardy';
  const effEVs     = overrides.evs     ?? selectedEnemy?.evs;
  const effIVs     = overrides.ivs     ?? selectedEnemy?.ivs;

  const computedStats = selectedEnemy && effEVs && effIVs
    ? calcAllStats(selectedEnemy.baseStats, effIVs, effEVs, selectedEnemy.level, effNature)
    : null;

  return (
    <div className="panel enemy-panel">
      {/* Header with mode toggles */}
      <div className="enemy-panel-header">
        <span className="panel-title">
          Enemy Trainer
          <span className="badge-hard">HARD MODE</span>
        </span>
        <div className="mode-toggles">
          <button
            className={`toggle-btn ${state.expertMode ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_EXPERT_MODE' })}
            title="Expert mode: use competitive spreads for gym leaders & E4"
          >
            Expert
          </button>
          <button
            className={`toggle-btn ${state.hideRematches ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_HIDE_REMATCHES' })}
            title="Hide rematch versions of trainers"
          >
            Hide Rematches
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="field-group">
        <input
          className="pif-input"
          placeholder="Search trainer by name or class…"
          value={state.trainerSearch}
          onChange={e => dispatch({ type: 'SET_TRAINER_SEARCH', text: e.target.value })}
        />
      </div>

      {/* Trainer list */}
      {loading ? (
        <div className="loading-msg">Loading trainer data…</div>
      ) : (
        <div className="trainer-list">
          {filteredTrainers.map(t => {
            const ttier = getTrainerTier(t.trainer_type);
            return (
              <button
                key={t.id_number}
                className={`trainer-list-item ${state.selectedTrainer?.id_number === t.id_number ? 'active' : ''} ${ttier === 'elite' ? 'trainer-elite' : ''}`}
                onClick={() => selectTrainer(t)}
              >
                <span className="trainer-name">{t.real_name}</span>
                <span className="trainer-class">{t.trainer_type.replace(/_/g, ' ')}</span>
                <span className="trainer-count">({t.pokemon.length})</span>
              </button>
            );
          })}
          {filteredTrainers.length === 0 && <div className="empty-msg">No trainers found.</div>}
        </div>
      )}

      {/* Team grid */}
      {state.selectedTrainer && (
        <>
          <div className="section-divider" />
          <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {state.selectedTrainer.real_name}'s Team
            {tier === 'elite' && <span className="badge-elite">ELITE</span>}
            <button
              className="link-btn"
              style={{ marginLeft: 'auto', fontSize: '0.7rem' }}
              onClick={() => dispatch({ type: 'SET_TRAINER', trainer: null })}
            >Change</button>
          </h3>
          <div className="enemy-team-grid">
            {state.selectedTrainer.pokemon.map((tp, i) => (
              <TrainerPokemonCard
                key={i}
                resolved={state.resolvedEnemyTeam[i] ?? null}
                isSelected={state.selectedEnemyIndex === i}
                onClick={() => dispatch({ type: 'SET_ENEMY_INDEX', index: i })}
              />
            ))}
          </div>
        </>
      )}

      {/* ─── Selected Pokemon detail (Smogon-style) ─── */}
      {selectedEnemy && (
        <>
          <div className="section-divider" />

          {/* Name + level + types */}
          <div className="smogon-poke-header">
            <div>
              <h3 className="smogon-poke-name">{selectedEnemy.displayName}</h3>
              <span className="smogon-poke-level">Lv. {selectedEnemy.level}</span>
            </div>
            <div className="enemy-poke-types">
              {selectedEnemy.types.map(t => <TypeBadge key={t} type={t.toUpperCase()} />)}
            </div>
          </div>

          {/* Ability */}
          <div className="smogon-field-row">
            <label className="field-label">Ability</label>
            {selectedEnemy.availableAbilities.length > 0 ? (
              <select
                className="pif-select"
                value={effAbility}
                onChange={e => setOverrides(o => ({ ...o, ability: e.target.value }))}
                title={selectedEnemy.abilityDescription}
              >
                {selectedEnemy.availableAbilities.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <input
                className="pif-input pif-input--sm"
                value={effAbility}
                onChange={e => setOverrides(o => ({ ...o, ability: e.target.value }))}
              />
            )}
          </div>
          {selectedEnemy.abilityDescription && (
            <p className="detail-description">{selectedEnemy.abilityDescription}</p>
          )}

          {/* Item */}
          <div className="smogon-field-row">
            <label className="field-label">Item</label>
            <input
              className="pif-input pif-input--sm"
              value={effItem}
              onChange={e => setOverrides(o => ({ ...o, item: e.target.value }))}
              placeholder="Item…"
            />
          </div>
          {selectedEnemy.itemDescription && effItem === (selectedEnemy.itemName || selectedEnemy.item) && (
            <p className="detail-description">{selectedEnemy.itemDescription}</p>
          )}

          {/* Nature */}
          <div className="smogon-field-row">
            <label className="field-label">Nature</label>
            <select
              className="pif-select"
              value={effNature}
              onChange={e => setOverrides(o => ({ ...o, nature: e.target.value }))}
            >
              {NATURES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* EVs */}
          <div className="editor-section">
            <div className="editor-section-header">
              <span className="field-label">EVs</span>
              <button className="link-btn" onClick={() => setOverrides(o => ({ ...o, evs: undefined }))}>Reset</button>
            </div>
            <div className="stat-inputs-grid">
              {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
                <StatInputRow
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={effEVs?.[stat] ?? 0}
                  max={252}
                  onChange={v => setOverrides(o => ({
                    ...o,
                    evs: { ...(o.evs ?? selectedEnemy.evs), [stat]: v },
                  }))}
                />
              ))}
            </div>
          </div>

          {/* IVs */}
          <div className="editor-section">
            <div className="editor-section-header">
              <span className="field-label">IVs</span>
              <button className="link-btn" onClick={() => setOverrides(o => ({ ...o, ivs: undefined }))}>Reset</button>
            </div>
            <div className="stat-inputs-grid">
              {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
                <StatInputRow
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={effIVs?.[stat] ?? 31}
                  max={31}
                  onChange={v => setOverrides(o => ({
                    ...o,
                    ivs: { ...(o.ivs ?? selectedEnemy.ivs), [stat]: v },
                  }))}
                />
              ))}
            </div>
          </div>

          {/* Stat bars + computed HP */}
          <StatBar
            baseStats={selectedEnemy.baseStats}
            actualStats={computedStats ?? undefined}
            nature={effNature}
            compact
          />
          {computedStats && (
            <div className="hp-display">
              <span className="field-label">HP</span>
              <span className="hp-value">{computedStats.hp}</span>
              <span className="hp-label">max HP</span>
            </div>
          )}

          {/* Moves */}
          {selectedEnemy.moves.length > 0 && (
            <div className="enemy-moves-section">
              <span className="field-label">Moves</span>
              <div className="enemy-moves">
                {selectedEnemy.moves.map((m, i) => (
                  <span key={i} className="enemy-move-tag">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Reverse damage */}
          {reverseResults.length > 0 && (
            <div className="damage-section reverse-damage-section">
              <h4 className="section-title">
                {selectedEnemy.displayName} → {state.players[state.activePlayerTab].name}
              </h4>
              {reverseResults.map(r => (
                <DamageRow key={r.moveId} result={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

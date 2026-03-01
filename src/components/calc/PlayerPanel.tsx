/**
 * Left panel — the player's active Pokemon + damage output.
 * Three tabs for the three soul-linked players.
 */
import { useState, useEffect, useRef } from 'react';
import { useAppState } from '../../context/AppContext';
import { loadSpecies, loadMoves, getMoveById } from '../../data/loaders';
import { calcFusionStats, calcFusionTypes, pifToSmogonStats, calcAllStats } from '../../data/fusionCalc';
import { runCalc } from '../../data/smogonBridge';
import type {
  PlayerPokemon,
  PifSpeciesData,
  SmogonStatSet,
  MoveCalcResult,
  SpeciesId,
} from '../../types/game';
import { isFusion, DEFAULT_IVS, DEFAULT_EVS, NATURES, STAT_LABELS } from '../../types/game';
import TypeBadge from '../common/TypeBadge';
import StatBar from '../common/StatBar';

// ---------------------------------------------------------------------------
// Effectiveness badge
// ---------------------------------------------------------------------------

function EffLabel({ eff }: { eff: number }) {
  if (eff === 0) return <span className="eff-label eff-immune">Immune</span>;
  if (eff >= 4) return <span className="eff-label eff-super2">4×</span>;
  if (eff >= 2) return <span className="eff-label eff-super">SE</span>;
  if (eff <= 0.25) return <span className="eff-label eff-resist2">¼×</span>;
  if (eff <= 0.5) return <span className="eff-label eff-resist">NVE</span>;
  return null;
}

// ---------------------------------------------------------------------------
// Species search combobox
// ---------------------------------------------------------------------------

function SpeciesSearch({
  value,
  onSelect,
  placeholder,
}: {
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PifSpeciesData[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }
    loadSpecies().then(({ byId }) => {
      const q = query.toLowerCase();
      const results: PifSpeciesData[] = [];
      for (const sp of byId.values()) {
        if (sp.real_name.toLowerCase().includes(q) || sp.id.toLowerCase().includes(q)) {
          results.push(sp);
          if (results.length >= 20) break;
        }
      }
      setSuggestions(results.sort((a, b) => a.real_name.localeCompare(b.real_name)));
    });
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="species-search" ref={ref}>
      <input
        className="pif-input"
        placeholder={placeholder ?? 'Search Pokemon…'}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <ul className="species-dropdown">
          {suggestions.map(sp => (
            <li
              key={sp.id}
              className="species-dropdown-item"
              onMouseDown={() => {
                onSelect(sp.id);
                setQuery(sp.real_name);
                setOpen(false);
              }}
            >
              {sp.real_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move search combobox
// ---------------------------------------------------------------------------

function MoveSearch({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) { setQuery(''); return; }
    getMoveById(value).then(m => {
      if (m) setQuery(m.real_name);
    });
  }, [value]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSuggestions([]); return; }
    loadMoves().then(movesMap => {
      const q = query.toLowerCase();
      const results: { id: string; name: string }[] = [];
      for (const m of movesMap.values()) {
        if (m.real_name.toLowerCase().includes(q)) {
          results.push({ id: m.id, name: m.real_name });
          if (results.length >= 20) break;
        }
      }
      setSuggestions(results.sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="move-search" ref={ref}>
      <input
        className="pif-input pif-input--sm"
        placeholder="Move…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <ul className="species-dropdown">
          {suggestions.map(m => (
            <li
              key={m.id}
              className="species-dropdown-item"
              onMouseDown={() => {
                onSelect(m.id);
                setQuery(m.name);
                setOpen(false);
              }}
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Damage result row
// ---------------------------------------------------------------------------

function DamageRow({ result }: { result: MoveCalcResult }) {
  const isKO = result.koText.toLowerCase().includes('ohko') ||
    result.koText.toLowerCase().includes('guaranteed');
  const is2HKO = result.koText.toLowerCase().includes('2hko');
  const isSuperEff = result.effectiveness >= 2;
  const isImmune = result.effectiveness === 0;

  const catLabel = result.category === 'Physical' ? 'Phys' : result.category === 'Special' ? 'Spec' : 'Status';
  const catClass = result.category === 'Physical' ? 'cat-phys' : result.category === 'Special' ? 'cat-spec' : 'cat-status';

  return (
    <div
      className={`damage-row-enhanced ${isKO ? 'damage-ko' : is2HKO ? 'damage-2hko' : ''} ${isSuperEff ? 'eff-super-row' : isImmune ? 'eff-immune-row' : ''}`}
    >
      {/* Main row */}
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
      {/* Description row */}
      {result.moveDescription && (
        <div className="damage-row-desc" title={result.desc}>{result.moveDescription}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pokemon stat number input
// ---------------------------------------------------------------------------

function StatInput({
  label,
  value,
  onChange,
  max = 255,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="stat-input-group">
      <label className="stat-input-label">{label}</label>
      <input
        className="pif-input pif-input--stat"
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active pokemon editor
// ---------------------------------------------------------------------------

function createBlankPokemon(): PlayerPokemon {
  return {
    id: crypto.randomUUID(),
    speciesId: '',
    level: 50,
    nature: 'Hardy',
    ability: '',
    item: '',
    ivs: { ...DEFAULT_IVS },
    evs: { ...DEFAULT_EVS },
    moves: ['', '', '', ''],
  };
}

/** Auto-generate a simple competitive EV spread: 252 best offense + 252 Spe + 6 HP */
function autoGenEVs(base: SmogonStatSet): SmogonStatSet {
  if (base.atk >= base.spa) {
    return { hp: 6, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 };
  }
  return { hp: 6, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 };
}

interface PokemonEditorInlineProps {
  pokemon: PlayerPokemon;
  onChange: (p: PlayerPokemon) => void;
}

function PokemonEditorInline({ pokemon, onChange }: PokemonEditorInlineProps) {
  const [speciesData, setSpeciesData] = useState<{
    types: string[];
    baseStats: SmogonStatSet;
    displayName: string;
    abilities: string[];
  } | null>(null);
  const [headName, setHeadName] = useState('');
  const [bodyName, setBodyName] = useState('');
  const [isFusionMode, setIsFusionMode] = useState(isFusion(pokemon.speciesId));

  useEffect(() => {
    async function resolve() {
      const { byId } = await loadSpecies();
      if (isFusion(pokemon.speciesId)) {
        const head = byId.get(pokemon.speciesId.head);
        const body = byId.get(pokemon.speciesId.body);
        if (head && body) {
          const [t1, t2] = calcFusionTypes(head, body);
          setSpeciesData({
            types: t2 ? [t1, t2] : [t1],
            baseStats: calcFusionStats(head, body),
            displayName: `${head.real_name} / ${body.real_name}`,
            abilities: [
              ...(head.abilities ?? []),
              ...(head.hidden_abilities ?? []),
              ...(body.abilities ?? []),
              ...(body.hidden_abilities ?? []),
            ],
          });
          setHeadName(head.real_name);
          setBodyName(body.real_name);
        }
      } else if (typeof pokemon.speciesId === 'string' && pokemon.speciesId) {
        const sp = byId.get(pokemon.speciesId);
        if (sp) {
          setSpeciesData({
            types: sp.type2 ? [sp.type1, sp.type2] : [sp.type1],
            baseStats: pifToSmogonStats(sp.base_stats),
            displayName: sp.real_name,
            abilities: [...(sp.abilities ?? []), ...(sp.hidden_abilities ?? [])],
          });
        }
      } else {
        setSpeciesData(null);
      }
    }
    resolve();
  }, [pokemon.speciesId]);

  function patch(partial: Partial<PlayerPokemon>) {
    onChange({ ...pokemon, ...partial });
  }

  function patchIVs(stat: keyof SmogonStatSet, val: number) {
    patch({ ivs: { ...pokemon.ivs, [stat]: val } });
  }

  function patchEVs(stat: keyof SmogonStatSet, val: number) {
    patch({ evs: { ...pokemon.evs, [stat]: val } });
  }

  function setMove(idx: number, moveId: string) {
    const moves = [...pokemon.moves];
    moves[idx] = moveId;
    patch({ moves });
  }

  function handleAutoEVs() {
    if (speciesData) {
      patch({ evs: autoGenEVs(speciesData.baseStats) });
    }
  }

  const totalEVs = Object.values(pokemon.evs).reduce((a, b) => a + b, 0);

  const computedStats = speciesData
    ? calcAllStats(speciesData.baseStats, pokemon.ivs, pokemon.evs, pokemon.level, pokemon.nature)
    : null;

  return (
    <div className="pokemon-editor-inline">
      {/* Fusion toggle */}
      <div className="editor-row">
        <label className="field-label">Type</label>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${!isFusionMode ? 'active' : ''}`}
            onClick={() => {
              setIsFusionMode(false);
              patch({ speciesId: '' });
            }}
          >Single</button>
          <button
            className={`toggle-btn ${isFusionMode ? 'active' : ''}`}
            onClick={() => {
              setIsFusionMode(true);
              patch({ speciesId: { head: '', body: '' } });
            }}
          >Fusion</button>
        </div>
      </div>

      {/* Species selection */}
      {isFusionMode ? (
        <>
          <div className="editor-row">
            <label className="field-label">Head</label>
            <SpeciesSearch
              value={headName}
              placeholder="Head Pokemon…"
              onSelect={id => {
                setHeadName(id);
                const current = isFusion(pokemon.speciesId) ? pokemon.speciesId : { head: '', body: '' };
                patch({ speciesId: { ...current, head: id } });
              }}
            />
          </div>
          <div className="editor-row">
            <label className="field-label">Body</label>
            <SpeciesSearch
              value={bodyName}
              placeholder="Body Pokemon…"
              onSelect={id => {
                setBodyName(id);
                const current = isFusion(pokemon.speciesId) ? pokemon.speciesId : { head: '', body: '' };
                patch({ speciesId: { ...current, body: id } });
              }}
            />
          </div>
        </>
      ) : (
        <div className="editor-row">
          <label className="field-label">Pokemon</label>
          <SpeciesSearch
            value={typeof pokemon.speciesId === 'string' ? pokemon.speciesId : ''}
            onSelect={id => patch({ speciesId: id })}
          />
        </div>
      )}

      {/* Type badges */}
      {speciesData && (
        <div className="editor-row">
          <div className="type-row">
            {speciesData.types.map(t => <TypeBadge key={t} type={t} />)}
          </div>
        </div>
      )}

      {/* Level + Nature */}
      <div className="editor-row two-col">
        <div>
          <label className="field-label">Level</label>
          <input
            className="pif-input pif-input--sm"
            type="number"
            min={1}
            max={100}
            value={pokemon.level}
            onChange={e => patch({ level: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
        <div>
          <label className="field-label">Nature</label>
          <select
            className="pif-select"
            value={pokemon.nature}
            onChange={e => patch({ nature: e.target.value })}
          >
            {NATURES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Ability + Item */}
      <div className="editor-row two-col">
        <div>
          <label className="field-label">Ability</label>
          {speciesData && speciesData.abilities.length > 0 ? (
            <select
              className="pif-select"
              value={pokemon.ability}
              onChange={e => patch({ ability: e.target.value })}
            >
              <option value="">—</option>
              {speciesData.abilities.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          ) : (
            <input
              className="pif-input pif-input--sm"
              placeholder="Ability…"
              value={pokemon.ability}
              onChange={e => patch({ ability: e.target.value })}
            />
          )}
        </div>
        <div>
          <label className="field-label">Item</label>
          <input
            className="pif-input pif-input--sm"
            placeholder="Item…"
            value={pokemon.item}
            onChange={e => patch({ item: e.target.value })}
          />
        </div>
      </div>

      {/* EVs */}
      <div className="editor-section">
        <div className="editor-section-header">
          <span className="field-label">EVs</span>
          <span className="ev-row-right">
            <span className={`ev-total ${totalEVs > 510 ? 'over' : ''}`}>{totalEVs}/510</span>
            {speciesData && (
              <button className="link-btn" onClick={handleAutoEVs} title="Auto-generate: 252 in best attack + 252 Spe + 6 HP">
                Auto
              </button>
            )}
            <button className="link-btn" onClick={() => patch({ evs: { ...DEFAULT_EVS } })}>
              Clear
            </button>
          </span>
        </div>
        <div className="stat-inputs-grid">
          {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
            <StatInput
              key={stat}
              label={STAT_LABELS[stat]}
              value={pokemon.evs[stat]}
              onChange={v => patchEVs(stat, v)}
            />
          ))}
        </div>
      </div>

      {/* IVs */}
      <div className="editor-section">
        <div className="editor-section-header">
          <span className="field-label">IVs</span>
          <button
            className="link-btn"
            onClick={() => patch({ ivs: { ...DEFAULT_IVS } })}
          >
            Max
          </button>
        </div>
        <div className="stat-inputs-grid">
          {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
            <StatInput
              key={stat}
              label={STAT_LABELS[stat]}
              value={pokemon.ivs[stat]}
              onChange={v => patchIVs(stat, v)}
              max={31}
            />
          ))}
        </div>
      </div>

      {/* Stat bars with actual computed stats */}
      {speciesData && computedStats && (
        <div className="editor-section">
          <div className="editor-section-header">
            <span className="field-label">Stats</span>
            <span className="hp-display">
              <span className="hp-value">{computedStats.hp}</span>
              <span className="hp-label">HP</span>
            </span>
          </div>
          <StatBar
            baseStats={speciesData.baseStats}
            actualStats={computedStats}
            nature={pokemon.nature}
            compact
          />
        </div>
      )}

      {/* Moves */}
      <div className="editor-section">
        <span className="field-label">Moves</span>
        <div className="move-inputs">
          {[0, 1, 2, 3].map(i => (
            <MoveSearch
              key={i}
              value={pokemon.moves[i] ?? ''}
              onSelect={id => setMove(i, id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main PlayerPanel
// ---------------------------------------------------------------------------

export default function PlayerPanel() {
  const { state, dispatch } = useAppState();
  const tab = state.activePlayerTab;
  const player = state.players[tab];
  const activePokemon = state.activePokemon[tab];

  const [calcResults, setCalcResults] = useState<MoveCalcResult[]>([]);
  const [calcError, setCalcError] = useState('');
  const [calcLoading, setCalcLoading] = useState(false);
  const [localPokemon, setLocalPokemon] = useState<PlayerPokemon | null>(null);

  // Sync local pokemon when active pokemon changes
  useEffect(() => {
    setLocalPokemon(activePokemon ? { ...activePokemon } : null);
    setCalcResults([]);
  }, [activePokemon]);

  // Re-run calc when anything relevant changes
  useEffect(() => {
    if (!localPokemon || !state.resolvedEnemyTeam[state.selectedEnemyIndex]) {
      setCalcResults([]);
      return;
    }
    const defender = state.resolvedEnemyTeam[state.selectedEnemyIndex];
    if (!defender) return;

    setCalcLoading(true);
    setCalcError('');

    runCalc(localPokemon, defender, state.field)
      .then(results => {
        setCalcResults(results);
        setCalcLoading(false);
      })
      .catch(err => {
        setCalcError(String(err));
        setCalcLoading(false);
      });
  }, [localPokemon, state.resolvedEnemyTeam, state.selectedEnemyIndex, state.field]);

  function handlePokemonChange(p: PlayerPokemon) {
    setLocalPokemon(p);
    dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: tab, pokemon: p });
  }

  function loadFromBox(p: PlayerPokemon) {
    // When loading a Pokemon from box, also check for linked Pokemon for other players
    dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: tab, pokemon: { ...p } });

    // Load soul-linked Pokemon for other players (same linkNumber)
    if (p.linkNumber != null) {
      ([0, 1, 2] as const).forEach(i => {
        if (i === tab) return;
        const linked = state.players[i].box.find(bp => bp.linkNumber === p.linkNumber);
        if (linked) {
          dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: i, pokemon: { ...linked } });
        }
      });
    }
  }

  function newPokemon() {
    const blank = createBlankPokemon();
    dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: tab, pokemon: blank });
  }

  // Get display name for a box Pokemon
  function getBoxDisplayName(p: PlayerPokemon): string {
    if (p.nickname) return p.nickname;
    if (isFusion(p.speciesId)) {
      return `${p.speciesId.head} / ${p.speciesId.body}`;
    }
    return p.speciesId || 'Unknown';
  }

  const enemyName = state.resolvedEnemyTeam[state.selectedEnemyIndex]?.displayName;

  return (
    <div className="panel player-panel">
      {/* Player tabs */}
      <div className="player-tabs">
        {state.players.map((p, i) => (
          <button
            key={i}
            className={`player-tab ${tab === i ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_PLAYER_TAB', tab: i as 0 | 1 | 2 })}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="player-content">
        {/* Load from box */}
        {player.box.length > 0 && (
          <div className="box-picker">
            <label className="field-label">Load from Box</label>
            <div className="box-list">
              {player.box.map(p => (
                <button
                  key={p.id}
                  className={`box-pick-btn ${activePokemon?.id === p.id ? 'active' : ''}`}
                  onClick={() => loadFromBox(p)}
                  title={p.linkNumber != null ? `Soul-link #${p.linkNumber} — loads linked Pokemon for other players` : undefined}
                >
                  {getBoxDisplayName(p)}
                  {p.linkNumber != null && <span className="link-indicator">#{p.linkNumber}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New pokemon button */}
        <button className="new-poke-btn" onClick={newPokemon}>
          + New Pokemon
        </button>

        {/* Pokemon editor */}
        {localPokemon ? (
          <>
            <PokemonEditorInline
              pokemon={localPokemon}
              onChange={handlePokemonChange}
            />

            {/* Damage results */}
            <div className="damage-section">
              <h3 className="section-title">
                Damage vs. {enemyName ?? '…'}
              </h3>
              {calcLoading && <div className="loading-msg">Calculating…</div>}
              {calcError && <div className="error-msg">{calcError}</div>}
              {!calcLoading && calcResults.length === 0 && !calcError && (
                <div className="empty-msg">
                  {state.selectedTrainer
                    ? 'Select an enemy Pokemon to see damage.'
                    : 'Select a trainer on the right to begin.'}
                </div>
              )}
              {calcResults.map(r => (
                <DamageRow key={r.moveId} result={r} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-msg" style={{ marginTop: '2rem' }}>
            Load a Pokemon from your box or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}

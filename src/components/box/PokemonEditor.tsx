/**
 * Modal for creating / editing a pokemon in a player's box.
 */
import { useState, useEffect, useRef } from 'react';
import { loadSpecies, loadMoves, getMoveById } from '../../data/loaders';
import { calcFusionStats, calcFusionTypes, pifToSmogonStats } from '../../data/fusionCalc';
import type {
  PlayerPokemon,
  PifSpeciesData,
  SmogonStatSet,
} from '../../types/game';
import { isFusion, DEFAULT_IVS, DEFAULT_EVS, NATURES, STAT_LABELS } from '../../types/game';
import TypeBadge from '../common/TypeBadge';
import StatBar from '../common/StatBar';

// ---------------------------------------------------------------------------
// Species search
// ---------------------------------------------------------------------------

function SpeciesSearch({
  value,
  onSelect,
  placeholder,
}: {
  value: string;
  onSelect: (id: string, name: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PifSpeciesData[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
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
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
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
                onSelect(sp.id, sp.real_name);
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
// Move search
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
    getMoveById(value).then(m => { if (m) setQuery(m.real_name); });
  }, [value]);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
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
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="move-search" ref={ref}>
      <input
        className="pif-input"
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
// Stat input row
// ---------------------------------------------------------------------------

function StatInputRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
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
// Main PokemonEditor modal
// ---------------------------------------------------------------------------

interface Props {
  initial: PlayerPokemon | null; // null = creating new
  onSave: (p: PlayerPokemon) => void;
  onCancel: () => void;
}

export default function PokemonEditor({ initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<PlayerPokemon>(() =>
    initial
      ? { ...initial, moves: [...(initial.moves ?? ['', '', '', ''])] }
      : {
          id: crypto.randomUUID(),
          speciesId: '',
          level: 50,
          nature: 'Hardy',
          ability: '',
          item: '',
          ivs: { ...DEFAULT_IVS },
          evs: { ...DEFAULT_EVS },
          moves: ['', '', '', ''],
        }
  );

  const [isFusionMode, setIsFusionMode] = useState(isFusion(draft.speciesId));
  const [headName, setHeadName] = useState('');
  const [bodyName, setBodyName] = useState('');

  // Resolved species info
  const [speciesInfo, setSpeciesInfo] = useState<{
    types: string[];
    baseStats: SmogonStatSet;
    abilities: string[];
  } | null>(null);

  // Resolve species on mount / change
  useEffect(() => {
    async function resolve() {
      const { byId } = await loadSpecies();
      if (isFusion(draft.speciesId)) {
        const head = byId.get(draft.speciesId.head);
        const body = byId.get(draft.speciesId.body);
        if (head && body) {
          const [t1, t2] = calcFusionTypes(head, body);
          setSpeciesInfo({
            types: t2 ? [t1, t2] : [t1],
            baseStats: calcFusionStats(head, body),
            abilities: [
              ...(head.abilities ?? []),
              ...(head.hidden_abilities ?? []),
              ...(body.abilities ?? []),
              ...(body.hidden_abilities ?? []),
            ],
          });
          setHeadName(head.real_name);
          setBodyName(body.real_name);
        } else {
          setSpeciesInfo(null);
        }
      } else if (typeof draft.speciesId === 'string' && draft.speciesId) {
        const sp = byId.get(draft.speciesId);
        if (sp) {
          setSpeciesInfo({
            types: sp.type2 ? [sp.type1, sp.type2] : [sp.type1],
            baseStats: pifToSmogonStats(sp.base_stats),
            abilities: [...(sp.abilities ?? []), ...(sp.hidden_abilities ?? [])],
          });
        } else {
          setSpeciesInfo(null);
        }
      } else {
        setSpeciesInfo(null);
      }
    }
    resolve();
  }, [draft.speciesId]);

  function patch(partial: Partial<PlayerPokemon>) {
    setDraft(d => ({ ...d, ...partial }));
  }

  function setMove(idx: number, id: string) {
    const moves = [...draft.moves];
    moves[idx] = id;
    patch({ moves });
  }

  const totalEVs = Object.values(draft.evs).reduce((a, b) => a + b, 0);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">{initial ? 'Edit Pokemon' : 'New Pokemon'}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body">
          {/* Nickname + Soul Link */}
          <div className="editor-two-col">
            <div>
              <label className="field-label">Nickname (optional)</label>
              <input
                className="pif-input"
                placeholder="Nickname…"
                value={draft.nickname ?? ''}
                onChange={e => patch({ nickname: e.target.value || undefined })}
              />
            </div>
            <div>
              <label className="field-label">Soul Link # (optional)</label>
              <input
                className="pif-input"
                type="number"
                min={1}
                placeholder="e.g. 1, 2, 3…"
                value={draft.linkNumber ?? ''}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  patch({ linkNumber: isNaN(v) || v < 1 ? undefined : v });
                }}
              />
            </div>
          </div>

          {/* Fusion toggle */}
          <div className="editor-row">
            <label className="field-label">Pokemon Type</label>
            <div className="toggle-group">
              <button
                className={`toggle-btn ${!isFusionMode ? 'active' : ''}`}
                onClick={() => { setIsFusionMode(false); patch({ speciesId: '' }); }}
              >Single</button>
              <button
                className={`toggle-btn ${isFusionMode ? 'active' : ''}`}
                onClick={() => { setIsFusionMode(true); patch({ speciesId: { head: '', body: '' } }); }}
              >Fusion</button>
            </div>
          </div>

          {/* Species selection */}
          {isFusionMode ? (
            <div className="editor-two-col">
              <div>
                <label className="field-label">Head Pokemon</label>
                <SpeciesSearch
                  value={headName}
                  placeholder="Head…"
                  onSelect={(id, name) => {
                    setHeadName(name);
                    const cur = isFusion(draft.speciesId) ? draft.speciesId : { head: '', body: '' };
                    patch({ speciesId: { ...cur, head: id } });
                  }}
                />
              </div>
              <div>
                <label className="field-label">Body Pokemon</label>
                <SpeciesSearch
                  value={bodyName}
                  placeholder="Body…"
                  onSelect={(id, name) => {
                    setBodyName(name);
                    const cur = isFusion(draft.speciesId) ? draft.speciesId : { head: '', body: '' };
                    patch({ speciesId: { ...cur, body: id } });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="editor-row">
              <label className="field-label">Pokemon</label>
              <SpeciesSearch
                value={typeof draft.speciesId === 'string' ? draft.speciesId : ''}
                onSelect={(id, _name) => patch({ speciesId: id })}
              />
            </div>
          )}

          {/* Type badges */}
          {speciesInfo && (
            <div className="editor-row">
              <div className="type-row">
                {speciesInfo.types.map(t => <TypeBadge key={t} type={t} />)}
              </div>
            </div>
          )}

          {/* Level + Nature */}
          <div className="editor-two-col">
            <div>
              <label className="field-label">Level</label>
              <input
                className="pif-input"
                type="number" min={1} max={100}
                value={draft.level}
                onChange={e => patch({ level: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </div>
            <div>
              <label className="field-label">Nature</label>
              <select
                className="pif-select"
                value={draft.nature}
                onChange={e => patch({ nature: e.target.value })}
              >
                {NATURES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Ability + Item */}
          <div className="editor-two-col">
            <div>
              <label className="field-label">Ability</label>
              {speciesInfo && speciesInfo.abilities.length > 0 ? (
                <select
                  className="pif-select"
                  value={draft.ability}
                  onChange={e => patch({ ability: e.target.value })}
                >
                  <option value="">—</option>
                  {speciesInfo.abilities.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="pif-input"
                  placeholder="Ability…"
                  value={draft.ability}
                  onChange={e => patch({ ability: e.target.value })}
                />
              )}
            </div>
            <div>
              <label className="field-label">Item</label>
              <input
                className="pif-input"
                placeholder="Item…"
                value={draft.item}
                onChange={e => patch({ item: e.target.value })}
              />
            </div>
          </div>

          {/* Moves */}
          <div className="editor-section">
            <label className="field-label">Moves</label>
            <div className="move-inputs">
              {[0, 1, 2, 3].map(i => (
                <MoveSearch
                  key={i}
                  value={draft.moves[i] ?? ''}
                  onSelect={id => setMove(i, id)}
                />
              ))}
            </div>
          </div>

          {/* Stat bars */}
          {speciesInfo && (
            <div className="editor-section">
              <label className="field-label">Base Stats</label>
              <StatBar baseStats={speciesInfo.baseStats} />
            </div>
          )}

          {/* EVs */}
          <div className="editor-section">
            <div className="editor-section-header">
              <span className="field-label">EVs</span>
              <span className={`ev-total ${totalEVs > 510 ? 'over' : ''}`}>{totalEVs}/510</span>
              <button className="link-btn" onClick={() => patch({ evs: { ...DEFAULT_EVS } })}>Clear</button>
            </div>
            <div className="stat-inputs-grid">
              {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
                <StatInputRow
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={draft.evs[stat]}
                  max={252}
                  onChange={v => patch({ evs: { ...draft.evs, [stat]: v } })}
                />
              ))}
            </div>
          </div>

          {/* IVs */}
          <div className="editor-section">
            <div className="editor-section-header">
              <span className="field-label">IVs</span>
              <button className="link-btn" onClick={() => patch({ ivs: { ...DEFAULT_IVS } })}>Max All</button>
            </div>
            <div className="stat-inputs-grid">
              {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
                <StatInputRow
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={draft.ivs[stat]}
                  max={31}
                  onChange={v => patch({ ivs: { ...draft.ivs, [stat]: v } })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(draft)}
          >
            Save Pokemon
          </button>
        </div>
      </div>
    </div>
  );
}

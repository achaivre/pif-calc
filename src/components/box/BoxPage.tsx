/**
 * Box management page — build, import, and export each player's box.
 * Also handles save file import from PIF .rxdata files via backend.
 */
import { useState, useRef, useEffect } from 'react';
import { useAppState } from '../../context/AppContext';
import {
  exportPlayerJSON,
  importPlayerJSON,
  downloadJSON,
  readJSONFile,
  saveBackendUrl,
  loadBackendUrl,
} from '../../storage/localStorage';
import type { PlayerPokemon, SmogonStatSet, SpeciesId } from '../../types/game';
import { isFusion, NATURES } from '../../types/game';
import type { PifSpeciesData } from '../../types/game';
import PokemonEditor from './PokemonEditor';
import TypeBadge from '../common/TypeBadge';
import { loadSpecies } from '../../data/loaders';
import { calcFusionTypes } from '../../data/fusionCalc';
import PokemonInfoModal from './PokemonInfoModal';

// ---------------------------------------------------------------------------
// Save file import helpers
// ---------------------------------------------------------------------------

interface RawSavePokemon {
  species: string;
  nickname: string | null;
  level: number;
  nature: string | null;
  ability: string | null;
  item: string | null;
  moves: string[];
  evs: Record<string, number>;
  ivs: Record<string, number>;
  is_fusion: boolean;
  fusion_body: number | null;
  fusion_head: number | null;
}

interface SaveResponse {
  trainer_name: string;
  party: RawSavePokemon[];
  boxes: RawSavePokemon[];
}

function parseNature(n: string | null | undefined): string {
  if (!n) return 'Hardy';
  const idx = parseInt(n);
  if (!isNaN(idx) && idx >= 0 && idx < NATURES.length) return NATURES[idx];
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function convertSavePokemon(
  raw: RawSavePokemon,
  byNum: Map<number, PifSpeciesData>
): PlayerPokemon | null {
  let speciesId: SpeciesId;

  if (raw.is_fusion && raw.fusion_body != null && raw.fusion_head != null) {
    const body = byNum.get(raw.fusion_body);
    const head = byNum.get(raw.fusion_head);
    if (!body || !head) return null;
    speciesId = { body: body.id, head: head.id };
  } else if (raw.species && !raw.is_fusion) {
    speciesId = raw.species;
  } else {
    return null;
  }

  const ev = raw.evs ?? {};
  const iv = raw.ivs ?? {};

  const evs: SmogonStatSet = {
    hp: ev.HP ?? 0, atk: ev.ATTACK ?? 0, def: ev.DEFENSE ?? 0,
    spa: ev.SPECIAL_ATTACK ?? 0, spd: ev.SPECIAL_DEFENSE ?? 0, spe: ev.SPEED ?? 0,
  };
  const ivs: SmogonStatSet = {
    hp: iv.HP ?? 31, atk: iv.ATTACK ?? 31, def: iv.DEFENSE ?? 31,
    spa: iv.SPECIAL_ATTACK ?? 31, spd: iv.SPECIAL_DEFENSE ?? 31, spe: iv.SPEED ?? 31,
  };

  // Auto link: first number in nickname (e.g. "Pikachu3" → linkNumber 3)
  const linkMatch = raw.nickname?.match(/\d+/);
  const linkNumber = linkMatch ? parseInt(linkMatch[0]) : undefined;

  return {
    id: crypto.randomUUID(),
    nickname: raw.nickname ?? undefined,
    speciesId,
    level: raw.level ?? 1,
    nature: parseNature(raw.nature),
    ability: raw.ability ?? '',
    item: raw.item ?? '',
    ivs,
    evs,
    moves: (raw.moves ?? []).slice(0, 4),
    linkNumber,
  };
}

// ---------------------------------------------------------------------------
// Pokemon card in the box grid
// ---------------------------------------------------------------------------

interface ResolvedCard {
  displayName: string;
  types: string[];
}

function BoxCard({
  pokemon,
  isInParty,
  partyFull,
  onEdit,
  onDelete,
  onLoad,
  onSwap,
  onToggleParty,
  onInfo,
}: {
  pokemon: PlayerPokemon;
  isInParty: boolean;
  partyFull: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLoad: () => void;
  onSwap?: () => void;
  onToggleParty: () => void;
  onInfo: () => void;
}) {
  const [resolved, setResolved] = useState<ResolvedCard | null>(null);

  useEffect(() => {
    async function resolve() {
      const { byId } = await loadSpecies();
      if (isFusion(pokemon.speciesId)) {
        const head = byId.get(pokemon.speciesId.head);
        const body = byId.get(pokemon.speciesId.body);
        if (head && body) {
          const [t1, t2] = calcFusionTypes(head, body);
          setResolved({
            displayName: `${head.real_name} / ${body.real_name}`,
            types: t2 ? [t1, t2] : [t1],
          });
        }
      } else if (typeof pokemon.speciesId === 'string' && pokemon.speciesId) {
        const sp = byId.get(pokemon.speciesId);
        if (sp) {
          setResolved({
            displayName: sp.real_name,
            types: sp.type2 ? [sp.type1, sp.type2] : [sp.type1],
          });
        }
      }
    }
    resolve();
  }, [pokemon.speciesId]);

  const displayName = pokemon.nickname ?? resolved?.displayName ?? (
    isFusion(pokemon.speciesId)
      ? `${pokemon.speciesId.head} / ${pokemon.speciesId.body}`
      : pokemon.speciesId || 'Unknown'
  );

  const canParty = isInParty || !partyFull;

  return (
    <div className="box-card">
      <div className="box-card-header">
        <div className="box-card-name">{displayName}</div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {pokemon.linkNumber != null && (
            <span className="box-card-link">#{pokemon.linkNumber}</span>
          )}
          <button
            className={`box-card-party-btn ${isInParty ? 'in-party' : ''}`}
            onClick={onToggleParty}
            title={isInParty ? 'Remove from party' : partyFull ? 'Party full (6/6)' : 'Add to party'}
            disabled={!canParty}
          >★</button>
        </div>
      </div>
      <div className="box-card-level">Lv. {pokemon.level}</div>
      {resolved && (
        <div className="box-card-types">
          {resolved.types.map(t => <TypeBadge key={t} type={t} small />)}
        </div>
      )}
      <div className="box-card-nature">{pokemon.nature}</div>
      <div className="box-card-actions">
        <button className="btn btn-sm" onClick={onLoad} title="Load into calc">⚔</button>
        <button className="btn btn-sm" onClick={onInfo} title="Info">ℹ</button>
        {isFusion(pokemon.speciesId) && (
          <button className="btn btn-sm" onClick={onSwap} title="Swap head/body">⇄</button>
        )}
        <button className="btn btn-sm" onClick={onEdit} title="Edit">✏</button>
        <button className="btn btn-sm btn-danger" onClick={onDelete} title="Delete">🗑</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Box for a single player
// ---------------------------------------------------------------------------

function PlayerBox({
  playerIdx,
  backendUrl,
}: {
  playerIdx: 0 | 1 | 2;
  backendUrl: string;
}) {
  const { state, dispatch } = useAppState();
  const player = state.players[playerIdx];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveFileRef = useRef<HTMLInputElement>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPokemon, setEditingPokemon] = useState<PlayerPokemon | null>(null);
  const [importError, setImportError] = useState('');
  const [playerNameEditing, setPlayerNameEditing] = useState(false);
  const [playerNameDraft, setPlayerNameDraft] = useState(player.name);
  const [infoTarget, setInfoTarget] = useState<PlayerPokemon | null>(null);
  const [saveImporting, setSaveImporting] = useState(false);
  const [saveImportMsg, setSaveImportMsg] = useState('');
  const [saveImportError, setSaveImportError] = useState('');
  const [saveHistory, setSaveHistory] = useState<Array<{id: string; label: string; trainer_name: string; pokemon_count: number}>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [setLevelInput, setSetLevelInput] = useState('50');

  // Party helpers
  const party = state.parties[playerIdx];
  const partyIds = new Set(party.filter((id): id is string => id !== null));
  const partyFull = partyIds.size >= 6;

  function toggleParty(p: PlayerPokemon) {
    if (partyIds.has(p.id)) {
      const slotIdx = party.findIndex(id => id === p.id);
      if (slotIdx >= 0) {
        dispatch({ type: 'SET_PARTY_SLOT', playerIdx, slotIdx: slotIdx as 0|1|2|3|4|5, pokemonId: null });
      }
    } else {
      const emptySlot = party.findIndex(id => id === null);
      if (emptySlot >= 0) {
        dispatch({ type: 'SET_PARTY_SLOT', playerIdx, slotIdx: emptySlot as 0|1|2|3|4|5, pokemonId: p.id });
      }
    }
  }

  function handleSwap(p: PlayerPokemon) {
    if (!isFusion(p.speciesId)) return;
    dispatch({
      type: 'UPDATE_POKEMON_IN_BOX',
      playerIdx,
      pokemon: { ...p, speciesId: { head: p.speciesId.body, body: p.speciesId.head } },
    });
  }

  function openNewEditor() {
    setEditingPokemon(null);
    setEditorOpen(true);
  }

  function openEditEditor(p: PlayerPokemon) {
    setEditingPokemon(p);
    setEditorOpen(true);
  }

  function handleSave(p: PlayerPokemon) {
    if (editingPokemon) {
      dispatch({ type: 'UPDATE_POKEMON_IN_BOX', playerIdx, pokemon: p });
    } else {
      dispatch({ type: 'ADD_POKEMON_TO_BOX', playerIdx, pokemon: p });
    }
    setEditorOpen(false);
  }

  function handleDelete(pokemonId: string) {
    if (confirm('Remove this Pokemon from the box?')) {
      dispatch({ type: 'REMOVE_POKEMON_FROM_BOX', playerIdx, pokemonId });
    }
  }

  function handleClearBox() {
    if (player.box.length === 0) return;
    if (confirm(`Clear all ${player.box.length} Pokemon from ${player.name}'s box? This cannot be undone.`)) {
      dispatch({ type: 'SET_PLAYER_DATA', playerIdx, data: { ...player, box: [] } });
    }
  }

  function handleSetAllLevels() {
    const lvl = parseInt(setLevelInput);
    if (isNaN(lvl) || lvl < 1 || lvl > 100) return;
    const updated = player.box.map(p => ({ ...p, level: lvl }));
    dispatch({ type: 'SET_PLAYER_DATA', playerIdx, data: { ...player, box: updated } });
  }

  function handleEvolve(p: PlayerPokemon, newSpeciesId: SpeciesId) {
    dispatch({ type: 'UPDATE_POKEMON_IN_BOX', playerIdx, pokemon: { ...p, speciesId: newSpeciesId } });
  }

  function handleLoadIntoCalc(p: PlayerPokemon) {
    dispatch({ type: 'SET_ACTIVE_PLAYER_TAB', tab: playerIdx });
    dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx, pokemon: { ...p } });
    dispatch({ type: 'SET_PAGE', page: 'calc' });
    if (p.linkNumber != null) {
      ([0, 1, 2] as const).forEach(i => {
        if (i === playerIdx) return;
        const linked = state.players[i].box.find(bp => bp.linkNumber === p.linkNumber);
        if (linked) dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: i, pokemon: { ...linked } });
      });
    }
  }

  function handleExport() {
    const json = exportPlayerJSON(player);
    downloadJSON(`${player.name.replace(/\s+/g, '_')}_box.json`, json);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportError('');
      const json = await readJSONFile(file);
      const imported = importPlayerJSON(json);
      dispatch({ type: 'SET_PLAYER_DATA', playerIdx, data: imported });
    } catch (err) {
      setImportError(String(err));
    }
    e.target.value = '';
  }

  async function fetchSaveHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/saves/${encodeURIComponent(player.name)}`);
      if (res.ok) setSaveHistory(await res.json());
      else setSaveHistory([]);
    } catch { setSaveHistory([]); }
    finally { setHistoryLoading(false); }
  }

  // Auto-refresh history whenever the dropdown opens or player changes
  useEffect(() => {
    if (historyOpen) fetchSaveHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, player.name]);

  async function applySaveData(data: SaveResponse, sourceName: string) {
    const { byNum } = await loadSpecies();
    const allRaw = [...(data.party ?? []), ...(data.boxes ?? [])];
    let added = 0;
    for (const raw of allRaw) {
      const converted = convertSavePokemon(raw, byNum);
      if (converted) {
        dispatch({ type: 'ADD_POKEMON_TO_BOX', playerIdx, pokemon: converted });
        added++;
      }
    }
    setSaveImportMsg(`Imported ${added} Pokemon from ${sourceName}`);
  }

  async function handleSaveImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveImporting(true);
    setSaveImportMsg('');
    setSaveImportError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `${backendUrl}/api/parse-save?player_name=${encodeURIComponent(player.name)}`,
        { method: 'POST', body: formData }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as SaveResponse;
      await applySaveData(data, data.trainer_name ?? 'save');
      fetchSaveHistory(); // refresh history list
    } catch (err) {
      setSaveImportError(`Import failed: ${String(err)}`);
    } finally {
      setSaveImporting(false);
      e.target.value = '';
    }
  }

  async function handleLoadPreviousSave(saveId: string, label: string) {
    setSaveImporting(true);
    setSaveImportMsg('');
    setSaveImportError('');
    try {
      const res = await fetch(`${backendUrl}/api/saves/${encodeURIComponent(player.name)}/${encodeURIComponent(saveId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SaveResponse;
      await applySaveData(data, label);
      setHistoryOpen(false);
    } catch (err) {
      setSaveImportError(`Load failed: ${String(err)}`);
    } finally {
      setSaveImporting(false);
    }
  }

  function saveName() {
    dispatch({ type: 'RENAME_PLAYER', playerIdx, name: playerNameDraft });
    setPlayerNameEditing(false);
  }

  return (
    <div className="player-box">
      {/* Player header */}
      <div className="player-box-header">
        {playerNameEditing ? (
          <div className="name-edit-row">
            <input
              className="pif-input pif-input--sm"
              value={playerNameDraft}
              onChange={e => setPlayerNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setPlayerNameEditing(false); }}
              autoFocus
            />
            <button className="btn btn-sm btn-primary" onClick={saveName}>Save</button>
            <button className="btn btn-sm" onClick={() => setPlayerNameEditing(false)}>Cancel</button>
          </div>
        ) : (
          <h3 className="player-box-name" onClick={() => { setPlayerNameDraft(player.name); setPlayerNameEditing(true); }}>
            {player.name} <span className="edit-hint">✏</span>
          </h3>
        )}

        <div className="box-actions">
          <button className="btn btn-sm" onClick={handleExport}>Export JSON</button>
          <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => saveFileRef.current?.click()}
            disabled={saveImporting}
            title="Import Pokemon from a PIF save file (.rxdata) — requires backend running"
          >
            {saveImporting ? 'Importing…' : 'Import Save'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setHistoryOpen(o => !o)}
            title="Load a previously imported save"
          >
            {historyOpen ? '▾' : '▸'} History
          </button>
          {player.box.length > 0 && (
            <>
              <div className="set-level-row">
                <span className="field-label" style={{ fontSize: '0.7rem' }}>Set all to Lv.</span>
                <input
                  className="pif-input pif-input--sm"
                  style={{ width: 44, textAlign: 'center' }}
                  type="number"
                  min={1}
                  max={100}
                  value={setLevelInput}
                  onChange={e => setSetLevelInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSetAllLevels(); }}
                />
                <button className="btn btn-sm btn-primary" onClick={handleSetAllLevels}>Go</button>
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={handleClearBox}
                title="Remove all Pokemon from this box"
              >
                Clear Box
              </button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          <input ref={saveFileRef} type="file" accept=".rxdata" style={{ display: 'none' }} onChange={handleSaveImport} />
        </div>
      </div>

      {importError && <div className="error-msg">{importError}</div>}
      {saveImportMsg && <div className="save-import-msg save-import-success">{saveImportMsg}</div>}
      {saveImportError && <div className="save-import-msg save-import-error">{saveImportError}</div>}

      {historyOpen && (
        <div className="save-history">
          {historyLoading ? (
            <div className="save-history-empty">Loading…</div>
          ) : saveHistory.length === 0 ? (
            <div className="save-history-empty">No previous imports found for {player.name}.</div>
          ) : (
            saveHistory.map(entry => (
              <button
                key={entry.id}
                className="save-history-item"
                onClick={() => handleLoadPreviousSave(entry.id, entry.label)}
                disabled={saveImporting}
              >
                <span className="save-history-date">{entry.label}</span>
                <span className="save-history-meta">{entry.trainer_name} · {entry.pokemon_count} Pokémon</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Pokemon grid */}
      <div className="box-grid">
        {player.box.map(p => (
          <BoxCard
            key={p.id}
            pokemon={p}
            isInParty={partyIds.has(p.id)}
            partyFull={partyFull}
            onEdit={() => openEditEditor(p)}
            onDelete={() => handleDelete(p.id)}
            onLoad={() => handleLoadIntoCalc(p)}
            onSwap={isFusion(p.speciesId) ? () => handleSwap(p) : undefined}
            onToggleParty={() => toggleParty(p)}
            onInfo={() => setInfoTarget(p)}
          />
        ))}
        <button className="box-add-btn" onClick={openNewEditor}>
          + Add Pokemon
        </button>
      </div>

      {editorOpen && (
        <PokemonEditor
          initial={editingPokemon}
          onSave={handleSave}
          onCancel={() => setEditorOpen(false)}
        />
      )}

      {infoTarget && (
        <PokemonInfoModal
          pokemon={infoTarget}
          onClose={() => setInfoTarget(null)}
          onEvolve={(newSpeciesId) => {
            handleEvolve(infoTarget, newSpeciesId);
            setInfoTarget({ ...infoTarget, speciesId: newSpeciesId });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main BoxPage
// ---------------------------------------------------------------------------

export default function BoxPage() {
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);
  const { state } = useAppState();
  const [backendUrl, setBackendUrl] = useState(() => loadBackendUrl());

  function handleUrlChange(url: string) {
    setBackendUrl(url);
    saveBackendUrl(url);
  }

  return (
    <div className="box-page">
      <div className="box-page-header">
        <h1 className="page-title">Pokemon Box</h1>
        <p className="page-subtitle">
          Build your box, export JSON to share. Star (★) to pin to party. Assign the same Soul Link # to link Pokemon across players.
        </p>
      </div>

      {/* Backend connection settings */}
      <div className="backend-settings">
        <span className="field-label">Backend URL</span>
        <input
          className="pif-input backend-url-input"
          value={backendUrl}
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="http://localhost:5000"
          spellCheck={false}
        />
        <span className="backend-hint">Set to host's IP for multiplayer · Used by "Import Save"</span>
      </div>

      <div className="box-tabs">
        {state.players.map((p, i) => (
          <button
            key={i}
            className={`player-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i as 0 | 1 | 2)}
          >
            {p.name} ({p.box.length})
          </button>
        ))}
      </div>

      <PlayerBox playerIdx={activeTab} backendUrl={backendUrl} />
    </div>
  );
}

/**
 * Box management page — build, import, and export each player's box.
 */
import { useState, useRef } from 'react';
import { useAppState } from '../../context/AppContext';
import {
  exportPlayerJSON,
  importPlayerJSON,
  downloadJSON,
  readJSONFile,
} from '../../storage/localStorage';
import type { PlayerPokemon } from '../../types/game';
import { isFusion } from '../../types/game';
import PokemonEditor from './PokemonEditor';
import TypeBadge from '../common/TypeBadge';
import { loadSpecies } from '../../data/loaders';
import { calcFusionTypes } from '../../data/fusionCalc';
import { useEffect } from 'react';
import PokemonInfoModal from './PokemonInfoModal';

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

function PlayerBox({ playerIdx }: { playerIdx: 0 | 1 | 2 }) {
  const { state, dispatch } = useAppState();
  const player = state.players[playerIdx];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPokemon, setEditingPokemon] = useState<PlayerPokemon | null>(null);
  const [importError, setImportError] = useState('');
  const [playerNameEditing, setPlayerNameEditing] = useState(false);
  const [playerNameDraft, setPlayerNameDraft] = useState(player.name);
  const [infoTarget, setInfoTarget] = useState<PlayerPokemon | null>(null);

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
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
      </div>

      {importError && <div className="error-msg">{importError}</div>}

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

      {/* Editor modal */}
      {editorOpen && (
        <PokemonEditor
          initial={editingPokemon}
          onSave={handleSave}
          onCancel={() => setEditorOpen(false)}
        />
      )}

      {/* Info modal */}
      {infoTarget && (
        <PokemonInfoModal
          pokemon={infoTarget}
          onClose={() => setInfoTarget(null)}
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

  return (
    <div className="box-page">
      <div className="box-page-header">
        <h1 className="page-title">Pokemon Box</h1>
        <p className="page-subtitle">
          Build your box, export JSON to share. Star (★) to pin to party. Assign the same Soul Link # to link Pokemon across players.
        </p>
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

      <PlayerBox playerIdx={activeTab} />
    </div>
  );
}

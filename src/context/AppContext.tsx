/**
 * Global application state via React Context + useReducer.
 */
import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  PlayerData,
  PlayerPokemon,
  FieldConditions,
} from '../types/game';
import { DEFAULT_FIELD } from '../types/game';
import {
  savePlayers,
  loadPlayers,
  saveField,
  loadField,
} from '../storage/localStorage';
import type { PifTrainerData } from '../types/game';
import type { ResolvedTrainerPokemon } from '../data/smogonBridge';

// ---------------------------------------------------------------------------
// Party: up to 6 pinned Pokemon per player (stored as Pokemon IDs from their box)
// ---------------------------------------------------------------------------

export type PartySlots = [string | null, string | null, string | null, string | null, string | null, string | null];
export type AllParties = [PartySlots, PartySlots, PartySlots];

const EMPTY_PARTY: PartySlots = [null, null, null, null, null, null];

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type Page = 'calc' | 'box';

export interface AppState {
  page: Page;

  // Players
  players: [PlayerData, PlayerData, PlayerData];

  // Party: each player has up to 6 pinned Pokemon (by ID from their box)
  parties: AllParties;

  // Active player tab (0-2) on the calc page
  activePlayerTab: 0 | 1 | 2;

  // The pokemon each player has "loaded" into the calc
  activePokemon: [PlayerPokemon | null, PlayerPokemon | null, PlayerPokemon | null];

  // Field conditions
  field: FieldConditions;

  // Enemy side
  selectedTrainer: PifTrainerData | null;
  selectedEnemyIndex: number;
  resolvedEnemyTeam: ResolvedTrainerPokemon[];

  // UI state
  trainerSearch: string;
  locationFilter: string;

  // Mode toggles
  expertMode: boolean;    // use expert trainer spreads for gym leaders / E4
  hideRematches: boolean; // hide version > 0 trainer entries
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'SET_PAGE'; page: Page }
  | { type: 'SET_ACTIVE_PLAYER_TAB'; tab: 0 | 1 | 2 }
  | { type: 'SET_ACTIVE_POKEMON'; playerIdx: 0 | 1 | 2; pokemon: PlayerPokemon | null }
  | { type: 'SET_FIELD'; field: FieldConditions }
  | { type: 'UPDATE_FIELD'; patch: Partial<FieldConditions> }
  | { type: 'SET_TRAINER'; trainer: PifTrainerData | null }
  | { type: 'SET_ENEMY_INDEX'; index: number }
  | { type: 'SET_RESOLVED_ENEMY_TEAM'; team: ResolvedTrainerPokemon[] }
  | { type: 'SET_TRAINER_SEARCH'; text: string }
  | { type: 'SET_LOCATION_FILTER'; text: string }
  | { type: 'SET_PLAYER_DATA'; playerIdx: 0 | 1 | 2; data: PlayerData }
  | { type: 'ADD_POKEMON_TO_BOX'; playerIdx: 0 | 1 | 2; pokemon: PlayerPokemon }
  | { type: 'UPDATE_POKEMON_IN_BOX'; playerIdx: 0 | 1 | 2; pokemon: PlayerPokemon }
  | { type: 'REMOVE_POKEMON_FROM_BOX'; playerIdx: 0 | 1 | 2; pokemonId: string }
  | { type: 'RENAME_PLAYER'; playerIdx: 0 | 1 | 2; name: string }
  | { type: 'SET_PARTY_SLOT'; playerIdx: 0 | 1 | 2; slotIdx: 0 | 1 | 2 | 3 | 4 | 5; pokemonId: string | null }
  | { type: 'TOGGLE_EXPERT_MODE' }
  | { type: 'TOGGLE_HIDE_REMATCHES' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PAGE':
      return { ...state, page: action.page };

    case 'SET_ACTIVE_PLAYER_TAB':
      return { ...state, activePlayerTab: action.tab };

    case 'SET_ACTIVE_POKEMON': {
      const activePokemon = [...state.activePokemon] as typeof state.activePokemon;
      activePokemon[action.playerIdx] = action.pokemon;
      return { ...state, activePokemon };
    }

    case 'SET_FIELD':
      return { ...state, field: action.field };

    case 'UPDATE_FIELD':
      return { ...state, field: { ...state.field, ...action.patch } };

    case 'SET_TRAINER':
      return {
        ...state,
        selectedTrainer: action.trainer,
        selectedEnemyIndex: 0,
        resolvedEnemyTeam: [],
      };

    case 'SET_ENEMY_INDEX':
      return { ...state, selectedEnemyIndex: action.index };

    case 'SET_RESOLVED_ENEMY_TEAM':
      return { ...state, resolvedEnemyTeam: action.team };

    case 'SET_TRAINER_SEARCH':
      return { ...state, trainerSearch: action.text };

    case 'SET_LOCATION_FILTER':
      return { ...state, locationFilter: action.text };

    case 'SET_PLAYER_DATA': {
      const players = [...state.players] as typeof state.players;
      players[action.playerIdx] = action.data;
      return { ...state, players };
    }

    case 'ADD_POKEMON_TO_BOX': {
      const players = [...state.players] as typeof state.players;
      players[action.playerIdx] = {
        ...players[action.playerIdx],
        box: [...players[action.playerIdx].box, action.pokemon],
      };
      return { ...state, players };
    }

    case 'UPDATE_POKEMON_IN_BOX': {
      const players = [...state.players] as typeof state.players;
      players[action.playerIdx] = {
        ...players[action.playerIdx],
        box: players[action.playerIdx].box.map(p =>
          p.id === action.pokemon.id ? action.pokemon : p
        ),
      };
      return { ...state, players };
    }

    case 'REMOVE_POKEMON_FROM_BOX': {
      const players = [...state.players] as typeof state.players;
      players[action.playerIdx] = {
        ...players[action.playerIdx],
        box: players[action.playerIdx].box.filter(p => p.id !== action.pokemonId),
      };
      // Also clear from parties
      const parties = [...state.parties] as typeof state.parties;
      parties[action.playerIdx] = parties[action.playerIdx].map(id =>
        id === action.pokemonId ? null : id
      ) as PartySlots;
      return { ...state, players, parties };
    }

    case 'RENAME_PLAYER': {
      const players = [...state.players] as typeof state.players;
      players[action.playerIdx] = { ...players[action.playerIdx], name: action.name };
      return { ...state, players };
    }

    case 'SET_PARTY_SLOT': {
      const parties = [...state.parties] as typeof state.parties;
      const party = [...parties[action.playerIdx]] as PartySlots;
      party[action.slotIdx] = action.pokemonId;
      parties[action.playerIdx] = party;
      return { ...state, parties };
    }

    case 'TOGGLE_EXPERT_MODE':
      return {
        ...state,
        expertMode: !state.expertMode,
        // reset resolved team so it gets re-resolved with new mode
        resolvedEnemyTeam: [],
      };

    case 'TOGGLE_HIDE_REMATCHES':
      return { ...state, hideRematches: !state.hideRematches };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function getInitialState(): AppState {
  return {
    page: 'calc',
    players: loadPlayers(),
    parties: [
      [...EMPTY_PARTY] as PartySlots,
      [...EMPTY_PARTY] as PartySlots,
      [...EMPTY_PARTY] as PartySlots,
    ],
    activePlayerTab: 0,
    activePokemon: [null, null, null],
    field: loadField(),
    selectedTrainer: null,
    selectedEnemyIndex: 0,
    resolvedEnemyTeam: [],
    trainerSearch: '',
    locationFilter: '',
    expertMode: true,    // default: use expert spreads for gym leaders
    hideRematches: true, // default: hide rematch versions
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);

  useEffect(() => { savePlayers(state.players); }, [state.players]);
  useEffect(() => { saveField(state.field); }, [state.field]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used inside AppProvider');
  return ctx;
}

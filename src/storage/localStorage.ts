/**
 * LocalStorage helpers.
 * All data is keyed under "pif-calc/" to avoid conflicts.
 */
import type { PlayerData, FieldConditions } from '../types/game';
import { DEFAULT_FIELD } from '../types/game';

const PREFIX = 'pif-calc/';

function key(name: string): string {
  return PREFIX + name;
}

function save<T>(name: string, value: T): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch (e) {
    console.error(`[pif-calc] Failed to save ${name}:`, e);
  }
}

function load<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Player data (box)
// ---------------------------------------------------------------------------

const defaultPlayer = (name: string): PlayerData => ({ name, box: [] });

export function savePlayers(players: [PlayerData, PlayerData, PlayerData]): void {
  save('players', players);
}

export function loadPlayers(): [PlayerData, PlayerData, PlayerData] {
  return load<[PlayerData, PlayerData, PlayerData]>('players', [
    defaultPlayer('Alyx'),
    defaultPlayer('John'),
    defaultPlayer('Cody'),
  ]);
}

// ---------------------------------------------------------------------------
// Field conditions (persist across sessions)
// ---------------------------------------------------------------------------

export function saveField(field: FieldConditions): void {
  save('field', field);
}

export function loadField(): FieldConditions {
  return load<FieldConditions>('field', DEFAULT_FIELD);
}

// ---------------------------------------------------------------------------
// JSON export / import helpers for sharing between players
// ---------------------------------------------------------------------------

export function exportPlayerJSON(player: PlayerData): string {
  return JSON.stringify(player, null, 2);
}

export function importPlayerJSON(json: string): PlayerData {
  const parsed = JSON.parse(json) as PlayerData;
  if (!parsed.name || !Array.isArray(parsed.box)) {
    throw new Error('Invalid player JSON: missing name or box');
  }
  return parsed;
}

/** Download a JSON file in the browser */
export function downloadJSON(filename: string, data: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a JSON file from a file input event */
export async function readJSONFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

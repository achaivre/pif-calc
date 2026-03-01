import type { SmogonStatSet } from '../../types/game';
import { STAT_LABELS } from '../../types/game';

interface Props {
  baseStats: SmogonStatSet;
  actualStats?: SmogonStatSet; // computed final stats (optional)
  nature?: string;             // if provided, highlight boosted/nerfed stats
  compact?: boolean;
}

const MAX_BASE = 255;

function barColor(val: number): string {
  if (val >= 150) return '#4caf50';
  if (val >= 100) return '#8bc34a';
  if (val >= 70)  return '#ffc107';
  if (val >= 50)  return '#ff9800';
  return '#f44336';
}

const NATURE_TABLE: Record<string, { up: keyof SmogonStatSet; down: keyof SmogonStatSet }> = {
  Lonely:  { up: 'atk', down: 'def' },
  Brave:   { up: 'atk', down: 'spe' },
  Adamant: { up: 'atk', down: 'spa' },
  Naughty: { up: 'atk', down: 'spd' },
  Bold:    { up: 'def', down: 'atk' },
  Relaxed: { up: 'def', down: 'spe' },
  Impish:  { up: 'def', down: 'spa' },
  Lax:     { up: 'def', down: 'spd' },
  Timid:   { up: 'spe', down: 'atk' },
  Hasty:   { up: 'spe', down: 'def' },
  Jolly:   { up: 'spe', down: 'spa' },
  Naive:   { up: 'spe', down: 'spd' },
  Modest:  { up: 'spa', down: 'atk' },
  Mild:    { up: 'spa', down: 'def' },
  Quiet:   { up: 'spa', down: 'spe' },
  Rash:    { up: 'spa', down: 'spd' },
  Calm:    { up: 'spd', down: 'atk' },
  Gentle:  { up: 'spd', down: 'def' },
  Sassy:   { up: 'spd', down: 'spe' },
  Careful: { up: 'spd', down: 'spa' },
};

export default function StatBar({ baseStats, actualStats, nature, compact = false }: Props) {
  const stats = Object.entries(STAT_LABELS) as [keyof SmogonStatSet, string][];
  const natureEntry = nature ? NATURE_TABLE[nature] : undefined;

  return (
    <div className={`stat-table ${compact ? 'stat-table--compact' : ''}`}>
      {stats.map(([key, label]) => {
        const base = baseStats[key];
        const actual = actualStats?.[key];
        const pct = Math.min((base / MAX_BASE) * 100, 100);
        const isUp   = key !== 'hp' && natureEntry?.up === key;
        const isDown = key !== 'hp' && natureEntry?.down === key;

        return (
          <div className="stat-row" key={key}>
            <span className={`stat-label ${isUp ? 'stat-nature-up' : isDown ? 'stat-nature-down' : ''}`}>
              {label}
            </span>
            <span className="stat-base">{base}</span>
            <div className="stat-bar-bg">
              <div
                className="stat-bar-fill"
                style={{ width: `${pct}%`, backgroundColor: barColor(base) }}
              />
            </div>
            {actual != null && (
              <span className={`stat-actual ${isUp ? 'stat-nature-up' : isDown ? 'stat-nature-down' : ''}`}>
                {actual}
                {isUp && <span className="nature-arrow">▲</span>}
                {isDown && <span className="nature-arrow">▼</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

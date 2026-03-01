/**
 * Top banner — attacker damage + enemy reverse damage for all 3 players.
 */
import { useState, useEffect } from 'react';
import { useAppState } from '../../context/AppContext';
import { runCalc, runReverseCalc } from '../../data/smogonBridge';
import type { MoveCalcResult } from '../../types/game';

function EffTag({ eff }: { eff: number }) {
  if (eff === 0)    return <span className="eff-label eff-immune">0×</span>;
  if (eff >= 4)     return <span className="eff-label eff-super2">4×</span>;
  if (eff >= 2)     return <span className="eff-label eff-super">2×</span>;
  if (eff <= 0.25)  return <span className="eff-label eff-resist2">¼×</span>;
  if (eff <= 0.5)   return <span className="eff-label eff-resist">½×</span>;
  return null;
}

function BannerMoveRow({ result, dim }: { result: MoveCalcResult; dim?: boolean }) {
  const isKO  = result.koText.toLowerCase().includes('ohko') || result.koText.toLowerCase().includes('guaranteed');
  const is2HKO = result.koText.toLowerCase().includes('2hko');
  return (
    <div
      className={`banner-move-row ${isKO ? 'banner-ko' : is2HKO ? 'banner-2hko' : ''} ${dim ? 'banner-dim' : ''}`}
      title={result.desc}
    >
      <span className="banner-move-name">{result.moveName}</span>
      <EffTag eff={result.effectiveness} />
      {!result.isStatus && (
        <span className="banner-damage">{result.damageMin}–{result.damageMax}%</span>
      )}
      {result.koText && (
        <span className={`banner-ko-text ${isKO ? 'ko' : is2HKO ? 'twohko' : ''}`}>
          {result.koText}
        </span>
      )}
    </div>
  );
}

interface PlayerCalcState {
  attackResults: MoveCalcResult[];
  reverseResults: MoveCalcResult[];
  loading: boolean;
}

const EMPTY: PlayerCalcState = { attackResults: [], reverseResults: [], loading: false };

export default function DamageBanner() {
  const { state } = useAppState();
  const enemy = state.resolvedEnemyTeam[state.selectedEnemyIndex] ?? null;

  const [playerCalcs, setPlayerCalcs] = useState<[PlayerCalcState, PlayerCalcState, PlayerCalcState]>([EMPTY, EMPTY, EMPTY]);

  useEffect(() => {
    if (!enemy) {
      setPlayerCalcs([EMPTY, EMPTY, EMPTY]);
      return;
    }

    setPlayerCalcs([
      { ...EMPTY, loading: true },
      { ...EMPTY, loading: true },
      { ...EMPTY, loading: true },
    ]);

    const calcs = ([0, 1, 2] as const).map(async i => {
      const pp = state.activePokemon[i];
      if (!pp) return EMPTY;
      try {
        const [attackResults, reverseResults] = await Promise.all([
          runCalc(pp, enemy, state.field),
          enemy.moves.length > 0 ? runReverseCalc(enemy, pp, state.field) : Promise.resolve([]),
        ]);
        return { attackResults, reverseResults, loading: false };
      } catch {
        return EMPTY;
      }
    });

    Promise.all(calcs).then(results => {
      setPlayerCalcs(results as [PlayerCalcState, PlayerCalcState, PlayerCalcState]);
    });
  }, [state.activePokemon, state.resolvedEnemyTeam, state.selectedEnemyIndex, state.field, enemy]);

  if (!enemy || !state.activePokemon.some(Boolean)) return null;

  return (
    <div className="damage-banner">
      <div className="damage-banner-header">
        <span className="damage-banner-title">vs. {enemy.displayName} (Lv. {enemy.level})</span>
      </div>
      <div className="damage-banner-players">
        {([0, 1, 2] as const).map(i => {
          const pp = state.activePokemon[i];
          const calc = playerCalcs[i];
          const player = state.players[i];
          if (!pp) return null;

          const pokeName = pp.nickname ?? (
            typeof pp.speciesId === 'string'
              ? pp.speciesId
              : `${pp.speciesId.head}/${pp.speciesId.body}`
          );

          // Top 3 attacking moves by max damage
          const topAttack = [...calc.attackResults]
            .sort((a, b) => {
              if (a.isStatus && !b.isStatus) return 1;
              if (!a.isStatus && b.isStatus) return -1;
              return b.damageMax - a.damageMax;
            })
            .slice(0, 3);

          // Top 2 enemy moves by max damage
          const topReverse = [...calc.reverseResults]
            .sort((a, b) => {
              if (a.isStatus && !b.isStatus) return 1;
              if (!a.isStatus && b.isStatus) return -1;
              return b.damageMax - a.damageMax;
            })
            .slice(0, 2);

          return (
            <div
              key={i}
              className={`banner-player ${state.activePlayerTab === i ? 'banner-player-active' : ''}`}
            >
              <div className="banner-player-header">
                <span className="banner-player-name">{player.name}</span>
                <span className="banner-poke-name">{pokeName}</span>
              </div>

              {calc.loading ? <div className="banner-loading">…</div> : (
                <>
                  {/* Player → enemy */}
                  <div className="banner-section-label">Dealing:</div>
                  {topAttack.length === 0
                    ? <div className="banner-empty">No moves</div>
                    : topAttack.map(r => <BannerMoveRow key={r.moveId} result={r} />)
                  }

                  {/* Enemy → player */}
                  {topReverse.length > 0 && (
                    <>
                      <div className="banner-section-label banner-section-label--recv">Taking:</div>
                      {topReverse.map(r => <BannerMoveRow key={r.moveId} result={r} dim />)}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

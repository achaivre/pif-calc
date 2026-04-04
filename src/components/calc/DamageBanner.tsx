/**
 * Top banner — attacker damage + enemy reverse damage for all 3 players.
 */
import { useState, useEffect } from 'react';
import { useAppState } from '../../context/AppContext';
import { runCalc, runReverseCalc } from '../../data/smogonBridge';
import type { MoveCalcResult } from '../../types/game';
import { isFusion } from '../../types/game';
import { loadSpecies } from '../../data/loaders';
import { calcAllStats, calcFusionStats, pifToSmogonStats } from '../../data/fusionCalc';

function EffTag({ eff }: { eff: number }) {
  if (eff === 0)    return <span className="eff-label eff-immune">0×</span>;
  if (eff >= 4)     return <span className="eff-label eff-super2">4×</span>;
  if (eff >= 2)     return <span className="eff-label eff-super">2×</span>;
  if (eff <= 0.25)  return <span className="eff-label eff-resist2">¼×</span>;
  if (eff <= 0.5)   return <span className="eff-label eff-resist">½×</span>;
  return null;
}

// Maps move type → the berry that resists it (type-resist berries halve SE damage)
const RESIST_BERRY: Record<string, string> = {
  NORMAL: 'Chilan', FIRE: 'Occa', WATER: 'Passho', ELECTRIC: 'Wacan',
  GRASS: 'Rindo', ICE: 'Yache', FIGHTING: 'Chople', POISON: 'Kebia',
  GROUND: 'Shuca', FLYING: 'Coba', PSYCHIC: 'Payapa', BUG: 'Tanga',
  ROCK: 'Charti', GHOST: 'Kasib', DRAGON: 'Haban', DARK: 'Colbur',
  STEEL: 'Babiri', FAIRY: 'Roseli',
};

function BannerMoveRow({ result, dim, showBerry }: { result: MoveCalcResult; dim?: boolean; showBerry?: boolean }) {
  const isKO  = result.koText.toLowerCase().includes('ohko') || result.koText.toLowerCase().includes('guaranteed');
  const is2HKO = result.koText.toLowerCase().includes('2hko');
  const berryName = result.effectiveness >= 2 ? RESIST_BERRY[result.moveType] : undefined;
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
      {showBerry && berryName && !result.isStatus && (
        <span className="banner-berry" title={`${berryName} Berry halves this super-effective hit`}>
          🫐 {Math.floor(result.damageMin / 2)}–{Math.floor(result.damageMax / 2)}%
        </span>
      )}
    </div>
  );
}

interface PlayerCalcState {
  attackResults: MoveCalcResult[];
  reverseResults: MoveCalcResult[];
  loading: boolean;
  playerSpe: number | null;
  enemySpe: number | null;
}

const EMPTY: PlayerCalcState = { attackResults: [], reverseResults: [], loading: false, playerSpe: null, enemySpe: null };

export default function DamageBanner() {
  const { state } = useAppState();
  const enemy = state.resolvedEnemyTeam[state.selectedEnemyIndex] ?? null;

  const [playerCalcs, setPlayerCalcs] = useState<[PlayerCalcState, PlayerCalcState, PlayerCalcState]>([EMPTY, EMPTY, EMPTY]);
  const [showBerry, setShowBerry] = useState(false);

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

    async function run() {
    const { byId } = await loadSpecies();
    // Worst-case enemy speed: assume 252 Spe EVs + Jolly nature so "You first" is always guaranteed
    const worstCaseIVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const worstCaseEVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 252 };
    const enemySpe = calcAllStats(enemy.baseStats, worstCaseIVs, worstCaseEVs, enemy.level, 'Jolly').spe;

    const calcs = ([0, 1, 2] as const).map(async i => {
      const pp = state.activePokemon[i];
      if (!pp) return EMPTY;
      try {
        // Compute player's actual speed
        let playerSpe: number | null = null;
        if (isFusion(pp.speciesId)) {
          const head = byId.get(pp.speciesId.head);
          const body = byId.get(pp.speciesId.body);
          if (head && body) {
            const bs = calcFusionStats(head, body);
            playerSpe = calcAllStats(bs, pp.ivs, pp.evs, pp.level, pp.nature).spe;
          }
        } else if (typeof pp.speciesId === 'string') {
          const sp = byId.get(pp.speciesId);
          if (sp) {
            const bs = pifToSmogonStats(sp.base_stats);
            playerSpe = calcAllStats(bs, pp.ivs, pp.evs, pp.level, pp.nature).spe;
          }
        }

        const [attackResults, reverseResults] = await Promise.all([
          runCalc(pp, enemy, state.field),
          enemy.moves.length > 0 ? runReverseCalc(enemy, pp, state.field) : Promise.resolve([]),
        ]);
        return { attackResults, reverseResults, loading: false, playerSpe, enemySpe };
      } catch {
        return EMPTY;
      }
    });

    const results = await Promise.all(calcs);
    setPlayerCalcs(results as [PlayerCalcState, PlayerCalcState, PlayerCalcState]);
    }
    run().catch(console.error);
  }, [state.activePokemon, state.resolvedEnemyTeam, state.selectedEnemyIndex, state.field, enemy]);

  if (!enemy || !state.activePokemon.some(Boolean)) return null;

  return (
    <div className="damage-banner">
      <div className="damage-banner-header">
        <span className="damage-banner-title">vs. {enemy.displayName} (Lv. {enemy.level})</span>
        <button
          className={`btn btn-sm banner-berry-toggle ${showBerry ? 'active' : ''}`}
          onClick={() => setShowBerry(b => !b)}
          title="Toggle berry damage display (shows halved damage for super-effective hits)"
        >
          🫐 Berry
        </button>
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
              {calc.playerSpe != null && calc.enemySpe != null && (
                <div className={`banner-speed ${calc.playerSpe > calc.enemySpe ? 'speed-first' : calc.playerSpe < calc.enemySpe ? 'speed-second' : 'speed-tie'}`}>
                  {calc.playerSpe > calc.enemySpe
                    ? `▶ You first  (${calc.playerSpe} vs ${calc.enemySpe})`
                    : calc.playerSpe < calc.enemySpe
                    ? `◀ Enemy first  (${calc.playerSpe} vs ${calc.enemySpe})`
                    : `= Speed tie  (${calc.playerSpe})`}
                </div>
              )}

              {calc.loading ? <div className="banner-loading">…</div> : (
                <>
                  {/* Player → enemy */}
                  <div className="banner-section-label">Dealing:</div>
                  {topAttack.length === 0
                    ? <div className="banner-empty">No moves</div>
                    : topAttack.map(r => <BannerMoveRow key={r.moveId} result={r} showBerry={showBerry} />)
                  }

                  {/* Enemy → player */}
                  {topReverse.length > 0 && (
                    <>
                      <div className="banner-section-label banner-section-label--recv">Taking:</div>
                      {topReverse.map(r => <BannerMoveRow key={r.moveId} result={r} dim showBerry={showBerry} />)}
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

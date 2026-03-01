/**
 * Party bar — compact row at top of calc page.
 * Shows each player's pinned party (up to 6 Pokemon each).
 * Click a slot to activate that Pokemon for the player in the calc.
 */
import { useAppState } from '../../context/AppContext';
import type { PlayerPokemon } from '../../types/game';
import { isFusion } from '../../types/game';

function shortName(p: PlayerPokemon): string {
  if (p.nickname) return p.nickname;
  if (isFusion(p.speciesId)) {
    const h = p.speciesId.head.slice(0, 6);
    const b = p.speciesId.body.slice(0, 6);
    return `${h}/${b}`;
  }
  return p.speciesId || '?';
}

export default function PartyBar() {
  const { state, dispatch } = useAppState();

  function activate(playerIdx: 0 | 1 | 2, pp: PlayerPokemon) {
    dispatch({ type: 'SET_ACTIVE_PLAYER_TAB', tab: playerIdx });
    dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx, pokemon: { ...pp } });
    // Also activate soul-linked pokemon for other players
    if (pp.linkNumber != null) {
      ([0, 1, 2] as const).forEach(i => {
        if (i === playerIdx) return;
        const linked = state.players[i].box.find(b => b.linkNumber === pp.linkNumber);
        if (linked) dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: i, pokemon: { ...linked } });
      });
    }
  }

  function removeSlot(playerIdx: 0 | 1 | 2, slotIdx: 0 | 1 | 2 | 3 | 4 | 5) {
    dispatch({ type: 'SET_PARTY_SLOT', playerIdx, slotIdx, pokemonId: null });
  }

  // Only render if at least one player has a party entry
  const hasAny = state.parties.some(party => party.some(Boolean));
  if (!hasAny) return null;

  return (
    <div className="party-bar">
      {([0, 1, 2] as const).map(pi => {
        const party = state.parties[pi];
        const filledSlots = party.filter(Boolean);
        if (filledSlots.length === 0) return null;

        return (
          <div
            key={pi}
            className={`party-player-section ${state.activePlayerTab === pi ? 'party-active-player' : ''}`}
          >
            <span className="party-player-label">{state.players[pi].name}</span>
            <div className="party-slots">
              {([0, 1, 2, 3, 4, 5] as const).map(si => {
                const id = party[si];
                const pp = id ? state.players[pi].box.find(p => p.id === id) ?? null : null;
                if (!pp) return null; // skip empty slots in compact view

                const isActive = state.activePokemon[pi]?.id === pp.id;
                return (
                  <div
                    key={si}
                    className={`party-slot ${isActive ? 'party-slot-active' : ''}`}
                    onClick={() => activate(pi, pp)}
                    title={`${shortName(pp)} Lv.${pp.level}${pp.linkNumber != null ? ` (link #${pp.linkNumber})` : ''}`}
                  >
                    <span className="party-slot-name">{shortName(pp)}</span>
                    {pp.linkNumber != null && (
                      <span className="party-link-num">#{pp.linkNumber}</span>
                    )}
                    <button
                      className="party-slot-remove"
                      onClick={e => { e.stopPropagation(); removeSlot(pi, si); }}
                      title="Remove from party"
                    >×</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

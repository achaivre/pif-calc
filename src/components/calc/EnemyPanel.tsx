/**
 * Right panel — enemy trainer + Smogon-style editable Pokemon detail.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../../context/AppContext';
import { loadTrainers, loadSpecies, loadMoves, getMoveByRealName, loadAbilities, loadItems } from '../../data/loaders';
import { resolveTrainerPokemon, runReverseCalc } from '../../data/smogonBridge';
import type { EnemyOverrides } from '../../data/smogonBridge';
import type { PifTrainerData, MoveCalcResult, SmogonStatSet, PlayerPokemon, PifSpeciesData, PifMoveData } from '../../types/game';
import { STAT_LABELS, NATURES, isFusion } from '../../types/game';
import TypeBadge from '../common/TypeBadge';
import StatBar from '../common/StatBar';
import type { ResolvedTrainerPokemon } from '../../data/smogonBridge';
import { getTrainerTier } from '../../data/hardModeData';
import { calcAllStats, calcFusionStats, calcFusionTypes, pifToSmogonStats } from '../../data/fusionCalc';
import { scoreMatchup, typeEff } from '../../data/matchupCalc';
import type { EnemySnapshot } from '../../data/matchupCalc';

// ---------------------------------------------------------------------------
// Type effectiveness label
// ---------------------------------------------------------------------------

function EffLabel({ eff }: { eff: number }) {
  if (eff === 0) return <span className="eff-label eff-immune">Immune</span>;
  if (eff >= 4)  return <span className="eff-label eff-super2">4×</span>;
  if (eff >= 2)  return <span className="eff-label eff-super">SE</span>;
  if (eff <= 0.25) return <span className="eff-label eff-resist2">¼×</span>;
  if (eff <= 0.5)  return <span className="eff-label eff-resist">NVE</span>;
  return null;
}

// ---------------------------------------------------------------------------
// Damage row
// ---------------------------------------------------------------------------

function DamageRow({ result }: { result: MoveCalcResult }) {
  const isKO  = result.koText.toLowerCase().includes('ohko') || result.koText.toLowerCase().includes('guaranteed');
  const is2HKO = result.koText.toLowerCase().includes('2hko');
  const catLabel = result.category === 'Physical' ? 'Phys' : result.category === 'Special' ? 'Spec' : 'Status';
  const catClass = result.category === 'Physical' ? 'cat-phys' : result.category === 'Special' ? 'cat-spec' : 'cat-status';
  return (
    <div
      className={`damage-row-enhanced ${isKO ? 'damage-ko' : is2HKO ? 'damage-2hko' : ''} ${result.effectiveness >= 2 ? 'eff-super-row' : result.effectiveness === 0 ? 'eff-immune-row' : ''}`}
    >
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
      {result.moveDescription && (
        <div className="damage-row-desc" title={result.desc}>{result.moveDescription}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact stat input
// ---------------------------------------------------------------------------

function StatInputRow({
  label, value, max, onChange, natureModifier,
}: {
  label: string; value: number; max: number; onChange: (v: number) => void; natureModifier?: number;
}) {
  return (
    <div className="stat-input-group">
      <label className={`stat-input-label ${natureModifier && natureModifier > 1 ? 'stat-nature-up' : natureModifier && natureModifier < 1 ? 'stat-nature-down' : ''}`}>
        {label}
      </label>
      <input
        className="pif-input pif-input--stat"
        type="number" min={0} max={max} value={value}
        onChange={e => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pokemon card (compact team slot)
// ---------------------------------------------------------------------------

function TrainerPokemonCard({
  resolved, isSelected, onClick,
}: {
  resolved: ResolvedTrainerPokemon | null; isSelected: boolean; onClick: () => void;
}) {
  if (!resolved) {
    return <div className={`enemy-poke-card loading ${isSelected ? 'selected' : ''}`} onClick={onClick}>…</div>;
  }
  return (
    <div
      className={`enemy-poke-card ${isSelected ? 'selected' : ''} ${resolved.tier === 'elite' ? 'elite-poke' : ''}`}
      onClick={onClick}
    >
      <div className="enemy-poke-header">
        <span className="enemy-poke-name">{resolved.displayName}</span>
        <span className="enemy-poke-level">Lv. {resolved.level}</span>
      </div>
      <div className="enemy-poke-types">
        {resolved.types.map(t => <TypeBadge key={t} type={t.toUpperCase()} small />)}
      </div>
      {resolved.abilityName && (
        <span className="enemy-poke-ability" title={resolved.abilityDescription}>{resolved.abilityName}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boss trainer detection
// ---------------------------------------------------------------------------

// Only Kanto bosses — Johto leaders and Cynthia excluded
const BOSS_PREFIXES = ['LEADER_', 'ELITEFOUR_', 'CHAMPION', 'GIOVANNI', 'RIVAL', 'ROCKETBOSS'];

const EXCLUDED_TRAINER_TYPES = new Set([
  'LEADER_Whitney', 'LEADER_Kurt', 'LEADER_Falkner', 'LEADER_Clair',
  'LEADER_Morty', 'LEADER_Pryce', 'LEADER_Jasmine', 'LEADER_Chuck',
  'CHAMPION_Sinnoh',
]);

function isBossTrainer(t: string): boolean {
  if (EXCLUDED_TRAINER_TYPES.has(t)) return false;
  return BOSS_PREFIXES.some(p => t === p || t.startsWith(p));
}

/** Multi-encounter trainers show all versions (rivals + Giovanni as Rocket Boss) */
function isMultiEncounterTrainer(t: string): boolean {
  return t.startsWith('RIVAL') || t === 'ROCKETBOSS';
}

// ---------------------------------------------------------------------------
// Species search (for custom enemy)
// ---------------------------------------------------------------------------

function SpeciesSearchInput({
  value, onSelect, placeholder,
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
    if (!query.trim() || query.length < 2) { setSuggestions([]); return; }
    loadSpecies().then(({ byId }) => {
      const q = query.toLowerCase();
      const res: PifSpeciesData[] = [];
      for (const sp of byId.values()) {
        if (sp.real_name.toLowerCase().includes(q) || sp.id.toLowerCase().includes(q)) {
          res.push(sp);
          if (res.length >= 15) break;
        }
      }
      setSuggestions(res.sort((a, b) => a.real_name.localeCompare(b.real_name)));
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
    <div className="species-search" ref={ref} style={{ flex: 1 }}>
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
            <li key={sp.id} className="species-dropdown-item"
              onMouseDown={() => { onSelect(sp.id, sp.real_name); setQuery(sp.real_name); setOpen(false); }}
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
// Move search input (for custom enemy)
// ---------------------------------------------------------------------------

function MoveSearchInput({
  value, onSelect, onClear, placeholder,
}: {
  value: string;
  onSelect: (realName: string) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PifMoveData[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSuggestions([]); return; }
    loadMoves().then(movesMap => {
      const q = query.toLowerCase();
      const res: PifMoveData[] = [];
      for (const mv of movesMap.values()) {
        if (mv.real_name.toLowerCase().includes(q)) {
          res.push(mv);
          if (res.length >= 12) break;
        }
      }
      setSuggestions(res.sort((a, b) => a.real_name.localeCompare(b.real_name)));
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
    <div className="species-search" ref={ref} style={{ flex: 1 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <input
          className="pif-input"
          placeholder={placeholder ?? 'Search move…'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ flex: 1 }}
        />
        {value && (
          <button className="link-btn" onClick={() => { onClear(); setQuery(''); }} style={{ padding: '0 4px', fontSize: '0.8rem' }}>×</button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="species-dropdown">
          {suggestions.map(mv => (
            <li key={mv.id} className="species-dropdown-item"
              onMouseDown={() => { onSelect(mv.real_name); setQuery(mv.real_name); setOpen(false); }}
            >
              <span style={{ opacity: 0.55, fontSize: '0.65rem', marginRight: 3 }}>
                {mv.category === 0 ? 'Phys' : mv.category === 1 ? 'Spec' : 'Stat'}
              </span>
              {mv.real_name}
              {mv.base_damage > 0 && <span style={{ opacity: 0.45, fontSize: '0.65rem' }}> {mv.base_damage}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom enemy builder
// ---------------------------------------------------------------------------

const BLANK_MOVES: [string, string, string, string] = ['', '', '', ''];

function CustomEnemyBuilder({ onSet }: { onSet: (e: ResolvedTrainerPokemon) => void }) {
  const [open, setOpen] = useState(false);
  const [bodyId, setBodyId] = useState('');
  const [bodyName, setBodyName] = useState('');
  const [headId, setHeadId] = useState('');
  const [headName, setHeadName] = useState('');
  const [level, setLevel] = useState(50);
  const [abilityOptions, setAbilityOptions] = useState<string[]>([]);
  const [ability, setAbility] = useState('');
  const [item, setItem] = useState('');
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const [moves, setMoves] = useState<[string, string, string, string]>([...BLANK_MOVES]);
  const [building, setBuilding] = useState(false);

  // Close item dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) setItemOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Load abilities when species changes
  useEffect(() => {
    if (!bodyId) { setAbilityOptions([]); setAbility(''); return; }
    loadSpecies().then(async ({ byId }) => {
      const body = byId.get(bodyId);
      if (!body) return;
      const head = headId ? byId.get(headId) : null;
      const abilitiesMap = await loadAbilities();

      // Collect ability IDs from body (and head if fusion)
      const abilityIds = [...(body.abilities ?? []), ...(body.hidden_abilities ?? [])];
      if (head) abilityIds.push(...(head.abilities ?? []), ...(head.hidden_abilities ?? []));

      const names = [...new Set(abilityIds)]
        .map(id => abilitiesMap.get(id)?.real_name ?? id)
        .filter(Boolean);
      setAbilityOptions(names);
      setAbility(names[0] ?? '');
    });
  }, [bodyId, headId]);

  function handleItemSearch(q: string) {
    setItem(q);
    setItemOpen(true);
    if (!q.trim() || q.length < 2) { setItemSuggestions([]); return; }
    loadItems().then(itemsMap => {
      const ql = q.toLowerCase();
      const res: string[] = [];
      for (const it of itemsMap.values()) {
        if (it.real_name.toLowerCase().includes(ql)) {
          res.push(it.real_name);
          if (res.length >= 10) break;
        }
      }
      setItemSuggestions(res.sort());
    });
  }

  function setMove(idx: number, val: string) {
    const next = [...moves] as [string, string, string, string];
    next[idx] = val;
    setMoves(next);
  }

  async function apply() {
    if (!bodyId) return;
    setBuilding(true);
    try {
      const { byId } = await loadSpecies();
      const body = byId.get(bodyId);
      if (!body) return;

      let baseStats: SmogonStatSet;
      let types: string[];
      let displayName: string;
      let availableAbilities: string[];

      if (headId) {
        const head = byId.get(headId);
        if (!head) return;
        baseStats = calcFusionStats(head, body);
        const [t1, t2] = calcFusionTypes(head, body);
        types = t2 ? [t1, t2] : [t1];
        displayName = `${head.real_name} / ${body.real_name}`;
        availableAbilities = abilityOptions;
      } else {
        baseStats = pifToSmogonStats(body.base_stats);
        types = body.type2 ? [body.type1, body.type2] : [body.type1];
        displayName = body.real_name;
        availableAbilities = abilityOptions;
      }

      const chosenMoves = moves.filter(Boolean);
      const ivs: SmogonStatSet = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: SmogonStatSet = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

      onSet({
        displayName,
        species: bodyId,
        level,
        nature: 'Hardy',
        ability,
        abilityName: ability,
        abilityDescription: '',
        types,
        baseStats,
        ivs,
        evs,
        moves: chosenMoves,
        availableAbilities,
        itemName: item,
        item,
        itemDescription: '',
        tier: 'regular',
      });
      setOpen(false);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="custom-enemy-builder">
      <button className="matchup-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Custom Enemy Pokemon
      </button>
      {open && (
        <div className="custom-enemy-form">
          {/* Species */}
          <div className="custom-enemy-row">
            <span className="field-label" style={{ width: 40, flexShrink: 0 }}>Body</span>
            <SpeciesSearchInput value={bodyName} onSelect={(id, n) => { setBodyId(id); setBodyName(n); }} placeholder="Body species…" />
          </div>
          <div className="custom-enemy-row">
            <span className="field-label" style={{ width: 40, flexShrink: 0 }}>Head</span>
            <SpeciesSearchInput value={headName} onSelect={(id, n) => { setHeadId(id); setHeadName(n); }} placeholder="Head (optional)…" />
          </div>
          {/* Level */}
          <div className="custom-enemy-row">
            <span className="field-label" style={{ width: 40, flexShrink: 0 }}>Lv</span>
            <input className="pif-input pif-input--stat" type="number" min={1} max={100} value={level}
              onChange={e => setLevel(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
              style={{ width: 60 }}
            />
          </div>
          {/* Ability */}
          {abilityOptions.length > 0 && (
            <div className="custom-enemy-row">
              <span className="field-label" style={{ width: 40, flexShrink: 0 }}>Ability</span>
              <select className="pif-select" style={{ flex: 1 }} value={ability} onChange={e => setAbility(e.target.value)}>
                {abilityOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          {/* Item */}
          <div className="custom-enemy-row" ref={itemRef} style={{ position: 'relative' }}>
            <span className="field-label" style={{ width: 40, flexShrink: 0 }}>Item</span>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                className="pif-input"
                placeholder="Item (optional)…"
                value={item}
                onChange={e => handleItemSearch(e.target.value)}
                onFocus={() => setItemOpen(true)}
              />
              {itemOpen && itemSuggestions.length > 0 && (
                <ul className="species-dropdown">
                  {itemSuggestions.map(name => (
                    <li key={name} className="species-dropdown-item"
                      onMouseDown={() => { setItem(name); setItemSuggestions([]); setItemOpen(false); }}
                    >{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {/* Moves */}
          <span className="field-label" style={{ marginBottom: 2 }}>Moves</span>
          {([0, 1, 2, 3] as const).map(i => (
            <MoveSearchInput
              key={i}
              value={moves[i]}
              onSelect={v => setMove(i, v)}
              onClear={() => setMove(i, '')}
              placeholder={`Move ${i + 1} (optional)…`}
            />
          ))}
          <button
            className="btn btn-primary"
            onClick={apply}
            disabled={!bodyId || building}
            style={{ marginTop: 6 }}
          >
            {building ? 'Building…' : 'Use as Enemy'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matchup suggestion helpers
// ---------------------------------------------------------------------------

function getLearnableMoves(
  pokemon: PlayerPokemon,
  byId: Map<string, PifSpeciesData>,
  levelupOnly: boolean = false
): Array<{ id: string; learnMethod: string }> {
  const seen = new Set<string>();
  const result: Array<{ id: string; learnMethod: string }> = [];

  function fromSpecies(sp: PifSpeciesData) {
    for (const entry of sp.moves ?? []) {
      const lv = entry[0] as number;
      const id = entry[1] as string;
      if (lv <= pokemon.level && !seen.has(id)) {
        seen.add(id);
        result.push({ id, learnMethod: `Lv.${lv}` });
      }
    }
    if (!levelupOnly) {
      for (const id of sp.tutor_moves ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          result.push({ id, learnMethod: 'TM/Tutor' });
        }
      }
    }
  }

  if (isFusion(pokemon.speciesId)) {
    const head = byId.get(pokemon.speciesId.head);
    const body = byId.get(pokemon.speciesId.body);
    if (head) fromSpecies(head);
    if (body) fromSpecies(body);
  } else if (typeof pokemon.speciesId === 'string') {
    const sp = byId.get(pokemon.speciesId);
    if (sp) fromSpecies(sp);
  }
  return result;
}

function estimateDmgPct(
  atkLevel: number, atkStat: number,
  defStat: number, defHp: number,
  bp: number, mult: number
): number {
  if (bp === 0 || defStat === 0 || defHp === 0) return 0;
  const base = Math.floor(
    Math.floor((2 * atkLevel / 5 + 2) * bp * atkStat / defStat) / 50
  ) + 2;
  return (Math.floor(base * mult) / defHp) * 100;
}

// ---------------------------------------------------------------------------
// Enhanced matchup suggestions (stats-based, move-aware)
// ---------------------------------------------------------------------------

/** Moves that KO the user — only worth recommending if they OHKO all enemies */
const SELF_DESTRUCT_MOVES = new Set(['Explosion', 'Self-Destruct', 'Selfdestruct']);

/**
 * Ability → move type it blocks entirely.
 * Used when computing incoming damage so Levitate etc. grant full immunity.
 */
const ABILITY_IMMUNE_TYPES: Record<string, string> = {
  'levitate':      'GROUND',
  'flash fire':    'FIRE',
  'volt absorb':   'ELECTRIC',
  'water absorb':  'WATER',
  'dry skin':      'WATER',
  'storm drain':   'WATER',
  'lightning rod': 'ELECTRIC',
  'motor drive':   'ELECTRIC',
  'sap sipper':    'GRASS',
  'earth eater':   'GROUND',
  'wonder guard':  '__WONDER_GUARD__', // handled separately
};

/** Type-boosting held item per move type */
const TYPE_BOOST_ITEM: Record<string, string> = {
  FIRE: 'Charcoal',
  WATER: 'Mystic Water',
  GRASS: 'Miracle Seed',
  ELECTRIC: 'Magnet',
  ICE: 'Never-Melt Ice',
  FIGHTING: 'Black Belt',
  POISON: 'Poison Barb',
  GROUND: 'Soft Sand',
  FLYING: 'Sharp Beak',
  PSYCHIC: 'Twisted Spoon',
  BUG: 'Silver Powder',
  ROCK: 'Hard Stone',
  GHOST: 'Spell Tag',
  DRAGON: 'Dragon Fang',
  DARK: 'Black Glasses',
  STEEL: 'Metal Coat',
  NORMAL: 'Silk Scarf',
  FAIRY: 'Fairy Feather',
};

interface EnhancedEntry {
  pokemon: PlayerPokemon;
  playerIdx: 0 | 1 | 2;
  playerName: string;
  displayName: string;
  types: string[];
  totalScore: number;
  bestMove: {
    name: string;
    moveType: string;
    bp: number;
    learnMethod: string;
    avgDmgPct: number;
    ohkoCount: number;
  } | null;
  worstIncomingPct: number;
  recNature: string;
  recItem: string;
}

function MatchupSuggestions({ team }: { team: ResolvedTrainerPokemon[] }) {
  const { state, dispatch } = useAppState();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<EnhancedEntry[]>([]);
  const [levelupOnly, setLevelupOnly] = useState(false);

  useEffect(() => {
    if (!open || team.length === 0) { setResults([]); return; }
    setResults([]); // clear while recomputing

    async function compute() {
      const { byId } = await loadSpecies();
      const movesMap = await loadMoves();

      // Pre-compute each enemy's actual stats and move data
      const enemyData = await Promise.all(
        team.map(async e => {
          const eStat = calcAllStats(e.baseStats, e.ivs, e.evs, e.level, e.nature);
          const moveInfos: Array<{ bp: number; type: string; category: number }> = [];
          for (const mName of e.moves) {
            const mv = await getMoveByRealName(mName);
            if (mv && mv.base_damage > 0 && mv.category !== 2) {
              moveInfos.push({ bp: mv.base_damage, type: mv.type, category: mv.category });
            }
          }
          return { enemy: e, eStat, moveInfos };
        })
      );

      const entries: EnhancedEntry[] = [];

      // Only scan the active player's box
      {
        const pIdx = state.activePlayerTab;
        const player = state.players[pIdx];

        for (const pokemon of player.box) {
          // Resolve base stats + types
          let baseStats: SmogonStatSet | null = null;
          let types: string[] = [];
          let speciesName = '';

          if (isFusion(pokemon.speciesId)) {
            const head = byId.get(pokemon.speciesId.head);
            const body = byId.get(pokemon.speciesId.body);
            if (head && body) {
              baseStats = calcFusionStats(head, body);
              const [t1, t2] = calcFusionTypes(head, body);
              types = t2 ? [t1, t2] : [t1];
              speciesName = `${head.real_name}/${body.real_name}`;
            }
          } else if (typeof pokemon.speciesId === 'string') {
            const sp = byId.get(pokemon.speciesId);
            if (sp) {
              baseStats = pifToSmogonStats(sp.base_stats);
              types = sp.type2 ? [sp.type1, sp.type2] : [sp.type1];
              speciesName = sp.real_name;
            }
          }

          if (!baseStats || types.length === 0) continue;

          const displayName = pokemon.nickname ?? speciesName;
          const pStat = calcAllStats(baseStats, pokemon.ivs, pokemon.evs, pokemon.level, pokemon.nature);

          // Find best learnable damaging move vs this enemy team
          const learnable = getLearnableMoves(pokemon, byId, levelupOnly);
          let bestMove: EnhancedEntry['bestMove'] = null;
          let bestScore = -1;

          for (const { id, learnMethod } of learnable) {
            const mv = movesMap.get(id);
            if (!mv || mv.category === 2 || mv.base_damage === 0) continue;
            const isSelfDestruct = SELF_DESTRUCT_MOVES.has(mv.real_name);
            const atkStat = mv.category === 0 ? pStat.atk : pStat.spa;
            let totalDmg = 0;
            let ohkos = 0;
            for (const { enemy: e, eStat } of enemyData) {
              const defStat = mv.category === 0 ? eStat.def : eStat.spd;
              const eff = typeEff(mv.type, e.types);
              const pct = estimateDmgPct(pokemon.level, atkStat, defStat, eStat.hp, mv.base_damage, eff);
              totalDmg += pct;
              if (pct >= 100) ohkos++;
            }
            // Self-destruct moves only worth it if they OHKO every enemy
            if (isSelfDestruct && ohkos < team.length) continue;
            const avg = totalDmg / team.length;
            // Bonus for guaranteed OHKOs — each OHKO is worth extra 50% to the score
            const score = avg + (ohkos / team.length) * 50;
            if (score > bestScore) {
              bestScore = score;
              bestMove = { name: mv.real_name, moveType: mv.type, bp: mv.base_damage, learnMethod, avgDmgPct: avg, ohkoCount: ohkos };
            }
          }

          // Ability-granted immunity (Levitate, Flash Fire, etc.)
          const abilityKey = (pokemon.ability ?? '').toLowerCase();
          const abilityImmuneType = ABILITY_IMMUNE_TYPES[abilityKey] ?? null;
          const hasWonderGuard = abilityKey === 'wonder guard';

          // Worst incoming damage from enemy team's moves
          let worstIncomingPct = 0;
          for (const { enemy: e, eStat, moveInfos } of enemyData) {
            for (const mv of moveInfos) {
              const mvType = mv.type.toUpperCase();
              // Ability immunity check
              if (abilityImmuneType && mvType === abilityImmuneType) continue;
              const eff = typeEff(mv.type, types);
              if (eff === 0) continue; // type immunity
              // Wonder Guard: only super-effective moves land
              if (hasWonderGuard && eff < 2) continue;
              const atkStat = mv.category === 0 ? eStat.atk : eStat.spa;
              const defStat = mv.category === 0 ? pStat.def : pStat.spd;
              const pct = estimateDmgPct(e.level, atkStat, defStat, pStat.hp, mv.bp, eff);
              worstIncomingPct = Math.max(worstIncomingPct, pct);
            }
          }

          // Build recommendation: Adamant/Modest based on higher attacking stat
          const isPhysical = baseStats.atk >= baseStats.spa;
          const recNature = isPhysical ? 'Adamant' : 'Modest';
          const recItem = TYPE_BOOST_ITEM[bestMove?.moveType?.toUpperCase() ?? ''] ?? 'Leftovers';

          // Score: full immunity is top priority — add a large flat bonus
          const immuneBonus = worstIncomingPct === 0 ? 100 : 0;
          const movePotential = bestMove ? bestMove.avgDmgPct / 50 : 0;
          const survivalMult = worstIncomingPct < 100 ? 1.2 : 0.7;
          const typeScore = scoreMatchup(types, team.map(e => ({ types: e.types })));
          const totalScore = immuneBonus + (movePotential * 3 + typeScore.offenseScore + typeScore.resilienceScore) / 5 * survivalMult;

          entries.push({
            pokemon, playerIdx: pIdx as 0 | 1 | 2, playerName: player.name,
            displayName, types, totalScore, bestMove,
            worstIncomingPct, recNature, recItem,
          });
        }
      }

      entries.sort((a, b) => b.totalScore - a.totalScore);
      setResults(entries.slice(0, 8));
    }

    compute().catch(console.error);
  }, [open, team, state.players, state.activePlayerTab, levelupOnly]);

  if (team.length === 0) return null;
  if (state.players[state.activePlayerTab].box.length === 0) return null;

  function loadPokemon(entry: EnhancedEntry) {
    dispatch({ type: 'SET_ACTIVE_PLAYER_TAB', tab: entry.playerIdx });
    dispatch({ type: 'SET_ACTIVE_POKEMON', playerIdx: entry.playerIdx, pokemon: { ...entry.pokemon } });
  }

  return (
    <div className="matchup-section">
      <div className="matchup-header">
        <button className="matchup-toggle" onClick={() => setOpen(o => !o)}>
          {open ? '▾' : '▸'} Best Matchups from Boxes
        </button>
        {open && (
          <label className="matchup-filter-toggle">
            <input
              type="checkbox"
              checked={levelupOnly}
              onChange={e => setLevelupOnly(e.target.checked)}
            />
            Level-up only
          </label>
        )}
      </div>
      {open && (
        <div className="matchup-list">
          {results.length === 0 ? (
            <div className="empty-msg">Computing…</div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.pokemon.id}
                className="matchup-item matchup-item--clickable"
                onClick={() => loadPokemon(r)}
                title="Click to load into calc"
              >
                <span className="matchup-rank">#{i + 1}</span>
                <div className="matchup-info">
                  <div className="matchup-name-row">
                    <span className="matchup-name">{r.displayName}</span>
                    <div className="matchup-types">
                      {r.types.map(t => <TypeBadge key={t} type={t} small />)}
                    </div>
                  </div>
                  {r.bestMove && (
                    <div className="matchup-best-move">
                      <TypeBadge type={r.bestMove.moveType} small />
                      <span className="matchup-move-name">{r.bestMove.name}</span>
                      <span className="matchup-learn-tag">({r.bestMove.learnMethod})</span>
                      <span className={`matchup-dmg ${r.bestMove.avgDmgPct >= 100 ? 'score-great' : r.bestMove.avgDmgPct >= 50 ? 'score-ok' : 'score-weak'}`}>
                        {r.bestMove.ohkoCount === team.length
                          ? 'OHKOs all'
                          : r.bestMove.ohkoCount > 0
                            ? `OHKOs ${r.bestMove.ohkoCount}/${team.length} (~${Math.round(r.bestMove.avgDmgPct)}% avg)`
                            : `~${Math.round(r.bestMove.avgDmgPct)}% avg`}
                      </span>
                    </div>
                  )}
                  <div className="matchup-footer">
                    <span className="matchup-rec">{r.recNature} + {r.recItem}</span>
                    <span className={`matchup-survival ${r.worstIncomingPct === 0 ? 'surv-immune' : r.worstIncomingPct < 100 ? 'surv-ok' : 'surv-bad'}`}>
                      {r.worstIncomingPct === 0
                        ? 'Immune to all moves!'
                        : `takes ~${Math.round(r.worstIncomingPct)}%${r.worstIncomingPct >= 100 ? ' (OHKO risk)' : ''}`}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div className="matchup-hint">Click any entry to load into calc</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main EnemyPanel
// ---------------------------------------------------------------------------

const DEFAULT_OVR: EnemyOverrides = {};

export default function EnemyPanel() {
  const { state, dispatch } = useAppState();
  const [allTrainers, setAllTrainers]       = useState<PifTrainerData[]>([]);
  const [filteredTrainers, setFiltered]     = useState<PifTrainerData[]>([]);
  const [loading, setLoading]               = useState(true);
  const [reverseResults, setReverseResults] = useState<MoveCalcResult[]>([]);
  const [customEnemyMode, setCustomEnemyMode] = useState(false);

  // Per-selected-pokemon overrides (reset when enemy changes)
  const [overrides, setOverrides] = useState<EnemyOverrides>(DEFAULT_OVR);

  // Load trainers
  useEffect(() => {
    loadTrainers().then(trainers => {
      setAllTrainers(trainers);
      setLoading(false);
    });
  }, []);

  // Filter: boss trainers only; multi-encounter trainers show all versions, others version 0 only
  useEffect(() => {
    let list = allTrainers.filter(t => {
      if (!isBossTrainer(t.trainer_type)) return false;
      if (isMultiEncounterTrainer(t.trainer_type)) return true;
      return (t.version ?? 0) === 0;
    });
    const q = state.trainerSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(t =>
        t.real_name.toLowerCase().includes(q) || t.trainer_type.toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [state.trainerSearch, allTrainers]);

  // Resolve team when trainer or expertMode changes
  const resolveTeam = useCallback(async (trainer: PifTrainerData) => {
    dispatch({ type: 'SET_RESOLVED_ENEMY_TEAM', team: [] });
    const resolved = await Promise.all(
      trainer.pokemon.map((p, i) =>
        resolveTrainerPokemon(p, trainer.trainer_type, state.expertMode, i)
      )
    );
    dispatch({ type: 'SET_RESOLVED_ENEMY_TEAM', team: resolved });
  }, [dispatch, state.expertMode]);

  const selectTrainer = useCallback((trainer: PifTrainerData) => {
    setCustomEnemyMode(false);
    dispatch({ type: 'SET_TRAINER', trainer });
    setOverrides(DEFAULT_OVR);
    resolveTeam(trainer);
  }, [dispatch, resolveTeam]);

  function setCustomEnemy(enemy: ResolvedTrainerPokemon) {
    dispatch({ type: 'SET_TRAINER', trainer: null });
    setCustomEnemyMode(true);
    setOverrides(DEFAULT_OVR);
    // SET_TRAINER clears resolvedEnemyTeam, so dispatch team after
    setTimeout(() => {
      dispatch({ type: 'SET_RESOLVED_ENEMY_TEAM', team: [enemy] });
    }, 0);
  }

  // Re-resolve when expertMode changes
  useEffect(() => {
    if (state.selectedTrainer) resolveTeam(state.selectedTrainer);
  }, [state.expertMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset overrides when selected pokemon changes
  useEffect(() => { setOverrides(DEFAULT_OVR); }, [state.selectedEnemyIndex]);

  // Reverse calc
  useEffect(() => {
    const activePP = state.activePokemon[state.activePlayerTab];
    const enemy = state.resolvedEnemyTeam[state.selectedEnemyIndex];
    if (!activePP || !enemy || enemy.moves.length === 0) { setReverseResults([]); return; }
    runReverseCalc(enemy, activePP, state.field, overrides)
      .then(setReverseResults)
      .catch(() => setReverseResults([]));
  }, [state.activePokemon, state.activePlayerTab, state.resolvedEnemyTeam, state.selectedEnemyIndex, state.field, overrides]);

  const selectedEnemy = state.resolvedEnemyTeam[state.selectedEnemyIndex] ?? null;
  const tier = state.selectedTrainer ? getTrainerTier(state.selectedTrainer.trainer_type) : 'regular';

  // Effective values (overrides applied on top of resolved)
  const effAbility = overrides.ability ?? selectedEnemy?.ability ?? '';
  const effItem    = overrides.item    ?? selectedEnemy?.itemName ?? '';
  const effNature  = overrides.nature  ?? selectedEnemy?.nature   ?? 'Hardy';
  const effEVs     = overrides.evs     ?? selectedEnemy?.evs;
  const effIVs     = overrides.ivs     ?? selectedEnemy?.ivs;

  const computedStats = selectedEnemy && effEVs && effIVs
    ? calcAllStats(selectedEnemy.baseStats, effIVs, effEVs, selectedEnemy.level, effNature)
    : null;

  return (
    <div className="panel enemy-panel">
      {/* Header with mode toggles */}
      <div className="enemy-panel-header">
        <span className="panel-title">
          Enemy Trainer
          <span className="badge-hard">HARD MODE</span>
        </span>
        <div className="mode-toggles">
          <button
            className={`toggle-btn ${state.expertMode ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_EXPERT_MODE' })}
            title="Expert mode: use competitive spreads for gym leaders & E4"
          >
            Expert
          </button>
        </div>
      </div>

      {/* Custom enemy builder */}
      <CustomEnemyBuilder onSet={setCustomEnemy} />

      {/* Search */}
      <div className="field-group">
        <input
          className="pif-input"
          placeholder="Search trainer by name or class…"
          value={state.trainerSearch}
          onChange={e => dispatch({ type: 'SET_TRAINER_SEARCH', text: e.target.value })}
        />
      </div>

      {/* Trainer list */}
      {loading ? (
        <div className="loading-msg">Loading trainer data…</div>
      ) : (
        <div className="trainer-list">
          {filteredTrainers.map(t => {
            const ttier = getTrainerTier(t.trainer_type);
            const isMulti = isMultiEncounterTrainer(t.trainer_type);
            const label = isMulti
              ? `${t.real_name} (#${(t.version ?? 0) + 1})`
              : t.real_name;
            return (
              <button
                key={t.id_number}
                className={`trainer-list-item ${state.selectedTrainer?.id_number === t.id_number ? 'active' : ''} ${ttier === 'elite' ? 'trainer-elite' : ''}`}
                onClick={() => selectTrainer(t)}
              >
                <span className="trainer-name">{label}</span>
                <span className="trainer-class">{t.trainer_type.replace(/_/g, ' ')}</span>
                <span className="trainer-count">({t.pokemon.length})</span>
              </button>
            );
          })}
          {filteredTrainers.length === 0 && <div className="empty-msg">No trainers found.</div>}
        </div>
      )}

      {/* Team grid — trainer or custom */}
      {(state.selectedTrainer || customEnemyMode) && state.resolvedEnemyTeam.length > 0 && (
        <>
          <div className="section-divider" />
          <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {customEnemyMode ? 'Custom Enemy' : `${state.selectedTrainer!.real_name}'s Team`}
            {!customEnemyMode && tier === 'elite' && <span className="badge-elite">ELITE</span>}
            <button
              className="link-btn"
              style={{ marginLeft: 'auto', fontSize: '0.7rem' }}
              onClick={() => { dispatch({ type: 'SET_TRAINER', trainer: null }); setCustomEnemyMode(false); }}
            >Change</button>
          </h3>
          <div className="enemy-team-grid">
            {state.resolvedEnemyTeam.map((_, i) => (
              <TrainerPokemonCard
                key={i}
                resolved={state.resolvedEnemyTeam[i] ?? null}
                isSelected={state.selectedEnemyIndex === i}
                onClick={() => dispatch({ type: 'SET_ENEMY_INDEX', index: i })}
              />
            ))}
          </div>

          <MatchupSuggestions team={state.resolvedEnemyTeam} />
        </>
      )}

      {/* ─── Selected Pokemon detail (Smogon-style) ─── */}
      {selectedEnemy && (
        <>
          <div className="section-divider" />

          {/* Name + level + types + HP */}
          <div className="smogon-poke-header">
            <div>
              <h3 className="smogon-poke-name">{selectedEnemy.displayName}</h3>
              <span className="smogon-poke-level">Lv. {selectedEnemy.level}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div className="enemy-poke-types">
                {selectedEnemy.types.map(t => <TypeBadge key={t} type={t.toUpperCase()} />)}
              </div>
              {computedStats && (
                <div className="enemy-hp-badge">
                  <span className="enemy-hp-badge-label">HP</span>
                  <span className="enemy-hp-badge-value">{computedStats.hp}</span>
                </div>
              )}
            </div>
          </div>

          {/* Ability */}
          <div className="smogon-field-row">
            <label className="field-label">Ability</label>
            {selectedEnemy.availableAbilities.length > 0 ? (
              <select
                className="pif-select"
                value={effAbility}
                onChange={e => setOverrides(o => ({ ...o, ability: e.target.value }))}
                title={selectedEnemy.abilityDescription}
              >
                {selectedEnemy.availableAbilities.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <input
                className="pif-input pif-input--sm"
                value={effAbility}
                onChange={e => setOverrides(o => ({ ...o, ability: e.target.value }))}
              />
            )}
          </div>
          {selectedEnemy.abilityDescription && (
            <p className="detail-description">{selectedEnemy.abilityDescription}</p>
          )}

          {/* Item */}
          <div className="smogon-field-row">
            <label className="field-label">Item</label>
            <input
              className="pif-input pif-input--sm"
              value={effItem}
              onChange={e => setOverrides(o => ({ ...o, item: e.target.value }))}
              placeholder="Item…"
            />
          </div>
          {selectedEnemy.itemDescription && effItem === (selectedEnemy.itemName || selectedEnemy.item) && (
            <p className="detail-description">{selectedEnemy.itemDescription}</p>
          )}

          {/* Nature */}
          <div className="smogon-field-row">
            <label className="field-label">Nature</label>
            <select
              className="pif-select"
              value={effNature}
              onChange={e => setOverrides(o => ({ ...o, nature: e.target.value }))}
            >
              {NATURES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* EVs */}
          <div className="editor-section">
            <div className="editor-section-header">
              <span className="field-label">EVs</span>
              <button className="link-btn" onClick={() => setOverrides(o => ({ ...o, evs: undefined }))}>Reset</button>
            </div>
            <div className="stat-inputs-grid">
              {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
                <StatInputRow
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={effEVs?.[stat] ?? 0}
                  max={252}
                  onChange={v => setOverrides(o => ({
                    ...o,
                    evs: { ...(o.evs ?? selectedEnemy.evs), [stat]: v },
                  }))}
                />
              ))}
            </div>
          </div>

          {/* IVs */}
          <div className="editor-section">
            <div className="editor-section-header">
              <span className="field-label">IVs</span>
              <button className="link-btn" onClick={() => setOverrides(o => ({ ...o, ivs: undefined }))}>Reset</button>
            </div>
            <div className="stat-inputs-grid">
              {(Object.keys(STAT_LABELS) as (keyof SmogonStatSet)[]).map(stat => (
                <StatInputRow
                  key={stat}
                  label={STAT_LABELS[stat]}
                  value={effIVs?.[stat] ?? 31}
                  max={31}
                  onChange={v => setOverrides(o => ({
                    ...o,
                    ivs: { ...(o.ivs ?? selectedEnemy.ivs), [stat]: v },
                  }))}
                />
              ))}
            </div>
          </div>

          {/* Stat bars */}
          <StatBar
            baseStats={selectedEnemy.baseStats}
            actualStats={computedStats ?? undefined}
            nature={effNature}
            compact
          />

          {/* Moves */}
          {selectedEnemy.moves.length > 0 && (
            <div className="enemy-moves-section">
              <span className="field-label">Moves</span>
              <div className="enemy-moves">
                {selectedEnemy.moves.map((m, i) => (
                  <span key={i} className="enemy-move-tag">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Reverse damage */}
          {reverseResults.length > 0 && (
            <div className="damage-section reverse-damage-section">
              <h4 className="section-title">
                {selectedEnemy.displayName} → {state.players[state.activePlayerTab].name}
              </h4>
              {reverseResults.map(r => (
                <DamageRow key={r.moveId} result={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

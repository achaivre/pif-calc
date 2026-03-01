/**
 * Middle panel — battle field conditions.
 */
import { useAppState } from '../../context/AppContext';
import type { SideConditions } from '../../types/game';

const WEATHERS = ['Sun', 'Rain', 'Sand', 'Hail'];
const TERRAINS = ['Electric', 'Grassy', 'Psychic', 'Misty'];

function ToggleBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`toggle-btn ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SideEditor({
  title,
  side,
  onChange,
}: {
  title: string;
  side: SideConditions;
  onChange: (patch: Partial<SideConditions>) => void;
}) {
  return (
    <div className="side-editor">
      <h4 className="side-title">{title}</h4>
      <div className="toggle-grid">
        <ToggleBtn label="Reflect" active={side.isReflect} onClick={() => onChange({ isReflect: !side.isReflect })} />
        <ToggleBtn label="Light Screen" active={side.isLightScreen} onClick={() => onChange({ isLightScreen: !side.isLightScreen })} />
        <ToggleBtn label="Aurora Veil" active={side.isAuroraVeil} onClick={() => onChange({ isAuroraVeil: !side.isAuroraVeil })} />
        <ToggleBtn label="Tailwind" active={side.isTailwind} onClick={() => onChange({ isTailwind: !side.isTailwind })} />
        <ToggleBtn label="Stealth Rock" active={side.isSR} onClick={() => onChange({ isSR: !side.isSR })} />
      </div>
      <div className="spikes-row">
        <span className="field-label">Spikes:</span>
        {[0, 1, 2, 3].map(n => (
          <button
            key={n}
            className={`spike-btn ${side.spikes === n ? 'active' : ''}`}
            onClick={() => onChange({ spikes: n })}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FieldPanel() {
  const { state, dispatch } = useAppState();
  const field = state.field;

  function patchField(patch: Parameters<typeof dispatch>[0] extends { type: 'UPDATE_FIELD'; patch: infer P } ? P : never) {
    dispatch({ type: 'UPDATE_FIELD', patch });
  }

  function setWeather(w: string | null) {
    patchField({ weather: w });
  }

  function setTerrain(t: string | null) {
    patchField({ terrain: t });
  }

  function patchAttackerSide(patch: Partial<SideConditions>) {
    patchField({ attackerSide: { ...field.attackerSide, ...patch } });
  }

  function patchDefenderSide(patch: Partial<SideConditions>) {
    patchField({ defenderSide: { ...field.defenderSide, ...patch } });
  }

  return (
    <div className="panel field-panel">
      <h2 className="panel-title">Field</h2>

      {/* Weather */}
      <div className="field-group">
        <label className="field-label">Weather</label>
        <div className="toggle-grid">
          <ToggleBtn
            label="None"
            active={field.weather === null}
            onClick={() => setWeather(null)}
          />
          {WEATHERS.map(w => (
            <ToggleBtn
              key={w}
              label={w}
              active={field.weather === w}
              onClick={() => setWeather(field.weather === w ? null : w)}
            />
          ))}
        </div>
      </div>

      {/* Terrain */}
      <div className="field-group">
        <label className="field-label">Terrain</label>
        <div className="toggle-grid">
          <ToggleBtn
            label="None"
            active={field.terrain === null}
            onClick={() => setTerrain(null)}
          />
          {TERRAINS.map(t => (
            <ToggleBtn
              key={t}
              label={t}
              active={field.terrain === t}
              onClick={() => setTerrain(field.terrain === t ? null : t)}
            />
          ))}
        </div>
      </div>

      {/* Global conditions */}
      <div className="field-group">
        <label className="field-label">Other</label>
        <div className="toggle-grid">
          <ToggleBtn
            label="Gravity"
            active={field.isGravity}
            onClick={() => patchField({ isGravity: !field.isGravity })}
          />
          <ToggleBtn
            label="Magic Room"
            active={field.isMagicRoom}
            onClick={() => patchField({ isMagicRoom: !field.isMagicRoom })}
          />
          <ToggleBtn
            label="Wonder Room"
            active={field.isWonderRoom}
            onClick={() => patchField({ isWonderRoom: !field.isWonderRoom })}
          />
        </div>
      </div>

      <div className="section-divider" />

      <SideEditor
        title="Your Side"
        side={field.attackerSide}
        onChange={patchAttackerSide}
      />

      <div className="section-divider" />

      <SideEditor
        title="Enemy Side"
        side={field.defenderSide}
        onChange={patchDefenderSide}
      />
    </div>
  );
}

import { TYPE_COLORS } from '../../types/game';

interface Props {
  type: string; // PIF format: "FIRE", "WATER", etc.
  small?: boolean;
}

export default function TypeBadge({ type, small = false }: Props) {
  const color = TYPE_COLORS[type.toUpperCase()] ?? '#888';
  const label = type.charAt(0) + type.slice(1).toLowerCase();

  return (
    <span
      className={`type-badge ${small ? 'type-badge--small' : ''}`}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

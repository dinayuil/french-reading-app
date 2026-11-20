import type { CefrLevel } from '../types/content';

interface LevelBadgeProps {
  level: CefrLevel;
  current?: boolean;
}

export default function LevelBadge({ level, current = false }: LevelBadgeProps) {
  return (
    <span
      className={`level-badge${current ? ' level-badge--current' : ''}`}
      data-testid="level-badge"
      aria-current={current ? 'true' : undefined}
    >
      {level}
    </span>
  );
}

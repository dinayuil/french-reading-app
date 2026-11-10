import type { CefrLevel } from '../types/content';

interface LevelBadgeProps {
  level: CefrLevel;
}

export default function LevelBadge({ level }: LevelBadgeProps) {
  return (
    <span className="level-badge" data-testid="level-badge">
      {level}
    </span>
  );
}

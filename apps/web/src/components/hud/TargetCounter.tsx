'use client'

/**
 * An ambient readout for the target-practice mini-game — deliberately not a
 * scoreboard (no names, no ranking, no "you win/lose"), matching this app's
 * non-competitive framing for anything shared between players. Renders in both solo
 * and multiplayer alike: the board itself is shared state only when a LAN session
 * is active, but "how many targets are down" is meaningful either way.
 */
export function TargetCounter({ progress }: { progress: { hit: number; total: number } | null }) {
  if (!progress || progress.total === 0) return null

  return (
    <div className="glass fixed top-16 right-3 z-40 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs select-none">
      <span className="text-glass-foreground font-medium tabular-nums">
        {progress.hit}/{progress.total}
      </span>
      <span className="text-glass-faint">targets down</span>
    </div>
  )
}

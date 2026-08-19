'use client'

import dynamic from 'next/dynamic'
import { AutoplayPill } from '@/components/audio/AutoplayPill'
import { DevStatsPanel } from '@/components/hud/DevStatsPanel'
import { HintLayer } from '@/components/hud/HintLayer'
import { ThoughtComposer } from '@/components/hud/ThoughtComposer'
import { SkyClock } from '@/components/hud/SkyClock'
import { HUDDock } from '@/components/hud/HUDDock'
import { LanternLayer } from '@/components/world/LanternLayer'
import { Minimap } from '@/components/world/Minimap'
import { Compass } from '@/components/hud/Compass'
import { LanAutoJoin } from '@/components/world/LanAutoJoin'
import { LanChat } from '@/components/hud/LanChat'
import { TargetCounter } from '@/components/hud/TargetCounter'
import { CoinHud } from '@/components/hud/CoinHud'
import { PropInteractionPrompt } from '@/components/hud/PropInteractionPrompt'
import { ConstellationHighlightLayer } from '@/components/world/ConstellationHighlightLayer'
import { useSceneryId } from '@/lib/scenery/sceneryStore'

/**
 * The `ssr: false` boundary. Next forbids it in a Server Component, so this thin client
 * wrapper exists solely to satisfy that rule (S1).
 */
const EngineCanvas = dynamic(
  () => import('@/components/world/EngineCanvas').then((m) => m.EngineCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-glass-faint text-sm">Frostholm Ridge — a clear alpine morning</p>
      </div>
    ),
  },
)

export function WorldClient() {
  const sceneryId = useSceneryId()

  return (
    <EngineCanvas sceneryId={sceneryId}>
      {(api) => (
        <>
          <LanAutoJoin />
          <DevStatsPanel {...api} />
          <HintLayer stats={api.stats} />
          <SkyClock command={api.command} locked={sceneryId === 'observatory'} />
          <AutoplayPill
            unlocked={api.audioUnlocked}
            onUnlock={() => api.command({ type: 'audioUnlock' })}
          />
          <LanternLayer getLanternProjections={api.getLanternProjections} />
          <ConstellationHighlightLayer getConstellationLabels={api.getConstellationLabels} />
          <Minimap getMinimapSnapshot={api.getMinimapSnapshot} command={api.command} />
          <Compass getMinimapSnapshot={api.getMinimapSnapshot} />
          <LanChat command={api.command} />
          <TargetCounter progress={api.targetProgress} />
          <CoinHud command={api.command} />
          <ThoughtComposer
            cooldownS={api.stats?.thoughtCooldownS ?? 0}
            onSubmit={(text) => api.command({ type: 'postThought', text })}
          />
          <PropInteractionPrompt nearbyProp={api.nearbyProp} command={api.command} />
          <HUDDock
            ready={!!api.ready}
            command={api.command}
            stats={api.stats}
            getConstellationNames={api.getConstellationNames}
            isConstellationVisible={api.isConstellationVisible}
          />
        </>
      )}
    </EngineCanvas>
  )
}

'use client'

import type { ChromePromptAiStatus } from '@/lib/ai/localAi'

/**
 * "Chrome Built-in AI isn't enabled" banner + step-by-step enable guide — shared by
 * every feature that can optionally use in-browser Gemini Nano (billboard quotes,
 * companion chat) so the instructions never drift between them.
 */
export function ChromeAiGuide({
  aiStatus,
  show,
  onToggle,
}: {
  aiStatus: ChromePromptAiStatus | null
  show: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-glass-edge bg-glass-foreground/5 flex flex-col gap-2 rounded-xl border p-3 text-left text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium text-amber-300">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-4 w-4 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{aiStatus?.statusMessage || 'Chrome Built-in AI is not enabled'}</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-glass-foreground text-[11px] underline transition hover:text-white"
        >
          {show ? 'Hide Setup' : 'How to Enable AI'}
        </button>
      </div>

      {show && (
        <div className="border-glass-edge text-glass-muted flex flex-col gap-2 border-t pt-2 text-[11px] leading-relaxed">
          <p className="font-medium text-white/90">Steps to enable Gemini Nano in Google Chrome:</p>
          <ol className="flex flex-col gap-1.5 pl-1 text-[11px]">
            <li>
              <strong>1. Open via localhost:</strong> Must be opened via{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-amber-200">
                http://localhost:3000
              </code>{' '}
              (Chrome disables AI APIs on raw LAN IP addresses).
            </li>
            <li>
              <strong>2. Enable Prompt API:</strong> Navigate to{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-amber-200">
                chrome://flags/#prompt-api
              </code>{' '}
              and select <strong>Enabled</strong>.
            </li>
            <li>
              <strong>3. Enable Device Model:</strong> Navigate to{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-amber-200">
                chrome://flags/#optimization-guide-on-device-model
              </code>{' '}
              and select <strong>Enabled BypassPrefRequirement</strong>.
            </li>
            <li>
              <strong>4. Download Model:</strong> Navigate to{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-amber-200">
                chrome://components
              </code>{' '}
              and click <strong>Check for update</strong> on{' '}
              <em>Optimization Guide On Device Model</em>.
            </li>
            <li>
              <strong>5. Relaunch:</strong> Restart Google Chrome and refresh this page.
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}

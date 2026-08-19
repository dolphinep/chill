import { S57Client } from './S57Client'

/**
 * S5 + S7 in one scene.
 *
 * They are tested together on purpose: the risk is not "do shadows work" or "does
 * TRAA work" in isolation, it is whether TRAA ghosts on **vertex-animated** geometry
 * (water, grass, the VAT crowd) that is also receiving cascaded shadows. That
 * combination is exactly what the real beach scene will be.
 */
export default function S57Page() {
  return <S57Client />
}

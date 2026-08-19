import { S1Client } from './S1Client'

/**
 * S1 — WebGPURenderer + RenderPipeline + Bloom inside a Next App Router page.
 *
 * This page stays a Server Component. `next/dynamic` with `ssr: false` is illegal
 * in a Server Component, so the boundary lives one level down in S1Client.
 */
export default function S1Page() {
  return <S1Client />
}

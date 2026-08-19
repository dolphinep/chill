import { WorldClient } from './WorldClient'

/**
 * Stays a Server Component. In §5 this is where the scenery cookie is read so the
 * correct poster ships in the initial HTML — the cookie mirrors the localStorage
 * favourite precisely because the server cannot read localStorage, and without it the
 * first paint would flash the wrong scenery.
 */
export default function WorldPage() {
  return <WorldClient />
}

/** v0.1: local-only, one author (`'local'`). The `authorId` field exists now because
 * v0.2's realtime layer needs it — populating it with one constant costs nothing and
 * means the multiplayer cut-over touches `ThoughtField`'s call sites, not its shape. */
export type Thought = {
  id: string
  authorId: string
  text: string
}

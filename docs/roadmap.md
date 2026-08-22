# 🗺️ Roadmap

This document tracks where Chill is headed. It's a living reference, not a fixed contract — priorities shift as we learn from the live build at [chill.plaloma.com](https://chill.plaloma.com).

**Current priority: the best possible solo experience.** Multiplayer exists in the codebase and works end-to-end, but it stays gated off in production until the solo world is polished. Shipping a great single-player haven first, then layering shared presence on top of it, is a better sequence than shipping both half-finished.

---

## Now — Solo Experience Polish

Focus areas for the current milestone:

| Area                     | Notes                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Mobile & touch input     | Virtual joystick and jump button for touch navigation shipped; continuing to tune feel and hit targets across devices. |
| Avatar fidelity          | Skeletal animation, avatar model scaling, and pointer-based interaction controls landed; ongoing refinement of proportions and animation blending. |
| Scenery & prop polish    | Firework, campfire, and victory/celebration effects (e.g. the Frostholm gift box) tuned for feel and performance. |
| Companion pets           | Hiding/toggle behavior and reaction tuning for the existing pet roster. |
| Performance & stability  | WebGPU/WebGL2 fallback correctness, terrain and shadow performance across quality tiers. |
| Production infrastructure | Static export deployed on Cloudflare Workers at `chill.plaloma.com`; simplifying the deploy path ahead of further feature work. |

---

## Next — Multiplayer, Gated Rollout

The `@chill/protocol` WebSocket relay, room/lobby system, and remote-avatar sync are implemented and testable locally today (`pnpm lan:host`), but are **not enabled for players in production** yet.

| Capability                       | Status        |
| -------------------------------- | ------------- |
| WebSocket relay & room protocol  | Implemented   |
| Avatar position/animation sync   | Implemented   |
| Room passkeys & lobby sharing UI | Implemented   |
| Proximity-based spatial audio    | In progress   |
| Co-op mini-games                 | In progress   |
| Text chat                        | Implemented, needs moderation/abuse pass |
| Production relay deployment      | Not yet enabled — planned on Google Cloud Run alongside the Cloudflare-hosted static site |

Before multiplayer is switched on for real players, we want:

1. Solo experience to feel finished (see "Now" above).
2. A production relay deployment with health checks and reconnect handling that we trust under real network conditions.
3. Baseline moderation for chat and shared sessions.

---

## Later — Exploratory

Ideas we're tracking but haven't committed to. Not promises, just the backlog:

- Additional sceneries beyond the current five.
- Seasonal/weather variation layered onto existing biomes.
- Deeper on-device AI companion dialogue (beyond the current Chrome Prompt API integration).
- Cross-device session handoff / cloud save for avatar and companion customization.

---

## How this fits together

```
Solo world (live)  ──────────────►  polished, primary experience
        │
        ▼
Multiplayer relay (built, gated) ─►  enabled once solo UX + relay ops are ready
        │
        ▼
Exploratory ideas ───────────────►  considered after multiplayer ships
```

For implementation details on the relay protocol and engine subsystems referenced above, see [System Architecture](architecture.md) and [Engine Architecture Notes](engine-notes.md).

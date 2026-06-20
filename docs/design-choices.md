# Design Choices

This file records small product and interface decisions that should stay stable unless we intentionally revisit them.

## History Relative Time Labels

`/history` should show human-friendly recency labels instead of raw session ids.

Rules:

- Show `just now` for sessions updated less than one minute ago.
- Show `N mins ago` for sessions updated less than one hour ago.
- Show `N hours ago` for sessions updated less than one day ago.
- If a session was updated on the previous calendar day, only show `yesterday` when it is also at least 15 hours old.
- If a session was updated on the previous calendar day but is less than 15 hours old, keep showing `N hours ago`.
- Show `N days ago` for older sessions.

Reasoning:

Near-midnight sessions can technically be "yesterday" while still feeling recent. Showing `2 hours ago` is more useful than `yesterday` in that case. The `yesterday` label should be reserved for sessions that feel meaningfully older.

Current implementation:

- Interactive history formatting lives in `src/ui/ink-terminal.tsx`.
- Piped `/history` formatting lives in `src/cli.ts`.

## Tool Registry Documentation

`docs/tools.md` is the canonical human-readable reference for the built-in tool structure, schemas, execution flow, and safety behavior.

Current implementation:

- Tool definitions and handlers live in `src/tools/registry.ts`.
- The tool-aware agent loop lives in `src/agent/loop.ts`.
- OpenRouter tool-call types live in `src/openrouter.ts`.

## Runtime Context Injection

Every model turn receives a transient runtime-context system message with the current date/time, ISO timestamp, current year, and workspace path.

Reasoning:

Models can answer stale facts from memory unless they know what "latest", "current", "recent", "today", or "now" means for this run. Sending fresh runtime context with each message lets the agent form correct web searches and date-sensitive answers without storing volatile timestamps in the session transcript.

Current implementation:

- `src/session/context.ts` builds the runtime context in `buildRuntimeContext()`.
- `entriesToModelMessages()` injects the runtime-context system message after the base system prompt.
- `src/cli.ts` passes the current workspace when building per-turn model messages.

# Usage and Pinned Chats

Furnace keeps project sessions local while aggregating opt-in display metrics across projects for the active API key.

## Usage ledger

`~/.furnace/usage.sqlite` stores per-turn token/cost records and accepted-line events. API keys are never stored; rows use a SHA-256 identifier derived from the provider and key. Event IDs make writes idempotent.

Successful `write` and `edit` tool calls contribute added lines. Failed tools contribute nothing, and `/undo` removes the corresponding event. `/usage` renders a twelve-month contribution grid based on daily token usage, alongside accepted lines and recorded cost for the active key. Historical turns created before this ledger was introduced are not backfilled.

The Cost setting has three values:

- **on (per session)** — active conversation cost;
- **on (total)** — recorded cost for the active provider key across projects;
- **off** — hide cost from the footer.

Provider-reported cost is preferred. When unavailable, Furnace uses the selected model catalog price; unknown-cost turns remain explicitly counted.

## Pinned chats

Pinned session IDs are global preferences, but only sessions belonging to the current project are displayed. Up to five valid sessions are retained in a panel below the input; chats with active turns or subagents show an animated Thinking indicator. `Ctrl+G` shows or hides the panel, and `Ctrl+P` focuses it when at least one chat is pinned. Use `/pin` to toggle the current chat, press `Tab` on a highlighted `/resume` entry without closing that menu, or run `/pins <slot>` to switch directly.

# Agent Instructions

This repository is building Furnace, a terminal-first agentic coding harness. Treat the project as a layered runtime with a reusable agent loop, typed tools, session persistence, and an Ink terminal UI; do not treat it as only a chat wrapper around an LLM.

## Product Direction

- Build a practical coding-agent harness with interactive TUI, headless prompt mode, resumable sessions, tool calls, permissions, and local state.
- Keep agent/runtime concerns separate from the terminal UI so future JSON, RPC, SDK, and editor surfaces can reuse the same engine.
- Prefer small, testable layers over large monolithic CLI changes.
- Make extensions, skills, custom slash commands, and custom tools possible without requiring forks.
- Preserve local-first behavior: SQLite sessions, local preferences, local skills, local context artifacts, and no infrastructure dependency beyond the selected model/search providers.

## Current Technical Defaults

- Language: TypeScript.
- Runtime: Node.js 22.19+.
- CLI parser: Commander.
- TUI: Ink React, with local components under `src/ui/components/`.
- Storage: local SQLite at `.furnace/furnace.sqlite` using `better-sqlite3`.
- Provider: OpenRouter chat completions and model listing.
- Build: `tsc` plus `esbuild` bundling to `dist/cli.js`; prompt markdown files are copied by `scripts/copy-prompts.mjs`.
- Tests: Node test runner after `npm run build`.

## Current Implementation

- `src/cli.ts` is the main orchestration layer. It wires Commander options, OpenRouter config, the session store, the Ink terminal, slash commands, plan mode, permissions, prompt queueing, subagent tasks, compaction, and headless/piped execution.
- `src/agent/loop.ts` contains the reusable agent turn loop. It streams through OpenRouter, handles tool-call iterations, asks the permission store before gated tools run, records tool activity callbacks, and can force web search for non-local current-info requests.
- `src/openrouter.ts` contains streaming/completion/model-list OpenRouter calls.
- `src/tools/registry.ts` defines built-in tools and handlers:
  - file and search tools: `read`, `ls`, `find`, `glob`, `grep`, `write`, `edit`;
  - execution and interaction tools: `bash`, `ask_question`;
  - skill tools: `skill`, `skill_manage`;
  - subagent tools: `task`, `task_status`;
  - planning helpers: `todoread`, `todowrite`;
  - web tools: `websearch`, `webfetch`;
  - compression artifact retrieval: `context_retrieve`.
- `src/permissions.ts` enforces default permission behavior. Read/search/question/skill/task/todo/web tools are allowed by default; write/edit/bash/skill management ask by default. Plan mode denies most mutations except writing/editing the active plan artifact and safe read-only shell commands.
- `src/session/store.ts` persists sessions and entries in SQLite using a Pi-style active-leaf tree. It records messages, tool calls/results, compactions, todo state, image attachments, and file-read receipts/snapshots for stale-write warnings.
- `src/session/context.ts` converts active session entries into model messages and user-visible transcript rows.
- `src/session/compaction.ts` implements model-assisted session compaction with deterministic fallback, `firstKeptEntryId` semantics, file details, secret redaction, and file-read-state clearing after compaction.
- `src/compression/*` implements Headroom-lite tool-output compression and request-local compression transforms. Full originals are stored under `.furnace/context-store/` and retrieved by `context_retrieve`.
- `src/ui/ink-terminal.tsx` and `src/ui/components/*` implement the interactive terminal: transcript rendering, streaming output, prompt input/autocomplete, approvals, question prompts, model editor, settings, permissions panel, task status, queue controls, plan actions, lofi state, themes, and optional sidebar.
- `src/commands.ts` defines built-in slash commands including `/new`, `/resume`/`/history`, `/image`, `/model`, `/plan`, `/agent`, `/mode`, `/theme`, `/tasks`, `/compact`, `/skills`, `/lofi`, `/settings`, `/permissions`, `/status`, `/export`, `/diff`, `/undo`, `/copy`, `/cost`, `/editor`, `/bug`, `/exit`, and `/quit`.
- `src/plan-mode.ts` supports agent/plan modes, creates plan artifact paths under `.furnace/plans/`, injects plan-mode system guidance, and renders saved plan artifacts/actions.
- `src/tasks/manager.ts` runs delegated subagent task groups in parallel, supports foreground/background promotion, records recent task status, and propagates task updates to the UI.
- `src/skills/*` discovers skills from project/user/plugin roots, renders skill guidance, loads explicit skills, and can create managed project/user skill files.
- `src/custom-commands/*` loads reusable slash-command templates.
- `src/preferences.ts` loads/saves global and project preferences for model, model settings, theme, input mode, notifications, sidebar, and skill paths.
- `src/utils/images.ts` supports local/remote image attachments for multimodal user messages.
- Documentation currently lives in `docs/`, especially `docs/tools.md`, `docs/skills.md`, `docs/session-management.md`, `docs/compaction.md`, `docs/headroom-lite.md`, `docs/image-support.md`, `docs/delegation-subagents.md`, `docs/interaction-model.md`, and `docs/design-choices.md`.

## Current CLI / UX Surface

- Headless prompt mode: `furnace -p "prompt"` or positional prompt arguments.
- Piped stdin mode when stdin is not a TTY.
- Interactive Ink TUI by default.
- Session controls: start new sessions by default, `--continue`, `--session <id>`, `/new`, `/resume`, `/history`.
- Output mode option: `--output-format text|json` for headless mode.
- Shell completion command: `furnace completion <bash|zsh|fish>`.
- Interactive model/theme/settings controls through slash commands and UI panels.
- Prompt queueing while an agent turn is running.
- Interrupt support through the TUI abort controller.
- Subagent task groups can run in the foreground or be promoted/backgrounded.

## Coding Standards

- Keep modules narrowly scoped and named by responsibility.
- Do not put provider-specific logic in the TUI.
- Do not let tools bypass the permission engine.
- Treat session entries as append-only; branch/fork features should move active leaves or create forked sessions, not rewrite old entries.
- Preserve assistant tool-call and tool-result pairings when changing transcript/model-message transforms.
- Keep context compression deterministic and reversible: compress model-facing output, but store the full original under `.furnace/context-store/` when content is omitted.
- Keep empty placeholder sessions out of user-visible history.
- Keep user-facing terminal output concise.
- Use structured file tools and `edit` patches for repository changes where possible.
- Add or update tests around agent loop behavior, tool execution, permission decisions, transcript replay, compaction, skills, plan mode, and UI-adjacent command behavior when changing those areas.

## Safety Defaults

- Deny reading secret-like files by default, including `.env` and `.env.*`, while allowing `.env.example`.
- Ask before write/edit/bash/skill-management operations unless a session grant permits them.
- Scope file writes to the workspace unless an external path is explicitly requested and approved.
- Never run destructive git or filesystem commands without explicit approval.
- Compress large command/tool outputs before model replay and preserve full originals separately under `.furnace/context-store/`.
- In plan mode, keep implementation locked down: only the active plan artifact can be written/edited, and only safe read-only shell commands are allowed.

## Lagging Behind / Watch List

- `README.md` still contains older planning language: it references deleted root roadmap/planning docs, describes some first-milestone items that are already implemented, and lists an older planned stack. Update it before treating the public docs as authoritative.
- The runtime is only partially separated from the UI: `runAgentTurn` is reusable, but `src/cli.ts` still owns a large amount of orchestration for modes, tasks, permissions, compaction, slash commands, preferences, and UI callbacks. Extracting a runtime/controller layer remains an important architecture cleanup.
- Provider support is OpenRouter-first. Anthropic/OpenAI-native adapters and a provider abstraction beyond the current OpenRouter module are still not implemented.
- Sandboxing is still permission-gate based. There is no OS/container sandbox adapter yet.
- JSON/headless output exists, but the event stream is not yet exposed as a stable public JSON/RPC/SDK interface.
- The Ink UI has grown featureful; keep watching for regressions around focus management, autocomplete scopes, queue controls, settings panels, task panels, and sidebar layout.
- `src/cli.ts` is the biggest risk area by size and responsibility. Prefer extracting focused modules rather than adding more nested command/orchestration logic there.
- Web search/fetch are MCP-style HTTP integrations with bounded output, but provider configuration, error surfacing, and tests should stay current as those services change.
- Skills are loaded from many local/plugin roots. Be careful about duplicate names, disabled model invocation, and not treating managed/plugin cache skill roots as writable.
- File stale-write protection depends on read receipts/snapshots. Preserve this when changing `read`, `write`, `edit`, or session persistence.
- Plan artifacts now live under `.furnace/plans/`; historical docs under `docs/plans/` are implementation notes, not the active roadmap.

## Useful Comparisons

- Pi: minimal TypeScript harness with extension-first design.
- OpenCode: client/server-style architecture with TUI as one client.
- Headroom: content-aware compression, CCR-style retrieval handles, and request-local transforms for oversized tool results.
- Codex CLI: Rust implementation with strong sandboxing and a reusable core.
- Claude Code: product model with one engine across terminal, IDE, SDK, hooks, skills, and background agents.

When adopting or adapting behavior from another harness, including Pi, OpenCode, Hermes Agent, Codex CLI, or Claude Code, document the source and Furnace-specific adaptation in `docs/design-choices.md`.

When researching Pi, OpenCode, or Headroom behavior, use the local reference clones rather than relying on memory:

- Pi: `/Users/nihal/code/test-repos/pi`
- OpenCode: `/Users/nihal/code/test-repos/opencode`
- Headroom: `/Users/nihal/code/test-repos/headroom`

Before writing comparison notes, run `git pull --ff-only` in each reference repo so the research reflects the latest checked-out source. Record the inspected commit hashes in reports.

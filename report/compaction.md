# Compaction And Context-Bloat Research

This report inspects Headroom, Pi, OpenCode, and Hermes Agent, then recommends the strongest compaction design for Furnace. The goal is to choose the best approach for Furnace, not the smallest patch or the most source-compatible copy.

## Inspected Sources

- Headroom: `/Users/nihal/code/test-repos/headroom` at `95b2333ee5a3f1cbe512ca04a6563c3572835758`
- Pi: `/Users/nihal/code/test-repos/pi` at `02540acd17fd82ab6f5afce6ee2901493cd4c032`
- OpenCode: `/Users/nihal/code/test-repos/opencode` at `cf31029350820c6bfc0fbd0e052a79a067ee6116`
- Hermes Agent: `/Users/nihal/code/test-repos/hermes-agent` at `17dfc6bec4a8b7fd840d479c33e9a7b2449f805d`

Before inspection, each local reference repo was updated with `git pull --ff-only`. Headroom was cloned beside the existing harness references under `/Users/nihal/code/test-repos`.

## Executive Summary

There are two separate problems that people often call "compaction":

1. Session compaction: replace old conversation history in the model-facing context with a durable summary plus a verbatim recent suffix.
2. Context-bloat reduction: shrink oversized tool outputs or request payloads before they inflate the model context.

Pi, OpenCode, and Hermes all implement session compaction. Headroom is mostly the second category: it compresses live request/tool-output content and can do reversible Compress-Cache-Retrieve (CCR), but it does not replace an agent's durable conversation history with a session checkpoint.

Best Furnace direction:

- Use Pi's `firstKeptEntryId` compaction boundary because Furnace already has Pi-style parent-linked entries and an `active_leaf_id`.
- Use OpenCode's preflight plus overflow recovery shape: compact before a model call when the request is too large, and compact/retry once if the provider rejects for context length.
- Use Hermes' summary quality and hardening: reference-only summary prefix, latest-user-message-wins wording, exact active-state sections, deterministic fallback, secret redaction, tool-pair integrity, and "do not repeat stale tasks" guardrails.
- Use Headroom later as a separate live-zone optimizer for large tool results and subagent handoffs. It should complement session compaction, not replace it.

## Current Furnace Fit

Furnace is already close to the right persistence model:

- `src/session/store.ts` stores parent-linked entries and advances `active_leaf_id`.
- `src/session/types.ts` already reserves `compaction` and `branch_summary` entry types.
- `src/session/context.ts` currently replays every active-path entry verbatim into OpenRouter messages.
- `src/openrouter.ts` already has model context metadata from OpenRouter, and the TUI stores selected context length in preferences.

The important missing piece is context projection. `entriesToModelMessages()` should stop blindly replaying all entries once a compaction entry exists. It should build a compacted view:

1. Locate the latest `compaction` entry on the active path.
2. Emit one model-facing compaction summary message.
3. Emit entries from `firstKeptEntryId` through the compaction boundary.
4. Emit entries after the compaction boundary.

This keeps the full transcript durable in SQLite while shrinking what goes to the model.

## Pi

Relevant files:

- `packages/coding-agent/src/core/compaction/compaction.ts`
- `packages/coding-agent/src/core/compaction/utils.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/src/modes/interactive/components/compaction-summary-message.ts`
- `packages/coding-agent/test/compaction.test.ts`
- `packages/coding-agent/test/agent-session-compaction.test.ts`
- `packages/coding-agent/test/agent-session-auto-compaction-queue.test.ts`
- `packages/coding-agent/test/compaction-extensions.test.ts`

Pi is the closest structural match to Furnace.

Core shape:

- A `CompactionEntry` stores `summary`, `firstKeptEntryId`, `tokensBefore`, optional `details`, and `fromHook`.
- `buildSessionContext()` finds the latest compaction, emits a synthetic compaction-summary message, then emits the kept suffix and all post-compaction entries.
- The original entries remain in the session tree. Compaction changes model projection, not durable history.
- Manual compaction exists through `/compact`.
- Automatic compaction fires on threshold and context overflow.
- The `firstKeptEntryId` is an entry id, not an array index, so compaction survives migrations and tree semantics.

Algorithm:

- Estimate context tokens from provider usage when available, otherwise by message size.
- Trigger when `contextTokens > contextWindow - reserveTokens`.
- Walk backward from the newest entries until `keepRecentTokens` is preserved.
- Choose a valid cut point that never cuts at a tool result.
- If the cut splits a turn, summarize the turn prefix separately and keep the suffix.
- Summarize older messages with a structured template.
- If there was a previous summary, update it instead of starting from scratch.
- Track file operations from tool calls and append `<read-files>` / `<modified-files>` sections.

Strengths to copy:

- `firstKeptEntryId` is exactly right for Furnace's current session tree.
- Keeping durable history while changing model projection is the correct safety model.
- Threshold and overflow reasons are distinct.
- Mid-turn splits and tool-result boundaries are handled.
- Extension hooks can replace or cancel compaction.
- UI displays compaction as a collapsible summary instead of pretending nothing happened.

Weaknesses to avoid or improve:

- Summary wording is useful but less defensive than Hermes against stale task resumption.
- Token estimation is still rough in many cases.
- File operation tracking depends on known tool names and argument shapes.

## OpenCode

Relevant files:

- `packages/core/src/session/compaction.ts`
- `packages/core/src/session/history.ts`
- `packages/core/src/session/message.ts`
- `packages/core/src/session/event.ts`
- `packages/core/src/session/message-updater.ts`
- `packages/core/src/session/runner/llm.ts`
- `packages/core/src/config/compaction.ts`
- `packages/core/test/session-runner.test.ts`
- `packages/tui/src/context/data.tsx`

OpenCode's newer core models compaction as durable session events and projected context rows.

Core shape:

- `SessionMessage.Compaction` stores `reason`, `summary`, and `recent`.
- `SessionEvent.Compaction.Started`, `Delta`, and `Ended` represent lifecycle.
- `SessionHistory.load()` and `entriesForRunner()` load only messages at or after the latest compaction row, plus new system baseline updates.
- The runner calls `compactIfNeeded()` before the provider turn. If compaction happens, it rebuilds the prepared turn instead of continuing with stale request state.
- If the provider reports context overflow before assistant output starts, the runner calls `compactAfterOverflow()` and retries once.

Algorithm:

- Estimate the request size from the actual assembled system, messages, and tools.
- Compact if the request exceeds `context - max(output, buffer)`.
- Select a recent suffix by token budget.
- Summarize the older head using a strict markdown structure.
- Include a previous summary in `<previous-summary>` when updating.
- Persist the new compaction message and rebuild the request from the projected history.

Strengths to copy:

- Preflight compaction uses the actual request shape, including system and tool definitions.
- Overflow recovery is one-shot and explicit.
- Durable compaction lifecycle events are clean for TUI/RPC surfaces.
- Config is small: `auto`, `buffer`, `keep.tokens`.
- Context projection is simple after a compaction boundary.

Weaknesses to avoid or improve:

- It stores `recent` as text inside the compaction message. Furnace's entry tree can keep exact recent entries by `firstKeptEntryId`, which is better.
- Selection serializes the conversation to text and can split inside a serialized message. Pi/Hermes have more tool-pair integrity work.
- The summary prompt is good but less hardened than Hermes.

## Hermes Agent

Relevant files:

- `agent/context_compressor.py`
- `agent/conversation_compression.py`
- `agent/agent_init.py`
- `agent/turn_context.py`
- `tui_gateway/server.py`
- `tests/agent/test_context_compressor.py`
- `tests/agent/test_compression_progress.py`
- `tests/agent/test_compression_interrupt_protection.py`
- `tests/tui_gateway/test_compaction_status.py`
- `tests/run_agent/test_in_place_compaction.py`

Hermes has the most battle-tested compressor behavior and the most operational hardening.

Core shape:

- `ContextCompressor` summarizes the middle of the conversation while protecting the head and a token-budget recent tail.
- `conversation_compression.compress_context()` runs the compressor, rebuilds the system prompt, persists the compacted transcript, and notifies memory/context engines.
- Historically Hermes rotated session ids at compression boundaries. It now also supports in-place compaction, which keeps the same session id and archives old rows as inactive instead of deleting them.
- The gateway re-tags compaction lifecycle status so desktop/TUI surfaces can show "Summarizing..." rather than appearing to reset silently.

Algorithm and protections:

- Use token-budget tail protection, not only a fixed number of messages.
- Keep the latest user message and latest visible assistant reply in the protected tail.
- Align boundaries to avoid splitting tool-call/tool-result groups.
- Prune old large tool outputs before the LLM summary call.
- Redact secrets before sending content to the summarizer and after the summary comes back.
- Use a structured summary with exact files, commands, active state, blocked state, decisions, resolved questions, and relevant files.
- Prefix summaries as reference-only context and explicitly say the latest user message after the summary wins.
- Strip legacy prefixes when updating summaries so old bad instructions do not survive.
- Add a deterministic fallback summary if LLM summarization fails.
- Abort without dropping messages on auth failures or hard summary failures.
- Protect the summary call from mid-flight interrupt.
- Track progress by row-count reduction or material token reduction, not only by message count.

Strengths to copy:

- The summary wording is the best of the inspected systems.
- Latest-user-message anchoring avoids the worst compaction bug: losing or re-answering the active task.
- Deterministic fallback is much better than a blank "messages were removed" marker.
- Secret redaction is mandatory for persisted summaries.
- In-place archival is the right long-term persistence model: live context shrinks, original rows remain searchable/recoverable.

Weaknesses to avoid or simplify:

- Session rotation created many bugs. Furnace should not rotate session ids for compaction.
- The implementation has accumulated a lot of platform-specific recovery paths. Furnace can start with a smaller core because its session store and UI are simpler.
- The Python compressor owns too much operational state. Furnace should keep compaction as a small session/context module plus CLI orchestration.

## Headroom

Relevant files:

- `wiki/ARCHITECTURE.md`
- `wiki/compression.md`
- `wiki/transforms.md`
- `wiki/typescript-sdk.md`
- `wiki/shared-context.md`
- `wiki/LIMITATIONS.md`
- `headroom/proxy/server.py`
- `headroom/transforms/pipeline.py`
- `headroom/transforms/content_router.py`
- `headroom/transforms/smart_crusher.py`
- `headroom/shared_context.py`
- `sdk/typescript/src/compress.ts`
- `sdk/typescript/src/client.ts`
- `tests/test_proxy_compress_endpoint.py`

Headroom is not primarily session compaction. It is a request and tool-output compression system.

Current source direction:

- The pipeline docstring says live-zone-only compression is now the strategy; message-list mutation and rolling-window history dropping were retired from the default pipeline.
- `TransformPipeline` runs `CacheAligner` and `ContentRouter`, with a circuit breaker that passes messages through after repeated failures.
- `ContentRouter` avoids compressing user/system messages by default, protects recent code, protects code during analysis/review/debug intent, protects many recent reads, and compresses eligible old string/tool payloads.
- `SmartCrusher` is Rust-backed and focuses on JSON arrays/tool outputs. It uses lossless-first compaction when possible and lossy row dropping with CCR markers when needed.
- `/v1/compress` returns compressed messages and metrics: `tokens_before`, `tokens_after`, `tokens_saved`, `compression_ratio`, `transforms_applied`, and `ccr_hashes`.
- The TypeScript SDK calls the proxy. It can return original messages on proxy failure with `fallback: true`.
- `SharedContext` compresses inter-agent handoffs while keeping originals retrievable.

What Headroom is good for:

- Large JSON tool results.
- Logs, search output, and repetitive structured output.
- Reversible compression where the original can be retrieved by a CCR hash.
- Prefix-cache-aware decisions and metrics around token savings.
- Inter-agent handoffs where a child or peer does not need the full raw payload up front.

What Headroom is not good for as the primary Furnace compactor:

- It does not create a durable session checkpoint summary.
- The TypeScript SDK relies on a running proxy for real compression.
- Request-level compression should not be the only defense against long-running session drift.
- Some docs still describe older rolling-window/message-drop behavior, while source says live-zone-only compression is the current default.

Best Furnace use of Headroom:

- Later, add optional "live output compression" for very large `tool_result` entries before model replay.
- Add a Furnace-native CCR store under `.furnace/compression/` rather than requiring Headroom proxy at first.
- Consider Headroom-compatible HTTP integration only as an opt-in adapter after Furnace has native session compaction.
- Borrow its safety posture: fail open to original content, never mutate user/system text by default, protect recent code and active analysis context, and record compression savings.

## Recommended Furnace Design

### Phase 1: Native Session Compaction

Add a Furnace-native `CompactionEntryData`:

```ts
type CompactionEntryData = {
  kind: "context_compaction"
  reason: "manual" | "threshold" | "overflow"
  summary: string
  firstKeptEntryId: string
  tokensBefore: number
  tokensAfter?: number
  model: string
  focus?: string
  details?: {
    readFiles?: string[]
    modifiedFiles?: string[]
    summarizedEntryCount?: number
  }
}
```

Use the existing `EntryType = "compaction"` instead of adding a new table.

Projection rule:

- No compaction entry: replay entries as today.
- Latest compaction entry exists: emit the compaction summary, then replay from `firstKeptEntryId` through the latest leaf using the active path.
- Keep hidden/custom mode entries out of model context unless their current type already maps to a model message.

Summary message shape:

- Use a model-facing `user` message, not `system`, so it sits inside chronological conversation context and does not compete with base system policy.
- Prefix it with a Hermes-style reference-only banner.
- Include an end marker that says to respond to messages below the summary, not the summary itself.

Manual UX:

- Add `/compact [focus]`.
- Show a compacting status in the TUI.
- After success, show a collapsed `compaction` transcript block with tokens before/after and expand support later.
- Keep the full transcript visible in history if possible; compaction affects model context, not what the user can review.

### Phase 2: Triggering

Add automatic compaction after the native path is stable.

Use three triggers:

- Manual: `/compact [focus]`.
- Threshold preflight: before a model/tool turn, estimate the full request including system prompts, runtime context, tools, and active session entries. Compact if estimated tokens exceed `contextLength - reserveTokens`.
- Overflow recovery: if OpenRouter returns a context-length error before usable assistant output, compact and retry once.

Suggested defaults:

- `enabled: true`
- `reserveTokens: 16_000`
- `keepRecentTokens: 20_000`
- If the selected context is <= 64K, keep recent around 25% of context and reserve at least 8K.
- Use `config.modelSettings.contextLength` when selected, otherwise OpenRouter model metadata when available, otherwise a conservative fallback.

Avoid repeated compaction loops:

- Do not compact if the latest active-path entry is already `compaction`.
- Track `tokensAfter`; if compaction saves less than 5% and does not reduce entry count, warn and stop auto-retrying.
- On overflow, retry once only.

### Phase 3: Summary Quality

Use the current model or a configured auxiliary model:

- Add `FURNACE_COMPACTION_MODEL` later.
- Until then, use the active model for best continuity. Do not default to the title model because title models are often too weak for high-risk summaries.

Summary prompt should borrow Hermes heavily:

- "Reference only; latest user message wins."
- "Do not answer questions from the compacted turns."
- "Do not resume stale historical remaining work unless the newest user message asks for it."
- "Preserve exact file paths, commands, error strings, decisions, tests, and changed files."
- "Never include secrets; replace credentials with `[REDACTED]`."
- Include sections:
  - Historical Task Snapshot
  - Goal
  - Constraints & Preferences
  - Completed Actions
  - Active State
  - Historical In-Progress State
  - Blocked
  - Key Decisions
  - Resolved Questions
  - Historical Pending User Asks
  - Relevant Files
  - Historical Remaining Work
  - Critical Context

Summarizer input should serialize entries like Pi/OpenCode:

- Convert entries to labeled text.
- Truncate tool results to a bounded size.
- Include tool call names and arguments.
- Preserve tool call/result pairing in the serialized view.
- Redact secrets before sending to the summarizer.

### Phase 4: Headroom-Style Live Compression

This should come after native compaction, not before.

Add optional per-tool-result compression for model replay:

- Keep full `tool_result` entry content in SQLite.
- Add optional replay metadata such as `modelContent` or a future `tool_result_projection` entry.
- For huge JSON arrays/logs/search output, create a compressed projection plus a retrieval tool.
- Store originals under `.furnace/compression/` or reuse `.furnace/tool-output/`.
- Add a `retrieve_compressed` tool only when the current model context contains retrieval markers.

This gives Furnace Headroom's biggest win without outsourcing the core session model.

### Phase 5: Branch And Search Integration

After compaction is stable:

- Add branch summary support when moving `active_leaf_id` away from a branch, like Pi.
- Add session FTS that searches both live and compacted/archive entries.
- Add compaction metadata to `/history` and future session details.
- Allow "reinflate from compaction" actions for debugging or export.

## Implementation Notes For Furnace

Files likely to change:

- `src/session/types.ts`: add `CompactionEntryData`.
- `src/session/store.ts`: add `appendCompaction()` convenience method.
- `src/session/context.ts`: add compacted context projection.
- `src/compaction.ts` or `src/session/compaction.ts`: token estimates, cut-point selection, serialization, prompt rendering, summary generation.
- `src/cli.ts`: `/compact`, preflight, overflow recovery, TUI status.
- `src/openrouter.ts`: classify context-overflow errors and optionally expose usage if OpenRouter returns it.
- `src/ui/ink-terminal.tsx`: render compaction status/summary.
- `docs/design-choices.md`: add the compaction provenance and local decision.
- `docs/compaction.md`: add user-facing behavior once implemented.

Tests to add:

- Projection with no compaction replays all messages.
- Projection with compaction emits summary plus suffix from `firstKeptEntryId`.
- Hidden entries remain hidden after projection.
- Cut-point selection never starts at a `tool_result`.
- Tool-call/tool-result groups stay valid.
- Previous summary is updated rather than duplicated.
- `/compact` rejects tiny sessions with a useful message.
- Overflow recovery retries once and does not loop.
- Summary fallback does not drop messages on hard summarizer failure.
- Secret redaction removes `.env`-style values from summaries.

## Final Recommendation

Build native session compaction first. Furnace should not start by wiring Headroom into the request path, because that solves tool-output bloat but not long-running session drift.

The best first cut is:

1. Pi storage semantics: `compaction` entry with `firstKeptEntryId`.
2. OpenCode triggering: preflight threshold plus one-shot overflow recovery.
3. Hermes summary hardening: reference-only, latest-message-wins, active-state sections, redaction, deterministic fallback.
4. Furnace-specific projection: keep SQLite append-only and change only model-facing context assembly.

Then add Headroom-style live compression as a second layer for oversized tool outputs, subagent handoffs, and possibly a future reversible retrieval tool. That combination gives Furnace both durable long-session continuity and lower per-turn token bloat.

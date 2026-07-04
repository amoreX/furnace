---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
created: 2026-07-03
plan_type: feat
---

# feat: Interleaved tool narration + remove tool line indent

## Goal Capsule

Two related TUI improvements: (1) remove the `│` separator and leading spaces from tool summary lines, and (2) keep the assistant block alive through tool execution by interleaving narration text with tool calls instead of clearing it when tools start.

## Problem Frame

**Spacing:** Tool summary lines render as `  │ ✓ Read File src/cli.ts`. The `│` border and surrounding spaces add visual noise the user does not want.

**Assistant block disappears:** When a tool starts, `streamingText` is cleared and `setStreamingContent("")` is called, wiping any narration text the model had sent before the tool. The "Assistant" label only reappears when the model next emits text. During multi-tool turns the user sees a floating tool list with no assistant context, and the block only materializes with the final streamed response.

**User request:** Remove the indent/border on tool lines. Interleave narration, tool calls, and the spinner under a persistent "Assistant" block so the turn reads like a coherent conversation rather than a detached tool log.

## Requirements

- R1: Tool summary lines have no `│` separator and no leading indent.
- R2: Narration text emitted before each tool call is preserved and shown inline above that tool's activity line.
- R3: The "Assistant" header appears once at the top of a live turn as soon as any content is available (thinking spinner, narration, or a tool call), and persists through the entire turn.
- R4: The thinking spinner appears inside the "Assistant" block after the last completed tool.
- R5: The committed history view (transcript lines after turn completes) is not broken; existing behavior of tool lines + final assistant message is preserved.
- R6: TypeScript compiles clean.

## Scope Boundaries

**In scope:** `src/ui/ink-terminal.tsx` rendering, `src/cli.ts` `onToolStart`/`onToolResult` callbacks.

**Deferred to Follow-Up Work:**
- Preserving interleaved narration in committed history (currently the committed assistant message holds all narration as a flat block; restructuring transcript storage to interleave is a larger change).
- Detail line indentation revisit (addition/deletion/meta tones keep their `"  "` prefix for now; they're children of a summary line and need some visual separation).

**Out of scope:** Changes to specialized formatters (edit, write, ask_question, etc.).

---

## Key Technical Decisions

- **KTD1: `narrationBefore?: string` field on `ToolActivity`.** Captures the streaming text accumulated before each tool call. Populated in `onToolStart` before `streamingText` is cleared. Preserved in `onToolResult` when the activity object is rebuilt.
- **KTD2: `buildLiveLines` renders a single "Assistant" block.** Hoist the "Assistant" `role` line to the top; iterate tool activities with their `narrationBefore`; append current `streamingContent`; append spinner. `appendToolLines` (used by committed history) is unchanged — it does not render `narrationBefore`.
- **KTD3: Summary tone loses the `│` prefix.** The `TranscriptLine` component switches from `"  │ "` to no prefix for the `summary` toolTone. Detail lines (`addition`, `deletion`, `meta`, `context`) keep their `"  "` to remain visually subordinate to the summary.

---

## Implementation Units

### U1. Remove `│` separator from tool summary lines

**Goal:** Clean up the visual noise on tool summary lines.

**Requirements:** R1

**Dependencies:** none

**Files:**
- `src/ui/ink-terminal.tsx`

**Approach:**

In `TranscriptLine`, find the `toolTone === "summary"` branch:
```tsx
// before
return <Text><Text color={theme.colors.mutedForeground}>{"  │ "}</Text><Text color={color} bold>{line.text}</Text></Text>

// after: no prefix, just the colored bold text
return <Text color={color} bold>{line.text}</Text>
```

The trailing fallback `return <Text color={color}>{"  "}{line.text}</Text>` (for tool lines without a recognized tone) can also drop its `"  "` prefix.

**Test scenarios:**
- Test expectation: none — pure rendering change, visual smoke-check sufficient.

**Verification:** Run `npm run dev`, confirm tool lines like `✓ Read File src/cli.ts` appear flush left with no `│` or leading spaces.

---

### U2. Capture narration text before each tool call

**Goal:** Preserve the streaming text that preceded each tool call so it can be shown inline.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**
- `src/ui/ink-terminal.tsx` (type definition)
- `src/cli.ts` (`onToolStart`, `onToolResult`)

**Approach:**

Add `narrationBefore?: string` to `ToolActivity` in `ink-terminal.tsx`:
```
export type ToolActivity = {
  args: string
  id: string
  name: string
  narrationBefore?: string   // ← new
  result?: string
  status: "running" | "done" | "failed"
}
```

In `cli.ts` `onToolStart`: capture `streamingText` before clearing it, attach it to the new activity:
```
onToolStart: (call) => {
  const narrationBefore = streamingText   // capture before clear
  streamingText = ""
  terminal?.setStreamingContent("")
  // ... existing store.appendToolCall ...
  toolActivities.push({ args: call.arguments, id: call.id, name: call.name, narrationBefore, status: "running" })
  // ... existing setToolActivities / setThinking ...
}
```

In `cli.ts` `onToolResult`: the activity object is rebuilt from scratch — carry `narrationBefore` forward:
```
const existing = toolActivities[index]
const activity = { args: call.arguments, id: call.id, name: call.name, narrationBefore: existing?.narrationBefore, result: content, status } satisfies ToolActivity
```

Empty-string `narrationBefore` is treated as absent (no narration to render).

**Patterns to follow:** Existing `onToolStart` / `onToolResult` shape in `cli.ts` around line 1471–1499.

**Test scenarios:**
- Happy path: model emits text, then a tool starts → `narrationBefore` on the pushed activity equals the accumulated `streamingText` at that moment.
- Edge case: tool starts with no preceding text → `narrationBefore = ""`, nothing rendered.
- Edge case: two sequential tools → second activity's `narrationBefore` is the text between the two tool calls (empty if model goes tool→tool with no text gap).
- Regression: `onToolResult` preserves `narrationBefore` from the running activity.

**Verification:** TypeScript compiles. Running a prompt that causes multi-tool execution shows each tool's preceding narration inline in the TUI.

---

### U3. Refactor `buildLiveLines` to interleave narration + tools

**Goal:** One persistent "Assistant" block that shows narration, tools, and spinner in sequence instead of a detached floating tool list.

**Requirements:** R2, R3, R4, R5

**Dependencies:** U2

**Files:**
- `src/ui/ink-terminal.tsx` (`buildLiveLines`)

**Approach:**

Replace the body of `buildLiveLines` with:

1. Return early if no content at all (no activities, no streaming text, not thinking).
2. Push a single `{ kind: "role", role: "assistant", text: "Assistant" }` line.
3. For each activity in `latestTodoActivityOnly(toolActivities)`:
   a. If `activity.narrationBefore` is non-empty, call `appendWrappedContentLines` on it.
   b. Push the tool's formatted `RenderedToolLine` entries as `kind: "tool"` lines.
4. If `streamingContent` is non-empty and not `thinking`: call `appendWrappedContentLines` on it.
5. If `thinking`: push a spinner line with `${thinkingMessage} [Esc to stop]`.
6. Push a trailing blank line.

The `appendToolLines` function remains untouched — it is used by `toolActivitiesToLines` (committed history) and `buildTranscriptLines` (history view). Those paths do not render `narrationBefore`. R5 is satisfied because the committed turn is built from `toolActivitiesToLines` + the assistant message content, both unchanged.

The `latestTodoActivityOnly` de-duplication logic is preserved (moved into the iteration in step 3 above).

**Patterns to follow:**
- Existing `appendWrappedContentLines` signature: `(lines, content, message, messageIndex, width)` — pass a fake message `{ role: "assistant", content: narrationBefore }` for the narration segments.
- `appendToolLines` as the pattern for tool line shape.

**Test scenarios:**
- Happy path — model narrates, calls tool, narrates more, calls another tool, final text:
  - Output: "Assistant" header → narration 1 → tool 1 lines → narration 2 → tool 2 lines → current text
- Edge case — tool called with no preceding narration: `narrationBefore = ""` → nothing rendered between header and tool 1
- Edge case — no tools, only streaming text: "Assistant" header → streamed text
- Edge case — only thinking, no tools, no text: "Assistant" header → spinner
- Edge case — tool running + thinking spinner (between tool result and next text): "Assistant" header → completed tool → spinner
- Edge case — no content at all: function returns empty array (no "Assistant" header)
- Regression — committed history unchanged: `toolActivitiesToLines` output and `appendMessageLines` output unchanged

**Verification:** `npm run typecheck` passes. Running `npm run dev` with a multi-step prompt shows the "Assistant" header staying in place through all tool calls, with any narration text appearing inline before each tool.

---

## Verification Contract

1. `npm run typecheck` passes with zero new errors.
2. Smoke test: run a prompt causing 3+ tool calls. Confirm in TUI:
   - "Assistant" label appears from the first thinking state and does not disappear between tools.
   - Any narration text before a tool appears above that tool's summary line.
   - Tool summary lines have no `│` prefix and no leading spaces.
3. Regression: open `/history`, confirm prior turns still render correctly (tool lines then assistant message, no duplication).

## Definition of Done

- U1, U2, U3 committed to main.
- `npm run typecheck` clean.
- Smoke test passes.
- No regression in committed history rendering.

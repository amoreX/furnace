---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
created: 2026-07-03
plan_type: feat
---

# feat: Human-readable tool call one-liners in TUI

## Goal Capsule

Replace raw parameter dumps in tool call activity lines with clean, human-readable one-liners ("Read example.js", "Grep \"pattern\" in src/", "Run Command npm test") while preserving detailed diff/preview lines that already exist for specialized formatters.

## Problem Frame

The TUI currently renders unrecognized tool calls using the raw tool name plus compact parameter text:

```
⏱ read path: "src/cli.ts"
⏱ bash command: "npm test"
```

Specialized formatters (edit, write, ask_question, task, todo, skill_manage) already produce clean summaries. The fallback path and its error variant do not. The goal is to bring the fallback path to the same quality as the specialized ones.

## Requirements

- R1: Tool call summary lines use a human-friendly verb label (not the raw tool name).
- R2: The most meaningful argument is extracted and appended as a clean subject (no `key: "value"` format).
- R3: Per-tool logic selects the right field: path for read/write/ls/glob/find, pattern for grep, command for bash/execute, query for websearch, url for webfetch.
- R4: Long subjects are truncated to fit the terminal width.
- R5: The error tone fallback also uses the human-readable summary (error color is preserved).
- R6: Existing specialized formatter output (edit, write, ask_question, task, todo, skill_manage, skill) is unchanged.
- R7: No new external dependencies introduced.

## Scope Boundaries

**In scope:** The fallback summary line in `formatToolActivity` and its error variant.

**Deferred to Follow-Up Work:**
- Showing abbreviated tool result inline for non-specialized tools (currently dropped; can be added later if wanted).
- Adding more tool-specific formatters (e.g., a rich `bash` multi-line preview showing output).

**Out of scope:** Changes to how specialized formatters (edit, write, ask_question, etc.) render their summary or detail lines.

---

## Key Technical Decisions

- **KTD1: Add `summarizeToolCall(name, args, width)` helper.** It replaces `activity.name + formatToolArgs(args, width)` in both fallback lines. `friendlyToolName()` already exists for the label; the new function handles argument extraction and clean formatting. Keeps `compactToolArgs` intact as an internal utility.
- **KTD2: Per-tool argument extraction via a dispatch table.** A plain object maps tool name → extractor function (or key array). Unmapped tools fall back to extracting the first string value found in the parsed args. This avoids a long if/else chain and is easy to extend.
- **KTD3: Drop `formatToolResult` from the fallback summary.** Specialized formatters do not include a result on the summary line; the fallback should match. Error-case result is still useful but only shown inline with the error tone, not appended to the one-liner.

---

## Implementation Units

### U1. Add `summarizeToolCall` and wire into `formatToolActivity`

**Goal:** Replace raw param dumps with human-readable one-liners in the fallback (non-specialized) code path.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** none

**Files:**
- `src/ui/ink-terminal.tsx`

**Approach:**

Add `summarizeToolCall(name: string, args: string, width: number): string` near the existing `friendlyToolName` function (line ~1895). The function:

1. Gets the label via `friendlyToolName(name)`.
2. Parses `args` as JSON (catch parse errors and return label only).
3. Looks up a per-tool extractor in a dispatch table that maps tool name to one or more argument keys, in priority order:
   - `read` / `Read` → `file_path`, `path`
   - `ls` / `glob` / `find` → `directory_path`, `path`, `patterns`
   - `grep` → `pattern`, `query`; optionally append short path/directory context
   - `bash` / `execute` → `command`
   - `websearch` → `query`
   - `webfetch` / `fetch_url` → `url`
   - `task_status` → no extra arg (label only)
   - unmapped → first string value in the parsed record
4. Truncates the extracted subject to `Math.max(16, Math.min(60, width - label.length - 4))`.
5. Returns `label` when no subject found, or `${label} ${subject}` when found.

For `grep`, apply light cleanup: if the pattern is a simple string, show it unquoted if short (≤ 20 chars), quoted otherwise. Append a directory/file hint if `path` or `directory` key is present (e.g., "Grep pattern in src/").

In `formatToolActivity` (line 1847), replace the two fallback lines:

```
// before (both error and summary fallback):
`${statusSymbol(activity.status)} ${activity.name}${formatToolArgs(activity.args, width)}${formatToolResult(activity.result, width)}`

// after:
`${statusSymbol(activity.status)} ${summarizeToolCall(activity.name, activity.args, width)}`
```

The error case keeps its `tone: "error"` and the summary case keeps `tone: "summary"`. `formatToolArgs` and `compactToolArgs` remain in the file as internal helpers (used nowhere else after this change but kept for potential future use).

**Patterns to follow:**
- `friendlyToolName` at line ~1895 for label lookup shape.
- `parseJsonRecord` / `stringField` at lines ~2129–2142 for safe JSON parsing.
- `truncateEnd` used throughout for width-bounded text.
- Existing specialized formatters for how summary tone lines are structured.

**Test scenarios:**
- Happy path — `read` with `file_path` arg → "Read src/cli.ts"
- Happy path — `bash` with `command` arg → "Run Command npm test"
- Happy path — `grep` with `pattern` arg and `path` arg → "Grep pattern in src/"
- Happy path — `ls` with `directory_path` → "List Directory src/ui/"
- Happy path — `websearch` with `query` → "Web Search react hooks"
- Edge case — unknown tool name → `friendlyToolName` returns raw name, first string value used as subject
- Edge case — args is malformed JSON → returns label only, no crash
- Edge case — very long subject → truncated to fit width
- Edge case — no meaningful string arg found → label only (no trailing space or empty subject)
- Error tone — `activity.status === "failed"` fallback uses `summarizeToolCall` with error tone preserved
- Regression — `edit` / `write` / `ask_question` / `task` / `todo` / `skill_manage` specialized paths are unaffected (their branch returns before reaching the fallback)

**Verification:**
- TypeScript compiles with `npm run typecheck` (no new errors).
- Visually: run `npm run dev` and invoke tools like Read, Grep, Bash — confirm summary lines read as "Read foo.ts", "Grep ...", "Run Command ..." rather than raw param text.
- Regression: existing edit/write diffs still render with addition/deletion tones.

---

## Verification Contract

1. `npm run typecheck` passes with zero new errors.
2. Manual smoke: at least one tool call of each mapped type (read, grep, bash, ls, websearch) shows a clean one-liner in the TUI.
3. Specialized formatter output (edit, write, ask_question, task, todo) is visually unchanged.

## Definition of Done

- U1 merged to main.
- `npm run typecheck` clean.
- No regressions in specialized formatter display.

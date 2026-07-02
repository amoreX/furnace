---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: TUI copy, command naming, and markdown rendering revamp

## Summary

Furnace's TUI currently reads as unpolished in three concrete ways: nearly all user-visible copy is lowercase with no sentence casing, two slash commands (`/reset-perms`, and `/history`'s discoverability) don't match the naming conventions established by Claude Code and Gemini CLI, and the hand-rolled markdown renderer doesn't visually distinguish fenced code blocks (and can misparse code content as bold/italic). This plan fixes all three, plus a bounded visual-identity pass on theme display names and panel title consistency.

**Product Contract preservation:** No upstream Product Contract exists for this work (`product_contract_source: ce-plan-bootstrap`) — this plan originates directly from a user request, confirmed via clarifying questions (see Sources & Research).

---

## Problem Frame

Furnace's Ink TUI (`src/ui/ink-terminal.tsx`, `src/ui/components/`) was built with an intentionally minimal micro-copy style: hint-bar shortcuts (`"up/down navigate"`, `"enter select"`), status labels (`"thinking"`), and panel copy are all lowercase with no punctuation. This reads as unfinished next to Claude Code, Gemini CLI, and other terminal agents, which use sentence case consistently. Two command names also don't match the vocabulary those tools established: `/reset-perms` (Claude Code's equivalent is `/permissions`) and `/history`, whose closest industry analogue is `/resume`. Separately, `/history` has an unintentional-looking typo alias, `/historu`, that should be removed. Finally, the existing markdown renderer (`MarkdownLine`/`InlineMarkdown` in `src/ui/ink-terminal.tsx`) handles headings, lists, quotes, and tables reasonably well, but fenced code blocks are only marked by a `▸ lang` line at the fence boundary — the code body itself is not visually set apart, and every code line is still run through the same inline `**bold**`/`*italic*`/`` `code` `` regex parser used for prose, meaning code containing underscores or asterisks can render with spurious formatting.

## Scope Boundaries

**In scope:**
- Sentence-case copy pass across every user-visible TUI string (hint bars, panel titles, status/mode labels, placeholders, thinking indicator)
- Rename `/reset-perms` -> `/permissions`; rename `/history` -> `/resume` with `/history` kept as a discoverable alias; remove the `/historu` typo alias
- Fenced code block rendering: visually distinct style, and inline markdown parsing disabled inside code fences
- Theme picker display labels: human-readable, properly-cased labels (e.g. "Tokyo Night", "Rosé Pine") shown in the `/theme` picker and status line, decoupled from the lowercase-kebab theme `name` id used for lookup/config
- Regression test updates and additions covering all of the above

**Deferred to Follow-Up Work:**
- Full syntax highlighting inside code blocks (token-level coloring) — out of scope; this plan only adds block-level visual separation
- A ground-up rewrite of the markdown renderer onto an AST library (e.g. `marked`) — considered and rejected for this pass (see KTD3); may be revisited later if further markdown gaps surface
- Broader visual/theme redesign (new color palettes, layout restructuring) beyond display-label casing and panel-title consistency
- Updating `docs/tools.md`, `docs/design-choices.md`, `docs/interaction-model.md` references to `/reset-perms` — per repo convention, docs are not touched unless explicitly requested

---

## Requirements

- **R1**: Every user-visible TUI string uses sentence case (first letter capitalized, no other forced capitalization) instead of all-lowercase micro-copy.
- **R2**: `/permissions` replaces `/reset-perms` as the primary command name; the old name is not silently broken (either removed cleanly or, if kept, documented as legacy — this plan removes it since no external callers depend on it).
- **R3**: `/resume` replaces `/history` as the primary command name; `/history` continues to work as an alias. `/historu` is removed.
- **R4**: Fenced code blocks in assistant messages render with a visually distinct style (bordered or otherwise set apart from prose) and are not subject to inline bold/italic/code-span parsing.
- **R5**: Theme names shown to the user in the `/theme` picker and status line are properly cased, human-readable labels; the lowercase-kebab `name` id used for `/theme <name>` and storage is unchanged.

## Assumptions

- No existing external tooling or scripts depend on the exact strings `/reset-perms` or `/historu` (both are Furnace-internal TUI commands with no documented public contract beyond the docs files explicitly deferred above).
- "Sentence case" means capitalizing the first letter of each discrete label/hint/sentence, not full Title Case — this matches Claude Code and Gemini CLI's own copy conventions observed during research.

---

## Key Technical Decisions

**KTD1 — Command renames keep old names as silent removals, not deprecation shims.** `/reset-perms` and `/historu` are internal-only commands with no external callers found in the codebase or docs beyond the three doc files already deferred. Adding deprecation-alias shims would add permanent complexity for no real migration need. `/history` is kept as a true alias (not deprecated) because it's a plausible, intuitive command someone would type from muscle memory with other CLIs.

**KTD2 — Sentence-case is enforced by direct string edits, not a runtime transform.** A runtime "capitalize first letter" wrapper around every string would hide bugs (e.g. strings that intentionally start with a symbol) and add indirection for no benefit in a codebase where these strings are static literals. Every literal is edited in place.

**KTD3 — Fenced code blocks get a targeted fix inside the existing line-based renderer, not a rewrite onto an AST library.** Research into how Ink-based agent CLIs render markdown surfaced two approaches: (a) pipe parsed markdown through `marked-terminal`-style ANSI string generation, which targets raw stdout and fights Ink's own layout/wrapping engine, and (b) walk a `marked`-produced AST and map nodes to Ink `Text`/`Box` components directly, which is more idiomatic for Ink but is effectively a full rewrite of the existing renderer (which already correctly handles headings, ordered/unordered lists, blockquotes, and markdown tables with custom column-width logic tuned to terminal width). The concrete, user-reported gap is narrower: code fences aren't visually set apart and their content can be misparsed as prose formatting. Fixing that inside the existing per-line renderer (track fence-open state in `appendWrappedContentLines`, skip `InlineMarkdown` parsing for lines inside a fence, and give fenced lines their own `TranscriptLineData` kind/tone) is lower-risk and directly closes the gap without touching the parts of the renderer that already work. A full AST-based rewrite is recorded as deferred, not rejected outright, in case future markdown gaps (nested lists, mixed inline+block constructs) make the line-based approach's limits a real problem.

**KTD4 — Theme display labels are a presentation-only addition, not a rename of the theme `name` id.** `/theme <name>` and any persisted theme selection use the existing lowercase-kebab `name` (`"tokyo-night"`, `"rosepine"`, etc.). Changing the id would be a breaking change to anyone who has already typed `/theme tokyo-night`. Instead, `ThemeChoice` gains a `displayLabel` used only where the theme is shown to the user (the `/theme` picker list and the status line), leaving `name` as the stable lookup key.

---

## Implementation Units

### U1. Rename slash commands and remove the typo alias

**Goal:** `/permissions` and `/resume` become the primary names for the permission-reset and session-history commands, matching Claude Code/Gemini CLI naming; `/historu` is removed.

**Requirements:** R2, R3

**Dependencies:** None

**Files:**
- `src/commands.ts`
- `src/cli.ts`
- `src/ui/ink-terminal.tsx` (any hint copy or panel text that names these commands)
- `test/smoke.test.mjs`

**Approach:**
- In `src/commands.ts`: rename the `/reset-perms` entry to `/permissions` (update its description too, per R1); rename the `/history` entry's primary `name` to `/resume`, keep `/history` in its `aliases` array, and drop `/historu` from aliases entirely.
- In `src/cli.ts`: update every `command.name === "/reset-perms"` check to `"/permissions"`; confirm `isHistoryCommand` and any `command.name === "/history"` checks still resolve correctly given `/resume` is now primary (the alias-matching helper should key off the definition's name + aliases rather than a hardcoded string, so both `/resume` and `/history` route to the same handler).
- Grep for any remaining hint/status text elsewhere in `ink-terminal.tsx` that mentions `/reset-perms` or `/history` by name and update it.

**Patterns to follow:** Existing `slashCommandNames` set construction and `isKnownSlashCommand`/`isHistoryCommand` helpers in `src/commands.ts`.

**Test scenarios:**
- `parseSlashCommand("/permissions")` and `parseSlashCommand("/resume")` resolve to known commands via `isKnownSlashCommand`.
- `isKnownSlashCommand("/reset-perms")` and `isKnownSlashCommand("/historu")` both now return `false`.
- `isHistoryCommand("/resume")` and `isHistoryCommand("/history")` both return `true` (update the existing test at `test/smoke.test.mjs` covering `isKnownSlashCommand("/history")`).
- The `/permissions` command still triggers the same reset behavior as the old `/reset-perms` did (existing behavioral test, if any, updated to the new name; otherwise a new one asserting the command dispatches to `resetCurrentSessionPermissions`).

**Verification:** `npm run typecheck` and `npm run test` pass; typing `/permissions` or `/resume` in the TUI (manual `tuistory` check) shows the correct autocomplete entries and no stale `/reset-perms`/`/historu` entries appear.

---

### U2. Sentence-case copy pass across the TUI

**Goal:** Every user-visible string in the TUI uses sentence case instead of all-lowercase micro-copy.

**Requirements:** R1

**Dependencies:** U1 (rename first so descriptions are written once, in final form)

**Files:**
- `src/commands.ts` (command descriptions)
- `src/ui/ink-terminal.tsx` (hint-bar builder functions, thinking indicator default, panel titles, mode/status labels)
- `src/ui/components/prompt-input.tsx` (placeholder text, if not already sentence-cased)
- `src/ui/components/app-shell.tsx` (status line composition, if any lowercase fragments)

**Approach:**
- Audit every hint-bar builder (the functions returning arrays like `["up/down navigate", "enter select", "esc deny"]`) and rewrite each fragment in sentence case: `"Up/down to navigate"`, `"Enter to select"`, `"Esc to dismiss"` — keep them short, matching the existing terse style, just properly cased and with clearer prepositions where the current phrasing reads as keyword-soup rather than an instruction.
- Rewrite the default `thinkingMessage` (currently `"thinking"`) to `"Thinking"`, and audit any other bare status words (`"working in background"`, task status labels, etc.).
- Audit panel titles/headers in `ApprovalPrompt`, `QuestionPrompt`, `PlanActionPanel`, `TaskPanel`, `QueuedPromptPanel` for lowercase labels and correct them.
- Audit `slashCommandDefinitions` descriptions in `src/commands.ts` — most already look sentence-cased; fix any stragglers.
- Do not change internal identifiers (mode values like `"agent"`/`"plan"`, theme `name` ids, focus enum values) — only user-facing rendered text.

**Patterns to follow:** Existing sentence-cased descriptions already present in `slashCommandDefinitions` (e.g. `"Clear the conversation display"`) as the target style for consistency.

**Test scenarios:**
- `Test expectation: none -- this is a text-content-only change with no new branching logic; coverage is via the existing structural/smoke tests that already assert on specific hint or label strings (update those literal-string assertions to match the new casing rather than adding new tests).`
- Explicitly re-check `test/smoke.test.mjs` for any test asserting an exact lowercase string (e.g. hint text, thinking message) and update the expected value to the new sentence-cased string so the suite doesn't silently drift from the UI.

**Verification:** `npm run typecheck` and `npm run test` pass with updated string assertions; a `tuistory` snapshot of the idle screen, an active approval prompt, and the task panel show consistent sentence-cased copy throughout.

---

### U3. Theme display labels and panel-title consistency

**Goal:** Themes are shown to the user with properly-cased, human-readable names; panel titles/borders are consistent in casing and phrasing across all panels.

**Requirements:** R5, R1 (panel titles)

**Dependencies:** U2 (do this after the general casing pass so it isn't redone twice)

**Files:**
- `src/ui/terminal-themes/index.ts`
- `src/ui/ink-terminal.tsx` (theme picker rendering, status line theme name display)

**Approach:**
- Add a `displayLabel` field to `ThemeChoice` (e.g. `{ name: "tokyo-night", displayLabel: "Tokyo Night", description: "Cool blue night palette", theme: tokyoNightTheme }`) for all 8 themes: Flexoki, Default, Dracula, Catppuccin, Tokyo Night, Nord, Rosé Pine, Gruvbox.
- Update the theme picker list and any status-line theme name display to render `displayLabel` instead of `name`; `resolveTheme`/`findTheme`/`/theme <name>` continue to key off the unchanged lowercase-kebab `name`.
- Also sentence-case the existing theme `description` strings (e.g. `"warm low-contrast palette"` -> `"Warm, low-contrast palette"`) as part of R1.
- Spot-check panel border titles (Approval, Question, Plan Action, Task, Queue panels) for consistent phrasing now that hint text is sentence-cased — this is a light consistency pass, not a redesign.

**Patterns to follow:** The existing `ThemeChoice` type and `themeChoices` array structure in `src/ui/terminal-themes/index.ts`.

**Test scenarios:**
- `Test expectation: none -- presentation-only field addition; `resolveTheme`/`findTheme` behavior (the tested surface) is unchanged since lookup still keys off `name`. If an existing test asserts on a `description` string, update it to match the new sentence-cased text.`

**Verification:** `npm run typecheck` and `npm run test` pass; a `tuistory` snapshot of the `/theme` picker shows properly-cased theme names.

---

### U4. Fix fenced code block rendering

**Goal:** Fenced code blocks in assistant messages are visually distinct from prose and are not run through inline bold/italic/code-span parsing.

**Requirements:** R4

**Dependencies:** None (independent of U1-U3)

**Files:**
- `src/ui/ink-terminal.tsx` (`appendWrappedContentLines`, `TranscriptLineData`, `TranscriptLine`)
- `test/smoke.test.mjs`

**Technical design:**
```
appendWrappedContentLines(lines, content, message, messageIndex, width):
  inFence = false
  for each sourceLine:
    if line matches fence marker (```lang or ```):
      if not inFence: emit {kind: "code-fence", text: lang} ; inFence = true
      else: emit {kind: "code-fence", text: ""} ; inFence = false
      continue
    if inFence:
      emit {kind: "code", text: line}  // no InlineMarkdown, no wrapping-driven reflow of code semantics
      continue
    ...existing table/hr/content handling unchanged...
```
This is directional: exact line-splitting/wrapping mechanics for long code lines should follow whatever the existing `wrapAnsi` call already does for `content` lines, adapted for a `code` kind.

**Approach:**
- Add `"code"` and `"code-fence"` to the `TranscriptLineData["kind"]` union.
- Track fence state (open/closed, plus the language from the opening fence) while iterating `sourceLines` in `appendWrappedContentLines`; while inside a fence, push `code`-kind lines verbatim (still width-wrapped via the existing `wrapAnsi` call so long lines don't overflow the terminal, but skip `InlineMarkdown`/regex-based inline parsing entirely).
- In `TranscriptLine`, render `code-fence` lines as a subtle top/bottom border marker (reusing the existing `▸ lang` style or a full-width dim rule) and `code` lines with a distinct color (e.g. `theme.colors.mutedForeground` foreground with `theme.colors.muted` background, or an accent foreground with no background if a full-line background reads poorly in `tuistory` testing — decide based on the manual visual check) so code is clearly separated from prose without needing per-token syntax highlighting.
- Update `MarkdownLine`'s existing fence-line regex match (`^```(.*)$`) so it no longer needs to special-case fence lines once `appendWrappedContentLines` emits a dedicated `code-fence` kind instead of a `content`/`plan` line carrying a fence marker — confirm no other call path still relies on the old inline handling.

**Patterns to follow:** The existing `kind`-discriminated rendering switch in `TranscriptLine`, and the `table`/`tool` kinds as examples of specialized, non-prose line rendering already in this file.

**Test scenarios:**
- Happy path: a message containing a fenced code block with a language tag (e.g. ` ```ts `) produces `code-fence` lines at open/close and `code`-kind lines for the body, in order, via `buildTranscriptLinesForTest`.
- Edge case: code content containing markdown-special characters (`` `const x_y = *ptr` ``) is preserved verbatim in the `code` line's `text` — not transformed by `InlineMarkdown`/bold/italic parsing.
- Edge case: an unclosed fence (message ends mid-code-block) does not crash line generation and treats all remaining lines as code.
- Edge case: a message with no code fences produces no `code`/`code-fence` lines (unchanged behavior for prose-only messages).
- Integration: a message mixing prose, a list, and a fenced code block produces the correct interleaving of `content`/list-`content`/`code-fence`/`code` lines in message order.

**Verification:** `npm run typecheck` and `npm run test` pass with the new test scenarios; a `tuistory` manual check sending a prompt that elicits a fenced code-block response (e.g. "show me a one-line JS function") confirms the code block is visually distinct and unmangled.

---

### U5. Regression test sweep and manual verification

**Goal:** Confirm the full revamp (U1-U4) is covered by automated tests and holds up in a live TUI session.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1, U2, U3, U4

**Files:**
- `test/smoke.test.mjs`

**Approach:**
- Run a final pass over `test/smoke.test.mjs` for any remaining literal-string assertions that reference old command names or old-cased copy that earlier units might have missed.
- Manually drive the built TUI via `tuistory` (dev mode, per the existing project convention) through: idle screen, `/` autocomplete menu, `/permissions` and `/resume` commands, an approval prompt, the task panel, `/theme` picker, and a fenced-code-block assistant response — confirming casing, command names, and code-block rendering all match the plan.

**Test scenarios:**
- `Test expectation: none -- this unit is a verification/sweep pass over tests already added in U1-U4, not new behavior.`

**Verification:** `npm run typecheck` and `npm run test` pass with zero failures; `tuistory` snapshots for each of the surfaces above match the intended sentence-cased, renamed, and code-block-distinct output.

---

## Risks & Dependencies

- **Risk:** Renaming `/reset-perms`/`/historu` could break a user's muscle memory or an undiscovered external reference. *Mitigation:* both are Furnace-internal, unpublished command names with no detected external contract; `/history` is kept as a working alias specifically to soften this for the more commonly-reached-for command.
- **Risk:** The code-fence tracking in `appendWrappedContentLines` is stateful across a `for` loop that also handles tables and horizontal rules; a fence that contains a line looking like a table row or hr could be double-matched if the fence check isn't ordered first. *Mitigation:* the fence-state check must run before the table/hr checks in the loop, and the edge-case test scenarios in U4 should include a code block containing a line that looks like a markdown table row or hr.
- **Dependency:** U2 and U3 both touch `ink-terminal.tsx` broadly; sequencing U2 before U3 avoids re-touching the same theme-picker lines twice.

---

## Sources & Research

- Local: `src/commands.ts`, `src/cli.ts`, `src/ui/ink-terminal.tsx`, `src/ui/components/theme-provider.tsx`, `src/ui/terminal-themes/index.ts`, `test/smoke.test.mjs` — read directly to determine current command semantics, existing markdown renderer behavior, and theme structure before proposing changes.
- External: Claude Code commands reference (`code.claude.com/docs/en/commands`, fetched 2026-07-01) — used to ground the `/permissions` and `/resume` naming conventions and confirm sentence-case is the established style for this class of tool.
- External: Gemini CLI commands reference and general search on Ink-based TUI markdown rendering approaches (`ink-markdown`, `marked-terminal`) — informed KTD3's decision to fix the existing line-based renderer's fenced-code gap rather than rewrite onto a markdown AST library; `ink-markdown`/`@inkkit/ink-markdown` were found to be effectively unmaintained (last published 2-3 years ago, minimal adoption), reinforcing that a custom in-repo approach is the more defensible choice here.
- Note: the initial framing of this work assumed no markdown rendering existed in the TUI at all; direct code reading corrected this — a substantial hand-rolled renderer (headings, lists, quotes, tables, inline bold/italic/code) already exists in `src/ui/ink-terminal.tsx`, which narrowed this plan's markdown scope to the concrete fenced-code-block gap (KTD3).
- User clarifications (this session, via `AskUser`): confirmed full sentence-case pass scope, confirmed the `/permissions` + `/resume` rename set, confirmed markdown rendering work should be included, confirmed visual identity is also in scope (bounded here to theme display labels and panel-title consistency, per KTD4 and Scope Boundaries).

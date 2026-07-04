---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
created: 2026-07-03
plan_type: fix
---

# fix: Render chat history via Ink Static for native terminal scroll

## Goal Capsule

Replace the manually-clipped, fixed-height chat viewport in `src/ui/ink-terminal.tsx` with Ink's `<Static>` component so finished transcript lines are written once to the real terminal output (native scrollback works: mouse wheel, trackpad, Shift+PageUp), matching how Pi's `@earendil-works/pi-tui` renderer works. Only the actively-changing "live" region (thinking/streaming text, tool activity, panels, prompt input, header) keeps being redrawn in place each frame.

## Problem Frame

The whole app currently renders inside a single `Box` pinned to `height={rows}` with `overflow="hidden"` (`ink-terminal.tsx:609`). Inside that, `LiveChat` computes a manual scroll window over `committedLines` using `chatScrollOffset` (`ink-terminal.tsx:1297-1310`), and the only way to see older messages is an `↑`/`↓`-on-empty-input hack (`onEmptyUp`/`onEmptyDown`) that adjusts `chatScrollOffset` in state. Because the box height is capped to terminal rows and everything is manually windowed, the user's real terminal scrollback is disconnected from the chat: scrolling the mouse wheel/trackpad does nothing, and the windowing math (`endIndex`/`startIndex` derived from `scrollOffset` and `chatViewportRows`) can get out of sync with the actual content length after resizes or rapid appends, leaving the view "stuck" and not showing the latest user/assistant turn.

**Research finding (this session):** Pi's TUI framework does not clip content into a fixed-height viewport at all. Per its own docs, the differential renderer uses three strategies, the first being "First Render: Output all lines without clearing scrollback" — i.e. finished content is flushed straight to the terminal's native output stream (and thus its scrollback), while only a small live region below is diffed and redrawn. This is functionally the same model as Ink's built-in `<Static>` component: `Static` items are written to the terminal exactly once and never re-rendered, letting the terminal own scrolling; everything outside `Static` is the small re-rendered live region. Furnace already imports `Static` from `ink` (`ink-terminal.tsx:5`) but never actually uses it — `StaticLine` (`ink-terminal.tsx:1269`) is a plain helper function, not the `<Static>` component.

**User decisions (confirmed):**
- Use Ink's `<Static>` for committed transcript lines; native terminal scrollback replaces manual scrolling.
- Remove `chatScrollOffset` / `onEmptyUp` / `onEmptyDown` entirely — no replacement scroll shortcut.
- Keep the current bottom-docked visual order of header/panels/input unchanged.

## Requirements

- R1: Finished (committed) transcript lines are written to the terminal via Ink's `<Static>` so the terminal's native scrollback (mouse wheel, trackpad, Shift+PageUp/PageDown) can scroll back through full chat history, including content that has scrolled past the visible window.
- R2: The live region (thinking spinner, streaming assistant text, in-flight tool activity lines) continues to render below the static history and updates in place every frame, with no visual duplication of lines once they are committed to `Static`.
- R3: The app no longer renders inside a `height={rows}` `overflow="hidden"` root `Box`; there is no more manual line-windowing (`chatViewportRows`, `startIndex`/`endIndex` slicing) for committed history.
- R4: `chatScrollOffset`, `chatCanScrollUp`, `onEmptyUp`, `onEmptyDown` scroll-offset wiring is removed from `UiState`, `UiStore`, and `PromptInput` usage; empty-input Up/Down no longer scroll chat (Up/Down on empty input falls back to whatever the next-highest-priority behavior is, e.g. focusing a panel above input, per existing `focusPanelAboveInput`).
- R5: Header, hints, panels (permissions/tasks/plan actions/queue/settings/model editor), and `PromptInput` keep their current bottom-docked stacking order and visual appearance.
- R6: The "welcome" empty-state banner (no messages yet) still renders centered when there is no history and no live content.
- R7: Existing transcript formatting behavior (markdown, tables, code fences, tool activity formatting, todo lists, plan-preview boxes) is unchanged — this is a rendering-container change, not a content-formatting change.
- R8: `npm run build` / `tsc` type-checks clean and the existing smoke test suite passes, with `chatViewportRows`/viewport-window tests removed or updated to match the new container model.

## Scope Boundaries

**In scope:**
- `src/ui/ink-terminal.tsx`: root layout (`FurnaceApp` render tree), `LiveChat` → replaced by a `Static`-backed history renderer + live-region renderer, `UiState`/`UiStore` scroll fields, `PromptInput` `onEmptyUp`/`onEmptyDown` wiring.
- `src/ui/components/prompt-input.tsx`: remove/adjust the `onEmptyUp`/`onEmptyDown` props if they become dead after chat-scroll removal (confirm during implementation whether they're used for anything else, e.g. panel focus).
- `test/smoke.test.mjs`: update/remove assertions tied to `chatViewportRows` windowing; add coverage for the new `Static`-based history split.

**Deferred to Follow-Up Work:**
- Any equivalent of Pi's "differential rendering with synchronized output (CSI 2026)" — Ink already handles frame diffing internally; we are not reimplementing Ink's renderer, only changing which component tree pattern we use within it.
- A dedicated "jump to bottom" or search-in-history feature — out of scope, native terminal scrollback covers the reported bug.

**Out of scope:** Provider/session/tool logic, transcript data model in `session/context.ts`, any non-TUI rendering path (`src/ui/terminal.ts`).

---

## Key Technical Decisions

- **KTD1: Split `committedLines` rendering into an Ink `<Static>` list, keyed by stable IDs.** `Static` requires an `items` array plus a `children` render-prop and only renders newly-appended items (by array identity/length growth), so `committedLines` must be treated as an append-only log (it already is — `setTranscript` only ever appends or fully replaces it) and each line needs a stable key (`${messageIndex}-${kind}-${index}` already computed today works as the `Static` key too). When `clearTranscriptDisplay()` resets `committedLines` to `[]`, `Static`'s internal item-tracking must also be allowed to reset — this happens naturally by conditionally keying the `Static` root itself (or the surrounding component) so `Static`'s internal "already rendered" set is invalidated on `/new`.
- **KTD2: `LiveChat` splits into two sibling renders instead of one windowed box.** (a) `<Static items={committedLines}>{line => <TranscriptLine .../>}</Static>` for history — no `overflow`, no fixed `height`, no `scrollOffset` math. (b) A small `Box flexDirection="column"` for the live region (`buildLiveLines` output: role header + tool activity + streaming text + spinner), rendered directly below/adjacent to the static output, same as today's `activeLines`. The empty-state welcome banner renders only when both `committedLines` and the live lines are empty, same trigger as today.
- **KTD3: Remove the root fixed-height wrapper.** `FurnaceApp`'s outer `<Box flexDirection="column" height={rows} width={columns} overflow="hidden">` becomes a plain `<Box flexDirection="column" width={columns}>` (no `height`, no `overflow="hidden"`) so Ink stops clipping content to the terminal's visible rows and instead lets finished `Static` output scroll into real terminal history, with only the live region + footer chrome re-painted each frame — this mirrors Ink's own recommended `Static` usage pattern (e.g. `ink-testing-library` chat/log examples) and Pi's "flush finished, diff the rest" model.
- **KTD4: Delete `chatScrollOffset`/`chatCanScrollUp` state and the `chatViewportRows` windowing helper.** `LiveChat`'s `viewportRows`/`startIndex`/`endIndex`/`visibleTranscriptWindow` logic is removed since `Static` handles the "already emitted, don't re-render" concern natively. `chatViewportRows` is exported and covered by a smoke test today (`test/smoke.test.mjs:166-172`); remove that test alongside the function, or repurpose it only if a reduced form is still needed elsewhere (verify no other caller before deleting — grep confirms it is only used by `LiveChat` and the one test).
- **KTD5: `onEmptyUp`/`onEmptyDown` on `PromptInput` fall back to panel-focus only.** Today `onEmptyUp` does one of two things: scroll chat (if there is history) or `focusPanelAboveInput` (if not). After this change it always calls `focusPanelAboveInput`/`focusAdjacentPanel`-style behavior (or becomes a no-op if `PromptInput` has no other consumer for it) — confirm by reading `PromptInput`'s prop usage before deciding to delete the prop outright vs. just no-op the chat-scroll branch.

---

## Implementation Units

### U1. Remove fixed-height/overflow-hidden root wrapper

**Goal:** Stop clipping the whole app to `rows` so Ink is not fighting the terminal's own scrollback.

**Requirements:** R3

**Dependencies:** none

**Files:**
- `src/ui/ink-terminal.tsx`

**Approach:** In `FurnaceApp`'s render, change the outer `Box` from `flexDirection="column" height={rows} width={columns} overflow="hidden"` to `flexDirection="column" width={columns}` (drop `height` and `overflow`). `rows` from `useWindowSize()` may become unused here — check other usages (`chatViewportRows(rows)` in `LiveChat`) before removing the destructure; it will be needed by U2's live-region sizing only if a max-live-lines cap is still desired (see U2 approach), otherwise drop it.

**Test scenarios:**
- Test expectation: none — layout-only change; verified visually and via the U2/U3 smoke tests (app still renders, no runtime error from unbounded height Box).

---

### U2. Render committed transcript lines via `<Static>`

**Goal:** Finished history lines are flushed once to the terminal and become part of native scrollback, never re-rendered on subsequent frames.

**Requirements:** R1, R6, R7

**Dependencies:** U1

**Files:**
- `src/ui/ink-terminal.tsx`
- `test/smoke.test.mjs`

**Approach:**

Replace `LiveChat`'s single windowed `Box` with two pieces, both still returned from the same component so callers (`FurnaceApp`) don't need to change their usage:

```tsx
// directional sketch, not final code
<>
  <Static items={committedLines}>
    {(line, index) => <StaticLine key={lineKey(line, index)} line={line} />}
  </Static>
  <Box flexDirection="column" paddingX={1}>
    {activeLines.map((line, index) => <TranscriptLine key={...} line={line} />)}
  </Box>
</>
```

- `committedLines` stays exactly as populated today (`setTranscript` in the terminal API, `clearTranscriptDisplay`); no data-model change.
- The empty-state welcome banner keeps its existing trigger (`committedLines.length === 0 && activeLines.length === 0`), now checked before deciding to render `Static` at all (an empty `Static items={[]}` is harmless, but skip it for clarity).
- `StaticLine` (existing helper, `ink-terminal.tsx:1269`) already wraps a line in `paddingX={1}`; reuse it as the `Static` child renderer so paddingX stays consistent with the current committed-line look, and use plain `TranscriptLine` (no wrapper Box) for the live region as `LiveChat` does today.
- When `clearTranscriptDisplay()` runs (`/new`), `committedLines` resets to `[]`. Ink's `Static` treats an item array shrinking as a new list from scratch (it never un-renders previously flushed lines from the terminal, matching the "fresh chat starts below old output" behavior users already expect from normal terminal tools) — verify this against the installed Ink 7.1.0 `Static` implementation during implementation and note any needed key/remount trick (e.g. wrapping `<Static>` in a component keyed by a monotonically increasing "session generation" counter bumped on `clearTranscriptDisplay`) if the item-array-shrink case does not behave as expected.

**Patterns to follow:** Ink's own `Static` usage pattern (children render-prop receiving `(item, index)`), same key-construction convention already used for `TranscriptLine` (`${line.messageIndex ?? "line"}-${line.kind}-${index}`).

**Test scenarios:**
- Happy path: appending new transcript messages via `setTranscript` results in new lines appearing after previously-flushed ones, with prior lines never re-emitted (covered by an Ink `ink-testing-library` render + `lastFrame()`/`frames` assertion, or a smoke-test equivalent checking `committedLines` growth semantics if full Ink render testing isn't already set up in this repo — check `test/smoke.test.mjs` for existing Ink-render test patterns before choosing the mechanism).
- Edge case: `clearTranscriptDisplay()` followed by a new `setTranscript` call starts a visually fresh history (no leftover lines re-rendered from the prior session) — Covers R1.
- Edge case: empty transcript + no live content still shows the welcome banner, not an empty `Static` block — Covers R6.
- Integration: a message that arrives with `toolActivities` already present (mid-turn) renders tool lines followed by message lines in `committedLines` without duplicating anything already flushed, matching current `setTranscript` prefix-diff behavior (`ink-terminal.tsx:440-476`, unchanged by this plan).

**Verification:** Existing markdown/table/code-fence smoke tests (`buildTranscriptLinesForTest`) continue to pass unmodified since they test line-building, not the container; manually confirm scrolling up in a real terminal after a long conversation shows earlier turns via native scrollback.

---

### U3. Remove manual scroll-offset state, windowing helper, and empty-input scroll wiring

**Goal:** Delete the now-dead `chatScrollOffset` viewport-windowing machinery and the `↑`/`↓`-on-empty-input chat-scroll hack per user decision.

**Requirements:** R3, R4

**Dependencies:** U2

**Files:**
- `src/ui/ink-terminal.tsx`
- `src/ui/components/prompt-input.tsx` (only if `onEmptyUp`/`onEmptyDown` become fully unused outside chat-scroll)
- `test/smoke.test.mjs`

**Approach:**
- Remove `chatScrollOffset: number` and `chatCanScrollUp: boolean` from `UiState`, their initializers in `UiStore`'s constructor, and every place that sets them (`clearTranscriptDisplay`, `setTranscript`'s two `return` branches, `onSubmit` handler).
- Remove `chatViewportRows`, `visibleTranscriptWindow` (if it only exists to support windowing — confirm no other caller before deleting), and the `scrollOffset`/`startIndex`/`endIndex` computation inside `LiveChat` (superseded by U2's `Static` split).
- In `FurnaceApp`'s `PromptInput` usage, `onEmptyUp` currently branches on `hasContent` to either bump `chatScrollOffset` or call `focusPanelAboveInput`; simplify to always call `focusPanelAboveInput(store, state)`. `onEmptyDown` currently only adjusts `chatScrollOffset`; per the user's decision to remove the shortcut entirely (not repurpose it), either drop the `onEmptyDown` prop from this `PromptInput` usage or pass a no-op, whichever keeps `PromptInput`'s prop contract simplest — check `prompt-input.tsx` to see if `onEmptyDown` is required/typed as optional before deciding.
- Remove the `store.update({ chatScrollOffset: 0 })` call in the `onSubmit` prop of `PromptInput`.

**Test scenarios:**
- Test expectation: none — this unit is pure deletion of dead state/wiring; correctness is verified by U2's tests still passing and the app compiling with no remaining references (`tsc` catches any stale usage).

**Verification:** `grep -n "chatScrollOffset\|chatCanScrollUp\|chatViewportRows" src/ui/ink-terminal.tsx` returns no results after this unit; `npm run build` type-checks clean.

---

### U4. Update smoke tests for the new container model

**Goal:** Keep `test/smoke.test.mjs` aligned with the removed windowing helper and, where useful, add coverage for the `Static`/live-region split.

**Requirements:** R8

**Dependencies:** U3

**Files:**
- `test/smoke.test.mjs`

**Approach:**
- Remove the `"chat viewport reserves space above fixed input chrome"` test (`test/smoke.test.mjs:166-172`) since `chatViewportRows` no longer exists.
- Confirm the other `buildTranscriptLinesForTest`-based tests (markdown tables, code fences, etc. — `test/smoke.test.mjs:398-435`) still pass unmodified, since they test the line-building functions U2/U3 do not touch.
- If the repo has any existing pattern for rendering the full Ink tree in tests (check for `ink-testing-library` in `package.json`/`node_modules`; not currently imported by `ink-terminal.tsx`), consider one lightweight smoke assertion that `LiveChat`'s exported building blocks (e.g. a to-be-exported `buildLiveLines`/`toolActivitiesToLines`, already exported today) still produce the same line data given the same inputs — this guards against U2 accidentally changing line content while changing the container.

**Test scenarios:**
- Happy path: full smoke suite (`npm test` or repo's actual test command — confirm from `package.json` scripts) passes after the windowing test is removed.
- Test expectation: none beyond the above — no new behavior is introduced in this unit beyond test alignment.

**Verification:** Test suite is green; no test references `chatViewportRows`.

---

## Risks & Dependencies

- **Risk: Ink 7.1.0's `<Static>` semantics around shrinking the `items` array on `/new`.** `Static` is documented/typically implemented to only ever append (never retract) what it has already written to the real terminal — this is exactly the desired native-scrollback behavior for growth, but needs verification for the reset-on-`/new` case (KTD2/U2). Mitigation: verify behavior directly against the installed `ink` version during U2 implementation; if `Static` does not reset cleanly, remount `Static` via a `key` bumped on `clearTranscriptDisplay()`.
- **Risk: loss of the "jump back to bottom" cue.** Today's `scrollOffset > 0` hint line (`↓ N more below`) disappears entirely along with manual scrolling; this is an accepted tradeoff per the user's explicit decision to rely on native terminal scrollback with no replacement affordance.
- **Dependency:** None beyond the `ink` package already in `package.json` (`^7.1.0`), which already exports `Static` (imported but unused today).

## Sources & Research

- `@earendil-works/pi-tui` README (fetched 2026-07-03 from `https://github.com/badlogic/pi-mono/tree/main/packages/tui`): documents the three-strategy differential renderer where "First Render: Output all lines without clearing scrollback" — the basis for concluding Pi relies on the terminal's native scroll, not a manually clipped viewport.
- Local repo: `src/ui/ink-terminal.tsx` (current `LiveChat`, `UiState`, `UiStore`, `FurnaceApp` implementation), `test/smoke.test.mjs` (existing `chatViewportRows` coverage).
- Local reference clones for Pi/OpenCode listed in `AGENTS.md` (`/Users/nihal/code/test-repos/pi`, `/Users/nihal/code/test-repos/opencode`) were not present on this machine; research used the public `earendil-works/pi` GitHub repository instead. Flagging this per `AGENTS.md` guidance to document the source used.

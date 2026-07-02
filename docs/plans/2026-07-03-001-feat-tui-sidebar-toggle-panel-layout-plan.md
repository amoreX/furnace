---
title: "feat: TUI sidebar toggle and panel layout refactor"
date: 2026-07-03
sequence: "001"
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# feat: TUI sidebar toggle and panel layout refactor

## Goal Capsule

Allow each user to choose whether the right-side command sidebar is visible (split mode) or hidden (full-width single-line input), persisted as a global preference. Simultaneously, normalise all interactive panels (approval, tasks, plan actions, model/permissions screens) to render above the chat input in both modes — so the input area is always visible and only the question prompt occupies the input space itself.

## Problem Frame

Two distinct issues surfaced from user feedback:

1. **Sidebar divisiveness** — the split-panel layout is useful for power users who want slash-command discovery, but feels noisy to teammates who prefer a minimal single-line input closer to a standard CLI. No toggle exists, so both users can't be happy simultaneously.
2. **Panel displacement** — interactive panels (approval prompts, subagent panels, plan-action pickers, model/permission editors) replace the chat input via `inputOverride`, hiding the input entirely. This is surprising: the user loses the ability to see the input box, and the layout shifts. Queued prompts were recently moved above-input; the same treatment should apply to all panels.

## Requirements

- R1: A persistent global preference `sidebarEnabled` (boolean, default `true`) controls whether the command sidebar is shown.
- R2: The sidebar can be toggled at runtime via a keyboard shortcut without restarting.
- R3: The toggle is saved to `~/.furnace/preferences.json` so the preference survives sessions.
- R4: In sidebar-on mode (split), layout is unchanged from the current split-panel design.
- R5: In sidebar-off mode (full-width), the input is a single-line full-width box; slash-command autocomplete appears above the input as a floating menu (the existing `PromptAutocompleteMenu` component already handles this in non-split mode).
- R6: All interactive panels — ApprovalPrompt, TaskPanel, PlanActionPanel, ModelEditorPanel, PermissionsPanel — render above the chat input in both modes, never replacing it.
- R7: QuestionPrompt remains inside the input area (`inputOverride`) in both modes, as it belongs to the conversational flow.
- R8: The hint bar reflects the sidebar toggle shortcut when relevant.

## Scope Boundaries

### In scope
- `sidebarEnabled` preference field and persistence
- Keyboard shortcut to toggle sidebar at runtime
- Moving all panels (except QuestionPrompt) above the input
- Passing `sidebarEnabled` state into `PromptInput` as the `splitMode` prop

### Deferred to Follow-Up Work
- A `/settings` or visual settings screen for all preferences
- Per-project sidebar preference (project-level `.furnace/preferences.json`)
- Sidebar width customisation

### Out of scope
- Changes to how QuestionPrompt works or looks
- Changes to the right sidebar's content
- Any change to autocomplete logic in split mode

---

## Key Technical Decisions

**KTD1 — Toggle shortcut: `Ctrl+\`**
`Ctrl+Q` is already taken by the queue panel toggle. `Ctrl+B` is used by subagent background. `Ctrl+\` is unused, easy to reach, and visually evokes a split. Announced in the hint bar as `Ctrl+\ sidebar`.

**KTD2 — Panels render as a priority stack above input**
Rather than a single `inputOverride` slot that can only hold one panel, each panel is rendered conditionally in its own row above `PromptInput`. Priority (top-to-bottom, highest priority rendered last / closest to input): QueuedPromptPanel → TaskPanel → PlanActionPanel → ModelEditorPanel → PermissionsPanel → ApprovalPrompt. Only one panel is active (receives input) at a time, governed by `state.focus` and the existing `isActive` check inside each panel component.

**KTD3 — `disabled` prop simplification**
With panels no longer occupying the `inputOverride` slot, the `disabled` condition on `PromptInput` can be narrowed to just `state.question` (QuestionPrompt still uses `inputOverride`) plus the existing `screen.kind !== "chat"` guard. Approval prompts, tasks, and plan-action panels no longer need to disable the input — they float above it and handle input via their own `isActive: active` guards.

**KTD4 — Preference persistence goes through `cli.ts`**
Following the existing pattern for model/theme preferences, the sidebar toggle fires an `onSidebarToggle?: (enabled: boolean) => void` callback on `CreateFurnaceTerminalOptions`. `cli.ts` handles the save to `saveGlobalPreferences`. The terminal itself only manages runtime state; persistence stays in the CLI layer.

**KTD5 — `sidebarEnabled` loaded from config at terminal creation**
`cli.ts` reads `sidebarEnabled` from loaded preferences and passes it as a new `sidebarEnabled?: boolean` field on `CreateFurnaceTerminalOptions`. The `UiStore` initialises its state from this value.

---

## High-Level Technical Design

```
┌────────────────────────────────────────────┐
│  chat area (LiveChat, flexGrow)            │
├────────────────────────────────────────────┤
│  [above-input stack, flexShrink=0]         │
│  ┌──────────────────────────────────────┐  │  ← ApprovalPrompt     (if approval)
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │  ← TaskPanel          (if tasks)
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │  ← PlanActionPanel    (if planAction)
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │  ← ModelEditorPanel   (if modelEditor screen)
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │  ← PermissionsPanel   (if permissions screen)
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │  ← QueuedPromptPanel  (if queue)
│  └──────────────────────────────────────┘  │
├────────────────────────────────────────────┤
│  PromptInput                               │  ← splitMode={state.sidebarEnabled}
│  inputOverride={QuestionPrompt only}       │
├────────────────────────────────────────────┤
│  AppShell.Header (footer bar)              │
└────────────────────────────────────────────┘

Sidebar-on (splitMode=true):  left text area + right command panel (44px)
Sidebar-off (splitMode=false): full-width single-line input; PromptAutocompleteMenu floats above
```

---

## Implementation Units

### U1. Add `sidebarEnabled` to preferences and UiState

**Goal:** Introduce the persistent preference field and wire it into the terminal's initial state.

**Requirements:** R1, R3, R5

**Dependencies:** none

**Files:**
- `src/preferences.ts`
- `src/ui/ink-terminal.tsx`

**Approach:**
- Add `sidebarEnabled?: boolean` to `FurnacePreferences` type.
- Add `sidebarEnabled?: boolean` to `CreateFurnaceTerminalOptions`.
- Add `sidebarEnabled: boolean` to `UiState` (default `true` when the option is omitted).
- Initialise `UiStore` initial state from `options.sidebarEnabled ?? true`.
- Add `setSidebarEnabled(enabled: boolean): void` to the `FurnaceTerminal` interface and implement it in the `UiStore` method block (`store.update({ sidebarEnabled: enabled })`).

**Patterns to follow:** `inputMode` in `CreateFurnaceTerminalOptions` → `UiState.inputMode` → `store.update` — identical shape.

**Test scenarios:**
- `sidebarEnabled: false` passed in options → `store.getSnapshot().sidebarEnabled === false`
- `sidebarEnabled` omitted → state defaults to `true`
- `setSidebarEnabled(false)` → `getSnapshot().sidebarEnabled === false`
- `setSidebarEnabled(true)` → `getSnapshot().sidebarEnabled === true`

**Verification:** Typecheck passes; no runtime regressions on existing split-mode behaviour.

---

### U2. Move all panels above the input; keep only QuestionPrompt in inputOverride

**Goal:** Refactor `FurnaceRoot`'s JSX so ApprovalPrompt, TaskPanel, PlanActionPanel, ModelEditorPanel, PermissionsPanel all render as rows in the above-input stack, never as `inputOverride`. QuestionPrompt stays in `inputOverride`.

**Requirements:** R6, R7

**Dependencies:** U1 (needs `sidebarEnabled` in state for the `splitMode` prop wiring in the same render block)

**Files:**
- `src/ui/ink-terminal.tsx`

**Approach:**
- In the `<Box flexShrink={0} flexDirection="column">` that wraps `PromptInput`:
  - Render each panel conditionally above `PromptInput`, in this order (top → bottom):
    1. `state.approval` → `<ApprovalPrompt />`
    2. `state.tasks.length > 0 && !state.approval` → `<TaskPanel />`
    3. `state.planAction && !state.approval` → `<PlanActionPanel />`
    4. `state.screen.kind === "modelEditor" && !state.approval` → `<ModelEditorPanel />`
    5. `state.screen.kind === "permissions" && !state.approval` → `<PermissionsPanel />`
    6. `state.queuedPrompts.length > 0 && !state.approval` → `<QueuedPromptPanel />` (already there)
- Change `inputOverride` on `PromptInput` to only pass `<QuestionPrompt />` when `state.question` is set.
- Update the `disabled` prop: `state.screen.kind !== "chat" || Boolean(state.question)`. Remove the `Boolean(state.approval)` check — approval now floats above and the input should remain visible (though focus will be on the approval panel).

**Patterns to follow:** `QueuedPromptPanel` above-input rendering added in the previous commit.

**Test scenarios:**
- Approval active → ApprovalPrompt visible above input; PromptInput box still rendered
- Tasks active → TaskPanel visible above input; PromptInput visible
- Question active → QuestionPrompt in `inputOverride`; input area replaced as before
- Multiple conditions (e.g. tasks + queue) → both panels stack above input
- No active panels → nothing rendered above input; layout identical to current non-override state

**Verification:** Visual inspection in each panel state; no layout regression in the simple chat case.

---

### U3. Wire `splitMode` to `sidebarEnabled`; add `Ctrl+\` toggle

**Goal:** Make the sidebar runtime-toggleable via `Ctrl+\`, wired to the `sidebarEnabled` state.

**Requirements:** R2, R4, R5, R8

**Dependencies:** U1

**Files:**
- `src/ui/ink-terminal.tsx`

**Approach:**
- Change the `splitMode` prop on `PromptInput` from the hardcoded boolean `splitMode` (truthy shorthand) to `splitMode={state.sidebarEnabled}`.
- In `FurnaceRoot`'s `useInput` handler, add:
  ```
  if (key.ctrl && input === "\\") {
    const next = !state.sidebarEnabled
    store.update({ sidebarEnabled: next })
    options.onSidebarToggle?.(next)
  }
  ```
  (`"\"` is the string value Ink delivers for `Ctrl+\`.)
- Add `onSidebarToggle?: (enabled: boolean) => void` to `CreateFurnaceTerminalOptions`.
- Update `hintItemsForState` to include `"Ctrl+\\ sidebar"` in the default input hint items (append alongside `"Tab to switch mode"`).

**Patterns to follow:** `Ctrl+Q` queue toggle added in previous commit; `onInterrupt`/`onTaskBackground` callback pattern in `CreateFurnaceTerminalOptions`.

**Test scenarios:**
- `Ctrl+\` when `sidebarEnabled=true` → `sidebarEnabled` becomes `false`, `onSidebarToggle(false)` called
- `Ctrl+\` when `sidebarEnabled=false` → `sidebarEnabled` becomes `true`, `onSidebarToggle(true)` called
- `Ctrl+\` with no queue → toggles without error (no guard needed, always valid)
- Hint bar in default input state includes `Ctrl+\ sidebar`

**Verification:** Toggle in running terminal switches between split and full-width layout; typecheck clean.

---

### U4. Persist sidebar preference from cli.ts

**Goal:** Load the initial `sidebarEnabled` preference from disk and save it when the user toggles.

**Requirements:** R1, R3

**Dependencies:** U1, U3

**Files:**
- `src/cli.ts`

**Approach:**
- In the `createFurnaceTerminal(...)` call: add `sidebarEnabled: input.config.sidebarEnabled` (or the preferences-derived value) and `onSidebarToggle: async (enabled) => { await saveGlobalPreferences({ sidebarEnabled: enabled }) }`.
- Ensure `input.config` (or the preferences object used to build the terminal options) carries `sidebarEnabled` from `loadPreferences`. Since `FurnaceConfig` is built from `loadConfig` which merges preferences, trace the path: `loadPreferences` → config build → terminal options.
- Add `sidebarEnabled?: boolean` to `FurnaceConfig` type in `src/config.ts` if not already present, reading from `preferences.sidebarEnabled`.

**Patterns to follow:** `theme` → `saveThemePreference`; `model` → `saveGlobalPreferences({ model })` in the model editor handler in `cli.ts`.

**Test scenarios:**
- `preferences.json` with `sidebarEnabled: false` → terminal starts with sidebar off
- `preferences.json` missing `sidebarEnabled` → terminal starts with sidebar on (default)
- User toggles sidebar → `saveGlobalPreferences` called with correct value
- Subsequent restart reads the saved value

**Verification:** Toggle, exit, restart — sidebar state matches last-saved preference.

---

## Verification Contract

- `npm run typecheck` passes with zero errors.
- In split mode (default): layout is visually identical to current state for simple chat, approval, tasks, model editor, and question scenarios.
- In full-width mode: input is single-line full-width; typing `/` shows `PromptAutocompleteMenu` floating above; panels still appear above input.
- `~/.furnace/preferences.json` contains `"sidebarEnabled": false` after toggling off and closing.
- Restarting with the saved preference starts in the correct mode without user action.

## Definition of Done

- All four units implemented and typechecking clean.
- Sidebar toggle works at runtime in both directions.
- ApprovalPrompt, TaskPanel, PlanActionPanel, ModelEditorPanel, PermissionsPanel render above input in both sidebar modes; QuestionPrompt stays in inputOverride.
- Preference persists across restarts.
- No visual regression in the common chat + split-mode case.

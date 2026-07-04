---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
plan_type: feat
---

# feat: Inline `[Image #N]` placeholders for pasted images

## Summary

Replace the current image-attachment UX (a "📎 image attached" / "N images attached" banner floating above/inside the prompt box) with inline placeholder tokens typed directly into the chat input text, matching how Pi treats pasted images as part of the input stream rather than a side-channel attachment list. Pasting (or `/image <path|url>`) inserts `[Image #N]` at the cursor position; the real image data is tracked in a small session-scoped map keyed by that number. On submit, the raw text (including its `[Image #N]` tokens) is preserved, and the model-facing message is built as an interleaved array of text/image content blocks split at each token — so an image referenced mid-sentence stays mid-sentence for the model, not just tacked on at the end.

This also fixes a live bug: today there are two independent, partially-dead code paths for images (`pendingImage`/`ClipboardImage` via `Ctrl+V`→`onImagePaste`, and `imageAttachments[]` via bracketed-paste/`​/image`→`addImageAttachment`), and the `imageAttachments[]` array is never actually read when building the outgoing message — so images added via `/image` or bracketed-paste silently never reach the model. This plan collapses both paths into one.

## Problem Frame

- The prompt input currently shows a dedicated banner (`📎 image attached · Esc to remove`, `N images attached:`) whenever an image is staged, which the user finds ugly and wants removed entirely.
- The user wants pasted images to behave like inline text: paste → `[Image #1]` appears at the cursor, keep typing around it, paste more images elsewhere in the same message, and have the agent see each image in its correct textual position — not as a trailing, unordered attachment array.
- Investigation confirmed the current implementation is inconsistent and partly broken:
  - `src/cli.ts`'s `onImagePaste` reads the clipboard via `readClipboardImage()` and calls `terminal.setPendingImage(img)`, which is the only path that ever reaches the model (through `onSubmit(text, pendingImage)` → `runPromptQueue` → `runSingleTurn({ image })`).
  - `src/ui/ink-terminal.tsx`'s `handleClipboardImage` (wired as `onClipboardImage`, which `PromptInput` prefers over `onImagePaste`) saves the clipboard image to `.furnace/images/` and pushes into `state.imageAttachments`, but that array is **never** read anywhere when the message is actually sent — so this is the "live" UI path but a dead end for the model.
  - `/image <path|url>` (`handleImageCommand` in `src/cli.ts`) also only feeds the same dead `imageAttachments` array via `terminal.addImageAttachment`.
- `entryToModelMessage` (`src/session/context.ts`) always appends all of a message's images after the text block, so even once wired up, ordering/positioning information would be lost.

## Requirements

- R1: Pasting an image (bracketed paste or `Ctrl+V` fallback) inserts a `[Image #N]` placeholder token at the current cursor position in the chat input, where `N` is a session-scoped, monotonically increasing counter.
- R2: `/image <path|url>` inserts the same kind of `[Image #N]` token into the current input draft instead of populating a separate attachment list/banner.
- R3: No dedicated "image(s) attached" banner or footer hint is rendered anywhere in the prompt input; the token is just part of the input's plain text.
- R4: A user can paste multiple images into one message, interspersed with typed text, and each ends up in the correct relative position.
- R5: If a `[Image #N]` token is deleted/edited out of the input before sending, that image is not included in the outgoing message — no separate "remove attachment" affordance is needed.
- R6: When the message is sent, the model receives an interleaved content array (text/image blocks in original order), not text-then-all-images.
- R7: The `#N` counter only resets on `/new` (fresh session), not on every message send, so numbering stays stable across a whole conversation.
- R8: Existing stored messages that used the old trailing-image-append format continue to render and resend correctly (no migration required).

## Key Technical Decisions

- **KTD1 — Resolve-then-insert, not optimistic reserve/resolve.** Clipboard image save+load (`saveClipboardImage` + `loadImageAsBase64`) happens first; the placeholder token is only inserted once the image is actually loaded. This is simpler than a two-phase reserve/resolve state machine and the load is fast enough (local temp-file round trip) that the UX difference is negligible. On failure (no image in clipboard / load error), nothing is inserted.
- **KTD2 — Cursor-aware insertion lives in `PromptInput`, not the parent.** Only `PromptInput` tracks `cursorOffset`. Image attach becomes a single async prop, `onImageAttach?: () => Promise<{ label: string } | undefined>`, that `PromptInput` calls from its own paste/`Ctrl+V` handlers and splices the returned `[Image #<label>]` token into its own text buffer at the current cursor — exactly like inserting any other pasted text.
- **KTD3 — One registration path for both interactive paste and `/image`.** `/image` runs outside the React tree (in `cli.ts`), so it can't use cursor position — it uses a new `FurnaceTerminal.insertImageAttachment(source, options)` method that appends the token to the end of the current draft. Interactive paste uses the cursor-aware path in `PromptInput`. Both paths register into the same `pastedImages` / `nextImageLabel` state so labels never collide.
- **KTD4 — Label carried on `ImageAttachment` and persisted on the stored message.** `ImageAttachment` gains an optional `label` field; `MessageEntryData.images[]` gains the matching field; `SessionStore.appendMessage` passes it through unchanged. This is what lets `entryToModelMessage` match `[Image #N]` tokens back to the right image when rebuilding model messages, including on session reload/resend.
- **KTD5 — Filter to referenced images at send time, in `runSingleTurn`.** Rather than trying to keep `pastedImages` and the draft text perfectly in sync as the user edits, the send path filters `images` down to only those whose `[Image #<label>]` token literally still appears in the final submitted text before persisting the message. This directly implements R5 without extra UI state.
- **KTD6 — Legacy fallback preserved.** `entryToModelMessage` only builds an interleaved content array when the message text actually contains `[Image #N]` tokens matching a stored image; otherwise it falls back to today's trailing-append behavior, so already-stored sessions keep working.

## Scope Boundaries

- No changes to image validation, size limits, or supported formats (`src/utils/images.ts`'s existing constants stay as-is).
- No visual styling/highlighting of the `[Image #N]` token in the input — it renders as plain text like the rest of the draft.
- No change to the underlying `readClipboardImage`/`saveClipboardImage` OS-level mechanisms beyond consolidating which one is used.
- `src/clipboard-image.ts`'s `readClipboardImage()` (the base64-direct native path used by the old `onImagePaste`) is dropped in favor of the single `saveClipboardImage` + `loadImageAsBase64` path already used by `handleClipboardImage`; no functional behavior beyond that consolidation is expected.

### Deferred to Follow-Up Work

- Optional dimmed/colored rendering of `[Image #N]` tokens in the input for visual polish.
- Any "preview thumbnail" of pasted images.

## Implementation Units

### U1. Carry an image label through the attachment type and message schema

**Goal:** Give every pasted/attached image a stable `label` (the `N` in `[Image #N]`) that survives from UI state through to the persisted session entry.

**Requirements:** R1, R2, R6, R8 (KTD4)

**Dependencies:** none

**Files:**
- `src/utils/images.ts`
- `src/session/types.ts`
- `src/session/store.ts`

**Approach:**
- Add `label?: string` to the `ImageAttachment` type in `src/utils/images.ts`; extend `createImageAttachment(source, options)` to accept and set `label` in its `options` param.
- Add the matching `label?: string` field to the inline `images` array item type on `MessageEntryData` in `src/session/types.ts`.
- In `SessionStore.appendMessage` (`src/session/store.ts`), carry `img.label` through into both the `base64` and `url` branches of the images mapping.

**Test scenarios:**
- Happy path: `createImageAttachment(source, { label: "1", displayName: "Image 1" })` returns an attachment with `label === "1"`.
- `appendMessage(sessionId, "user", text, { images: [attachmentWithLabel] })` persists an entry whose `data.images[0].label` matches.
- Test expectation for the type-only changes: covered implicitly by the above behavioral assertions; no separate scenario needed.

**Verification:** `npm run typecheck` passes; a `test/smoke.test.mjs` (or new test file) assertion round-trips a labeled attachment through `appendMessage` and reads it back via `getActivePath`/entries.

---

### U2. Interleave `[Image #N]` tokens into model-facing content blocks

**Goal:** When building `OpenRouterMessage`s from stored entries, split message text on `[Image #N]` tokens and interleave the matching image blocks in original order, instead of always appending all images after the text.

**Requirements:** R4, R6, R8 (KTD6)

**Dependencies:** U1

**Files:**
- `src/session/context.ts`
- `test/smoke.test.mjs` (or a new focused test file if that suits existing conventions better)

**Approach:**
- In `entryToModelMessage`, when `data.images` is non-empty, scan `data.content` for `[Image #<label>]` occurrences (regex, e.g. `/\[Image #(\S+?)\]/g`).
- If any tokens are found: walk the text, pushing `{ type: "text", text }` segments for the text between/around tokens and the corresponding `{ type: "image_url", image_url: { url } }` block (built from the matching `data.images` entry by `label`) for each token, preserving original order. A token with no matching stored image falls back to being kept as literal text (defensive; should not normally occur since R5 already filters at send time).
- If no tokens are found (legacy messages, or images without a `label`), keep today's trailing-append behavior unchanged.
- Factor the "turn one image entry into a content block" logic (currently inlined) into a small shared helper so both branches use it.

**Test scenarios:**
- Happy path: content `"compare [Image #1] to [Image #2] please"` with two labeled images produces a content array of `[text, image, text, image, text]` in that exact order.
- Edge case: a single token at the very start or very end of the content (no leading/trailing empty text block emitted).
- Fallback: content with no `[Image #N]` tokens but a non-empty `images[]` array still produces today's trailing-append shape (`[text, image, image, ...]`) — covers R8.
- Fallback: a token present in text but with no matching `images[]` entry (e.g. `label` mismatch) is left as literal text rather than throwing or silently dropping the surrounding text.

**Verification:** New/updated unit test(s) in `test/smoke.test.mjs` covering the four scenarios above pass; `npm run typecheck` clean.

---

### U3. Replace attachment state and terminal API in `ink-terminal.tsx`

**Goal:** Swap the current `pendingImage` (single `ClipboardImage`) / `imageAttachments` (dead array) state for a unified `pastedImages: ImageAttachment[]` + `nextImageLabel: number` model, and expose the two insertion paths (`/image` command, interactive clipboard paste) needed by U4/U5.

**Requirements:** R1, R2, R3, R5, R7 (KTD1, KTD3, KTD4)

**Dependencies:** U1

**Files:**
- `src/ui/ink-terminal.tsx`
- `src/ui/components/image-attachments.tsx` (deleted)

**Approach:**
- `UiState`: remove `pendingImage` and `imageAttachments`; add `pastedImages: ImageAttachment[]` (images currently referenced in the draft, not yet sent) and `nextImageLabel: number` (init `1`).
- `clearTranscriptDisplay()` (the `/new` handler) also resets `pastedImages: []` and `nextImageLabel: 1`, per R7.
- `FurnaceTerminal` type: remove `setPendingImage`, `addImageAttachment`, `removeImageAttachment`, `clearImageAttachments`. Add `insertImageAttachment(source: ImageSource, options?: { displayName?: string; size?: number }): void` — assigns the next label, registers the attachment into `pastedImages`, increments the counter, and appends `[Image #<label>]` (plus a trailing space) to `state.inputDraft`. This backs `/image` (KTD3).
- Rewrite `handleClipboardImage` into `attachClipboardImage(): Promise<{ label: string } | undefined>` — keeps today's save-to-`.furnace/images`-then-`loadImageAsBase64` flow (KTD1), but instead of pushing into a dead array, it assigns the next label via a single atomic `store.update` (reading and incrementing `nextImageLabel` inside the updater), registers the attachment into `pastedImages`, and returns `{ label }` (or `undefined` on any failure) for `PromptInput` to consume (KTD2).
- `FurnaceApp`'s `<PromptInput>` usage: drop `imageAttachments`, `onClipboardImage`, `onImagePaste`, `pendingImageAttachment`, `onClearAttachment` props; pass `onImageAttach={attachClipboardImage}` instead. Change `onSubmit` to snapshot `state.pastedImages`, clear them (`store.update({ pastedImages: [] })`), and call the parent `onSubmit(text, images)`.
- Delete `src/ui/components/image-attachments.tsx` (no longer imported/used anywhere) and its import in `ink-terminal.tsx`.

**Test scenarios:**
- Happy path: calling the new `insertImageAttachment` twice with an empty initial draft results in `pastedImages.length === 2` with labels `"1"` and `"2"`, and `inputDraft` containing both `[Image #1]` and `[Image #2]` tokens in order.
- Edge case: `/new` (`clearTranscriptDisplay`) resets `nextImageLabel` back to `1` and clears `pastedImages`, even if images were pending.
- Test expectation: no test needed for the deleted `image-attachments.tsx` file beyond confirming nothing imports it (covered by `npm run typecheck`).

**Verification:** `npm run typecheck` passes with no dangling imports of `ImageAttachments`/`setPendingImage`/`addImageAttachment`/etc.; a smoke test exercises `insertImageAttachment` and the `/new` reset.

---

### U4. Cursor-aware inline insertion and banner removal in `PromptInput`

**Goal:** Make `PromptInput` itself responsible for splicing `[Image #<label>]` into the text at the cursor when an image-paste gesture resolves, and remove every "image(s) attached" banner/hint.

**Requirements:** R1, R3, R4, R5 (KTD2)

**Dependencies:** U3

**Files:**
- `src/ui/components/prompt-input.tsx`

**Approach:**
- Replace the `imageAttachments`, `onClipboardImage`, `onImagePaste`, `pendingImageAttachment`, `onClearAttachment` props with a single `onImageAttach?: () => Promise<{ label: string } | undefined>`.
- Keep a ref mirroring the latest `cursorOffset` (updated every render) so the async `.then()` continuation inserts at the cursor position current when the image finished loading, not a stale closed-over value.
- In `usePaste`, when the existing "probably an image" gesture heuristic fires and `onImageAttach` is provided: call it, and on resolution with a `{ label }`, splice `` `[Image #${label}] ` `` into the value at the ref's current cursor offset and advance the cursor past it; on `undefined`, no-op (optionally leave existing status-notice plumbing in the parent to report "no image found", unchanged).
- Consolidate the two existing `Ctrl+V` handlers in `useInput` (an early "fallback for terminals without bracketed paste" check, and a second, currently-dead one further down the `ctrl` branch that the first one always shadows) into a single handler that calls the same `onImageAttach` async path.
- Remove: the `{imageAttachments.length > 0 ? ... }` banner block, the `pendingImageAttachment` banner/indicator `Text` blocks in both the normal and `splitMode` render branches, the `📎` overflow-indicator prefix in split mode, and the `Escape`-clears-`pendingImageAttachment` branch in the main `useInput` handler.

**Test scenarios:**
- Happy path: simulating a resolved `onImageAttach` (`{ label: "1" }`) after a paste-gesture inserts `[Image #1] ` at the cursor offset active at paste time, and moves the cursor past the inserted token.
- Edge case: `onImageAttach` resolving to `undefined` leaves the input value and cursor unchanged.
- Edge case: pasting an image mid-sentence (non-zero, non-end cursor offset) inserts the token between the existing before/after text rather than at the start or end.
- Regression: no "image attached" / "images attached" text is present anywhere in `PromptInput`'s rendered output regardless of state (covered by the smoke test suite scanning for removed banner text, and by manual code inspection).

**Verification:** `npm run typecheck` clean; smoke test(s) cover the three behavioral scenarios above; a repo-wide grep for the removed prop names/banner strings returns no matches outside this plan/history.

---

### U5. Wire the send path to carry and filter `pastedImages`

**Goal:** Replace the singular `ClipboardImage` plumbing through `cli.ts` with the `ImageAttachment[]` array, and only persist images whose token is still present in the final submitted text.

**Requirements:** R2, R5, R6 (KTD3, KTD5)

**Dependencies:** U1, U3

**Files:**
- `src/cli.ts`

**Approach:**
- Rename the `pendingImage?: ClipboardImage` parameter threaded through `onSubmit` → `handleInteractiveSubmit` → `runPromptQueue` → `runSingleTurn`'s `image` option to `images?: ImageAttachment[]` end-to-end.
- In `runSingleTurn`, drop the current `clipImage`/`userImages` singular-wrapping logic; instead filter the incoming `images` down to only those whose `` `[Image #${img.label}]` `` substring is present in `input.prompt`, and pass that filtered array directly as `appendMessage`'s `images` option (KTD5).
- Update `handleImageCommand` (`/image <path|url>`) to call `terminal.insertImageAttachment(source, { displayName, size })` instead of the removed `terminal.addImageAttachment(attachment)`, and drop its now-redundant local `createImageAttachment` call (the terminal method owns attachment creation/labeling).
- Remove the `onImagePaste` store option entirely (including its `readClipboardImage()`-based implementation and the `readClipboardImage` import) — clipboard reading is now fully owned by `attachClipboardImage` in `ink-terminal.tsx` (U3).

**Test scenarios:**
- Happy path: submitting text containing both `[Image #1]` and `[Image #2]` tokens with two matching `pastedImages` persists a message whose `images` metadata includes both, in label order.
- Edge case (R5): submitting text where `[Image #2]`'s token was deleted before sending persists a message whose `images` metadata contains only the image labeled `"1"`.
- Integration: `/image ./foo.png` followed by typing a message and sending it results in the same persisted-images behavior as an interactively pasted image (same code path from U3 onward).

**Verification:** `npm run typecheck` clean; `npm test` passes, including a scenario asserting the filter-by-token behavior described above; manual grep confirms no remaining references to `ClipboardImage`/`setPendingImage`/`onImagePaste` in `src/cli.ts`.

## Risks & Dependencies

- **Risk:** The async resolve-then-insert flow (KTD1/KTD2) could feel laggy if clipboard save/load is slow on some platforms. Mitigation: this mirrors the existing `handleClipboardImage` implementation's latency, which was already the "live" path today — no new latency is introduced, just made visible via the inserted token instead of a silent banner update.
- **Risk:** A user could paste text that happens to contain a literal `[Image #N]`-shaped string unrelated to an actual attachment. Mitigation: U2/U5's matching is by exact `label`, and unresolved tokens fall back to literal text (KTD6) rather than erroring, so this degrades gracefully.
- **Dependency:** U4 depends on U3's `attachClipboardImage`/`insertImageAttachment` existing first; U5 depends on U1's `label` field and U3's `pastedImages` state.

## Sources & Research

- Local investigation of `src/cli.ts`, `src/ui/ink-terminal.tsx`, `src/ui/components/prompt-input.tsx`, `src/ui/components/image-attachments.tsx`, `src/utils/images.ts`, `src/clipboard-image.ts`, `src/session/context.ts`, `src/session/store.ts`, and `src/session/types.ts` confirmed the current dual/dead-path implementation described in Problem Frame. No external research was needed — this is a self-contained UX/plumbing change with no new third-party dependencies or unfamiliar technology.

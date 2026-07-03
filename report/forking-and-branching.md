# Forking And Branching Implementation Report

Date: 2026-07-03

This report compares local Pi, OpenCode, and Hermes Agent implementations for conversation forking/branching and recommends the best Furnace design.

## Reference Repos Inspected

Per `AGENTS.md`, local reference repos were updated/checked before inspection.

| Project | Local path | Update/check result | Inspected commit |
| --- | --- | --- | --- |
| Pi | `/Users/nihal/code/test-repos/pi` | `git pull --ff-only` fast-forwarded | `23d1462611ab74b4874c35e701a43d7caa5e3de3` |
| OpenCode | `/Users/nihal/code/test-repos/opencode` | `git pull --ff-only` fast-forwarded; child research verified clean state | `eba0bd0397fdb8a7e441293fb0d3b489b1c67661` |
| Hermes Agent | `/Users/nihal/code/test-repos/hermes-agent` | `git pull --ff-only` reported already up to date | `a6b9597d5fb92969d605a858d5f14536e805553a` |

## Executive Recommendation

**Pi does conversation branching the best architecturally.** Furnace should copy Pi's core split:

1. **Same-session branching**: move the active leaf inside the existing append-only entry tree.
2. **New-session forking/clone**: create a new session from a selected root-to-entry path.

**Hermes does branch presentation and lineage UX well.** Furnace should copy Hermes' explicit child visibility and sidebar grouping ideas, but avoid Hermes' overloaded `parent_session_id` heuristics.

**OpenCode does the simplest user flow well.** Furnace should copy the “fork from a prior user prompt, place it back in the composer for editing” UX, but avoid OpenCode's missing durable parent link for manual forks and its ID-order fork boundary.

Best Furnace plan:

- Keep the current Pi-style `entries.parent_entry_id` tree and `sessions.active_leaf_id` as the foundation.
- Add durable same-session leaf movement with a `leaf`/`branch_navigation` entry or equivalent metadata so branch selection survives restart.
- Add explicit session relationship metadata so manual forks, subagents, delegation children, compaction chains, and future worktree branches are not all crammed into `parent_session_id`.
- Implement `/tree` for same-session branch navigation first, then `/fork` for new-session cloning from a selected user message.
- Treat selecting a user message as “branch/fork before this prompt and load that prompt into the composer,” because that is the most useful coding-agent interaction.

## Terms For Furnace

Use these terms consistently:

- **Branch**: an alternate path inside the same session tree. It changes `active_leaf_id` and future entries become children of the selected point/path.
- **Fork**: a new session created from another session's active path or selected entry.
- **Clone**: a new session copied through the current leaf. This is a special case of fork.
- **Child session**: a session spawned by tools/subagents. Do not conflate this with user-visible fork lineage.
- **Git branch/worktree**: separate feature. Do not use “branch” unqualified in code when referring to git operations.

## Current Furnace Fit

Furnace already has most of the hard storage foundation:

- `src/session/types.ts:1-15`: `SessionRecord` has `activeLeafId`, `parentSessionId`, and `forkedFromEntryId`.
- `src/session/types.ts:17`: entry types already include `branch_summary`.
- `src/session/store.ts:319-349`: `appendEntry()` appends every new entry as a child of current `active_leaf_id`, then advances `active_leaf_id`.
- `src/session/store.ts:355-370`: `getActivePath()` reconstructs root-to-active-leaf context.
- `src/session/store.ts:372-407`: SQLite schema has `sessions.active_leaf_id`, `parent_session_id`, `forked_from_entry_id`, and indexed entry parent links.
- `src/session/context.ts:21-47`: model context is derived from entries and already respects compaction projection.

But there are important mismatches to fix before shipping branching:

- `src/session/types.ts:6-11` comments say `parentSessionId` is for new conversation forks, but `src/cli.ts:164-179` and `src/cli.ts:1336-1354` use it for subagent child sessions.
- `src/session/context.ts:100-148` ignores `branch_summary` entries today, even though the type exists.
- There is no method to move `active_leaf_id` without appending a normal entry.
- There is no API to list all entries as a tree, only `getActivePath()`.
- There is no source-entry remapping API for physical forks.

## Pi Findings

### What Pi Implements

Pi implements two related mechanisms:

1. **Session fork**: create a new session file containing copied path entries.
2. **Tree navigation/branching**: keep one append-only session tree and move the active leaf.

The newer `packages/agent` harness is the cleaner model for Furnace.

Important files:

- `packages/agent/src/harness/types.ts:334-420`
  - Entries share `type`, `id`, `parentId`, `timestamp`.
  - Entry union includes `branch_summary` and `leaf`.
  - `BranchSummaryEntry` stores `fromId`, `summary`, optional details, and `fromHook`.
  - `LeafEntry` stores a durable active-leaf target.
- `packages/agent/src/harness/session/jsonl-storage.ts:109-110`
  - Effective active leaf is `entry.targetId` for a `leaf` entry, otherwise the appended entry id.
- `packages/agent/src/harness/session/jsonl-storage.ts:226-244`
  - `setLeafId()` appends a `leaf` entry, making navigation durable.
- `packages/agent/src/harness/session/session.ts:22-80`
  - `buildSessionContext()` walks only the selected branch/path and projects branch summaries into context.
- `packages/agent/src/harness/session/repo-utils.ts:32-51`
  - Fork boundary logic supports `position: "before" | "at"`.
- `packages/agent/src/harness/session/jsonl-repo.ts:133-159`
  - `fork()` creates a new JSONL file with parent path metadata and copied fork path entries.
- `packages/agent/src/harness/agent-harness.ts:732-827`
  - `navigateTree()` requires idle state, optionally summarizes abandoned branch entries, handles user-message selection by returning text to the editor, then emits `session_tree`.
- `packages/agent/src/harness/compaction/branch-summarization.ts:66-260`
  - Branch summaries collect entries from the abandoned branch back to the deepest common ancestor and produce a structured summary.

Pi's older `packages/coding-agent` layer has useful TUI behavior:

- `/fork`, `/tree`, `/clone` commands.
- Tree selector with active path highlighting, filters, search, fold/unfold, labels, and summary options.
- But the older in-memory `branch()`/`resetLeaf()` pattern is less durable than the newer `LeafEntry` approach.

### Pi Strengths

- Clean conceptual separation between same-session branch navigation and new-session fork.
- Append-only tree avoids destructive transcript rewrites.
- Durable `leaf` entries make branch navigation restart-safe.
- Branch summaries are context entries, not hidden side effects.
- Common-ancestor abandoned-branch summarization is exactly the right scope.
- User-message selection semantics are good: select prompt, branch before it, load prompt into composer.
- TUI has mature navigation affordances.

### Pi Weaknesses To Avoid

- Avoid duplicating session implementations like Pi currently has between newer `packages/agent` and older `packages/coding-agent`.
- Avoid non-durable in-memory leaf mutation.
- Branch summary field naming can be clearer than Pi's `fromId`; Furnace should distinguish `abandonedLeafId`, `targetEntryId`, and `commonAncestorEntryId`.
- Full tree selector complexity is high; Furnace should build a smaller version first.

## OpenCode Findings

### What OpenCode Implements

OpenCode has two distinct concepts:

1. Manual “fork from message” copies a prefix of message history into a brand-new root session.
2. `parentID` lineage is mainly for child/subagent sessions, not manual forks.

Important files:

- `packages/core/src/session/sql.ts:22-65`
  - Session table has optional `parent_id` and an index.
- `packages/opencode/src/session/session.ts:693-734`
  - Manual `Session.fork()` creates a new session and copies message/part history with new IDs.
  - Assistant `parentID` references and compaction `tail_start_id` are remapped.
  - Manual fork does **not** set `parentID`.
- `packages/opencode/src/tool/task.ts:142-158`
  - `parentID` is used for child task/subagent sessions.
- `packages/app/src/components/dialog-fork.tsx:34-80`
  - Fork dialog lists user messages, selects one, restores selected prompt into composer, calls fork API, routes to the new session.
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:206-216`
  - HTTP fork handler.

### OpenCode Strengths

- Excellent simple UX: choose a previous user prompt, fork before it, prefill composer for editing/resubmission.
- Fresh IDs for copied messages avoid shared mutable history.
- Remaps assistant parent pointers and compaction tail pointers.
- Cycle-safe lineage helpers exist for child sessions.
- Child sessions are visibly separate from normal editable sessions.

### OpenCode Weaknesses To Avoid

- Manual forks are not durable lineage children, because `parentID` is not set.
- Fork boundary relies on sortable message IDs (`msg.info.id >= input.messageID`) instead of explicit sequence/order.
- Copying history by replaying messages loses source mapping unless extra metadata is added.
- Fork/session inheritance choices are implicit rather than documented.
- No CLI fork command.

## Hermes Findings

### What Hermes Implements

Hermes implements branching as:

> copy transcript into a new session row + link to original with `parent_session_id` + set stable `_branched_from` metadata.

It exposes this across CLI, gateway, desktop, and TUI RPC.

Important files:

- `hermes_state.py:700-742`
  - `sessions` table stores `parent_session_id` plus lifecycle/title/cwd/git fields.
- `hermes_state.py:43-61`
  - Branch children are listable when `model_config._branched_from` is set or a legacy `end_reason = 'branched'` heuristic matches.
- `hermes_state.py:2701-2762`
  - `list_sessions_rich()` hides generic children but includes branch children and roots.
- `hermes_cli/commands.py:89-90`
  - `/branch` registered with alias `/fork`.
- `hermes_cli/cli_commands_mixin.py:860-1003`
  - CLI branch flushes messages, creates child with `parent_session_id` and `_branched_from`, copies messages, switches live runtime state.
- `gateway/slash_commands.py:3707-3802`
  - Gateway `/branch` uses similar copy/link behavior.
- `tui_gateway/server.py:4908-5024`
  - `session.create` accepts seeded messages and `parent_session_id`.
- `tui_gateway/server.py:1626-1652`
  - `_persist_branch_seed()` persists copied seed transcript on first turn.
- `tui_gateway/server.py:7764-7832`
  - TUI RPC `session.branch` creates a persisted branch and live agent.
- `apps/desktop/src/lib/session-branch-tree.ts:10-108`
  - Flattens sessions into nested/sidebar branch rows.
- `apps/desktop/src/app/session/hooks/use-session-actions/index.ts:644-793`
  - Desktop branch actions from current chat, message, or sidebar row.

### Hermes Strengths

- Branch children remain visible while generic/delegate children can stay hidden.
- Explicit `_branched_from` marker is better than relying only on `parent_session_id`.
- Branch title generation and sidebar clustering are good UX patterns.
- Runtime state is updated thoroughly after branch creation.
- Lazy/draft seeded branch handling is thoughtful.

### Hermes Weaknesses To Avoid

- `parent_session_id` is overloaded for branches, compression chains, delegates/subagents, and tool sessions, which forces heuristics.
- Some copy loops swallow errors instead of using a transaction/failing loudly.
- Desktop branch semantics are inconsistent: sidebar branch copies full transcript, message action may copy only a slice.
- Ending parent sessions with `end_reason = 'branched'` is unnecessary and semantically odd.
- Branch title uniqueness is string-based/global rather than scoped to a root lineage.

## Who Does It Best?

| Category | Winner | Why |
| --- | --- | --- |
| Storage architecture | Pi | Append-only entry tree + durable leaf movement is the cleanest foundation. |
| Same-session branch navigation | Pi | Explicit tree navigation, active leaf, branch summaries, editor rehydration. |
| New-session fork UX | OpenCode | Very simple “pick user prompt, prefill composer” interaction. |
| Sidebar lineage display | Hermes | Branch grouping and listable child filtering are more polished. |
| Runtime state switching | Hermes | It carefully updates session/env/agent/memory references after branching. |
| Data-model clarity | Pi | Less overloaded than Hermes and less misleading than OpenCode manual forks. |

Overall: **Pi is the best foundation; OpenCode and Hermes should influence UX.**

## Proposed Furnace Design

### 1. Fix session relationship modeling first

Current `parentSessionId` is already used for subagents even though comments reserve it for forks. Add explicit relation metadata.

Preferred schema migration:

```sql
alter table sessions add column parent_session_id text;
alter table sessions add column relation_type text;
alter table sessions add column forked_from_entry_id text;
alter table sessions add column root_session_id text;
alter table sessions add column fork_position text;
```

Where:

```ts
type SessionRelationType =
  | "fork"
  | "subagent"
  | "delegation"
  | "compression"
  | "tool"
  | null
```

Notes:

- Existing subagent-created sessions should set `relation_type = "subagent"`.
- User-created fork sessions should set `relation_type = "fork"`.
- History/sidebar should show roots plus `fork` children, and hide `subagent` children by default.
- Permissions can still inherit across subagents, but manual forks should have a deliberate policy.

Alternative: create a separate `session_relations` table. That is cleaner long-term, but a few nullable columns are enough for now and fit the existing `SessionRecord` shape.

### 2. Add durable same-session branch navigation

Do not just update `sessions.active_leaf_id` in place. Copy Pi's durable leaf-entry idea.

Add an entry type:

```ts
type EntryType =
  | "message"
  | "tool_call"
  | "tool_result"
  | "compaction"
  | "branch_summary"
  | "model_change"
  | "custom"
  | "leaf" // new
```

Payload:

```ts
type LeafEntryData = {
  kind: "active_leaf_move"
  targetEntryId: string | null
  previousLeafId: string | null
  reason: "tree_navigation" | "fork_source" | "undo" | "resume"
}
```

Storage behavior:

- `appendEntry()` keeps current behavior for normal entries.
- Add `moveActiveLeaf(sessionId, targetEntryId, data?)`.
- `moveActiveLeaf()` should append a `leaf` entry under the current active leaf but set `sessions.active_leaf_id = targetEntryId`.
- Add `getTimelineEntries(sessionId)` to return all entries including `leaf` markers.
- `getActivePath()` should continue walking from `sessions.active_leaf_id`; it does not need to include the `leaf` marker unless branch summaries should be projected.

Why this matters:

- The selected branch survives process restart.
- Future audit/history can show “user moved from branch X to branch Y.”
- Undo/resume behavior has a durable trail.

### 3. Add branch summaries as model context

Furnace already has `branch_summary` in the entry union but does not project it.

Recommended payload:

```ts
type BranchSummaryEntryData = {
  kind: "branch_summary"
  abandonedLeafId: string
  targetEntryId: string | null
  commonAncestorEntryId: string | null
  summary: string
  details?: {
    readFiles?: string[]
    modifiedFiles?: string[]
    summarizedEntryCount?: number
    fallback?: boolean
  }
}
```

Projection:

- Update `entriesToModelMessages()` / `entryToModelMessage()` to convert relevant branch summaries to a user/system-style context message.
- The message should say this is reference-only context from an abandoned branch.
- It should preserve files touched, decisions, tests, and blockers.

Scope:

- Like Pi, summarize only entries between the old leaf and the deepest common ancestor with the target path.
- Do not summarize unrelated sibling branches.

### 4. Add SessionStore APIs

Minimum APIs:

```ts
listEntries(sessionId: string): EntryRecord[]
getEntry(sessionId: string, entryId: string): EntryRecord | undefined
getPathToEntry(sessionId: string, entryId: string | null): EntryRecord[]
moveActiveLeaf(sessionId: string, targetEntryId: string | null, options: MoveLeafOptions): EntryRecord<LeafEntryData>
forkSession(input: ForkSessionInput): SessionRecord
listSessionTree(cwd: string): SessionTreeNode[]
```

`ForkSessionInput`:

```ts
type ForkSessionInput = {
  sourceSessionId: string
  sourceEntryId?: string
  position: "before" | "at"
  title?: string
  relationType: "fork"
}
```

Fork boundary rules:

- `position: "at"`: copy through selected entry.
- `position: "before"`: selected entry must be a user message; copy through its parent and return selected prompt text for the composer.
- No `sourceEntryId`: copy through current active leaf.
- Use parent pointers / path order, not ID lexical ordering.

Fork copying rules:

- Copy only the source root-to-boundary active path.
- Generate fresh entry IDs and fresh tool call IDs if model-provider tool-call IDs are reused in copied messages.
- Preserve message content, image metadata, compaction summaries, branch summaries, and model/source/usage metadata as appropriate.
- Preserve tool call/result pairs together; never copy a result without its call.
- Record source mapping in copied entry data or a side table if later diff/compare is planned.
- Use a SQLite transaction; fail the fork if any copy fails.

### 5. Add CLI/TUI commands in this order

#### `/tree`

Same-session navigation.

First version:

- Render a selectable flattened tree of entries.
- Include user and assistant messages by default; optionally hide tool entries.
- Highlight active path and active leaf.
- Selecting a user message means “move before this prompt and put the prompt into the composer.”
- Selecting an assistant/tool/compaction entry means “move to this entry.”
- Ask whether to summarize the abandoned branch:
  - no summary
  - summarize
  - summarize with custom focus

Follow-up version:

- Search/filter.
- Labels/bookmarks.
- Fold/unfold large tool sections.
- Show branch summaries inline.

#### `/fork`

New-session fork from a previous user prompt.

First version:

- Show a list of prior user prompts from the active path, newest first.
- On selection, create a new fork with `position: "before"`.
- Switch to the new session.
- Prefill composer with the selected prompt text.
- Title: `Fork: <parent title>` or `Parent title (fork N)`.

Also support:

- `/fork current` or `/clone`: copy through current active leaf with `position: "at"`.
- Headless mode flag later: `--fork-from <entry-id>`.

#### `/branches`

Optional later command.

- Show branches/forks associated with current session root.
- Separate same-session branches from forked sessions.
- Include subagent children only behind a filter.

### 6. History/sidebar display

Copy Hermes' idea but make relation types explicit.

- `/history` should list root sessions and manual `fork` sessions.
- Hide `subagent` relation sessions by default.
- Show fork children nested under their parent/root when practical.
- Sort branch clusters by freshest member, not only parent update time.
- Avoid showing branch children as unrelated top-level chats.

### 7. Permission and state inheritance

Decide inheritance explicitly:

Manual forks should inherit:

- `cwd`
- selected model and model settings
- theme/input preferences remain global/project-level, not copied
- plan mode only if user forks a plan-mode session intentionally

Manual forks should **not** automatically inherit:

- broad “allow all session” permission grants
- pending task groups
- transient UI state

Subagents should keep current permission inheritance behavior, but should be marked `relation_type = "subagent"`.

### 8. Tests to add

Storage tests:

- Appending normal entries still advances active leaf.
- `moveActiveLeaf()` persists selected target after reopening store.
- `getActivePath()` follows selected branch only.
- Fork before a user message copies through parent and returns prompt text.
- Fork at selected entry copies through that entry.
- Fork uses transactions; partial copy does not create a broken session.
- Tool call/result pairs remain valid after fork.
- Compaction `firstKeptEntryId` is remapped or preserved correctly depending on copy strategy.
- `relation_type` separates forks from subagents in listing.

Context tests:

- Branch summary projects into model messages.
- Branch summary does not appear in human transcript unless desired.
- Compaction and branch summary projection do not conflict.

CLI/TUI-adjacent tests:

- `/fork` lists only visible user messages.
- `/tree` selecting a user message returns editor text.
- `/history` hides subagents but shows manual forks.

## Suggested Implementation Phases

### Phase 1: Data model cleanup

- Add `relationType`, `rootSessionId`, and explicit fork fields to `SessionRecord` / schema.
- Update subagent session creation to pass `relationType: "subagent"`.
- Update list/history queries to optionally include/exclude relation types.
- Update docs/tests.

### Phase 2: Same-session branch primitive

- Add `leaf` entry type and `moveActiveLeaf()`.
- Add tree/list entry APIs.
- Add tests proving durable active leaf movement.

### Phase 3: Branch summary projection

- Add `BranchSummaryEntryData`.
- Implement abandoned-branch collection via common ancestor.
- Add deterministic fallback summary first; model-generated summary can follow.
- Project summaries into model context.

### Phase 4: `/tree`

- Build a simple selectable tree view using existing `SelectList` patterns.
- Support selecting user messages and prefilling composer.
- Add no-summary/summarize/custom-summary options later if needed.

### Phase 5: `/fork` and `/clone`

- Implement transactional `forkSession()`.
- Add `/fork` user-message picker.
- Add `/clone` current-leaf fork.
- Update history/sidebar to nest or label forks.

## Final Design Choice

Use **Pi's storage and branch model** as the base:

- append-only entries,
- active leaf,
- durable leaf move entries,
- branch summaries,
- separate same-session branch vs new-session fork APIs.

Add **OpenCode's fork-from-prompt UX**:

- user-message picker,
- fork before selected prompt,
- prefill composer for editing.

Add **Hermes' listable branch lineage UX**:

- explicit child visibility,
- nested history/sidebar grouping,
- branch titles.

Avoid the main mistakes seen in the references:

- Do not use one `parent_session_id` meaning for every child relationship.
- Do not make manual forks lose durable lineage.
- Do not rely on lexicographic IDs for fork boundaries.
- Do not mutate active leaf only in memory.
- Do not swallow partial-copy errors during fork creation.

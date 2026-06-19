# Agent Tooling Comparison: Pi And OpenCode

This report compares the built-in tools shipped by Pi and OpenCode, based on the local reference clones in:

- `/Users/nihal/code/test-repos/pi`
- `/Users/nihal/code/test-repos/opencode`

Both clones were refreshed with `git pull --ff-only` before this report:

- Pi: `128330e`
- OpenCode: `c6083a4`

## Short Version

Both Pi and OpenCode expose file reads, edits, writes, search, and shell execution as first-class model tools. The agent is not expected to write shell commands for normal file reading, editing, listing, globbing, or grepping.

The shell tool still exists in both projects, but it is framed as the escape hatch for real terminal work: package managers, tests, git, build systems, docker, language CLIs, and other project commands. Both projects actively discourage using shell commands like `cat`, `sed`, `grep`, `find`, `head`, and `tail` when a dedicated tool exists.

Pi keeps the default tool surface small:

- `read`
- `bash`
- `edit`
- `write`
- `grep`
- `find`
- `ls`

OpenCode ships a broader default surface:

- `bash`
- `read`
- `glob`
- `grep`
- `edit`
- `write`
- `task`
- `webfetch`
- `todowrite`
- `websearch`
- `skill`
- `apply_patch`
- `question` in app, CLI, and desktop clients
- `lsp` behind an experimental flag
- `plan` behind an experimental flag

For Furnace, the right first step is closer to Pi's small core, with two OpenCode lessons pulled forward immediately: explicit permission metadata on every tool call, and first-class `webfetch`/`websearch` once network permission policy exists.

## Pi Built-In Tools

Pi defines built-in tools in `packages/coding-agent/src/core/tools`. These tools are TypeBox-schema-backed `ToolDefinition`s with `execute`, `renderCall`, and `renderResult` behavior. The definitions are wrapped into agent runtime tools through `tool-definition-wrapper.ts`.

Pi's built-in tool names are declared as:

```ts
export type ToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls";
export const allToolNames: Set<ToolName> = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
```

Pi has helpers for several tool sets:

- `createCodingToolDefinitions`: `read`, `bash`, `edit`, `write`
- `createReadOnlyToolDefinitions`: `read`, `grep`, `find`, `ls`
- `createAllToolDefinitions`: all seven built-ins

The docs expose CLI switches for allowing/disabling tools:

- `--tools <list>`
- `--exclude-tools <list>`
- `--no-builtin-tools`
- `--no-tools`

### Pi `read`

Pi's `read` is a first-class file reader, not shell `cat`.

Parameters:

- `path`
- optional `offset`
- optional `limit`

Behavior:

- Resolves relative, absolute, and `~` paths against the current working directory.
- Handles macOS filename quirks, including screenshot AM/PM spacing, NFD Unicode normalization, and curly quote variants.
- Checks readability.
- Reads text files and truncates output to 2000 lines or 50 KB.
- Gives continuation hints such as `Use offset=N to continue`.
- Supports images: jpg, png, gif, and webp.
- Resizes images before attaching them when needed.
- If the current model does not support images, it returns a note and omits or degrades image handling.
- Returns structured content, including image attachments when supported.

Notable prompt guidance:

- "Use read to examine files instead of cat or sed."

### Pi `write`

Pi's `write` is a first-class file creation/overwrite tool.

Parameters:

- `path`
- `content`

Behavior:

- Resolves the target path against cwd.
- Creates parent directories automatically.
- Writes UTF-8 content.
- Uses a per-file mutation queue so concurrent writes to the same file are serialized.
- Renders a syntax-highlighted preview in the TUI.

Prompt guidance:

- Use `write` only for new files or complete rewrites.

### Pi `edit`

Pi's `edit` is a first-class exact replacement tool.

Current schema:

- `path`
- `edits`: array of `{ oldText, newText }`

Behavior:

- Supports multiple disjoint edits in one call.
- All edits are matched against the original file, not incrementally after earlier edits.
- Rejects empty `oldText`.
- Rejects missing matches.
- Rejects duplicate matches unless the old text is made unique.
- Rejects overlapping edits.
- Normalizes line endings for matching, then restores original line endings.
- Preserves BOM.
- Computes and returns both display diff and unified patch.
- Uses a per-file mutation queue.
- TUI can preview the diff before or while the tool call resolves.

Important design choice:

- Pi keeps edit strict. It does not do broad fuzzy correction in the main edit path. If the model gives a bad `oldText`, the tool errors and asks for more exact context.

### Pi `bash`

Pi's `bash` is a first-class shell tool for terminal operations.

Parameters:

- `command`
- optional `timeout` in seconds

Behavior:

- Runs the command in the current working directory.
- Uses bash on Unix and discovers Git Bash or another bash on Windows.
- Can prepend a configured command prefix.
- Supports spawn hooks for extensions to rewrite command, cwd, or environment.
- Streams stdout and stderr together.
- Supports abort.
- Supports timeout.
- Kills the process tree.
- Truncates shell output to the last 2000 lines or 50 KB.
- Saves full output to a temp file if truncated.
- Emits partial output updates for the UI.

Prompt guidance:

- "Execute bash commands (ls, grep, find, etc.)"

This is interesting because Pi still tells the model bash can run common commands, but it also provides dedicated `grep`, `find`, and `ls` tools and the read tool explicitly says to avoid `cat`/`sed`.

### Pi `grep`

Pi's `grep` is a first-class content search tool backed by ripgrep.

Parameters:

- `pattern`
- optional `path`
- optional `glob`
- optional `ignoreCase`
- optional `literal`
- optional `context`
- optional `limit`

Behavior:

- Uses `rg --json`.
- Respects `.gitignore`.
- Supports regex or fixed-string matching.
- Supports file glob filtering.
- Supports context lines.
- Defaults to 100 matches.
- Truncates long match lines to 500 characters.
- Truncates total output by bytes.
- Returns file paths and line numbers.
- Uses `ensureTool("rg")` to find or download ripgrep.

### Pi `find`

Pi's `find` is a first-class file glob tool backed by `fd`.

Parameters:

- `pattern`
- optional `path`
- optional `limit`

Behavior:

- Uses `fd --glob`.
- Respects `.gitignore`.
- Includes hidden files.
- Adds `--no-require-git` so ignore behavior works outside git repos.
- Defaults to 1000 results.
- Returns relative paths.
- Truncates total output by bytes.
- Uses `ensureTool("fd")` to find or download `fd`.

Naming note:

- Pi calls this tool `find`, while OpenCode calls the equivalent `glob`.

### Pi `ls`

Pi's `ls` is a first-class directory listing tool.

Parameters:

- optional `path`
- optional `limit`

Behavior:

- Lists a directory.
- Includes dotfiles.
- Sorts entries alphabetically, case-insensitive.
- Adds `/` suffix for directories.
- Defaults to 500 entries.
- Truncates by entry count and by bytes.

### Pi Web Tools

Pi does not ship `websearch` or `webfetch` as built-in core tools in the coding agent tool directory. Its docs and tests point to skills/extensions for web capabilities. The skills docs include an example "Web search and content extraction via Brave Search API" skill, but that is not a default built-in.

### Pi Safety And Permissions

Pi has project trust for loading project-local settings/resources/extensions, but its security docs are explicit that this is not a sandbox. Built-in tools run with the permissions of the Pi process. The docs say built-in tools can read files, write files, edit files, and run shell commands with normal local user permissions.

The important architectural lesson is not "Pi is locked down." It is:

- tools have schemas and structured execution;
- tools are pluggable;
- file mutation is serialized per file;
- large output is consistently truncated;
- the UI gets rich render metadata;
- the model is guided toward dedicated tools instead of ad hoc shell commands.

## OpenCode Built-In Tools

OpenCode defines active built-in tools in `packages/opencode/src/tool`. The registry is in `packages/opencode/src/tool/registry.ts`, and the model-facing tool adapter is in `packages/opencode/src/session/tools.ts`.

OpenCode's active registry initializes:

- `invalid`
- `question`
- `bash` through `ShellTool`
- `read`
- `glob`
- `grep`
- `edit`
- `write`
- `task`
- `webfetch`
- `todowrite`
- `websearch`
- `skill`
- `apply_patch`
- `lsp` when `OPENCODE_EXPERIMENTAL_LSP_TOOL` or broader experimental flags enable it
- `plan` when experimental plan mode is enabled in CLI

MCP tools and plugin tools are then added beside these built-ins.

### OpenCode Registry Behavior

The registry does more than return a static list:

- It loads project/global custom tools from `{tool,tools}/*.{js,ts}`.
- It loads plugin tools.
- It triggers plugin hooks before and after tool execution.
- It transforms tool schemas for provider compatibility.
- It filters tools by provider, model, agent permission, and feature flags.
- It only exposes `websearch` when available through the OpenCode provider or when Exa/Parallel flags are enabled.
- It chooses between `apply_patch` and `edit`/`write` for some GPT models:
  - GPT non-OSS, non-GPT-4 models get `apply_patch`.
  - Otherwise `edit` and `write` are exposed.

This model-specific tool shaping is a useful idea, but Furnace should defer it until there is a provider abstraction and real model capability metadata.

### OpenCode Permissions

OpenCode docs say tools are enabled and allowed by default, but every important built-in still calls `ctx.ask(...)` with a permission name, pattern list, and metadata. The permission engine decides whether that means allow, deny, or ask.

Examples:

- `read` asks permission `read` with the relative path.
- `edit`, `write`, and `apply_patch` ask permission `edit` with diff metadata.
- `bash` asks permission `bash` with command patterns.
- `webfetch` asks permission `webfetch` with the URL.
- `websearch` asks permission `websearch` with the query.
- external paths ask `external_directory`.

This is the main thing Furnace should copy early: tools should not silently perform privileged operations. Even if the first policy allows many things, the tool path should always produce permission metadata.

### OpenCode `read`

OpenCode's `read` handles both files and directories. It is effectively `read` plus `ls`.

Parameters:

- `filePath`
- optional `offset`
- optional `limit`

Behavior:

- The model-facing prompt says `filePath` should be absolute.
- Relative paths are still resolved against the session directory.
- Calls `external_directory` permission if outside the worktree/session root.
- Calls `read` permission before reading.
- If reading a directory:
  - lists entries,
  - adds `/` for subdirectories,
  - supports offset and limit,
  - returns directory metadata for UI display.
- If reading a file:
  - streams lines,
  - prefixes each line as `<line>: <content>`,
  - defaults to 2000 lines,
  - caps output at 50 KB,
  - truncates individual lines over 2000 characters,
  - returns continuation hints.
- Detects binary files and refuses to read them as text.
- Supports images and PDFs as attachments.
- Runs instruction/context resolution and appends loaded instruction reminders.
- Warms LSP for the file after reading.
- Suggests close filenames if the target is missing.

Important prompt guidance:

- Call `read` in parallel for multiple known files.
- Avoid tiny repeated slices.
- Use `grep` for targeted content in large files.

### OpenCode `write`

OpenCode's `write` is a first-class writer.

Parameters:

- `filePath`
- `content`

Behavior:

- The prompt says `filePath` must be absolute.
- Relative paths are still resolved against the session directory.
- Calls `external_directory` permission if outside the workspace.
- Reads existing content if the file exists.
- Computes a diff before writing.
- Asks `edit` permission with diff metadata.
- Preserves BOM when applicable.
- Writes parent directories.
- Runs the configured formatter.
- Publishes file edited and watcher events.
- Touches LSP.
- Reports diagnostics in the changed file and a capped number of other files.

Prompt guidance:

- For existing files, the agent must read first.
- Prefer editing existing files.
- Do not proactively create docs unless explicitly requested.

### OpenCode `edit`

OpenCode's `edit` is a first-class exact replacement tool with fuzzy fallbacks.

Parameters:

- `filePath`
- `oldString`
- `newString`
- optional `replaceAll`

Behavior:

- Rejects missing `filePath`.
- Rejects `oldString === newString`.
- Allows empty `oldString` only for creating a new file. For existing files, empty `oldString` fails.
- Calls `external_directory` permission if needed.
- Uses a per-file semaphore lock.
- Reads existing content with BOM handling.
- Normalizes line endings for replacement and restores the file's original ending.
- Builds a diff before writing.
- Asks `edit` permission with diff metadata.
- Writes content, formats it, emits file events, and reports LSP diagnostics.
- Stores diff/file metadata for UI and snapshots.

OpenCode's replacement function tries a chain of increasingly flexible matchers:

- exact match;
- line-trimmed match;
- block anchor match;
- whitespace-normalized match;
- indentation-flexible match;
- escaped-string-normalized match;
- trimmed-boundary match;
- context-aware match;
- multi-occurrence match.

It still refuses dangerous fuzzy matches when the matched span is much larger than `oldString`, and it errors if multiple matches remain ambiguous.

Design tradeoff:

- This is more forgiving than Pi and can recover from model formatting drift.
- It is also more complex and needs careful tests to avoid surprising edits.

### OpenCode `apply_patch`

OpenCode exposes a patch-language edit tool.

Parameters:

- `patchText`

Behavior:

- Parses `*** Begin Patch` / `*** End Patch` style patch text.
- Supports add, update, delete, and move.
- Validates hunks before writing.
- Resolves paths relative to the project/session directory.
- Calls `external_directory` permission if needed.
- Computes per-file diffs and aggregate diff metadata.
- Asks `edit` permission for all affected paths.
- Applies changes, preserves BOM, formats files, emits watcher events, touches LSP, and reports diagnostics.

Registry note:

- OpenCode does not always expose this together with `edit`/`write`. For some GPT models it prefers `apply_patch`; otherwise it exposes `edit`/`write`.

### OpenCode `bash`

OpenCode's shell tool is named `bash` at the permission/tool level, but internally it is `ShellTool` and adapts to bash, PowerShell, or cmd.

Parameters:

- `command`
- optional `timeout` in milliseconds
- optional `workdir`
- `description`

Behavior:

- Uses configured shell.
- Strongly tells the model to use `workdir` instead of `cd`.
- Parses shell commands with tree-sitter bash or PowerShell.
- Scans command ASTs for commands that touch files or change directories.
- If command paths point outside the workspace, asks `external_directory`.
- Asks `bash` permission with command patterns.
- Runs with a default timeout, currently 2 minutes unless configured.
- Streams stdout/stderr.
- Stores full large output in a file when truncated.
- Maintains metadata previews for UI.
- Kills process on abort or timeout.

Prompt guidance is very explicit:

- Shell is for terminal operations like git, npm, docker, tests, build tools.
- Do not use shell for reading, writing, editing, searching, or finding files when dedicated tools exist.
- Avoid `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, and `echo` for file work.
- Follow git safety rules: no commits/pushes/PRs unless explicitly requested, inspect status/diff/log first, do not force push or skip hooks unless asked.

### OpenCode `glob`

OpenCode's `glob` is a first-class file pattern tool.

Parameters:

- `pattern`
- optional `path`

Behavior:

- Asks `glob` permission with the pattern.
- Resolves `path` against the session directory.
- Validates path is a directory.
- Calls `external_directory` permission if needed.
- Uses OpenCode's ripgrep service.
- Limits to 100 results.
- Returns absolute paths.
- Reports truncation if exactly at the limit.

### OpenCode `grep`

OpenCode's `grep` is a first-class content search tool.

Parameters:

- `pattern`
- optional `path`
- optional `include`

Behavior:

- Asks `grep` permission with the pattern.
- Resolves path relative to the session directory.
- Allows file or directory target.
- Calls `external_directory` permission if needed.
- Uses the ripgrep service.
- Limits to 100 matches.
- Returns grouped output by absolute file path and line number.

Prompt guidance:

- Use `grep` for finding files containing patterns.
- If the agent needs counts, use shell with `rg`.
- For open-ended multi-round searching, use `task`.

### OpenCode `webfetch`

OpenCode ships a first-class web fetch tool.

Parameters:

- `url`
- `format`: `markdown`, `text`, or `html`, default `markdown`
- optional `timeout` in seconds, capped at 120 seconds

Behavior:

- Requires URL to start with `http://` or `https://`.
- Asks `webfetch` permission with the URL.
- Uses Effect HTTP client.
- Sends browser-like `User-Agent` and Accept headers.
- Retries with an honest `opencode` user agent when Cloudflare challenge headers indicate bot mitigation.
- Caps response size at 5 MB.
- Supports image attachments.
- Converts HTML to Markdown with Turndown when requested.
- Extracts text from HTML by skipping script/style/noscript/iframe/object/embed content.

Doc mismatch:

- The prompt text says HTTP URLs will be upgraded to HTTPS, but the current implementation only validates `http://` or `https://`; it does not visibly rewrite HTTP to HTTPS in the inspected file.

### OpenCode `websearch`

OpenCode ships a first-class web search tool, conditionally available.

Parameters:

- `query`
- optional `numResults`
- optional `livecrawl`: `fallback` or `preferred`
- optional `type`: `auto`, `fast`, or `deep`
- optional `contextMaxCharacters`

Availability:

- Enabled for the OpenCode provider.
- Or enabled when Exa/Parallel flags are active.

Behavior:

- Chooses Exa or Parallel provider.
- Can be overridden with `OPENCODE_WEBSEARCH_PROVIDER=exa|parallel`.
- Uses session checksum to split between providers when both flags are absent but OpenCode provider enables search.
- Asks `websearch` permission with query and provider metadata.
- Calls hosted MCP-style web search endpoints.
- Includes current year guidance in the model-facing description.
- Parallel can use `PARALLEL_API_KEY`; without it, it still sends a user agent.

### OpenCode `task`

OpenCode's `task` is a first-class subagent tool.

Parameters:

- `description`
- `prompt`
- `subagent_type`
- optional `task_id` for resume
- optional `command`
- optional `background` when experimental background subagents are enabled

Behavior:

- Asks `task` permission for the subagent type.
- Creates or resumes a child session.
- Derives child permissions from the parent and subagent config.
- Denies `todowrite` and nested `task` for subagents unless explicitly allowed.
- Can run foreground and return the child agent's final text.
- Can run in background behind an experimental flag, later injecting synthetic results into the parent session.

This is powerful but should not be first in Furnace. It depends on mature sessions, permissions, eventing, and agent configuration.

### OpenCode `todowrite`

OpenCode's todo tool is a first-class session planning tool.

Parameters:

- `todos`: array of `{ content, status, priority }`

Behavior:

- Asks `todowrite` permission.
- Updates session todo state.
- Returns structured todo JSON.

The prompt encourages proactive use for 3+ step tasks and real-time status updates.

### OpenCode `question`

OpenCode's question tool lets the model ask structured questions during execution.

Parameters:

- `questions`

Behavior:

- Calls the question service for the session.
- Returns the user's answers to the model.
- Available for app, CLI, and desktop clients, or when a question-tool flag is enabled.

### OpenCode `skill`

OpenCode's skill tool loads skill content.

Parameters:

- `name`

Behavior:

- Requires a skill by name from available skills.
- Asks `skill` permission.
- Returns SKILL.md content with base directory metadata.
- Samples related skill files with ripgrep.

### OpenCode `lsp`

OpenCode has an experimental LSP tool.

Operations:

- `goToDefinition`
- `findReferences`
- `hover`
- `documentSymbol`
- `workspaceSymbol`
- `goToImplementation`
- `prepareCallHierarchy`
- `incomingCalls`
- `outgoingCalls`

Behavior:

- Resolves file path.
- Calls external-directory permission if needed.
- Asks `lsp` permission.
- Requires a configured LSP server for the file type.
- Returns raw JSON results.

This is valuable later but depends on LSP lifecycle management and should not block Furnace's first tool milestone.

## Direct Comparison

### Built-In Surface

Pi:

- Smaller default surface.
- Core coding tools only.
- No websearch/webfetch built-in.
- No task/todo/question/LSP in default core built-ins.
- Separate `ls` and `find` tools.

OpenCode:

- Broader agent-product surface.
- Built-in web fetch and web search.
- Built-in todo, question, skills, subagents, patch, and experimental LSP.
- No separate `ls`; `read` lists directories.
- Uses `glob` instead of `find`.

### File Read And Directory Listing

Pi:

- `read` reads files and images.
- `ls` lists directories.
- Output text does not include line numbers by default.

OpenCode:

- `read` reads files, directories, images, and PDFs.
- Directory read acts like `ls`.
- File output includes line numbers.
- Read also resolves instruction files and warms LSP.

Furnace recommendation:

- Start with OpenCode-style `read` that handles files and directories.
- Include line numbers in output.
- Support `offset`/`limit`.
- Add image/PDF support later; text first is enough.

### Search

Pi:

- `grep` uses ripgrep.
- `find` uses fd.
- Both include truncation and result limits.

OpenCode:

- `grep` and `glob` use a ripgrep service.
- Limits are smaller: 100 matches/results.
- Returns absolute paths.

Furnace recommendation:

- Use `glob`, not `find`, for model familiarity.
- Use ripgrep for both content search and file matching if practical.
- Respect `.gitignore`.
- Return paths relative to the workspace by default. Absolute paths can be included in metadata if needed.

### Edits

Pi:

- Strict multi-edit exact replacement.
- Multiple disjoint edits in one call.
- Rejects ambiguous/missing/overlapping replacements.
- Produces diff and patch details.

OpenCode:

- Single replacement per call plus optional `replaceAll`.
- Many fuzzy fallback matchers.
- Runs formatter and LSP diagnostics after edit.
- Requires permission with diff before writing.

Furnace recommendation:

- Start strict like Pi.
- Allow multiple edits in one file in one call.
- Require unique exact `oldText`.
- Generate diff before write and feed that into permission.
- Defer fuzzy matching until strict edit pain is proven.
- Add formatter/LSP diagnostics later.

### Write

Pi:

- Simple create/overwrite with parent directory creation.
- Prompt says use only for new files or full rewrites.

OpenCode:

- Computes diff for existing files.
- Asks `edit` permission.
- Formats and reports diagnostics.
- Warns the model not to proactively create docs.

Furnace recommendation:

- Implement `write` but make it ask under the `edit` permission group.
- Require explicit overwrite semantics in the permission metadata.
- Prefer `edit` for existing files.

### Shell

Pi:

- Bash-only mental model.
- Strong process handling and truncation.
- Full output saved if truncated.

OpenCode:

- Shell-adaptive: bash, PowerShell, cmd.
- Requires `description`.
- Has `workdir`.
- Parses shell AST for permission patterns and external directory detection.
- Very strong model guidance to avoid shell for file operations.

Furnace recommendation:

- Start with a bash tool using `command`, `timeout`, and `workdir`.
- Require a short `description`; it improves UI and permission prompts.
- Persist full output only if the user or config allows it.
- Add shell parsing later. For the first version, conservative command-pattern permission rules are enough.

### Web

Pi:

- No built-in web search/fetch.
- Uses skills/extensions for web capabilities.

OpenCode:

- Built-in `webfetch`.
- Conditional built-in `websearch`.
- Permission checks for URLs and queries.
- HTML-to-Markdown conversion.
- Image attachment support.
- 5 MB response cap.

Furnace recommendation:

- Add `webfetch` soon after local read/search tools because it is straightforward and useful for docs.
- Add `websearch` after deciding provider/API key strategy.
- Keep network permissions separate from filesystem/shell permissions.

### Permissions

Pi:

- Project trust controls loading project-local executable resources.
- Built-in local tools are not sandboxed.
- Security docs are clear about this.

OpenCode:

- Every tool calls `ctx.ask`.
- Permission config can allow, deny, or ask.
- Permissions include tool name, patterns, always patterns, and metadata.
- External directory access is a separate permission.

Furnace recommendation:

- Copy OpenCode's "every tool asks" shape.
- Even if default policy is `ask`, `allow`, or `deny`, do not let tools bypass the permission engine.
- Include metadata: path, command, diff, URL, query, cwd, timeout, truncation policy.

## What Furnace Should Build First

The first Furnace tool milestone should be small but real:

1. `read`
   - Read files and list directories.
   - `path`, `offset`, `limit`.
   - Deny `.env` and `.env.*` by default, allow `.env.example`.
   - Truncate output by lines and bytes.
   - Include line numbers.

2. `glob`
   - Find files by pattern.
   - Respect `.gitignore`.
   - Return relative paths.
   - Limit and truncate results.

3. `grep`
   - Search contents with ripgrep.
   - Regex by default, optional literal and case-insensitive flags.
   - Optional glob/include filter.
   - Match limit, line length cap, byte truncation.

4. `edit`
   - Exact replacements.
   - Multiple edits for one file.
   - Unique old text required.
   - Generate diff before writing.
   - Ask permission with diff metadata.
   - Serialize writes per file.

5. `write`
   - Create or overwrite.
   - Parent directory creation.
   - Ask permission as `edit`.
   - Strongly prefer `edit` for existing files.

6. `bash`
   - Command execution for terminal work.
   - `command`, `description`, `timeout`, `workdir`.
   - Capture stdout, stderr, exit code, duration.
   - Truncate output and optionally persist full output.
   - Ask permission before execution.

7. `webfetch`
   - Specific URL retrieval.
   - Markdown/text output.
   - Size and timeout caps.
   - Ask network permission by URL.

Defer:

- `websearch` until search provider selection is clear.
- `task`/subagents until the runtime event loop, session branching, and permissions are mature.
- `todowrite` until the TUI can render todos.
- `question` until approval/question UI exists.
- `skill` until resource loading and trust are designed.
- `lsp` until LSP server lifecycle exists.
- `apply_patch` until strict `edit` proves limiting, or until model-specific tool selection exists.

## Suggested Furnace Tool API Shape

Each tool should own:

- `name`
- `description`
- schema
- permission request builder
- execution logic
- result shape
- truncation behavior
- UI render metadata, or at least a typed event payload the UI can render

Suggested TypeScript shape:

```ts
type ToolDefinition<TInput, TResult> = {
  name: string
  description: string
  schema: unknown
  permission(input: TInput, context: ToolContext): PermissionRequest | null
  execute(input: TInput, context: ToolExecutionContext): AsyncGenerator<ToolEvent, TResult>
}
```

Suggested common result metadata:

```ts
type ToolResult = {
  output: string
  metadata?: Record<string, unknown>
  attachments?: ToolAttachment[]
  truncated?: {
    by: "lines" | "bytes"
    shownLines?: number
    totalLines?: number
    outputPath?: string
  }
}
```

Suggested permission request shape:

```ts
type PermissionRequest = {
  tool: string
  action: "read" | "write" | "execute" | "network"
  patterns: string[]
  metadata: Record<string, unknown>
}
```

## Better-Than-Both Opportunities

Furnace can keep the good parts while avoiding complexity too early:

- Use OpenCode's permission metadata discipline from day one.
- Use Pi's smaller initial surface so the runtime is easy to test.
- Use strict edits first; add fuzzy recovery only after failure data.
- Use one `read` tool for files and directories instead of separate `ls`.
- Use `glob` naming instead of `find`; it is clearer for model prompts.
- Keep shell output structured with separate stdout/stderr internally, even if model output combines them.
- Add a command classifier later for shell safety, but do not block the first shell tool on full AST parsing.
- Return relative paths in model-facing text to reduce noise, while storing absolute paths in metadata for UI/actions.
- Make every tool emit events: call started, permission requested, partial output, result, error.
- Keep tool execution independent of the TUI from the start.

## Key Takeaway

Pi and OpenCode both answer the central question clearly: read/edit/search/list tools are prebuilt. The model should not improvise `cat`, `sed`, `find`, and `grep` shell commands for normal code work.

For Furnace, the core design should be:

- dedicated tools for common codebase operations;
- shell as an escape hatch;
- permission checks before side effects;
- typed events for every tool lifecycle step;
- small initial surface, with web fetch/search added deliberately.

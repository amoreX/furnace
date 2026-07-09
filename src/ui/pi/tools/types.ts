/**
 * Ported from pi (https://github.com/earendil-works/pi).
 * MIT License, Copyright (c) 2025 Mario Zechner.
 *
 * Local structural equivalents of pi's core/extensions/types.ts tool types.
 * Furnace only needs the rendering surface of pi's ToolDefinition, so the
 * TypeBox parameter schema is replaced by plain argument generics and
 * execute() is optional (the ported definitions are render-only).
 */
import type { Component } from "@earendil-works/pi-tui";
import type { Theme } from "../theme.js";

/** Structural equivalent of pi-ai's AgentToolResult content blocks. */
export interface ToolResultContentBlock {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
}

/** Structural equivalent of pi-ai's AgentToolResult. */
export interface AgentToolResult<TDetails = unknown> {
	content: ToolResultContentBlock[];
	details: TDetails;
}

/** Rendering options for tool results */
export interface ToolRenderResultOptions {
	/** Whether the result view is expanded */
	expanded: boolean;
	/** Whether this is a partial/streaming result */
	isPartial: boolean;
}

/** Context passed to tool renderers. */
export interface ToolRenderContext<TState = any, TArgs = any> {
	/** Current tool call arguments. Shared across call/result renders for the same tool call. */
	args: TArgs;
	/** Unique id for this tool execution. Stable across call/result renders for the same tool call. */
	toolCallId: string;
	/** Invalidate just this tool execution component for redraw. */
	invalidate: () => void;
	/** Previously returned component for this render slot, if any. */
	lastComponent: Component | undefined;
	/** Shared renderer state for this tool row. Initialized by tool-execution.ts. */
	state: TState;
	/** Working directory for this tool execution. */
	cwd: string;
	/** Whether the tool execution has started. */
	executionStarted: boolean;
	/** Whether the tool call arguments are complete. */
	argsComplete: boolean;
	/** Whether the tool result is partial/streaming. */
	isPartial: boolean;
	/** Whether the result view is expanded. */
	expanded: boolean;
	/** Whether inline images are currently shown in the TUI. */
	showImages: boolean;
	/** Whether the current result is an error. */
	isError: boolean;
}

/**
 * Tool definition (rendering surface of pi's ToolDefinition).
 */
export interface ToolDefinition<TArgs = any, TDetails = unknown, TState = any> {
	/** Tool name (used in LLM tool calls) */
	name: string;
	/** Human-readable label for UI */
	label: string;
	/** Description for LLM */
	description?: string;
	/** Optional one-line snippet for the Available tools section in the default system prompt. */
	promptSnippet?: string;
	/** Optional guideline bullets appended to the default system prompt Guidelines section when this tool is active. */
	promptGuidelines?: string[];
	/** Controls whether ToolExecutionComponent renders the standard colored shell or the tool renders its own framing. */
	renderShell?: "default" | "self";

	/** Optional compatibility shim to prepare raw tool call arguments before schema validation. */
	prepareArguments?: (args: unknown) => TArgs;

	/** Execute the tool. Not used by the ported render-only definitions. */
	execute?: (...args: any[]) => Promise<AgentToolResult<TDetails>>;

	/** Custom rendering for tool call display */
	renderCall?: (args: TArgs, theme: Theme, context: ToolRenderContext<TState, TArgs>) => Component;

	/** Custom rendering for tool result display */
	renderResult?: (
		result: AgentToolResult<TDetails>,
		options: ToolRenderResultOptions,
		theme: Theme,
		context: ToolRenderContext<TState, TArgs>,
	) => Component;
}

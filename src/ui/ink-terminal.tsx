import { Box, Text, render, useApp, useInput, useWindowSize, type Instance } from "ink"
import * as React from "react"

import type { ModelSettings, ReasoningEffort } from "../preferences.js"
import type { TranscriptMessage } from "../session/types.js"
import { AppShell } from "./components/app-shell.js"
import { PromptInput } from "./components/prompt-input.js"
import { SelectList, type SelectListItem } from "./components/select-list.js"
import { Spinner } from "./components/spinner.js"
import { ThemeProvider, type Theme, useTheme } from "./components/theme-provider.js"
import { resolveTheme, themeChoices, type ThemeChoice } from "./terminal-themes/index.js"

export type FurnaceTerminal = {
  run(): Promise<void>
  stop(): void
  setBusy(busy: boolean): void
  setThinking(thinking: boolean, message?: string): void
  showHistory(choices: HistoryChoice[], currentSessionId: string | null, onSelect: (sessionId: string) => void, onCancel: () => void): void
  showModelPicker(
    choices: ModelChoice[],
    currentModel: string,
    currentSettings: ModelSettings,
    onSelect: (model: string, settings: ModelSettings, done: boolean) => void,
    onCancel: () => void,
  ): void
  showThemePicker(choices: ThemeChoice[], currentTheme: string, onSelect: (theme: string, done: boolean) => void, onCancel: () => void): void
  setModel(model: string, settings: ModelSettings): void
  setTheme(theme: string): void
  setTitle(title: string): void
  setTranscript(transcript: TranscriptMessage[]): void
}

export type HistoryChoice = {
  id: string
  title: string
  updatedAt: number
}

export type ModelChoice = {
  id: string
  name: string
  contextLength: number | null
  supportedParameters: string[]
}

type CreateFurnaceTerminalOptions = {
  cwd: string
  model: string
  modelSettings: ModelSettings
  themeName: string
  title: string
  onSubmit: (text: string) => void
}

type UiScreen =
  | { kind: "chat" }
  | { kind: "history"; choices: HistoryChoice[]; currentSessionId: string | null; onCancel: () => void; onSelect: (sessionId: string) => void }
  | {
      kind: "model"
      choices: ModelChoice[]
      currentModel: string
      onCancel: () => void
      onSelect: (model: string, settings: ModelSettings, done: boolean) => void
      settingsByModel: Record<string, ModelSettings>
    }
  | { kind: "theme"; choices: ThemeChoice[]; currentTheme: string; onCancel: () => void; onSelect: (theme: string, done: boolean) => void }

type UiState = {
  busy: boolean
  cwd: string
  model: string
  modelSettings: ModelSettings
  screen: UiScreen
  theme: Theme
  themeName: string
  thinking: boolean
  thinkingMessage: string
  title: string
  transcript: TranscriptMessage[]
}

class UiStore {
  private listeners = new Set<() => void>()
  private state: UiState

  constructor(options: CreateFurnaceTerminalOptions) {
    const themeChoice = resolveTheme(options.themeName)
    this.state = {
      busy: false,
      cwd: options.cwd,
      model: options.model,
      modelSettings: options.modelSettings,
      screen: { kind: "chat" },
      theme: themeChoice.theme,
      themeName: themeChoice.name,
      thinking: false,
      thinkingMessage: "thinking",
      title: options.title,
      transcript: [],
    }
  }

  getSnapshot = (): UiState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(updater: Partial<UiState> | ((state: UiState) => UiState)): void {
    this.state = typeof updater === "function" ? updater(this.state) : { ...this.state, ...updater }
    for (const listener of this.listeners) listener()
  }
}

export function createFurnaceTerminal(options: CreateFurnaceTerminalOptions): FurnaceTerminal {
  const store = new UiStore(options)
  let instance: Instance | undefined

  const stop = () => {
    instance?.unmount()
  }

  return {
    run() {
      instance = render(<FurnaceRoot onExit={stop} onSubmit={options.onSubmit} store={store} />, {
        alternateScreen: true,
        exitOnCtrlC: false,
        maxFps: 30,
      })
      return instance.waitUntilExit().then(() => undefined)
    },
    stop,
    setBusy(busy) {
      store.update({ busy })
    },
    setThinking(thinking, message = "thinking") {
      store.update({ thinking, thinkingMessage: message })
    },
    showHistory(choices, currentSessionId, onSelect, onCancel) {
      store.update({ screen: { kind: "history", choices, currentSessionId, onCancel, onSelect }, title: "History" })
    },
    showModelPicker(choices, currentModel, currentSettings, onSelect, onCancel) {
      store.update({
        screen: {
          kind: "model",
          choices,
          currentModel,
          onCancel,
          onSelect,
          settingsByModel: { [currentModel]: normalizeModelSettings(currentSettings, findModelChoice(choices, currentModel)) },
        },
        title: "Model",
      })
    },
    showThemePicker(choices, currentTheme, onSelect, onCancel) {
      store.update({ screen: { kind: "theme", choices, currentTheme, onCancel, onSelect }, title: "Theme" })
    },
    setModel(model, settings) {
      store.update((state) => ({ ...state, model, modelSettings: settings }))
    },
    setTheme(themeName) {
      const choice = resolveTheme(themeName)
      store.update({ theme: choice.theme, themeName: choice.name })
    },
    setTitle(title) {
      store.update({ title })
    },
    setTranscript(transcript) {
      store.update({ screen: { kind: "chat" }, transcript })
    },
  }
}

function FurnaceRoot({ onExit, onSubmit, store }: { onExit: () => void; onSubmit: (text: string) => void; store: UiStore }): React.ReactNode {
  const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return (
    <ThemeProvider theme={state.theme}>
      <FurnaceApp onExit={onExit} onSubmit={onSubmit} state={state} store={store} />
    </ThemeProvider>
  )
}

function FurnaceApp({
  onExit,
  onSubmit,
  state,
  store,
}: {
  onExit: () => void
  onSubmit: (text: string) => void
  state: UiState
  store: UiStore
}): React.ReactNode {
  const app = useApp()
  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      onExit()
      app.exit()
    }
  })

  return (
    <AppShell>
      <AppShell.Header cwd={shortenHome(state.cwd)} model={state.model} settings={`${formatFooterSettings(state.modelSettings)} · ${state.themeName}`} title={state.title} />
      <AppShell.Content>
        {state.screen.kind === "history" ? (
          <HistoryScreen screen={state.screen} store={store} />
        ) : state.screen.kind === "model" ? (
          <ModelScreen model={state.model} screen={state.screen} store={store} />
        ) : state.screen.kind === "theme" ? (
          <ThemeScreen screen={state.screen} store={store} />
        ) : (
          <ChatScreen thinking={state.thinking} thinkingMessage={state.thinkingMessage} transcript={state.transcript} />
        )}
      </AppShell.Content>
      <PromptInput busy={state.busy} disabled={state.screen.kind !== "chat"} onSubmit={onSubmit} placeholder={state.busy ? "Furnace is working..." : "Ask Furnace or type /theme"} />
      <AppShell.Hints items={hintItems(state.screen.kind)} />
    </AppShell>
  )
}

function hintItems(kind: UiScreen["kind"]): string[] {
  if (kind === "model") return ["type to filter", "enter select", "tab edit", "esc cancel"]
  if (kind === "theme") return ["up/down navigate", "enter preview", "esc cancel"]
  if (kind === "history") return ["up/down navigate", "enter open", "esc cancel"]
  return ["/new", "/history", "/model", "/theme", "/exit"]
}

function ChatScreen({ thinking, thinkingMessage, transcript }: { thinking: boolean; thinkingMessage: string; transcript: TranscriptMessage[] }): React.ReactNode {
  const theme = useTheme()
  const { columns, rows } = useWindowSize()
  const [scrollOffset, setScrollOffset] = React.useState(0)
  const viewportRows = Math.max(4, rows - 10)
  const transcriptLines = React.useMemo(() => buildTranscriptLines(transcript, Math.max(20, columns - 4), thinking, thinkingMessage), [columns, thinking, thinkingMessage, transcript])
  const maxScrollOffset = Math.max(0, transcriptLines.length - viewportRows)
  const pageScrollRows = Math.max(1, viewportRows - 2)
  const end = Math.max(0, transcriptLines.length - Math.min(scrollOffset, maxScrollOffset))
  const visibleLines = visibleTranscriptWindow(transcriptLines, Math.max(0, end - viewportRows), end, viewportRows)

  React.useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScrollOffset))
  }, [maxScrollOffset])

  React.useEffect(() => {
    setScrollOffset(0)
  }, [transcript.length])

  useInput((input, key) => {
    if (key.pageUp || (key.ctrl && input === "u")) {
      setScrollOffset((current) => Math.min(maxScrollOffset, current + pageScrollRows))
      return
    }
    if (key.pageDown || (key.ctrl && input === "d")) {
      setScrollOffset((current) => Math.max(0, current - pageScrollRows))
      return
    }
    if (key.upArrow) {
      setScrollOffset((current) => Math.min(maxScrollOffset, current + 1))
      return
    }
    if (key.downArrow) {
      setScrollOffset((current) => Math.max(0, current - 1))
      return
    }
    if (key.end) setScrollOffset(0)
    if (key.home) setScrollOffset(maxScrollOffset)
  })

  if (transcriptLines.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color={theme.colors.mutedForeground}>Start a conversation, or use /history, /model, and /theme.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {visibleLines.map((line, index) => (
        <TranscriptLine key={`${line.messageIndex ?? "line"}-${line.kind}-${end}-${index}`} line={line} />
      ))}
    </Box>
  )
}

type TranscriptLineData = {
  kind: "blank" | "content" | "spinner" | "role"
  messageIndex?: number
  role?: TranscriptMessage["role"]
  text: string
}

function TranscriptLine({ line }: { line: TranscriptLineData }): React.ReactNode {
  const theme = useTheme()
  if (line.kind === "blank") return <Text> </Text>
  if (line.kind === "spinner") return <Spinner label={line.text} />
  if (line.kind === "role") return <Text color={line.role === "user" ? theme.colors.primary : theme.colors.border} bold>{line.text}</Text>
  return <Text color={theme.colors.foreground}>{line.text || " "}</Text>
}

function buildTranscriptLines(transcript: TranscriptMessage[], width: number, thinking: boolean, thinkingMessage: string): TranscriptLineData[] {
  const lines: TranscriptLineData[] = []
  for (const [messageIndex, message] of transcript.entries()) {
    lines.push({ kind: "role", messageIndex, role: message.role, text: message.role === "user" ? "user" : "assistant" })
    for (const wrappedLine of wrapText(message.content || " ", width)) {
      lines.push({ kind: "content", messageIndex, role: message.role, text: wrappedLine })
    }
    lines.push({ kind: "blank", messageIndex, role: message.role, text: "" })
  }
  if (thinking) {
    lines.push({ kind: "role", messageIndex: transcript.length, role: "assistant", text: "assistant" })
    lines.push({ kind: "spinner", messageIndex: transcript.length, role: "assistant", text: thinkingMessage })
  }
  return lines
}

function visibleTranscriptWindow(lines: TranscriptLineData[], start: number, end: number, viewportRows: number): TranscriptLineData[] {
  const visible = lines.slice(start, end)
  while (visible[0]?.kind === "blank") visible.shift()

  const first = visible[0]
  if (first && first.kind !== "role" && first.role) {
    visible.unshift({
      kind: "role",
      messageIndex: first.messageIndex,
      role: first.role,
      text: `${first.role === "user" ? "user" : "assistant"} (continued)`,
    })
  }

  return visible.slice(0, viewportRows)
}

function wrapText(text: string, width: number): string[] {
  const result: string[] = []
  const targetWidth = Math.max(1, width)
  for (const sourceLine of text.split("\n")) {
    const words = sourceLine.split(/(\s+)/)
    let line = ""
    for (const word of words) {
      if (!word) continue
      if (line.length + word.length <= targetWidth) {
        line += word
        continue
      }
      if (line.trim()) result.push(line.trimEnd())
      if (word.length > targetWidth) {
        for (let index = 0; index < word.length; index += targetWidth) {
          const chunk = word.slice(index, index + targetWidth)
          if (chunk.length === targetWidth) result.push(chunk)
          else line = chunk
        }
      } else {
        line = word.trimStart()
      }
    }
    result.push(line.trimEnd())
  }
  return result.length > 0 ? result : [""]
}

function HistoryScreen({ screen, store }: { screen: Extract<UiScreen, { kind: "history" }>; store: UiStore }): React.ReactNode {
  const theme = useTheme()
  const items: Array<SelectListItem<string>> = React.useMemo(
    () =>
      screen.choices.map((choice) => ({
        description: formatRelativeTime(choice.updatedAt),
        label: choice.title,
        value: choice.id,
      })),
    [screen.choices],
  )
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={theme.colors.primary} bold>
        Select a conversation
      </Text>
      <SelectList
        items={items}
        maxRows={12}
        onCancel={() => {
          store.update({ screen: { kind: "chat" } })
          screen.onCancel()
        }}
        onSelect={(item) => {
          store.update({ screen: { kind: "chat" } })
          screen.onSelect(item.value)
        }}
        selectedValue={screen.currentSessionId}
      />
    </Box>
  )
}

function ThemeScreen({ screen, store }: { screen: Extract<UiScreen, { kind: "theme" }>; store: UiStore }): React.ReactNode {
  const theme = useTheme()
  const items: Array<SelectListItem<string>> = React.useMemo(
    () =>
      screen.choices.map((choice) => ({
        description: choice.description,
        label: choice.name,
        value: choice.name,
      })),
    [screen.choices],
  )
  const previewTheme = React.useCallback(
    (item: SelectListItem<string>) => {
      const choice = resolveTheme(item.value)
      store.update({ theme: choice.theme, themeName: choice.name })
    },
    [store],
  )

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={theme.colors.primary} bold>
        Select a theme
      </Text>
      <SelectList
        items={items}
        maxRows={12}
        onCancel={() => {
          const choice = resolveTheme(screen.currentTheme)
          store.update({ theme: choice.theme, themeName: choice.name, screen: { kind: "chat" } })
          screen.onCancel()
        }}
        onHighlight={previewTheme}
        onSelect={(item) => {
          const choice = resolveTheme(item.value)
          store.update({ theme: choice.theme, themeName: choice.name, screen: { kind: "chat" } })
          screen.onSelect(choice.name, true)
        }}
        selectedValue={screen.currentTheme}
      />
    </Box>
  )
}

function ModelScreen({ model, screen, store }: { model: string; screen: Extract<UiScreen, { kind: "model" }>; store: UiStore }): React.ReactNode {
  const theme = useTheme()
  const [filter, setFilter] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [editing, setEditing] = React.useState<{ choice: ModelChoice; selectedIndex: number } | undefined>()
  const filteredChoices = React.useMemo(() => filterModels(screen.choices, filter), [screen.choices, filter])
  const selectedChoice = filteredChoices[activeIndex]

  React.useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(0, current), Math.max(0, filteredChoices.length - 1)))
  }, [filteredChoices.length])

  useInput((input, key) => {
    if (editing) {
      const rows = modelEditorRows(editing.choice, settingsForModel(screen, editing.choice.id))
      if (key.escape || key.tab) {
        setEditing(undefined)
        return
      }
      if (key.upArrow) return setEditing({ ...editing, selectedIndex: Math.max(0, editing.selectedIndex - 1) })
      if (key.downArrow) return setEditing({ ...editing, selectedIndex: Math.min(rows.length - 1, editing.selectedIndex + 1) })
      if (key.return) {
        const row = rows[editing.selectedIndex]
        if (row && !row.disabled) applyModelEditorRow(store, screen, editing.choice, row)
      }
      return
    }

    if (key.escape) {
      store.update({ screen: { kind: "chat" } })
      screen.onCancel()
      return
    }
    if (key.upArrow) return setActiveIndex((current) => Math.max(0, current - 1))
    if (key.downArrow) return setActiveIndex((current) => Math.min(filteredChoices.length - 1, current + 1))
    if (key.tab) {
      if (selectedChoice) setEditing({ choice: selectedChoice, selectedIndex: 0 })
      return
    }
    if (key.return) {
      if (!selectedChoice) return
      store.update({ screen: { kind: "chat" } })
      screen.onSelect(selectedChoice.id, settingsForModel(screen, selectedChoice.id), true)
      return
    }
    if (key.backspace || key.delete) {
      setFilter((current) => current.slice(0, -1))
      setActiveIndex(0)
      return
    }
    if (!key.ctrl && !key.meta && input) {
      setFilter((current) => `${current}${input}`)
      setActiveIndex(0)
    }
  })

  if (editing) return <ModelEditorScreen choice={editing.choice} selectedIndex={editing.selectedIndex} settings={settingsForModel(screen, editing.choice.id)} />

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={theme.colors.primary} bold>
        Available OpenRouter models
      </Text>
      <Text color={theme.colors.mutedForeground}>Filter: {filter || "type to search"}</Text>
      {renderModelRows(filteredChoices, activeIndex, model)}
    </Box>
  )
}

function ModelEditorScreen({ choice, selectedIndex, settings }: { choice: ModelChoice; selectedIndex: number; settings: ModelSettings }): React.ReactNode {
  const theme = useTheme()
  const rows = modelEditorRows(choice, settings)

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={theme.colors.primary} bold>
        {choice.name} - Edit parameters
      </Text>
      {rows.map((row, index) => (
        <Box key={`${row.kind}-${row.label}`} justifyContent="space-between">
          <Text color={row.disabled ? theme.colors.mutedForeground : index === selectedIndex ? theme.colors.primary : theme.colors.foreground}>
            {index === selectedIndex ? "› " : "  "}
            {row.label}
          </Text>
          <Text color={row.selected ? theme.colors.success : theme.colors.mutedForeground}>{row.selected ? "selected" : row.disabled ? "disabled" : ""}</Text>
        </Box>
      ))}
    </Box>
  )
}

function renderModelRows(choices: ModelChoice[], activeIndex: number, currentModel: string): React.ReactNode {
  const theme = useTheme()
  const maxRows = 12
  const half = Math.floor(maxRows / 2)
  const maxOffset = Math.max(0, choices.length - maxRows)
  const offset = Math.min(maxOffset, Math.max(0, activeIndex - half))
  const visibleChoices = choices.slice(offset, offset + maxRows)

  if (choices.length === 0) return <Text color={theme.colors.mutedForeground}>No matching models.</Text>

  return (
    <Box flexDirection="column">
      {visibleChoices.map((choice, visibleIndex) => {
        const index = offset + visibleIndex
        const isActive = index === activeIndex
        const isSelected = choice.id === currentModel
        return (
          <Box key={choice.id} justifyContent="space-between">
            <Box>
              <Text color={isActive ? theme.colors.primary : theme.colors.mutedForeground}>{isActive ? "› " : "  "}</Text>
              <Text color={isActive ? theme.colors.primary : isSelected ? theme.colors.success : theme.colors.foreground} bold={isActive || isSelected}>
                {isSelected ? "* " : ""}
                {choice.name}
              </Text>
            </Box>
            <Text color={theme.colors.mutedForeground}>
              {formatContext(choice.contextLength)} {supportsReasoning(choice) ? "reasoning " : ""}
              {choice.id}
            </Text>
          </Box>
        )
      })}
      {choices.length > maxRows ? (
        <Text color={theme.colors.mutedForeground}>
          {offset + 1}-{Math.min(choices.length, offset + maxRows)} of {choices.length}
        </Text>
      ) : null}
    </Box>
  )
}

type ModelEditorRow =
  | { kind: "context"; label: string; value: number; selected: boolean; disabled?: boolean }
  | { kind: "reasoning"; label: string; value: ReasoningEffort; selected: boolean; disabled?: boolean }
  | { kind: "fast"; label: string; selected: boolean; disabled?: boolean }

function settingsForModel(screen: Extract<UiScreen, { kind: "model" }>, model: string): ModelSettings {
  const choice = findModelChoice(screen.choices, model)
  const normalized = normalizeModelSettings(screen.settingsByModel[model] || {}, choice)
  screen.settingsByModel[model] = normalized
  return normalized
}

function applyModelEditorRow(store: UiStore, screen: Extract<UiScreen, { kind: "model" }>, choice: ModelChoice, row: ModelEditorRow): void {
  const current = settingsForModel(screen, choice.id)
  const next =
    row.kind === "context"
      ? normalizeModelSettings({ ...current, contextLength: row.value }, choice)
      : row.kind === "reasoning"
        ? normalizeModelSettings({ ...current, reasoningEffort: row.value }, choice)
        : normalizeModelSettings({ ...current, fast: !current.fast }, choice)

  const nextScreen = { ...screen, currentModel: choice.id, settingsByModel: { ...screen.settingsByModel, [choice.id]: next } }
  store.update((state) => ({ ...state, model: choice.id, modelSettings: next, screen: nextScreen }))
  screen.onSelect(choice.id, next, false)
}

function modelEditorRows(choice: ModelChoice, settings: ModelSettings): ModelEditorRow[] {
  const rows: ModelEditorRow[] = []
  for (const option of contextOptions(choice)) rows.push({ kind: "context", label: `Context ${formatContext(option)}`, value: option, selected: settings.contextLength === option })

  const reasoningOptions: Array<{ label: string; value: ReasoningEffort }> = [
    { label: "Reasoning none", value: "none" },
    { label: "Reasoning low", value: "low" },
    { label: "Reasoning medium", value: "medium" },
    { label: "Reasoning high", value: "high" },
    { label: "Reasoning extra high", value: "xhigh" },
  ]
  for (const option of supportsReasoning(choice) ? reasoningOptions : reasoningOptions.slice(0, 1)) {
    rows.push({ kind: "reasoning", label: option.label, value: option.value, selected: settings.reasoningEffort === option.value, disabled: option.value !== "none" && !supportsReasoning(choice) })
  }

  rows.push({ kind: "fast", label: "Fast provider routing", selected: Boolean(settings.fast), disabled: !supportsFastContext(settings.contextLength) })
  return rows
}

function filterModels(choices: ModelChoice[], filter: string): ModelChoice[] {
  const normalized = filter.trim().toLowerCase()
  if (!normalized) return choices
  return choices.filter((choice) => `${choice.id} ${choice.name}`.toLowerCase().includes(normalized))
}

function findModelChoice(choices: ModelChoice[], model: string): ModelChoice | undefined {
  return choices.find((choice) => choice.id === model)
}

function formatContext(contextLength: number | null | undefined): string {
  if (!contextLength) return "unknown"
  if (contextLength >= 1_000_000) return `${Math.round(contextLength / 1_000_000)}M`
  if (contextLength >= 1_000) return `${Math.round(contextLength / 1_000)}K`
  return String(contextLength)
}

function formatFooterSettings(settings: ModelSettings): string {
  const context = settings.contextLength ? formatContext(settings.contextLength) : "auto"
  const reasoning = settings.reasoningEffort && settings.reasoningEffort !== "none" ? settings.reasoningEffort : "auto"
  const fast = settings.fast ? ", fast" : ""
  return `${context} (${reasoning}${fast})`
}

function supportsReasoning(choice: ModelChoice | undefined): boolean {
  if (!choice) return false
  return choice.supportedParameters.includes("reasoning") || choice.supportedParameters.includes("reasoning_effort")
}

function contextOptions(choice: ModelChoice): number[] {
  const max = choice.contextLength || 0
  if (!max) return []
  if (max <= 300_000) return [max]
  return [...new Set([272_000, max])].filter((value) => value <= max).sort((left, right) => left - right)
}

function defaultContext(choice: ModelChoice | undefined): number | undefined {
  if (!choice) return undefined
  const options = contextOptions(choice)
  return options[0] || choice.contextLength || undefined
}

function normalizeModelSettings(settings: ModelSettings, choice: ModelChoice | undefined): ModelSettings {
  const next: ModelSettings = { ...settings }
  if (choice) {
    const options = contextOptions(choice)
    if (options.length > 0) {
      const requested = next.contextLength || defaultContext(choice)
      next.contextLength = options.includes(requested || 0) ? requested : options[0]
    }
    if (!supportsReasoning(choice)) next.reasoningEffort = "none"
  }
  if (!next.reasoningEffort) next.reasoningEffort = "none"
  if (next.contextLength && !supportsFastContext(next.contextLength)) next.fast = false
  next.fast = Boolean(next.fast)
  return next
}

function supportsFastContext(contextLength: number | undefined): boolean {
  return !contextLength || contextLength <= 300_000
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = Math.max(0, now - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (isYesterday(timestamp, now) && diffMs >= 15 * hour) return "yesterday"
  if (diffMs < minute) return "just now"
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute))
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour))
    return `${hours} hour${hours === 1 ? "" : "s"} ago`
  }

  const days = Math.max(1, Math.floor(diffMs / day))
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function isYesterday(timestamp: number, now: number): boolean {
  const date = new Date(timestamp)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate()
}

function shortenHome(path: string): string {
  const home = process.env.HOME
  if (!home) return path
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

export { themeChoices }

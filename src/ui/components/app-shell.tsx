import { Box, Text, useWindowSize } from "ink"
import * as React from "react"

import { truncateEnd, truncateMiddle } from "../utils.js"
import { useTheme } from "./theme-provider.js"

export type AppShellProps = {
  children: React.ReactNode
}

export type AppShellHeaderProps = {
  appName?: string
  contextUsage?: string
  costUsage?: string
  cwd: string
  model: string
  subtitle?: string
  status?: string
  settings: string
  title: string
}

export type AppShellContentProps = {
  children: React.ReactNode
}

export type AppShellHintsProps = {
  items: string[]
}

export function AppShell({ children }: AppShellProps): React.ReactNode {
  const { columns } = useWindowSize()
  return (
    <Box flexDirection="column" width={columns}>
      {children}
    </Box>
  )
}

function Header({ appName, contextUsage, costUsage, cwd, model, settings, status, subtitle, title }: AppShellHeaderProps): React.ReactNode {
  const theme = useTheme()
  const { columns } = useWindowSize()
  const leftHeader = appName ?? ""
  const modelText = model ? truncateMiddle(model, Math.max(1, columns - leftHeader.length - 8)) : ""
  const statusParts = [contextUsage, costUsage, settings].filter(Boolean)
  const statusText = statusParts.length > 0 ? statusParts.join(" · ") : truncateEnd(status ?? "", 80)
  const locationText = [cwd, title].filter(Boolean).join(" · ")
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.border} paddingX={1} width={columns}>
      {(leftHeader || modelText) ? (
        <Box justifyContent="space-between">
          <Text color={theme.colors.primary} bold>{leftHeader}</Text>
          <Text color={theme.colors.mutedForeground}>{modelText}</Text>
        </Box>
      ) : null}
      {(locationText || statusText) ? (
        <Box justifyContent="space-between">
          <Text color={theme.colors.foreground}>{truncateMiddle(locationText, 96)}</Text>
          <Text color={theme.colors.mutedForeground}>{statusText}</Text>
        </Box>
      ) : null}
      {subtitle ? <Text color={theme.colors.warning}>{truncateMiddle(subtitle, 96)}</Text> : null}
    </Box>
  )
}

function Content({ children }: AppShellContentProps): React.ReactNode {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {children}
    </Box>
  )
}

function Hints({ items }: AppShellHintsProps): React.ReactNode {
  const theme = useTheme()
  const { columns } = useWindowSize()
  const text = truncateEnd(items.join("  ·  "), Math.max(1, columns - 4))
  return (
    <Box borderStyle="single" borderColor={theme.colors.mutedForeground} paddingX={1} width={columns}>
      <Text color={theme.colors.mutedForeground}>{text}</Text>
    </Box>
  )
}

AppShell.Header = Header
AppShell.Content = Content
AppShell.Hints = Hints

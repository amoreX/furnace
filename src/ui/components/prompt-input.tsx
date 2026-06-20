import { Box, Text, useInput } from "ink"
import * as React from "react"

import { useTheme } from "./theme-provider.js"

export type PromptInputProps = {
  busy?: boolean
  disabled?: boolean
  onSubmit: (value: string) => void
  placeholder?: string
  prefix?: string
}

export function PromptInput({ busy = false, disabled = false, onSubmit, placeholder = "Ask Furnace...", prefix = ">" }: PromptInputProps): React.ReactNode {
  const theme = useTheme()
  const [value, setValue] = React.useState("")
  const [cursorOffset, setCursorOffset] = React.useState(0)
  const enabled = !disabled && !busy

  useInput((input, key) => {
    if (!enabled) return
    if (key.ctrl || key.meta) return

    if (key.return) {
      const submitted = value.trim()
      if (!submitted) return
      setValue("")
      setCursorOffset(0)
      onSubmit(submitted)
      return
    }

    if (key.leftArrow) {
      setCursorOffset((current) => Math.max(0, current - 1))
      return
    }
    if (key.rightArrow) {
      setCursorOffset((current) => Math.min(value.length, current + 1))
      return
    }
    if (key.home) {
      setCursorOffset(0)
      return
    }
    if (key.end) {
      setCursorOffset(value.length)
      return
    }
    if (key.backspace || key.delete) {
      if (cursorOffset === 0) return
      setValue((current) => current.slice(0, cursorOffset - 1) + current.slice(cursorOffset))
      setCursorOffset((current) => Math.max(0, current - 1))
      return
    }
    if (key.escape) {
      setValue("")
      setCursorOffset(0)
      return
    }
    if (input) {
      setValue((current) => current.slice(0, cursorOffset) + input + current.slice(cursorOffset))
      setCursorOffset((current) => current + input.length)
    }
  }, { isActive: enabled })

  const display = value || placeholder
  const before = value.slice(0, cursorOffset)
  const cursor = value[cursorOffset] ?? " "
  const after = value.slice(cursorOffset + 1)

  return (
    <Box borderStyle="round" borderColor={enabled ? theme.colors.focusRing : theme.colors.border} paddingX={1}>
      <Text color={enabled ? theme.colors.primary : theme.colors.mutedForeground} bold>
        {prefix}{" "}
      </Text>
      {value ? (
        <Text color={theme.colors.foreground}>
          {before}
          <Text color={theme.colors.selectionForeground} backgroundColor={theme.colors.selection}>
            {cursor}
          </Text>
          {after}
        </Text>
      ) : (
        <Text color={theme.colors.mutedForeground}>
          <Text color={theme.colors.selectionForeground} backgroundColor={theme.colors.selection}>
            {display[0] ?? " "}
          </Text>
          {display.slice(1)}
        </Text>
      )}
    </Box>
  )
}

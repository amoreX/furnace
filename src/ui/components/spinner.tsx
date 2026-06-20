import { Box, Text } from "ink"
import cliSpinners, { type SpinnerName } from "cli-spinners"
import * as React from "react"

import { useMotion, useTheme } from "./theme-provider.js"

export type SpinnerProps = {
  color?: string
  fps?: number
  frames?: string[]
  label?: string
  type?: SpinnerName
}

export function Spinner({ color, fps = 12, frames: customFrames, label, type = "dots" }: SpinnerProps): React.ReactNode {
  const theme = useTheme()
  const motion = useMotion()
  const builtin = cliSpinners[type] ?? cliSpinners.dots
  const frames = customFrames ?? builtin.frames
  const intervalMs = customFrames ? Math.max(16, Math.floor(1000 / fps)) : builtin.interval
  const [frame, setFrame] = React.useState(0)

  React.useEffect(() => {
    if (motion.reduced) return undefined
    const interval = setInterval(() => {
      setFrame((current) => (current + 1) % frames.length)
    }, intervalMs)
    return () => clearInterval(interval)
  }, [frames.length, intervalMs, motion.reduced])

  return (
    <Box>
      <Text color={color ?? theme.colors.primary}>{frames[motion.reduced ? 0 : frame % frames.length] ?? "*"}</Text>
      {label ? <Text color={theme.colors.mutedForeground}> {label}</Text> : null}
    </Box>
  )
}

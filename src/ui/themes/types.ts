export type BorderStyle = "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic"

export type ColorTokens = {
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  success: string
  successForeground: string
  warning: string
  warningForeground: string
  error: string
  errorForeground: string
  info: string
  infoForeground: string
  background: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  focusRing: string
  selection: string
  selectionForeground: string
  // Message backgrounds (Pi-style)
  userMessageBg?: string
  userMessageText?: string
  // Tool activity backgrounds (Pi-style)
  toolPendingBg?: string
  toolSuccessBg?: string
  toolErrorBg?: string
  toolTitle?: string
  toolOutput?: string
}

export type SpacingTokens = {
  0: number
  1: number
  2: number
  3: number
  4: number
  6: number
  8: number
}

export type TypographyTokens = {
  bold: boolean
  sm: string
  base: string
  lg: string
  xl: string
}

export type BorderTokens = {
  style: BorderStyle
  color: string
  focusColor: string
}

export type Theme = {
  name: string
  colors: ColorTokens
  spacing: SpacingTokens
  typography: TypographyTokens
  border: BorderTokens
}

---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
created: 2026-07-04
plan_type: feat
product_contract_source: ce-plan-bootstrap
---

# feat: Expand theme collection to ~100 themes

## Goal Capsule

Expand Furnace's theme system from 8 hand-crafted themes to ~100 themes by converting terminal color schemes from `mbadolato/iTerm2-Color-Schemes` (450+ YAML themes) into Furnace's `Theme` format. A build-time converter script reads the YAML source, maps 16 ANSI colors + background/foreground/selection to Furnace's 22 semantic color tokens, computes readable foreground-pair variants, and emits a generated registry file. The existing 8 hand-crafted themes are preserved alongside the generated ones.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | ~100 new themes converted from `mbadolato/iTerm2-Color-Schemes` YAML format into Furnace `Theme` objects |
| R2 | Converter script reads YAML files and maps 16 ANSI colors to Furnace's semantic tokens (primary, secondary, accent, success, warning, error, info + foreground variants + muted/border/focusRing/selection) |
| R3 | Foreground-pair variants computed using luminance contrast — dark text on light colors, light text on dark colors |
| R4 | Existing 8 hand-crafted themes (flexoki, default, dracula, catppuccin, tokyo-night, nord, rosepine, gruvbox) preserved unchanged |
| R5 | Generated themes registered in `themeChoices` alongside hand-crafted themes with display labels and descriptions |
| R6 | Theme names are slugified (lowercase, hyphenated) and collision-free with existing names |
| R7 | `/theme` autocomplete picker handles ~108 themes without performance issues |
| R8 | Converter is reproducible — running it again with the same source produces identical output |

---

## Key Technical Decisions

**KTD1 — Source repo:** `mbadolato/iTerm2-Color-Schemes` (https://github.com/mbadolato/iTerm2-Color-Schemes). 450+ themes in `yaml/*.yml` with consistent schema: `background`, `foreground`, `color_01`–`color_16`, `selection`, `selection_text`, `cursor`, `cursor_text`, `name`, `variant` (`'Dark'`/`'Light'`). We filter to dark-variant themes for consistency with Furnace's dark TUI, targeting ~100.

**KTD2 — ANSI-to-semantic mapping:** The ANSI 16-color palette has a standard layout:
- `color_01` (red) → `error`
- `color_02` (green) → `success`
- `color_03` (yellow) → `warning`
- `color_04` (blue) → `info`
- `color_05` (magenta) → `accent`
- `color_06` (cyan) → `secondary`
- `color_07`/`color_08` (white/bright-black) → `muted`/`border`
- `background` → `background`, `muted` (darkened)
- `foreground` → `foreground`, `mutedForeground` (dimmed)
- `selection`/`selection_text` → `selection`/`selectionForeground`
- Bright variants (`color_09`–`color_16`) used for foreground-pair computation and `primary`/`focusRing` (bright blue or bright magenda, whichever has better contrast against background)

**KTD3 — Foreground-pair computation:** For each semantic color (e.g. `error: "#FF5555"`), the `*Foreground` variant is computed by comparing relative luminance: if the color is light (luminance > 0.5), foreground is the theme's `background`; if dark, foreground is the theme's `foreground`. This ensures readable text on colored badges/buttons.

**KTD4 — Generated file, not per-theme files:** All ~100 generated themes go into a single `src/ui/terminal-themes/generated.ts` file (auto-generated, ~3000+ lines). The converter script writes this file. The existing `index.ts` imports from `generated.ts` and appends to `themeChoices`. A `// AUTO-GENERATED` header marks the file.

**KTD5 — Converter script location:** `scripts/generate-themes.mjs` — a Node.js script that reads YAML files from a local clone of the iTerm2-Color-Schemes repo (path provided as CLI arg or defaulting to a sibling directory), converts them, and writes `src/ui/terminal-themes/generated.ts`. Not run at build time — run manually when updating themes.

**KTD6 — Theme filtering:** From 450+ themes, filter to ~100 by: (a) only `variant: 'Dark'` themes (Furnace's TUI is dark-first), (b) skip themes with very low contrast (foreground/background luminance ratio < 3:1), (c) skip duplicate/near-duplicate color schemes (same 16 colors under different names). The converter logs how many were filtered and why.

**KTD7 — Spacing/typography/border constants:** All generated themes share the same `spacing`, `typography`, and `border.style: "round"` as the existing hand-crafted themes. Only `border.color` (derived from the theme's `color_08`/bright-black) and `border.focusColor` (derived from `primary`) vary per theme.

---

## Scope Boundaries

### Deferred to Follow-Up Work
- Light-mode themes (requires a light-mode TUI surface; currently dark-only)
- Theme preview thumbnails or color swatches in the picker
- Pagination/scrolling for the autocomplete list (existing windowing in `prompt-input.tsx` handles up to 8 visible at once with scroll — test with ~108 items)
- User-contributed theme loading from `~/.furnace/themes/`
- Theme import/export

### Non-goals
- Converting all 450+ themes (targeting ~100 dark themes)
- Changing the `Theme` type or `ThemeProvider` component
- Adding a dedicated theme picker panel (existing autocomplete picker is sufficient)

---

## High-Level Technical Design

```
mbadolato/iTerm2-Color-Schemes/yaml/*.yml
  │
  ▼
scripts/generate-themes.mjs
  │  1. Read YAML files (js-yaml or manual parse)
  │  2. Filter: dark variant only, sufficient contrast, dedupe
  │  3. Map ANSI → Furnace semantic tokens
  │  4. Compute foreground pairs via luminance
  │  5. Derive border.color, border.focusColor, muted, focusRing
  │  6. Emit Theme[] array with shared spacing/typography
  │
  ▼
src/ui/terminal-themes/generated.ts  (AUTO-GENERATED)
  │  export const generatedThemes: Theme[] = [ ... ]
  │
  ▼
src/ui/terminal-themes/index.ts
  │  import { generatedThemes } from "./generated.js"
  │  themeChoices = [
  │    ...handCraftedThemes,  // existing 8
  │    ...generatedThemes.map(t => ({ ... }))
  │  ]
  │
  ▼
/theme picker (autocomplete) — no changes needed
```

---

## Implementation Units

### U1. Converter script: YAML parsing + ANSI-to-semantic mapping

**Goal:** Create `scripts/generate-themes.mjs` that reads iTerm2-Color-Schemes YAML files and converts them to Furnace `Theme` objects.

**Requirements:** R1, R2, R3, R6, R8

**Dependencies:** none

**Files:**
- `scripts/generate-themes.mjs` (create)

**Approach:**
- CLI script: `node scripts/generate-themes.mjs <path-to-iterm2-color-schemes-repo>`
- Default path: `../iTerm2-Color-Schemes` (sibling directory)
- Read all `yaml/*.yml` files using a YAML parser (add `js-yaml` as a devDependency if not available, or use a minimal inline parser since the YAML format is simple key-value pairs)
- For each theme:
  1. Parse `background`, `foreground`, `color_01`–`color_16`, `selection`, `selection_text`, `name`, `variant`
  2. Filter out: non-dark variants, low-contrast (fg/bg luminance ratio < 3:1), duplicates (same 16-color hash)
  3. Map to Furnace semantic tokens using the KTD2 mapping
  4. Compute `*Foreground` variants using relative luminance (KTD3)
  5. Derive `muted` (darken background by 15%), `mutedForeground` (dim foreground), `border` (bright-black `color_08`), `focusRing` (bright blue `color_12` or bright magenta `color_13`)
  6. Slugify name: lowercase, replace spaces/special chars with hyphens
  7. Skip if slug collides with existing hand-crafted theme name
- Target ~100 themes after filtering. Log filter stats.
- Emit `src/ui/terminal-themes/generated.ts` with `export const generatedThemes: Theme[]` and a `// AUTO-GENERATED` header

**Luminance computation (directional):**
```
relativeLuminance(hex):
  parse R, G, B from hex
  rsRGB = R/255, gsRGB = G/255, bsRGB = B/255
  apply gamma correction (linearize)
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin

foregroundFor(backgroundColor):
  if relativeLuminance(backgroundColor) > 0.4
    return theme.background  // dark text on light bg
  else
    return theme.foreground   // light text on dark bg
```

**Test scenarios:**
- Converter runs without errors on the iTerm2-Color-Schemes repo
- Output file has `// AUTO-GENERATED` header
- All generated theme names are lowercase-hyphenated
- No generated theme name collides with: flexoki, default, dracula, catppuccin, tokyo-night, nord, rosepine, gruvbox
- All `*Foreground` values are valid hex colors
- Generated file has between 80 and 120 themes
- Running the converter twice produces identical output (deterministic — sort themes alphabetically by name)

**Verification:** `node scripts/generate-themes.mjs` produces `src/ui/terminal-themes/generated.ts` with ~100 themes; file is valid TypeScript.

---

### U2. Register generated themes in the theme registry

**Goal:** Import generated themes into `index.ts` and append them to `themeChoices` with display labels and descriptions.

**Requirements:** R4, R5, R6

**Dependencies:** U1

**Files:**
- `src/ui/terminal-themes/index.ts` (modify)
- `src/ui/terminal-themes/generated.ts` (generated by U1)

**Approach:**
- Import `generatedThemes` from `./generated.js`
- Map each generated theme to a `ThemeChoice`:
  - `name`: the theme's `name` field (already slugified by converter)
  - `displayLabel`: title-cased version of the name (e.g. `afterglow` → `Afterglow`, `tokyo-night-storm` → `Tokyo Night Storm`)
  - `description`: `Converted from iTerm2-Color-Schemes` (generic, or derive from `variant` field)
  - `theme`: the `Theme` object
- Prepend the 8 hand-crafted themes to `themeChoices` so they appear first in the picker
- Append generated themes sorted alphabetically by name
- `resolveTheme` and `findTheme` continue to work unchanged — they search `themeChoices`

**Patterns to follow:** Existing `themeChoices` array structure in `index.ts`

**Test scenarios:**
- `themeChoices.length` is >= 108 (8 hand-crafted + ~100 generated)
- `resolveTheme("flexoki")` still returns the hand-crafted Flexoki theme
- `resolveTheme("afterglow")` returns a generated theme if it exists
- `resolveTheme("nonexistent")` falls back to `themeChoices[0]` (flexoki)
- All generated themes have valid `displayLabel` and `description` strings

**Verification:** `npm run typecheck` clean; `/theme` in dev shows ~108 themes in autocomplete.

---

### U3. Verify picker performance with ~108 themes

**Goal:** Ensure the `/theme` autocomplete picker performs well with ~108 items and the existing scroll windowing handles it.

**Requirements:** R7

**Dependencies:** U2

**Files:**
- `src/ui/components/prompt-input.tsx` (modify only if needed)
- `src/ui/ink-terminal.tsx` (modify only if needed)

**Approach:**
- The existing `autocompleteWindow` function in `prompt-input.tsx` already windows the visible items to `maxVisible = 8` with scroll indicators. Test with ~108 items:
  - Verify up/down navigation scrolls correctly
  - Verify hover-to-preview works for items outside the initial window
  - Verify no rendering lag or flicker
- If performance issues arise:
  - The `slashAutocompleteMatches` filter runs on every keystroke — with 108 items, this is O(n) string matching which should be fast
  - The `themeAutocompleteItems` mapping runs on scope change — cache if needed
  - The `onAutocompleteHover` callback calls `terminal.setTheme` on every hover — verify this doesn't cause excessive re-renders
- Only modify if there's an actual issue; the existing code is designed for scrollable lists

**Test expectation: none — verified via manual smoke test. If performance issues are found, fix the specific bottleneck.**

**Verification:** `/theme` in dev with ~108 themes scrolls smoothly, hover preview works, no lag.

---

## Verification Contract

| Gate | Command / Action |
|------|-----------------|
| Typecheck | `npm run typecheck` |
| Tests | `npm test` — existing tests pass, no regressions |
| Converter | `node scripts/generate-themes.mjs` — produces `src/ui/terminal-themes/generated.ts` |
| Theme count | `themeChoices.length >= 108` |
| Existing themes | `resolveTheme("flexoki")` returns hand-crafted Flexoki |
| New theme | `resolveTheme("afterglow")` (or similar) returns a generated theme |
| Picker | `/theme` in dev shows ~108 themes, scroll works, hover preview works |
| Deterministic | Run converter twice, `diff` shows no changes |

---

## Definition of Done

- `scripts/generate-themes.mjs` reads iTerm2-Color-Schemes YAML and converts to Furnace themes (U1)
- `src/ui/terminal-themes/generated.ts` contains ~100 generated themes (U1)
- `index.ts` imports generated themes and `themeChoices` has 108+ entries (U2)
- `/theme` picker works smoothly with all themes (U3)
- `npm run typecheck` clean, `npm test` passes with no regressions

---

## Sources & Research

- `mbadolato/iTerm2-Color-Schemes` — https://github.com/mbadolato/iTerm2-Color-Schemes — 450+ terminal color schemes in YAML format
- `src/ui/components/theme-provider.tsx` — `Theme` type, `ColorTokens` (22 semantic hex colors), `createTheme` helper
- `src/ui/terminal-themes/index.ts` — current `themeChoices` registry (8 themes), `resolveTheme`/`findTheme` helpers
- `src/ui/components/prompt-input.tsx` — `autocompleteWindow` (scroll windowing, maxVisible=8), `slashAutocompleteMatches` filter
- `src/interactive-session-controller.ts` — `themeAutocompleteItems`, hover-preview flow, `setThemeByName`

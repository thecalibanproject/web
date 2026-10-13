# Caliban console: Sovereign Airspace

The console is a control tower for daily work: a fixed dark scope rail, paper work surfaces, ruled flight strips and instrument readouts. Research note 10, UX, onboarding and the admin console, remains the interaction contract. Every existing label, help link, route and keyboard action stays in place.

The design direction uses predictable action placement and a quiet navigation hierarchy, informed by [Linear's refresh](https://linear.app/now/behind-the-latest-design-refresh), and a compact type hierarchy informed by [Vercel Geist](https://vercel.com/geist/typography). Neither design system is imported.

## Palette and themes

| Role                 | Light                  | Dark                 |
| -------------------- | ---------------------- | -------------------- |
| Ground               | paper #F6F9FD          | scope-night #040B1C  |
| Surface              | #FFFFFF                | scope #06122A        |
| Secondary surface    | strip-ice #E8F1FF      | scope-raised #0A1A39 |
| Well                 | strip-ice-2 #DCE9F7    | scope-well #0F2448   |
| Decorative rule      | rule #BFD1EA           | scope-ring #1C3B73   |
| Control border       | #6B80A1                | readout-3 #7F96BD    |
| Text                 | ink #0A1430            | readout #E8F1FF      |
| Secondary text       | ink-2 #26324F          | readout-2 #A9BEDF    |
| Muted text           | ink-3 #4F5D7C          | readout-3 #7F96BD    |
| Action fill          | caliban-blue #1D4ED8   | caliban-blue #1D4ED8 |
| Action hover         | #244FC5                | #244FC5              |
| Link, focus, success | #1D4ED8                | target-cyan #7CC4FF  |
| Waiting text         | hold-amber-ink #8A5A00 | hold-amber #F2B544   |
| Error, Delete        | #B42335                | #FF929E              |

The website's #3E6CF2 hover blue is retained as a brand reference, but buttons use #244FC5 so small white labels retain AA contrast. Hairlines are decorative separators, never the only boundary of a control. Interactive boundaries use the stronger control border token; status badges have a current-color border. The dark rail uses local dark tokens in both themes.

## Semantic states

Blue is the sole accent and also means passed, approved or live. Words and square markers carry the state alongside color. Amber is reserved for a stopped or waiting action. A single restrained red family is the necessary console exception for failed checks, errors and destructive actions. No green. Capacity meters remain blue until a cap stops work; approaching a cap does not imply waiting. JSON uses cyan and readout text, not semantic warning colors.

## Typography

All fonts and OFL licenses live in public/fonts. There are no remote font requests.

| Role                            | Font                       | Size / line height |
| ------------------------------- | -------------------------- | ------------------ |
| Page title                      | B612 bold                  | 26 / 34 px         |
| Section title                   | B612 bold                  | 14 / 20 px         |
| Reading text                    | Atkinson Hyperlegible Next | 14 / 21 px         |
| Dense text                      | Atkinson Hyperlegible Next | 13 / 19 px         |
| Buttons, engraved column labels | B612 bold                  | 11 to 13 / 18 px   |
| Code, model names, identifiers  | IBM Plex Mono              | 12 / 18 px         |
| Numeric readouts                | B612 Mono                  | 28 / 36 px         |

Reading text uses tabular figures. Sentences are never monospace. Readouts reserve stable horizontal space and wrap explanatory text.

## Component rules

Panels are flat ruled regions with 2 px corners. No drop shadows. Inputs, buttons, dialogs and drawers share that geometry. Table rows use a blue code cell, ruled data cells, compact padding and sticky engraved column heads. Approvals use an amber code band and retain customer context and argument checks. Tabs are a contiguous key bank with a blue selected rule. Empty states retain their explanation, next action and offline docs link. Code blocks are dark scope surfaces in both themes. Dialogs use a dimmed backdrop and a strong rule, not elevation.

The rail stays dark. On phones, navigation scrolls horizontally and the header follows it in document flow, avoiding overlap. Controls retain their accessible names and keyboard behavior. Motion uses the existing productive timing tokens, only opacity and transform, with the reduced-motion path preserved.

## Verification

Computed contrast, bundle comparison, checks and screenshot evidence are recorded in docs/redesign/index.md after implementation. Contrast values use WCAG relative sRGB luminance. Text must meet 4.5:1 and meaningful control boundaries 3:1; decorative hairlines are exempt.

## Measured contrast

| Pair                           | Light   | Dark    | Minimum |
| ------------------------------ | ------- | ------- | ------- |
| Body                           | 17.21:1 | 17.25:1 | 4.5:1   |
| Secondary                      | 12.72:1 | 9.86:1  | 4.5:1   |
| Muted, deepest light/dark well | 5.34:1  | 5.12:1  | 4.5:1   |
| Link on panel                  | 6.70:1  | 9.93:1  | 4.5:1   |
| Link on well                   | 5.44:1  | 8.20:1  | 4.5:1   |
| Primary label                  | 6.70:1  | 10.47:1 | 4.5:1   |
| Primary hover label            | 7.00:1  | 13.04:1 | 4.5:1   |
| Passed badge                   | 5.89:1  | 8.20:1  | 4.5:1   |
| Waiting badge                  | 5.34:1  | 8.29:1  | 4.5:1   |
| Error badge                    | 5.88:1  | 7.62:1  | 4.5:1   |
| Control border on panel        | 4.02:1  | 6.21:1  | 3:1     |
| Control border on well         | 3.26:1  | 5.12:1  | 3:1     |
| Focus on panel                 | 6.70:1  | 9.93:1  | 3:1     |
| Rail secondary text            | 10.39:1 | 10.39:1 | 4.5:1   |

Reproduce with `node scripts/contrast.mjs`. Decorative rules are not control boundaries.

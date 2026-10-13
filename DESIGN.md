---
version: alpha
name: Caliban console
description: The on-prem admin console of the Caliban sovereign AI gateway. Dense, calm, legible; the brand's blue and amber, without the website's instrument styling.
colors:
  bg: 'oklch(0.985 0.002 260)'
  surface: 'oklch(1 0 0)'
  surface-2: 'oklch(0.97 0.003 260)'
  surface-3: 'oklch(0.945 0.004 260)'
  border: 'oklch(0.91 0.005 260)'
  border-strong: 'oklch(0.62 0.01 260)'
  fg: 'oklch(0.22 0.01 260)'
  fg-muted: 'oklch(0.47 0.012 260)'
  fg-subtle: 'oklch(0.52 0.01 260)'
  accent: 'oklch(0.49 0.2 264)'
  accent-hover: 'oklch(0.44 0.2 264)'
  accent-fg: 'oklch(0.99 0 0)'
  accent-soft: 'oklch(0.95 0.03 264)'
  ring: 'oklch(0.6 0.16 270)'
  ok: 'oklch(0.52 0.12 155)'
  ok-soft: 'oklch(0.95 0.04 155)'
  warn: 'oklch(0.5 0.12 70)'
  warn-soft: 'oklch(0.96 0.05 85)'
  danger: 'oklch(0.53 0.19 25)'
  danger-soft: 'oklch(0.96 0.03 25)'
  info: 'oklch(0.52 0.11 230)'
  info-soft: 'oklch(0.95 0.03 230)'
  overlay: 'oklch(0.2 0.01 260 / 0.35)'
  dark-bg: 'oklch(0.17 0.005 260)'
  dark-surface: 'oklch(0.2 0.006 260)'
  dark-surface-2: 'oklch(0.23 0.007 260)'
  dark-surface-3: 'oklch(0.27 0.008 260)'
  dark-border: 'oklch(0.3 0.008 260)'
  dark-border-strong: 'oklch(0.52 0.01 260)'
  dark-fg: 'oklch(0.94 0.004 260)'
  dark-fg-muted: 'oklch(0.72 0.01 260)'
  dark-fg-subtle: 'oklch(0.66 0.01 260)'
  dark-accent: 'oklch(0.7 0.14 255)'
  dark-accent-hover: 'oklch(0.75 0.13 255)'
  dark-accent-fg: 'oklch(0.16 0.03 264)'
  dark-accent-soft: 'oklch(0.3 0.07 264)'
  dark-ring: 'oklch(0.7 0.14 270)'
  dark-ok: 'oklch(0.74 0.13 155)'
  dark-ok-soft: 'oklch(0.3 0.05 155)'
  dark-warn: 'oklch(0.8 0.13 80)'
  dark-warn-soft: 'oklch(0.32 0.06 75)'
  dark-danger: 'oklch(0.72 0.16 25)'
  dark-danger-soft: 'oklch(0.32 0.07 25)'
  dark-info: 'oklch(0.75 0.11 230)'
  dark-info-soft: 'oklch(0.3 0.05 230)'
  dark-overlay: 'oklch(0 0 0 / 0.55)'
typography:
  page-title:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '19px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.01em'
  card-title:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.45
  body-dense:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '12.5px'
    fontWeight: 500
    lineHeight: 1.35
  hint:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.4
  badge:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Noto Sans, Liberation Sans, Arial, sans-serif'
    fontSize: '11.5px'
    fontWeight: 500
    lineHeight: 1.2
  data:
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, DejaVu Sans Mono, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
  full: '9999px'
spacing:
  unit: '4px'
  control-height: '32px'
  control-height-sm: '28px'
  target-min: '24px'
  card-pad-x: '16px'
  card-pad-y: '10px'
  stack: '16px'
  section: '24px'
  page-gutter-mobile: '16px'
  page-gutter: '24px'
  page-gutter-wide: '32px'
  sidebar: '224px'
  sidebar-rail: '56px'
  drawer: '560px'
  dialog: '520px'
  dialog-lg: '920px'
  container: '1400px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-fg}'
    typography: '{typography.body-dense}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '0 12px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.fg}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '0 12px'
  button-secondary-hover:
    backgroundColor: '{colors.surface-2}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.fg-muted}'
    rounded: '{rounded.md}'
  button-danger:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.danger}'
    rounded: '{rounded.md}'
  button-danger-hover:
    backgroundColor: '{colors.danger-soft}'
  button-success:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ok}'
    rounded: '{rounded.md}'
  button-sm:
    height: '28px'
    padding: '0 10px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.fg}'
    typography: '{typography.body-dense}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '0 10px'
  badge-neutral:
    backgroundColor: '{colors.surface-3}'
    textColor: '{colors.fg-muted}'
    typography: '{typography.badge}'
    rounded: '{rounded.sm}'
    height: '20px'
  badge-accent:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
  badge-ok:
    backgroundColor: '{colors.ok-soft}'
    textColor: '{colors.ok}'
  badge-warn:
    backgroundColor: '{colors.warn-soft}'
    textColor: '{colors.warn}'
  badge-danger:
    backgroundColor: '{colors.danger-soft}'
    textColor: '{colors.danger}'
  badge-info:
    backgroundColor: '{colors.info-soft}'
    textColor: '{colors.info}'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.lg}'
  card-header:
    typography: '{typography.card-title}'
    padding: '10px 16px'
  drawer:
    backgroundColor: '{colors.surface}'
    width: '560px'
  dialog:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.lg}'
    width: '520px'
  toggletip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.fg}'
    typography: '{typography.hint}'
    rounded: '{rounded.md}'
    width: '288px'
  toggletip-trigger:
    textColor: '{colors.fg-muted}'
    size: '24px'
    rounded: '{rounded.full}'
  empty-state:
    textColor: '{colors.fg-muted}'
    typography: '{typography.body-dense}'
    padding: '40px 24px'
  stepper-step-done:
    backgroundColor: '{colors.ok-soft}'
    textColor: '{colors.ok}'
    size: '24px'
    rounded: '{rounded.full}'
  stepper-step-current:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-fg}'
    size: '24px'
    rounded: '{rounded.full}'
  stepper-step-blocked:
    backgroundColor: '{colors.danger-soft}'
    textColor: '{colors.danger}'
    size: '24px'
    rounded: '{rounded.full}'
  stepper-step-todo:
    backgroundColor: '{colors.surface-3}'
    textColor: '{colors.fg-muted}'
    size: '24px'
    rounded: '{rounded.full}'
  nav-item:
    textColor: '{colors.fg-muted}'
    typography: '{typography.body-dense}'
    rounded: '{rounded.md}'
    height: '32px'
  nav-item-active:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.fg}'
---

# Design System: Caliban console

## Overview

**North star: "The quiet control room."** The website draws Caliban as the control tower of a company's own airspace: dark radar scopes, ruled flight strips, square corners. The console is the room where people work every day, so it keeps the tower's discipline (one owned blue, amber only for holds, ruled rows, honest numbers) and drops the theatre. It is a dense, calm admin tool for three people: the IT admin who installs once, the domain owner (a clinic manager, a law partner, a support lead) who builds and supervises assistants, and the developer who connects apps.

Calm means: neutral surfaces, colour reserved for meaning, motion only in answer to an action, plain words from the glossary (`src/lib/glossary.ts`), and expert detail one level down behind "Advanced". Dense means: 13 to 14 px text, 32 px controls, tables first, no hero banners and no marketing cards.

The tokens in the front matter are normative and mirror `src/index.css`. Light is the default; dark is a variable swap (`data-theme` on `<html>`, else `prefers-color-scheme`). Rules for agents are in [`AGENTS.md`](AGENTS.md); the research behind both files is `docs/research/10-ux-onboarding-and-console.md`.

**Key characteristics:**

- One chromatic ink, the accent blue, for primary actions, links, selection and focus.
- Status colours (ok, warn, danger, info) always come with a word or an icon, never alone.
- Cards with 1 px borders and a faint shadow; tables inside cards; no nested cards.
- System fonts only: nothing is fetched at run time.

## Colors

Cool neutrals tinted toward hue 260 (the blue of the brand), one saturated accent, and four status hues used as soft backgrounds with strong text.

### Primary

- **Accent** (accent, accent-hover, accent-fg, accent-soft): the console's form of Caliban Blue (`#1D4ED8` on the website), as `oklch(0.49 0.2 264)` in light and the lighter `oklch(0.7 0.14 255)` in dark so it keeps contrast. Primary buttons, links, the active nav item (on accent-soft), selected tabs, checkboxes and text selection.
- **Ring** (ring): the focus outline, 2 px with a 2 px offset, on every focusable element.

### Status

- **Ok** (ok, ok-soft): passed, live, saved, healthy.
- **Warn** (warn, warn-soft): the console's hold amber. Waiting for a person, approvals, caps near their limit, write tools. Darkened to `oklch(0.5 0.12 70)` in light so badge text clears 5:1 on warn-soft.
- **Danger** (danger, danger-soft): failed, blocked, destructive actions, errors.
- **Info** (info, info-soft): running, neutral notices, help callouts.

### Neutral

- **Background ramp** (bg, surface, surface-2, surface-3): page ground, cards and drawers, hover and code wells, badges and skeletons.
- **Borders** (border, border-strong): border separates cards and table rows; border-strong outlines inputs and secondary buttons and is raised to about 3.6:1 on white (about 3.3:1 in dark) so empty fields stay visible (WCAG 1.4.11).
- **Text ramp** (fg, fg-muted, fg-subtle): headings and body, secondary text, hints and timestamps. fg-subtle is about 5:1 on white and about 5.8:1 on the dark surface, so hint text that carries real explanations passes WCAG 1.4.3.
- **Overlay**: the backdrop behind modal dialogs and drawers.

### Named rules

**The One Ink Rule.** The accent is the only decorative colour. Charts use the accent and neutrals; a second hue appears only when it means a status.

**The Amber Means Waiting Rule.** Warn marks things that wait for a person or are about to stop (approvals, caps, write tools). It is never used for emphasis.

**The Never Colour Alone Rule.** Every status badge has a word, and pass or fail rows have an icon.

## Typography

**Sans:** the platform UI face (`system-ui`, Segoe UI, Roboto and fallbacks). **Mono:** `ui-monospace` and fallbacks, for ids, JSON, keys and code only.

The brand faces of the website (B612 and Atkinson Hyperlegible Next, self-hosted there) are deliberately not loaded in the console: the console is a dense data tool shipped as small static files to air-gapped sites, and system faces render instantly, match the operating system and add no bytes.

### Hierarchy

- **Page title** (19 px, 600): one `h1` per page, in the page header.
- **Card title** (13 px, 600): card and section headings.
- **Body** (14 px base on `html`) and **dense body** (13 px): running text, table cells, controls.
- **Label** (12.5 px, 500): field labels.
- **Hint** (12 px, fg-subtle): helper text under fields and timestamps. Never smaller.
- **Badge** (11.5 px, 500): status chips only.
- **Data** (mono 12 px, tabular figures): ids, hashes, JSON, keys.

### Named rules

**Tabular figures where numbers compare.** Tables, stat tiles and costs use `tabular-nums`.

**Ids are not titles.** A raw id never heads a page or a card; it sits behind a copy button.

**User text reads in its own direction.** Questions, answers and document titles render with `dir="auto"` (Arabic and French customers).

## Layout

A sidebar (224 px, a 56 px icon rail on tablets, a top bar on phones) with two groups: daily work, then a collapsible Administration group. A header carries the workspace switcher, the command palette (Ctrl or Cmd+K), the approvals badge and the help button, always in the same place. Content sits in a column up to 1400 px with 16, 24 or 32 px gutters by width. The base unit is 4 px; cards stack with 16 to 24 px between them; card headers pad 10 by 16 px. Forms are one or two columns; hints sit under their field.

Phones get the daily area with Approvals first, a 16 px gutter and no horizontal page scroll; wide tables scroll inside their card, their filters do not.

## Elevation & Depth

Flat by default. Cards and drawers use `shadow-panel` (a 1 px ambient shadow plus a soft 16 px blur at 4 to 5% black in light; stronger in dark), always with a 1 px border so edges stay crisp. Modal dialogs and drawers sit on the overlay in the top layer (native `<dialog>`). Toggletips float one level above content with the same shadow. There are no other levels.

## Shapes

Small radii that read as tool, not toy: 4 px for badges, 6 px for controls and buttons, 8 px for cards and dialogs, full circles only for status dots, stepper markers and the toggletip trigger. Nested radii never exceed their parent. Drawers are square on their attached edge.

## Components

### Buttons

Five variants, two sizes (32 px and 28 px tall). **Primary** (accent fill) is the one main action per view. **Secondary** (surface with border-strong) for everything else, **ghost** for low-emphasis row actions, **danger** for destructive ones (always confirmed), **success** for approve-type actions. A loading button keeps its label and shows a spinner. Disabled buttons the role cannot use explain why on hover and focus.

### Badges

20 px chips in six tones (neutral, accent, ok, warn, danger, info), soft background with strong text, with an optional status dot. Words, not codes ("Live", "Needs your approval").

### Cards

Surface, 1 px border, 8 px radius, a header with a 13 px title, an optional one-line description and actions on the right. Tables sit flush inside.

### Drawer and dialog

Native `<dialog>`: focus trap, Escape and focus return for free. The drawer (560 px) slides in from the right for side tasks; the dialog (520 or 920 px) is centred for confirmations and short forms. Never nested. Destructive confirmations focus the safe option.

### Toggletip

A 24 px "?" button next to a term. Click or Enter shows a 288 px panel with a one-line definition, the internal name when an expert needs it ("Also called: tenant") and a "Learn more" link to the exact docs anchor. Escape or a click outside closes it. Replaces hover-only `title` tooltips.

### Empty state

Centred in its card: one sentence saying what goes here, one primary action, one "Learn more" link. The "required configuration" form names the missing prerequisite.

### Stepper

The go-live sequence of an assistant (publish, run tests, check the bar, make live) and the setup checklist. Each step has a 24 px circular marker (done: ok-soft with a check; current: accent; blocked: danger-soft with a cross; to do: surface-3 with its number), a plain status line and the action that moves it on. Steps never rely on colour alone.

### Navigation

32 px items with a 16 px icon; the active item uses accent-soft and medium weight; the approvals item carries a warn count badge.

## Motion

Carbon "productive" timings, defined in `src/index.css`: instant 70 ms, fast 110 ms, moderate 240 ms, slow 400 ms; standard `cubic-bezier(0.2, 0, 0.38, 0.9)`, enter `cubic-bezier(0, 0, 0.38, 0.9)`, exit `cubic-bezier(0.2, 0, 1, 0.9)`. Route changes cross-fade through the View Transition API; drawers slide 24 px with a fade; dialogs and toggletips scale from 98%; toasts, checklist progress and stepper state change over the moderate duration. Only transform and opacity animate. Under reduced motion (the OS setting, or `data-motion="reduce"` on `<html>`) movement is removed and short fades remain.

## Do's and Don'ts

### Do:

- Use glossary labels everywhere; put internal names in Advanced, JSON views and "also called" toggletips.
- Show the default in force and why, and keep expert fields behind one "Advanced" disclosure.
- Pair every status colour with a word or an icon; keep text at 4.5:1 and borders at 3:1.
- Keep one primary button per view, and a "Learn more" link on every empty state.
- Render user-provided text with `dir="auto"`.

### Don't:

- Load fonts, scripts, images or styles from the network.
- Use colour for decoration, gradients, or a second accent.
- Nest cards, drawers or disclosures.
- Animate on hover in tables, stagger list entrances, or move anything the user did not ask to move.
- Put raw ids, config keys or engine terms in headings, badges or basic helper text.
- Use em dashes or en dashes anywhere.

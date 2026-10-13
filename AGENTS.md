# AGENTS.md: building the Caliban console

Guidance for coding agents (and people) changing `web/`, the Caliban admin console: a static React 19 SPA (Vite, Tailwind 4, TanStack Router and Query) served on-prem by the control plane.

Grounding: [`docs/research/10-ux-onboarding-and-console.md`](../docs/research/10-ux-onboarding-and-console.md) (research note 10: UX, onboarding and the admin console), the UX audit in `.targets/ux-audit/` and the console's own [`DESIGN.md`](DESIGN.md). Name note 10 in every UI agent brief.

This file combines four sources, adapted for a dense, calm admin console:

1. Caliban house rules (below, first: they win every conflict).
2. Rules from Vercel's [web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (MIT), adapted. Marketing, Next.js, hydration and media rules are left out.
3. The writing, motion and quality-floor rules of Anthropic's [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) skill (Apache-2.0), adapted. Its push for brand distinctiveness is left out: the console is a work tool and stays quiet.
4. The console glossary and motion tokens from note 10.

No skill, linter or CLI that fetches rules or sends telemetry at run time is used. Everything needed is in this file. See [Sources and licenses](#sources-and-licenses).

Words: MUST and NEVER are hard rules a reviewer blocks on. SHOULD is the default; deviate only with a reason in the PR.

## 1. House rules

### Zero egress

- NEVER load anything from the network at run time: no CDNs, no web fonts (Google Fonts or other), no analytics or telemetry, no hosted widgets (tours, chat, feedback), no remote images. The console runs in air-gapped hospitals, banks and law firms.
- MUST: every dependency is an npm package bundled by Vite into `dist/`. System font stacks only (see `DESIGN.md`).
- MUST: a new runtime dependency is MIT, Apache-2.0, BSD or ISC, small, and justified in the PR with its gzip size. Prefer none: write the 50 lines.
- NEVER install agent skills or tools that fetch from the network or phone home. Use this file.

### Writing

- NEVER use an em dash (U+2014) or an en dash (U+2013) anywhere: UI copy, code, comments, tests, commit messages, docs. Use commas, colons, parentheses or two sentences. A test fails on them.
- MUST: plain language. All UI terms come from `src/lib/glossary.ts`: one term per concept, everywhere (nav, headings, dialogs, badges, toasts). See [the glossary](#4-glossary).
- MUST: technical and internal names (node, tenant, CQIR, pass^k, taint, vertex, surrogate, config keys such as `[cache.semantic]`) appear only in an "Advanced" section, a JSON view, or an "also called ..." toggletip. A lint-style test fails when banned jargon appears in basic UI copy.
- MUST: a term that stays is defined in a toggletip (a focusable "?" button with a one-line definition and a "Learn more" link), never only in a `title` tooltip. Keep `title` for truncated values.
- MUST: write from the user's side. Name things by what people understand, not how the system is built ("Who gets approval requests", not "human vertex config").
- MUST: an action keeps its name through the flow: the button "Publish" leads to the status "Published", "Make live" to "Live". Buttons say exactly what happens ("Save limits", not "Submit").
- MUST: errors say what happened and how to fix it, next to the field that caused them, in the interface's voice. Errors never apologize ("sorry", "oops") and never say only "invalid". Keep the user's input.
- MUST: sentence case, active voice, no filler, one job per sentence. Hint text under fields rather than placeholders; placeholders show an example and end with `…`.
- SHOULD: two depths of text: a one-line plain summary, expert detail behind "Learn more" or "Advanced".

### Help, guidance and disclosure

- MUST: "Learn more" links come only from `src/lib/docs.ts`, which mirrors the link contract in `.targets/ux-audit/docs-links.md`. Never hand-write a `/docs/...` URL. Docs links are relative (same origin, offline docs).
- MUST: at most two disclosure levels: the basics, then one "Advanced" section per card or page. Never put a disclosure inside a disclosure, never nest drawers. "Advanced" never hides what the task needs; it shows the default in force.
- NEVER build an automatic product tour or a modal that opens by itself on first visit. Help is pulled by the user: toggletips, the page help panel, the setup checklist, empty states. If a walkthrough is ever built, the user starts it and it has at most 4 steps.
- MUST: every empty state has one sentence saying what goes here, one primary action, and one "Learn more" link. Use the "required configuration" form when a prerequisite is missing ("No data connection yet. Connect one").
- MUST: every new page gets an entry in the page help registry (purpose, the 2 or 3 things people do there, docs links), shown by the "?" help button, which sits in the same place on every page (WCAG 3.2.6).
- MUST: defaults are policy: show the default in force and why, with a way back to it.

### Workspaces, roles and state

- MUST: tenant-scoped pages follow the workspace switcher in the header. A per-page workspace filter exists only where a cross-workspace view is needed, and keeps `?tenant=` deep links working.
- MUST: hide or disable what the role cannot do, with the reason (`deniedReason` in `src/lib/permissions.ts`). The control plane checks every request again.
- MUST: data that others change stays fresh: invalidate the affected queries after each mutation, refetch on focus, poll while a job runs and stop when it ends.
- MUST: per-user conveniences in `localStorage` go through `src/lib/storage.ts` (never throws). Nothing that must be shared or durable lives in the browser.

### Tests and accessibility checks

- MUST: keep every existing test passing; add tests for new behaviour (Vitest and Testing Library). Tests never depend on timing: no sleeps, no real timers racing animations; use fake timers or `findBy*`.
- MUST: page tests run axe-core (jsdom, no network) on the rendered page and fail on violations.
- MUST: before handing work back: `pnpm typecheck`, `pnpm lint` (eslint with jsx-a11y, zero warnings), `pnpm test`, `pnpm build`, `pnpm format:check`.
- SHOULD: one manual keyboard and screen-reader pass per release on the main journeys.

## 2. Interaction and accessibility rules

Adapted from Vercel's web-interface-guidelines (MIT, see notice below).

### Keyboard and focus

- MUST: full keyboard support per the [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/) patterns: combobox for the command palette, modal dialog for drawers and confirmations, tabs, alert dialog for destructive actions with focus on the safe option.
- MUST: visible focus with `:focus-visible` (the global ring token); never `outline: none` without a visible replacement. Sticky headers never cover the focused element (`scroll-padding-top`, WCAG 2.4.11).
- MUST: manage focus: trap it in modals, move it into what opened, return it to the trigger on close.
- MUST: every keyboard shortcut has a visible equivalent and is listed in the command palette; shortcuts never fire while typing in a field.

### Targets and input

- MUST: hit targets of at least 24 by 24 px (WCAG 2.5.8). If the icon is smaller, enlarge the hit area. Watch copy, trash and inline badge buttons.
- NEVER disable browser zoom. NEVER block paste (the admin token field must accept paste and password managers, WCAG 3.3.8).
- MUST: label and control share one hit target (checkboxes, radios, switches); no dead zones.

### Forms

- MUST: keep submit enabled until the request starts, then show a spinner and keep the label. Do not pre-disable submit to signal invalid input; let the user submit and show what is missing.
- MUST: validate on submit by default; inline checks only for syntax-heavy fields (JSON, patterns), where they help.
- MUST: errors inline next to their fields; on submit, move focus to the first error.
- MUST: `autocomplete`, a meaningful `name`, the right `type` and `inputmode`. Disable spellcheck for ids, codes and keys. Trim values.
- MUST: warn before leaving a form with unsaved changes.
- MUST: in a `<textarea>`, Ctrl or Cmd+Enter submits; Enter in a single-line input submits.

### State and navigation

- MUST: the URL reflects state worth sharing: tabs, filters, the open item, pagination, the workspace when it differs from the user's default.
- MUST: navigation uses `<Link>` or `<a>` (middle-click and Cmd-click work); never a `div` with `onClick`.
- MUST: Back and Forward restore scroll position.

### Feedback

- MUST: confirm destructive actions in an in-app dialog, or offer an Undo window. Rejecting an approval asks for a reason.
- MUST: status messages use a polite live region (`role="status"`): "Limits saved.", toasts, long job completion. Errors use `role="alert"`, sparingly (WCAG 4.1.3).
- MUST: long jobs show progress in words ("Running tests: 4 of 6"), not only a spinner. Spinners appear after about 150 to 300 ms and stay at least 300 to 500 ms so they do not flash.
- SHOULD: an ellipsis (`…`) on options that open a follow-up ("Reject…") and on loading text ("Loading…").

### Content and layout

- MUST: design every state: loading (skeletons shaped like the content), empty, error, sparse, dense, very long text, forbidden (403).
- MUST: no dead ends: every error and empty screen offers a next step.
- MUST: status never by color alone: add an icon or a word. Badge borders and chart lines meet 3:1 (WCAG 1.4.11); text meets 4.5:1.
- MUST: `tabular-nums` where numbers are compared (tables, stats, costs).
- MUST: user-provided text (questions, answers, document titles, names) renders with `dir="auto"`, and `lang` when known. Arabic and French customers are first-class.
- MUST: text containers handle long content (`truncate`, `break-words`, `min-w-0` on flex children). Ids go behind a copy button, not in headings.
- MUST: locale-aware dates, times and numbers (`Intl`, via `src/lib/format.ts`).
- MUST: icon-only buttons have an accessible name; decorative icons are `aria-hidden`. Prefer native elements (`button`, `a`, `label`, `table`, `dialog`) before ARIA.
- MUST: auto-updating views (live runs, usage) offer a pause (WCAG 2.2.2).
- MUST: layouts work from phone width to ultra-wide; tables may scroll, their filters and pagination may not (WCAG 1.4.10).
- SHOULD: nested radii: a child's radius is no larger than its parent's.

### Performance

- MUST: code-split per route; heavy modules (ajv, editors) load only with the page that needs them.
- MUST: virtualize or paginate lists over about 50 rows.
- SHOULD: keep re-renders cheap: derive with `useMemo`, keep controlled inputs light per keystroke.

## 3. Motion

Motion is for feedback, state change and spatial continuity, never decoration (note 10, section 8). Mostly native CSS; React 19 `<ViewTransition>` and TanStack Router's `viewTransition` for routes.

### Tokens (in `src/index.css`, IBM Carbon "productive")

| Token | Value | Use |
| --- | --- | --- |
| `--duration-instant` | 70ms | Button press, toggle, checkbox, copy confirmation |
| `--duration-fast` | 110ms | Exits, hover and focus colour, small state flips |
| `--duration-moderate` | 240ms | Disclosure, tab panel, toast in, checklist and stepper change |
| `--duration-slow` | 400ms | Drawer, dialog, route and list-to-detail transition |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | Elements that move within the page |
| `--ease-enter` | `cubic-bezier(0, 0, 0.38, 0.9)` | Elements arriving |
| `--ease-exit` | `cubic-bezier(0.2, 0, 1, 0.9)` | Elements leaving, one step shorter than their entrance |

### Rules

- MUST: animate only `transform` and `opacity`. NEVER animate layout properties (`top`, `left`, `width`, `height`). NEVER `transition: all`: list the properties.
- MUST: animations are interruptible and answer a user action (opening, expanding, confirming, navigating). Nothing moves on its own except progress.
- MUST: route changes use the router's `viewTransition` (ignored where the browser lacks the API). Drawers, dialogs and toasts enter with the tokens above. Checklist progress and stepper state change with `--duration-moderate`.
- MUST: honour `prefers-reduced-motion: reduce`: movement is replaced by a short opacity change and feedback stays. The `data-motion="reduce"` attribute on `<html>` is the manual switch for VDI sessions where the OS setting does not reach the browser; it must have the same effect.
- NEVER stagger list entrances. NEVER animate table row hover or other high-frequency interactions. Motion is never the only carrier of meaning.
- SHOULD: correct `transform-origin`: a drawer slides from its edge, a popover grows from its trigger.
- Library order: CSS and Tailwind utilities (`motion-safe:` and `motion-reduce:` variants), then the View Transition API, then Motion (MIT) through `LazyMotion` and `m` only where native APIs fall short (layout animation). Motion is not used today; adding it needs the size justification above. GSAP is out (proprietary licence).

## 4. Glossary

The UI label is what users see. The internal term may appear only in Advanced sections, JSON views, "also called" toggletips and the command palette's aliases (so the old words still find the renamed thing). Source of truth: `src/lib/glossary.ts`; this table must match it.

| Internal term | UI label | One-line definition |
| --- | --- | --- |
| Tenant | Workspace | A separate space with its own keys, data, assistants and budget; nothing crosses between them. |
| Node | Assistant | An AI helper with instructions, data access, tools and limits, kept in versions. |
| Vertex | Step | One thing an assistant does: think with a model, look something up, call a tool, ask a person. |
| Subnode | Sub-assistant | An assistant that another assistant calls for part of the job. |
| Intent | Topic | A kind of request; automatic routing sends each request to the topic its examples resemble most. |
| Exemplars | Example sentences | Sample requests that teach automatic routing what belongs to a topic. |
| Ontology | Data dictionary | Business names and meanings for your data, reviewed by a person; assistants query only what is approved. |
| Datasource | Data connection | A read-only link to one of your databases. |
| Introspect | Scan | Read the structure of a data connection and suggest entries for the data dictionary. |
| CQIR | Query plan | The structured query an assistant picks; Caliban turns it into a safe database query. |
| pass^k | Passed all N tries | A test case counts only if it passed every time it was run (N is the number of tries). |
| pass@1 | Passed on the first try | The share of test cases that passed on their first run. |
| Promotion bar | Go-live bar | The minimum test results a version needs before it can go live. |
| Promotion gate | Go-live check | What making a version live would say now, requirement by requirement. |
| Meets the bar | Ready to go live | Every requirement of the go-live check passes. |
| Eval | Test run | One run of an assistant's tests against a version. |
| Golden set | Test cases | Example requests with what a good answer looks like. |
| Golden eval | Quality tests | A test run over the test cases. |
| Injection suite | Safety tests | Attacks hidden in data the assistant reads, to check it is not tricked. |
| Trust tier T0 sovereign | On your servers | The model runs inside your own infrastructure. |
| Trust tier T1 attested | Verified enclave | Confidential computing whose environment is proven by attestation. |
| Trust tier T2 contracted | Provider under contract | An outside provider bound by a data agreement (no retention). |
| Trust tier T3 public | Public provider | A public API with no contractual data guarantees. |
| PII | Personal data | Names, ids, phone numbers and similar details about a person. |
| PII mode reversible | Hide from the model, restore in the answer | Personal data is replaced before the model sees it and put back in the answer. |
| PII mode mask | Hide everywhere | Personal data is replaced and stays replaced, also in the answer. |
| PII mode off | Do not hide | The model receives personal data as written (only for models on your servers). |
| Surrogate scope | Placeholder consistency (Advanced) | Whether the same person gets the same placeholder across conversations or only within one. |
| Taint, tainted | Untrusted data; "Needs your approval" | Text from a customer, document or tool that must never be obeyed as instructions. |
| Run | Conversation (list page: Conversations) | One request handled by an assistant, with its steps, cost and answer. |
| Inbox | Approvals | Conversations waiting for a person to approve an action or answer a question. |
| Retrieval, RAG | Knowledge | Documents assistants can search and cite. |
| Collection | Document library | A set of documents with the same search settings and trust. |
| Tools, MCP | Connected systems | Outside systems an assistant may call, each action approved by a person. |
| Usage | Usage and costs | Requests, tokens and spend, by assistant, model and key. |
| Settings | Developer | Endpoints and code snippets to connect an app. |
| Users and roles | People and roles | Who can sign in and what each role lets them do. |
| caliban/auto | Automatic routing | The model name apps use to let Caliban pick the assistant or model. |
| break_glass | Shared admin token (emergency access) | The identity used when signing in with the admin token rather than a named account. |
| Judge model | Grader | A model that reads an answer and the description of a good one, and says pass or fail. |

## Sources and licenses

Grounding and adaptation by the Caliban maintainers. The rules above are rewritten and selected, not verbatim copies, except where a rule is short enough that the original wording is kept.

### Vercel web-interface-guidelines (MIT)

Source: <https://github.com/vercel-labs/web-interface-guidelines>, pinned at commit `434b7f91364665f2f733b310ec54809bf8f37937` (`AGENTS.md`, `command.md`, `README.md`). Used for section 2 and parts of sections 1 and 3. Modifications: rules selected for an on-prem admin console, merged with house rules, Next.js, hydration, media, font-preload and CDN rules removed, wording changed (no em dashes).

```text
MIT License

Copyright (c) 2025 Vercel Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Anthropic frontend-design skill (Apache-2.0)

Source: <https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design> (`SKILL.md`), pinned at commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44`. Licensed under the Apache License, Version 2.0: <https://www.apache.org/licenses/LICENSE-2.0> (the full text ships with the source as `skills/frontend-design/LICENSE.txt`).

Notice: portions of sections 1 ("Writing") and 3 ("Motion") of this file are derived from the frontend-design skill by Anthropic, PBC. Modifications by the Caliban maintainers: only the writing, motion and quality-floor guidance was kept and rewritten for an admin console; the brand-distinctiveness, typography and aesthetic-direction guidance was removed; house rules and the Caliban glossary were added. This file is distributed WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied; see the License for the specific language governing permissions and limitations.

### Other references

- Google DESIGN.md format: <https://github.com/google-labs-code/design.md>, pinned at commit `9bf8eae67128b6cc55ad9bf86665767deb4c11cd` (Apache-2.0); used for the shape of `DESIGN.md`, no text copied.
- IBM Carbon motion (productive durations and curves): <https://carbondesignsystem.com/elements/motion/overview/>.
- WAI-ARIA Authoring Practices: <https://www.w3.org/WAI/ARIA/apg/patterns/>. WCAG 2.2: <https://www.w3.org/TR/WCAG22/>.
- Research note 10 lists the evidence behind every rule above.

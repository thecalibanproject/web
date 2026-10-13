<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thecalibanproject/website/main/public/brand/logo-white.svg">
  <img alt="Caliban" src="https://raw.githubusercontent.com/thecalibanproject/website/main/public/brand/logo.svg" width="200">
</picture>

# Caliban Console

The admin console for Caliban. Daily work: Home (what needs attention, spend against caps, a setup checklist), Approvals, Assistants (with tests and a go-live sequence), Conversations, Knowledge and Usage and costs. Administration: Workspaces, Models, Data connections, the Data dictionary, Connected systems, People and roles, the Audit log and Developer settings.

The console speaks plain language: one glossary (`src/lib/glossary.ts`) maps the engine's terms to the words on screen (tenant is **Workspace**, node is **Assistant**, intent is **Topic**, ontology is **Data dictionary**, run is **Conversation**, eval is **Tests**, and so on), and the old names stay findable in the command palette and in "also called" toggletips. Contributors and coding agents: read [`AGENTS.md`](AGENTS.md) and [`DESIGN.md`](DESIGN.md) first.

[Docs](https://github.com/thecalibanproject/docs) · [Core](https://github.com/thecalibanproject/core) · [Deploy](https://github.com/thecalibanproject/deploy) · [TypeScript SDK](https://github.com/thecalibanproject/sdk-typescript) · [Python SDK](https://github.com/thecalibanproject/sdk-python)

## What this is

Caliban is a sovereign AI gateway: one OpenAI- and Anthropic-compatible endpoint for a company, with intent routing, PII pseudonymisation, an ontology layer over your data, caching, nodes (agents) and on-prem open-weight models. It is BYOK only and can run fully on-prem with zero egress. The design is described in the [reference architecture](https://github.com/thecalibanproject/docs/blob/main/architecture/caliban-reference-architecture.md).

This repo is the operator UI. It is a static single-page app with no server of its own. The Rust control plane in [core](https://github.com/thecalibanproject/core) (`caliban control-plane`, port **8081**) serves the built files from `/`, next to the admin API at `/api/v1/*`. The console talks only to that API, whose contract is [`api/openapi.yaml`](https://github.com/thecalibanproject/core/blob/main/api/openapi.yaml) in core.

Caliban is in active development with design partners.

## Pages

Every page except the sign-in screen requires a signed-in user: through single sign-on when the control plane has it configured, otherwise with the control plane's admin token. See [Signing in and roles](#signing-in-and-roles).

Routes keep their original paths, so old links work; the page names follow the glossary.

| Route | Page | What you do there |
| --- | --- | --- |
| `#/login` | Sign in | **Sign in with SSO** when single sign-on is configured; the shared admin token (emergency access) otherwise, or as a secondary option while the control plane accepts it. |
| `#/` | Home | What needs attention (everything waiting for a person across your workspaces, conversations that failed in the last day, assistant spend against the daily and monthly caps), a phased **Get set up** checklist derived from live state (model server reachable, a chat model, a workspace, an app key, a first request; then data, a first assistant, published and tested, live), each step linked to its page and docs, hideable per user, and the workspace's recent activity. |
| `#/inbox` | Approvals | Everything waiting for a person, across workspaces by default: plain cards (the action and the system, why it needs approval, who started it, how long it has waited), the customer's message and the arguments as a list, each value checked against the conversation (matches the account on file, only in the customer's message, or not found). Approve (confirmed) or reject with a required reason; J/K, A and R from the keyboard. |
| `#/nodes` | Assistants | One row per assistant. **New assistant** starts from a template (triage and booking, questions on documents, support desk with refunds, router to specialists) or blank, asks the template's fill-in fields, then opens the editor. `?new=1` opens it. |
| `#/nodes/<workspace>/<name>` | An assistant | **Go live** as four visible steps: publish, run tests, check the bar, make live. **Versions** (draft, published, retired, the live one marked), the settings of each version, new versions in the editor (a **Form** for the common settings and a **JSON** tab, kept in sync, with a notice for settings only JSON can edit), and version comparison. **Tests**: the go-live check (each requirement met or not, failing test cases first), the go-live bar (presets, seconds, a warning when lowered), test cases with their checks in words, and test runs with results per test case and every try. |
| `#/runs` | Conversations | Per workspace, newest first, with test runs hidden by default; filter by assistant, version, outcome and time. |
| `#/runs/<workspace>/<id>` | A conversation | What was asked and the answer first, then the steps on a timeline, cost and limits, technical details under Advanced. **Save as test**: "this answer was right" or "this answer was wrong" (what it should have done, and optionally what went wrong) adds a test case to the assistant's version. |
| `#/rag` | Knowledge | Document libraries: create one (who adds documents here; models and passage size under Advanced), upload several documents at once with per-file titles and progress, and review documents held for review. |
| `#/usage` | Usage and costs | What was charged first, then requests, reuse and tokens; cost per assistant, routing per day and each model call. Operator margin cards for catalogue admins only. |
| `#/tenants` | Workspaces | Create and list workspaces. |
| `#/tenants/<id>` | A workspace | Tabs: **Apps and keys** (keys run only the assistants you tick by default), **Provider accounts**, **Topics and routing** (example sentences, **Sends to** an assistant, **Which model answers**), **Privacy** (one question with examples; expert settings under Advanced), **Limits and budget**, **Danger zone**. |
| `#/models` | Models | Model servers first (adding one opens discovery), then the models, with where each one runs. |
| `#/datasources` | Data connections | Connect a database read-only, then **Scan** it to suggest data dictionary entries. |
| `#/ontology` | Data dictionary | Business names for your data. Approve every suggestion above a confidence in one step, select rows to approve or reject, and review the rest in a keyboard queue (J/K, A, R). Rejected entries are hidden until asked for. |
| `#/tools` | Connected systems | Outside systems assistants may call: add one, **Check for tools**, review and approve each action. |
| `#/audit` | Audit log | Every change with plain action names, the shared admin token named as such, and the tamper check of the chain. |
| `#/users` | People and roles | Role bindings, identity provider group mappings, users and their sessions. |
| `#/settings` | Developer | The gateway and admin service addresses, and snippets to connect an app. |

## On-prem guarantees

- **No egress.** No CDN links, remote fonts (it uses system font stacks), analytics, telemetry or external images. Every script, style and icon is bundled into `dist/`.
- **Nothing sensitive in browser storage with single sign-on.** The control plane is the backend for the console: tokens from the identity provider never reach the browser, which holds only an `HttpOnly`, `SameSite=Strict` session cookie. The console keeps the session's CSRF token in memory and sends it as `X-CSRF-Token` on writes.
- **The admin token stays in the tab.** In token mode the token is entered on the sign-in screen and kept in `sessionStorage`, falling back to memory when storage is blocked. It is sent as `Authorization: Bearer ...` and cleared on sign-out or on any `401`.
- **Secrets are write-only.** BYOK API keys and datasource credentials are posted once and never read back. The UI shows only the last four characters. A newly minted Caliban API key is shown exactly once.
- **CSP-friendly.** There is no inline JavaScript. The pre-paint theme script is a same-origin file (`public/theme-init.js`).

## Signing in and roles

The console follows what the control plane offers at `GET /auth/config`:

- **Single sign-on configured.** The sign-in screen offers **Sign in with SSO**, which goes to `/auth/login` on the control plane (authorization code flow with PKCE, run by the control plane) and comes back to the page you were on. If break-glass is still enabled, **Use the break-glass admin token** reveals the token form; every use of the token is audited. When a session expires or is revoked, the console returns to the sign-in screen, says so, and keeps the page to come back to. **Sign out** ends the session at the control plane and then at the identity provider, when it has a logout endpoint.
- **No single sign-on.** The admin token form, as before.

What you see follows your roles from `GET /auth/me` (deployment-wide `owner`, `admin`, `auditor`; per tenant `tenant_admin`, `developer`, `viewer`, `billing`). The menu shows only pages your roles can open, and actions your roles cannot perform are hidden or read-only. Tenant-scoped users see only their tenants. The control plane checks every request again: a refusal shows as "Your role does not allow this". Setting up the identity provider and the role mappings is described in core's `docs/sso.md`.

## Stack

Vite 8, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), TanStack Router (code-based routes, hash history), TanStack Query, `openapi-typescript` and `openapi-fetch` for the typed API client, and `ajv` (JSON Schema 2020-12) for node specs. Tests use Vitest and Testing Library with jsdom. Linting and formatting use ESLint 9 (typescript-eslint type-checked rules, react-hooks, jsx-a11y) and Prettier.

### Navigation, help and motion

- **Navigation by role.** Daily work first; a collapsible **Administration** group, open by default for deployment-wide roles (owner, admin, auditor) and closed for workspace roles. Route paths are unchanged, so old deep links keep working.
- **One workspace switcher** in the header, remembered per browser. Pages follow it; a `?tenant=` in a link still wins and switches it. The header also counts everything waiting for a person across all your workspaces.
- **Help when you ask for it.** A **Help** button in the same place on every page opens what the page is for, what people do there and links into the docs (`src/lib/pageHelp.ts`). Dense fields carry toggletips with a **Learn more** link. There is no automatic tour.
- **Docs links** go to the docs bundled with the release, under `/docs/` on the same origin (`VITE_DOCS_BASE` to point elsewhere). Every link is typed against `src/lib/docs.ts`, which mirrors the console to docs link contract.
- **Command palette.** `Ctrl K` (`⌘ K` on a Mac): pages, actions, workspaces, glossary terms, and a pasted conversation id. Old names (tenant, node, CQIR, inbox) find the renamed thing.
- **Motion** is functional only: Carbon "productive" tokens in `src/index.css`, route cross-fades through the View Transition API (the router's `defaultViewTransition`), drawer and dialog entrances. Under `prefers-reduced-motion`, or with the **Reduce motion** switch in the sidebar, movement becomes a short fade or nothing.

### Layout

```
src/
  api/            generated schema, typed client (openapi-fetch + auth middleware), query hooks
  components/
    ui/           hand-rolled primitives: Button, Field/Input/Select/Switch, Table, Tabs, Drawer (<dialog>), states
    layout/       app shell (navigation, workspace switcher, approvals badge), command palette, theme and motion switches
    help/         toggletips, Learn more links, the Advanced disclosure, the page help panel
    home/         Home: what needs attention, spend against caps, the setup checklist
    tenant/       API keys (with node access) and BYOK provider keys panels, privacy and caching settings, node limits, danger zone
    models/       model catalogue, model servers, discovery dialog, server health
    nodes/        assistant editor (form and JSON tabs), New assistant from templates, version dialogs, diffs, refusal problems
    evals/        go-live stepper, the Tests tab: go-live check and bar, test cases, test runs, starting tests
    runs/         run status and taint label badges, answering questions and approvals
    tools/        tool server registration, manifests, review and approval
    rag/          document collections, documents, ingest, review and release
  lib/            auth (token and session), permissions, theme, formatting, ontology review queue, datasource field specs, nodes, tools, API key access, usage by node, runs, evals, retrieval
  pages/          one file per route
  schemas/        JSON schemas vendored from core
  templates/      assistant templates (static JSON, bundled)
  test/           Vitest setup and helpers
  router.tsx      route tree, auth guard, search-param validation
public/           favicon.svg, theme-init.js
scripts/          sync-schemas.mjs
```

Pages other than login and overview are code-split per route (for example, `ajv` only loads with the Nodes page). All chunks are local files in `dist/assets`.

## Quick start (build from source)

Requirements: Node 24 (see `.nvmrc`) and pnpm 9 (pinned through `packageManager` in `package.json`). For anything beyond the login screen you need a running control plane from [core](https://github.com/thecalibanproject/core) and its admin token.

```sh
nvm use            # Node 24
pnpm install
pnpm dev           # http://localhost:5173, proxies /api and /auth -> http://localhost:8081
```

Open http://localhost:5173 and sign in with the `CALIBAN_ADMIN_TOKEN` value the control plane was started with.

To proxy to a control plane on another host:

```sh
CALIBAN_DEV_API_TARGET=http://10.0.0.5:8081 pnpm dev
```

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on port 5173 with the `/api` proxy |
| `pnpm build` | Type-checks (`tsc -b`), then builds `dist/` |
| `pnpm preview` | Serves the built `dist/` locally |
| `pnpm typecheck` | `tsc -b --noEmit` |
| `pnpm lint` | ESLint, with warnings treated as errors |
| `pnpm format` / `pnpm format:check` | Prettier, write or check |
| `pnpm test` | Vitest, single run. Use `pnpm test:watch` for watch mode. |
| `pnpm gen:api` | Regenerates `src/api/schema.d.ts` from `../core/api/openapi.yaml` |
| `pnpm sync:schemas` | Copies `../core/schemas/node.schema.json` into `src/schemas/` |
| `pnpm gen` | Runs both of the above |

`gen:api` and `sync:schemas` expect a checkout of [core](https://github.com/thecalibanproject/core) next to this repo, at `../core`. Everything else works on a standalone clone.

## Configuration

All configuration is optional. See `.env.example`.

| Variable | Used by | Effect |
| --- | --- | --- |
| `VITE_CALIBAN_API_BASE` | `pnpm build` | Where the console sends `/api/v1/*` calls. Defaults to the origin and path prefix the console was loaded from. |
| `CALIBAN_DEV_API_TARGET` | `pnpm dev` | Where the dev server proxies `/api` and `/auth`. Defaults to `http://localhost:8081`. For single sign-on in development, register `http://localhost:5173/auth/callback` as the redirect URL so the session cookie lands on the dev server's origin. |
| `CALIBAN_SOURCEMAP` | `pnpm build` | Set to `true` to emit source maps. Production builds have none by default. |

Theme colours are CSS variables in `src/index.css` and follow `prefers-color-scheme` by default. The theme toggle (System, Light, Dark) sets `<html data-theme>` and stores the choice in `localStorage`.

## Serving it from the control plane

```sh
pnpm build        # -> dist/
```

`dist/` is a plain directory of static files. Point the control plane at it with `web_dir` in the `[server]` section of the core config (core's example config uses `/usr/share/caliban/web`), and the console is served from `/` on port 8081. Two choices make the build portable:

1. **`base: './'`.** Every asset URL in `index.html` is relative (`./assets/...`), so the same build works at `http://host:8081/` and behind a reverse proxy under a sub-path such as `https://gw.corp/caliban/`.
2. **Hash routing (`/#/tenants/...`).** The server only ever sees requests for `index.html` and `assets/*`, so deep links and refreshes work without an SPA fallback or rewrite rule.

Because the API base follows the path the console was loaded from, a console served at `/caliban/` sends its calls to `/caliban/api/v1/*`. To point a build somewhere else, set `VITE_CALIBAN_API_BASE` at build time.

The container image in [deploy](https://github.com/thecalibanproject/deploy) builds this repo and core together in one multi-stage Dockerfile.

## The API contract

[core](https://github.com/thecalibanproject/core) owns the contract. After it changes:

```sh
pnpm gen          # regenerate types and vendored schemas
pnpm typecheck    # the compiler shows every call site that drifted
```

- `src/api/schema.d.ts` is generated code. Do not edit it by hand. It is committed so this repo builds without a sibling `core/` checkout (for example in air-gapped CI).
- `gen:api` passes `--default-non-nullable false`, so request fields that have a server default (such as `pii_default` or `limit`) stay optional.
- `src/api/types.ts` re-exports the schema types under friendly names and lists enum values with `satisfies`, so drift fails the type check.
- `src/api/queries.ts` holds every TanStack Query `queryOptions` and mutation hook.
- `src/api/client.ts` adds the bearer token to each request in token mode, or the CSRF token to writes in session mode, signs out on `401`, and turns the contract's error envelope into a typed `ApiError`.
- `src/api/auth.ts` loads the sign-in state (`/auth/config` and `/auth/me`) and provides `usePermissions()` and `useSignOut()`.

The node spec schema in `src/schemas/node.schema.json` is vendored for the same reason. The Nodes editor validates against it with `ajv` before it POSTs, and the server validates again.

## Testing

```sh
pnpm test         # Vitest + Testing Library on jsdom, single run
pnpm typecheck
pnpm lint
pnpm format:check
```

Two checks guard the console's language and accessibility:

- **axe-core** runs in jsdom on the main pages (`src/test/a11y.ts`, no network). Colour contrast is checked on the tokens instead (see `DESIGN.md`).
- **The copy lint** (`src/test/copy-lint.test.ts`) parses every component and fails when internal jargon (CQIR, kNN, taint, pass^k, tenant, node, intent, ...) or an em or en dash appears in basic UI copy. Technical names are allowed inside Advanced sections, code and JSON views, toggletips and native tooltips.

Tests sit next to the code they cover (`*.test.ts`, `*.test.tsx`): the API client (token and session mode, CSRF, 401 and 403), the sign-in state and permissions, the sign-in screen, session and role-gated console flows, the users and roles page, auth storage, URL handling, the model form, node spec, datasource and ontology helpers, the query hooks, the API keys panel and provider key form, the tenant privacy and caching settings, the tenant, tenant detail and usage pages, the model catalogue, server form, health badge and discovery dialog, the node editor, the nodes and node pages, node evals, the runs, run and inbox pages, the tools page, the retrieval page and its helpers, node limits, and API key node access.

With pnpm 9, `pnpm test --run` is rejected because pnpm parses `--run` as its own flag. `pnpm test` already runs once. To pass extra flags, use `pnpm run test <flags>` or `pnpm test -- <flags>`.

## Accessibility and layout

- A skip link, visible focus rings, labelled controls through `Field`, WAI-ARIA tabs with arrow-key navigation, and native `<dialog>` for drawers (focus trap and Escape to close). Reduced-motion preferences are honoured. ESLint enforces `jsx-a11y`.
- Responsive: a full sidebar at 1024px and wider, an icon rail on tablets (768px and wider), and a top navigation bar on phones.

## Related repos

- [core](https://github.com/thecalibanproject/core): the Rust binary (data plane on `:8080`, control plane and this console on `:8081`) and the OpenAPI contract.
- [deploy](https://github.com/thecalibanproject/deploy): container image, docker-compose, Helm chart and air-gap bundle tooling.
- [sdk-typescript](https://github.com/thecalibanproject/sdk-typescript) and [sdk-python](https://github.com/thecalibanproject/sdk-python): client SDKs for the same API (Apache-2.0).
- [ml](https://github.com/thecalibanproject/ml): offline training and export for the small models the data plane runs in-process.
- [docs](https://github.com/thecalibanproject/docs): reference architecture and research notes.
- [website](https://github.com/thecalibanproject/website): the architecture site.

## Licence

Copyright 2026 Elie Sfeir. This repository is proprietary and source-available: it is public for reference and evaluation only, and no right to use, copy, modify or distribute it is granted without a written agreement with the copyright holder. See [LICENSE](LICENSE). For licensing, contact elie@internalizable.dev.

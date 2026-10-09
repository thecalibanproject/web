# Caliban web console

The admin console for [Caliban](../docs/architecture/caliban-reference-architecture.md), the single AI endpoint for a company. You use it to manage tenants, BYOK provider keys, the model registry, datasources and the ontology studio, nodes, and usage.

It is a static single-page app. The Rust control plane serves it from `/` on port **8081**, next to the admin API at `/api/v1/*`. It talks only to that API, which is defined in [`../core/api/openapi.yaml`](../core/api/openapi.yaml).

## On-prem guarantees

- **No egress.** No CDN links, remote fonts (it uses system font stacks), analytics, telemetry or external images. Every script, style and icon is bundled into `dist/`.
- **The admin token stays in the tab.** The token (`CALIBAN_ADMIN_TOKEN`) is entered on the login screen and kept in `sessionStorage`, falling back to memory when storage is blocked. It is sent as `Authorization: Bearer …` and cleared on sign-out or on any `401`.
- **Secrets are write-only.** BYOK API keys and datasource credentials are posted once and never read back. The UI shows only `last4`. A minted Caliban API key is shown exactly once.
- **CSP-friendly.** There is no inline JavaScript. The pre-paint theme script is a same-origin file (`public/theme-init.js`).

## Stack

Vite 8, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), TanStack Router (code-based, hash history), TanStack Query, `openapi-typescript` and `openapi-fetch` for the typed client, and `ajv` (JSON Schema 2020-12) for node specs. Tests use Vitest and Testing Library with jsdom. Linting and formatting use ESLint 9 (typescript-eslint type-checked, react-hooks, jsx-a11y) and Prettier.

## Develop

```sh
nvm use            # Node 24
pnpm install
pnpm dev           # http://localhost:5173, proxies /api -> http://localhost:8081
```

Set `CALIBAN_DEV_API_TARGET` to proxy to another control plane, for example `CALIBAN_DEV_API_TARGET=http://10.0.0.5:8081 pnpm dev`.

| Script                         | What it does                                                      |
| ------------------------------ | ----------------------------------------------------------------- |
| `pnpm dev`                     | Vite dev server with the `/api` proxy                             |
| `pnpm build`                   | Type-checks (`tsc -b`), then builds `dist/`                       |
| `pnpm preview`                 | Serves the built `dist/` locally                                  |
| `pnpm typecheck`               | `tsc -b --noEmit`                                                 |
| `pnpm lint`                    | ESLint, with warnings treated as errors                           |
| `pnpm format` / `format:check` | Prettier                                                          |
| `pnpm test`                    | Vitest, single run. Use `pnpm test:watch` for watch mode.         |
| `pnpm gen:api`                 | Regenerates `src/api/schema.d.ts` from `../core/api/openapi.yaml` |
| `pnpm sync:schemas`            | Copies `../core/schemas/node.schema.json` into `src/schemas/`     |
| `pnpm gen`                     | Runs both of the above                                            |

With pnpm 9, `pnpm test --run` is rejected because pnpm parses `--run` as its own flag. `pnpm test` already runs once. To pass extra flags, use `pnpm run test <flags>` or `pnpm test -- <flags>`.

### API contract → types

`core/` owns the contract. After it changes:

```sh
pnpm gen          # regenerate types + vendored schemas
pnpm typecheck    # the compiler shows every call site that drifted
```

- `src/api/schema.d.ts` is generated code. Don't edit it, but do commit it so `web/` builds without a sibling `core/` checkout (for example in air-gapped CI).
- `gen:api` passes `--default-non-nullable false`, so request fields that have a server default (such as `pii_default` or `limit`) stay optional.
- `src/api/types.ts` re-exports the schema types under friendly names, and lists enum values with `satisfies` so drift fails the type check.
- `src/api/queries.ts` holds every TanStack Query `queryOptions` and mutation hook.

The node spec schema in `src/schemas/node.schema.json` is also vendored, for the same reason. The Nodes editor validates against it client-side with `ajv` before it POSTs. The server validates again.

## How it is served on-prem

```sh
pnpm build        # -> dist/
```

`dist/` is a plain directory of static files that the control plane serves from `/`. Two choices make it portable:

1. **`base: './'`**: every asset URL in `index.html` is relative (`./assets/…`). The same build therefore works at `http://host:8081/` and behind a reverse proxy under a sub-path such as `https://gw.corp/caliban/`.
2. **Hash routing (`/#/tenants/…`)**: the server only ever sees requests for `index.html` and `assets/*`. Deep links and refreshes work without an SPA fallback or rewrite rule.

The API base URL defaults to the origin and path prefix that the console was loaded from, so `/caliban/` sends calls to `/caliban/api/v1/*`. To point a build somewhere else, set `VITE_CALIBAN_API_BASE` at build time (see `.env.example`).

Production builds don't emit source maps. Set `CALIBAN_SOURCEMAP=true pnpm build` to get them.

## Layout

```
src/
  api/            generated schema, typed client (openapi-fetch + auth middleware), query hooks
  components/
    ui/           hand-rolled primitives: Button, Field/Input/Select, Table, Tabs, Drawer (<dialog>), states…
    layout/       app shell (sidebar, health, theme toggle)
    tenant/       API keys + BYOK provider keys panels
    nodes/        JSON node editor with live schema validation
  lib/            auth/session storage, theme, formatting, ontology queue, datasource field specs
  pages/          one file per route
  schemas/        vendored JSON schemas from core/
  router.tsx      route tree, auth guard, search-param validation
```

## Design notes

- Theme colours are CSS variables in `src/index.css`. They follow `prefers-color-scheme` by default. The theme toggle (System → Light → Dark) sets `<html data-theme>` and stores the choice in `localStorage`.
- Accessibility: there is a skip link, visible focus rings, labelled controls through `Field`, WAI-ARIA tabs with arrow-key navigation, and native `<dialog>` for drawers (focus trap and Escape to close). Reduced-motion preferences are honoured. ESLint enforces `jsx-a11y`.
- Responsive layout: a full sidebar at ≥1024px, an icon rail on tablets (≥768px), and a top nav bar on phones.

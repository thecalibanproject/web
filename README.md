<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thecalibanproject/website/main/public/brand/logo-white.svg">
  <img alt="Caliban" src="https://raw.githubusercontent.com/thecalibanproject/website/main/public/brand/logo.svg" width="200">
</picture>

# Caliban Console

The admin console for Caliban: tenants, API keys, BYOK provider keys, the model registry, datasources, the ontology studio, nodes, the tool registry, usage and the audit log.

[Docs](https://github.com/thecalibanproject/docs) · [Core](https://github.com/thecalibanproject/core) · [Deploy](https://github.com/thecalibanproject/deploy) · [TypeScript SDK](https://github.com/thecalibanproject/sdk-typescript) · [Python SDK](https://github.com/thecalibanproject/sdk-python)

## What this is

Caliban is a sovereign AI gateway: one OpenAI- and Anthropic-compatible endpoint for a company, with intent routing, PII pseudonymisation, an ontology layer over your data, caching, nodes (agents) and on-prem open-weight models. It is BYOK only and can run fully on-prem with zero egress. The design is described in the [reference architecture](https://github.com/thecalibanproject/docs/blob/main/architecture/caliban-reference-architecture.md).

This repo is the operator UI. It is a static single-page app with no server of its own. The Rust control plane in [core](https://github.com/thecalibanproject/core) (`caliban control-plane`, port **8081**) serves the built files from `/`, next to the admin API at `/api/v1/*`. The console talks only to that API, whose contract is [`api/openapi.yaml`](https://github.com/thecalibanproject/core/blob/main/api/openapi.yaml) in core.

Caliban is in active development with design partners.

## Pages

Every page except the sign-in screen requires a signed-in user: through single sign-on when the control plane has it configured, otherwise with the control plane's admin token. See [Signing in and roles](#signing-in-and-roles).

| Route | Page | What you do there |
| --- | --- | --- |
| `#/login` | Sign in | With single sign-on: **Sign in with SSO** (your identity provider), and the break-glass admin token as a secondary option while the control plane accepts it. Without single sign-on: the admin token (`CALIBAN_ADMIN_TOKEN` on the control plane), checked against `GET /auth/me`. Explains failed sign-ins and expired sessions. |
| `#/` | Overview | Requests, tokens, cache efficiency and spend across all tenants, plus the most recent requests. |
| `#/tenants` | Tenants | Create and list tenants. A tenant is the isolation boundary for keys, cache, ontology and budgets. **Show deleted** adds deleted tenants, marked **Deleted** with their deletion date. |
| `#/tenants/<id>` | Tenant detail | Two tabs: **API keys** (mint Caliban keys for your apps, revoke a key, and **Show revoked** to list revoked keys with their revocation time) and **Provider keys** (BYOK credentials for OpenAI, Anthropic, OpenAI-compatible servers such as vLLM, llama.cpp, Ollama and SGLang, Azure OpenAI, AWS Bedrock and Google Vertex AI). **Privacy and caching** sets the tenant's PII default mode, its surrogate scope (**Tenant**: the same stand-in for the same value across requests, so repeated questions can hit the cache, but the model provider can link the tenant's sessions through those stand-ins; **Session**: fresh stand-ins per request, and requests that contain personal data skip the cache) and its semantic cache (**Off** or **On**; also needs `[cache.semantic] enabled` in the deployment config, and answers are reused only within the tenant), and the **cache-hit price for caliban/auto** (the percent of the flat price billed when the cache answers; empty means the deployment default, 20% unless configured). Changes are saved with `PATCH /api/v1/tenants/<id>` and audited as `tenant.update`. A **Danger zone** deletes the tenant after you type its id: its keys are revoked, provider credentials destroyed, routes removed, and datasources and nodes deleted. Audit history is kept and the id can't be reused. A deleted tenant's page says so instead of showing an error. Minting an API key can set its **node access** (every published node, only some nodes, or none; granting it needs `nodes.run`) and the **datasource scopes** its node runs may read (`<datasource>.<object>:read`). **Node limits** sets the caps every node version's budgets must fit when it is published or made live (steps, tokens, wall clock, subnode depth, map fan-out, optional USD per run; **Restore default caps** clears them) and the tenant's daily and monthly node spend caps. |
| `#/models` | Models | Two tabs: **Catalogue** (the model registry the router chooses from; a model's trust tier decides which requests it may see) and **Model servers** (shared on-prem servers for open models, with live health and model discovery). |
| `#/datasources` | Datasources | Register a datasource for a tenant, then introspect and profile it so Caliban proposes ontology elements for review. Delete a datasource (its connection settings are wiped). |
| `#/ontology` | Ontology studio | Review proposed elements (entities, attributes, relations, metrics, dimensions, glossary terms, policies, verified queries), least confident first, and approve or reject each one. |
| `#/nodes` | Nodes | One row per node (versioned, budgeted AI sub-apps): tenant, live version, latest version and its state, last change. **New node** creates version 1 as a draft from JSON checked live against the node schema. |
| `#/nodes/<tenant>/<name>` | Node | The node's versions (draft, published, retired; the live one marked), with content hash, author and times. **View spec** shows a version read-only as formatted JSON. **New version** creates the next draft from JSON. **Publish** (and make live), **Make live** (promote or roll back), **Retire** (runs in flight finish on their version) and **Delete** (drafts and retired versions), each confirmed. **Compare versions** shows the control plane's diff by JSON pointer. Refusals are listed problem by problem: unpinned tools, tools not approved, unknown datasource scopes, node caps exceeded, unsupported code vertices, node references. Actions your roles lack (`nodes.write`, `nodes.publish`) are disabled with the reason. |
| `#/tools` | Tools | Per tenant, the MCP servers nodes may call: **Register server** (Streamable HTTP URL, authentication by Caliban token, API key, OAuth client credentials or none; the key or client secret is sealed and never shown again; **Trusted with personal data** explained), **Discover** or **Import manifests**, and every manifest with its pin, scan findings and approval state. **Review** shows the injection scan findings first, then the description and input schema with hidden characters made visible; approving a manifest with findings needs an explicit acknowledgement. Tools the server changed after approval are flagged for re-approval. Approved manifests show the `mcp://` reference to pin; approvals can be revoked. |
| `#/usage` | Usage | Per-request events: the route (requested model → routed model, with the intent stage and confidence), tokens, cache outcome and cache tier (exact or semantic), PII entities, cost, billed amount (for `caliban/auto`, with the full flat price and the saving on cache hits; for other models, the cost a cache hit saved) and latency, filterable by tenant, cache status, cache tier, node and run. Model calls made by node runs show their node and version; **Cost per node** totals each node and its versions (requests, tokens, model cost, charged). Totals include cache hits with their semantic share and what they saved. A `caliban/auto` card shows what was billed, the full flat price, cache-hit count and savings, the routed models' cost and the margin (billed minus routed cost). Cache hits are billed a share of the flat price. |
| `#/audit` | Audit log | Every change made through the admin API (`GET /api/v1/audit`), newest first: time, actor, action (such as `tenant.update`, `api_key.revoke` or `tenant.delete`), tenant, target, a readable summary of the details and the raw detail. **Last** sets how many recent entries to load (100 to 1,000, the API maximum); **Tenant** and **Action** filter the loaded entries, 50 per page. A banner shows whether the control plane verified the hash chain of the loaded entries, and the head hash to record elsewhere. Each row shows its hash and previous hash, truncated, with a copy button, and is marked **Link broken** if its previous hash does not match the entry before it. |
| `#/users` | Users and roles | Owners, admins and auditors. Role bindings (a user or an identity provider group, the role, and the tenant for tenant roles), with **Grant role** and **Revoke** for owners and admins (only owners grant or revoke `owner`). The group mappings from the config file, read-only. Users known from the identity provider, with their last sign-in, active sessions and **Sign out everywhere**. |
| `#/settings` | Settings | Admin API and data plane endpoints, control plane status, connection snippets for apps, and console preferences. |

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

### Layout

```
src/
  api/            generated schema, typed client (openapi-fetch + auth middleware), query hooks
  components/
    ui/           hand-rolled primitives: Button, Field/Input/Select/Switch, Table, Tabs, Drawer (<dialog>), states
    layout/       app shell (sidebar, health, theme toggle)
    tenant/       API keys (with node access) and BYOK provider keys panels, privacy and caching settings, node limits, danger zone
    models/       model catalogue, model servers, discovery dialog, server health
    nodes/        JSON node editor with live schema validation, version lifecycle dialogs, diffs, refusal problems
    tools/        tool server registration, manifests, review and approval
  lib/            auth (token and session), permissions, theme, formatting, ontology review queue, datasource field specs, nodes, tools, API key access, usage by node
  pages/          one file per route
  schemas/        JSON schemas vendored from core
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

Tests sit next to the code they cover (`*.test.ts`, `*.test.tsx`): the API client (token and session mode, CSRF, 401 and 403), the sign-in state and permissions, the sign-in screen, session and role-gated console flows, the users and roles page, auth storage, URL handling, the model form, node spec, datasource and ontology helpers, the query hooks, the API keys panel and provider key form, the tenant privacy and caching settings, the tenant, tenant detail and usage pages, the model catalogue, server form, health badge and discovery dialog, the node editor, the nodes and node pages, the tools page, node limits, and API key node access.

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

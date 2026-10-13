# Local console demo

Run `pnpm dev:mock` from `web`, then open http://localhost:5173. Sign in with any nonempty fictional admin token. No control plane, model provider, credentials or external assets are needed. This middleware is only imported in Vite's mock mode, never in the production entry graph.

The busy scenario includes Cedar Bank and MedMarket Clinics, draft and live assistants, a refund waiting for approval, parallel conversation steps, a failed quality test, proposals with different confidence, a held document, usage and audit history.

For a fresh install, set `document.cookie = 'qa_scenario=fresh; path=/'` in the browser console and reload. Restore the demo with `document.cookie = 'qa_scenario=busy; path=/'`. The browser workspace selection may also be cleared with `localStorage.removeItem('caliban.workspace')`.

Fixtures are ported from the founder's console QA harness and follow src/api/schema.d.ts. They are a visual demo, not a full backend emulator: most write workflows require a real development control plane, unimplemented endpoints return 404, and fixture edits do not persist. Existing production mutations are unchanged. The production build has no mock data or middleware.

Run `node --test scripts/mock/check.mjs` for the fixture checks (also included in pnpm test).

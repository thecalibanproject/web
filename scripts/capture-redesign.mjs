/* global document, window */
// Drives the built console against the mock control plane and captures the
// screenshot set. Usage: node capture.mjs <outDir> [nameFilter] [variantFilter]
const { chromium } = await import(process.env.CALIBAN_PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4317';
const OUT = process.argv[2] ?? 'shots';
const FILTER = process.argv[3] ? new RegExp(process.argv[3]) : null;
const VFILTER = process.argv[4] ? new RegExp(process.argv[4]) : null;

const VARIANTS = [
  { id: 'desktop-light', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { id: 'desktop-dark', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { id: 'mobile-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', mobile: true },
  { id: 'mobile-dark', viewport: { width: 390, height: 844 }, colorScheme: 'dark', mobile: true },
  {
    id: 'tablet-light',
    viewport: { width: 820, height: 1000 },
    colorScheme: 'light',
    only: /^(home-busy|approvals|assistant-overview|knowledge)$/,
  },
  {
    id: 'desktop-reduced',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    only: /^(home-busy|approvals|palette|help-panel|assistant-setup-form|save-as-test)$/,
  },
];

const settle = async (page, ms = 100) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};

async function go(page, path, ws) {
  await page.evaluate((w) => {
    if (w) localStorage.setItem('caliban.workspace', w);
  }, ws);
  await page.goto(`${BASE}/#${path}`);
  await page.reload();
  await settle(page);
}

const click = async (page, locator) => {
  await locator.first().click();
  await settle(page, 600);
};

const SHOTS = [
  { name: 'login', scenario: 'busy', signedOut: true, path: '/login' },
  { name: 'home-fresh', scenario: 'fresh', ws: 'medmarket', path: '/' },
  { name: 'home-busy', scenario: 'busy', ws: 'cedar-bank', path: '/' },
  { name: 'approvals', scenario: 'busy', ws: 'cedar-bank', path: '/inbox' },
  {
    name: 'approvals-refund',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/inbox',
    act: async (p) => click(p, p.getByRole('checkbox', { name: 'Only Cedar Bank' })),
  },
  {
    name: 'assistant-overview',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes/cedar-bank/support-desk',
  },
  {
    name: 'assistant-setup-form',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes/cedar-bank/support-desk',
    viewportOnly: true,
    act: async (p) => click(p, p.getByRole('button', { name: 'New version', exact: true })),
  },
  {
    name: 'assistant-setup-form-bottom',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes/cedar-bank/support-desk',
    viewportOnly: true,
    act: async (p) => {
      await click(p, p.getByRole('button', { name: 'New version', exact: true }));
      await p.getByRole('button', { name: 'Create draft' }).scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
    },
  },
  {
    name: 'assistant-json',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes/cedar-bank/support-desk',
    viewportOnly: true,
    act: async (p) => {
      await click(p, p.getByRole('button', { name: 'New version', exact: true }));
      await click(p, p.getByRole('tab', { name: 'JSON' }));
    },
  },
  {
    name: 'assistant-tests',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes/cedar-bank/support-desk?tab=evals&ev=3',
  },
  {
    name: 'assistant-test-run-failing',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes/cedar-bank/support-desk?tab=evals&ev=3&eval=ev_g3',
  },
  { name: 'assistant-list', scenario: 'busy', ws: 'cedar-bank', path: '/nodes' },
  {
    name: 'new-assistant',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/nodes?new=1',
    viewportOnly: true,
  },
  {
    name: 'conversation-approval',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/runs/cedar-bank/run_8f3k2q',
  },
  {
    name: 'save-as-test',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/runs/cedar-bank/run_7hq1mz',
    viewportOnly: true,
    act: async (p) => click(p, p.getByRole('button', { name: 'Save as test' })),
  },
  { name: 'conversations', scenario: 'busy', ws: 'cedar-bank', path: '/runs' },
  { name: 'knowledge', scenario: 'busy', ws: 'medmarket', path: '/rag?collection=clinic-guides' },
  {
    name: 'knowledge-upload',
    scenario: 'busy',
    ws: 'medmarket',
    path: '/rag?collection=clinic-guides',
    viewportOnly: true,
    act: async (p) => click(p, p.getByRole('button', { name: 'Upload documents' })),
  },
  {
    name: 'knowledge-held-back',
    scenario: 'busy',
    ws: 'medmarket',
    path: '/rag?collection=clinic-guides&doc=supplier-price-list-2026',
    viewportOnly: true,
  },
  { name: 'data-dictionary', scenario: 'busy', ws: 'cedar-bank', path: '/ontology' },
  {
    name: 'privacy-basic',
    scenario: 'busy',
    ws: 'medmarket',
    path: '/tenants/medmarket?tab=privacy',
  },
  {
    name: 'privacy-advanced',
    scenario: 'busy',
    ws: 'medmarket',
    path: '/tenants/medmarket?tab=privacy',
    act: async (p) => click(p, p.locator('summary').filter({ hasText: 'Advanced' })),
  },
  { name: 'topics', scenario: 'busy', ws: 'medmarket', path: '/tenants/medmarket?tab=intents' },
  {
    name: 'help-panel',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/inbox',
    viewportOnly: true,
    act: async (p) => click(p, p.getByRole('button', { name: /^Help/ })),
  },
  {
    name: 'palette',
    scenario: 'busy',
    ws: 'cedar-bank',
    path: '/',
    viewportOnly: true,
    act: async (p) => {
      await p.keyboard.press('Control+k');
      await p.waitForTimeout(300);
      await p.keyboard.type('tenant');
      await settle(p, 100);
    },
  },
  { name: 'empty-assistants', scenario: 'fresh', ws: 'medmarket', path: '/nodes' },
  { name: 'empty-knowledge', scenario: 'fresh', ws: 'medmarket', path: '/rag' },
  { name: 'empty-conversations', scenario: 'fresh', ws: 'medmarket', path: '/runs' },
  { name: 'empty-approvals', scenario: 'fresh', ws: 'medmarket', path: '/inbox' },
  { name: 'usage', scenario: 'busy', ws: 'cedar-bank', path: '/usage' },
  { name: 'models', scenario: 'busy', ws: 'cedar-bank', path: '/models' },
  { name: 'workspaces', scenario: 'busy', ws: 'cedar-bank', path: '/tenants' },
  { name: 'audit', scenario: 'busy', ws: 'cedar-bank', path: '/audit' },
];

const browser = await chromium.launch({ channel: 'chromium' });
await mkdir(OUT, { recursive: true });
const log = [];
const axeSource = await readFile(
  new URL('../node_modules/axe-core/axe.min.js', import.meta.url),
  'utf8',
);

for (const v of VARIANTS) {
  if (VFILTER && !VFILTER.test(v.id)) continue;
  for (const s of SHOTS) {
    if (FILTER && !FILTER.test(s.name)) continue;
    if (v.only && !v.only.test(s.name)) continue;
    const ctx = await browser.newContext({
      viewport: v.viewport,
      colorScheme: v.colorScheme,
      reducedMotion: v.reducedMotion ?? 'no-preference',
      deviceScaleFactor: v.mobile ? 2 : 1,
      isMobile: Boolean(v.mobile),
      hasTouch: Boolean(v.mobile),
    });
    await ctx.addCookies([{ name: 'qa_scenario', value: s.scenario, url: BASE }]);
    const page = await ctx.newPage();
    const errors = [];
    const externalRequests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(BASE).origin)
        externalRequests.push(request.url());
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    try {
      await page.goto(`${BASE}/#/login`);
      await settle(page, 100);
      if (!s.signedOut) {
        await page.locator('input[type=password]').fill('qa-admin-token');
        await page
          .getByRole('button', { name: /sign in/i })
          .first()
          .click();
        await settle(page, 100);
        await go(page, s.path, s.ws);
      } else {
        await settle(page);
      }
      if (s.act) await s.act(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      let accessibility = [];
      if (
        /^(home-busy|approvals|approvals-refund|assistant-overview|assistant-tests|conversation-approval|usage)$/.test(
          s.name,
        )
      ) {
        await page.evaluate(axeSource);
        accessibility = await page.evaluate(async () => {
          const result = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          });
          return result.violations.map(({ id, nodes }) => ({
            id,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          }));
        });
      }
      const file = join(OUT, `${s.name}--${v.id}.png`);
      await page.screenshot({ path: file });
      log.push({
        shot: s.name,
        variant: v.id,
        file,
        overflow,
        errors,
        externalRequests,
        accessibility,
      });
      console.log(
        `${s.name}--${v.id}${overflow > 0 ? ` OVERFLOW ${overflow}px` : ''}${errors.length ? ` ERR ${errors.join(' | ').slice(0, 300)}` : ''}`,
      );
    } catch (e) {
      console.log(`FAILED ${s.name}--${v.id}: ${e.message.split('\n')[0]}`);
      log.push({ shot: s.name, variant: v.id, failed: e.message });
    }
    await ctx.close();
  }
}
await writeFile(join(OUT, 'log.json'), JSON.stringify(log, null, 2));
await browser.close();

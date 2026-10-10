import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];

function mockUsage(raw: string) {
  mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/usage': () => ({ raw }),
  });
}

async function expectCost(text: RegExp) {
  const totals = await screen.findByRole('region', { name: 'Totals' });
  const tile = within(totals).getByText('Cost').nextElementSibling;
  await waitFor(() => expect(tile).toHaveTextContent(text));
}

describe('OverviewPage', () => {
  it('shows the cost tile as $0.00 when the server sends -0.0 (no priced requests)', async () => {
    // The control plane sums cost over priced events; with none, Rust's empty
    // f64 sum is -0.0, which used to render as "-$0.00".
    mockUsage('{"events":[],"totals":{"requests":0,"cost_usd":-0.0}}');
    await renderApp('/');
    await expectCost(/^\$0\.00$/);
  });

  it('shows the total cost', async () => {
    mockUsage('{"events":[],"totals":{"requests":3,"cost_usd":1.5}}');
    await renderApp('/');
    await expectCost(/^\$1\.50$/);
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderApp } from '@/test/utils';

function mock() {
  mockApi({
    'GET /api/v1/tenants': () => ({ body: [] }),
    'GET /api/v1/providers': () => ({ body: [] }),
    'GET /api/v1/models': () => ({ body: [] }),
  });
}

describe('ModelsPage', () => {
  it('starts with the servers, and teaches when there are none', async () => {
    mock();
    await renderApp('/models');
    expect(await screen.findByText('No model servers yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add server' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
      'href',
      '/docs/guides/models/#add-a-model-server',
    );
  });

  it('keeps prices, licence and capabilities of a new model under Advanced', async () => {
    const user = userEvent.setup();
    mock();
    await renderApp('/models?tab=catalogue');
    await screen.findByText('No models yet');
    await user.click(screen.getAllByRole('button', { name: 'Add model' })[0]!);
    const form = await screen.findByRole('form', { name: 'Add model' });
    const advanced = within(form).getByText('Advanced').closest('details')!;
    expect(advanced).not.toHaveAttribute('open');
    expect(within(advanced).getByLabelText(/^Price in/)).toBeInTheDocument();
    expect(within(advanced).getByLabelText(/^Licence/)).toBeInTheDocument();
    expect(within(form).getByLabelText(/^Where it runs/)).not.toBeNull();
    expect(advanced).not.toContainElement(within(form).getByLabelText(/^Model ID/));
  });

  it('has no axe violations', async () => {
    mock();
    await renderApp('/models');
    await screen.findByText('No model servers yet');
    await expectNoAxeViolations();
  });
});

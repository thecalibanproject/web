import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { getWorkspace } from '@/lib/workspace';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [
  { id: 't1', name: 'Cedar Bank', created_at: '2026-10-01T10:00:00Z' },
  { id: 't2', name: 'Hadad Law', created_at: '2026-10-02T10:00:00Z' },
];

const waiting = (run: string) => ({
  run_id: run,
  node: 'support-desk',
  version: 1,
  step: 'refund#0',
  kind: 'approval',
  waiting_since: '2026-10-13T08:00:00Z',
  approval: { tool: 'mcp://bank/refund#sha256:ab', effect: 'write', labels: ['caller'] },
});

function mock() {
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/usage': () => ({ body: { events: [], totals: { requests: 0 } } }),
    // Something waits in the second workspace only: the badge still counts it.
    'GET /api/v1/tenants/t1/inbox': () => ({
      body: { object: 'list', content_visible: true, data: [] },
    }),
    'GET /api/v1/tenants/t2/inbox': () => ({
      body: { object: 'list', content_visible: true, data: [waiting('run_a'), waiting('run_b')] },
    }),
  });
}

describe('App shell', () => {
  it('groups the navigation into daily work and administration', async () => {
    mock();
    await renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    for (const name of ['Home', 'Approvals', 'Assistants', 'Conversations', 'Knowledge']) {
      expect(within(nav).getByRole('link', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    const admin = within(nav).getByRole('button', { name: 'Administration' });
    expect(admin).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'href',
      '/tenants',
    );
    await userEvent.click(admin);
    expect(within(nav).queryByRole('link', { name: 'Workspaces' })).not.toBeInTheDocument();
  });

  it('counts approvals waiting in every workspace', async () => {
    mock();
    await renderApp('/');
    expect(await screen.findByRole('link', { name: /2 waiting for you/ })).toHaveAttribute(
      'href',
      '/inbox',
    );
  });

  it('switches the workspace in the header, and a ?tenant= link switches it too', async () => {
    mock();
    await renderApp('/inbox?tenant=t2');
    const select = await screen.findByRole('combobox', { name: 'Workspace' });
    await waitFor(() => expect(select).toHaveValue('t2'));
    expect(getWorkspace()).toBe('t2');
    await userEvent.selectOptions(select, 't1');
    expect(getWorkspace()).toBe('t1');
  });

  it('opens the command palette with Ctrl+K and finds a page by its old name', async () => {
    mock();
    const { router } = await renderApp('/');
    await screen.findByRole('navigation', { name: 'Primary' });
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: /Search pages/ });
    await userEvent.type(input, 'tenant');
    const options = within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Workspaces');
    expect(options[0]).toHaveTextContent('also called tenants');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/tenants'));
  });

  it('opens a conversation by its id from the palette', async () => {
    mock();
    const { router } = await renderApp('/');
    await screen.findByRole('combobox', { name: 'Workspace' });
    await userEvent.click(screen.getByRole('button', { name: /Search or jump to/ }));
    await userEvent.type(
      await screen.findByRole('combobox', { name: /Search pages/ }),
      'run_01abc123',
    );
    const first = within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole(
      'option',
    )[0];
    expect(first).toHaveTextContent('Open conversation run_01abc123');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/runs/t1/run_01abc123'));
  });

  it('has a reduce motion switch that applies at once and is remembered', async () => {
    mock();
    await renderApp('/');
    const toggle = await screen.findByRole('switch', { name: 'Reduce motion' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduce');
    expect(window.localStorage.getItem('caliban.motion')).toBe('reduce');
    await userEvent.click(toggle);
    expect(document.documentElement).not.toHaveAttribute('data-motion');
  });

  it('has a help panel for the page, in the same place on every page', async () => {
    mock();
    await renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Help' }));
    const dialog = await screen.findByRole('dialog', { name: 'Help: Home' });
    expect(within(dialog).getByRole('link', { name: /Where to begin/ })).toHaveAttribute(
      'href',
      '/docs/start/',
    );
  });

  it('has no axe violations', async () => {
    mock();
    await renderApp('/');
    await screen.findByRole('navigation', { name: 'Primary' });
    await screen.findByRole('link', { name: /2 waiting for you/ });
    await expectNoAxeViolations();
  });
});

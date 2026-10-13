import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RoleBinding, RoleBindingList, Tenant, User } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderApp } from '@/test/utils';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
};

const grace: User = {
  id: 'usr_grace',
  issuer: 'https://idp.example.internal/realms/caliban',
  subject: 'grace',
  email: 'grace@example.internal',
  name: 'Grace Hopper',
  created_at: '2026-10-02T10:00:00Z',
  last_login_at: '2026-10-09T10:00:00Z',
  role_bindings: [],
  active_sessions: 2,
};

const ownerBinding: RoleBinding = {
  id: 'rb_owner',
  subject_kind: 'user',
  subject: 'usr_grace',
  role: 'owner',
  tenant_id: null,
  created_at: '2026-10-03T10:00:00Z',
  created_by: 'break_glass',
};

const groupBinding: RoleBinding = {
  id: 'rb_devs',
  subject_kind: 'group',
  subject: 'acme-developers',
  role: 'developer',
  tenant_id: 'acme',
  created_at: '2026-10-04T10:00:00Z',
  created_by: 'grace@example.internal <https://idp.example.internal/realms/caliban#grace>',
};

function routes(roles: Grant[], list: Partial<RoleBindingList> = {}) {
  let bindings = [ownerBinding, groupBinding];
  const state = { bindings };
  return {
    state,
    routes: {
      ...ssoRoutes(meWith(roles)),
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/users': () => ({ body: [grace] }),
      'GET /api/v1/role-bindings': () => ({
        body: {
          bindings,
          group_mappings: [{ group: 'caliban-owners', role: 'owner', source: 'config' }],
          groups_claim: 'groups',
          ...list,
        },
      }),
      'POST /api/v1/role-bindings': (c: { body: unknown }) => {
        const b: RoleBinding = {
          ...(c.body as RoleBinding),
          id: 'rb_new',
          created_at: '2026-10-10T10:00:00Z',
          created_by: 'ada',
        };
        bindings = [...bindings, b];
        state.bindings = bindings;
        return { status: 201, body: b };
      },
      'DELETE /api/v1/role-bindings/rb_owner': () => {
        bindings = bindings.filter((b) => b.id !== 'rb_owner');
        state.bindings = bindings;
        return { status: 204 };
      },
      'DELETE /api/v1/role-bindings/rb_devs': () => {
        bindings = bindings.filter((b) => b.id !== 'rb_devs');
        state.bindings = bindings;
        return { status: 204 };
      },
    },
  };
}

describe('People and roles page', () => {
  it('has no axe violations', async () => {
    mockApi(routes([{ role: 'admin' }]).routes);
    await renderApp('/users', { token: null });
    await screen.findByRole('table', { name: 'Role bindings' });
    await expectNoAxeViolations();
  });

  it('lists bindings, the config group mappings read-only, and users', async () => {
    mockApi(routes([{ role: 'admin' }]).routes);
    await renderApp('/users', { token: null });

    const table = await screen.findByRole('table', { name: 'Role bindings' });
    const ownerRow = within(table).getByText('Grace Hopper').closest('tr')!;
    expect(within(ownerRow).getByText('Owner')).toBeInTheDocument();
    expect(within(ownerRow).getByText('Whole installation')).toBeInTheDocument();
    // Admins cannot revoke the owner role.
    expect(within(ownerRow).getByText('Owners only')).toBeInTheDocument();
    expect(within(ownerRow).queryByRole('button')).not.toBeInTheDocument();

    const groupRow = within(table).getByText('acme-developers').closest('tr')!;
    expect(within(groupRow).getByText('Group')).toBeInTheDocument();
    expect(within(groupRow).getByText('Developer')).toBeInTheDocument();
    expect(within(groupRow).getByText('Acme')).toBeInTheDocument();
    expect(within(groupRow).getByRole('button', { name: /Revoke Developer/ })).toBeInTheDocument();

    const mappings = screen.getByRole('table', { name: 'Group mappings' });
    expect(within(mappings).getByText('caliban-owners')).toBeInTheDocument();
    expect(within(mappings).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only here/)).toBeInTheDocument();

    const users = screen.getByRole('table', { name: 'Users' });
    expect(within(users).getByText('Grace Hopper')).toBeInTheDocument();
    expect(
      within(users).getByRole('button', { name: 'Sign out Grace Hopper everywhere' }),
    ).toBeInTheDocument();
  });

  it('grants a tenant role to a user, with the CSRF token', async () => {
    const { routes: r } = routes([{ role: 'admin' }]);
    const calls = mockApi(r);
    const user = userEvent.setup();
    await renderApp('/users', { token: null });

    await user.click(await screen.findByRole('button', { name: 'Grant role' }));
    const form = await screen.findByRole('form', { name: 'Grant a role' });
    // Only owners grant the owner role.
    expect(within(form).getByRole('option', { name: /^Owner/ })).toBeDisabled();
    // Deployment roles take no tenant.
    await user.selectOptions(within(form).getByLabelText(/^Role/), 'admin');
    expect(within(form).queryByLabelText(/^Workspace/)).not.toBeInTheDocument();

    await user.selectOptions(within(form).getByLabelText(/^User/), 'usr_grace');
    await user.selectOptions(within(form).getByLabelText(/^Role/), 'developer');
    const submit = within(form).getByRole('button', { name: 'Grant role' });
    // A tenant role needs its tenant.
    expect(submit).toBeDisabled();
    await user.selectOptions(await within(form).findByLabelText(/^Workspace/), 'acme');
    await user.click(submit);

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/api/v1/role-bindings');
    expect(post.body).toEqual({
      subject_kind: 'user',
      subject: 'usr_grace',
      role: 'developer',
      tenant_id: 'acme',
    });
    expect(post.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Grant a role' })).not.toBeInTheDocument(),
    );
  });

  it('grants a deployment role to an identity provider group', async () => {
    const calls = mockApi(routes([{ role: 'owner' }]).routes);
    const user = userEvent.setup();
    await renderApp('/users', { token: null });

    await user.click(await screen.findByRole('button', { name: 'Grant role' }));
    const form = await screen.findByRole('form', { name: 'Grant a role' });
    await user.selectOptions(within(form).getByLabelText(/^Grant to/), 'group');
    expect(within(form).getByText(/in the/)).toHaveTextContent('groups');
    await user.type(within(form).getByLabelText(/^Group/), ' caliban-auditors ');
    await user.selectOptions(within(form).getByLabelText(/^Role/), 'auditor');
    await user.click(within(form).getByRole('button', { name: 'Grant role' }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        subject_kind: 'group',
        subject: 'caliban-auditors',
        role: 'auditor',
      }),
    );
  });

  it('an owner revokes the owner role after confirming', async () => {
    const calls = mockApi(routes([{ role: 'owner' }]).routes);
    const user = userEvent.setup();
    await renderApp('/users', { token: null });

    const table = await screen.findByRole('table', { name: 'Role bindings' });
    await user.click(within(table).getByRole('button', { name: 'Revoke Owner from usr_grace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke role?' });
    expect(dialog).toHaveTextContent('Revoke Owner from grace@example.internal?');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke role' }));

    await waitFor(() => expect(within(table).queryByText('Grace Hopper')).not.toBeInTheDocument());
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.path).toBe('/api/v1/role-bindings/rb_owner');
    expect(del.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
  });

  it('an auditor can look but not change anything', async () => {
    mockApi(routes([{ role: 'auditor' }]).routes);
    await renderApp('/users', { token: null });

    const table = await screen.findByRole('table', { name: 'Role bindings' });
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant role' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign out Grace Hopper everywhere' }),
    ).not.toBeInTheDocument();
  });

  it('says when single sign-on is not configured', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/users': () => ({ body: [] }),
      'GET /api/v1/role-bindings': () => ({
        body: { bindings: [], group_mappings: [], groups_claim: null },
      }),
    });
    await renderApp('/users');

    expect(await screen.findByText('Single sign-on is not set up')).toBeInTheDocument();
    expect(screen.getByText('No roles granted here yet')).toBeInTheDocument();
    expect(screen.getByText('No people yet')).toBeInTheDocument();
  });

  it('a tenant role holder is told their role does not allow the page', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 'acme' }])),
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/users': () => ({
        status: 403,
        body: {
          error: { message: "permission 'rbac.read' is required", type: 'permission_error' },
        },
      }),
      'GET /api/v1/role-bindings': () => ({
        status: 403,
        body: {
          error: { message: "permission 'rbac.read' is required", type: 'permission_error' },
        },
      }),
    });
    await renderApp('/users', { token: null });

    expect((await screen.findAllByText('Your role does not allow this')).length).toBeGreaterThan(0);
  });
});

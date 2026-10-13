import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Ontology, OntologyElement } from '@/api/types';
import { meWith, ssoRoutes } from '@/test/auth';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];
const service: OntologyElement = {
  id: 'Service',
  kind: 'entity',
  name: 'Service',
  status: 'proposed',
  provenance: 'introspect',
  confidence: 0.6,
  changed_in: 3,
};

function ontology(elements: OntologyElement[], version = 3): Ontology {
  return { tenant_id: 't1', version, elements };
}

describe('OntologyPage', () => {
  it('names the tenant when it reviews one element', async () => {
    let elements = [service];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology(elements) }),
      'POST /api/v1/ontology/elements/Service/review': () => {
        elements = [{ ...service, status: 'approved', changed_in: 4 }];
        return { body: elements[0] };
      },
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    await user.click(await screen.findByRole('button', { name: 'Approve Service' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Approve Service' })).not.toBeInTheDocument(),
    );
    const review = calls.find((c) => c.method === 'POST');
    expect(review?.body).toEqual({ tenant_id: 't1', decision: 'approve' });
  });

  it('reads the dictionary of the header workspace, which every read names', async () => {
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology([service]) }),
    });
    await renderApp('/ontology');
    expect(await screen.findByRole('button', { name: 'Approve Service' })).toBeInTheDocument();
    const reads = calls.filter((c) => c.path === '/api/v1/ontology');
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((c) => c.query.get('tenant_id') === 't1')).toBe(true);
  });

  it('shows the node versions a withdrawal breaks, and goes ahead only when acknowledged', async () => {
    const city: OntologyElement = {
      id: 'Service.city',
      kind: 'attribute',
      name: 'city',
      status: 'approved',
      provenance: 'introspect',
      changed_in: 2,
    };
    let elements = [city];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology(elements) }),
      'POST /api/v1/ontology/elements/Service.city/review': (c) => {
        if (!(c.body as { acknowledge_breaking?: boolean }).acknowledge_breaking) {
          return {
            status: 409,
            body: {
              error: {
                message:
                  'these decisions break published node versions that query the elements; publish versions written on the new ontology, or send acknowledge_breaking: true: Service.city (approved -> deprecated): triage@v3, desk@v1',
                type: 'conflict',
                code: 'ontology_breaking_change',
                breaking: [
                  {
                    element: 'Service.city',
                    change: 'approved -> deprecated',
                    nodes: ['triage@v3', 'desk@v1'],
                    versions: [
                      { node: 'triage', version: 3 },
                      { node: 'desk', version: 1 },
                    ],
                  },
                ],
              },
            },
          };
        }
        elements = [{ ...city, status: 'deprecated', changed_in: 4 }];
        return { body: { ...elements[0], version: 4 } };
      },
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    await user.click(await screen.findByRole('button', { name: /^city/ }));
    const drawer = await screen.findByRole('dialog', { name: 'city' });
    expect(within(drawer).getByText('Version 2')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Withdraw city' }));

    const conflict = await within(drawer).findByRole('region', { name: 'Breaking change' });
    expect(within(conflict).getByRole('link', { name: 'triage@v3' })).toHaveAttribute(
      'href',
      '/nodes/t1/triage?version=3',
    );
    expect(within(conflict).getByRole('link', { name: 'desk@v1' })).toBeInTheDocument();
    expect(conflict).toHaveTextContent('approved -> deprecated');
    const anyway = within(conflict).getByRole('button', { name: 'Withdraw city anyway' });
    expect(anyway).toBeDisabled();

    await user.click(within(conflict).getByRole('checkbox'));
    await user.click(anyway);

    await waitFor(() => expect(within(drawer).getByText('Version 4')).toBeInTheDocument());
    expect(within(drawer).getByText('Withdrawn')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { tenant_id: 't1', decision: 'deprecate' },
      { tenant_id: 't1', decision: 'deprecate', acknowledge_breaking: true },
    ]);
  });

  it('proposes elements made elsewhere, as one version', async () => {
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology([]) }),
      'POST /api/v1/tenants/t1/ontology/proposals': () => ({
        status: 201,
        body: { tenant_id: 't1', version: 4, proposed: 1, skipped: 1, breaking: [] },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    await user.click(await screen.findByRole('button', { name: 'Import entries' }));
    const drawer = await screen.findByRole('dialog', { name: 'Import entries' });
    const box = within(drawer).getByRole('textbox', { name: 'Entries (JSON)' });
    await user.click(box);
    await user.paste('[{"id": "Clinic", "kind": "entity"}]');
    await user.click(within(drawer).getByRole('button', { name: 'Import' }));
    expect(within(drawer).getByText('Element 1 has no name.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await user.clear(box);
    await user.paste(
      '{"elements": [{"id": "Clinic", "kind": "entity", "name": "Clinic"}, {"id": "Visit", "kind": "entity", "name": "Visit", "provenance": "llm"}]}',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Import' }));

    expect(await within(drawer).findByRole('status')).toHaveTextContent(
      'Added 1 suggestion in version 4.',
    );
    expect(drawer).toHaveTextContent(
      'Skipped: 1 entry is unchanged, so it keeps its review decisions.',
    );
    expect(
      within(drawer).queryByRole('region', { name: 'Acknowledged breaking changes' }),
    ).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      elements: [
        { id: 'Clinic', kind: 'entity', name: 'Clinic', provenance: 'human' },
        { id: 'Visit', kind: 'entity', name: 'Visit', provenance: 'llm' },
      ],
    });
  });

  it('proposes over an approved element only when the breaking change is acknowledged', async () => {
    const breaking = [
      {
        element: 'Service',
        change: 'approved -> proposed',
        nodes: ['triage@v3'],
        versions: [{ node: 'triage', version: 3 }],
      },
    ];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology([{ ...service, status: 'approved' }]) }),
      'POST /api/v1/tenants/t1/ontology/proposals': (c) =>
        (c.body as { acknowledge_breaking?: boolean }).acknowledge_breaking
          ? {
              status: 201,
              body: { tenant_id: 't1', version: 5, proposed: 1, skipped: 2, breaking },
            }
          : {
              status: 409,
              body: {
                error: {
                  message: 'proposing over approved elements withdraws them',
                  type: 'conflict',
                  code: 'ontology_breaking_change',
                  breaking,
                },
              },
            },
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    await user.click(await screen.findByRole('button', { name: 'Import entries' }));
    const drawer = await screen.findByRole('dialog', { name: 'Import entries' });
    await user.click(within(drawer).getByRole('textbox', { name: 'Entries (JSON)' }));
    await user.paste(
      '[{"id": "Service", "kind": "entity", "name": "Service", "description": "Changed"}]',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Import' }));

    const conflict = await within(drawer).findByRole('region', { name: 'Breaking change' });
    expect(within(conflict).getByRole('link', { name: 'triage@v3' })).toHaveAttribute(
      'href',
      '/nodes/t1/triage?version=3',
    );
    await user.click(within(conflict).getByRole('checkbox'));
    await user.click(within(conflict).getByRole('button', { name: 'Import anyway' }));

    expect(await within(drawer).findByRole('status')).toHaveTextContent(
      'Added 1 suggestion in version 5.',
    );
    expect(drawer).toHaveTextContent('Skipped: 2 entries are unchanged');
    const acknowledged = within(drawer).getByRole('region', {
      name: 'Acknowledged breaking changes',
    });
    expect(acknowledged).toHaveTextContent('Service (approved -> proposed) is used by triage@v3');
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { elements: [expect.objectContaining({ id: 'Service' })] },
      { elements: [expect.objectContaining({ id: 'Service' })], acknowledge_breaking: true },
    ]);
  });

  it('a viewer browses the ontology and cannot review or propose', async () => {
    const calls = mockApi({
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 't1' }])),
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({
        body: ontology([service, { ...service, id: 'Visit', name: 'Visit', status: 'approved' }]),
      }),
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1', { token: null });

    const propose = await screen.findByRole('button', { name: 'Import entries' });
    expect(propose).toHaveAccessibleDescription(/needs ontology\.review/);
    expect(screen.queryByRole('button', { name: 'Approve Service' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Visit/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Visit' });
    await user.click(within(drawer).getByRole('button', { name: 'Withdraw Visit' }));
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  const suggestion = (id: string, confidence: number | null): OntologyElement => ({
    id,
    kind: 'attribute',
    name: id,
    status: 'proposed',
    provenance: 'introspect',
    confidence,
  });

  it('approves every suggestion above a confidence in one batch, after saying how many', async () => {
    let elements = [
      suggestion('a', 0.97),
      suggestion('b', 0.92),
      suggestion('c', 0.85),
      suggestion('d', null),
    ];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology(elements) }),
      'POST /api/v1/tenants/t1/ontology/review': () => {
        elements = elements.map((e) =>
          e.id === 'a' || e.id === 'b' ? { ...e, status: 'approved' } : e,
        );
        return { body: { tenant_id: 't1', version: 4, elements: [] } };
      },
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    await user.click(
      await screen.findByRole('button', { name: 'Approve 2 suggestions at or above 90%' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Approve 2 suggestions?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve 2' }));

    expect(await screen.findByText('Approved 2 suggestions in one step.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      decisions: [
        { id: 'b', decision: 'approve' },
        { id: 'a', decision: 'approve' },
      ],
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Confidence at least' }), '0.8');
    expect(
      screen.getByRole('button', { name: 'Approve 1 suggestion at or above 80%' }),
    ).toBeInTheDocument();
  });

  it('reviews the queue with the keyboard: J and K move, A approves, R rejects', async () => {
    let elements = [suggestion('first', 0.5), suggestion('second', 0.6)];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology(elements) }),
      'POST /api/v1/ontology/elements/second/review': (c) => {
        const decision = (c.body as { decision: string }).decision;
        elements = elements.map((e) =>
          e.id === 'second'
            ? { ...e, status: decision === 'approve' ? 'approved' : 'rejected' }
            : e,
        );
        return { body: elements[1] };
      },
      'POST /api/v1/ontology/elements/first/review': () => {
        elements = elements.map((e) => (e.id === 'first' ? { ...e, status: 'rejected' } : e));
        return { body: elements[0] };
      },
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    const queue = await screen.findByRole('list', { name: 'Review queue' });
    within(queue).getByRole('button', { name: 'first' }).focus();
    await user.keyboard('j');
    expect(within(queue).getByRole('button', { name: 'second' })).toHaveFocus();
    await user.keyboard('a');
    expect(await screen.findByText('Approved second.')).toBeInTheDocument();

    within(queue).getByRole('button', { name: 'first' }).focus();
    await user.keyboard('r');
    const dialog = await screen.findByRole('dialog', { name: 'Reject first?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected first.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body])).toEqual([
      ['/api/v1/ontology/elements/second/review', { tenant_id: 't1', decision: 'approve' }],
      ['/api/v1/ontology/elements/first/review', { tenant_id: 't1', decision: 'reject' }],
    ]);
  });

  it('keeps letter keys for typing outside the queue', async () => {
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({ body: ontology([suggestion('first', 0.5)]) }),
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');
    await screen.findByRole('list', { name: 'Review queue' });
    await user.keyboard('a');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('hides rejected entries until asked, and counts what is in use', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({
        body: ontology([
          { ...service, status: 'approved' },
          { ...service, id: 'Old', name: 'Old', status: 'rejected' },
        ]),
      }),
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');
    expect(await screen.findByText('1 in use · 0 to review · 1 rejected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Old/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 1 rejected' }));
    expect(screen.getByRole('button', { name: /^Old/ })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/ontology': () => ({
        body: ontology([service, { ...service, id: 'Visit', name: 'Visit', status: 'approved' }]),
      }),
    });
    await renderApp('/ontology?tenant=t1');
    await screen.findByRole('list', { name: 'Review queue' });
    await expectNoAxeViolations();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Ontology, OntologyElement } from '@/api/types';
import { meWith, ssoRoutes } from '@/test/auth';
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
    await user.click(within(drawer).getByRole('button', { name: 'Deprecate city' }));

    const conflict = await within(drawer).findByRole('region', { name: 'Breaking change' });
    expect(within(conflict).getByRole('link', { name: 'triage@v3' })).toHaveAttribute(
      'href',
      '/nodes/t1/triage?version=3',
    );
    expect(within(conflict).getByRole('link', { name: 'desk@v1' })).toBeInTheDocument();
    expect(conflict).toHaveTextContent('approved -> deprecated');
    const anyway = within(conflict).getByRole('button', { name: 'Deprecate city anyway' });
    expect(anyway).toBeDisabled();

    await user.click(within(conflict).getByRole('checkbox'));
    await user.click(anyway);

    await waitFor(() => expect(within(drawer).getByText('Version 4')).toBeInTheDocument());
    expect(within(drawer).getByText('deprecated')).toBeInTheDocument();
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
        body: { tenant_id: 't1', version: 4, proposed: 1, skipped: 1 },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/ontology?tenant=t1');

    await user.click(await screen.findByRole('button', { name: 'Propose elements' }));
    const drawer = await screen.findByRole('dialog', { name: 'Propose elements' });
    const box = within(drawer).getByRole('textbox', { name: 'Elements (JSON)' });
    await user.click(box);
    await user.paste('[{"id": "Clinic", "kind": "entity"}]');
    await user.click(within(drawer).getByRole('button', { name: 'Propose' }));
    expect(within(drawer).getByText('Element 1 has no name.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await user.clear(box);
    await user.paste(
      '{"elements": [{"id": "Clinic", "kind": "entity", "name": "Clinic"}, {"id": "Visit", "kind": "entity", "name": "Visit", "provenance": "llm"}]}',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Propose' }));

    expect(await within(drawer).findByRole('status')).toHaveTextContent(
      'Wrote 1 proposal in version 4. 1 unchanged skipped.',
    );
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      elements: [
        { id: 'Clinic', kind: 'entity', name: 'Clinic', status: 'proposed', provenance: 'human' },
        { id: 'Visit', kind: 'entity', name: 'Visit', status: 'proposed', provenance: 'llm' },
      ],
    });
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

    const propose = await screen.findByRole('button', { name: 'Propose elements' });
    expect(propose).toHaveAccessibleDescription(/needs ontology\.review/);
    expect(screen.queryByRole('button', { name: 'Approve Service' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Visit/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Visit' });
    await user.click(within(drawer).getByRole('button', { name: 'Deprecate Visit' }));
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

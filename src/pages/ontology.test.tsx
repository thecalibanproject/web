import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Ontology, OntologyElement } from '@/api/types';
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
});

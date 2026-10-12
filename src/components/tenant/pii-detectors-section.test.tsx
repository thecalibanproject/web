import { useQuery } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { tenantQuery } from '@/api/queries';
import type { Tenant } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { PiiDetectorsSection } from './pii-detectors-section';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
  pii_patterns: [{ label: 'MRN', pattern: 'MRN-\\d{6}' }],
  pii_dictionary: [{ term: 'Northwind Clinic', label: 'ORG' }],
};

function FromQuery() {
  const tenant = useQuery(tenantQuery('acme'));
  return tenant.data ? <PiiDetectorsSection tenant={tenant.data} /> : null;
}

describe('PiiDetectorsSection', () => {
  it('edits the patterns and the dictionary, and sends only the list that changed', async () => {
    let current = acme;
    const calls = mockApi({
      'GET /api/v1/tenants/acme': () => ({ body: current }),
      'PATCH /api/v1/tenants/acme': (c) => {
        current = { ...current, ...(c.body as Partial<Tenant>) };
        return { body: current };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    const section = await screen.findByRole('region', { name: 'Personal data detectors' });
    const q = within(section);
    expect(q.getByLabelText('Pattern 1')).toHaveValue('MRN-\\d{6}');
    const dictionary = q.getByLabelText('Dictionary');
    expect(dictionary).toHaveValue('ORG: Northwind Clinic');

    await user.type(dictionary, '{Enter}Northwind');
    expect(q.getByText(/Line 2: write it as LABEL: term/)).toBeInTheDocument();
    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(dictionary);
    await user.click(dictionary);
    await user.paste('ORG: Northwind Clinic\nLOCATION: Building C\nLOCATION: building c');
    await user.click(q.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(q.getByRole('status')).toHaveTextContent('Detectors saved.'));
    expect(dictionary).toHaveValue('ORG: Northwind Clinic\nLOCATION: Building C');

    await user.click(q.getByRole('button', { name: 'Add pattern' }));
    await user.click(q.getByRole('button', { name: 'Save' }));
    expect(q.getByText('Label: Use 1 to 40 letters, digits or underscores.')).toBeInTheDocument();
    await user.type(q.getByLabelText('Label of pattern 2'), 'STAFF_ID');
    await user.click(q.getByLabelText('Pattern 2'));
    await user.paste('K-\\d{4}');
    await user.click(q.getByRole('button', { name: 'Remove pattern 1' }));
    await user.click(q.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(q.getByLabelText('Pattern 1')).toHaveValue('K-\\d{4}'));
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
      {
        pii_dictionary: [
          { term: 'Northwind Clinic', label: 'ORG' },
          { term: 'Building C', label: 'LOCATION' },
        ],
      },
      { pii_patterns: [{ label: 'STAFF_ID', pattern: 'K-\\d{4}' }] },
    ]);
  });

  it('is read only without tenant.write', () => {
    renderWithClient(<PiiDetectorsSection tenant={acme} readOnly />);
    const section = screen.getByRole('region', { name: 'Personal data detectors' });
    expect(section).toHaveTextContent('Read only: your role cannot change these detectors.');
    expect(within(section).getByLabelText('Dictionary')).toBeDisabled();
    expect(within(section).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Add pattern' })).not.toBeInTheDocument();
  });
});

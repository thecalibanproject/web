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

  it('writes labels upper-cased, so labels that differ only in case are one', async () => {
    let current: Tenant = {
      ...acme,
      pii_patterns: [{ label: 'mrn', pattern: 'MRN-\\d{6}' }],
      pii_dictionary: [
        { term: 'Northwind Clinic', label: 'org' },
        { term: 'northwind clinic', label: 'ORG' },
      ],
    };
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
    expect(q.getByLabelText('Label of pattern 1')).toHaveValue('MRN');
    expect(q.getByLabelText('Dictionary')).toHaveValue('ORG: Northwind Clinic');
    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(q.getByRole('button', { name: 'Add pattern' }));
    await user.type(q.getByLabelText('Label of pattern 2'), 'phone');
    expect(q.getByLabelText('Label of pattern 2')).toHaveValue('PHONE');
    await user.click(q.getByLabelText('Pattern 2'));
    await user.paste('\\+961 \\d+');
    const dictionary = q.getByLabelText('Dictionary');
    await user.click(dictionary);
    await user.paste('\nstaff_id: K-1207\nSTAFF_ID: k-1207');
    await user.click(q.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(q.getByRole('status')).toHaveTextContent('Detectors saved.'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      pii_patterns: [
        { label: 'MRN', pattern: 'MRN-\\d{6}' },
        { label: 'PHONE', pattern: '\\+961 \\d+' },
      ],
      pii_dictionary: [
        { term: 'Northwind Clinic', label: 'ORG' },
        { term: 'K-1207', label: 'STAFF_ID' },
      ],
    });
  });

  it('shows only the sizes without tenant.write, which gets no lists', () => {
    const { pii_patterns: _p, pii_dictionary: _d, ...rest } = acme;
    renderWithClient(
      <PiiDetectorsSection
        tenant={{ ...rest, pii_patterns_count: 12, pii_dictionary_count: 340 }}
        readOnly
      />,
    );
    const section = screen.getByRole('region', { name: 'Personal data detectors' });
    expect(section).toHaveTextContent('Read only: your role cannot see or change these detectors.');
    expect(section).toHaveTextContent('12 patterns, 340 terms');
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers no editor when the lists did not come, so a save cannot replace them', () => {
    const { pii_patterns: _p, pii_dictionary: _d, ...rest } = acme;
    renderWithClient(
      <PiiDetectorsSection tenant={{ ...rest, pii_patterns_count: 1, pii_dictionary_count: 1 }} />,
    );
    const section = screen.getByRole('region', { name: 'Personal data detectors' });
    expect(section).toHaveTextContent('1 pattern, 1 term');
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
  });
});

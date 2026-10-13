import { describe, expect, it } from 'vitest';
import type { ConsoleRun } from '@/api/types';
import {
  argRows,
  normalise,
  parseToolRef,
  provenance,
  provenanceText,
  whyApproval,
} from './approvalArgs';

const step = (
  id: string,
  kind: string,
  output: unknown,
  labels: string[] = [],
): ConsoleRun['steps'][number] => ({
  id,
  vertex: id.split('#')[0]!,
  kind,
  status: 'completed',
  tokens: 0,
  usd: 0,
  labels,
  started_at: '2026-10-13T08:00:00Z',
  duration_ms: 10,
  output,
});

const run: Pick<ConsoleRun, 'input' | 'steps'> = {
  input: {
    signed_in_customer: 'CUS-0042',
    message: 'Refund TX-30005 to FR65 1273 9000 0100 0123 4567 842 please',
  },
  steps: [
    step(
      'accounts#0',
      'tool',
      [{ customer: 'CUS-0042', iban: 'FR7612739000010001234567890' }],
      ['datasource'],
    ),
    step('decide#0', 'llm', { amount: 12.99, iban: 'FR6512739000010001234567842' }),
  ],
};

describe('parseToolRef', () => {
  it('reads action, system and pin from an MCP reference', () => {
    expect(parseToolRef('mcp://bank-ops/issue_refund#sha256:2031')).toEqual({
      tool: 'issue_refund',
      system: 'bank-ops',
      pin: 'sha256:2031',
    });
  });
  it('reads built-in and sub-assistant references, and missing ones', () => {
    expect(parseToolRef('builtin://rag_search').tool).toBe('rag_search');
    expect(parseToolRef('node://risk@v2').tool).toBe('risk@v2');
    expect(parseToolRef(undefined).tool).toBe('an action');
  });
});

describe('whyApproval', () => {
  it('says what the action does and where its details came from', () => {
    expect(whyApproval('write', ['caller', 'pii'])).toBe(
      "It changes something in another system, and its details came from the customer's message (includes personal data).",
    );
    expect(whyApproval('read, reaches the network through its arguments', ['retrieved'])).toBe(
      'It sends data out of Caliban, and its details came from a document.',
    );
  });
});

describe('argRows', () => {
  it('lists arguments as rows, nested objects indented, never JSON', () => {
    expect(argRows({ amount: 12.99, to: { iban: 'FR76', ok: true }, tags: ['a'] })).toEqual([
      { key: 'amount', depth: 0, value: '12.99' },
      { key: 'to', depth: 0, value: null },
      { key: 'iban', depth: 1, value: 'FR76' },
      { key: 'ok', depth: 1, value: 'yes' },
      { key: 'tags', depth: 0, value: null },
      { key: '1', depth: 1, value: 'a' },
    ]);
  });
});

describe('provenance', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(normalise('FR76 1273-9000')).toBe(normalise('fr7612739000'));
  });

  it('finds a value in the account on file, from an earlier lookup', () => {
    const p = provenance('FR76 1273 9000 0100 0123 4567 890', run);
    expect(p).toEqual({ kind: 'on-file', step: 'accounts#0' });
    expect(provenanceText(p)).toBe('Matches the account on file (step accounts#0)');
  });

  it("flags an IBAN that only the customer's message holds, with or without spaces", () => {
    expect(provenance('FR6512739000010001234567842', run)).toEqual({ kind: 'customer-only' });
    expect(provenanceText({ kind: 'customer-only' })).toBe("Only in the customer's message");
  });

  it('says when a value is nowhere in the conversation, and stays quiet on short values', () => {
    expect(provenance('DE89370400440532013000', run)).toEqual({ kind: 'not-found' });
    expect(provenance('yes', run)).toEqual({ kind: 'unknown' });
    expect(provenanceText({ kind: 'unknown' })).toBeNull();
  });

  it('does not count a model step as the account on file', () => {
    // The model's own output repeats the customer's IBAN: that is not the database.
    expect(provenance('FR65 1273 9000 0100 0123 4567 842', run).kind).toBe('customer-only');
  });
});

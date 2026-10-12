import { describe, expect, it } from 'vitest';
import { exemplarsError, intentNameError, parseExemplars, routeNode } from './intents';

describe('intentNameError', () => {
  it('takes the names the control plane takes', () => {
    expect(intentNameError('chest_pain')).toBeNull();
    expect(intentNameError('billing.refund-2')).toBeNull();
    expect(intentNameError('Chest pain')).toMatch(/lowercase/);
    expect(intentNameError('')).toMatch(/lowercase/);
    expect(intentNameError('a'.repeat(65))).toMatch(/lowercase/);
    expect(intentNameError('pinned')).toBe('"pinned" is reserved.');
  });
});

describe('parseExemplars', () => {
  it('keeps one exemplar per line, trimmed, without blanks or repeats', () => {
    expect(parseExemplars('  my chest hurts \n\n I feel faint\nmy chest hurts\n')).toEqual([
      'my chest hurts',
      'I feel faint',
    ]);
    expect(parseExemplars('\n \n')).toEqual([]);
  });
});

describe('exemplarsError', () => {
  it('enforces the counts and lengths', () => {
    expect(exemplarsError([])).toBeNull();
    expect(exemplarsError(['x'.repeat(2000)])).toBeNull();
    expect(exemplarsError(['ok', 'x'.repeat(2001)])).toBe(
      'Exemplar 2 is longer than 2000 characters.',
    );
    expect(exemplarsError(Array.from({ length: 201 }, (_, i) => `e${i}`))).toBe(
      'At most 200 exemplars per intent.',
    );
  });
});

describe('routeNode', () => {
  it('reads the node name of a node route', () => {
    expect(routeNode('node/triage')).toBe('triage');
    expect(routeNode('node/triage@v3')).toBe('triage');
    expect(routeNode('node/triage@published')).toBe('triage');
    expect(routeNode('model:local/qwen3')).toBeNull();
  });
});

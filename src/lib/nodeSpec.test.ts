import { describe, expect, it } from 'vitest';
import { checkNodeSpec, NODE_SPEC_TEMPLATE } from './nodeSpec';

const text = (v: unknown) => JSON.stringify(v);

describe('checkNodeSpec (node.schema.json via ajv)', () => {
  it('accepts the editor template', () => {
    const r = checkNodeSpec(text(NODE_SPEC_TEMPLATE));
    expect(r.ok).toBe(true);
  });

  it('reports JSON syntax errors separately from schema issues', () => {
    const r = checkNodeSpec('{ "kind": ');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.parseError).toBeTruthy();
      expect(r.issues).toEqual([]);
    }
  });

  it('flags a missing required budgets block', () => {
    const { budgets: _omit, ...spec } = NODE_SPEC_TEMPLATE;
    const r = checkNodeSpec(text(spec));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toContainEqual({
        path: '/',
        message: 'missing required property "budgets"',
      });
    }
  });

  it('enforces tool ref patterns, budget bounds and unknown properties', () => {
    const r = checkNodeSpec(
      text({
        ...NODE_SPEC_TEMPLATE,
        tools: [{ ref: 'https://evil.example/tool', effect: 'write' }],
        budgets: { steps: 0, tokens: 100, wall_clock_s: 10 },
        surprise: true,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.issues.map((i) => i.path);
      expect(paths).toContain('/tools/0/ref');
      expect(paths).toContain('/budgets/steps');
      expect(r.issues).toContainEqual({ path: '/', message: 'unknown property "surprise"' });
    }
  });
});

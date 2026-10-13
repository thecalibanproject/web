import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core (bundled, no network) on a rendered page and fails with the
 * violations listed. jsdom has no layout, so rules that need it are off:
 * colour contrast is checked on the tokens instead (DESIGN.md), and region
 * landmarks are the app shell's job, tested with the whole console.
 */
export async function expectNoAxeViolations(node: Element = document.body) {
  const results = await axe.run(node, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
    resultTypes: ['violations'],
  });
  const lines = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n  ${v.nodes
        .slice(0, 3)
        .map((n) => n.html)
        .join('\n  ')}`,
  );
  expect(lines, lines.join('\n')).toEqual([]);
}

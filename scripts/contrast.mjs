import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme'));
const dark = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('@theme inline'));
function luminance(hex) {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
const pairs = [
  ['Body', 'fg', 'bg', 4.5],
  ['Secondary', 'fg-muted', 'surface', 4.5],
  ['Muted, deepest light/dark well', 'fg-subtle', 'surface-3', 4.5],
  ['Link on panel', 'accent', 'surface', 4.5],
  ['Link on well', 'accent', 'surface-3', 4.5],
  ['Primary label', 'accent-fg', 'accent', 4.5],
  ['Primary hover label', 'accent-fg', 'accent-hover', 4.5],
  ['Passed badge', 'ok', 'ok-soft', 4.5],
  ['Waiting badge', 'warn', 'warn-soft', 4.5],
  ['Error badge', 'danger', 'danger-soft', 4.5],
  ['Control border on panel', 'border-strong', 'surface', 3],
  ['Control border on well', 'border-strong', 'surface-3', 3],
  ['Focus on panel', 'ring', 'surface', 3],
];
const themes = [light, dark].map((block) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[A-Fa-f0-9]{6});/g)].map((m) => [m[1], m[2]]),
  ),
);
const rows = pairs.map(([label, fg, bg, minimum]) => {
  const ratios = themes.map((theme) => contrast(theme[fg], theme[bg]));
  if (ratios.some((ratio) => ratio < minimum)) throw new Error(`${label}: fails ${minimum}:1`);
  return `| ${label} | ${ratios[0].toFixed(2)}:1 | ${ratios[1].toFixed(2)}:1 | ${minimum}:1 |`;
});
const rail = contrast('#A9BEDF', '#040B1C');
const table = [
  '| Pair | Light | Dark | Minimum |',
  '| --- | --- | --- | --- |',
  ...rows,
  `| Rail secondary text | ${rail.toFixed(2)}:1 | ${rail.toFixed(2)}:1 | 4.5:1 |`,
].join('\n');
writeFileSync(
  'docs/redesign/contrast.md',
  `# Computed contrast\n\n${table}\n\nReproduce with \`node scripts/contrast.mjs\`. Decorative rules are not control boundaries.\n`,
);
console.log(table);

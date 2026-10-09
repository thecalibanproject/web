// Copies the JSON schemas the console validates against from the sibling
// `core/` repo into `src/schemas/`. The copy is committed so `web/` builds on
// its own (air-gapped CI, no sibling checkout); re-run after core changes.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreSchemas = resolve(root, '../core/schemas');
const out = resolve(root, 'src/schemas');
const files = ['node.schema.json'];

if (!existsSync(coreSchemas)) {
  console.error(`core schemas not found at ${coreSchemas}`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const f of files) {
  copyFileSync(resolve(coreSchemas, f), resolve(out, f));
  console.log(`synced ${f}`);
}

/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { BANNED_IN_BASIC_COPY } from '@/lib/glossary';

/**
 * Copy lint (research note 10, section 5): the words people read in the
 * console's basic views use the glossary's plain terms. Internal names (CQIR,
 * kNN, taint, pass^k, vertex, surrogate, tenant, node, intent, ...) and em or
 * en dashes fail this test when they appear in visible copy.
 *
 * Checked: JSX text, string literals rendered as JSX children, the copy props
 * of components (label, description, hint, ...), and the UI strings of the
 * data modules (glossary labels and definitions, page help, navigation,
 * labels.ts). Allowed: anything inside an Advanced section, a code or JSON
 * view, a toggletip ("also called"), and native `title` tooltips.
 */
// Vitest runs from the package root (jsdom gives import.meta.url an http scheme).
const SRC = resolve(process.cwd(), 'src');

const COPY_ATTRS = new Set([
  'label',
  'title',
  'description',
  'hint',
  'placeholder',
  'aria-label',
  'confirmLabel',
  'summary',
  'error',
  'detail',
  'value',
]);

/** Elements whose content may name internals for experts. */
const ALLOWED_TAGS = new Set([
  'Advanced',
  'code',
  'pre',
  'kbd',
  'CodeBlock',
  'Toggletip',
  'TermTip',
]);

/** Data modules: the property names whose string values are UI copy. */
const DATA_MODULES: Record<string, Set<string> | 'all-values'> = {
  'lib/glossary.ts': new Set(['label', 'definition']),
  'lib/pageHelp.ts': new Set(['title', 'purpose', 'label']),
  'components/layout/nav.ts': new Set(['label']),
  'lib/labels.ts': 'all-values',
};

/**
 * Files whose copy has not been moved to the glossary's terms yet. Shrinks to
 * empty: remove a file here when its copy is migrated.
 */
const PENDING = new Set<string>([
  'components/auto-margin-card.tsx',
  'components/models/catalogue-panel.tsx',
  'components/models/model-form.tsx',
  'components/models/server-form.tsx',
  'components/models/servers-panel.tsx',
  'components/node-cost-card.tsx',
  'components/nodes/node-behavior.tsx',
  'components/nodes/node-scopes.tsx',
  'components/purpose-cost-card.tsx',
  'components/rag/collection-documents.tsx',
  'components/rag/create-collection-form.tsx',
  'components/rag/document-review.tsx',
  'components/route-counts-card.tsx',
  'components/tenant-select.tsx',
  'components/tenant/api-keys-panel.tsx',
  'components/tenant/delete-tenant-section.tsx',
  'components/tenant/intents-panel.tsx',
  'components/tenant/key-access-fields.tsx',
  'components/tenant/node-limits-section.tsx',
  'components/tenant/pii-detectors-section.tsx',
  'components/tenant/provider-keys-panel.tsx',
  'components/tenant/tenant-deleted-state.tsx',
  'components/tenant/tenant-settings-section.tsx',
  'components/tools/register-server-form.tsx',
  'components/tools/server-tools.tsx',
  'components/tools/tool-review.tsx',
  'components/usage-table.tsx',
  'lib/labels.ts',
  'pages/audit.tsx',
  'pages/inbox.tsx',
  'pages/models.tsx',
  'pages/rag.tsx',
  'pages/run-detail.tsx',
  'pages/runs.tsx',
  'pages/settings.tsx',
  'pages/tenant-detail.tsx',
  'pages/tenants.tsx',
  'pages/tools.tsx',
  'pages/usage.tsx',
  'pages/users.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

interface Hit {
  where: string;
  text: string;
}

function tagName(n: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tag = ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName;
  return tag.getText();
}

function insideAllowed(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if ((ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) && ALLOWED_TAGS.has(tagName(p))) {
      return true;
    }
  }
  return false;
}

/** A string that is data or a key, not copy: call arguments, comparisons, keys. */
function isNotCopy(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p) || ts.isJsxExpression(p) || ts.isJsxElement(p)) {
      // Reached the JSX boundary without passing through a call or comparison.
      if (ts.isJsxExpression(p) || ts.isJsxAttribute(p)) return false;
    }
    if (ts.isCallExpression(p) || ts.isElementAccessExpression(p)) return true;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
      const op = p.operatorToken.kind;
      if (op !== ts.SyntaxKind.QuestionQuestionToken && op !== ts.SyntaxKind.BarBarToken)
        return true;
    }
    if (
      ts.isConditionalExpression(p) &&
      p.condition.pos <= node.pos &&
      node.end <= p.condition.end
    ) {
      return true;
    }
  }
  return false;
}

function textOf(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) {
    return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
  }
  return null;
}

function lintTsx(file: string): Hit[] {
  const text = readFileSync(file, 'utf8');
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return lintParsed(src, relative(SRC, file));
}

function lintData(rel: string, props: Set<string> | 'all-values'): Hit[] {
  const file = join(SRC, rel);
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n)) {
      const key = n.name.getText().replace(/['"]/g, '');
      const t = textOf(n.initializer);
      if (t !== null && (props === 'all-values' || props.has(key))) {
        const { line } = src.getLineAndCharacterOfPosition(n.getStart());
        hits.push({ where: `${rel}:${line + 1}`, text: t });
      }
    }
    // g('Label', 'definition', ...) in the glossary.
    if (ts.isCallExpression(n) && n.expression.getText() === 'g') {
      for (const a of n.arguments.slice(0, 2)) {
        const t = textOf(a);
        const { line } = src.getLineAndCharacterOfPosition(a.getStart());
        if (t !== null) hits.push({ where: `${rel}:${line + 1}`, text: t });
      }
    }
    if (
      rel === 'lib/pageHelp.ts' &&
      ts.isArrayLiteralExpression(n) &&
      ts.isPropertyAssignment(n.parent) &&
      n.parent.name.getText() === 'tasks'
    ) {
      for (const e of n.elements) {
        const t = textOf(e);
        const { line } = src.getLineAndCharacterOfPosition(e.getStart());
        if (t !== null) hits.push({ where: `${rel}:${line + 1}`, text: t });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return hits;
}

function violations(hits: Hit[]): string[] {
  return hits
    .filter((h) => BANNED_IN_BASIC_COPY.some((re) => re.test(h.text)))
    .map((h) => `${h.where}: ${JSON.stringify(h.text)}`);
}

describe('copy lint', () => {
  it('keeps internal jargon and dashes out of basic UI copy', () => {
    const hits = walk(SRC).flatMap(lintTsx);
    for (const [rel, props] of Object.entries(DATA_MODULES)) hits.push(...lintData(rel, props));
    const bad = violations(hits.filter((h) => !PENDING.has(h.where.replace(/:\d+$/, ''))));
    expect(bad, `Use the glossary's plain terms:\n${bad.join('\n')}`).toEqual([]);
  });

  it('catches jargon in JSX text and copy props, and allows it in Advanced and code', () => {
    const sample = 'sample.tsx';
    const text = `
      export const A = () => (
        <div>
          <p>Pick a tenant</p>
          <Field label="Node limits" />
          <Advanced><p>Surrogate scope</p></Advanced>
          <code>node://x@v1</code>
          <span title="also called CQIR">Query plan</span>
          {ok ? 'Meets the bar' : 'Fails the promotion bar'}
        </div>
      );
    `;
    const src = ts.createSourceFile(sample, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const hits = lintParsed(src, 'sample.tsx');
    expect(violations(hits).map((v) => v.replace(/^.*?: /, ''))).toEqual([
      '"Pick a tenant"',
      '"Node limits"',
      '"Fails the promotion bar"',
    ]);
  });
});

function lintParsed(src: ts.SourceFile, file: string): Hit[] {
  const hits: Hit[] = [];
  const add = (n: ts.Node, text: string) => {
    if (insideAllowed(n)) return;
    const { line } = src.getLineAndCharacterOfPosition(n.getStart());
    hits.push({ where: `${file}:${line + 1}`, text: text.trim() });
  };
  const visitCopyExpr = (n: ts.Node) => {
    const t = textOf(n);
    if (t !== null) {
      if (!isNotCopy(n)) add(n, t);
      return;
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return;
    ts.forEachChild(n, visitCopyExpr);
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) {
      if (n.text.trim()) add(n, n.text);
    } else if (ts.isJsxExpression(n) && n.expression && !ts.isJsxAttribute(n.parent)) {
      visitCopyExpr(n.expression);
    } else if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      const el = n.parent.parent;
      const intrinsic = /^[a-z]/.test(tagName(el as ts.JsxSelfClosingElement));
      const isCopy = COPY_ATTRS.has(name) && !(intrinsic && (name === 'title' || name === 'value'));
      if (isCopy && n.initializer) {
        if (ts.isStringLiteral(n.initializer)) add(n.initializer, n.initializer.text);
        else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) {
          visitCopyExpr(n.initializer.expression);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return hits;
}

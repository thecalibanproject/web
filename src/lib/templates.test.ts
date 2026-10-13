import { describe, expect, it } from 'vitest';
import { checkNodeSpec } from './nodeSpec';
import { BLANK_TEMPLATE, defaultValues, fillTemplate, missingFields, TEMPLATES } from './templates';

const SAMPLE: Record<string, string> = {
  org: 'Example Clinic',
  languages: 'English or French',
  scopes: 'clinic.services:read, clinic.slots:read',
  library: 'handbook',
  refund_tool: 'mcp://bank/refund#sha256:' + 'a'.repeat(64),
  billing: 'billing-agent@v2',
  bug: 'bug-triage@v1',
  docs: 'docs-helper@v3',
};

describe('assistant templates', () => {
  it('offers the four demo scenarios and a blank start', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'triage-and-booking',
      'questions-on-documents',
      'support-desk',
      'router-to-specialists',
      'blank',
    ]);
    expect(BLANK_TEMPLATE.fields).toEqual([]);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s is a valid spec once filled in',
    (_id, t) => {
      const spec = fillTemplate(t, { ...defaultValues(t), ...SAMPLE });
      const check = checkNodeSpec(JSON.stringify(spec));
      expect(check.ok ? [] : check.issues).toEqual([]);
      // Every field placeholder is gone; run-time references stay.
      expect(JSON.stringify(spec)).not.toMatch(
        /\{\{(org|languages|scopes|library|refund_tool|billing|bug|docs)\}\}/,
      );
    },
  );

  it('carries no customer names from the demos', () => {
    const text = JSON.stringify(TEMPLATES);
    for (const name of ['Cedar', 'Hadad', 'Acme', 'StreamBox', '__CHAT_MODEL__', 'neobank']) {
      expect(text).not.toContain(name);
    }
  });

  it('fills strings only, expands lists, keeps run-time references and drops empty tools', () => {
    const t = TEMPLATES.find((x) => x.id === 'support-desk')!;
    const spec = fillTemplate(t, {
      ...defaultValues(t),
      org: 'A "quoted" Co',
      scopes: 'a.b:read, c.d:read',
    });
    expect((spec.prompt as { system: string }).system).toContain('A "quoted" Co');
    expect((spec.datasources as { scopes: string[] }).scopes).toEqual(['a.b:read', 'c.d:read']);
    // The refund action was left empty: its tool entry is dropped, not left blank.
    expect((spec.tools as Array<{ ref: string }>).map((x) => x.ref)).toEqual([
      'builtin://datasource_query',
    ]);
    const router = TEMPLATES.find((x) => x.id === 'router-to-specialists')!;
    expect(JSON.stringify(fillTemplate(router, SAMPLE))).toContain('{{input.message}}');
  });

  it('lists the fields still empty', () => {
    const t = TEMPLATES.find((x) => x.id === 'questions-on-documents')!;
    expect(missingFields(t, defaultValues(t))).toEqual([
      "Your organization's name",
      'Document library',
    ]);
  });
});

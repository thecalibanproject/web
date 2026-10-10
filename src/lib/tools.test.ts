import { describe, expect, it } from 'vitest';
import type { ToolManifest } from '@/api/types';
import { manifestRows, parseManifests, revealHidden, toolRef } from './tools';

const m = (over: Partial<ToolManifest>): ToolManifest => ({
  id: 'm',
  server: 'crm',
  name: 'find',
  description: 'Finds a customer.',
  input_schema: {},
  pin: 'sha256:aaaa',
  findings: [],
  status: 'discovered',
  discovered_at: '2026-10-01T10:00:00Z',
  ...over,
});

describe('manifestRows', () => {
  it('flags a tool the server changed after it was approved', () => {
    const rows = manifestRows([
      m({ id: 'old', status: 'approved', pin: 'sha256:old' }),
      m({ id: 'new', pin: 'sha256:new', discovered_at: '2026-10-05T10:00:00Z' }),
      m({ id: 'other', name: 'create', status: 'approved' }),
    ]);
    const by = (id: string) => rows.find((r) => r.manifest.id === id)!;
    expect(rows.map((r) => r.manifest.id)).toEqual(['other', 'new', 'old']);
    expect(by('new')).toMatchObject({ reapproval: true, superseded: false });
    expect(by('old')).toMatchObject({ reapproval: false, superseded: true });
    expect(by('other')).toMatchObject({ reapproval: false, superseded: false });
  });

  it('no longer asks for re-approval once the new manifest is approved', () => {
    const rows = manifestRows([
      m({ id: 'old', status: 'approved', pin: 'sha256:old' }),
      m({ id: 'new', status: 'approved', discovered_at: '2026-10-05T10:00:00Z' }),
    ]);
    expect(rows.some((r) => r.reapproval)).toBe(false);
    expect(rows.find((r) => r.manifest.id === 'old')?.superseded).toBe(true);
  });
});

describe('revealHidden', () => {
  it('shows zero-width, bidirectional and tag characters', () => {
    const zw = String.fromCodePoint(0x200b);
    const rlo = String.fromCodePoint(0x202e);
    const tag = String.fromCodePoint(0xe0041);
    expect(revealHidden(`a${zw}b${rlo}c${tag}`)).toBe('a⟦U+200B⟧b⟦U+202E⟧c⟦U+E0041⟧');
    expect(revealHidden('plain text')).toBe('plain text');
  });
});

describe('parseManifests', () => {
  it('accepts {manifests: [...]} or a bare array', () => {
    const one = { name: 'find', description: 'd', input_schema: { type: 'object' } };
    expect(parseManifests(JSON.stringify({ manifests: [one] }))).toEqual({
      ok: true,
      body: { manifests: [one] },
    });
    expect(parseManifests(JSON.stringify([one])).ok).toBe(true);
  });

  it('says what is wrong', () => {
    expect(parseManifests('{')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^Invalid JSON/),
    });
    expect(parseManifests('{"manifests": []}')).toMatchObject({ ok: false });
    expect(parseManifests('[{"name": "x", "description": "d"}]')).toEqual({
      ok: false,
      error: 'Manifest 1 (x): "input_schema" must be an object.',
    });
  });
});

it('builds the reference node specs pin', () => {
  expect(toolRef('crm', 'find', 'sha256:ab')).toBe('mcp://crm/find#sha256:ab');
});

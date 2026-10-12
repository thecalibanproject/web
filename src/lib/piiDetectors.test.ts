import { describe, expect, it } from 'vitest';
import { formatDictionary, parseDictionary, patternError, sameList } from './piiDetectors';

describe('parseDictionary', () => {
  it('reads LABEL: term lines, splitting on the first colon', () => {
    expect(parseDictionary('ORG: Northwind Clinic\n\n  STAFF_ID :  K-12:7 \n')).toEqual({
      ok: true,
      terms: [
        { term: 'Northwind Clinic', label: 'ORG' },
        { term: 'K-12:7', label: 'STAFF_ID' },
      ],
    });
  });

  it('drops repeats, ignoring case, and round-trips', () => {
    const parsed = parseDictionary('ORG: Northwind\nORG: northwind\nLOCATION: Northwind');
    expect(parsed).toEqual({
      ok: true,
      terms: [
        { term: 'Northwind', label: 'ORG' },
        { term: 'Northwind', label: 'LOCATION' },
      ],
    });
    if (parsed.ok)
      expect(formatDictionary(parsed.terms)).toBe('ORG: Northwind\nLOCATION: Northwind');
  });

  it('names the line it cannot read', () => {
    expect(parseDictionary('ORG: ok\nNorthwind')).toEqual({
      ok: false,
      error: 'Line 2: write it as LABEL: term, such as ORG: Northwind.',
    });
    expect(parseDictionary('BAD LABEL: x y')).toMatchObject({ ok: false });
    expect(parseDictionary('ORG: x')).toEqual({
      ok: false,
      error: 'Line 1: a term is 2 to 200 characters.',
    });
  });
});

describe('patternError', () => {
  it('checks the label and the length, not the regex syntax', () => {
    expect(patternError({ label: 'MRN', pattern: 'MRN-\\d{6}' })).toBeNull();
    expect(patternError({ label: 'MRN', pattern: '(?i)mrn-\\d+' })).toBeNull();
    expect(patternError({ label: 'mrn id', pattern: 'x' })).toMatch(/^Label:/);
    expect(patternError({ label: 'MRN', pattern: '' })).toBe('Enter a pattern.');
    expect(patternError({ label: 'MRN', pattern: 'x'.repeat(501) })).toMatch(/at most 500/);
  });
});

describe('sameList', () => {
  it('compares entries in order', () => {
    const a = [{ label: 'A', pattern: 'a' }];
    expect(sameList(a, [{ label: 'A', pattern: 'a' }])).toBe(true);
    expect(sameList(a, [{ label: 'A', pattern: 'b' }])).toBe(false);
    expect(sameList(a, [])).toBe(false);
  });
});

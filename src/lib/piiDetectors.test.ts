import { describe, expect, it } from 'vitest';
import {
  detectorCounts,
  formatDictionary,
  normalizePatterns,
  normalizeTerms,
  parseDictionary,
  patternError,
  sameList,
} from './piiDetectors';

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

describe('labels', () => {
  it('are upper-cased, so labels that differ only in case are one', () => {
    expect(parseDictionary('org: Northwind\nORG: northwind\nOrg: Southwind')).toEqual({
      ok: true,
      terms: [
        { term: 'Northwind', label: 'ORG' },
        { term: 'Southwind', label: 'ORG' },
      ],
    });
    expect(normalizePatterns([{ label: 'phone', pattern: '\\d+' }])).toEqual([
      { label: 'PHONE', pattern: '\\d+' },
    ]);
    expect(
      normalizeTerms([
        { term: 'Building C', label: 'location' },
        { term: 'building c', label: 'LOCATION' },
      ]),
    ).toEqual([{ term: 'Building C', label: 'LOCATION' }]);
  });
});

describe('detectorCounts', () => {
  it('says how many patterns and terms', () => {
    expect(detectorCounts(12, 340)).toBe('12 patterns, 340 terms');
    expect(detectorCounts(1, 1)).toBe('1 pattern, 1 term');
    expect(detectorCounts(0, 2500)).toBe('0 patterns, 2,500 terms');
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

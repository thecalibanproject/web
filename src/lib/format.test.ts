import { describe, expect, it } from 'vitest';
import { formatUsd, isNegativeUsd, roundUsd } from './format';

describe('formatUsd', () => {
  it('shows two digits, or four for sub-cent amounts', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0.0019)).toBe('$0.0019');
    expect(formatUsd(-0.002)).toBe('-$0.0020');
    expect(formatUsd(-1.5)).toBe('-$1.50');
  });

  it('shows negative zero as $0.00', () => {
    // The control plane sends -0.0 for a total over no priced events.
    expect(formatUsd(-0)).toBe('$0.00');
    expect(formatUsd(JSON.parse('-0.0') as number)).toBe('$0.00');
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('shows any amount that rounds to zero as $0.00, whatever its sign', () => {
    expect(formatUsd(-1e-12)).toBe('$0.00');
    expect(formatUsd(1e-12)).toBe('$0.00');
    expect(formatUsd(-0.00004)).toBe('$0.00');
    expect(formatUsd(0.00004)).toBe('$0.00');
    // Float noise from a difference that should be exactly zero.
    expect(formatUsd(0.1 + 0.2 - 0.3 - 1e-16 * 3)).toBe('$0.00');
    expect(formatUsd(0.3 - (0.1 + 0.2))).toBe('$0.00');
  });

  it('switches to two digits when a sub-cent amount rounds up to a cent', () => {
    expect(formatUsd(0.009999)).toBe('$0.01');
    expect(formatUsd(-0.009999)).toBe('-$0.01');
  });

  it('shows a dash for missing or non-finite values', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(undefined)).toBe('—');
    expect(formatUsd(Number.NaN)).toBe('—');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('roundUsd', () => {
  it('returns +0 for anything that rounds to zero', () => {
    expect(Object.is(roundUsd(-0), 0)).toBe(true);
    expect(Object.is(roundUsd(-1e-9), 0)).toBe(true);
    expect(roundUsd(-0.0021)).toBe(-0.0021);
    expect(roundUsd(2.345678)).toBe(2.35);
  });
});

describe('isNegativeUsd', () => {
  it('is true only when the formatted amount is negative', () => {
    expect(isNegativeUsd(-0.002)).toBe(true);
    expect(isNegativeUsd(-3)).toBe(true);
    expect(isNegativeUsd(-0)).toBe(false);
    expect(isNegativeUsd(-1e-12)).toBe(false);
    expect(isNegativeUsd(0)).toBe(false);
    expect(isNegativeUsd(0.5)).toBe(false);
    expect(isNegativeUsd(null)).toBe(false);
    expect(isNegativeUsd(undefined)).toBe(false);
    expect(isNegativeUsd(Number.NaN)).toBe(false);
  });
});

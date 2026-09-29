import { describe, expect, it } from 'vitest';
import { formattedProbability, scoreLevels, scorePosition } from './response-distribution';

describe('score distribution levels', () => {
  it('retains rubric levels with no probability and all returned metadata levels', () => {
    expect(scoreLevels(
      { type: 'score', instructions: 'Rate the state', criteria: ['Low', 'Medium', 'High'] },
      { type: 'score', legend: { '0': 'Low', '4': 'Additional level' }, probabilities: { '2': .7, '3': .3 } },
    )).toEqual(['0', '1', '2', '3', '4']);
  });

  it('unions partial legend and probability keys, sorts numerically, and ignores invalid keys', () => {
    expect(scoreLevels(undefined, {
      type: 'score', legend: { '10': 'High', '0': 'Low', invalid: 'Invalid' },
      probabilities: { '2': .5, '10': .5, '': 0, ' ': 0, Infinity: 0 },
    })).toEqual(['0', '2', '10']);
    expect(scoreLevels()).toEqual([]);
  });
});

describe('expected score position', () => {
  it('interpolates fractional scores and preserves both endpoints including zero', () => {
    const levels = ['0', '1', '2', '3', '4', '5'];
    expect(scorePosition(2.99, levels)).toBeCloseTo(2.99 / 5);
    expect(scorePosition(0, levels)).toBe(0);
    expect(scorePosition(5, levels)).toBe(1);
  });

  it('interpolates within adjacent numeric gaps on equally spaced rendered rows', () => {
    const levels = ['0', '2', '5'];
    expect(scorePosition(1, levels)).toBe(.25);
    expect(scorePosition(2, levels)).toBe(.5);
    expect(scorePosition(3.5, levels)).toBe(.75);
    expect(scorePosition(5, levels)).toBe(1);
  });

  it('does not invent or clamp markers for missing, invalid, or out-of-range scores', () => {
    for (const value of [undefined, null, NaN, Infinity, '2', -1, 6]) {
      expect(scorePosition(value, ['0', '5'])).toBeNull();
    }
  });

  it('rejects empty, degenerate, invalid, or unordered level axes', () => {
    for (const levels of [[], ['0'], ['0', '0'], ['0', 'invalid'], ['0', ''], ['0', 'Infinity'], ['2', '0']]) {
      expect(scorePosition(0, levels)).toBeNull();
    }
  });
});

describe('probability formatting', () => {
  it('preserves true zero and certainty and formats small positive values', () => {
    expect(formattedProbability(0)).toBe('0%');
    expect(formattedProbability(1)).toBe('100%');
    expect(formattedProbability(.99)).toBe('99%');
    expect(formattedProbability(.005)).toBe('0.5%');
    expect(formattedProbability(.0005)).toBe('0.1%');
    expect(formattedProbability(.00049)).toBe('<0.1%');
    expect(formattedProbability(Number.MIN_VALUE)).toBe('<0.1%');
  });

  it('keeps absent and malformed values distinct from zero', () => {
    for (const value of [undefined, null, NaN, Infinity, -.1, 1.1, '0.5', false]) {
      expect(formattedProbability(value)).toBe('—');
    }
  });
});

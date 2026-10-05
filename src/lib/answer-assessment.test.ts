import { describe, expect, it } from 'vitest';
import { assessAnswer } from './answer-assessment';

describe('visual result assessment', () => {
  it('uses the Noul decision boundary including exactly 0.5', () => {
    expect(assessAnswer({ type: 'noul', noul: 0.5 }, undefined, true, true)).toEqual({ actual: true, status: 'Match' });
    expect(assessAnswer({ type: 'noul', noul: 0.2 }, undefined, true, true).status).toBe('Mismatch');
  });
  it('never coerces a mistyped expected label', () => {
    expect(assessAnswer({ type: 'noul', noul: 1 }, undefined, 'true', true).status).toBe('Invalid label');
  });
  it('compares arbitrary choice IDs exactly', () => {
    expect(assessAnswer({ type: 'choice', choice: 'custom_label' }, undefined, 'custom_label', true).status).toBe('Match');
  });
  it('compares the winning score level instead of the weighted score', () => {
    expect(assessAnswer({ type: 'score', score: 1.4, probabilities: { 0: 0.3, 2: 0.7 } }, undefined, 2, true)).toEqual({ actual: 2, status: 'Match' });
  });
  it('distinguishes unlabeled, missing, and invalid results', () => {
    expect(assessAnswer({ type: 'choice', choice: 'a' }, undefined, undefined, false).status).toBe('Unlabeled');
    expect(assessAnswer(undefined, { type: 'choice', instructions: '' }, 'a', true).status).toBe('Missing answer');
    expect(assessAnswer({ type: 'noul', noul: NaN }, undefined, false, true).status).toBe('Missing answer');
  });
});

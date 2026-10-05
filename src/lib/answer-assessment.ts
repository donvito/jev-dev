import { mostProbableLevel, type Answer, type Question } from './domain';

const probability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Compare decisions, not probability-weighted scores or string-coerced labels. */
export function assessAnswer(answer: Answer | undefined, question: Question | undefined, expected: unknown, hasExpected: boolean) {
  const type = answer?.type ?? question?.type;
  const actual = type === 'noul' ? (probability(answer?.noul) ? answer.noul >= 0.5 : undefined)
    : type === 'choice' ? (typeof answer?.choice === 'string' ? answer.choice : undefined)
    : type === 'score' && answer ? mostProbableLevel(answer) : undefined;
  const validLabel = type === 'noul' ? typeof expected === 'boolean'
    : type === 'choice' ? typeof expected === 'string'
    : type === 'score' ? typeof expected === 'number' && Number.isInteger(expected) && expected >= 0 : false;
  const status = !hasExpected ? 'Unlabeled' : !validLabel ? 'Invalid label'
    : actual === undefined ? 'Missing answer' : actual === expected ? 'Match' : 'Mismatch';
  return { actual, status };
}

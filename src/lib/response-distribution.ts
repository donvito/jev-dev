import type { Answer, Question } from './domain';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const numericLevel = (level: unknown): number | null => {
  if (typeof level !== 'string' || !level.trim()) return null;
  const value = Number(level);
  return Number.isFinite(value) ? value : null;
};

/** Keep request rubric levels and any additional levels preserved in the response. */
export function scoreLevels(question?: Question, answer?: Answer): string[] {
  const rubric = Array.isArray(question?.criteria) ? question.criteria.map((_: unknown, index: number) => String(index)) : [];
  const keys = new Set([...rubric, ...Object.keys(answer?.legend ?? {}), ...Object.keys(answer?.probabilities ?? {})]);
  return [...keys].filter((key) => numericLevel(key) !== null).sort((a, b) => Number(a) - Number(b));
}

/** Position between equally spaced row centers, interpolating across numeric gaps. */
export function scorePosition(score: unknown, levels: readonly string[]): number | null {
  if (!finite(score) || levels.length < 2) return null;
  const values = levels.map(numericLevel);
  if (values.some((value) => value === null)) return null;
  const numeric = values as number[];
  if (numeric.some((value, index) => index > 0 && value <= numeric[index - 1])) return null;
  if (score < numeric[0] || score > numeric[numeric.length - 1]) return null;
  if (score === numeric[0]) return 0;
  const upper = numeric.findIndex((value) => value >= score);
  const lower = upper - 1;
  return (lower + (score - numeric[lower]) / (numeric[upper] - numeric[lower])) / (numeric.length - 1);
}

/** Missing values stay unknown; very small positive probabilities never round to zero. */
export function formattedProbability(value: unknown): string {
  if (!finite(value) || value < 0 || value > 1) return '—';
  if (value > 0 && value < 0.0005) return '<0.1%';
  return `${(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%`;
}

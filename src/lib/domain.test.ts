import { describe, expect, it } from 'vitest';
import {
  answerValue, calculateMetrics, createSeedWorkspace, exportCode, generateDemoResponse,
  importDataset, lintQuestions, repeatability, thresholdMetrics, validateRequest,
  type EvaluationResult, type Request,
} from './domain';

const request: Request = {
  state: { text: 'A short example' }, model: 'jev-latest',
  questions: {
    urgent: { type: 'noul', instructions: 'Does the message convey urgency?' },
    route: { type: 'choice', instructions: 'Which department should receive this?', criteria: { sales: null, support: 'Technical support' } },
    rating: { type: 'score', instructions: 'Rate the severity of the problem.', criteria: ['Low', 'Medium', 'High'] },
  },
};

describe('request validation and question linting', () => {
  it('supports structured content and all three documented primitives', () => {
    expect(validateRequest(request)).toEqual([]);
    expect(validateRequest({ ...request, state: ['chat message'], questions: { q: { type: 'noul', instructions: { question: 'Is this urgent?', guidance: ['Use explicit evidence'] } } } })).toEqual([]);
  });
  it('rejects invalid criteria, state, missing instructions, and empty question sets', () => {
    expect(validateRequest({ ...request, state: false })).toContain('State must be text, a JSON object, or an array.');
    expect(validateRequest({ ...request, questions: {} })).toContain('Add at least one question.');
    expect(validateRequest({ ...request, questions: { q: { type: 'score', instructions: 'Rate this', criteria: ['One'] } } }).join()).toContain('2–10');
    expect(validateRequest({ ...request, questions: { q: { type: 'choice', instructions: 'Classify this', criteria: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [i, null])) } } }).join()).toContain('1–255');
    expect(validateRequest({ ...request, questions: { q: { type: 'noul', instructions: null } } }).join()).toContain('instructions');
  });
  it('offers advisory warnings for independent judgment and arithmetic', () => {
    const warnings = lintQuestions({ q: { type: 'noul', instructions: 'Does this candidate have backend experience and leadership potential?' }, sum: { type: 'noul', instructions: 'Calculate the total number of shipped projects.' } });
    expect(warnings.some((w) => w.questionId === 'q' && w.message.includes('two judgments'))).toBe(true);
    expect(warnings.some((w) => w.questionId === 'sum' && w.message.includes('arithmetic'))).toBe(true);
  });
});

describe('dataset import', () => {
  it.each(['jsonl', 'json'])('preserves text, object, and array states plus local expected labels in %s', (format) => {
    const input = [
      { id: 'text', state: 'A support request', expected: { urgent: true } },
      { id: 'object', state: { message: 'An example', model: 'customer product', questions: ['A context question'] }, expected: { category: 'support' } },
      { id: 'array', state: [{ role: 'user', content: 'An example' }, 'More context'], expected: { rating: 2 } },
    ];
    const text = format === 'json' ? JSON.stringify(input) : input.map((row) => JSON.stringify(row)).join('\n');
    expect(importDataset(text, `data.${format}`)).toEqual(input);
  });
  it.each([
    { model: 'jev-latest' },
    { questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } } },
    { model: 'jev-latest', questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } } },
  ])('rejects request configuration at the dataset row level: %j', (configuration) => {
    const row = { state: 'An example', expected: { urgent: true }, ...configuration };
    for (const [text, filename] of [[JSON.stringify(row), 'data.jsonl'], [JSON.stringify([row]), 'data.json']]) {
      expect(() => importDataset(text, filename)).toThrow('Choose shared questions and model in experiment setup.');
    }
  });
  it('rejects misplaced CSV request columns instead of discarding them', () => {
    for (const csv of ['state,model\nExample,jev-latest', 'state,questions\nExample,{}', 'state,model,questions\nExample,jev-latest,{}']) {
      expect(() => importDataset(csv, 'data.csv')).toThrow('Choose shared questions and model in experiment setup.');
    }
  });
  it('keeps questions/model CSV context and expected labels when they are not request configuration', () => {
    const prefixed = importDataset('state.questions,state.model,expected.questions,expected.model\nA context question,Product A,true,false', 'data.csv');
    expect(prefixed[0]).toMatchObject({ state: { questions: 'A context question', model: 'Product A' }, expected: { questions: true, model: false } });
    const fields = importDataset('questions,model\nA context question,Product A', 'data.csv');
    expect(fields[0].state).toEqual({ questions: 'A context question', model: 'Product A' });
  });
  it('imports JSONL with optional IDs, object state, and typed labels', () => {
    const rows = importDataset('\uFEFF{"id":"a","state":{"resume":"Example"},"expected":{"ok":true}}\n\n{"state":"Other","expected":{"score":2}}', 'golden.jsonl');
    expect(rows).toHaveLength(2);
    expect(rows[0].expected.ok).toBe(true);
    expect(rows[1].id).toBe('row_003');
    expect(rows[1].expected.score).toBe(2);
  });
  it('parses quoted multiline CSV, escaped quotes, commas, and CRLF', () => {
    const rows = importDataset('id,state,expected.ok,expected.route\r\na,"Line 1, with a comma\nLine 2 says ""hello""",true,support\r\nb,Plain,false,sales\r\n', 'golden.csv');
    expect(rows[0].state).toBe('Line 1, with a comma\nLine 2 says "hello"');
    expect(rows[0].expected).toEqual({ ok: true, route: 'support' });
    expect(rows[1].expected.ok).toBe(false);
  });
  it('accepts CSV JSON state and expected objects and named state fields', () => {
    const rows = importDataset('state,expected\n"{""resume"":""Example""}","{""rating"":2}"', 'data.csv');
    expect(rows[0]).toMatchObject({ state: { resume: 'Example' }, expected: { rating: 2 } });
    expect(importDataset('state.resume,years,expected.ok\nExample,4,true', 'data.csv')[0].state).toEqual({ resume: 'Example', years: 4 });
  });
  it('reports malformed or ambiguous data without silently dropping rows', () => {
    expect(() => importDataset('{bad}', 'data.jsonl')).toThrow('Line 1');
    expect(() => importDataset('state,expected\n"unclosed,{}', 'data.csv')).toThrow('unclosed');
    expect(() => importDataset('state,state\na,b', 'data.csv')).toThrow('unique');
    expect(() => importDataset('state,expected.ok\na,true,extra', 'data.csv')).toThrow('columns');
    expect(() => importDataset('{"id":"a","state":"x"}\n{"id":"a","state":"y"}', 'data.jsonl')).toThrow('Duplicate');
    expect(() => importDataset('state,expected\n', 'data.csv')).toThrow('no data rows');
  });
  it('imports JSON arrays and keeps arbitrary question IDs as own properties', () => {
    expect(importDataset('[{"state":"x","expected":{}}]', 'data.json')).toHaveLength(1);
    const imported = importDataset('state,expected.__proto__\nx,true', 'data.csv');
    expect(Object.hasOwn(imported[0].expected, '__proto__')).toBe(true);
  });
});

describe('metrics', () => {
  const results: EvaluationResult[] = [
    { row: { id: 'a', state: 'a', expected: { ok: true, route: 'sales', score: 2 } }, response: { model: 'test', answers: { ok: { type: 'noul', noul: 0.8 }, route: { type: 'choice', choice: 'support', probabilities: { sales: 0.3, support: 0.7 }, confidence: 0.6 }, score: { type: 'score', score: 1.8, probabilities: { '1': 0.2, '2': 0.8 }, confidence: 0.7 } } } },
    { row: { id: 'b', state: 'b', expected: { ok: false, route: 'support', score: 0 } }, response: { model: 'test', answers: { ok: { type: 'noul', noul: 0.7 }, route: { type: 'choice', choice: 'support', probabilities: { sales: 0.1, support: 0.9 }, confidence: 0.9 }, score: { type: 'score', score: 1.9, probabilities: { '0': 0.05, '2': 0.95 }, confidence: 0.8 } } } },
    { row: { id: 'c', state: 'c', expected: { ok: true } }, response: null },
  ];
  it('computes Noul classification and calibration while reporting failed labels separately', () => {
    const metrics = calculateMetrics(results), q = metrics.questions.find((q) => q.questionId === 'ok')!;
    expect(metrics).toMatchObject({ totalRows: 3, completedRows: 2, failedRows: 1 });
    expect(q).toMatchObject({ count: 2, missing: 1, accuracy: 0.5, precision: 0.5, recall: 1, meanConfidence: null });
    expect(q.brierScore).toBeCloseTo(0.265);
    expect(q.f1).toBeCloseTo(2 / 3);
  });
  it('retains confusion matrices, exact modal level accuracy, and weighted score error', () => {
    const metrics = calculateMetrics(results);
    expect(metrics.questions.find((q) => q.questionId === 'route')?.confusionMatrix).toEqual({ sales: { support: 1 }, support: { support: 1 } });
    const score = metrics.questions.find((q) => q.questionId === 'score')!;
    expect(score.accuracy).toBe(0.5);
    expect(score.mae).toBeCloseTo(1.05);
    expect(score.withinOne).toBe(0.5);
    expect(metrics.mistakes).toHaveLength(3);
  });
  it('returns unknown instead of invented accuracy for an empty evaluation', () => {
    expect(calculateMetrics([]).accuracy).toBeNull();
    expect(thresholdMetrics([], 0.2, 0.8)).toMatchObject({ accuracy: null, total: 0, coverage: 0 });
  });
  it('uses strict automatic thresholds and reviews both boundary values', () => {
    const metrics = thresholdMetrics([{ probability: 0.1, expected: false }, { probability: 0.2, expected: true }, { probability: 0.8, expected: false }, { probability: 0.9, expected: true }, { probability: 0.95, expected: false }], 0.2, 0.8);
    expect(metrics).toMatchObject({ automatic: 3, review: 2, coverage: 0.6, falseApprovals: 1, falseRejections: 0 });
    expect(metrics.accuracy).toBeCloseTo(2 / 3);
    expect(() => thresholdMetrics([], 0.9, 0.2)).toThrow('Thresholds');
    expect(() => thresholdMetrics([{ probability: NaN, expected: true }], 0.2, 0.8)).toThrow('probability');
  });
  it('computes population spread including constant and empty repetitions', () => {
    expect(repeatability([1, 2, 3])).toMatchObject({ count: 3, mean: 2, min: 1, max: 3 });
    expect(repeatability([1, 2, 3]).stdDev).toBeCloseTo(Math.sqrt(2 / 3));
    expect(repeatability([0.9, 0.9]).stdDev).toBe(0);
    expect(repeatability([]).mean).toBeNull();
    expect(() => repeatability([Infinity])).toThrow();
  });
});

describe('synthetic demo and exports', () => {
  it('generates all primitives with normalized distributions and explicit synthetic provenance', () => {
    const response = generateDemoResponse(request);
    expect(response).toEqual(generateDemoResponse(request));
    expect(response.model).toBe('synthetic-demo');
    expect(response.synthetic).toBe(true);
    expect(response.usage).toBeUndefined();
    expect(response.answers.urgent.confidence).toBeUndefined();
    expect(Object.keys(response.answers)).toEqual(Object.keys(request.questions));
    for (const answer of Object.values(response.answers)) if (answer.probabilities) expect(Object.values(answer.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(answerValue(response.answers.rating)).toBeTypeOf('number');
  });
  it('honors arbitrary IDs without interpreting them as hidden instructions', () => {
    const first = generateDemoResponse({ ...request, questions: { foo: request.questions.urgent } });
    const second = generateDemoResponse({ ...request, questions: { arbitrary_id: request.questions.urgent } });
    expect(first.answers.foo).toEqual(second.answers.arbitrary_id);
  });
  it('seeds fictional labeled examples with no fabricated API usage', () => {
    const workspace = createSeedWorkspace();
    expect(workspace.projects).toHaveLength(2);
    expect(workspace.datasets[0].rows).toHaveLength(12);
    expect(workspace.datasets[0].rows.every((row) => row.state.resume.includes('FICTIONAL'))).toBe(true);
    expect(workspace.runs[0]).toMatchObject({ source: 'demo', input_tokens: null, output_tokens: null });
    for (const session of workspace.sessions) expect(validateRequest({ state: session.state_json, model: session.requested_model, questions: session.questions_json })).toEqual([]);
  });
  it('exports real HTTP examples using environment credentials and matching threshold boundaries', () => {
    expect(JSON.parse(exportCode(request, 'json'))).toEqual(request);
    const policy = { questionId: 'urgent', low: 0.2, high: 0.8 };
    const ts = exportCode(request, 'typescript', policy);
    expect(ts).toContain('process.env.TYPESAFE_API_KEY');
    expect(ts).toContain("p < 0.2 ? 'no' : p > 0.8 ? 'yes' : 'review'");
    expect(exportCode(request, 'python')).toContain("os.environ['TYPESAFE_API_KEY']");
    expect(exportCode({ ...request, state: "customer's text" }, 'curl')).toContain("customer'\\''s text");
    expect(() => exportCode(request, 'json', { ...policy, questionId: 'route' })).toThrow('Noul');
  });
});

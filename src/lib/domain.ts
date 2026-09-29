/** Local workbench data and calculations. API contract: https://docs.typesafe.ai/api */
export type PrimitiveType = 'noul' | 'choice' | 'score';
export interface Question { type: PrimitiveType; instructions: any; criteria?: any }
export type Questions = Record<string, Question>;
export interface Request { state: any; model: string; questions: Questions }
export type EvaluationRequest = Request;
export interface Answer {
  type: PrimitiveType;
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, any>;
}
export interface TypeSafeResponse {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number; [key: string]: unknown };
  /** Workbench-only marker. Synthetic fixtures are never actual Jev evaluations. */
  synthetic?: boolean;
  [key: string]: unknown;
}
export interface Project { id: string; name: string; description: string; created_at: string }
export interface Session {
  id: string; project_id: string; name: string; state_json: any; questions_json: Questions;
  requested_model: string; version: number; created_at: string; updated_at: string;
}
export interface Run {
  id: string; session_id: string; project_id: string; name: string;
  request_json: Request; response_json: TypeSafeResponse | null;
  requested_model: string; resolved_model: string | null; latency_ms: number;
  input_tokens: number | null; output_tokens: number | null;
  status: 'success' | 'error'; error_json: any | null; created_at: string; source: 'live' | 'demo';
}
export interface DatasetRow { id: string; state: any; expected: Record<string, any> }
export interface Dataset { id: string; project_id: string; name: string; rows: DatasetRow[]; created_at: string }
export interface Workspace { projects: Project[]; sessions: Session[]; datasets: Dataset[]; runs: Run[] }
export interface QuestionWarning { questionId: string; message: string }
export interface ThresholdPolicy { questionId: string; low: number; high: number }

const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const content = (value: unknown): boolean => typeof value === 'string' || value !== null && typeof value === 'object';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const ratio = (numerator: number, denominator: number): number | null => denominator ? numerator / denominator : null;
const average = (values: number[]): number | null => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function validateRequest(value: unknown): string[] {
  const errors: string[] = [];
  if (!record(value)) return ['Request must be a JSON object.'];
  if (!content(value.state)) errors.push('State must be text, a JSON object, or an array.');
  if (typeof value.model !== 'string' || !value.model.trim()) errors.push('Choose a model.');
  if (!record(value.questions) || !Object.keys(value.questions).length) return [...errors, 'Add at least one question.'];
  for (const [id, question] of Object.entries(value.questions)) {
    if (!id.trim()) errors.push('Question IDs cannot be empty.');
    if (!record(question)) { errors.push(`${id}: question must be an object.`); continue; }
    if (!['noul', 'choice', 'score'].includes(question.type)) { errors.push(`${id}: choose Noul, Choice, or Score.`); continue; }
    if (!content(question.instructions) || typeof question.instructions === 'string' && !question.instructions.trim()) errors.push(`${id}: instructions must contain text, an object, or an array.`);
    if (question.type === 'choice') {
      if (!record(question.criteria)) errors.push(`${id}: Choice criteria must be an object mapping option IDs to descriptions.`);
      else {
        const entries = Object.entries(question.criteria);
        if (!entries.length || entries.length > 255) errors.push(`${id}: Choice needs 1–255 options.`);
        if (entries.some(([key, description]) => !key.trim() || description !== null && !content(description))) errors.push(`${id}: use nonempty option IDs and text, object, array, or null descriptions.`);
      }
    }
    if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10) errors.push(`${id}: Score needs an ordered array of 2–10 levels.`);
      else if (question.criteria.some((level: unknown) => !content(level))) errors.push(`${id}: each Score level must be text, an object, or an array.`);
    }
    if (question.type === 'noul' && question.criteria !== undefined) {
      if (!record(question.criteria) || Object.entries(question.criteria).some(([key, description]) => !['true', 'false'].includes(key) || !content(description))) errors.push(`${id}: Noul criteria may only describe true and false.`);
    }
  }
  try { JSON.stringify(value); } catch { errors.push('The request must be JSON serializable.'); }
  return errors;
}

/** Advisory heuristics, not model predictions or semantic guarantees. */
export function lintQuestions(questions: Questions, state?: any): QuestionWarning[] {
  const warnings: QuestionWarning[] = [];
  for (const [questionId, question] of Object.entries(questions)) {
    const instructions = typeof question?.instructions === 'string' ? question.instructions : JSON.stringify(question?.instructions ?? '');
    const add = (message: string) => warnings.push({ questionId, message });
    if (/\b(and|as well as)\b/i.test(instructions) && question.type === 'noul') add('This may combine two judgments. Consider one Noul question per decision.');
    if (/\b(calculate|sum|subtract|multiply|divide|count|how many|total number|average of)\b/i.test(instructions)) add('This appears to require arithmetic or counting. Calculate exact values in application code.');
    if (/\b(before|after|older than|newer than|more recent|earlier|later)\b.{0,45}\b(date|year|month|day|20\d\d)\b/i.test(instructions)) add('This may compare dates. Prefer comparing parsed dates in application code.');
    if (/\b(write|generate|rewrite|compose|summari[sz]e|draft)\b/i.test(instructions)) add('This may be a generation task. Jev is designed for structured judgments.');
    if (/\b(previous question|other question|answer above|as above)\b/i.test(instructions)) add('Questions are evaluated independently. Include all context needed by this question.');
    if (instructions.trim().length < 12) add('Give this question enough context to stand on its own. Question IDs are not used in inference.');
    if (state !== undefined && JSON.stringify(state).length > 24000) add('The state is large. Remove irrelevant fields to keep the judgment focused.');
  }
  return warnings;
}

/** RFC 4180-style parser supporting quoted commas, newlines, escaped quotes, CRLF and BOM. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => { finishField(); if (row.some((item) => item.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === '"') {
      if (field.length || closed) throw new Error('CSV contains a quote inside an unquoted field.');
      quoted = true;
    } else if (char === ',') finishField();
    else if (char === '\r' || char === '\n') { finishRow(); if (char === '\r' && text[i + 1] === '\n') i++; }
    else if (closed) { if (!/\s/.test(char)) throw new Error('CSV contains unexpected text after a closing quote.'); }
    else field += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (row.length || field.length || closed) finishRow();
  return rows;
}

function cellValue(value: string): any {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try { return JSON.parse(trimmed); } catch { return value; }
}

function checkedRow(value: unknown, index: number): DatasetRow {
  if (!record(value)) throw new Error(`Row ${index + 1}: expected a JSON object.`);
  const requestFields = ['questions', 'model'].filter((key) => Object.hasOwn(value, key));
  if (requestFields.length) throw new Error(`Row ${index + 1}: ${requestFields.join(' and ')} must not appear at the top level of a dataset row. Choose shared questions and model in experiment setup. Dataset rows contain state and optional id/expected; put context fields inside state.`);
  if (!content(value.state)) throw new Error(`Row ${index + 1}: state must be text, an object, or an array.`);
  if (value.expected !== undefined && !record(value.expected)) throw new Error(`Row ${index + 1}: expected must be an object keyed by question ID.`);
  return { id: value.id === undefined || value.id === '' ? `row_${String(index + 1).padStart(3, '0')}` : String(value.id), state: value.state, expected: value.expected ?? {} };
}

/** JSONL/JSON rows, or CSV with state + expected JSON / expected.<question_id> columns. */
export function importDataset(text: string, filename = 'dataset.jsonl'): DatasetRow[] {
  text = text.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('The dataset is empty.');
  let rows: DatasetRow[];
  if (/\.csv$/i.test(filename)) {
    const parsed = parseCsv(text);
    const headers = parsed.shift()?.map((header) => header.trim()) ?? [];
    if (!headers.length || headers.some((header) => !header)) throw new Error('CSV needs nonempty column headers.');
    if (new Set(headers).size !== headers.length) throw new Error('CSV column headers must be unique.');
    const requestColumns = headers.filter((header) => header === 'questions' || header === 'model');
    if (headers.includes('state') && requestColumns.length) throw new Error(`CSV: ${requestColumns.join(' and ')} columns cannot accompany a state column. Choose shared questions and model in experiment setup. Put context fields inside state, or use state.questions/state.model columns instead of a state column.`);
    rows = parsed.map((cells, index) => {
      if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2}: expected ${headers.length} columns, received ${cells.length}.`);
      const values = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
      let state: any;
      if (Object.hasOwn(values, 'state')) state = cellValue(values.state);
      else {
        state = Object.fromEntries(headers.filter((header) => header !== 'id' && header !== 'expected' && !header.startsWith('expected.')).map((header) => [header.replace(/^state\./, ''), cellValue(values[header])]));
        if (!Object.keys(state).length) throw new Error('CSV needs a state column or state field columns.');
      }
      const expected = values.expected?.trim() ? cellValue(values.expected) : {};
      if (!record(expected)) throw new Error(`CSV row ${index + 2}: expected must contain a JSON object.`);
      for (const header of headers.filter((key) => key.startsWith('expected.'))) {
        const key = header.slice(9);
        if (!key) throw new Error('CSV expected columns need a question ID after expected.');
        if (values[header].trim() !== '') Object.defineProperty(expected, key, { value: cellValue(values[header]), enumerable: true, writable: true, configurable: true });
      }
      return checkedRow({ id: values.id, state, expected }, index);
    });
  } else if (text.trimStart().startsWith('[')) {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('The JSON array is invalid.'); }
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of rows.');
    rows = parsed.map(checkedRow);
  } else {
    rows = text.split(/\r?\n/).flatMap((line, index) => {
      if (!line.trim()) return [];
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new Error(`Line ${index + 1}: invalid JSON. JSONL requires one complete object per line.`); }
      return [checkedRow(value, index)];
    });
  }
  if (!rows.length) throw new Error('The dataset has no data rows.');
  const seen = new Set<string>();
  for (const row of rows) { if (seen.has(row.id)) throw new Error(`Duplicate row ID: ${row.id}.`); seen.add(row.id); }
  return rows;
}

export interface EvaluationResult { row: DatasetRow; response: TypeSafeResponse | null }
export interface MetricMistake { rowId: string; questionId: string; expected: any; actual: any; probability: number | null }
export interface QuestionMetrics {
  questionId: string; type: PrimitiveType; total: number; count: number; missing: number; correct: number;
  accuracy: number | null; meanConfidence: number | null;
  precision?: number | null; recall?: number | null; f1?: number | null;
  falsePositiveRate?: number | null; falseNegativeRate?: number | null;
  truePositives?: number; trueNegatives?: number; falsePositives?: number; falseNegatives?: number;
  brierScore?: number | null; mae?: number | null; withinOne?: number | null;
  confusionMatrix?: Record<string, Record<string, number>>;
  perClass?: Record<string, { precision: number | null; recall: number | null; f1: number | null; support: number }>;
}
export interface Metrics {
  totalRows: number; completedRows: number; failedRows: number; accuracy: number | null;
  meanConfidence: number | null; questions: QuestionMetrics[]; mistakes: MetricMistake[];
}

export function answerValue(answer: Answer | undefined): number | string | undefined {
  if (!answer) return undefined;
  return answer.type === 'noul' ? answer.noul : answer.type === 'choice' ? answer.choice : answer.score;
}

export function mostProbableLevel(answer: Answer): number | undefined {
  const entries = Object.entries(answer.probabilities ?? {}).filter(([level, probability]) => Number.isFinite(Number(level)) && finite(probability));
  return entries.length ? Number(entries.reduce((best, entry) => entry[1] > best[1] ? entry : best)[0]) : finite(answer.score) ? Math.round(answer.score) : undefined;
}

/** Missing/failed answers are reported separately; accuracy is over valid labeled answers. */
export function calculateMetrics(results: EvaluationResult[]): Metrics {
  const ids = [...new Set(results.flatMap(({ row }) => Object.keys(row.expected)))];
  const mistakes: MetricMistake[] = [];
  const allConfidences: number[] = [];
  const questions = ids.map((questionId): QuestionMetrics => {
    const labeled = results.filter(({ row }) => Object.hasOwn(row.expected, questionId));
    const found = labeled.find(({ response }) => response?.answers[questionId]);
    const example = labeled[0]?.row.expected[questionId];
    const type = found?.response?.answers[questionId].type ?? (typeof example === 'boolean' ? 'noul' : typeof example === 'number' ? 'score' : 'choice');
    let count = 0, correct = 0, tp = 0, tn = 0, fp = 0, fn = 0, brier = 0, absoluteError = 0, withinOne = 0;
    const confidences: number[] = [];
    const confusionMatrix: Record<string, Record<string, number>> = Object.create(null);
    for (const { row, response } of labeled) {
      const answer = response?.answers[questionId], expected = row.expected[questionId];
      if (!answer || answer.type !== type) continue;
      let actual: any, probability: number | null = null;
      if (type === 'noul') {
        if (typeof expected !== 'boolean' || !finite(answer.noul) || answer.noul < 0 || answer.noul > 1) continue;
        actual = answer.noul >= 0.5;
        probability = answer.noul;
        brier += (answer.noul - Number(expected)) ** 2;
        if (actual && expected) tp++; else if (actual) fp++; else if (expected) fn++; else tn++;
      } else if (type === 'choice') {
        if (typeof expected !== 'string' || typeof answer.choice !== 'string') continue;
        actual = answer.choice;
        probability = answer.probabilities?.[actual] ?? null;
        confusionMatrix[expected] ??= Object.create(null);
        confusionMatrix[expected][actual] = (confusionMatrix[expected][actual] ?? 0) + 1;
      } else {
        if (!finite(expected) || !finite(answer.score)) continue;
        actual = mostProbableLevel(answer);
        if (actual === undefined) continue;
        absoluteError += Math.abs(answer.score - expected);
        if (Math.abs(actual - expected) <= 1) withinOne++;
        probability = answer.probabilities?.[String(actual)] ?? null;
      }
      count++;
      if (actual === expected) correct++;
      else mistakes.push({ rowId: row.id, questionId, expected, actual, probability });
      if (type !== 'noul' && finite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1) { confidences.push(answer.confidence); allConfidences.push(answer.confidence); }
    }
    const metric: QuestionMetrics = { questionId, type, total: labeled.length, count, missing: labeled.length - count, correct, accuracy: ratio(correct, count), meanConfidence: average(confidences) };
    if (type === 'noul') Object.assign(metric, { truePositives: tp, trueNegatives: tn, falsePositives: fp, falseNegatives: fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn), falsePositiveRate: ratio(fp, fp + tn), falseNegativeRate: ratio(fn, fn + tp), brierScore: ratio(brier, count) });
    if (type === 'score') Object.assign(metric, { mae: ratio(absoluteError, count), withinOne: ratio(withinOne, count) });
    if (type === 'choice') {
      const labels = [...new Set([...Object.keys(confusionMatrix), ...Object.values(confusionMatrix).flatMap(Object.keys)])];
      const perClass = Object.fromEntries(labels.map((label) => {
        const hits = confusionMatrix[label]?.[label] ?? 0;
        const predicted = Object.values(confusionMatrix).reduce((sum, row) => sum + (row[label] ?? 0), 0);
        const support = Object.values(confusionMatrix[label] ?? {}).reduce((a, b) => a + b, 0);
        return [label, { precision: ratio(hits, predicted), recall: ratio(hits, support), f1: ratio(2 * hits, predicted + support), support }];
      }));
      Object.assign(metric, { confusionMatrix, perClass });
    }
    return metric;
  });
  return { totalRows: results.length, completedRows: results.filter(({ response }) => response !== null).length, failedRows: results.filter(({ response }) => response === null).length, accuracy: ratio(questions.reduce((sum, q) => sum + q.correct, 0), questions.reduce((sum, q) => sum + q.count, 0)), meanConfidence: average(allConfidences), questions, mistakes };
}

export interface ThresholdSample { probability: number; expected: boolean }
/** Strict decisions: below low is NO, above high is YES; both boundaries are REVIEW. */
export function thresholdMetrics(samples: ThresholdSample[], low: number, high: number) {
  if (!finite(low) || !finite(high) || low < 0 || high > 1 || low > high) throw new Error('Thresholds must satisfy 0 ≤ low ≤ high ≤ 1.');
  if (samples.some(({ probability, expected }) => !finite(probability) || probability < 0 || probability > 1 || typeof expected !== 'boolean')) throw new Error('Threshold samples require a probability in [0, 1] and a boolean label.');
  let review = 0, tp = 0, tn = 0, fp = 0, fn = 0;
  for (const { probability, expected } of samples) {
    if (probability < low) { if (expected) fn++; else tn++; }
    else if (probability > high) { if (expected) tp++; else fp++; }
    else review++;
  }
  const automatic = tp + tn + fp + fn;
  return { total: samples.length, automatic, review, coverage: samples.length ? automatic / samples.length : 0, reviewRate: samples.length ? review / samples.length : 0, accuracy: ratio(tp + tn, automatic), falseApprovals: fp, falseRejections: fn, truePositives: tp, trueNegatives: tn, falsePositives: fp, falseNegatives: fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) };
}

/** Population standard deviation over the observed repetitions. */
export function repeatability(values: number[]) {
  if (values.some((value) => !finite(value))) throw new Error('Repeatability requires finite numeric values.');
  const mean = average(values);
  const variance = mean === null ? null : average(values.map((value) => (value - mean) ** 2));
  return { count: values.length, mean, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, variance, stdDev: variance === null ? null : Math.sqrt(variance) };
}

export function exportCode(request: Request, format: 'json' | 'typescript' | 'python' | 'curl', policy?: ThresholdPolicy): string {
  const errors = validateRequest(request);
  if (errors.length) throw new Error(errors.join('\n'));
  if (policy) { thresholdMetrics([], policy.low, policy.high); if (request.questions[policy.questionId]?.type !== 'noul') throw new Error('A threshold policy must target a Noul question.'); }
  const json = JSON.stringify(request, null, 2);
  if (format === 'json') return JSON.stringify(policy ? { request, policy: { ...policy, boundary: 'review', rule: 'p < low → no; p > high → yes; otherwise review' } } : request, null, 2);
  if (format === 'typescript') return `// Node.js 20+. Set TYPESAFE_API_KEY in the environment.\nconst request = ${json};\nconst response = await fetch('https://api.typesafe.ai/v1/systemone', {\n  method: 'POST',\n  headers: {\n    Authorization: \`Bearer \${process.env.TYPESAFE_API_KEY}\`,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify(request),\n});\nif (!response.ok) throw new Error(\`TypeSafe \${response.status}: \${await response.text()}\`);\nconst result = await response.json();\n${policy ? `const p = result.answers[${JSON.stringify(policy.questionId)}].noul;\nconst decision = p < ${policy.low} ? 'no' : p > ${policy.high} ? 'yes' : 'review';\nconsole.log({ decision, probability: p });` : 'console.log(result);'}\n`;
  if (format === 'python') return `# Python 3. Set TYPESAFE_API_KEY in the environment.\nimport json\nimport os\nfrom urllib.request import Request, urlopen\n\npayload = json.loads(${JSON.stringify(json)})\nrequest = Request(\n    'https://api.typesafe.ai/v1/systemone',\n    data=json.dumps(payload).encode(),\n    headers={\n        'Authorization': 'Bearer ' + os.environ['TYPESAFE_API_KEY'],\n        'Content-Type': 'application/json',\n    },\n    method='POST',\n)\nwith urlopen(request, timeout=30) as response:\n    result = json.load(response)\n${policy ? `p = result['answers'][${JSON.stringify(policy.questionId)}]['noul']\ndecision = 'no' if p < ${policy.low} else 'yes' if p > ${policy.high} else 'review'\nprint({'decision': decision, 'probability': p})` : 'print(json.dumps(result, indent=2))'}\n`;
  return `${policy ? `# Noul policy for ${JSON.stringify(policy.questionId)}: p < ${policy.low} => no; p > ${policy.high} => yes; otherwise review.\n` : ''}curl --fail-with-body --max-time 30 'https://api.typesafe.ai/v1/systemone' \\\n  -H "Authorization: Bearer $TYPESAFE_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '${json.replace(/'/g, "'\\''")}'\n`;
}

const hash = (text: string): number => { let n = 2166136261; for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619); return n >>> 0; };
const round = (value: number, digits = 4) => Number(value.toFixed(digits));

/** Synthetic fixtures only: no API, credentials, label access, or claims of Jev accuracy. */
export function generateDemoResponse(request: Request, repetition = 0): TypeSafeResponse {
  const errors = validateRequest(request);
  if (errors.length) throw new Error(errors.join('\n'));
  const state = JSON.stringify(request.state).toLowerCase();
  const answers: Record<string, Answer> = Object.create(null);
  for (const [id, question] of Object.entries(request.questions)) {
    // IDs deliberately do not influence the synthetic judgment, matching the API contract.
    const text = JSON.stringify(question.instructions).toLowerCase();
    const seed = hash(JSON.stringify([request.state, question, repetition]));
    const jitter = (seed % 1000) / 1000;
    if (question.type === 'noul') {
      let probability = 0.12 + jitter * 0.76;
      if (/mentor|coach/.test(text)) probability = /mentor|coach|onboarded/.test(state) ? 0.84 + jitter * 0.14 : 0.03 + jitter * 0.2;
      else if (/llm|language model|generative/.test(text)) probability = /llm|language model|rag|generative|fine-tun/.test(state) ? 0.83 + jitter * 0.15 : 0.025 + jitter * 0.18;
      else if (/urgent|urgency/.test(text)) probability = /urgent|asap|outage|blocked|immediately/.test(state) ? 0.82 + jitter * 0.16 : 0.03 + jitter * 0.3;
      answers[id] = { type: 'noul', noul: round(probability) };
    } else {
      const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_: any, index: number) => String(index));
      let winner = seed % keys.length;
      if (question.type === 'choice') {
        const candidate = keys.findIndex((key: string) => state.includes(key.replace(/_/g, ' ')) || state.includes(key));
        if (candidate >= 0) winner = candidate;
      } else if (/engineer|technical|hands-on/.test(text)) {
        winner = /architect|specialist|distributed systems/.test(state) ? Math.min(5, keys.length - 1) : /owns systems|system ownership|platform lead/.test(state) ? Math.min(4, keys.length - 1) : /end-to-end|production features/.test(state) ? Math.min(3, keys.length - 1) : /intern|scoped/.test(state) ? Math.min(2, keys.length - 1) : /coursework|student/.test(state) ? Math.min(1, keys.length - 1) : 0;
      }
      const peak = keys.length === 1 ? 1 : 0.65 + jitter * 0.3;
      const probabilities: Record<string, number> = Object.fromEntries(keys.map((key: string, i: number) => [key, i === winner ? peak : (1 - peak) / (keys.length - 1)]));
      // Fixture confidence is explicitly synthetic and derived from distribution concentration.
      const entropy = -Object.values(probabilities).reduce((sum, p) => sum + (p ? p * Math.log(p) : 0), 0);
      const confidence = keys.length > 1 ? round(1 - entropy / Math.log(keys.length)) : 1;
      answers[id] = question.type === 'choice' ? { type: 'choice', choice: keys[winner], probabilities, confidence } : { type: 'score', score: round(Object.entries(probabilities).reduce((sum, [level, p]) => sum + Number(level) * p, 0)), probabilities, confidence, legend: Object.fromEntries(keys.map((key: string, i: number) => [key, typeof question.criteria[i] === 'string' ? question.criteria[i] : JSON.stringify(question.criteria[i])])) };
    }
  }
  return { model: 'synthetic-demo', answers, synthetic: true };
}
export const demoResponse = generateDemoResponse;

export const sampleQuestions: Questions = {
  technical_depth: { type: 'score', instructions: 'Rate the candidate’s demonstrated hands-on engineering depth, using only evidence in the resume.', criteria: ['No hands-on coding evidence', 'Coursework and personal projects', 'Small scoped contributions', 'Owns production features end-to-end', 'Owns systems and technical direction', 'Deep specialist with architectural impact'] },
  mentorship_demonstrated: { type: 'noul', instructions: 'Does the resume demonstrate direct professional mentoring or coaching of other engineers?', criteria: { true: 'Explicit examples of mentoring, coaching, or onboarding engineers.', false: 'No explicit professional mentoring evidence.' } },
  llm_experience: { type: 'noul', instructions: 'Does the resume demonstrate practical experience building applications with large language models?', criteria: { true: 'Built or deployed LLM applications, retrieval-augmented generation, or model fine-tuning.', false: 'No practical LLM experience is stated.' } },
  primary_talent_profile: { type: 'choice', instructions: 'Which engineering profile best reflects the candidate’s demonstrated professional work?', criteria: { full_stack_engineer: 'Builds both frontend interfaces and backend services.', backend_engineer: 'Focuses on services, APIs, databases, and infrastructure.', frontend_engineer: 'Focuses on user interfaces and web experiences.', ml_engineer: 'Builds machine learning systems and model pipelines.' } },
};

export const sampleState = {
  candidate: 'Alex Morgan',
  resume: 'FICTIONAL DEMO RESUME\n\nAlex Morgan · Senior Full Stack Engineer\nSingapore · 7 years of engineering experience\n\nNorthstar Labs · Senior Software Engineer · 2022–present\n• Owns systems powering a developer analytics platform, from React interfaces to Python APIs and PostgreSQL.\n• Built and deployed an LLM-powered support assistant using retrieval-augmented generation (RAG).\n• Mentored 3 engineers through weekly pairing and technical design reviews.\n• Led the migration to an event-driven architecture serving 40,000 teams.\n\nOrbit Studio · Software Engineer · 2019–2022\n• Shipped production features end-to-end across the web application and backend services.\n\nPrimary work: full stack engineer.\nEducation: B.Sc. Computer Science.',
};

export function createSeedWorkspace(): Workspace {
  const now = new Date().toISOString();
  const projects: Project[] = [
    { id: 'project-resume', name: 'Resume Screening', description: 'Explore structured judgments with fictional engineering resumes.', created_at: now },
    { id: 'project-support', name: 'Support Triage', description: 'Route support tickets and identify urgent requests.', created_at: now },
  ];
  const session: Session = { id: 'session-resume-v1', project_id: projects[0].id, name: 'Engineering candidates', state_json: clone(sampleState), questions_json: clone(sampleQuestions), requested_model: 'jev-latest', version: 1, created_at: now, updated_at: now };
  const sessions: Session[] = [session, { id: 'session-support-v1', project_id: projects[1].id, name: 'Ticket routing', state_json: { message: 'Our production integration is blocked by repeated API errors. Please help urgently.', source: 'Fictional demo ticket' }, requested_model: 'jev-latest', version: 1, created_at: now, updated_at: now, questions_json: { is_urgent: { type: 'noul', instructions: 'Does the ticket describe an urgent issue that blocks the customer’s work?' }, department: { type: 'choice', instructions: 'Which team should handle the primary issue in this ticket?', criteria: { billing: 'Invoices, payments, or refunds', technical: 'Bugs, outages, or integrations', sales: 'Pricing or purchase requests' } }, frustration: { type: 'score', instructions: 'Rate the frustration explicitly expressed by the customer.', criteria: ['Calm', 'Frustrated', 'Very angry'] } } }];
  const fixtures: [string, string, number, boolean, boolean, string][] = [
    ['Alex Morgan', 'Owns systems spanning React interfaces and Python APIs. Mentored engineers and built an LLM support assistant.', 4, true, true, 'full_stack_engineer'],
    ['Jamie Park', 'Owns production features end-to-end in Go APIs and PostgreSQL. Coached two junior engineers.', 3, true, false, 'backend_engineer'],
    ['Taylor Chen', 'Owns production features end-to-end in React and accessible interfaces. Built an LLM writing assistant.', 3, false, true, 'frontend_engineer'],
    ['Sam Rivera', 'Architect and distributed systems specialist. Built model pipelines and RAG retrieval. Mentored the ML team.', 5, true, true, 'ml_engineer'],
    ['Jordan Lee', 'Student with coursework and personal projects in HTML, CSS, and JavaScript.', 1, false, false, 'frontend_engineer'],
    ['Casey Patel', 'Intern who completed small scoped API contributions with Python and SQL.', 2, false, false, 'backend_engineer'],
    ['Riley Kim', 'Owns systems for an ecommerce app across Vue interfaces and Node services. Coached new hires.', 4, true, false, 'full_stack_engineer'],
    ['Morgan Blake', 'Owns production features end-to-end for ML data pipelines and a deployed language model.', 3, false, true, 'ml_engineer'],
    ['Avery Singh', 'Platform lead with system ownership for Rust services. Mentored infrastructure engineers.', 4, true, false, 'backend_engineer'],
    ['Quinn Davis', 'Owns production features end-to-end across Svelte and Python. Integrated an LLM assistant.', 3, false, true, 'full_stack_engineer'],
    ['Cameron Reed', 'Specialist architect for frontend design systems. Coached engineers on accessibility.', 5, true, false, 'frontend_engineer'],
    ['Drew Ellis', 'Intern completing scoped model evaluation pipelines and fine-tuning experiments.', 2, false, true, 'ml_engineer'],
  ];
  const rows: DatasetRow[] = fixtures.map(([name, resume, depth, mentorship, llm, profile], i) => ({ id: `candidate_${String(i + 1).padStart(3, '0')}`, state: { candidate: name, resume: `FICTIONAL DEMO RESUME\n${name}\n${resume}\nPrimary work: ${profile.replace(/_/g, ' ')}.` }, expected: { technical_depth: depth, mentorship_demonstrated: mentorship, llm_experience: llm, primary_talent_profile: profile } }));
  const datasets: Dataset[] = [{ id: 'dataset-resumes-demo', project_id: projects[0].id, name: 'Engineering resumes · demo', rows, created_at: now }];
  const request: Request = { state: clone(session.state_json), model: session.requested_model, questions: clone(session.questions_json) };
  const response = generateDemoResponse(request);
  const runs: Run[] = [{ id: 'run-demo-welcome', session_id: session.id, project_id: session.project_id, name: 'Engineering candidates · demo', request_json: request, response_json: response, requested_model: request.model, resolved_model: response.model, latency_ms: 0, input_tokens: null, output_tokens: null, status: 'success', error_json: null, created_at: now, source: 'demo' }];
  return { projects, sessions, datasets, runs };
}
export const seedWorkspace = createSeedWorkspace;

import { describe, expect, it, vi } from 'vitest';
import { parseQuestionsJSON } from './request-input';

describe('Playground questions JSON', () => {
  it('accepts a formatted JSON object spanning multiple lines', () => {
    const questions = { urgent: { type: 'noul', instructions: 'Is this urgent?' } };
    expect(parseQuestionsJSON(JSON.stringify(questions, null, 2))).toEqual(questions);
  });

  it('reports syntax errors with a location and JSON guidance', () => {
    const invalid = '{\n  "urgent": {"type": "noul"}\n  "second": {}\n}';
    expect(() => parseQuestionsJSON(invalid)).toThrow(/syntax error at line 3/);
    expect(() => parseQuestionsJSON(invalid)).toThrow(/one JSON object with question IDs as keys/);
    try { parseQuestionsJSON(invalid); } catch (error) {
      expect((error as Error).message).not.toContain('JSONL');
    }
  });

  it.each(['[]', 'null', '"question"', '42'])('distinguishes a valid JSON value from the required questions object: %s', (text) => {
    expect(() => parseQuestionsJSON(text)).toThrow('Questions must be a JSON object with question IDs as keys');
  });

  it('locates the syntax error when WebKit omits the position', () => {
    const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new SyntaxError("JSON Parse error: Expected '}'");
    });
    try {
      expect(() => parseQuestionsJSON('{\n  "q": {"criteria": {"a":"b"}aaa}\n}')).toThrow('syntax error at line 2, column 30');
    } finally { parse.mockRestore(); }
  });
});

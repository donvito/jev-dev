import type { Questions } from './domain';
import { jsonLanguage } from '@codemirror/lang-json';

export function parseQuestionsJSON(text: string): Questions {
  let questions: unknown;
  try {
    questions = JSON.parse(text);
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : '';
    const position = detail.match(/position (\d+)/);
    let offset = position ? Number(position[1]) : null;
    // WebKit's JSON.parse errors do not include an offset. Use the editor's
    // JSON parser to locate the syntax error in the desktop app too.
    if (offset === null) {
      const cursor = jsonLanguage.parser.parse(text).cursor();
      do {
        if (cursor.type.isError) { offset = cursor.from; break; }
      } while (cursor.next());
    }
    const before = offset === null ? '' : text.slice(0, offset);
    const location = offset === null ? '' : ` at line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')}`;
    throw new Error(`Questions JSON has a syntax error${location}. Use one JSON object with question IDs as keys.\n${detail}`.trim());
  }
  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
    throw new Error('Questions must be a JSON object with question IDs as keys, such as {"urgent":{"type":"noul","instructions":"Is this urgent?"}}.');
  }
  return questions as Questions;
}

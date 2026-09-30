import { describe, expect, it, vi } from 'vitest';
import { errorMessage, errorSnapshot } from './storage';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));

describe('run error feedback', () => {
  it('shows rejected field paths and messages from provider payload validation', () => {
    const error = {
      kind: 'http', status: 422,
      message: 'TypeSafe rejected the request. Check the state and question definitions.',
      details: { detail: [
        { loc: ['body', 'questions', 'rating', 'criteria', 0], msg: 'Input should be a valid string', input: false },
        { loc: ['body', 'state'], msg: 'Field required' },
      ] },
    };
    expect(errorMessage(error)).toBe(`${error.message}\nbody.questions.rating.criteria.0: Input should be a valid string\nbody.state: Field required`);
    expect(errorMessage(error)).not.toContain('false');
    expect(errorMessage(JSON.parse(JSON.stringify(errorSnapshot(error))))).toBe(errorMessage(error));
  });

  it('handles provider detail strings, nested error messages, and absent details', () => {
    expect(errorMessage({ message: 'Request rejected', details: { detail: 'Unknown model' } })).toBe('Request rejected\nUnknown model');
    expect(errorMessage({ message: 'Request rejected', details: { error: { message: 'Invalid criteria' } } })).toBe('Request rejected\nInvalid criteria');
    expect(errorMessage({ message: 'Request timed out', details: null })).toBe('Request timed out');
    expect(errorMessage({ message: 'Duplicate', details: { message: 'Duplicate' } })).toBe('Duplicate');
  });

  it('keeps native Error messages when snapshots are persisted and restored', () => {
    const saved = JSON.parse(JSON.stringify(errorSnapshot(new Error('Add your API key in Settings first.'))));
    expect(saved.message).toBe('Add your API key in Settings first.');
    expect(errorMessage(saved)).toBe(saved.message);
    expect(errorSnapshot('Questions are not valid JSON.')).toEqual({ message: 'Questions are not valid JSON.' });
    expect(errorMessage(null)).toBe('An unexpected error occurred. Please try again.');
  });
});

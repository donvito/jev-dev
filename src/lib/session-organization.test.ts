import { describe, expect, it } from 'vitest';
import type { Run } from './domain';
import { projectedRun, relatedSessionIds, sessionProjectId, UNFILED_PROJECT_ID, type SessionProjectOverrides } from './session-organization';

function fixture(id = 'run-1', sessionId = 'session-1'): Run {
  return {
    id, session_id: sessionId, project_id: 'original-project', name: 'Example',
    request_json: { state: 'Example state', model: 'jev-latest', questions: { relevant: { type: 'noul', instructions: 'Is this relevant?' } } },
    response_json: { model: 'synthetic-demo', answers: { relevant: { type: 'noul', noul: .8 } }, synthetic: true },
    requested_model: 'jev-latest', resolved_model: 'synthetic-demo', latency_ms: 0,
    input_tokens: null, output_tokens: null, status: 'success', error_json: null,
    created_at: '2026-09-29T10:00:00.000Z', source: 'demo',
  };
}

describe('session organization projections', () => {
  it('moves a whole session and all its runs without moving other sessions', () => {
    const runs = [fixture('run-1'), fixture('run-2'), fixture('run-3', 'session-2')];
    const overrides = { 'session-1': 'new-project' };
    expect(sessionProjectId('session-1', 'original-project', overrides)).toBe('new-project');
    expect(runs.map(run => projectedRun(run, overrides).project_id)).toEqual(['new-project', 'new-project', 'original-project']);
    expect(projectedRun(runs[2], overrides)).toBe(runs[2]);
  });

  it('supports unfiled sessions and moving them into or out of projects', () => {
    expect(sessionProjectId('session-1', UNFILED_PROJECT_ID, {})).toBe(UNFILED_PROJECT_ID);
    expect(sessionProjectId('session-1', UNFILED_PROJECT_ID, { 'session-1': 'project-a' })).toBe('project-a');
    expect(projectedRun(fixture(), { 'session-1': UNFILED_PROJECT_ID }).project_id).toBe(UNFILED_PROJECT_ID);
  });

  it('preserves identity when no override changes the original project', () => {
    const run = fixture();
    expect(projectedRun(run, {})).toBe(run);
    expect(projectedRun(run, { 'session-1': run.project_id })).toBe(run);
    expect(projectedRun(run, { 'unknown-session': 'another-project' })).toBe(run);
  });

  it('never mutates original snapshots or deep-clones their raw payloads', () => {
    const run = Object.freeze(fixture());
    const originalJson = JSON.stringify(run);
    const overrides = Object.freeze({ 'session-1': 'new-project' });
    const projected = projectedRun(run, overrides);
    expect(projected).not.toBe(run);
    expect(projected.request_json).toBe(run.request_json);
    expect(projected.response_json).toBe(run.response_json);
    expect(projected).toEqual({ ...run, project_id: 'new-project' });
    expect(JSON.stringify(run)).toBe(originalJson);
    expect(overrides).toEqual({ 'session-1': 'new-project' });
  });

  it('ignores inherited and malformed overrides rather than losing original organization', () => {
    const run = fixture();
    expect(projectedRun(run, Object.create({ 'session-1': 'inherited-project' }))).toBe(run);
    for (const value of [undefined, '', '   ', null, 1, false]) {
      const overrides = { 'session-1': value } as unknown as SessionProjectOverrides;
      expect(projectedRun(run, overrides)).toBe(run);
    }
  });
});

describe('related session versions', () => {
  it('includes the active session with no family or legacy links', () => {
    expect(relatedSessionIds('session-1', {}, [fixture()], {})).toEqual(['session-1']);
  });

  it('collects sibling saved versions and their original session using explicit families', () => {
    const family = { 'version-2': 'session-1', 'version-3': 'session-1', 'other-version': 'other-session' };
    const related = relatedSessionIds('version-2', family, [], {});
    expect(new Set(related)).toEqual(new Set(['version-2', 'session-1', 'version-3']));
    expect(related[0]).toBe('version-2');
    expect(new Set(relatedSessionIds('session-1', family, [], {}))).toEqual(new Set(related));
  });

  it('moves the original run with a saved version linked to its response', () => {
    const runs = [fixture('original-run', 'original-session'), fixture('later-run', 'saved-version'), fixture('unrelated-run', 'unrelated-session')];
    const links = { 'saved-version': 'original-run' };
    const related = relatedSessionIds('saved-version', {}, runs, links);
    expect(new Set(related)).toEqual(new Set(['saved-version', 'original-session']));
    const overrides = Object.fromEntries(related.map(id => [id, 'destination']));
    expect(runs.map(run => projectedRun(run, overrides).project_id)).toEqual(['destination', 'destination', 'original-project']);
    // The same connection is discoverable when moving the original session.
    expect(new Set(relatedSessionIds('original-session', {}, runs, links))).toEqual(new Set(related));
  });

  it('combines family membership and exact legacy links transitively while handling cycles', () => {
    const runs = [fixture('run-a', 'a'), fixture('run-d', 'd')];
    const family = { b: 'c', c: 'b', e: 'd' };
    const related = relatedSessionIds('b', family, runs, { c: 'run-a', a: 'run-d', d: 'run-a' });
    expect(new Set(related)).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
    expect(related).toHaveLength(5);
  });

  it('ignores run-specific drafts, dangling links, inherited metadata, and matching names', () => {
    const runs = [fixture('run-a', 'a'), fixture('run-b', 'b')];
    const family = Object.create({ b: 'a' });
    const links = Object.assign(Object.create({ b: 'run-a' }), { 'run:run-b': 'run-a', orphan: 'missing-run' });
    expect(relatedSessionIds('a', family, runs, links)).toEqual(['a']);
    expect(relatedSessionIds('orphan', {}, runs, links)).toEqual(['orphan']);
    expect(relatedSessionIds('run:run-b', {}, runs, links)).toEqual([]);
  });

  it('does not mutate family metadata, draft links, or immutable run snapshots', () => {
    const runs = Object.freeze([Object.freeze(fixture('run-a', 'a'))]);
    const family = Object.freeze({ c: 'b' });
    const links = Object.freeze({ b: 'run-a' });
    const before = JSON.stringify({ family, links, runs });
    expect(new Set(relatedSessionIds('c', family, runs, links))).toEqual(new Set(['a', 'b', 'c']));
    expect(JSON.stringify({ family, links, runs })).toBe(before);
  });
});

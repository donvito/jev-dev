import type { Run } from './domain';

export const UNFILED_PROJECT_ID = '__unfiled__';
export type SessionProjectOverrides = Readonly<Record<string, string | undefined>>;

/** Resolve current UI organization without changing a session's recorded origin. */
export function sessionProjectId(id: string, originalProjectId: string, overrides: SessionProjectOverrides): string {
  if (!Object.hasOwn(overrides, id)) return originalProjectId;
  const projectId = overrides[id];
  return typeof projectId === 'string' && projectId.trim() ? projectId : originalProjectId;
}

/** UI-only projection. Persist and export the original immutable run snapshot. */
export function projectedRun(run: Run, overrides: SessionProjectOverrides): Run {
  const projectId = sessionProjectId(run.session_id, run.project_id, overrides);
  return projectId === run.project_id ? run : { ...run, project_id: projectId };
}

/**
 * Collect saved versions connected by explicit family membership or a legacy
 * saved-version response link. Family values are representative session IDs.
 * Run-specific draft keys are views of snapshots, not session-family members.
 */
export function relatedSessionIds(
  activeSessionId: string,
  sessionFamilyIds: Readonly<Record<string, string | undefined>>,
  runs: readonly Run[],
  draftRunIds: Readonly<Record<string, string | undefined>>,
): string[] {
  const validSession = (id: unknown): id is string => typeof id === 'string' && !!id.trim() && !id.startsWith('run:');
  if (!validSession(activeSessionId)) return [];
  const neighbors = new Map<string, Set<string>>();
  const connect = (first: unknown, second: unknown) => {
    if (!validSession(first) || !validSession(second)) return;
    if (!neighbors.has(first)) neighbors.set(first, new Set());
    if (!neighbors.has(second)) neighbors.set(second, new Set());
    neighbors.get(first)!.add(second);
    neighbors.get(second)!.add(first);
  };
  for (const [sessionId, familyId] of Object.entries(sessionFamilyIds)) connect(sessionId, familyId);
  const runSessions = new Map(runs.map(run => [run.id, run.session_id]));
  for (const [draftId, runId] of Object.entries(draftRunIds)) {
    if (typeof runId === 'string') connect(draftId, runSessions.get(runId));
  }
  const visited = new Set<string>([activeSessionId]);
  const queue = [activeSessionId];
  for (let index = 0; index < queue.length; index++) {
    for (const id of neighbors.get(queue[index]) ?? []) {
      if (!visited.has(id)) { visited.add(id); queue.push(id); }
    }
  }
  return queue;
}

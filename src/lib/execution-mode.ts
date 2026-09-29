export type ExecutionMode = 'demo' | 'live';

const EXECUTION_MODE_KEY = 'jev-dev-execution-mode';

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return value === 'demo' || value === 'live';
}

/** Availability is supplied by the native app; this module never reads credentials. */
export function readExecutionMode(liveAvailable: boolean, workspacePreference?: unknown): ExecutionMode {
  if (!liveAvailable) return 'demo';
  try {
    const cached = localStorage.getItem(EXECUTION_MODE_KEY);
    if (isExecutionMode(cached)) return cached;
  } catch { /* Fall back to the saved workspace when browser storage is unavailable. */ }
  return isExecutionMode(workspacePreference) ? workspacePreference : 'live';
}

export function saveExecutionMode(mode: ExecutionMode): void {
  try { localStorage.setItem(EXECUTION_MODE_KEY, mode); } catch { /* The workspace also saves this preference. */ }
}

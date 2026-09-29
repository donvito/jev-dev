import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Run, Request, TypeSafeResponse } from './domain';
export const desktop = isTauri();
const KEY = 'jev-agent-workspace-v1';
const RUNS_KEY = 'jev-agent-runs-v1';
let queue: Promise<unknown> = Promise.resolve();
export async function loadWorkspace(): Promise<any | null> {
  if (desktop) return invoke('load_workspace');
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}
export function saveWorkspace(workspace: unknown): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify(workspace));
  const task = queue.catch(() => {}).then(async () => {
    if (desktop) await invoke('save_workspace', { workspace: snapshot });
    else localStorage.setItem(KEY, JSON.stringify(snapshot));
  });
  queue = task;
  return task;
}
export async function listRuns(): Promise<Run[]> {
  if (desktop) return invoke('list_runs');
  return JSON.parse(localStorage.getItem(RUNS_KEY) || '[]');
}
export async function saveRun(run: Run): Promise<void> {
  if (desktop) return invoke('save_run', { run });
  const runs = await listRuns();
  if (runs.some(r => r.id === run.id)) throw new Error('Run snapshots cannot be overwritten.');
  localStorage.setItem(RUNS_KEY, JSON.stringify([run, ...runs]));
}
export async function executeLive(request: Request): Promise<{response: TypeSafeResponse; latency_ms:number}> {
  if (!desktop) throw new Error('Live requests are available in the desktop app.');
  return invoke('execute_request', { request });
}
export async function download(name: string, text: string, type = 'application/json') {
  if (desktop) {try {await invoke('save_export', {filename:name,contents:text});} catch(error) {window.alert('Export failed: '+errorMessage(error));}return;}
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'An unexpected error occurred. Please try again.';
}

export async function openDocumentation(page:'docs'|'keys') {try {await invoke('open_documentation',{page});}catch(error){window.alert(errorMessage(error));}}

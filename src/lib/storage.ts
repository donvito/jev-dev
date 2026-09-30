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
  if (!error || typeof error !== 'object') return 'An unexpected error occurred. Please try again.';
  const value = error as Record<string, unknown>;
  const message = typeof value.message === 'string' ? value.message : '';
  const details = validationMessages(value.details ?? value.detail ?? value.error ?? value.errors);
  return [...new Set([message, ...details].filter(Boolean))].join('\n') || 'An unexpected error occurred. Please try again.';
}

// Provider validation responses can contain field paths (e.g. FastAPI's loc/msg)
// or nested error messages. Only render messages; the full safe error remains
// available in the response pane and saved snapshot.
function validationMessages(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(item => validationMessages(item, depth + 1));
  if (typeof value !== 'object') return [];
  const detail = value as Record<string, unknown>;
  const message = typeof detail.msg === 'string' ? detail.msg : typeof detail.message === 'string' ? detail.message : '';
  const path = Array.isArray(detail.loc) ? detail.loc.filter(part => typeof part === 'string' || typeof part === 'number').join('.') : '';
  return [message ? path ? `${path}: ${message}` : message : '',
    ...['detail', 'error', 'errors'].flatMap(key => validationMessages(detail[key], depth + 1))].filter(Boolean);
}

export function errorSnapshot(error: unknown): Record<string, unknown> {
  // Error.message is not enumerable and otherwise disappears when saved as JSON.
  if (error instanceof Error) return { ...error, name: error.name, message: error.message };
  if (error && typeof error === 'object' && !Array.isArray(error)) return { ...error };
  return { message: errorMessage(error) };
}

export async function openDocumentation(page:'docs'|'keys') {try {await invoke('open_documentation',{page});}catch(error){window.alert(errorMessage(error));}}

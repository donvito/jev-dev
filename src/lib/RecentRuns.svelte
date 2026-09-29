<script lang="ts">
  import { Check, X, Search, History } from 'lucide-svelte';
  import type { Run } from './domain';
  interface Props {
    runs: Run[];
    selectedRunId: string | null;
    onselect: (run: Run) => void;
    labels?: Record<string, string>;
    modifiedRunIds?: string[];
  }
  let { runs, selectedRunId, onselect, labels = {}, modifiedRunIds = [] }: Props = $props();
  const displayName = (run: Run) => labels[run.id] || run.name;
  let query = $state('');
  let searchInput: HTMLInputElement;
  export function focusSearch() { searchInput?.focus(); searchInput?.select(); }
  const timestamp = (run: Run) => { const n = Date.parse(run.created_at); return Number.isFinite(n) ? n : 0; };
  const validDate = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; };
  const fullDate = (value: string) => validDate(value)?.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? 'Unknown date';
  const shortDate = (value: string) => validDate(value)?.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? 'Unknown date';
  const shortId = (id: string) => { let length = Math.min(8, id.length); while (length < id.length && runs.some(run => run.id !== id && run.id.startsWith(id.slice(0, length)))) length++; return id.slice(0, length); };
  const groupNames = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const;
  const grouped = $derived.by(() => {
    const search = query.trim().toLowerCase();
    const matching = runs.filter(run => [displayName(run), run.requested_model, run.resolved_model ?? '', run.id].join(' ').toLowerCase().includes(search)).slice().sort((a, b) => timestamp(b) - timestamp(a));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const week = new Date(today); week.setDate(week.getDate() - 7);
    const groups: Record<typeof groupNames[number], Run[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
    for (const run of matching) {
      const time = timestamp(run);
      const key = time >= today.getTime() ? 'Today' : time >= yesterday.getTime() ? 'Yesterday' : time >= week.getTime() ? 'Previous 7 days' : 'Older';
      groups[key].push(run);
    }
    return groupNames.map(name => ({ name, runs: groups[name] })).filter(group => group.runs.length);
  });
  const matchingCount = $derived(grouped.reduce((sum, group) => sum + group.runs.length, 0));
</script>

<aside class="recent-runs-panel" aria-label="Playground run history">
  <div class="history-heading"><span><History size={12}/>Run history</span><span class="run-count">{runs.length}</span></div>
  <div class="history-search"><Search size={12}/><input bind:this={searchInput} bind:value={query} aria-label="Search playground history" placeholder="Search runs…" spellcheck="false"/>{#if query}<button aria-label="Clear history search" onclick={() => { query = ''; searchInput?.focus(); }}><X size={11}/></button>{/if}</div>
  <div class="history-list">
    {#each grouped as group (group.name)}
      <section class="history-group" aria-label={group.name}><h3>{group.name}</h3>
        {#each group.runs as run (run.id)}
          <button class="run-item" class:selected={selectedRunId === run.id} aria-current={selectedRunId === run.id ? 'true' : undefined} aria-label={`Open ${displayName(run)}, ${fullDate(run.created_at)}, ${shortId(run.id)}`} title={`${displayName(run)}\n${fullDate(run.created_at)}\n${run.resolved_model ?? run.requested_model}\n${run.id}`} onclick={() => onselect(run)}>
            <span class="status-icon" title={run.status === 'error' ? 'Failed run' : 'Successful run'}>{#if run.status === 'error'}<X size={11}/>{:else}<Check size={11}/>{/if}</span>
            <span class="run-text"><strong>{displayName(run) || 'Untitled run'}</strong><span class="run-meta"><time datetime={run.created_at}>{shortDate(run.created_at)}</time><span>· {run.source === 'demo' ? 'Demo' : 'Live'}</span>{#if run.status === 'error'}<span>· Failed</span>{/if}{#if modifiedRunIds.includes(run.id)}<span class="edited-marker">· Edited</span>{/if}</span></span>
          </button>
        {/each}
      </section>
    {:else}
      <div class="history-empty">{#if query}<strong>No matching runs</strong><p>Try another name, model, or run ID.</p>{:else}<p>Run an evaluation to save it here.</p>{/if}</div>
    {/each}
  </div>
  {#if query}<div class="search-count" aria-live="polite">{matchingCount} matching {matchingCount === 1 ? 'run' : 'runs'}</div>{/if}
</aside>

<style>
.recent-runs-panel{display:flex;flex-direction:column;flex:1;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--surface-subtle);color:var(--text-primary);font-size:11px}
.history-heading{height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 11px;border-bottom:1px solid var(--border);color:var(--text-secondary)}.history-heading>span:first-child{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500}.run-count{font:9px var(--mono,monospace);color:var(--text-muted)}
.history-search{display:flex;align-items:center;gap:6px;margin:9px 9px 5px;padding:5px 6px;border:1px solid var(--border);border-radius:3px;background:var(--surface);flex-shrink:0;color:var(--text-muted)}.history-search:focus-within{border-color:var(--focus)}.history-search>:global(svg){flex-shrink:0}.history-search input{border:0;outline:none;background:none;width:100%;min-width:0;padding:0;font:10px/1.5 var(--font,sans-serif);color:var(--text-primary)}.history-search input::placeholder{color:var(--text-muted)}.history-search button{display:flex;align-items:center;justify-content:center;border:0;background:none;padding:1px;color:var(--text-muted)}
.run-item:hover{background:var(--surface-hover)}.run-item.selected{background:var(--surface-active);color:var(--text-primary)}.edited-marker{color:var(--text-secondary);font-weight:500}
.history-list{flex:1;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;padding:0 6px 12px;overscroll-behavior:contain}.history-group{margin-top:11px}.history-group h3{font-size:9px;font-weight:500;color:var(--text-muted);padding:0 7px;margin:0 0 4px;line-height:1.6}.run-item{display:flex;align-items:flex-start;gap:6px;width:100%;min-width:0;padding:8px 7px;text-align:left;border:0;border-radius:3px;background:none;color:var(--text-secondary);margin:1px 0}.status-icon{display:flex;align-items:center;justify-content:center;width:12px;height:16px;flex-shrink:0;color:var(--text-muted)}.run-item.selected .status-icon{color:var(--text-primary)}.run-item.selected .run-meta{color:var(--text-secondary)}.run-text{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.run-text>strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;font-weight:500;line-height:1.5}.run-meta{display:flex;flex-wrap:wrap;align-items:center;gap:3px;font-size:8px;line-height:1.4;color:var(--text-muted)}.run-meta time{white-space:nowrap}.run-meta>span{white-space:nowrap}
.history-empty{padding:17px 9px;color:var(--text-muted);font-size:10px;line-height:1.7}.history-empty strong{display:block;font-size:10px;font-weight:500;color:var(--text-secondary);margin-bottom:3px}.history-empty p{margin:0}.search-count{flex-shrink:0;font-size:9px;color:var(--text-muted);padding:7px 11px;border-top:1px solid var(--border)}
</style>

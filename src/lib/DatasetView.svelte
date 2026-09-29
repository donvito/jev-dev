<script lang="ts">
  import { ArrowLeft, Copy, Download, FlaskConical } from 'lucide-svelte';
  import CodeEditor from './CodeEditor.svelte';
  import type { Dataset } from './domain';

  let { dataset, onback, oncopy, onexport, onexperiment }: {
    dataset: Dataset;
    onback: () => void;
    oncopy: (text: string) => void;
    onexport: () => void;
    onexperiment: () => void;
  } = $props();
  let view = $state<'json' | 'table'>('json');
  const json = $derived(JSON.stringify(dataset.rows, null, 2));
</script>

<div class="dataset-workbench">
  <div class="dataset-toolbar">
    <button class="icon-button" aria-label="All datasets" title="All datasets" onclick={onback}><ArrowLeft size={14}/></button>
    <strong>{dataset.name}</strong><span class="row-count">{dataset.rows.length} rows</span>
    <div class="dataset-actions">
      <div class="view-switch" aria-label="Dataset view">
        <button class:active={view === 'json'} aria-pressed={view === 'json'} onclick={() => view = 'json'}>JSON</button>
        <button class:active={view === 'table'} aria-pressed={view === 'table'} onclick={() => view = 'table'}>Table</button>
      </div>
      <button class="btn" onclick={() => oncopy(json)}><Copy size={12}/> Copy JSON</button>
      <button class="btn" onclick={onexport}><Download size={12}/> Export JSONL</button>
      <button class="btn primary" onclick={onexperiment}><FlaskConical size={12}/> Experiment</button>
    </div>
  </div>
  <p class="dataset-flow">Each row supplies <code>state</code>. Choose shared <code>questions</code> and <code>model</code> in experiment setup. <code>expected</code> is optional and used locally for scoring.</p>
  {#if view === 'json'}
    <div class="dataset-code"><CodeEditor value={json} readonly label="Dataset rows JSON"/></div>
  {:else}
    <div class="data-table-wrap"><table class="data-table"><thead><tr><th>ROW ID</th><th>STATE</th><th>EXPECTED LABELS</th></tr></thead><tbody>
      {#each dataset.rows as row}<tr><td class="mono">{row.id}</td><td><details><summary>{JSON.stringify(row.state).slice(0, 130)}</summary><pre>{JSON.stringify(row.state, null, 2)}</pre></details></td><td><pre>{JSON.stringify(row.expected, null, 2)}</pre></td></tr>{/each}
    </tbody></table></div>
  {/if}
</div>

<style>
  .dataset-workbench { min-width: 0; height: calc(100vh - 74px); display: flex; flex-direction: column; }
  .dataset-toolbar { display: flex; align-items: center; gap: 10px; min-height: 36px; flex-wrap: wrap; flex-shrink: 0; }
  .dataset-toolbar > strong { font-size: 12px; font-weight: 550; color: var(--text-primary); }
  .row-count { font-size: 10px; color: var(--text-muted); }
  .dataset-actions { margin-left: auto; display: flex; align-items: center; gap: 7px; }
  .view-switch { display: flex; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
  .view-switch button { padding: 5px 9px; border: 0; background: var(--surface); color: var(--text-muted); font: inherit; font-size: 10px; cursor: pointer; }
  .view-switch button.active { background: var(--surface-active); color: var(--text-primary); }
  .dataset-flow { margin: 8px 0 12px; font-size: 11px; line-height: 1.7; color: var(--text-muted); }
  code { color: var(--text-secondary); }
  .dataset-code { flex: 1; min-height: 280px; display: flex; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
  .data-table-wrap { flex: 1; overflow: auto; }
</style>

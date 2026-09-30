<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';
  import { errorMessage } from './storage';

  let { error, title = 'Run failed' }: { error: unknown; title?: string } = $props();
</script>

<div class="run-error" role="alert">
  <h3><AlertTriangle size={20}/>{title}</h3>
  <p>{errorMessage(error)}</p>
  <details>
    <summary>Error JSON</summary>
    <pre>{JSON.stringify(error, null, 2)}</pre>
  </details>
</div>

<style>
  .run-error{margin:14px;padding:18px;border:1px solid var(--error-border);border-left:4px solid var(--error-text);border-radius:5px;background:var(--error-surface);color:var(--error-text);font-size:12px;line-height:1.7;overflow-wrap:anywhere}
  h3{display:flex;align-items:center;gap:8px;font-size:15px;margin:0 0 12px;font-weight:600}
  p{margin:0 0 16px;white-space:pre-wrap}
  details{border-top:1px solid var(--error-border);padding-top:12px}
  summary{cursor:pointer}
  pre{font:10px/1.7 var(--mono);white-space:pre-wrap;margin:12px 0 0}
</style>

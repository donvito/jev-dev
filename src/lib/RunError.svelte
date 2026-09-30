<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';
  import { errorMessage } from './storage';

  let { error }: { error: unknown } = $props();
</script>

<div class="run-error" role="alert">
  <h3><AlertTriangle size={16}/>Run failed</h3>
  <p>{errorMessage(error)}</p>
  <details>
    <summary>Error JSON</summary>
    <pre>{JSON.stringify(error, null, 2)}</pre>
  </details>
</div>

<style>
  .run-error{padding:16px;color:var(--text-primary);font-size:11px;line-height:1.7;overflow-wrap:anywhere}
  h3{display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 12px;font-weight:600}
  p{margin:0 0 16px;white-space:pre-wrap}
  details{border-top:1px solid var(--border);padding-top:12px}
  summary{cursor:pointer;color:var(--text-secondary)}
  pre{font:10px/1.7 var(--mono);white-space:pre-wrap;margin:12px 0 0}
</style>

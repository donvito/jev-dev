<script lang="ts">
  import { Minus, Plus } from 'lucide-svelte';
  import { ZOOM_LEVELS, stepZoom, type ZoomLevel } from './zoom';

  let { value, onchange, label = 'App zoom' }: {
    value: ZoomLevel;
    onchange: (value: ZoomLevel) => void;
    label?: string;
  } = $props();
</script>

<div class="zoom-control" role="group" aria-label={label}>
  <button type="button" aria-label="Zoom out" title="Zoom out (⌘/Ctrl −)" disabled={value === ZOOM_LEVELS[0]} onclick={() => onchange(stepZoom(value, -1))}><Minus size={12}/></button>
  <select aria-label="Zoom percentage" title="Zoom percentage · reset with ⌘/Ctrl 0" value={value} onchange={event => onchange(Number(event.currentTarget.value) as ZoomLevel)}>
    {#each ZOOM_LEVELS as level}<option value={level}>{level}%</option>{/each}
  </select>
  <button type="button" aria-label="Zoom in" title="Zoom in (⌘/Ctrl +)" disabled={value === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onclick={() => onchange(stepZoom(value, 1))}><Plus size={12}/></button>
</div>

<style>
  .zoom-control { display: flex; align-items: center; flex-shrink: 0; height: 26px; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); color: var(--text-primary); }
  button { display: grid; place-items: center; width: 25px; height: 24px; padding: 0; border: 0; background: transparent; }
  button:hover:not(:disabled) { background: var(--surface-hover); }
  select { width: 65px; height: 24px; border: 0; border-inline: 1px solid var(--line); border-radius: 0; padding: 0 3px; background: var(--surface); color: var(--text-primary); font-size: 11px; font-variant-numeric: tabular-nums; cursor: pointer; }
</style>

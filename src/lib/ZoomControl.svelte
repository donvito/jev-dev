<script lang="ts">
  import CustomSelect from './CustomSelect.svelte';
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
  <CustomSelect label="Zoom percentage" title="Zoom percentage · reset with ⌘/Ctrl 0" value={String(value)} compact plain options={ZOOM_LEVELS.map(level=>({value:String(level),label:`${level}%`}))} onchange={level=>onchange(Number(level) as ZoomLevel)}/>

  <button type="button" aria-label="Zoom in" title="Zoom in (⌘/Ctrl +)" disabled={value === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onclick={() => onchange(stepZoom(value, 1))}><Plus size={12}/></button>
</div>

<style>
  .zoom-control { display: flex; align-items: center; flex-shrink: 0; height: 26px; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); color: var(--text-primary); }
  button { display: grid; place-items: center; width: 25px; height: 24px; padding: 0; border: 0; background: transparent; }
  button:hover:not(:disabled) { background: var(--surface-hover); }

</style>

<script lang="ts">
  import { tick } from 'svelte';
  import { Check, ChevronDown } from 'lucide-svelte';
  import { nextEnabled, findOption, type SelectOption } from './select-options';

  let { value = $bindable(''), options, label, id, title, placeholder = 'Select…', disabled = false,
    compact = false, plain = false, prefix = '', selectedLabel, onchange }: {
    value?: string; options: SelectOption[]; label: string; id?: string; title?: string; placeholder?: string;
    disabled?: boolean; compact?: boolean; plain?: boolean; prefix?: string; selectedLabel?: string;
    onchange?: (value: string) => void;
  } = $props();
  const uid = `select-${crypto.randomUUID()}`;
  let open = $state(false);
  let active = $state(-1);
  let trigger: HTMLButtonElement;
  let popup = $state<HTMLDivElement>();
  let query = '', queryTime = 0;
  let position = $state('');
  const selected = $derived(options.find(option => option.value === value));

  function close(restore = false) { open = false; query = ''; if (restore) trigger?.focus(); }
  async function reveal(direction: 1 | -1 = 1) {
    if (disabled || open) return;
    active = options.findIndex(option => option.value === value && !option.disabled);
    if (active < 0) active = nextEnabled(options, direction === 1 ? -1 : 0, direction);
    open = true;
    await tick();
    scrollActive();
  }
  function scrollActive() { popup?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    close(true); if (onchange) onchange(option.value); else value = option.value;
  }
  async function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!open) { await reveal(event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1); return; }
      if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
      if (event.key === 'Home') active = nextEnabled(options, -1, 1);
      else if (event.key === 'End') active = nextEnabled(options, 0, -1);
      else active = nextEnabled(options, active, event.key === 'ArrowDown' ? 1 : -1);
      await tick(); scrollActive();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault(); event.stopPropagation();
      if (!open) await reveal();
      const now = Date.now(); query = now - queryTime > 600 ? event.key : query + event.key; queryTime = now;
      const index = findOption(options, query, query.length === 1 ? active : active - 1);
      if (index >= 0) { active = index; await tick(); scrollActive(); }
    }
  }
  function keyboardControl(node: HTMLButtonElement) {
    // Handle keys at the trigger before a containing dialog handles Escape or Tab.
    node.addEventListener('keydown', keydown);
    return { destroy() { node.removeEventListener('keydown', keydown); } };
  }
  function menu(node: HTMLDivElement) {
    document.body.appendChild(node);
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;
    const minWidth = options.some(option => option.detail) ? 260 : compact ? 160 : 220;
    const width = Math.min(Math.max(rect.width / zoom, minWidth), vw - 16);
    const below = vh - rect.bottom / zoom - 12, above = rect.top / zoom - 12;
    const upwards = below < 180 && above > below;
    const height = Math.max(60, Math.min(300, upwards ? above : below));
    const left = Math.max(8, Math.min(rect.left / zoom, vw - width - 8));
    position = `left:${left}px;width:${width}px;max-height:${height}px;${upwards ? `bottom:${vh - rect.top / zoom + 4}px` : `top:${rect.bottom / zoom + 4}px`}`;
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => { if (!node.contains(event.target as Node)) close(); };
    const blur = () => close();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', blur); window.addEventListener('blur', blur);
    return { destroy() { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', blur); window.removeEventListener('blur', blur); node.remove(); } };
  }
  $effect(() => { if (disabled) close(); });
</script>

<div class="custom-select" class:compact class:plain>
  <button bind:this={trigger} use:keyboardControl {id} type="button" class="select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? uid : undefined} aria-activedescendant={open && active >= 0 ? `${uid}-${active}` : undefined} {title} {disabled} onclick={() => open ? close() : reveal()}>
    {#if prefix}<span class="select-prefix">{prefix}</span>{/if}<span class="select-value" class:placeholder={!selected && !selectedLabel}>{selectedLabel ?? selected?.label ?? placeholder}</span><ChevronDown size={12} aria-hidden="true"/>
  </button>
  {#if open}
    <div bind:this={popup} use:menu id={uid} class="select-list" role="listbox" aria-label={label} style={position}>
      {#each options as option, index}
        <button type="button" tabindex="-1" id={`${uid}-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} class="select-option" class:highlighted={active === index} class:disabled={option.disabled} data-index={index} onpointermove={() => { if (!option.disabled) active = index; }} onmousedown={event => event.preventDefault()} onclick={() => choose(index)}>
          <span class="option-check">{#if option.value === value}<Check size={13}/>{/if}</span><span class="option-label">{option.label}</span>{#if option.detail}<span class="option-detail">{option.detail}</span>{/if}
        </button>
      {:else}<div class="select-empty">No options available</div>{/each}
    </div>
  {/if}
</div>

<style>
.custom-select{display:inline-block;min-width:0;width:100%;vertical-align:middle;font-size:11px;font-weight:400}.select-trigger{display:flex;align-items:center;gap:7px;width:100%;min-width:0;min-height:32px;padding:7px 10px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text-primary);font:inherit;line-height:1.4;text-align:left;cursor:pointer}.select-trigger:hover:not(:disabled){background:var(--surface-hover);border-color:var(--border-strong)}.select-trigger:focus-visible{outline:2px solid var(--focus);outline-offset:2px}.select-trigger:disabled{opacity:.45;cursor:not-allowed}.select-trigger :global(svg){flex-shrink:0;margin-left:auto}.select-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.select-prefix,.placeholder{color:var(--text-muted)}.select-prefix{flex-shrink:0}.compact{width:auto;max-width:260px}.compact .select-trigger{min-height:24px;padding:3px 7px}.plain .select-trigger{background:transparent;border-color:transparent}.plain .select-trigger:hover{background:var(--surface-hover)}
.select-list{position:fixed;z-index:10000;box-sizing:border-box;margin:0;padding:4px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);box-shadow:0 8px 28px var(--shadow);overflow:auto;overscroll-behavior:contain;color:var(--text-primary);font:11px/1.5 var(--font,sans-serif)}.select-option{border:0;background:transparent;color:inherit;font:inherit;width:100%;text-align:left;display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:3px;cursor:pointer;min-height:30px;box-sizing:border-box}.select-option.highlighted{background:var(--surface-hover)}.select-option[aria-selected="true"]{font-weight:600}.select-option.disabled{opacity:.4;cursor:not-allowed}.option-check{display:flex;align-items:center;width:14px;flex-shrink:0}.option-label{min-width:0;overflow-wrap:anywhere}.option-detail{margin-left:auto;color:var(--text-muted);font-size:10px;white-space:nowrap}.select-empty{padding:12px;color:var(--text-muted)}
</style>

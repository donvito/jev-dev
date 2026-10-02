<script lang="ts">
  import { Monitor } from 'lucide-svelte';
  import { THEMES, type ThemePreference } from './theme';

  let { value, onchange }: {
    value: ThemePreference;
    onchange: (value: ThemePreference) => void;
  } = $props();
</script>

<fieldset class="theme-picker">
  <legend>Theme</legend>
  <label class="system-choice" class:selected={value === 'system'}>
    <Monitor size={16} aria-hidden="true"/>
    <span class="system-label"><strong>System</strong><span>Match your device appearance</span></span>
    <input type="radio" name="appearance-theme" value="system" aria-label="System" checked={value === 'system'} onchange={() => onchange('system')}/>
  </label>
  <div class="theme-grid">
    {#each THEMES as theme}
      <label class="theme-choice" class:selected={value === theme.id}>
        <span class="theme-preview" aria-hidden="true" style={`--preview-canvas: ${theme.canvas}; --preview-surface: ${theme.surface}; --preview-accent: ${theme.accent}`}>
          <span class="preview-sidebar"><span></span><span></span><span></span></span>
          <span class="preview-editor"><span></span><span></span><span></span></span>
          <span class="preview-result"><span></span><span></span></span>
        </span>
        <span class="theme-heading"><strong>{theme.label}</strong><input type="radio" name="appearance-theme" value={theme.id} aria-label={theme.label} checked={value === theme.id} onchange={() => onchange(theme.id)}/></span>
        <span class="theme-description">{theme.description}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .theme-picker { min-width: 0; margin: 0 0 16px; padding: 0; border: 0; }
  legend { margin-bottom: 12px; padding: 0; color: var(--text-secondary); font-size: 11px; }
  .system-choice, .theme-choice { border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: var(--surface); }
  .system-choice:hover, .theme-choice:hover { border-color: var(--border-strong); background: var(--surface-subtle); }
  .system-choice.selected, .theme-choice.selected { border-color: var(--focus); background: var(--surface-subtle); box-shadow: inset 0 0 0 1px var(--focus); }
  .system-choice:focus-within, .theme-choice:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
  .system-choice { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 10px 12px; color: var(--text-secondary); }
  .system-label { display: flex; flex: 1; flex-direction: column; gap: 3px; }
  strong { font-size: 11px; font-weight: 500; color: var(--text-primary); }
  .system-label > span, .theme-description { font-size: 10px; color: var(--text-muted); line-height: 1.5; }
  input { flex-shrink: 0; width: 13px; height: 13px; margin: 0; accent-color: var(--control); cursor: pointer; }
  .theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 10px; }
  .theme-choice { display: flex; flex-direction: column; min-width: 0; padding: 8px; }
  .theme-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 9px 2px 3px; }
  .theme-description { margin-inline: 2px; }
  .theme-preview { display: flex; gap: 4px; height: 56px; padding: 5px; overflow: hidden; border-radius: 2px; background: var(--preview-canvas); }
  .preview-sidebar { display: flex; flex: 0 0 22%; flex-direction: column; gap: 4px; padding: 5px 3px; }
  .preview-sidebar > span { height: 3px; border-radius: 1px; background: var(--preview-accent); opacity: .3; }
  .preview-sidebar > span:first-child { opacity: .8; }
  .preview-editor, .preview-result { display: flex; flex: 1; flex-direction: column; gap: 5px; padding: 8px 5px; border-radius: 1px; background: var(--preview-surface); }
  .preview-editor > span, .preview-result > span { height: 3px; border-radius: 1px; background: var(--preview-accent); opacity: .6; }
  .preview-editor > span:nth-child(2) { width: 65%; opacity: .3; }
  .preview-editor > span:nth-child(3) { width: 80%; }
  .preview-result { flex: .65; }
  .preview-result > span:last-child { width: 60%; opacity: .3; }
</style>

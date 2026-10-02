<script lang="ts">
  import { Palette } from 'lucide-svelte';
  import { THEMES, isThemePreference, type ThemePreference } from './theme';

  let { value, onchange }: {
    value: ThemePreference;
    onchange: (value: ThemePreference) => void;
  } = $props();
</script>

<div class="theme-control">
  <Palette size={13} aria-hidden="true"/>
  <select aria-label="Theme" title="Theme" {value} onchange={event => { const preference = event.currentTarget.value; if (isThemePreference(preference)) onchange(preference); }}>
    <option value="system">System</option>
    {#each THEMES as theme}<option value={theme.id}>{theme.label}</option>{/each}
  </select>
</div>

<style>
  .theme-control { display: flex; align-items: center; gap: 5px; height: 26px; padding-left: 7px; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); color: var(--text-secondary); }
  select { width: 88px; height: 24px; border: 0; padding: 0 4px; border-radius: 0 3px 3px 0; background: var(--surface); color: var(--text-primary); font-size: 11px; cursor: pointer; }
</style>

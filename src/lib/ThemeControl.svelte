<script lang="ts">
  import CustomSelect from './CustomSelect.svelte';
  import { Palette } from 'lucide-svelte';
  import { THEMES, isThemePreference, type ThemePreference } from './theme';

  let { value, onchange }: {
    value: ThemePreference;
    onchange: (value: ThemePreference) => void;
  } = $props();
</script>

<div class="theme-control">
  <Palette size={13} aria-hidden="true"/>
  <CustomSelect label="Theme" title="Theme" {value} compact plain options={[{value:'system',label:'System'},...THEMES.map(theme=>({value:theme.id,label:theme.label}))]} onchange={preference => { if (isThemePreference(preference)) onchange(preference); }}/>

</div>

<style>
  .theme-control { display: flex; align-items: center; gap: 5px; height: 26px; padding-left: 7px; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); color: var(--text-secondary); }

</style>

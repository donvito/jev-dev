export interface SelectOption { value: string; label: string; disabled?: boolean; detail?: string }

export function nextEnabled(options: SelectOption[], current: number, direction: 1 | -1): number {
  for (let offset = 1; offset <= options.length; offset++) {
    const index = (current + direction * offset + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function findOption(options: SelectOption[], query: string, current: number): number {
  for (let offset = 1; offset <= options.length; offset++) {
    const index = (current + offset + options.length) % options.length;
    if (!options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())) return index;
  }
  return -1;
}

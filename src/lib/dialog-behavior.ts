/** Shared behavior for app-rendered dialogs: inert background, focus trap and restoration. */
export function dialogBehavior(node: HTMLElement, close: () => void) {
  const previous = document.activeElement as HTMLElement | null;
  const inert: Array<[HTMLElement, boolean]> = [];
  let branch: HTMLElement = node.parentElement!;
  while (branch && branch !== document.body) {
    for (const sibling of [...branch.parentElement!.children]) {
      if (sibling !== branch && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) {
        inert.push([sibling, sibling.inert]); sibling.inert = true;
      }
    }
    branch = branch.parentElement!;
  }
  const frame = requestAnimationFrame(() => (node.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), [role="combobox"]') ?? node.querySelector<HTMLElement>('button:not(:disabled)') ?? node).focus());
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(element => element.getClientRects().length && !element.closest('[inert]'));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); node.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  node.addEventListener('keydown', keydown);
  return { update(callback: () => void) { close = callback; }, destroy() { cancelAnimationFrame(frame); node.removeEventListener('keydown', keydown); for (const [element, wasInert] of inert) element.inert = wasInert; if (previous?.isConnected) previous.focus(); } };
}

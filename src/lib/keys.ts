export const plainKey = (e: KeyboardEvent) => !e.altKey && !e.ctrlKey && !e.metaKey

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select'))
}

export function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('button, a[href], input, textarea, select, [role="slider"], [role="button"]')
}

export function ownsArrows(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [role="slider"], [role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"]')
}

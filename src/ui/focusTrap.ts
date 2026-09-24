// Minimal focus-trap helpers shared by UiDialog and UiPopover.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/** Keeps Tab / Shift+Tab inside `container`. Call from a keydown handler. */
export function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return
  const items = focusableWithin(container)
  if (items.length === 0) {
    event.preventDefault()
    container.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Focuses the first focusable child, or the container itself. */
export function focusFirst(container: HTMLElement): void {
  const [first] = focusableWithin(container)
  ;(first ?? container).focus()
}

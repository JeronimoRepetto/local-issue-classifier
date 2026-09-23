// The beforeunload guard (SPEC.md §2.1 "Reload during a run"): while a run
// (GitHub loading or Jev classification) is active, reloading or closing the
// tab loses the in-memory keys and cancels the run, so the browser is asked
// to confirm first. When idle, no listener is registered at all, so an
// ordinary reload never sees a "leave site?" prompt. Task 8's loader and
// Task 11's classification runner call setRunActive() around their work.
let active = false

function onBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault()
  // Legacy browsers show their own generic prompt only when returnValue is set.
  event.returnValue = ''
}

export function setRunActive(next: boolean): void {
  if (next === active) return
  active = next
  if (active) {
    window.addEventListener('beforeunload', onBeforeUnload)
  } else {
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}

export function isRunActive(): boolean {
  return active
}

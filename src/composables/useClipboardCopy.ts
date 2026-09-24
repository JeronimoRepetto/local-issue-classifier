// Shared copy-with-feedback behaviour, extracted from LocalSetupGuide.vue so
// ProviderOnboardingCard's Home summary can show the same "Copied" label per
// command line without duplicating the clipboard / execCommand-fallback
// logic. One feedback slot per composable instance, matching the guide's
// original behaviour (only one line shows "Copied" at a time).
import { ref } from 'vue'
import type { Ref } from 'vue'

const FEEDBACK_MS = 2000

function fallbackCopy(text: string): void {
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(el)
  }
}

export interface ClipboardCopy {
  /** The id of the just-copied line, or null; clears itself after the feedback window. */
  copiedId: Ref<string | null>
  copy(id: string, text: string | null | undefined): Promise<void>
}

export function useClipboardCopy(): ClipboardCopy {
  const copiedId = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(id: string, text: string | null | undefined): Promise<void> {
    if (!text) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        fallbackCopy(text)
      }
    } catch {
      fallbackCopy(text)
    }
    copiedId.value = id
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, FEEDBACK_MS)
  }

  return { copiedId, copy }
}

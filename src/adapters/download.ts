// Anchor-based download helper (SPEC.md §6.5), ported from the AI-Tools
// house style (qr-tool/design-studio's downloadBlob/downloadText): Blob URL
// → <a download> click → revoke on the next tick, so the click has already
// fired before the URL is invalidated.
function trigger(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  trigger(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

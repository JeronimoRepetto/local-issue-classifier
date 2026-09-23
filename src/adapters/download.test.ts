// Task 13 — SPEC.md §6.5: "downloadText(filename, text) is anchor-based:
// Blob URL → <a download> click → revoke on the next tick." Mirrors the
// AI-Tools house style (qr-tool/design-studio's downloadBlob/downloadText).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob, downloadText } from './download'

describe('downloadBlob — anchor-based download', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    createObjectURL = vi.fn(() => 'blob:fake-url')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    clickSpy = vi.fn()
    HTMLAnchorElement.prototype.click = clickSpy
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('creates an object URL, clicks a temporary anchor with the filename, then removes it', () => {
    downloadBlob(new Blob(['x']), 'report.txt')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('a[download]')).toHaveLength(0) // removed synchronously
  })

  it('revokes the object URL, but not synchronously (on the next tick)', () => {
    downloadBlob(new Blob(['x']), 'report.txt')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('downloadText wraps the text in a text/plain UTF-8 Blob by default', () => {
    let capturedBlob: Blob | null = null
    createObjectURL.mockImplementation((blob: Blob) => {
      capturedBlob = blob
      return 'blob:fake-url'
    })
    downloadText('hello', 'report.txt')
    expect(capturedBlob).not.toBeNull()
    expect(capturedBlob!.type).toBe('text/plain;charset=utf-8')
  })
})

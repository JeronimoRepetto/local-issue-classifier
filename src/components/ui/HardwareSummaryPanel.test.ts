// "Your computer" hardware summary panel (layout change, user decisions
// 2026-09-24): extracted from ProviderOnboardingCard.vue so it renders as its
// own sibling panel on Home instead of living inside the provider card.
// Presentational: it takes the already-detected report as a prop and never
// touches useHardwareDetection() itself (see HardwareSummaryPanel.vue's own
// comment) — the container passes the shared, module-scope cached report.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unknownHardwareReport } from '../../domain/hardware'
import type { HardwareReport } from '../../domain/hardware'
import HardwareSummaryPanel from './HardwareSummaryPanel.vue'

const RTX_5070: HardwareReport = {
  gpu: { vendor: 'nvidia', model: 'NVIDIA GeForce RTX 5070', vramGb: 12, source: 'webgl' },
  ramGb: 8,
  ramIsLowerBound: true,
  cpuThreads: 16,
  platform: 'Windows',
  unifiedMemory: false,
  confidence: 'high',
}

describe('HardwareSummaryPanel', () => {
  it('has its own "Your computer" title', () => {
    const wrapper = mount(HardwareSummaryPanel, { props: { report: null } })
    expect(wrapper.find('[data-test="hardware-summary-panel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Your computer')
  })

  it('shows Detecting… while report is null', () => {
    const wrapper = mount(HardwareSummaryPanel, { props: { report: null } })
    expect(wrapper.get('[data-test="hardware-box-detecting"]').text()).toContain('Detecting')
    expect(wrapper.find('[data-test="hardware-box-gpu"]').exists()).toBe(false)
  })

  it('shows GPU + VRAM, the "≥ 8 GB" lower-bound RAM wording, CPU threads and tier chips for a detected report', () => {
    const wrapper = mount(HardwareSummaryPanel, { props: { report: RTX_5070 } })

    expect(wrapper.get('[data-test="hardware-box-gpu"]').text()).toBe('NVIDIA GeForce RTX 5070 · 12 GB')
    expect(wrapper.get('[data-test="hardware-box-ram"]').text()).toContain('≥ 8 GB')
    expect(wrapper.get('[data-test="hardware-box-cpu"]').text()).toContain('16')

    expect(wrapper.get('[data-test="hardware-box-tier-kev-0.8b"]').text()).toContain('Fits')
    expect(wrapper.get('[data-test="hardware-box-tier-kev-4b"]').text()).toContain('Fits')
    expect(wrapper.get('[data-test="hardware-box-tier-jevk5"]').text()).toContain('Fits')
    expect(wrapper.get('[data-test="hardware-box-tier-kev-9b"]').text()).toContain("Won't fit")
    expect(wrapper.get('[data-test="hardware-box-recommendation"]').text()).toContain('JevK5')
  })

  it('shows "Unknown GPU — set it in Settings" and unknown chips when nothing was detected', () => {
    const wrapper = mount(HardwareSummaryPanel, { props: { report: unknownHardwareReport() } })

    expect(wrapper.get('[data-test="hardware-box-gpu"]').text()).toContain('Unknown GPU — set it in Settings')
    expect(wrapper.get('[data-test="hardware-box-ram"]').text().toLowerCase()).toContain('unknown')
    expect(wrapper.get('[data-test="hardware-box-cpu"]').text().toLowerCase()).toContain('unknown')
    expect(wrapper.get('[data-test="hardware-box-tier-kev-0.8b"]').text()).toContain('Unknown')
    expect(wrapper.get('[data-test="hardware-box-recommendation"]').text().toLowerCase()).toContain('cloud')
  })

  it('emits open-settings, through a secondary/ghost action that is never primary', async () => {
    const wrapper = mount(HardwareSummaryPanel, { props: { report: RTX_5070 } })
    const link = wrapper.get('[data-test="hardware-box-settings-link"]')
    expect(link.classes()).not.toContain('ui-button--primary')
    await link.trigger('click')
    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })

  it('never imports a composable (props in, presentational only)', () => {
    const source = readFileSync(join(__dirname, 'HardwareSummaryPanel.vue'), 'utf8')
    expect(source).not.toMatch(/from\s+['"][^'"]*composables[^'"]*['"]/)
  })
})

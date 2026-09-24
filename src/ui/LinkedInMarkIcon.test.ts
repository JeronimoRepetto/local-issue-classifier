// LinkedIn "in" brand mark (user decision 2026-09-24): reproduces LinkedIn's own
// official [in] Logo geometry unaltered (colour and shape), per
// https://brand.linkedin.com/in-logo ("Please Do Not: Modify the color or the
// shape of the [in] Logo"). See THIRD_PARTY_NOTICES.md ("Brand icons") for the
// full sourcing note and docs/design.md ("Icons") for why this is exempt from
// the shared `--color-icon-social` token GitHubMarkIcon uses.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import LinkedInMarkIcon from './LinkedInMarkIcon.vue'

const SOURCE = readFileSync(join(__dirname, 'LinkedInMarkIcon.vue'), 'utf8')

// Verbatim path data from brand.linkedin.com/in-logo's own `inbug-blue-28` inline
// SVG symbol (viewBox 0 0 28 28) - that guidelines page's own nav/footer logo.
const IN_LOGO_PATH =
  'm25.9 0h-23.8c-1.2 0-2.1 0.9-2.1 2v24c0 1.1 0.9 2 2.1 2h23.9c1.1 0 2.1-0.9 2.1-2v-24c-0.1-1.1-1-2-2.2-2zm-17.6 23.9h-4.1v-13.4h4.2v13.4zm-2.1-15.2c-1.3 0-2.4-1.1-2.4-2.4s1.1-2.4 2.4-2.4 2.4 1.1 2.4 2.4-1 2.4-2.4 2.4zm17.7 15.2h-4.1v-6.5c0-1.5 0-3.5-2.2-3.5s-2.5 1.7-2.5 3.4v6.6h-4.1v-13.4h4v1.8h0.1c0.6-1 1.9-2.2 3.9-2.2 4.2 0 5 2.8 5 6.4v7.4z'

describe('LinkedInMarkIcon', () => {
  it('renders the official [in] Logo geometry unaltered, as a single decorative path', () => {
    const wrapper = mount(LinkedInMarkIcon)
    const svg = wrapper.get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 28 28')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')

    const paths = wrapper.findAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0]!.attributes('d')).toBe(IN_LOGO_PATH)
  })

  it('paints the approved black/white variants from the dedicated brand token, never currentColor or icon-social', () => {
    expect(SOURCE).toContain('--color-brand-linkedin-mark')
    // Checks actual usage (an attribute/declaration value), not just the word:
    // the source is free to *discuss* currentColor in a comment explaining why
    // it is avoided (as this file's own header does).
    expect(SOURCE).not.toMatch(/(fill|color)\s*[:=]\s*["']?currentColor/i)
    expect(SOURCE).not.toMatch(/(fill|color)\s*[:=]\s*["']?var\(--color-(icon-social|text)\)/i)
  })

  it('never recolors or reshapes the mark: no raw hex, transform or filter in the component source', () => {
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(SOURCE).not.toMatch(/transform\s*[:(]/)
    expect(SOURCE).not.toMatch(/filter\s*:/)
  })
})

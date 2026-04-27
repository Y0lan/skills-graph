// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, cleanup } from '@testing-library/react'

import { MarkdownNote } from '../markdown-note'

afterEach(() => cleanup())

describe('<MarkdownNote> — heading hierarchy (A.8 / codex Y1+Y2)', () => {
  it('default variant renders h1 / h2 / h3 with distinct font sizes', () => {
    const { container } = render(
      <MarkdownNote content={'# Big\n\n## Mid\n\n### Small'} />,
    )
    const h1 = container.querySelector('h1') as HTMLHeadingElement
    const h2 = container.querySelector('h2') as HTMLHeadingElement
    const h3 = container.querySelector('h3') as HTMLHeadingElement
    expect(h1).toBeInTheDocument()
    expect(h2).toBeInTheDocument()
    expect(h3).toBeInTheDocument()
    // Wrapper className should carry the progressive scale.
    const wrapper = h1.parentElement!
    expect(wrapper.className).toMatch(/\[&_h1\]:text-base/)
    expect(wrapper.className).toMatch(/\[&_h2\]:text-sm/)
    expect(wrapper.className).toMatch(/\[&_h3\]:text-xs/)
  })

  it('compact variant uses tighter scale (eng-review I5)', () => {
    const { container } = render(
      <MarkdownNote content={'# Big\n\n## Mid'} variant="compact" />,
    )
    const h1 = container.querySelector('h1') as HTMLHeadingElement
    const wrapper = h1.parentElement!
    expect(wrapper.className).toMatch(/\[&_h1\]:text-sm/)
    expect(wrapper.className).toMatch(/\[&_h2\]:text-xs/)
    // Compact h1 must NOT carry the default's text-base.
    expect(wrapper.className).not.toMatch(/\[&_h1\]:text-base/)
  })

  it('renders GFM features (strong, emphasis) via remarkGfm', () => {
    const { container } = render(
      <MarkdownNote content={'**bold** and *ital*'} />,
    )
    expect(container.querySelector('strong')).toBeInTheDocument()
    expect(container.querySelector('em')).toBeInTheDocument()
  })

  it('passes through extra className compositionally', () => {
    const { container } = render(
      <MarkdownNote content="hello" className="overflow-hidden" />,
    )
    const wrapper = container.querySelector('div') as HTMLDivElement
    expect(wrapper.className).toMatch(/overflow-hidden/)
    // Variant base class also still present.
    expect(wrapper.className).toMatch(/prose/)
  })
})

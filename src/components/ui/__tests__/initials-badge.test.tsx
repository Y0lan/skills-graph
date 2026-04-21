// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import InitialsBadge, { getInitials, getToneIndex } from '../initials-badge'

afterEach(() => cleanup())

describe('getInitials', () => {
  it('two-word name → first letter of first + last', () => {
    expect(getInitials('Pierre LEFEVRE')).toBe('PL')
  })

  it('single-word name → first letter only', () => {
    expect(getInitials('Pierre')).toBe('P')
  })

  it('three-word name → first and last (not middle)', () => {
    expect(getInitials('Marie-Claire de Lafayette')).toBe('ML')
  })

  it('empty / null / undefined → "?"', () => {
    expect(getInitials('')).toBe('?')
    expect(getInitials('   ')).toBe('?')
    expect(getInitials(null)).toBe('?')
    expect(getInitials(undefined)).toBe('?')
  })

  it('is uppercase regardless of input', () => {
    expect(getInitials('pierre lefèvre')).toBe('PL')
  })
})

describe('getToneIndex', () => {
  it('is deterministic — same name always returns same index', () => {
    const a = getToneIndex('Pierre LEFEVRE')
    const b = getToneIndex('Pierre LEFEVRE')
    expect(a).toBe(b)
  })

  it('different names generally produce different indices', () => {
    const indices = new Set([
      getToneIndex('Pierre LEFEVRE'),
      getToneIndex('Marie Curie'),
      getToneIndex('John Doe'),
      getToneIndex('Ada Lovelace'),
    ])
    // Not guaranteed all-distinct on 8 tones with 4 samples, but > 1 tone in use
    expect(indices.size).toBeGreaterThanOrEqual(2)
  })

  it('empty name returns index 0', () => {
    expect(getToneIndex('')).toBe(0)
    expect(getToneIndex(null)).toBe(0)
  })
})

describe('<InitialsBadge>', () => {
  it('renders initials for a normal name', () => {
    render(<InitialsBadge name="Pierre LEFEVRE" />)
    expect(screen.getByText('PL')).toBeInTheDocument()
  })

  it('renders aria-label matching the name', () => {
    render(<InitialsBadge name="Pierre LEFEVRE" />)
    expect(screen.getByRole('img', { name: 'Pierre LEFEVRE' })).toBeInTheDocument()
  })

  it('renders "?" when name is missing', () => {
    render(<InitialsBadge name="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('renders an <img> when photoUrl is provided', () => {
    render(<InitialsBadge name="Pierre LEFEVRE" photoUrl="/photo.jpg" />)
    const img = screen.getByRole('img', { name: 'Pierre LEFEVRE' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', '/photo.jpg')
  })

  it.each([['sm'], ['md'], ['lg']] as const)('applies size class for %s', (size) => {
    render(<InitialsBadge name="PL" size={size} />)
    const el = screen.getByRole('img')
    const expected = size === 'sm' ? 'h-8' : size === 'md' ? 'h-12' : 'h-16'
    expect(el.className).toContain(expected)
  })
})

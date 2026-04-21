// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import FieldSourceTag from '../field-source-tag'

afterEach(() => cleanup())

describe('<FieldSourceTag>', () => {
  it('renders nothing when sourceDoc is cv (default, expected case)', () => {
    const { container } = render(<FieldSourceTag field={{ sourceDoc: 'cv' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when sourceDoc is null or merged', () => {
    const { container: c1 } = render(<FieldSourceTag field={{ sourceDoc: null }} />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<FieldSourceTag field={{ sourceDoc: 'merged' }} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('renders "LM" when sourceDoc is lettre', () => {
    render(<FieldSourceTag field={{ sourceDoc: 'lettre' }} />)
    expect(screen.getByText('LM')).toBeInTheDocument()
    expect(screen.getByLabelText(/lettre de motivation/i)).toBeInTheDocument()
  })

  it('renders "Manuel" when sourceDoc is human (manual entry)', () => {
    render(<FieldSourceTag field={{ sourceDoc: 'human' }} />)
    expect(screen.getByText('Manuel')).toBeInTheDocument()
    expect(screen.getByLabelText(/saisie manuelle/i)).toBeInTheDocument()
  })
})

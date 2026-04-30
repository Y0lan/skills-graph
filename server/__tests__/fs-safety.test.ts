import { describe, it, expect } from 'vitest'
import { resolveSafePath } from '../lib/fs-safety.js'

describe('resolveSafePath', () => {
  it('allows normal filenames', async () => {
    const result = resolveSafePath('/data/documents/abc', 'cv.pdf')
    expect(result).toBe('/data/documents/abc/cv.pdf')
  })

  it('blocks ../ traversal attempts', async () => {
    expect(() => resolveSafePath('/data/documents/abc', '../../../etc/passwd'))
      .toThrow('Path traversal attempt blocked')
  })

  it('blocks absolute path injection', async () => {
    expect(() => resolveSafePath('/data/documents/abc', '/etc/passwd'))
      .toThrow('Path traversal attempt blocked')
  })

  it('allows nested subdirectories within base', async () => {
    const result = resolveSafePath('/data/documents', 'abc', 'cv.pdf')
    expect(result).toBe('/data/documents/abc/cv.pdf')
  })
})

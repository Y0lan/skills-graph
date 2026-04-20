import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock clamscan module ────────────────────────────────────────────

const mockIsInfected = vi.fn()
const mockInit = vi.fn()

vi.mock('clamscan', () => {
  // Return a class-like constructor that supports `new NodeClam().init(...)`
  class MockNodeClam {
    async init() {
      return mockInit()
    }
  }
  return { default: MockNodeClam }
})

// ─── Mock fs ─────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-file-content')),
  },
}))

// ─── Mock global fetch (for VirusTotal) ──────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Import after mocks ─────────────────────────────────────────────

import { scanDocument } from '../lib/document-scanner.js'

describe('Document Scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.VIRUSTOTAL_API_KEY
    delete process.env.CLAMAV_HOST
  })

  it('returns safe with warning when ClamAV is unavailable', async () => {
    // ClamAV init throws (daemon not running)
    mockInit.mockRejectedValueOnce(new Error('Connection refused'))
    // No VirusTotal key
    delete process.env.VIRUSTOTAL_API_KEY

    const result = await scanDocument('/tmp/test.pdf', 'test.pdf')

    expect(result.safe).toBe(true)
    expect(result.engines).toEqual([]) // neither engine available
    expect(result.threats).toEqual([])
  })

  it('skips VirusTotal when API key is not set', async () => {
    // ClamAV succeeds and reports clean
    mockInit.mockResolvedValueOnce({ isInfected: mockIsInfected })
    mockIsInfected.mockResolvedValueOnce({ isInfected: false, viruses: [] })
    delete process.env.VIRUSTOTAL_API_KEY

    const result = await scanDocument('/tmp/test.pdf', 'test.pdf')

    expect(result.safe).toBe(true)
    expect(result.engines).toEqual(['ClamAV'])
    // fetch should not have been called (no VT key)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns safe with empty engines when both are unavailable', async () => {
    mockInit.mockRejectedValueOnce(new Error('Connection refused'))
    delete process.env.VIRUSTOTAL_API_KEY

    const result = await scanDocument('/tmp/test.pdf', 'test.pdf')

    expect(result.safe).toBe(true)
    expect(result.engines).toEqual([])
    expect(result.threats).toEqual([])
  })

  it('returns infected with both engines in parallel when ClamAV detects', async () => {
    // After commit 09032c5: scanDocument runs ClamAV + VT in parallel so the
    // dialog shows BOTH outcomes even when one engine catches first. Old
    // behavior was sequential short-circuit; intentional change for the
    // 'full details' UX requirement.
    mockInit.mockResolvedValueOnce({ isInfected: mockIsInfected })
    mockIsInfected.mockResolvedValueOnce({ isInfected: true, viruses: ['Eicar-Test-Signature'] })
    process.env.VIRUSTOTAL_API_KEY = 'vt-key-123'

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'analysis-1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            attributes: {
              status: 'completed',
              stats: { malicious: 0, suspicious: 0, undetected: 5, harmless: 55 },
              results: {},
            },
          },
        }),
      })

    const result = await scanDocument('/tmp/malware.exe', 'malware.exe')

    expect(result.safe).toBe(false)
    expect(result.engines).toContain('ClamAV')
    expect(result.engines.some(e => e.startsWith('VirusTotal'))).toBe(true)
    expect(result.threats).toContain('ClamAV: Eicar-Test-Signature')
    expect(result.engineSummaries).toBeDefined()
    expect(result.engineSummaries?.length).toBe(2)
  })

  it('calls VirusTotal when ClamAV is clean and VT key is set', async () => {
    mockInit.mockResolvedValueOnce({ isInfected: mockIsInfected })
    mockIsInfected.mockResolvedValueOnce({ isInfected: false, viruses: [] })
    process.env.VIRUSTOTAL_API_KEY = 'vt-key-123'

    // Mock VT upload response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'analysis-1' } }),
      })
      // Mock VT poll response (completed, clean)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            attributes: {
              status: 'completed',
              stats: { malicious: 0, suspicious: 0, undetected: 5, harmless: 55 },
              results: {},
            },
          },
        }),
      })

    const result = await scanDocument('/tmp/safe.pdf', 'safe.pdf')

    expect(result.safe).toBe(true)
    expect(result.engines).toContain('ClamAV')
    expect(result.engines.some(e => e.startsWith('VirusTotal'))).toBe(true)
  })
})

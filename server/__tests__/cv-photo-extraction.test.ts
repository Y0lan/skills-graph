import { describe, it, expect } from 'vitest'
import { isLikelyPhoto, encodeToJpeg, extractPhotoFromCvPdf } from '../lib/cv-photo-extraction.js'

describe('isLikelyPhoto', () => {
  it('accepts typical portrait-ish photo sizes', () => {
    expect(isLikelyPhoto(200, 250)).toBe(true)
    expect(isLikelyPhoto(400, 500)).toBe(true)
    expect(isLikelyPhoto(120, 120)).toBe(true)
  })

  it('rejects tiny logos and icons', () => {
    expect(isLikelyPhoto(32, 32)).toBe(false)
    expect(isLikelyPhoto(64, 64)).toBe(false)
    expect(isLikelyPhoto(79, 200)).toBe(false)
  })

  it('rejects extreme aspect ratios (banners, dividers)', () => {
    expect(isLikelyPhoto(1000, 100)).toBe(false)  // 10:1 banner
    expect(isLikelyPhoto(100, 1000)).toBe(false)  // 1:10 vertical bar
    expect(isLikelyPhoto(200, 300)).toBe(true)    // 2:3 portrait, the ideal headshot
    expect(isLikelyPhoto(300, 300)).toBe(true)    // 1:1 square photo
  })

  it('rejects over-max dimensions (avoid re-encoding huge images)', () => {
    expect(isLikelyPhoto(3000, 3000)).toBe(false)
  })
})

describe('encodeToJpeg', () => {
  it('encodes RGBA pixel data to JPEG bytes', () => {
    const width = 8
    const height = 8
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255; data[i + 1] = 100; data[i + 2] = 50; data[i + 3] = 255
    }
    const buf = encodeToJpeg({ data, width, height, channels: 4 })
    expect(buf).not.toBeNull()
    // JPEG magic bytes
    expect(buf![0]).toBe(0xFF)
    expect(buf![1]).toBe(0xD8)
  })

  it('encodes RGB (3-channel) pixel data by padding alpha', () => {
    const width = 4
    const height = 4
    const data = new Uint8ClampedArray(width * height * 3)
    for (let i = 0; i < data.length; i += 3) {
      data[i] = 10; data[i + 1] = 20; data[i + 2] = 30
    }
    const buf = encodeToJpeg({ data, width, height, channels: 3 })
    expect(buf).not.toBeNull()
    expect(buf![0]).toBe(0xFF)
    expect(buf![1]).toBe(0xD8)
  })

  it('encodes grayscale (1-channel) pixel data by broadcasting to RGB', () => {
    const width = 4
    const height = 4
    const data = new Uint8ClampedArray(width * height)
    for (let i = 0; i < data.length; i++) data[i] = 128
    const buf = encodeToJpeg({ data, width, height, channels: 1 })
    expect(buf).not.toBeNull()
    expect(buf![0]).toBe(0xFF)
    expect(buf![1]).toBe(0xD8)
  })

  it('returns null when pixel buffer is shorter than expected', () => {
    const width = 10
    const height = 10
    // 1 pixel short
    const data = new Uint8ClampedArray(width * height * 4 - 4)
    const buf = encodeToJpeg({ data, width, height, channels: 4 })
    expect(buf).toBeNull()
  })
})

describe('extractPhotoFromCvPdf', () => {
  it('returns null for non-PDF input (silently, no throw)', async () => {
    const notPdf = Buffer.from('this is just text, not a PDF')
    const result = await extractPhotoFromCvPdf(notPdf)
    expect(result).toBeNull()
  })

  it('returns null for a PDF with no images', async () => {
    // Smallest valid text-only PDF (kept below MIN_DIM threshold for any
    // images it might theoretically contain). We assert the path doesn't
    // crash and returns null cleanly on a real PDF header.
    const header = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\n%%EOF')
    const result = await extractPhotoFromCvPdf(header)
    expect(result).toBeNull()
  })
})

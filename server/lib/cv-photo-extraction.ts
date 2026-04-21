import jpeg from 'jpeg-js'
import { extractImages, getDocumentProxy } from 'unpdf'

/**
 * Detect face-like candidate photos embedded in a CV PDF.
 *
 * v1 heuristic: scan page 1 for raster images, keep the first image that
 * fits a portrait-ish aspect ratio and non-trivial size. Re-encodes raw
 * decoded pixel buffers to JPEG so storage + delivery is compact.
 *
 * Deliberately conservative — bad photo > no photo. We reject logos,
 * icons, decorative dividers, and extremely tiny images that would be
 * embarrassing in the hero.
 */
export interface ExtractedPhoto {
  buffer: Buffer
  mime: 'image/jpeg'
  width: number
  height: number
}

const MIN_DIM = 80          // px — below this it's a logo/icon, not a face
const MAX_DIM = 2048        // px — cap re-encoding cost
const MIN_ASPECT = 0.5      // width / height
const MAX_ASPECT = 2.0
const MAX_PAGES_TO_SCAN = 2 // photos are almost always on page 1

export async function extractPhotoFromCvPdf(pdfBuffer: Buffer): Promise<ExtractedPhoto | null> {
  // DOCX / non-PDF: skip silently. The magic-byte check in cv-extraction.ts
  // handles that format-sniffing elsewhere; here we only look at PDFs.
  if (!(pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50)) return null

  try {
    const data = new Uint8Array(pdfBuffer)
    const pdf = await getDocumentProxy(data)
    const pageCount = Math.min(pdf.numPages, MAX_PAGES_TO_SCAN)

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      let images: Awaited<ReturnType<typeof extractImages>> = []
      try {
        images = await extractImages(pdf, pageNum)
      } catch {
        // Some PDFs choke on specific XObjects — skip the page, keep trying.
        continue
      }

      for (const img of images) {
        if (!isLikelyPhoto(img.width, img.height)) continue
        const jpegBuf = encodeToJpeg(img)
        if (!jpegBuf) continue
        return {
          buffer: jpegBuf,
          mime: 'image/jpeg',
          width: img.width,
          height: img.height,
        }
      }
    }
    return null
  } catch (err) {
    // Never let photo extraction crash the CV pipeline — this is
    // nice-to-have, not required.
    console.warn('[photo-extraction] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export function isLikelyPhoto(width: number, height: number): boolean {
  if (width < MIN_DIM || height < MIN_DIM) return false
  if (width > MAX_DIM || height > MAX_DIM) return false
  const aspect = width / height
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false
  return true
}

interface RawImage {
  data: Uint8ClampedArray
  width: number
  height: number
  channels: 1 | 3 | 4
}

export function encodeToJpeg(img: RawImage): Buffer | null {
  try {
    const rgba = toRgba(img)
    if (!rgba) return null
    const { data } = jpeg.encode({ data: rgba, width: img.width, height: img.height }, 85)
    return Buffer.from(data)
  } catch (err) {
    console.warn('[photo-extraction] JPEG encode failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function toRgba(img: RawImage): Buffer | null {
  const { data, width, height, channels } = img
  const pixelCount = width * height
  const expected = pixelCount * channels
  if (data.length < expected) return null

  // jpeg-js always expects 4 channels (RGBA).
  if (channels === 4) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)

  const out = Buffer.alloc(pixelCount * 4)
  if (channels === 3) {
    for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
      out[j] = data[i * 3]
      out[j + 1] = data[i * 3 + 1]
      out[j + 2] = data[i * 3 + 2]
      out[j + 3] = 255
    }
    return out
  }
  if (channels === 1) {
    for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
      const g = data[i]
      out[j] = g
      out[j + 1] = g
      out[j + 2] = g
      out[j + 3] = 255
    }
    return out
  }
  return null
}

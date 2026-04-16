import fs from 'fs'

// ─── Types ──────────────────────────────────────────────────────────

export interface ScanResult {
  safe: boolean
  scannedAt: string
  engines: string[]
  threats: string[]
}

// ─── ClamAV scan (local daemon) ─────────────────────────────────────

async function scanWithClamAV(filePath: string): Promise<{ available: boolean; clean: boolean; threats: string[] }> {
  try {
    // Dynamic import — clamscan has no type definitions
    const NodeClam = (await import('clamscan')).default
    const clamscan = await new NodeClam().init({
      removeInfected: false,
      quarantineInfected: false,
      debugMode: false,
      clamdscan: {
        socket: process.env.CLAMAV_SOCKET || null,
        host: process.env.CLAMAV_HOST || '127.0.0.1',
        port: Number(process.env.CLAMAV_PORT) || 3310,
        timeout: 30000,
        active: true,
      },
      clamscan: {
        active: false, // Prefer daemon over binary
      },
    })

    const { isInfected, viruses } = await clamscan.isInfected(filePath)
    return { available: true, clean: !isInfected, threats: viruses ?? [] }
  } catch {
    console.warn('[SCAN] ClamAV not available — skipping local scan')
    return { available: false, clean: true, threats: [] }
  }
}

// ─── VirusTotal scan (cloud API) ────────────────────────────────────

const VT_API_BASE = 'https://www.virustotal.com/api/v3'
const VT_POLL_INTERVAL_MS = 3000
const VT_POLL_TIMEOUT_MS = 60000

async function scanWithVirusTotal(filePath: string, filename: string): Promise<{ available: boolean; clean: boolean; threats: string[]; engineCount?: number }> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) {
    console.warn('[SCAN] VIRUSTOTAL_API_KEY not set — skipping cloud scan')
    return { available: false, clean: true, threats: [] }
  }

  try {
    // Upload file to VirusTotal
    const fileBuffer = fs.readFileSync(filePath)
    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer]), filename)

    const uploadRes = await fetch(`${VT_API_BASE}/files`, {
      method: 'POST',
      headers: { 'x-apikey': apiKey },
      body: formData,
    })

    if (!uploadRes.ok) {
      throw new Error(`VirusTotal upload failed (${uploadRes.status})`)
    }

    const uploadData = await uploadRes.json() as { data: { id: string } }
    const analysisId = uploadData.data.id

    // Poll for results
    const startTime = Date.now()
    while (Date.now() - startTime < VT_POLL_TIMEOUT_MS) {
      await sleep(VT_POLL_INTERVAL_MS)

      const analysisRes = await fetch(`${VT_API_BASE}/analyses/${analysisId}`, {
        headers: { 'x-apikey': apiKey },
      })

      if (!analysisRes.ok) {
        throw new Error(`VirusTotal analysis poll failed (${analysisRes.status})`)
      }

      const analysisData = await analysisRes.json() as {
        data: {
          attributes: {
            status: string
            stats: { malicious: number; suspicious: number; undetected: number; harmless: number }
            results: Record<string, { category: string; result: string | null }>
          }
        }
      }

      const attrs = analysisData.data.attributes
      if (attrs.status === 'completed') {
        const threats: string[] = []
        for (const [engine, result] of Object.entries(attrs.results)) {
          if (result.category === 'malicious' || result.category === 'suspicious') {
            threats.push(`${engine}: ${result.result ?? result.category}`)
          }
        }

        const totalEngines = attrs.stats.malicious + attrs.stats.suspicious + attrs.stats.undetected + attrs.stats.harmless
        const clean = attrs.stats.malicious === 0 && attrs.stats.suspicious === 0

        console.log(`[SCAN] VirusTotal: ${clean ? 'clean' : 'INFECTED'} (${totalEngines - threats.length}/${totalEngines} engines clean)`)
        return { available: true, clean, threats, engineCount: totalEngines }
      }
    }

    console.warn('[SCAN] VirusTotal scan timed out after polling')
    return { available: true, clean: true, threats: [] }
  } catch {
    console.error('[SCAN] VirusTotal scan failed')
    return { available: false, clean: true, threats: [] }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Main scan function ─────────────────────────────────────────────

export async function scanDocument(filePath: string, filename: string): Promise<ScanResult> {
  const engines: string[] = []
  const threats: string[] = []

  // 1. ClamAV first (fast, local)
  const clamResult = await scanWithClamAV(filePath)
  if (clamResult.available) {
    engines.push('ClamAV')
    if (!clamResult.clean) {
      threats.push(...clamResult.threats.map(t => `ClamAV: ${t}`))
      console.error(`[SCAN] ClamAV: INFECTED — ${clamResult.threats.join(', ')}`)
      // Return immediately — don't waste VirusTotal quota
      return { safe: false, scannedAt: new Date().toISOString(), engines, threats }
    }
    console.log(`[SCAN] ClamAV: clean`)
  }

  // 2. VirusTotal as second pass
  const vtResult = await scanWithVirusTotal(filePath, filename)
  if (vtResult.available) {
    const label = vtResult.engineCount ? `VirusTotal (${vtResult.engineCount} engines)` : 'VirusTotal'
    engines.push(label)
    if (!vtResult.clean) {
      threats.push(...vtResult.threats)
      console.error(`[SCAN] VirusTotal: INFECTED — ${vtResult.threats.join(', ')}`)
      return { safe: false, scannedAt: new Date().toISOString(), engines, threats }
    }
    console.log(`[SCAN] VirusTotal: clean`)
  }

  // 3. If both unavailable, log warning
  if (engines.length === 0) {
    console.warn('[SCAN] No scan engines available — skipping')
  }

  return { safe: true, scannedAt: new Date().toISOString(), engines, threats }
}

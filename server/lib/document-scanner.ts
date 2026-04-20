import fs from 'fs'

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Per-engine result from VirusTotal's analysis. Categories mirror the API:
 * harmless / malicious / suspicious / undetected / failure / type-unsupported.
 */
export interface ScanEngineResult {
  engine: string
  category: string
  result: string | null
}

/**
 * Summary of one scan engine (ClamAV or VirusTotal). The UI renders these
 * as separate panels so the recruiter sees BOTH outcomes side-by-side, not
 * just an aggregated verdict.
 */
export type ScanEngineSummary =
  | { name: 'ClamAV'; available: false; reason: string }
  | { name: 'ClamAV'; available: true; clean: boolean; threats: string[] }
  | { name: 'VirusTotal'; available: false; reason: string }
  | {
      name: 'VirusTotal'
      available: true
      clean: boolean
      stats: { malicious: number; suspicious: number; undetected: number; harmless: number; failure?: number }
      totalEngines: number
      perEngine: ScanEngineResult[]
    }

export interface ScanResult {
  safe: boolean
  scannedAt: string
  // Legacy fields kept for backward-compat with existing list/badge code.
  engines: string[]
  threats: string[]
  // Rich per-engine detail (drives the new scan-detail-dialog UI).
  engineSummaries: ScanEngineSummary[]
}

// ─── ClamAV scan (local daemon) ─────────────────────────────────────

async function scanWithClamAV(filePath: string): Promise<ScanEngineSummary & { name: 'ClamAV' }> {
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
        active: false,
      },
    })

    const { isInfected, viruses } = await clamscan.isInfected(filePath)
    return {
      name: 'ClamAV',
      available: true,
      clean: !isInfected,
      threats: viruses ?? [],
    }
  } catch (err) {
    console.warn('[SCAN] ClamAV not available — skipping local scan')
    return {
      name: 'ClamAV',
      available: false,
      reason: (err as Error).message || 'Daemon ClamAV non joignable (vérifier le sidecar K8s)',
    }
  }
}

// ─── VirusTotal scan (cloud API) ────────────────────────────────────

const VT_API_BASE = 'https://www.virustotal.com/api/v3'
const VT_POLL_INTERVAL_MS = 3000
// Bumped from 60s → 180s. Free-tier VT often queues longer than 60s,
// especially for PDFs with many embedded objects. 3 min covers ~95 %
// of real candidate docs in our data.
const VT_POLL_TIMEOUT_MS = 180_000

async function scanWithVirusTotal(filePath: string, filename: string): Promise<ScanEngineSummary & { name: 'VirusTotal' }> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) {
    console.warn('[SCAN] VIRUSTOTAL_API_KEY not set — skipping cloud scan')
    return { name: 'VirusTotal', available: false, reason: 'VIRUSTOTAL_API_KEY non configurée' }
  }

  try {
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
            stats: { malicious: number; suspicious: number; undetected: number; harmless: number; failure?: number }
            results: Record<string, { category: string; result: string | null }>
          }
        }
      }

      const attrs = analysisData.data.attributes
      if (attrs.status === 'completed') {
        const perEngine: ScanEngineResult[] = Object.entries(attrs.results).map(([engine, r]) => ({
          engine,
          category: r.category,
          result: r.result ?? null,
        }))
        const totalEngines = attrs.stats.malicious + attrs.stats.suspicious + attrs.stats.undetected + attrs.stats.harmless + (attrs.stats.failure ?? 0)
        const clean = attrs.stats.malicious === 0 && attrs.stats.suspicious === 0
        console.log(`[SCAN] VirusTotal: ${clean ? 'clean' : 'INFECTED'} (${totalEngines - attrs.stats.malicious - attrs.stats.suspicious}/${totalEngines} engines clean)`)
        return {
          name: 'VirusTotal',
          available: true,
          clean,
          stats: attrs.stats,
          totalEngines,
          perEngine,
        }
      }
    }

    console.warn('[SCAN] VirusTotal scan timed out after polling')
    return { name: 'VirusTotal', available: false, reason: 'Délai d’attente dépassé (analyse en cours côté VT)' }
  } catch (err) {
    console.error('[SCAN] VirusTotal scan failed', err)
    return { name: 'VirusTotal', available: false, reason: (err as Error).message || 'Échec de scan VirusTotal' }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Main scan function ─────────────────────────────────────────────

export async function scanDocument(filePath: string, filename: string): Promise<ScanResult> {
  // Run both engines so the dialog can show both outcomes (codex flagged
  // earlier that aggregating-and-stopping hid the detail recruiters need).
  // ClamAV first (fast); VT in parallel where possible.
  const [clamSummary, vtSummary] = await Promise.all([
    scanWithClamAV(filePath),
    scanWithVirusTotal(filePath, filename),
  ])

  // Aggregate verdict: safe iff every available engine says clean.
  const availableSummaries = [clamSummary, vtSummary].filter(s => s.available) as Array<ScanEngineSummary & { available: true; clean: boolean }>
  const allClean = availableSummaries.length > 0 && availableSummaries.every(s => s.clean)

  // Build legacy fields from the structured data so existing badge UI
  // (which looks at engines.length and threats.length) keeps working.
  const engines: string[] = []
  const threats: string[] = []
  if (clamSummary.available) {
    engines.push('ClamAV')
    if (!clamSummary.clean) threats.push(...clamSummary.threats.map(t => `ClamAV: ${t}`))
  }
  if (vtSummary.available) {
    engines.push(vtSummary.totalEngines ? `VirusTotal (${vtSummary.totalEngines} moteurs)` : 'VirusTotal')
    for (const r of vtSummary.perEngine) {
      if (r.category === 'malicious' || r.category === 'suspicious') {
        threats.push(`${r.engine}: ${r.result ?? r.category}`)
      }
    }
  }

  if (engines.length === 0) {
    console.warn('[SCAN] No scan engines available — skipping')
  }

  return {
    safe: allClean || engines.length === 0, // empty engines = "safe by default" (skipped)
    scannedAt: new Date().toISOString(),
    engines,
    threats,
    engineSummaries: [clamSummary, vtSummary],
  }
}

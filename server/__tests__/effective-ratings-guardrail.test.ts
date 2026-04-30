import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Codex post-plan P3 #12 — lint-level guardrail.
 *
 * Once the Effective Ratings Module is the canonical seam, the only
 * way to keep it that way is to fail CI when someone re-introduces
 * the inline merge or imports the legacy helpers from outside the
 * allowed perimeter.
 *
 * This test scans the whole server tree for forbidden patterns.
 * The list of allowed files is small and explicit; any drift fires
 * the test.
 */

const SERVER_ROOT = path.resolve(__dirname, '..')

function* walk(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip vendor + build artifacts.
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue
      yield* walk(full)
      continue
    }
    if (!entry.name.endsWith('.ts')) continue
    yield full
  }
}

interface Hit { file: string; line: number; text: string }

function findHits(pattern: RegExp): Hit[] {
  const hits: Hit[] = []
  for (const file of walk(SERVER_ROOT)) {
    const text = fs.readFileSync(file, 'utf-8')
    text.split('\n').forEach((line, i) => {
      if (pattern.test(line)) hits.push({ file: path.relative(SERVER_ROOT, file), line: i + 1, text: line.trim() })
    })
  }
  return hits
}

describe('Effective Ratings Module — codebase guardrail', () => {
  it('no inline `{ ...aiSuggestions, ...ratings }` merge anywhere in server/', async () => {
    // Catches the original drift pattern: spreading both at once
    // anywhere in server code. The Module is the only place this
    // shape should appear, and its file is exempted.
    const hits = findHits(/\.\.\.ai[A-Za-z]*[Ss]uggestions\b[^}]*\.\.\.ratings\b|\.\.\.ratings\b[^}]*\.\.\.ai[A-Za-z]*[Ss]uggestions\b/)
      .filter(h => !h.file.endsWith('effective-ratings.ts'))
    if (hits.length > 0) {
      const lines = hits.map(h => `  ${h.file}:${h.line} → ${h.text}`).join('\n')
      throw new Error(
        `Forbidden inline ratings merge found. Use mergeEffectiveRatings/loadEffectiveRatings from lib/effective-ratings.ts.\n${lines}`,
      )
    }
    expect(hits).toEqual([])
  })

  it('no inline either/or `roleAware ?? ai` shape (the compat-breakdown bug)', async () => {
    // The old compat-breakdown handler did:
    //   r.role_aware_suggestions ? safeJsonParse(r.role_aware_suggestions, {}) : safeJsonParse(r.ai_suggestions ...)
    // That either/or dropped manual ratings entirely. Catches the
    // shape that produced the pill-vs-modal drift.
    const hits = findHits(/role_aware_suggestions\s*\?\s*safeJsonParse[^:]*:\s*safeJsonParse[^,]*ai_suggestions/)
      .filter(h => !h.file.endsWith('effective-ratings.ts'))
    expect(hits).toEqual([])
  })
})

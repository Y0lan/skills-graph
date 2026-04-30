import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Codex post-plan P3 #12 — direct `startRun`/`finishRun` imports
 * outside the allowed perimeter are forbidden.
 *
 * Every Anthropic single-call extraction must go through
 * `withExtractionRun`. Direct imports of the lower-level primitives
 * (which the wrapper uses internally) signal that someone re-rolled
 * the lifecycle — and that\'s exactly the bug class the wrapper
 * exists to prevent (forgotten finishRun, missing finally).
 *
 * Allowed callers:
 * - `extraction-runs.ts` (defines them)
 * - this test file
 * - `extraction-runs.test.ts` (tests the primitives directly)
 * - `extraction-watchdog.ts` (uses `finishRun` on timeout — different
 *   lifecycle than `withExtractionRun` covers)
 * - `cv-pipeline.ts` (uses `startRun` + `finishRun` for the
 *   `skills_baseline` orchestration run that spans multiple LLM
 *   calls; codex post-plan P1 #3 mandated this stays manual)
 */

const SERVER_ROOT = path.resolve(__dirname, '..')
const ALLOWED_FILES = new Set([
  'lib/extraction-runs.ts',
  'lib/extraction-watchdog.ts',
  'lib/cv-pipeline.ts',
  '__tests__/extraction-runs.test.ts',
  '__tests__/extraction-runs-guardrail.test.ts',
])

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      yield* walk(full)
      continue
    }
    if (!entry.name.endsWith('.ts')) continue
    yield full
  }
}

describe('Extraction-run lifecycle guardrail', () => {
  it('no direct startRun/finishRun imports outside the allowed perimeter', async () => {
    const offenders: { file: string; line: number; text: string }[] = []
    for (const file of walk(SERVER_ROOT)) {
      const rel = path.relative(SERVER_ROOT, file)
      if (ALLOWED_FILES.has(rel)) continue
      const content = fs.readFileSync(file, 'utf-8')
      content.split('\n').forEach((line, i) => {
        // Match `import { ..., startRun, ... }` or `import { ..., finishRun, ... }`
        // from extraction-runs.
        if (
          /from\s+['"]\.\.?\/.*extraction-runs(\.js)?['"]/.test(line) &&
          /\b(startRun|finishRun)\b/.test(line)
        ) {
          offenders.push({ file: rel, line: i + 1, text: line.trim() })
        }
      })
    }
    if (offenders.length > 0) {
      const report = offenders.map(o => `  ${o.file}:${o.line} → ${o.text}`).join('\n')
      throw new Error(
        `Direct startRun/finishRun imports outside the allowed perimeter. ` +
        `Use withExtractionRun from extraction-runs.ts.\n${report}`,
      )
    }
    expect(offenders).toEqual([])
  })
})

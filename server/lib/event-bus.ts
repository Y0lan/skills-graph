import { EventEmitter } from 'node:events'

/**
 * In-process typed event bus for the recruitment module.
 *
 * Today: works because prod runs `replicas: 1` with the `Recreate` strategy
 * (one Node process at a time, see cloud-sinapse-infra deployment manifests).
 *
 * Tomorrow (when we scale out): replace this with Cloud Pub/Sub or a Redis
 * stream. The contract below is the abstraction boundary — keep it stable.
 *
 * See docs/decisions/2026-04-20-authorization-and-audit.md for the
 * permission model that gates the SSE endpoint built on top of this bus.
 */

export interface DocumentScanUpdated {
  candidatureId: string
  documentId: string
  scanStatus: 'pending' | 'scanning' | 'clean' | 'infected' | 'error' | 'skipped'
  filename: string
}

export interface ExtractionRunCompleted {
  candidatureId: string
  candidateId: string
  type: 'cv' | 'aboro'
  runId: string
}

export interface StatusChanged {
  candidatureId: string
  statutFrom: string | null
  statutTo: string
  byUserSlug: string
}

/**
 * Fired after a successful PATCH on a candidature's stage fiche
 * (`/candidatures/:id/stages/:stage/data`). Lets other browser tabs
 * watching the same candidature refetch the affected fiche without a
 * page reload. Carries `updatedAt` so clients can short-circuit if
 * their cached value is already newer (rare, but cheap to check).
 */
export interface StageDataChanged {
  candidatureId: string
  stage: string
  updatedAt: string
  byUserSlug: string
}

export interface RecruitmentEventMap {
  'document_scan_updated': DocumentScanUpdated
  'extraction_run_completed': ExtractionRunCompleted
  'status_changed': StatusChanged
  'stage_data_changed': StageDataChanged
}

class TypedRecruitmentBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // Reasonable upper bound for concurrent SSE listeners on the same channel.
    // Each open browser tab adds 1 listener per channel it cares about.
    this.emitter.setMaxListeners(100)
  }

  publish<K extends keyof RecruitmentEventMap>(channel: K, payload: RecruitmentEventMap[K]): void {
    this.emitter.emit(channel, payload)
  }

  subscribe<K extends keyof RecruitmentEventMap>(channel: K, handler: (payload: RecruitmentEventMap[K]) => void): () => void {
    const wrapped = (p: RecruitmentEventMap[K]): void => {
      try { handler(p) } catch (err) {
        console.error(`[event-bus] subscriber for ${channel} threw`, err)
      }
    }
    this.emitter.on(channel, wrapped)
    return () => { this.emitter.off(channel, wrapped) }
  }

  /** For tests / debugging. */
  listenerCounts(): Record<keyof RecruitmentEventMap, number> {
    return {
      document_scan_updated: this.emitter.listenerCount('document_scan_updated'),
      extraction_run_completed: this.emitter.listenerCount('extraction_run_completed'),
      status_changed: this.emitter.listenerCount('status_changed'),
      stage_data_changed: this.emitter.listenerCount('stage_data_changed'),
    }
  }
}

export const recruitmentBus = new TypedRecruitmentBus()

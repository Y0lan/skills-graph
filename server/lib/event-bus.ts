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

export interface RecruitmentEventMap {
  'document_scan_updated': DocumentScanUpdated
  'extraction_run_completed': ExtractionRunCompleted
  'status_changed': StatusChanged
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
    }
  }
}

export const recruitmentBus = new TypedRecruitmentBus()

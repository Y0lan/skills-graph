/**
 * Shared badge styling for deliverability and document-state indicators.
 *
 * One source of truth across CandidateEmailsCard, candidate-history-by-stage,
 * and anywhere else we tag an email/document with a colored state badge.
 * Keeps the colors consistent and makes rebranding a single-file change.
 */

export const BADGE_STYLES = {
  sent: 'bg-muted text-muted-foreground',
  delivered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  read: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  delayed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  spam: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200',
  bounced: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
} as const

export const BADGE_SIZES = {
  xs: 'text-[10px] px-1.5 py-0',
} as const

export type BadgeState = keyof typeof BADGE_STYLES

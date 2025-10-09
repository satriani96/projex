import type { JobStatus } from './job';

export type CardSize = 'compact' | 'medium' | 'large';

export type SortField = 'job_number' | 'customer_name' | 'due_date';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

const ALL_CANONICAL_STATUSES: readonly JobStatus[] = [
  'on_hold',
  'queued',
  'in_progress',
  'done',
  'archived'
];

export const KANBAN_STATUS_ORDER: readonly JobStatus[] = ALL_CANONICAL_STATUSES.slice(0, 4);

export const KANBAN_STATUS_SET = new Set<JobStatus>(KANBAN_STATUS_ORDER);

const JOB_STATUS_SET = new Set<JobStatus>(ALL_CANONICAL_STATUSES);

const STATUS_DELIMITER_PATTERN = /[\s-]+/g;

/**
 * Normalizes status identifiers coming from the UI, DnD-kit, or the backend
 * so that comparisons can consistently use the canonical JobStatus values.
 */
export const normalizeJobStatus = (
  status: string | JobStatus | null | undefined
): JobStatus | null => {
  if (!status) {
    return null;
  }

  const canonical = status
    .toString()
    .trim()
    .toLowerCase()
    .replace(STATUS_DELIMITER_PATTERN, '_') as JobStatus;

  return JOB_STATUS_SET.has(canonical) ? canonical : null;
};

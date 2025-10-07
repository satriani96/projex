import type { JobStatus } from './job';

export type CardSize = 'compact' | 'medium' | 'large';

export type SortField = 'job_number' | 'customer_name' | 'due_date';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export const KANBAN_STATUS_ORDER: JobStatus[] = ['queued', 'in_progress', 'on_hold', 'done'];

export type JobStatus = 'queued' | 'in_progress' | 'on_hold' | 'done';

/**
 * Represents a full job record, including read-only fields like id and timestamps.
 */
export interface Job {
  id: string;
  job_number: string;
  customer_name: string;
  address: string;
  phone_number: string;
  email: string;
  material: string;
  status: JobStatus;
  due_date: string | null;
  job_description: string;
  sketch_data: string | null; // Can be a base64 string or a URL from Supabase Storage
  job_start: string | null;
  job_end: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents the data that can be submitted from our form.
 * It's a subset of the Job interface, excluding server-generated fields.
 */
export interface JobFormData {
  customer_name: string;
  address: string;
  phone_number: string;
  email: string;
  material: string;
  status: JobStatus;
  due_date: string | null;
  job_description: string;
  sketch_data: string | null;
  job_start: string | null;
  job_end: string | null;
}

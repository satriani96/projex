import { supabase } from '../lib/supabaseClient';
import type { Job, JobFormData } from '../types/job';

// The name of your Supabase table
const TABLE_NAME = 'jobs';

/**
 * Fetches all non-archived jobs from the database.
 */
export const getJobs = async (): Promise<Job[]> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .neq('status', 'archived') // Exclude archived jobs
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching jobs:', error);
    throw new Error(error.message);
  }

  return data || [];
};

/**
 * Creates a new job in the database.
 * @param jobData - The data for the new job.
 */
export const createJob = async (jobData: JobFormData): Promise<Job> => {
  const { data, error } = await supabase.from(TABLE_NAME).insert([jobData]).select();

  if (error) {
    console.error('Error creating job:', error);
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error('Job creation failed: No data returned.');
  }

  return data[0];
};

/**
 * Updates an existing job in the database.
 * @param jobId - The ID of the job to update.
 * @param jobData - The new data for the job.
 */
export const updateJob = async (jobId: string, jobData: Partial<JobFormData>): Promise<Job> => {
  const { data, error } = await supabase.from(TABLE_NAME).update(jobData).eq('id', jobId).select();

  if (error) {
    console.error('Error updating job:', error);
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error('Job update failed: No data returned.');
  }

  return data[0];
};

/**
 * Deletes a job from the database.
 * @param jobId - The ID of the job to delete.
 */
export const deleteJob = async (jobId: string): Promise<void> => {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', jobId);

  if (error) {
    console.error('Error deleting job:', error);
    throw new Error(error.message);
  }
};

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DndContext, DragOverlay, DragStartEvent, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { Job, JobStatus, JobFormData } from './types/job';
import { getJobs, createJob, updateJob } from './services/jobService';
import JobForm from './components/JobForm';
import KanbanBoard from './components/KanbanBoard';
import JobCard from './components/JobCard';
import GanttChart from './components/GanttChart';

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'gantt'>(() => {
    // Initialize from localStorage, default to kanban if not found
    const savedViewMode = localStorage.getItem('projex-view-mode');
    return (savedViewMode === 'kanban' || savedViewMode === 'gantt') ? savedViewMode : 'kanban';
  });
  
  // Save view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('projex-view-mode', viewMode);
  }, [viewMode]);

  const fetchJobs = useCallback(async () => {
    try {
      const fetchedJobs = await getJobs();
      setJobs(fetchedJobs || []);
    } catch (err) {
      setError('Failed to fetch jobs.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    }, [fetchJobs]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery) {
      return jobs;
    }
        return jobs.filter(job => {
      const query = searchQuery.toLowerCase();
      return (
        job.customer_name.toLowerCase().includes(query) ||
        job.job_number.includes(query) // Job number is a string, so 'includes' works well.
      );
    });
  }, [jobs, searchQuery]);

  const handleNewJobClick = () => {
    setSelectedJob(null);
    setIsFormVisible(true);
  };

  const handleEditJob = (job: Job) => {
    setSelectedJob(job);
    setIsFormVisible(true);
  };

    const handleSketchSave = async (jobId: string, sketchData: string) => {
    try {
      await updateJob(jobId, { sketch_data: sketchData });
      fetchJobs(); // Refresh data to ensure consistency
    } catch (err) {
      setError('Failed to save sketch.');
      console.error(err);
    }
  };

  const updateJobTime = async (jobId: string, start: Date, end: Date) => {
    try {
      await updateJob(jobId, { 
        job_start: start.toISOString(), 
        job_end: end.toISOString() 
      });
      // Optimistically update the local state
      setJobs(prevJobs =>
        prevJobs.map(job =>
          job.id === jobId ? { ...job, job_start: start.toISOString(), job_end: end.toISOString() } : job
        )
      );
    } catch (err) {
      setError('Failed to update job time.');
      console.error(err);
    }
  };

    const handleFormSubmit = async (formData: JobFormData) => {
    try {
      if (selectedJob) {
        await updateJob(selectedJob.id, formData);
      } else {
        await createJob(formData);
      }
      fetchJobs(); // Re-fetch jobs to update the UI
      setIsFormVisible(false);
      setSelectedJob(null);
    } catch (err) {
      setError('Failed to save job.');
      console.error(err);
    }
  };

    const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const job = jobs.find(j => String(j.id) === String(active.id));
    if (job) {
      setActiveJob(job);
    }
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const newStatus = (over.data.current?.sortable?.containerId || over.id) as JobStatus;
    const statusOrder: JobStatus[] = ['queued', 'in_progress', 'on_hold', 'done'];

    if (!statusOrder.includes(newStatus)) return;

    setJobs(prevJobs => {
      const activeJob = prevJobs.find(j => String(j.id) === activeId);
      if (!activeJob || activeJob.status === newStatus) {
        return prevJobs;
      }

      const newJobs = prevJobs.map(job =>
        String(job.id) === activeId ? { ...job, status: newStatus } : job
      );

      // Asynchronously update the backend
      (async () => {
        const result = await updateJob(activeId, { status: newStatus });
        // The service now returns an object with a potential error property
        if (result && 'error' in result) {
          setError(`Failed to move job: ${(result.error as any).message || 'Unknown error'}`);
          // Revert to the original state if the backend update fails
          setJobs(prevJobs);
        }
      })();

            return newJobs;
    });

    setActiveJob(null);
  }, [setError]);

  const handleCancelForm = () => {
    setIsFormVisible(false);
    setSelectedJob(null);
  };

  return (
    <div className="h-screen bg-gray-50 text-gray-800 flex flex-col">
            <header className="flex justify-between items-center p-4 bg-white border-b border-gray-200 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Projex</h1>
        <div className="flex items-center gap-4">
          <div className="bg-gray-200 p-1 rounded-md">
            <button 
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-sm font-medium rounded ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow' : 'bg-transparent text-gray-600'}`}>
              Kanban
            </button>
            <button 
              onClick={() => setViewMode('gantt')}
              className={`px-3 py-1 text-sm font-medium rounded ${viewMode === 'gantt' ? 'bg-white text-blue-600 shadow' : 'bg-transparent text-gray-600'}`}>
              Gantt
            </button>
          </div>
        </div>
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by customer or job #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button 
          onClick={handleNewJobClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          + New Job
        </button>
      </header>
      <main className="p-4 flex-1 overflow-y-auto relative">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
        {isLoading ? (
          <div className="text-center text-gray-500">Loading jobs...</div>
        ) : (
          viewMode === 'kanban' ? (
            <DndContext
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <KanbanBoard jobs={filteredJobs} onJobClick={handleEditJob} />
              <DragOverlay>
                {activeJob ? <JobCard job={activeJob} onClick={() => {}} /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <GanttChart jobs={filteredJobs} onJobTimeUpdate={updateJobTime} />
          )
        )}

        {isFormVisible && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) handleCancelForm(); }}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <JobForm
                job={selectedJob}
                onSubmit={handleFormSubmit}
                onCancel={handleCancelForm}
                onSketchSave={handleSketchSave}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;


import React, { useState, useEffect } from 'react';
import { Job } from '../types/job';
import { getArchivedJobs, updateJob } from '../services/jobService';

interface ArchivedJobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobClick: (job: Job) => void;
}

const ArchivedJobsModal: React.FC<ArchivedJobsModalProps> = ({ isOpen, onClose, onJobClick }) => {
  const [archivedJobs, setArchivedJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchArchivedJobs();
    }
  }, [isOpen]);

  const fetchArchivedJobs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const jobs = await getArchivedJobs();
      setArchivedJobs(jobs);
    } catch (err) {
      setError('Failed to fetch archived jobs.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (job: Job) => {
    if (window.confirm(`Restore job #${job.job_number} to active status?`)) {
      try {
        await updateJob(job.id, { status: 'queued' });
        // Remove from archived list
        setArchivedJobs(archivedJobs.filter(j => j.id !== job.id));
      } catch (err) {
        console.error('Error restoring job:', err);
        alert('Failed to restore job.');
      }
    }
  };

  const filteredJobs = archivedJobs.filter(job => {
    const query = searchQuery.toLowerCase();
    return (
      job.job_number.toLowerCase().includes(query) ||
      job.customer_name.toLowerCase().includes(query) ||
      job.company?.toLowerCase().includes(query) ||
      job.material?.toLowerCase().includes(query)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
              <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" />
              <path d="M10 12l4 0" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-800">Archived Jobs</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Search */}
        <div className="p-4 border-b">
          <input 
            type="text"
            placeholder="Search archived jobs..."
            className="w-full px-4 py-2 border rounded-md"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
            </div>
          ) : error ? (
            <div className="text-red-500 text-center">{error}</div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              {searchQuery ? 'No archived jobs match your search.' : 'No archived jobs found.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredJobs.map(job => (
                <div 
                  key={job.id}
                  className="border rounded-lg p-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between mb-2">
                    <h3 className="font-semibold">{job.customer_name}</h3>
                    <span className="text-sm text-gray-500">#{job.job_number}</span>
                  </div>
                  {job.company && <p className="text-sm text-gray-600">Company: {job.company}</p>}
                  <p className="text-sm text-gray-600">Material: {job.material}</p>
                  <p className="text-sm text-gray-600">Due Date: {job.due_date || 'Not set'}</p>
                  
                  <div className="flex justify-end mt-3 space-x-2">
                    <button 
                      onClick={() => handleRestore(job)}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Restore
                    </button>
                    <button 
                      onClick={() => onJobClick(job)}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArchivedJobsModal;

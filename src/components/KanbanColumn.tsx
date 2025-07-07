import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Job, JobStatus } from '../types/job';
import JobCard from './JobCard';

interface KanbanColumnProps {
  status: JobStatus;
  title: string;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, title, jobs, onJobClick }) => {
  const { setNodeRef } = useDroppable({ id: status });

  const jobIds = useMemo(() => jobs.map(j => String(j.id)), [jobs]);

  return (
    <div ref={setNodeRef} className="bg-gray-100 p-4 rounded-lg flex flex-col h-full ">
      <h3 className="font-bold text-lg mb-4 text-gray-700 capitalize">{title.replace('_', ' ')}</h3>
      <SortableContext id={status} items={jobIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 min-h-[200px] flex-1 overflow-y-auto pr-2">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
};

export default KanbanColumn;

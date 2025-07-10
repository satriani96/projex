import React from 'react';

import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Job, JobStatus } from '../types/job';
import KanbanColumn from './KanbanColumn.tsx';

interface KanbanBoardProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

const statusOrder: JobStatus[] = ['on_hold', 'queued', 'in_progress', 'done'];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ jobs, onJobClick }) => {
  const jobsByStatus = statusOrder.reduce((acc, status) => {
    acc[status] = jobs.filter(job => job.status === status);
    return acc;
  }, {} as Record<JobStatus, Job[]>);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full">
      <SortableContext items={statusOrder} strategy={horizontalListSortingStrategy}>
        {statusOrder.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            title={status.replace('_', ' ')}
            jobs={jobsByStatus[status]}
            onJobClick={onJobClick}
          />
        ))}
      </SortableContext>
    </div>
  );
};

export default KanbanBoard;

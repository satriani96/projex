import React from 'react';

import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Job, JobStatus } from '../types/job';
import KanbanColumn from './KanbanColumn.tsx';
import { CardSize, SortConfig, SortField, SortDirection } from '../App';

interface KanbanBoardProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  cardSize: CardSize;
  sortConfig: Record<JobStatus, SortConfig>;
  onSortChange: (status: JobStatus, field: SortField, direction: SortDirection) => void;
}

const statusOrder: JobStatus[] = ['on_hold', 'queued', 'in_progress', 'done'];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ jobs, onJobClick, cardSize, sortConfig, onSortChange }) => {
  const jobsByStatus = statusOrder.reduce((acc, status) => {
    // Filter jobs by status
    const statusJobs = jobs.filter(job => job.status === status);
    
    // Get sort config for this column
    const { field, direction } = sortConfig[status];
    
    // Sort jobs based on sort config
    const sortedJobs = [...statusJobs].sort((a, b) => {
      // Handle possible undefined values
      const aValue = a[field] || '';
      const bValue = b[field] || '';
      
      // Different sorting for dates vs strings
      if (field === 'due_date') {
        // For dates, empty values should come last
        if (!aValue) return direction === 'asc' ? 1 : -1;
        if (!bValue) return direction === 'asc' ? -1 : 1;
        
        // Convert to Date objects
        const dateA = new Date(aValue as string);
        const dateB = new Date(bValue as string);
        
        return direction === 'asc' 
          ? dateA.getTime() - dateB.getTime() 
          : dateB.getTime() - dateA.getTime();
      } else {
        // For strings, compare them directly
        const strA = String(aValue).toLowerCase();
        const strB = String(bValue).toLowerCase();
        
        return direction === 'asc' 
          ? strA.localeCompare(strB) 
          : strB.localeCompare(strA);
      }
    });
    
    acc[status] = sortedJobs;
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
            sortConfig={sortConfig[status]}
            onSortChange={(field, direction) => onSortChange(status, field, direction)}
            jobs={jobsByStatus[status]}
            onJobClick={onJobClick}
            cardSize={cardSize}
          />
        ))}
      </SortableContext>
    </div>
  );
};

export default KanbanBoard;

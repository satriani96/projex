import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Job } from '../types/job';

interface JobCardProps {
  job: Job;
  onClick: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(job.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 mb-3 flex flex-col"
    >
      <div 
        {...listeners} 
        className="p-1 bg-gray-100 rounded-t-lg cursor-grab active:cursor-grabbing text-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </div>
      <div 
        onClick={onClick}
        className="p-3 cursor-pointer"
      >
        <div className="flex justify-between items-baseline mb-1">
          <h4 className="font-semibold text-gray-800 truncate">{job.customer_name}</h4>
          <span className="text-xs font-mono text-gray-500">#{job.job_number}</span>
        </div>
        <p className="text-sm text-gray-600 truncate">{job.material}</p>
        
        {job.due_date && <p className="text-xs text-gray-500 mt-2">Due: {job.due_date}</p>}
      </div>
    </div>
  );
};

export default JobCard;

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Job } from '../types/job';
import { CardSize } from '../App';

interface JobCardProps {
  job: Job;
  onClick: () => void;
  cardSize?: CardSize;
}

const JobCard: React.FC<JobCardProps> = ({ job, onClick, cardSize = 'medium' }) => {
  // Calculate days until due (or overdue)
  const calculateDaysUntilDue = (): { days: number; isOverdue: boolean } | null => {
    if (!job.due_date) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time part to compare dates only
    
    const dueDate = new Date(job.due_date);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      days: Math.abs(diffDays),
      isOverdue: diffDays < 0
    };
  };
  
  const daysUntilDue = calculateDaysUntilDue();
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
        className={`cursor-pointer ${cardSize === 'compact' ? 'p-2' : 'p-3'}`}
      >
        {/* Compact view: just customer name and job number */}
        {cardSize === 'compact' && (
          <>
            <div className="flex justify-between items-baseline">
              <h4 className="font-semibold text-gray-800 truncate">{job.customer_name}</h4>
              <span className="text-xs font-mono text-gray-500 ml-1">#{job.job_number}</span>
            </div>
            {daysUntilDue && (
              <div className={`text-xs mt-1 ${daysUntilDue.isOverdue ? 'text-red-600 font-semibold' : 'text-blue-600'}`}>
                {daysUntilDue.isOverdue 
                  ? `${daysUntilDue.days} ${daysUntilDue.days === 1 ? 'day' : 'days'} overdue` 
                  : `${daysUntilDue.days} ${daysUntilDue.days === 1 ? 'day' : 'days'} until due`}
              </div>
            )}
          </>
        )}

        {/* Medium view: current implementation */}
        {cardSize === 'medium' && (
          <>
            <div className="flex justify-between items-baseline mb-1">
              <h4 className="font-semibold text-gray-800 truncate">{job.customer_name}</h4>
              <span className="text-xs font-mono text-gray-500">#{job.job_number}</span>
            </div>
            <p className="text-sm text-gray-600 truncate">{job.material}</p>
            <div className="flex justify-between items-center mt-2">
              {job.due_date && <span className="text-xs text-gray-500">Due: {job.due_date}</span>}
              {daysUntilDue && (
                <span className={`text-xs ${daysUntilDue.isOverdue ? 'text-red-600 font-semibold' : 'text-blue-600'}`}>
                  {daysUntilDue.isOverdue 
                    ? `${daysUntilDue.days} ${daysUntilDue.days === 1 ? 'day' : 'days'} overdue` 
                    : `${daysUntilDue.days} ${daysUntilDue.days === 1 ? 'day' : 'days'} until due`}
                </span>
              )}
            </div>
          </>
        )}

        {/* Large view: all text data */}
        {cardSize === 'large' && (
          <>
            <div className="flex justify-between items-baseline mb-2">
              <h4 className="font-semibold text-gray-800">{job.customer_name}</h4>
              <span className="text-xs font-mono text-gray-500">#{job.job_number}</span>
            </div>
            {job.company && <p className="text-sm text-gray-700 mb-1">Company: {job.company}</p>}
            <p className="text-sm text-gray-600 mb-1">Material: {job.material}</p>
            {/* Machine property removed as it doesn't exist in the Job interface */}
            {job.status && <p className="text-sm text-gray-600 mb-1">Status: {job.status}</p>}
            <div className="flex flex-wrap justify-between text-xs mt-2">
              <div className="text-gray-500">
                {job.job_start && <span>Start: {job.job_start}</span>}
                {job.job_start && job.due_date && <span className="mx-1">|</span>}
                {job.due_date && <span>Due: {job.due_date}</span>}
              </div>
              {daysUntilDue && (
                <span className={`${daysUntilDue.isOverdue ? 'text-red-600 font-semibold' : 'text-blue-600'}`}>
                  {daysUntilDue.isOverdue 
                    ? `${daysUntilDue.days} ${daysUntilDue.days === 1 ? 'day' : 'days'} overdue` 
                    : `${daysUntilDue.days} ${daysUntilDue.days === 1 ? 'day' : 'days'} until due`}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default JobCard;

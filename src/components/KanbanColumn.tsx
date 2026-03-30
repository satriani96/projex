import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Job, JobStatus } from '../types/job';
import JobCard from './JobCard';
import { CardSize, SortConfig, SortField, SortDirection } from '../App';

interface KanbanColumnProps {
  status: JobStatus;
  title: string;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  cardSize: CardSize;
  sortConfig: SortConfig;
  onSortChange: (field: SortField, direction: SortDirection) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, title, jobs, onJobClick, cardSize, sortConfig, onSortChange }) => {
  const { setNodeRef } = useDroppable({ id: status });

  const jobIds = useMemo(() => jobs.map(j => String(j.id)), [jobs]);

  // State to manage dropdown visibility
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown on outside tap (pointer + mouse for Android / desktop)
  useEffect(() => {
    const closeIfOutside = (target: EventTarget | null) => {
      if (dropdownRef.current && target instanceof Node && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => closeIfOutside(event.target);
    const onMouseDown = (event: MouseEvent) => closeIfOutside(event.target);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('mousedown', onMouseDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('mousedown', onMouseDown, true);
    };
  }, []);
  
  // Toggle sort direction
  const toggleSortDirection = () => {
    const newDirection = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    onSortChange(sortConfig.field, newDirection);
  };
  
  // Change sort field
  const changeSortField = (field: SortField) => {
    onSortChange(field, sortConfig.direction);
    setIsDropdownOpen(false);
  };
  
  // Field display names
  const fieldLabels: Record<SortField, string> = {
    job_number: 'Job #',
    customer_name: 'Customer',
    due_date: 'Due Date'
  };

  return (
    <div ref={setNodeRef} className="flex h-full min-h-0 flex-col rounded-lg bg-gray-100 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold capitalize text-gray-700">{title.replace('_', ' ')}</h3>
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center gap-1">
            <button 
              type="button"
              className="flex min-h-10 min-w-0 touch-manipulation items-center rounded border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-500 shadow-sm hover:text-gray-700 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Change sort field"
            >
              <span>{fieldLabels[sortConfig.field]}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <button 
              type="button"
              onClick={toggleSortDirection}
              className="flex min-h-10 min-w-10 touch-manipulation items-center justify-center rounded border border-gray-200 bg-white p-2 text-gray-500 shadow-sm hover:text-gray-700 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
              title={sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortConfig.direction === 'asc' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
          
          {isDropdownOpen && (
            <div className="absolute right-0 z-20 mt-1 w-40 rounded border border-gray-200 bg-white shadow-lg">
              <ul>
                <li>
                  <button 
                    type="button"
                    className={`w-full touch-manipulation py-3 pl-3 pr-3 text-left text-sm hover:bg-gray-100 [@media(pointer:coarse)]:py-3.5 ${sortConfig.field === 'job_number' ? 'bg-blue-50 font-semibold' : ''}`}
                    onClick={() => changeSortField('job_number')}
                  >
                    Job #
                  </button>
                </li>
                <li>
                  <button 
                    type="button"
                    className={`w-full touch-manipulation py-3 pl-3 pr-3 text-left text-sm hover:bg-gray-100 [@media(pointer:coarse)]:py-3.5 ${sortConfig.field === 'customer_name' ? 'bg-blue-50 font-semibold' : ''}`}
                    onClick={() => changeSortField('customer_name')}
                  >
                    Customer
                  </button>
                </li>
                <li>
                  <button 
                    type="button"
                    className={`w-full touch-manipulation py-3 pl-3 pr-3 text-left text-sm hover:bg-gray-100 [@media(pointer:coarse)]:py-3.5 ${sortConfig.field === 'due_date' ? 'bg-blue-50 font-semibold' : ''}`}
                    onClick={() => changeSortField('due_date')}
                  >
                    Due Date
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
      
      <SortableContext id={status} items={jobIds} strategy={verticalListSortingStrategy}>
        <div className="min-h-[200px] flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch] sm:pr-2">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} cardSize={cardSize} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
};

export default KanbanColumn;

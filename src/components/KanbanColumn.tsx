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
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    <div ref={setNodeRef} className="bg-gray-100 p-4 rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg text-gray-700 capitalize">{title.replace('_', ' ')}</h3>
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center space-x-1">
            <button 
              className="text-gray-500 hover:text-gray-700 text-xs font-medium flex items-center py-1 px-2 bg-white rounded border border-gray-200 shadow-sm"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Change sort field"
            >
              <span>{fieldLabels[sortConfig.field]}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <button 
              onClick={toggleSortDirection}
              className="text-gray-500 hover:text-gray-700 p-1 rounded bg-white border border-gray-200 shadow-sm"
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
            <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 w-36">
              <ul>
                <li>
                  <button 
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${sortConfig.field === 'job_number' ? 'font-semibold bg-blue-50' : ''}`}
                    onClick={() => changeSortField('job_number')}
                  >
                    Job #
                  </button>
                </li>
                <li>
                  <button 
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${sortConfig.field === 'customer_name' ? 'font-semibold bg-blue-50' : ''}`}
                    onClick={() => changeSortField('customer_name')}
                  >
                    Customer
                  </button>
                </li>
                <li>
                  <button 
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${sortConfig.field === 'due_date' ? 'font-semibold bg-blue-50' : ''}`}
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
        <div className="space-y-3 min-h-[200px] flex-1 overflow-y-auto pr-2">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} cardSize={cardSize} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
};

export default KanbanColumn;

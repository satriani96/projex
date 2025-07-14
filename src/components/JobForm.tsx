import React, { useState, useEffect, useRef } from 'react';
import type { Job, JobFormData, JobStatus } from '../types/job';
import SketchPadModal from './SketchPadModal';
import { exportToBlob, getCommonBounds } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState } from '@excalidraw/excalidraw/types';
import logo from '../assets/logo.jpg';



interface JobFormProps {
  job?: Job | null;
  onSubmit: (data: JobFormData) => void;
  onCancel: () => void;
  onSketchSave: (jobId: string, sketchData: string) => void;
  onDelete?: (jobId: string) => void;
}

const statusOptions: JobStatus[] = ['queued', 'in_progress', 'on_hold', 'done'];

const JobForm: React.FC<JobFormProps> = ({ job, onSubmit, onCancel, onSketchSave, onDelete }) => {
  const [isSketchPadOpen, setIsSketchPadOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const originalFormDataRef = useRef<JobFormData | null>(null);
  
  const [formData, setFormData] = useState<JobFormData>({
    customer_name: job?.customer_name || '',
    company: job?.company || '',
    address: job?.address || '',
    phone_number: job?.phone_number || '',
    email: job?.email || '',
    material: job?.material || '',
    status: job?.status || 'queued',
    due_date: job?.due_date || '',
    job_start: job?.job_start || null,
    job_end: job?.job_end || null,
    job_description: job?.job_description || '',
    sketch_data: job?.sketch_data || null,
  });

  // Initialize original form data and track changes
  useEffect(() => {
    const initialData = {
      customer_name: job?.customer_name || '',
      company: job?.company || '',
      address: job?.address || '',
      phone_number: job?.phone_number || '',
      email: job?.email || '',
      material: job?.material || '',
      status: job?.status || 'queued',
      due_date: job?.due_date || '',
      job_start: job?.job_start || null,
      job_end: job?.job_end || null,
      job_description: job?.job_description || '',
      sketch_data: job?.sketch_data || null,
    };
    originalFormDataRef.current = initialData;
    setFormData(initialData);
    setHasUnsavedChanges(false);
  }, [job]);

  // Check for unsaved changes whenever formData changes
  useEffect(() => {
    if (!originalFormDataRef.current) return;
    
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalFormDataRef.current);
    setHasUnsavedChanges(hasChanges);
  }, [formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const confirmUnsavedChanges = (): boolean => {
    if (!hasUnsavedChanges) return true;
    
    return window.confirm(
      'You have unsaved changes. Are you sure you want to leave without saving?'
    );
  };

  const handleCancel = () => {
    if (confirmUnsavedChanges()) {
      onCancel();
    }
  };

  const formatDateTimeForInput = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: JobFormData = {
      ...formData,
      job_start: formData.job_start ? new Date(formData.job_start).toISOString() : null,
      job_end: formData.job_end ? new Date(formData.job_end).toISOString() : null,
    };
    onSubmit(data);
    setHasUnsavedChanges(false);
  };

  const handlePrint = async () => {
    if (!job) return;

    const printData = { ...formData, ...job };

    let sketchImageHtml = '';
    if (formData.sketch_data) {
      try {
        const sketchData: { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } = JSON.parse(formData.sketch_data);
        if (sketchData.elements && sketchData.elements.length > 0) {
          const [minX, minY, maxX, maxY] = getCommonBounds(sketchData.elements);
          const padding = 20;
          const width = (maxX - minX) + padding * 2;
          const height = (maxY - minY) + padding * 2;

          const blob = await exportToBlob({
            elements: sketchData.elements,
            appState: {
              ...sketchData.appState,
              scrollX: -minX + padding,
              scrollY: -minY + padding,
            },
            files: null,
            getDimensions: () => ({ width, height }),
          });

          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          sketchImageHtml = `
            <div class="section full-width">
              <h2>Sketch</h2>
              <img src="${dataUrl}" style="width: 100%; max-width: 500px; border: 1px solid #ccc; border-radius: 8px;" />
            </div>
          `;
        }
      } catch (error) {
        console.error('Could not generate sketch image for printing:', error);
      }
    }

    const printContent = `
      <html>
        <head>
          <title>Works Order - Job #${printData.job_number}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #111; }
            @page { size: A4; margin: 20mm; }
            .page { width: 100%; height: 100%; }
            h1, h2 { margin: 0 0 10px 0; padding: 0; }
            .header { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid black; padding-bottom: 8px; margin-bottom: 20px; }
            .header img { height: 32px; width: auto; }
            .header h1 { font-size: 22pt; margin: 0; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .section { border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; }
            .section h2 { font-size: 14pt; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
            .details p { margin: 0 0 8px 0; font-size: 11pt; }
            .details strong { display: inline-block; width: 110px; color: #555; }
            .full-width { grid-column: 1 / -1; }
            .description { white-space: pre-wrap; font-size: 11pt; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <img src="${logo}" alt="Projex Logo" />
              <h1>Works Order: Job #${printData.job_number}</h1>
            </div>
            <div class="grid">
              <div class="section">
                <h2>Customer Details</h2>
                <div class="details">
                  <p><strong>Customer:</strong> ${printData.customer_name}</p>
                  <p><strong>Company:</strong> ${printData.company || 'N/A'}</p>
                  <p><strong>Phone:</strong> ${printData.phone_number || 'N/A'}</p>
                  <p><strong>Email:</strong> ${printData.email || 'N/A'}</p>
                  <p><strong>Address:</strong> ${printData.address || 'N/A'}</p>
                </div>
              </div>
              <div class="section">
                <h2>Job Details</h2>
                <div class="details">
                  <p><strong>Due Date:</strong> ${printData.due_date || 'N/A'}</p>
                  <p><strong>Material:</strong> ${printData.material || 'N/A'}</p>
                  <p><strong>Status:</strong> ${(printData.status || '').replace('_', ' ')}</p>
                </div>
              </div>
              <div class="section full-width">
                <h2>Job Description</h2>
                <p class="description">${printData.job_description || 'No description provided.'}</p>
              </div>
              ${sketchImageHtml}
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              }
            }
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
    }
  };

  const handleSketchSave = (data: string) => {
    setFormData((prev) => ({ ...prev, sketch_data: data }));

    if (job?.id) {
      onSketchSave(job.id, data);
    }

    setIsSketchPadOpen(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-white rounded-lg">
      <div className="flex justify-between items-center p-2 border-b flex-shrink-0">
        <div className="flex items-center space-x-3">
          <h2 className="text-md font-semibold text-gray-800">
            {job ? `Edit Job #${job.job_number}` : 'Create New Job'}
            {hasUnsavedChanges && <span className="ml-2 text-orange-500 text-sm">• Unsaved changes</span>}
          </h2>
          {job && (
            <button type="button" onClick={handlePrint} title="Print Works Order" className="p-1 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" />
                <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
                <path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" />
              </svg>
            </button>
          )}
          <button type="button" onClick={() => setIsSketchPadOpen(true)} title="Open Sketch Pad" className="p-1 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
              <path d="M13.5 6.5l4 4" />
              <path d="M16 18h4m-2 -2v4" />
            </svg>
          </button>
          {job && onDelete && (
            <button 
              type="button" 
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
                  job.id && onDelete(job.id);
                }
              }} 
              title="Delete Job"
              className="p-1 rounded-full text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M4 7l16 0" />
                <path d="M10 11l0 6" />
                <path d="M14 11l0 6" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {/* Save Button as Tick Icon */}
          <button 
            type="submit" 
            title={hasUnsavedChanges ? 'Save changes' : 'No changes to save'}
            className={`p-1 rounded-full ${hasUnsavedChanges 
              ? 'text-orange-600 hover:bg-orange-50 hover:text-orange-700' 
              : 'text-green-600 hover:bg-green-50 hover:text-green-700'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
          {/* Close Button */}
          <button type="button" onClick={handleCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* Job Number */}
                <div>
                  <label htmlFor="job_number" className="block text-sm font-medium text-gray-700 mb-1">Job Number</label>
                  <input type="text" id="job_number" name="job_number" value={job?.job_number || ''} className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm bg-gray-100" readOnly />
                </div>
                {/* Company */}
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input id="company" name="company" value={formData.company} onChange={handleChange} placeholder="e.g., ABC Corporation" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Customer Name */}
                <div>
                  <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input id="customer_name" name="customer_name" value={formData.customer_name} onChange={handleChange} placeholder="e.g., John Smith" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Status */}
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select id="status" name="status" value={formData.status} onChange={handleChange} className="px-3 py-2 text-sm block w-full border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    {statusOptions.map(status => (
                      <option key={status} value={status} className="capitalize">{status.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                {/* Material */}
                <div>
                  <label htmlFor="material" className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                  <input id="material" name="material" value={formData.material} onChange={handleChange} placeholder="e.g., Acrylic Sheet" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Due Date */}
                <div>
                  <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input id="due_date" name="due_date" value={formData.due_date || ''} onChange={handleChange} type="date" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Job Start */}
                <div>
                  <label htmlFor="job_start" className="block text-sm font-medium text-gray-700 mb-1">Job Start</label>
                  <input id="job_start" name="job_start" value={formatDateTimeForInput(formData.job_start)} onChange={handleChange} type="datetime-local" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Job End */}
                <div>
                  <label htmlFor="job_end" className="block text-sm font-medium text-gray-700 mb-1">Job End</label>
                  <input id="job_end" name="job_end" value={formatDateTimeForInput(formData.job_end)} onChange={handleChange} type="datetime-local" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Phone Number */}
                <div>
                  <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input id="phone_number" name="phone_number" value={formData.phone_number} onChange={handleChange} placeholder="e.g., 021 123 4567" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {/* Email */}
                <div className="md:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input id="email" name="email" value={formData.email} onChange={handleChange} type="email" placeholder="e.g., john.smith@example.com" className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              {/* Address */}
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea id="address" name="address" value={formData.address} onChange={handleChange} placeholder="e.g., 123 Main Street, Auckland" rows={3} className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
              </div>
              {/* Job Description */}
              <div>
                <label htmlFor="job_description" className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <textarea id="job_description" name="job_description" value={formData.job_description} onChange={handleChange} placeholder="e.g., Engrave logo, font 'Times New Roman', color black" rows={3} className="px-3 py-2 text-sm block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
        </div>
      </div>

      {/* Modal Footer - Save button moved to header */}
      <div className="flex-shrink-0 h-2 bg-gray-50 rounded-b-lg">
      </div>

      <SketchPadModal
        isOpen={isSketchPadOpen}
        onClose={() => setIsSketchPadOpen(false)}
        onSave={handleSketchSave}
        initialData={formData.sketch_data}
      />
    </form>
  );
};

export default JobForm;

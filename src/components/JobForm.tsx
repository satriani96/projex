import React, { useState, useRef, useEffect } from 'react';
import type { Job, JobFormData, JobStatus } from '../types/job';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';

interface JobFormProps {
  job?: Job | null;
  onSubmit: (data: JobFormData) => void;
  onCancel: () => void;
}

const statusOptions: JobStatus[] = ['queued', 'in_progress', 'on_hold', 'done'];

import type { CanvasPath } from 'react-sketch-canvas';

const JobForm: React.FC<JobFormProps> = ({ job, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<JobFormData>({
    customer_name: job?.customer_name || '',
    address: job?.address || '',
    phone_number: job?.phone_number || '',
    email: job?.email || '',
    material: job?.material || '',
    status: job?.status || 'queued',
    due_date: job?.due_date || '',
    job_description: job?.job_description || '',
    sketch_data: job?.sketch_data || null, // This is only used for initial load
  });

  // Refs for the canvas components
  const sketchRef = useRef<ReactSketchCanvasRef>(null); // Hidden, for generating SVG previews
  const expandedSketchRef = useRef<ReactSketchCanvasRef>(null); // Visible, for editing

  // State for UI and drawing logic
  const [isSketchExpanded, setIsSketchExpanded] = useState(false);
  const [strokeColor, setStrokeColor] = useState('black');
  const [isErasing, setIsErasing] = useState(false);
  const [sketchSvg, setSketchSvg] = useState<string | null>(null);

  // --- Single Source of Truth for Sketch Data ---
  const [currentPaths, setCurrentPaths] = useState<CanvasPath[]>([]);

  // Bounding box calculation for zoom-to-fit preview
  const getPathsBoundingBox = (paths: CanvasPath[]): { minX: number, minY: number, maxX: number, maxY: number } | null => {
    if (!paths || paths.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let maxStrokeWidth = 0;
    let hasPoints = false;

    for (const path of paths) {
      if (path.strokeWidth > maxStrokeWidth) {
        maxStrokeWidth = path.strokeWidth;
      }
      if (path.paths && path.paths.length > 0) {
        for (const point of path.paths) {
          hasPoints = true;
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }
    }

    if (!hasPoints) return null;

    const halfStroke = maxStrokeWidth / 2;
    return {
      minX: minX - halfStroke,
      minY: minY - halfStroke,
      maxX: maxX + halfStroke,
      maxY: maxY + halfStroke,
    };
  };

  // Generates the SVG preview from the hidden canvas
  const updateSketchPreview = async () => {
    if (!sketchRef.current) return;

    const paths = await sketchRef.current.exportPaths();
    if (paths.length === 0) {
      setSketchSvg(null);
      return;
    }

    const bbox = getPathsBoundingBox(paths);
    if (!bbox) {
      setSketchSvg(null);
      return;
    }

    const svgString = await sketchRef.current.exportSvg();
    if (!svgString) {
      setSketchSvg(null);
      return;
    }

    const padding = 20;
    const viewBoxX = bbox.minX - padding;
    const viewBoxY = bbox.minY - padding;
    const viewBoxWidth = (bbox.maxX - bbox.minX) + (padding * 2);
    const viewBoxHeight = (bbox.maxY - bbox.minY) + (padding * 2);

    if (viewBoxWidth <= 0 || viewBoxHeight <= 0) {
      setSketchSvg(null);
      return;
    }

    const viewBox = `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;
    const finalSvg = svgString.replace(/<svg/, `<svg preserveAspectRatio="xMidYMid meet" viewBox="${viewBox}"`);
    setSketchSvg(finalSvg);
  };

  // Effect to load initial sketch data from the job prop
  useEffect(() => {
    const loadInitialSketch = async () => {
      let initialPaths: CanvasPath[] = [];
      if (job?.sketch_data) {
        try {
          initialPaths = JSON.parse(job.sketch_data);
        } catch (error) {
          console.error("Failed to parse sketch data:", error);
          initialPaths = [];
        }
      }
      setCurrentPaths(initialPaths);

      if (sketchRef.current) {
        await sketchRef.current.clearCanvas();
        if (initialPaths.length > 0) {
          await sketchRef.current.loadPaths(initialPaths);
        }
        // Use a timeout to ensure canvas has rendered the paths before generating the preview
        setTimeout(updateSketchPreview, 100);
      }
    };

    loadInitialSketch();
  }, [job]);

  // Effect to sync paths to the expanded canvas when it opens
  useEffect(() => {
    if (isSketchExpanded && expandedSketchRef.current) {
      expandedSketchRef.current.loadPaths(currentPaths);
    }
  }, [isSketchExpanded, currentPaths]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Final submission of the form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sketchData = currentPaths.length > 0 ? JSON.stringify(currentPaths) : null;
    onSubmit({ ...formData, sketch_data: sketchData });
  };

  // Called when user clicks "Done" in the expanded editor
  const handleDoneSketching = async () => {
    if (expandedSketchRef.current) {
      const paths = await expandedSketchRef.current.exportPaths();
      setCurrentPaths(paths);

      // Update the hidden canvas with the latest paths to refresh the preview
      if (sketchRef.current) {
        await sketchRef.current.clearCanvas();
        await sketchRef.current.loadPaths(paths);
        await updateSketchPreview();
      }
    }
    setIsSketchExpanded(false);
  };

  const handleClearSketch = () => {
    setCurrentPaths([]);
    expandedSketchRef.current?.clearCanvas();
  };

  const handleClearSmallSketch = async () => {
    setCurrentPaths([]);
    if (sketchRef.current) {
      await sketchRef.current.clearCanvas();
      await updateSketchPreview();
    }
  }

  const handleColorChange = (color: string) => {
    setStrokeColor(color);
    setIsErasing(false);
  };

  const handleEraseToggle = () => {
    setIsErasing((prev) => !prev);
  };

  // Imperatively set the erase mode when the state changes
  useEffect(() => {
    if (expandedSketchRef.current) {
      expandedSketchRef.current.eraseMode(isErasing);
    }
  }, [isErasing]);

  const handlePrint = () => {
    if (!job) return;

    // Use the most up-to-date data for printing
    const printData = { ...formData, ...job };

    const printContent = `
      <html>
        <head>
          <title>Works Order - Job #${printData.job_number}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #111; }
            @page { size: A4; margin: 20mm; }
            .page { width: 100%; height: 100%; }
            h1, h2 { margin: 0 0 10px 0; padding: 0; }
            h1 { font-size: 22pt; border-bottom: 2px solid black; padding-bottom: 8px; margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .section { border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; }
            .section h2 { font-size: 14pt; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
            .details p { margin: 0 0 8px 0; font-size: 11pt; }
            .details strong { display: inline-block; width: 110px; color: #555; }
            .full-width { grid-column: 1 / -1; }
            .description { white-space: pre-wrap; font-size: 11pt; }
            .sketch-container { border: 1px solid #ccc; border-radius: 8px; padding: 10px; min-height: 300px; display: flex; align-items: center; justify-content: center; }
            .sketch-container svg { max-width: 100%; max-height: 100%; }
          </style>
        </head>
        <body>
          <div class="page">
            <h1>Works Order: Job #${printData.job_number}</h1>
            <div class="grid">
              <div class="section">
                <h2>Customer Details</h2>
                <div class="details">
                  <p><strong>Customer:</strong> ${printData.customer_name}</p>
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
              <div class="section full-width">
                <h2>Sketch</h2>
                <div class="sketch-container">
                  ${sketchSvg || '<p>No sketch provided.</p>'}
                </div>
              </div>
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

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col h-full bg-white rounded-lg">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-2 border-b flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-md font-semibold text-gray-800">
              {job ? `Edit Job #${job.job_number}` : 'Create New Job'}
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
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-x-6">
                {/* Left Column: Form Fields (takes 3/5 width) */}
                <div className="md:col-span-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
                    {/* Job Number */}
                    <div>
                      <label htmlFor="job_number" className="block text-xs font-medium text-gray-600 mb-0.5">Job Number</label>
                      <input type="text" id="job_number" name="job_number" value={job?.job_number || ''} className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm bg-gray-100" readOnly />
                    </div>
                    {/* Customer Name */}
                    <div>
                      <label htmlFor="customer_name" className="block text-xs font-medium text-gray-600 mb-0.5">Customer Name</label>
                      <input id="customer_name" name="customer_name" value={formData.customer_name} onChange={handleChange} placeholder="e.g., John Smith" className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    {/* Status */}
                    <div>
                      <label htmlFor="status" className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                      <select id="status" name="status" value={formData.status} onChange={handleChange} className="p-1 text-xs block w-full border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                        {statusOptions.map(status => (
                          <option key={status} value={status} className="capitalize">{status.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                    {/* Material */}
                    <div>
                      <label htmlFor="material" className="block text-xs font-medium text-gray-600 mb-0.5">Material</label>
                      <input id="material" name="material" value={formData.material} onChange={handleChange} placeholder="e.g., Acrylic Sheet" className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    {/* Due Date */}
                    <div>
                      <label htmlFor="due_date" className="block text-xs font-medium text-gray-600 mb-0.5">Due Date</label>
                      <input id="due_date" name="due_date" value={formData.due_date || ''} onChange={handleChange} type="date" className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    {/* Phone Number */}
                    <div>
                      <label htmlFor="phone_number" className="block text-xs font-medium text-gray-600 mb-0.5">Phone Number</label>
                      <input id="phone_number" name="phone_number" value={formData.phone_number} onChange={handleChange} placeholder="e.g., 021 123 4567" className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    {/* Email */}
                    <div className="md:col-span-2">
                      <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-0.5">Email</label>
                      <input id="email" name="email" value={formData.email} onChange={handleChange} type="email" placeholder="e.g., john.smith@example.com" className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                  </div>
                  {/* Address */}
                  <div>
                    <label htmlFor="address" className="block text-xs font-medium text-gray-600 mb-0.5">Address</label>
                    <textarea id="address" name="address" value={formData.address} onChange={handleChange} placeholder="e.g., 123 Main Street, Auckland" rows={2} className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  {/* Job Description */}
                  <div>
                    <label htmlFor="job_description" className="block text-xs font-medium text-gray-600 mb-0.5">Job Description</label>
                    <textarea id="job_description" name="job_description" value={formData.job_description} onChange={handleChange} placeholder="e.g., Engrave logo, font 'Times New Roman', color black" rows={2} className="p-1 text-xs block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                </div>

                {/* Right Column: Sketch Pad (takes 2/5 width) */}
                <div className="md:col-span-2 mt-4 md:mt-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="block text-xs font-medium text-gray-600">Sketch Pad</label>
                    <button type="button" onClick={() => setIsSketchExpanded(true)} className="p-0.5 rounded-full text-gray-500 hover:bg-gray-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <path d="M16 4l4 0l0 4" />
                          <path d="M14 10l6 -6" />
                          <path d="M8 20l-4 0l0 -4" />
                          <path d="M4 20l6 -6" />
                          <path d="M16 20l4 0l0 -4" />
                          <path d="M14 14l6 6" />
                          <path d="M8 4l-4 0l0 4" />
                          <path d="M4 4l6 6" />
                      </svg>
                    </button>
                  </div>
                  <div className="aspect-square border rounded-md overflow-hidden bg-gray-50 flex items-center justify-center">
                    {sketchSvg ? (
                      <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: sketchSvg }} />
                    ) : (
                      <span className="text-xs text-gray-500">No sketch.</span>
                    )}
                  </div>
                  {/* Hidden canvas for data operations */}
                  <div style={{ display: 'none' }}>
                    <ReactSketchCanvas ref={sketchRef} />
                  </div>
                  <button type="button" onClick={handleClearSmallSketch} className="text-xs text-blue-600 hover:underline mt-1">Clear Sketch</button>
                </div>
              </div>
            </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end items-center space-x-2 p-2 border-t bg-gray-50 rounded-b-lg flex-shrink-0">
          <button type="button" onClick={onCancel} className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-xs">Cancel</button>
          <button type="submit" className="px-2.5 py-1 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-xs">{job ? 'Save Changes' : 'Create Job'}</button>
        </div>
      </form>

      {/* Expanded Sketch Modal */}
      {isSketchExpanded && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col p-4 animate-fade-in">
          {/* Header */}
          <div className="flex justify-between items-center mb-2 flex-shrink-0">
            <h2 className="text-white text-lg font-semibold">Sketch Pad</h2>
            <button onClick={handleDoneSketching} className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Done</button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-center space-x-2 mb-2 p-2 bg-gray-800 rounded-md flex-shrink-0">
            {/* Color Palette */}
            <button onClick={() => handleColorChange('black')} className={`w-6 h-6 rounded-full border-2 ${strokeColor === 'black' && !isErasing ? 'border-white' : 'border-gray-500'}`} style={{ backgroundColor: 'black' }} />
            <button onClick={() => handleColorChange('red')} className={`w-6 h-6 rounded-full border-2 ${strokeColor === 'red' && !isErasing ? 'border-white' : 'border-gray-500'}`} style={{ backgroundColor: 'red' }} />
            <button onClick={() => handleColorChange('blue')} className={`w-6 h-6 rounded-full border-2 ${strokeColor === 'blue' && !isErasing ? 'border-white' : 'border-gray-500'}`} style={{ backgroundColor: 'blue' }} />
            <button onClick={() => handleColorChange('green')} className={`w-6 h-6 rounded-full border-2 ${strokeColor === 'green' && !isErasing ? 'border-white' : 'border-gray-500'}`} style={{ backgroundColor: 'green' }} />
            
            <div className="border-l border-gray-600 h-6 mx-2" />

            {/* Tools */}
            <button onClick={handleEraseToggle} className={`p-1 rounded-md ${isErasing ? 'bg-blue-500 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'}`} title={isErasing ? "Switch to Pen" : "Switch to Eraser"}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
                  <path d="M18 13.3l-6.3 -6.3" />
                </svg>
            </button>
            <button type="button" onClick={handleClearSketch} className="p-1 rounded-md bg-gray-600 hover:bg-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-white rounded-md overflow-hidden">
            <ReactSketchCanvas
              ref={expandedSketchRef}
              height="100%"
              width="100%"
              strokeWidth={5}
              eraserWidth={20}
              strokeColor={strokeColor}
              canvasColor="white"
              withTimestamp={false}
              
              
            />
          </div>
        </div>
      )}
    </>
  );
};

export default JobForm;

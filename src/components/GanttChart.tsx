import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Job } from '../types/job';
import { Group } from '@visx/group';
import { scaleTime } from '@visx/scale';
import { GridColumns } from '@visx/grid';
import { AxisBottom } from '@visx/axis';
import { Bar } from '@visx/shape';
import { useTooltip, useTooltipInPortal, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { Zoom } from '@visx/zoom';
import { timeMinute, timeHour } from 'd3-time';

// Define interface for component props
interface GanttChartProps {
  jobs: Job[];
  width?: number;
  height?: number;
  onJobTimeUpdate?: (jobId: string, start: Date, end: Date) => void;
  onJobClick?: (job: Job) => void;
}

interface GanttTask {
  id: string;
  job_id: string;
  name: string;
  start: Date;
  end: Date;
  color: string;
}

type DragOperation = 'move' | 'resize-start' | 'resize-end' | null;

// Chart dimensions
const margin = { top: 20, right: 60, bottom: 100, left: 60 };
const DRAG_HANDLE_WIDTH = 8;

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: 'rgba(50,50,50,0.8)',
  color: 'white',
  padding: '0.5rem',
  borderRadius: '4px',
  fontSize: '12px',
};

const GanttChart: React.FC<GanttChartProps> = ({ 
  jobs, 
  width: initialWidth = window.innerWidth - 32, // Default to window width minus padding
  height = 300, // Reduced height since we only have one row
  onJobTimeUpdate = (jobId, start, end) => {
    // Default implementation logs the update
    console.log('Job time update:', { jobId, start: start.toISOString(), end: end.toISOString() });
  },
  onJobClick = (job) => {
    // Default implementation logs the click
    console.log('Job clicked:', job.id);
  }
}) => {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip<GanttTask>();
  const { TooltipInPortal } = useTooltipInPortal({ scroll: true });
  
  // State for tracking the task being dragged and the drag operation
  const [draggedTask, setDraggedTask] = useState<GanttTask | null>(null);
  const [dragOperation, setDragOperation] = useState<DragOperation>(null);
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; startDate: Date; endDate: Date } | null>(null);
  
  // State for responsive width
  const [width, setWidth] = useState(initialWidth);

  const svgRef = React.useRef<SVGSVGElement | null>(null);

  // State for panning mode (spacebar or middle mouse)
  const [panning, setPanning] = useState(false);
  const [middlePanning, setMiddlePanning] = useState(false);

  // Listen for spacebar keydown/up to enable panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanning(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanning(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Listen for middle mouse button for panning
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        setMiddlePanning(true);
        // Prevent default browser scroll
        e.preventDefault();
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 1) setMiddlePanning(false);
    };
    const handleMouseLeave = () => setMiddlePanning(false);
    svg.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    svg.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      svg.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      svg.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [svgRef]);

  // Prepare data for the chart
  const ganttTasks: GanttTask[] = useMemo(() => jobs
    .filter((job: Job) => job.job_start && job.job_end)
    .map((job: Job) => {
        let hash = 0;
        for (let i = 0; i < job.id.length; i++) {
          hash = job.id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 300);
        const color = `hsl(${hue}, 70%, 50%)`;

        return {
            id: `task-${job.id}`,
            job_id: job.id,
            name: `${job.job_number || 'No #'} - ${job.customer_name || 'Unnamed'}`,
            start: new Date(job.job_start as string),
            end: new Date(job.job_end as string),
            color: color
        };
    }), [jobs]);

  // Infinite timeline: set a huge domain
  const hugeDomain = useMemo(() => {
    const now = new Date();
    const min = new Date(now.getTime());
    min.setFullYear(min.getFullYear() - 50);
    const max = new Date(now.getTime());
    max.setFullYear(max.getFullYear() + 50);
    return [min, max];
  }, []);

  // Chart bounds
  const xMax = width - margin.left - margin.right;

  // Scales
  const xScale = useMemo(() => {
    return scaleTime<number>({
      domain: hugeDomain,
      range: [0, xMax],
    });
  }, [xMax, hugeDomain]);
  
  // Calculate the row height for the single row
  const rowHeight = 80; // Single fixed height for all bars to ensure enough space

  // Handle drag operations for task bars
  const handleDragStart = useCallback((task: GanttTask, operation: DragOperation, clientX: number) => {
    // Make a deep copy to avoid mutation issues
    setDraggedTask({
      ...task,
      start: new Date(task.start),
      end: new Date(task.end)
    });
    
    setDragOperation(operation);
    setDragStartPosition({
      x: clientX,
      startDate: new Date(task.start),
      endDate: new Date(task.end)
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    // Only call onJobTimeUpdate when drag is complete
    if (draggedTask && dragOperation) {
      // Call the callback once with final values
      onJobTimeUpdate(draggedTask.job_id, draggedTask.start, draggedTask.end);
    }
    // Clear the drag state
    setDraggedTask(null);
    setDragOperation(null);
  }, [draggedTask, dragOperation, onJobTimeUpdate]);

  // Helper function to get cursor style based on drag operation
  const getCursorStyle = useCallback((operation: DragOperation): string => {
    switch (operation) {
      case 'move': return 'grabbing';
      case 'resize-start': 
      case 'resize-end': return 'ew-resize';
      default: return 'default';
    }
  }, []);

  // Handle window resize for responsiveness
  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth - 32); // Adjust width based on window size
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = svg.getBoundingClientRect();
      // Mouse position in SVG coordinates
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;
      // Pass the SVG coordinates directly as the center
      if (typeof (window as any).__latestZoom === 'function') {
        (window as any).__latestZoom(scale, { x: svgX, y: svgY });
      }
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [width, height]);

  // Utility function to handle mouse down events for dragging
  const onMouseDown = useCallback((event: React.MouseEvent, task: GanttTask, operation: DragOperation) => {
    // Prevent the event from triggering zoom
    event.stopPropagation();
    event.preventDefault();
    
    // Start the drag operation
    handleDragStart(task, operation, event.clientX);
  }, [handleDragStart]);

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <Zoom<SVGSVGElement>
        width={width}
        height={height}
        scaleXMin={0.01} // allow much deeper zoom in
        scaleXMax={200} // allow much further zoom out
      >
        {(zoom: any) => {
          // --- Fix: set initial domain for zoomedXScale to padded job range ---
          const [, setInitialDomain] = useState<[Date, Date] | null>(null);
          const [initialZoomed, setInitialZoomed] = useState(false);

          // --- Controlled domain: sync timeline and tasks ---
          const [visibleDomain, setVisibleDomain] = useState<[Date, Date] | null>(null);
          const [initialFitted, setInitialFitted] = useState(false);

          // On initial load, set domain to tightly fit jobs and set zoom transform
          useEffect(() => {
            if (initialFitted || visibleDomain) return;
            if (!ganttTasks.length) return;
            const minDate = new Date(Math.min(...ganttTasks.map(t => t.start.getTime())));
            const maxDate = new Date(Math.max(...ganttTasks.map(t => t.end.getTime())));
            const paddedMin = new Date(minDate.getTime() - 3 * 24 * 60 * 60 * 1000);
            const paddedMax = new Date(maxDate.getTime() + 3 * 24 * 60 * 60 * 1000);
            setVisibleDomain([paddedMin, paddedMax]);
            setInitialFitted(true);
          }, [ganttTasks, visibleDomain, initialFitted]);

          // Remove useEffect that syncs domain from transform matrix

          // Custom pan/zoom handlers to update domain in state
          const handlePan = useCallback((deltaPx: number) => {
            if (!visibleDomain) return;
            const domainMs = visibleDomain[1].getTime() - visibleDomain[0].getTime();
            const msPerPx = domainMs / xMax;
            const deltaMs = -deltaPx * msPerPx; // negative for natural direction
            setVisibleDomain([
              new Date(visibleDomain[0].getTime() + deltaMs),
              new Date(visibleDomain[1].getTime() + deltaMs)
            ]);
          }, [visibleDomain, xMax]);

          const handleZoom = useCallback((scaleFactor: number, centerPx: number) => {
            if (!visibleDomain) return;
            const domainStart = visibleDomain[0].getTime();
            const domainEnd = visibleDomain[1].getTime();
            const domainMs = domainEnd - domainStart;
            const centerRatio = centerPx / xMax;
            const centerTime = domainStart + domainMs * centerRatio;
            const newDomainMs = domainMs / scaleFactor;
            const newStart = centerTime - newDomainMs * centerRatio;
            const newEnd = centerTime + newDomainMs * (1 - centerRatio);
            setVisibleDomain([
              new Date(newStart),
              new Date(newEnd)
            ]);
          }, [visibleDomain, xMax]);

          // Patch visx Zoom event handlers to call our pan/zoom
          useEffect(() => {
            (window as any).__latestZoom = (scale: number, center: { x: number; y: number }) => {
              handleZoom(scale, center.x - margin.left);
            };
          }, [handleZoom]);

          // Patch dragStart/dragMove to call our pan
          useEffect(() => {
            zoom.dragMove = (e: MouseEvent | React.MouseEvent) => {
              if (!zoom.isDragging) return;
              const deltaPx = e.movementX;
              handlePan(deltaPx);
            };
          }, [zoom, handlePan]);

          // --- Use correct domain for zoomedXScale at all times ---
          const zoomedXScale = useMemo(() => {
            const scale = scaleTime({
              domain: visibleDomain || hugeDomain,
              range: [0, xMax],
            });
            return scale;
          }, [visibleDomain, xMax, hugeDomain]);

          // Calculate msPerPixel based on zoomed scale
          const msPerPixel = useMemo(() => {
            const domain = zoomedXScale.domain();
            const range = zoomedXScale.range();
            const visibleTimeRange = domain[1].getTime() - domain[0].getTime();
            const pixelRange = range[1] - range[0];
            return visibleTimeRange / pixelRange;
          }, [zoomedXScale]);

          // Drag logic that uses the zoomed msPerPixel
          const handleDrag = useCallback((clientX: number) => {
            if (!draggedTask || !dragOperation || !dragStartPosition) {
              return;
            }
            const deltaX = clientX - dragStartPosition.x;
            const deltaMs = deltaX * msPerPixel;
            let newStart = new Date(dragStartPosition.startDate);
            let newEnd = new Date(dragStartPosition.endDate);
            if (dragOperation === 'move') {
              newStart = new Date(newStart.getTime() + deltaMs);
              newEnd = new Date(newEnd.getTime() + deltaMs);
            } else if (dragOperation === 'resize-start') {
              newStart = new Date(newStart.getTime() + deltaMs);
              if (newStart > newEnd) newStart = newEnd;
            } else if (dragOperation === 'resize-end') {
              newEnd = new Date(newEnd.getTime() + deltaMs);
              if (newEnd < newStart) newEnd = newStart;
            }
            setDraggedTask({
              ...draggedTask,
              start: newStart,
              end: newEnd
            });
          }, [draggedTask, dragOperation, dragStartPosition, msPerPixel]);

          // Move the global mouse event handler useEffect here
          useEffect(() => {
            if (!dragOperation || !draggedTask) return;
            const handleMouseMove = (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              handleDrag(event.clientX);
            };
            const handleMouseUp = (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              handleDragEnd();
            };
            window.addEventListener('mousemove', handleMouseMove, { capture: true });
            window.addEventListener('mouseup', handleMouseUp, { capture: true });
            document.body.style.userSelect = 'none';
            document.body.style.cursor = getCursorStyle(dragOperation);
            return () => {
              window.removeEventListener('mousemove', handleMouseMove, { capture: true });
              window.removeEventListener('mouseup', handleMouseUp, { capture: true });
              document.body.style.userSelect = '';
              document.body.style.cursor = '';
            };
          }, [dragOperation, draggedTask, handleDrag]);

          // Auto-zoom to fit jobs on first render
          useEffect(() => {
            if (initialZoomed) return;
            if (!ganttTasks.length) return;
            // Find min/max dates from jobs
            const minDate = new Date(Math.min(...ganttTasks.map(t => t.start.getTime())));
            const maxDate = new Date(Math.max(...ganttTasks.map(t => t.end.getTime())));
            // Always pad by ±3 days for initial view
            const paddedMin = new Date(minDate.getTime() - 3 * 24 * 60 * 60 * 1000);
            const paddedMax = new Date(maxDate.getTime() + 3 * 24 * 60 * 60 * 1000);
            setInitialDomain([paddedMin, paddedMax]);
            // Calculate the scale factor so the padded domain fits the visible area (excluding margin.left)
            const domainMs = paddedMax.getTime() - paddedMin.getTime();
            const scaleX = xMax / domainMs;
            // Align paddedMin with the left edge of the chart (after margin.left)
            const minDateX = xScale(paddedMin);
            zoom.setTransformMatrix({
              scaleX,
              scaleY: 1,
              translateX: margin.left - minDateX * scaleX,
              translateY: 0,
              skewX: 0,
              skewY: 0
            });
            setInitialZoomed(true);
          }, [ganttTasks, xScale, xMax, zoom, initialZoomed]);

          return (
            <>
              {/* Zoom Control Buttons */}
              <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                zIndex: 10,
                display: 'flex',
                gap: '5px'
              }}>
                <button 
                  onClick={() => zoom.reset()}
                  style={{
                    padding: '4px 8px',
                    background: '#f0f0f0',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Reset
                </button>
                <button 
                  onClick={() => zoom.scale({ scaleX: 1.2, center: { x: width / 2, y: height / 2 } })}
                  style={{
                    padding: '4px 8px',
                    background: '#f0f0f0',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Zoom +
                </button>
                <button 
                  onClick={() => zoom.scale({ scaleX: 0.8, center: { x: width / 2, y: height / 2 } })}
                  style={{
                    padding: '4px 8px',
                    background: '#f0f0f0',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Zoom -
                </button>
              </div>
              <svg 
                ref={svgRef}
                width={width} 
                height={height} 
                style={{ 
                  cursor: dragOperation
                    ? getCursorStyle(dragOperation)
                    : zoom.isDragging
                      ? 'grabbing'
                      : (panning || middlePanning)
                        ? 'grab'
                        : 'default',
                  touchAction: 'none'
                }} 
                {...zoom.containerProps}
                onMouseDown={e => {
                  // Only start panning if spacebar or middle mouse
                  if ((panning || middlePanning) && e.button !== 2) {
                    // Prevent default for middle mouse
                    if (e.button === 1) e.preventDefault();
                    zoom.dragStart(e);
                  }
                }}
                onMouseMove={e => {
                  if (panning || middlePanning) zoom.dragMove(e);
                }}
                onMouseUp={e => {
                  if (panning || middlePanning) zoom.dragEnd(e);
                }}
                onMouseLeave={e => {
                  if (panning || middlePanning) zoom.dragEnd(e);
                }}
              >
                <defs>
                  <clipPath id="clip">
                    <rect x={0} y={0} width={xMax} height={rowHeight} />
                  </clipPath>
                </defs>
                <rect x={0} y={0} width={width} height={height} fill="#fff" rx={14} />
                <Group left={margin.left} top={margin.top}>
                  <GridColumns scale={zoomedXScale} height={rowHeight} stroke="#e0e0e0" />
                  <Group clipPath="url(#clip)">
                    {ganttTasks.map((task: GanttTask) => {
                      // If this task is currently being dragged, use the draggedTask state instead
                      // This is crucial for visual feedback during dragging
                      const renderTask = (draggedTask && draggedTask.id === task.id) ? draggedTask : task;
                      const y = 0; // All tasks in a single row
                      // Use zoomedXScale for both start and end
                      const x = zoomedXScale(renderTask.start);
                      const barWidth = zoomedXScale(renderTask.end) - x;
                      const barHeight = rowHeight;
                      if (barWidth <= 0) return null;
                      
                      // Determine if this is the task being dragged
                      const isDragging = draggedTask && draggedTask.id === task.id;
                      
                      return (
                        <Group key={`bar-group-${task.id}`}>
                          {/* Task drag handle (top portion) */}
                          <Bar
                            key={`drag-handle-${task.id}`}
                            x={x}
                            y={y}
                            width={barWidth}
                            height={10} // Height of the drag handle
                            fill={task.color}
                            opacity={isDragging ? 0.7 : 1}
                            rx={4} // rounded top corners
                            ry={0} // square bottom corners
                            onMouseDown={(event: React.MouseEvent) => onMouseDown(event, task, 'move')}
                            onMouseMove={(event: React.MouseEvent) => {
                              if (!dragOperation) {
                                const point = localPoint(event);
                                if (!point) return;
                                showTooltip({
                                  tooltipData: task,
                                  tooltipLeft: point.x,
                                  tooltipTop: point.y,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              if (!dragOperation) hideTooltip();
                            }}
                            style={{ cursor: 'grab', touchAction: 'none' }}
                          />
                          
                          {/* Main task bar (clickable body) */}
                          <Bar
                            key={`bar-${task.id}`}
                            x={x}
                            y={y + 10} // Position below the drag handle
                            width={barWidth}
                            height={barHeight - 10} // Reduce height to accommodate drag handle
                            fill={task.color}
                            opacity={isDragging ? 0.7 : 0.85} // Slightly lighter than the drag handle
                            rx={0} // square top corners
                            ry={4} // rounded bottom corners
                            onClick={() => {
                              // Find the original job object from jobs prop
                              const jobObj = jobs.find(job => job.id === task.job_id);
                              if (jobObj) onJobClick(jobObj);
                            }}
                            onMouseMove={(event: React.MouseEvent) => {
                              if (!dragOperation) {
                                const point = localPoint(event);
                                if (!point) return;
                                showTooltip({
                                  tooltipData: task,
                                  tooltipLeft: point.x,
                                  tooltipTop: point.y,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              if (!dragOperation) hideTooltip();
                            }}
                            style={{ cursor: 'pointer', touchAction: 'none' }}
                          />
                          {/* Left resize handle */}
                          <Bar
                            key={`handle-start-${task.id}`}
                            x={x - DRAG_HANDLE_WIDTH / 2}
                            y={y}
                            width={DRAG_HANDLE_WIDTH}
                            height={barHeight}
                            fill="rgba(0,0,0,0.2)"
                            rx={2}
                            onMouseDown={(event: React.MouseEvent) => onMouseDown(event, task, 'resize-start')}
                            style={{ cursor: 'ew-resize', touchAction: 'none' }}
                          />
                          
                          {/* Right resize handle */}
                          <Bar
                            key={`handle-end-${task.id}`}
                            x={x + barWidth - DRAG_HANDLE_WIDTH / 2}
                            y={y}
                            width={DRAG_HANDLE_WIDTH}
                            height={barHeight}
                            fill="rgba(0,0,0,0.2)"
                            rx={2}
                            onMouseDown={(event: React.MouseEvent) => onMouseDown(event, task, 'resize-end')}
                            style={{ cursor: 'ew-resize', touchAction: 'none' }}
                          />
                        </Group>
                      );
                    })}
                  </Group>
                </Group>
                {/* Hour/minute level axis */}
                <AxisBottom
                  top={rowHeight + margin.top}
                  left={margin.left}
                  scale={zoomedXScale}
                  stroke="#333"
                  tickStroke="#333"
                  tickValues={useMemo(() => {
                    // Use visx scaleTime().ticks() for dynamic granularity
                    const domain = zoomedXScale.domain();
                    const ms = domain[1].getTime() - domain[0].getTime();
                    if (ms < 2 * 60 * 60 * 1000) {
                      // <2 hours: show every 5 minutes
                      return zoomedXScale.ticks(timeMinute.every(5));
                    } else if (ms < 24 * 60 * 60 * 1000) {
                      // <1 day: show every hour
                      return zoomedXScale.ticks(timeHour.every(1));
                    } else {
                      // Otherwise, let visx pick
                      return zoomedXScale.ticks();
                    }
                  }, [zoomedXScale])}
                  tickFormat={(value) => {
                    const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
                    const domain = zoomedXScale.domain();
                    const ms = domain[1].getTime() - domain[0].getTime();
                    if (ms < 2 * 60 * 60 * 1000) {
                      // <2 hours: show HH:mm
                      return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    } else {
                      // Otherwise just hour
                      return date.getHours() + ':00';
                    }
                  }}
                  tickLabelProps={() => ({ 
                    fill: '#333', 
                    fontSize: 10, 
                    textAnchor: 'middle' 
                  })}
                />
                {/* Day level axis */}
                <AxisBottom
                  top={rowHeight + margin.top + 30}
                  left={margin.left}
                  scale={zoomedXScale}
                  stroke="#333"
                  tickStroke="#333"
                  tickFormat={(value) => {
                    const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
                    return date.getDate().toString();
                  }}
                  tickLabelProps={() => ({ 
                    fill: '#333', 
                    fontSize: 11, 
                    textAnchor: 'middle' 
                  })}
                />
                {/* Month level axis */}
                <AxisBottom
                  top={rowHeight + margin.top + 60}
                  left={margin.left}
                  scale={zoomedXScale}
                  tickFormat={(value) => {
                    const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
                    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
                  }}
                  stroke="#333"
                  tickStroke="#333"
                  tickLabelProps={() => ({ 
                    fill: '#333', 
                    fontSize: 12, 
                    textAnchor: 'middle',
                    fontWeight: 'bold'
                  })}
                />
              </svg>
            </>
          );
        }}
      </Zoom>
      {tooltipData && !dragOperation && (
        <TooltipInPortal top={tooltipTop} left={tooltipLeft} style={tooltipStyles}>
          <strong>{tooltipData.name}</strong>
          <div>Start: {tooltipData.start.toLocaleDateString()}</div>
          <div>End: {tooltipData.end.toLocaleDateString()}</div>
          <div style={{ fontSize: '10px', marginTop: '4px' }}>
            <em>Drag to move, handles to resize</em>
          </div>
        </TooltipInPortal>
      )}
    </div>
  );
};

export default GanttChart;
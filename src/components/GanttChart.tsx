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

  // Chart bounds
  const xMax = width - margin.left - margin.right;

  // Scales
  const xScale = useMemo(() => {
    const allDates = ganttTasks.flatMap((task: GanttTask) => [task.start, task.end]);
    if (allDates.length === 0) return scaleTime({ domain: [new Date(), new Date()], range: [0, xMax] });
    const minDate = new Date(Math.min(...allDates.map((d: Date) => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map((d: Date) => d.getTime())));
    
    // Add some padding to the time range
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 2);

    return scaleTime<number>({
      domain: [minDate, maxDate],
      range: [0, xMax],
    });
  }, [ganttTasks, xMax]);
  
  // Calculate the row height for the single row
  const rowHeight = 80; // Single fixed height for all bars to ensure enough space

  // Calculate the zoomed scale based on the transform matrix
  const zoomedXScale = useMemo(() => {
    const newScale = xScale.copy();
    newScale.domain(
      newScale.range().map((r: number) => 
        newScale.invert((r - 0) / 1)
      )
    );
    return newScale;
  }, [xScale]);

  // Calculate milliseconds per pixel for drag operations
  const msPerPixel = useMemo(() => {
    const visibleTimeRange = xScale.domain()[1].getTime() - xScale.domain()[0].getTime();
    const pixelRange = xMax;
    const result = visibleTimeRange / pixelRange;
    return result;
  }, [xScale, xMax]);

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

  const handleDrag = useCallback((clientX: number) => {
    if (!draggedTask || !dragOperation || !dragStartPosition) {
      return;
    }
    
    const deltaX = clientX - dragStartPosition.x;
    // Convert pixels to milliseconds based on the current scale
    const deltaMs = deltaX * msPerPixel / 1;
    
    let newStart = new Date(dragStartPosition.startDate);
    let newEnd = new Date(dragStartPosition.endDate);
    
    if (dragOperation === 'move') {
      newStart = new Date(newStart.getTime() + deltaMs);
      newEnd = new Date(newEnd.getTime() + deltaMs);
    } else if (dragOperation === 'resize-start') {
      newStart = new Date(newStart.getTime() + deltaMs);
      // Ensure start doesn't go past end
      if (newStart > newEnd) newStart = newEnd;
    } else if (dragOperation === 'resize-end') {
      newEnd = new Date(newEnd.getTime() + deltaMs);
      // Ensure end doesn't go before start
      if (newEnd < newStart) newEnd = newStart;
    }

    // Update the visual representation during drag
    setDraggedTask({
      ...draggedTask,
      start: newStart,
      end: newEnd
    });
  }, [draggedTask, dragOperation, dragStartPosition, msPerPixel]);

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

  // Global mouse event handlers for dragging - only added once when drag starts
  useEffect(() => {
    // Skip setup if not dragging
    if (!dragOperation || !draggedTask) return;
    
    const handleMouseMove = (event: MouseEvent) => {
      // Prevent default actions like text selection
      event.preventDefault();
      event.stopPropagation();
      // Pass the clientX for drag calculations
      handleDrag(event.clientX);
    };

    const handleMouseUp = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      handleDragEnd();
    };

    // Add listeners for drag operations
    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
    
    // Disable text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = getCursorStyle(dragOperation);

    return () => {
      // Clean up event listeners
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragOperation, draggedTask]); // Only re-run when drag operation or dragged task changes



  if (width <= 0) return null;

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
        scaleXMin={0.5}
        scaleXMax={50}
      >
        {(zoom: any) => {
          return (
            <svg 
              width={width} 
              height={height} 
              style={{ 
                cursor: dragOperation ? getCursorStyle(dragOperation) : zoom.isDragging ? 'grabbing' : 'grab',
                touchAction: 'none' // Add touch-action here to fix the warning
              }} 
              ref={zoom.containerRef}
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
              {/* Hour level axis */}
              <AxisBottom
                top={rowHeight + margin.top}
                left={margin.left}
                scale={zoomedXScale}
                stroke="#333"
                tickStroke="#333"
                tickFormat={(value) => {
                  const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
                  return date.getHours() + ':00';
                }}
                tickLabelProps={() => ({ 
                  fill: '#333', 
                  fontSize: 10, 
                  textAnchor: 'middle' 
                })}
                numTicks={24}
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
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Job } from '../types/job';
import { Group } from '@visx/group';
import { scaleBand, scaleTime } from '@visx/scale';
import { GridRows, GridColumns } from '@visx/grid';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { Bar } from '@visx/shape';
import { useTooltip, useTooltipInPortal, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { Zoom } from '@visx/zoom';
import type { TransformMatrix } from '@visx/zoom/lib/types';

// Define interface for component props
interface GanttChartProps {
  jobs: Job[];
  width?: number;
  height?: number;
  onJobTimeUpdate?: (jobId: string, start: Date, end: Date) => void;
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
const margin = { top: 20, right: 40, bottom: 70, left: 150 };
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
  width = 800, 
  height = 500,
  onJobTimeUpdate = (jobId, start, end) => {
    // Default implementation logs the update
    console.log('Job time update:', { jobId, start: start.toISOString(), end: end.toISOString() });
  }
}) => {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip<GanttTask>();
  const { TooltipInPortal } = useTooltipInPortal({ scroll: true });

  // State for tracking the task being dragged and the drag operation
  const [draggedTask, setDraggedTask] = useState<GanttTask | null>(null);
  const [dragOperation, setDragOperation] = useState<DragOperation>(null);
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, startDate: new Date(), endDate: new Date() });

  // Prepare data for the chart
  const ganttTasks: GanttTask[] = useMemo(() => jobs
    .filter(job => job.job_start && job.job_end)
    .map(job => {
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
  const yMax = height - margin.top - margin.bottom;

  // Scales
  const xScale = useMemo(() => {
    const allDates = ganttTasks.flatMap(task => [task.start, task.end]);
    if (allDates.length === 0) return scaleTime({ domain: [new Date(), new Date()], range: [0, xMax] });
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add some padding to the time range
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 2);

    return scaleTime<number>({
      domain: [minDate, maxDate],
      range: [0, xMax],
      nice: true,
    });
  }, [ganttTasks, xMax]);

  const yScale = useMemo(() => {
    return scaleBand<string>({
      domain: ganttTasks.map(task => task.name),
      range: [0, yMax],
      padding: 0.4,
    });
  }, [ganttTasks, yMax]);

  const [transformMatrix, setTransformMatrix] = useState<TransformMatrix>({
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
    skewX: 0,
    skewY: 0
  });

  // Calculate the zoomed scale based on the transform matrix
  const zoomedXScale = useMemo(() => {
    const newScale = xScale.copy();
    return newScale.domain(
      newScale.range().map(r => 
        newScale.invert((r - transformMatrix.translateX) / transformMatrix.scaleX)
      )
    );
  }, [xScale, transformMatrix]);

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
    const deltaMs = deltaX * msPerPixel / transformMatrix.scaleX;
    
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
  }, [draggedTask, dragOperation, dragStartPosition, msPerPixel, transformMatrix.scaleX]);

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
  const getCursorStyle = (operation: DragOperation | null): string => {
    switch (operation) {
      case 'move': return 'grabbing';
      case 'resize-start': return 'w-resize';
      case 'resize-end': return 'e-resize';
      default: return 'grab';
    }
  };

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
    <div style={{ position: 'relative' }}>      
      <Zoom<SVGSVGElement>
        width={width}
        height={height}
        scaleXMin={0.5}
        scaleXMax={50}
        transformMatrix={transformMatrix}
        setTransformMatrix={setTransformMatrix}
        wheelDelta={event => {
          // Don't zoom if we're dragging
          if (dragOperation) {
            event.preventDefault();
            return false;
          }
          
          // Let the default zoom behavior handle standard zoom
          return event;
        }}
        // Disable zooming during drag operations
        enabled={!dragOperation}
      >
        {(zoom) => {
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
                  <rect x={0} y={0} width={xMax} height={yMax} />
                </clipPath>
              </defs>
              <rect x={0} y={0} width={width} height={height} fill="#fff" rx={14} />
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yScale} width={xMax} stroke="#e0e0e0" />
                <GridColumns scale={zoomedXScale} height={yMax} stroke="#e0e0e0" />
                <AxisLeft
                  scale={yScale}
                  stroke="#333"
                  tickStroke="#333"
                  tickLabelProps={() => ({ 
                    fill: '#333', 
                    fontSize: 11, 
                    textAnchor: 'end', 
                    dy: '0.33em' 
                  })}
                />
                <Group clipPath="url(#clip)">
                  {ganttTasks.map((task) => {
                    // If this task is currently being dragged, use the draggedTask state instead
                    // This is crucial for visual feedback during dragging
                    const renderTask = (draggedTask && draggedTask.id === task.id) ? draggedTask : task;
                    
                    const y = yScale(renderTask.name);
                    const x = zoomedXScale(renderTask.start);
                    const barWidth = zoomedXScale(renderTask.end) - x;
                    const barHeight = yScale.bandwidth();

                    if (y === undefined || barWidth <= 0) return null;
                    
                    // Determine if this is the task being dragged
                    const isDragging = draggedTask && draggedTask.id === task.id;
                    
                    return (
                      <Group key={`bar-group-${task.id}`}>
                        {/* Main task bar */}
                        <Bar
                          key={`bar-${task.id}`}
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          fill={task.color}
                          opacity={isDragging ? 0.7 : 1}
                          rx={4}
                          onMouseDown={(event) => onMouseDown(event, task, 'move')}
                          onMouseMove={(event) => {
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
                        
                        {/* Left resize handle */}
                        <Bar
                          key={`handle-start-${task.id}`}
                          x={x - DRAG_HANDLE_WIDTH / 2}
                          y={y}
                          width={DRAG_HANDLE_WIDTH}
                          height={barHeight}
                          fill="rgba(0,0,0,0.2)"
                          rx={2}
                          onMouseDown={(event) => onMouseDown(event, task, 'resize-start')}
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
                          onMouseDown={(event) => onMouseDown(event, task, 'resize-end')}
                          style={{ cursor: 'ew-resize', touchAction: 'none' }}
                        />
                      </Group>
                    );
                  })}
                </Group>
              </Group>
              <AxisBottom
                top={yMax + margin.top}
                scale={zoomedXScale}
                stroke="#333"
                tickStroke="#333"
                tickFormat={(v) => `${(v as Date).getDate()}`}
                tickLabelProps={() => ({ 
                  fill: '#333', 
                  fontSize: 11, 
                  textAnchor: 'middle' 
                })}
              />
              {/* Month level axis */}
              <AxisBottom
                top={yMax + margin.top + 30}
                scale={zoomedXScale}
                tickFormat={(v) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(v as Date)}
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
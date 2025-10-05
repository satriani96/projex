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
import type { ProvidedZoom } from '@visx/zoom/lib/types';
import { timeMinute, timeHour } from 'd3-time';

type TimeScale = ReturnType<typeof scaleTime>;

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
  company: string;
  job_number: string;
  customer_name: string;
  start: Date;
  end: Date;
  color: string;
}

type DragOperation = 'move' | 'resize-start' | 'resize-end' | null;

interface WindowWithLatestZoom extends Window {
  __latestZoom?: (scale: number, center: { x: number; y: number }) => void;
}

// Chart dimensions
const margin = { top: 20, right: 60, bottom: 100, left: 60 };
const DRAG_HANDLE_WIDTH = 8;
const rowHeight = 80; // Single fixed height for all bars

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: 'rgba(50,50,50,0.8)',
  color: 'white',
  padding: '0.5rem',
  borderRadius: '4px',
  fontSize: '12px',
};

interface ZoomContentProps {
  zoom: ProvidedZoom<SVGSVGElement> & { isDragging: boolean };
  ganttTasks: GanttTask[];
  xMax: number;
  width: number;
  height: number;
  panning: boolean;
  middlePanning: boolean;
  dragOperation: DragOperation;
  draggedTask: GanttTask | null;
  dragStartPosition: { x: number; startDate: Date; endDate: Date } | null;
  setDraggedTask: React.Dispatch<React.SetStateAction<GanttTask | null>>;
  handleDragEnd: () => void;
  getCursorStyle: (operation: DragOperation) => string;
  onMouseDown: (event: React.MouseEvent, task: GanttTask, operation: DragOperation) => void;
  showTooltip: (args: { tooltipData: GanttTask; tooltipLeft: number; tooltipTop: number }) => void;
  hideTooltip: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
  xScale: TimeScale;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  hugeDomain: [Date, Date];
}

const ZoomContent: React.FC<ZoomContentProps> = ({
  zoom,
  ganttTasks,
  xMax,
  width,
  height,
  panning,
  middlePanning,
  dragOperation,
  draggedTask,
  dragStartPosition,
  setDraggedTask,
  handleDragEnd,
  getCursorStyle,
  onMouseDown,
  showTooltip,
  hideTooltip,
  svgRef,
  xScale,
  jobs,
  onJobClick,
  hugeDomain,
}) => {
  const [, setInitialDomain] = useState<[Date, Date] | null>(null);
  const [initialZoomed, setInitialZoomed] = useState(false);
  const [visibleDomain, setVisibleDomain] = useState<[Date, Date] | null>(null);
  const [initialFitted, setInitialFitted] = useState(false);

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

  const handlePan = useCallback((deltaPx: number) => {
    if (!visibleDomain) return;
    const domainMs = visibleDomain[1].getTime() - visibleDomain[0].getTime();
    const msPerPx = domainMs / xMax;
    const deltaMs = -deltaPx * msPerPx;
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

  useEffect(() => {
    (window as WindowWithLatestZoom).__latestZoom = (scale: number, center: { x: number; y: number }) => {
      handleZoom(scale, center.x - margin.left);
    };
  }, [handleZoom]);

  useEffect(() => {
    zoom.dragMove = (
      event: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent
    ) => {
      if (!zoom.isDragging) return;
      const deltaPx = 'movementX' in event ? event.movementX : 0;
      handlePan(deltaPx);
    };
  }, [zoom, handlePan]);

  const zoomedXScale = useMemo(() => {
    const scale = scaleTime({
      domain: visibleDomain || hugeDomain,
      range: [0, xMax],
    });
    return scale;
  }, [visibleDomain, xMax, hugeDomain]);

  const msPerPixel = useMemo(() => {
    const domain = zoomedXScale.domain();
    const range = zoomedXScale.range();
    const visibleTimeRange = domain[1].getTime() - domain[0].getTime();
    const pixelRange = range[1] - range[0];
    return visibleTimeRange / pixelRange;
  }, [zoomedXScale]);

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
  }, [draggedTask, dragOperation, dragStartPosition, msPerPixel, setDraggedTask]);

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
  }, [dragOperation, draggedTask, handleDrag, handleDragEnd, getCursorStyle]);

  useEffect(() => {
    if (initialZoomed) return;
    if (!ganttTasks.length) return;
    const minDate = new Date(Math.min(...ganttTasks.map(t => t.start.getTime())));
    const maxDate = new Date(Math.max(...ganttTasks.map(t => t.end.getTime())));
    const paddedMin = new Date(minDate.getTime() - 3 * 24 * 60 * 60 * 1000);
    const paddedMax = new Date(maxDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    setInitialDomain([paddedMin, paddedMax]);
    const domainMs = paddedMax.getTime() - paddedMin.getTime();
    const scaleX = xMax / domainMs;
    const minDateX = xScale(paddedMin) as number;
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
        onWheel={zoom.handleWheel}
        onMouseDown={e => {
          if ((panning || middlePanning) && e.button !== 2) {
            if (e.button === 1) e.preventDefault();
            zoom.dragStart(e);
          }
        }}
        onMouseMove={e => {
          if (panning || middlePanning) zoom.dragMove(e);
        }}
        onMouseUp={() => {
          if (panning || middlePanning) zoom.dragEnd();
        }}
        onMouseLeave={() => {
          if (panning || middlePanning) zoom.dragEnd();
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
              const renderTask = (draggedTask && draggedTask.id === task.id) ? draggedTask : task;
              const y = 0;
              const x = zoomedXScale(renderTask.start);
              const barWidth = zoomedXScale(renderTask.end) - x;
              const barHeight = rowHeight;
              if (barWidth <= 0) return null;
              const isDragging = draggedTask && draggedTask.id === task.id;
              return (
                <Group key={`bar-group-${task.id}`}>
                  <Bar
                    key={`drag-handle-${task.id}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={10}
                    fill={task.color}
                    opacity={isDragging ? 0.7 : 1}
                    rx={4}
                    ry={0}
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

                  <Bar
                    key={`bar-${task.id}`}
                    x={x}
                    y={y + 10}
                    width={barWidth}
                    height={barHeight - 10}
                    fill={task.color}
                    opacity={isDragging ? 0.7 : 0.85}
                    rx={0}
                    ry={4}
                    onClick={() => {
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
                  {barWidth > 30 && (
                    <>
                      <text
                        x={x + 5}
                        y={y + 25}
                        fontSize={10}
                        fontWeight="bold"
                        fill="white"
                        style={{ pointerEvents: 'none' }}
                      >
                        #{task.job_number}
                      </text>
                      {barWidth > 60 && (
                        <text
                          x={x + 5}
                          y={y + 38}
                          fontSize={9}
                          fill="white"
                          style={{ pointerEvents: 'none' }}
                        >
                          {task.customer_name}
                        </text>
                      )}
                      {barWidth > 90 && task.company && (
                        <text
                          x={x + 5}
                          y={y + 50}
                          fontSize={8}
                          fill="white"
                          style={{ pointerEvents: 'none' }}
                        >
                          {task.company}
                        </text>
                      )}
                    </>
                  )}
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
        <AxisBottom
          top={rowHeight + margin.top}
          left={margin.left}
          scale={zoomedXScale}
          stroke="#333"
          tickStroke="#333"
          tickValues={useMemo(() => {
            const domain = zoomedXScale.domain();
            const ms = domain[1].getTime() - domain[0].getTime();
            if (ms < 2 * 60 * 60 * 1000) {
              const interval = timeMinute.every(5);
              return zoomedXScale.ticks(interval ?? timeMinute);
            } else if (ms < 24 * 60 * 60 * 1000) {
              const interval = timeHour.every(1);
              return zoomedXScale.ticks(interval ?? timeHour);
            } else {
              return zoomedXScale.ticks();
            }
          }, [zoomedXScale])}
          tickFormat={(value) => {
            const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
            const domain = zoomedXScale.domain();
            const ms = domain[1].getTime() - domain[0].getTime();
            if (ms < 2 * 60 * 60 * 1000) {
              return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
            } else {
              return date.getHours() + ':00';
            }
          }}
          tickLabelProps={() => ({
            fill: '#333',
            fontSize: 10,
            textAnchor: 'middle'
          })}
        />
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
            job_number: job.job_number || 'No #',
            customer_name: job.customer_name || 'Unnamed',
            company: job.company || '',
            name: `${job.job_number || 'No #'} - ${job.customer_name || 'Unnamed'}`,
            start: new Date(job.job_start as string),
            end: new Date(job.job_end as string),
            color: color
        };
    }), [jobs]);

  // Infinite timeline: set a huge domain
  const hugeDomain = useMemo<[Date, Date]>(() => {
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
      const win = window as WindowWithLatestZoom;
      if (typeof win.__latestZoom === 'function') {
        win.__latestZoom(scale, { x: svgX, y: svgY });
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
        {(zoom) => (
          <ZoomContent
            zoom={zoom}
            ganttTasks={ganttTasks}
            xMax={xMax}
            width={width}
            height={height}
            panning={panning}
            middlePanning={middlePanning}
            dragOperation={dragOperation}
            draggedTask={draggedTask}
            dragStartPosition={dragStartPosition}
            setDraggedTask={setDraggedTask}
            handleDragEnd={handleDragEnd}
            getCursorStyle={getCursorStyle}
            onMouseDown={onMouseDown}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            svgRef={svgRef}
            xScale={xScale}
            jobs={jobs}
            onJobClick={onJobClick}
            hugeDomain={hugeDomain}
          />
        )}
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

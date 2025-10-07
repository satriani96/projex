import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { ScaleTime } from 'd3-scale';
import type { ProvidedZoom, ZoomState } from '@visx/zoom/lib/types';

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

interface DragStartSnapshot {
  x: number;
  startDate: Date;
  endDate: Date;
}

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

interface GanttZoomContentProps {
  zoom: ProvidedZoom<SVGSVGElement> & ZoomState;
  width: number;
  height: number;
  rowHeight: number;
  xMax: number;
  margin: typeof margin;
  ganttTasks: GanttTask[];
  hugeDomain: [Date, Date];
  xScale: ScaleTime<number, number>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onMouseDown: (event: React.MouseEvent, task: GanttTask, operation: DragOperation) => void;
  dragOperation: DragOperation;
  draggedTask: GanttTask | null;
  dragStartPosition: DragStartSnapshot | null;
  setDraggedTask: React.Dispatch<React.SetStateAction<GanttTask | null>>;
  handleDragEnd: () => void;
  getCursorStyle: (operation: DragOperation) => string;
  panning: boolean;
  middlePanning: boolean;
  showTooltip: (args: { tooltipData: GanttTask; tooltipLeft?: number; tooltipTop?: number }) => void;
  hideTooltip: () => void;
}

const GanttZoomContent: React.FC<GanttZoomContentProps> = ({
  zoom,
  width,
  height,
  rowHeight,
  xMax,
  margin: chartMargin,
  ganttTasks,
  hugeDomain,
  xScale,
  svgRef,
  jobs,
  onJobClick,
  onMouseDown,
  dragOperation,
  draggedTask,
  dragStartPosition,
  setDraggedTask,
  handleDragEnd,
  getCursorStyle,
  panning,
  middlePanning,
  showTooltip,
  hideTooltip,
}) => {
  const [visibleDomain, setVisibleDomain] = useState<[Date, Date] | null>(null);
  const [initialDomainApplied, setInitialDomainApplied] = useState(false);
  const [initialZoomApplied, setInitialZoomApplied] = useState(false);
  const marginLeft = chartMargin.left;

  const zoomedXScale = useMemo(() => scaleTime<number>({
    domain: visibleDomain ?? hugeDomain,
    range: [0, xMax],
  }), [visibleDomain, hugeDomain, xMax]);

  const msPerPixel = useMemo(() => {
    const domain = zoomedXScale.domain();
    const range = zoomedXScale.range();
    const visibleTimeRange = domain[1].getTime() - domain[0].getTime();
    const pixelRange = range[1] - range[0];
    return pixelRange === 0 ? 0 : visibleTimeRange / pixelRange;
  }, [zoomedXScale]);

  const handlePan = useCallback((deltaPx: number) => {
    if (!visibleDomain || deltaPx === 0) {
      return;
    }

    const [start, end] = visibleDomain;
    const domainMs = end.getTime() - start.getTime();
    const deltaMs = -(deltaPx * domainMs) / xMax;
    setVisibleDomain([
      new Date(start.getTime() + deltaMs),
      new Date(end.getTime() + deltaMs),
    ]);
  }, [visibleDomain, xMax]);

  const handleZoomChange = useCallback((scaleFactor: number, centerPx: number) => {
    if (!visibleDomain || scaleFactor === 0) {
      return;
    }

    const [start, end] = visibleDomain;
    const domainMs = end.getTime() - start.getTime();
    const centerRatio = centerPx / xMax;
    const centerTime = start.getTime() + domainMs * centerRatio;
    const newDomainMs = domainMs / scaleFactor;
    const newStart = centerTime - newDomainMs * centerRatio;
    const newEnd = centerTime + newDomainMs * (1 - centerRatio);
    setVisibleDomain([
      new Date(newStart),
      new Date(newEnd),
    ]);
  }, [visibleDomain, xMax]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scaleFactor = event.deltaY < 0 ? 1.1 : 0.9;
      const rect = svg.getBoundingClientRect();
      const svgX = event.clientX - rect.left;
      handleZoomChange(scaleFactor, svgX - marginLeft);
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoomChange, svgRef, marginLeft]);

  useEffect(() => {
    const originalDragMove = zoom.dragMove;
    zoom.dragMove = (event: MouseEvent | React.MouseEvent) => {
      if (!zoom.isDragging) {
        return;
      }
      const movementX = 'movementX' in event ? event.movementX : 0;
      handlePan(movementX);
    };

    return () => {
      zoom.dragMove = originalDragMove;
    };
  }, [zoom, handlePan]);

  const handleDrag = useCallback((clientX: number) => {
    if (!dragOperation || !dragStartPosition || msPerPixel === 0) {
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
      if (newStart > newEnd) {
        newStart = newEnd;
      }
    } else if (dragOperation === 'resize-end') {
      newEnd = new Date(newEnd.getTime() + deltaMs);
      if (newEnd < newStart) {
        newEnd = newStart;
      }
    }

    setDraggedTask(current => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        start: newStart,
        end: newEnd,
      };
    });
  }, [dragOperation, dragStartPosition, msPerPixel, setDraggedTask]);

  useEffect(() => {
    if (!dragOperation || !dragStartPosition) {
      return;
    }

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
  }, [dragOperation, dragStartPosition, getCursorStyle, handleDrag, handleDragEnd]);

  useEffect(() => {
    if (dragOperation) {
      hideTooltip();
    }
  }, [dragOperation, hideTooltip]);

  useEffect(() => {
    if (!ganttTasks.length) {
      return;
    }

    const minTime = Math.min(...ganttTasks.map(task => task.start.getTime()));
    const maxTime = Math.max(...ganttTasks.map(task => task.end.getTime()));
    const paddedMin = new Date(minTime - 3 * 24 * 60 * 60 * 1000);
    const paddedMax = new Date(maxTime + 3 * 24 * 60 * 60 * 1000);

    if (!initialDomainApplied) {
      setVisibleDomain([paddedMin, paddedMax]);
      setInitialDomainApplied(true);
    }

    if (!initialZoomApplied) {
      const domainMs = paddedMax.getTime() - paddedMin.getTime();
      if (domainMs > 0) {
        const scaleXFactor = xMax / domainMs;
        const minDateX = xScale(paddedMin);
        zoom.setTransformMatrix({
          scaleX: scaleXFactor,
          scaleY: 1,
          translateX: marginLeft - minDateX * scaleXFactor,
          translateY: 0,
          skewX: 0,
          skewY: 0,
        });
        setInitialZoomApplied(true);
      }
    }
  }, [ganttTasks, initialDomainApplied, initialZoomApplied, xMax, xScale, zoom, marginLeft]);

  const timeAxisTicks = useMemo(() => {
    const domain = zoomedXScale.domain();
    const ms = domain[1].getTime() - domain[0].getTime();
    if (ms < 2 * 60 * 60 * 1000) {
      const interval = timeMinute.every(5);
      return interval ? zoomedXScale.ticks(interval) : zoomedXScale.ticks();
    }
    if (ms < 24 * 60 * 60 * 1000) {
      const interval = timeHour.every(1);
      return interval ? zoomedXScale.ticks(interval) : zoomedXScale.ticks();
    }
    return zoomedXScale.ticks();
  }, [zoomedXScale]);

  const svgCursor = dragOperation
    ? getCursorStyle(dragOperation)
    : zoom.isDragging
      ? 'grabbing'
      : (panning || middlePanning)
        ? 'grab'
        : 'default';

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          cursor: svgCursor,
          touchAction: 'none',
        }}
        {...zoom.containerProps}
        onMouseDown={(event) => {
          if ((panning || middlePanning) && event.button !== 2) {
            if (event.button === 1) {
              event.preventDefault();
            }
            zoom.dragStart(event);
          }
        }}
        onMouseMove={(event) => {
          if (panning || middlePanning) {
            zoom.dragMove(event);
          }
        }}
        onMouseUp={(event) => {
          if (panning || middlePanning) {
            zoom.dragEnd(event);
          }
        }}
        onMouseLeave={(event) => {
          if (panning || middlePanning) {
            zoom.dragEnd(event);
          }
        }}
      >
        <defs>
          <clipPath id="clip">
            <rect x={0} y={0} width={xMax} height={rowHeight} />
          </clipPath>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill="#fff" rx={14} />
        <Group left={chartMargin.left} top={chartMargin.top}>
          <GridColumns scale={zoomedXScale} height={rowHeight} stroke="#e0e0e0" />
          <Group clipPath="url(#clip)">
            {ganttTasks.map(task => {
              const renderTask = draggedTask && draggedTask.id === task.id ? draggedTask : task;
              const y = 0;
              const x = zoomedXScale(renderTask.start);
              const barWidth = zoomedXScale(renderTask.end) - x;
              const barHeight = rowHeight;

              if (barWidth <= 0) {
                return null;
              }

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
                        if (!point) {
                          return;
                        }
                        showTooltip({
                          tooltipData: task,
                          tooltipLeft: point.x,
                          tooltipTop: point.y,
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      if (!dragOperation) {
                        hideTooltip();
                      }
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
                      if (jobObj) {
                        onJobClick(jobObj);
                      }
                    }}
                    onMouseMove={(event: React.MouseEvent) => {
                      if (!dragOperation) {
                        const point = localPoint(event);
                        if (!point) {
                          return;
                        }
                        showTooltip({
                          tooltipData: task,
                          tooltipLeft: point.x,
                          tooltipTop: point.y,
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      if (!dragOperation) {
                        hideTooltip();
                      }
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
          top={rowHeight + chartMargin.top}
          left={chartMargin.left}
          scale={zoomedXScale}
          stroke="#333"
          tickStroke="#333"
          tickValues={timeAxisTicks}
          tickFormat={(value) => {
            const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
            const domain = zoomedXScale.domain();
            const ms = domain[1].getTime() - domain[0].getTime();
            if (ms < 2 * 60 * 60 * 1000) {
              return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            }
            return `${date.getHours()}:00`;
          }}
          tickLabelProps={() => ({
            fill: '#333',
            fontSize: 10,
            textAnchor: 'middle',
          })}
        />
        <AxisBottom
          top={rowHeight + chartMargin.top + 30}
          left={chartMargin.left}
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
            textAnchor: 'middle',
          })}
        />
        <AxisBottom
          top={rowHeight + chartMargin.top + 60}
          left={chartMargin.left}
          scale={zoomedXScale}
          stroke="#333"
          tickStroke="#333"
          tickFormat={(value) => {
            const date = value instanceof Date ? value : new Date(Number(value.valueOf()));
            return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
          }}
          tickLabelProps={() => ({
            fill: '#333',
            fontSize: 12,
            textAnchor: 'middle',
            fontWeight: 'bold',
          })}
        />
      </svg>
    </>
  );
};

const GanttChart: React.FC<GanttChartProps> = ({
  jobs,
  width: initialWidth = typeof window !== 'undefined' ? window.innerWidth - 32 : 800,
  height = 300,
  onJobTimeUpdate = (jobId, start, end) => {
    console.log('Job time update:', { jobId, start: start.toISOString(), end: end.toISOString() });
  },
  onJobClick = (job) => {
    console.log('Job clicked:', job.id);
  },
}) => {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip<GanttTask>();
  const { TooltipInPortal } = useTooltipInPortal({ scroll: true });

  const [draggedTask, setDraggedTask] = useState<GanttTask | null>(null);
  const [dragOperation, setDragOperation] = useState<DragOperation>(null);
  const [dragStartPosition, setDragStartPosition] = useState<DragStartSnapshot | null>(null);
  const [width, setWidth] = useState(initialWidth);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [panning, setPanning] = useState(false);
  const [middlePanning, setMiddlePanning] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setPanning(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 1) {
        setMiddlePanning(true);
        event.preventDefault();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 1) {
        setMiddlePanning(false);
      }
    };

    const handleMouseLeave = () => {
      setMiddlePanning(false);
    };

    svg.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    svg.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      svg.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      svg.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [svgRef]);

  const ganttTasks: GanttTask[] = useMemo(() => jobs
    .filter((job): job is Job & { job_start: string; job_end: string } => Boolean(job.job_start && job.job_end))
    .map((job) => {
      let hash = 0;
      for (let i = 0; i < job.id.length; i += 1) {
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
        color,
      };
    }), [jobs]);

  const hugeDomain = useMemo<[Date, Date]>(() => {
    const now = new Date();
    const min = new Date(now.getTime());
    min.setFullYear(min.getFullYear() - 50);
    const max = new Date(now.getTime());
    max.setFullYear(max.getFullYear() + 50);
    return [min, max];
  }, []);

  const xMax = width - margin.left - margin.right;

  const xScale = useMemo(() => scaleTime<number>({
    domain: hugeDomain,
    range: [0, xMax],
  }), [xMax, hugeDomain]);

  const rowHeight = 80;

  const handleDragStart = useCallback((task: GanttTask, operation: DragOperation, clientX: number) => {
    setDraggedTask({
      ...task,
      start: new Date(task.start),
      end: new Date(task.end),
    });
    setDragOperation(operation);
    setDragStartPosition({
      x: clientX,
      startDate: new Date(task.start),
      endDate: new Date(task.end),
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedTask && dragOperation) {
      onJobTimeUpdate(draggedTask.job_id, draggedTask.start, draggedTask.end);
    }
    setDraggedTask(null);
    setDragOperation(null);
    setDragStartPosition(null);
  }, [draggedTask, dragOperation, onJobTimeUpdate]);

  const getCursorStyle = useCallback((operation: DragOperation): string => {
    switch (operation) {
      case 'move':
        return 'grabbing';
      case 'resize-start':
      case 'resize-end':
        return 'ew-resize';
      default:
        return 'default';
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setWidth(window.innerWidth - 32);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const onMouseDown = useCallback((event: React.MouseEvent, task: GanttTask, operation: DragOperation) => {
    event.stopPropagation();
    event.preventDefault();
    handleDragStart(task, operation, event.clientX);
  }, [handleDragStart]);

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <Zoom<SVGSVGElement>
        width={width}
        height={height}
        scaleXMin={0.01}
        scaleXMax={200}
      >
        {(zoom) => (
          <GanttZoomContent
            zoom={zoom}
            width={width}
            height={height}
            rowHeight={rowHeight}
            xMax={xMax}
            margin={margin}
            ganttTasks={ganttTasks}
            hugeDomain={hugeDomain}
            xScale={xScale}
            svgRef={svgRef}
            jobs={jobs}
            onJobClick={onJobClick}
            onMouseDown={onMouseDown}
            dragOperation={dragOperation}
            draggedTask={draggedTask}
            dragStartPosition={dragStartPosition}
            setDraggedTask={setDraggedTask}
            handleDragEnd={handleDragEnd}
            getCursorStyle={getCursorStyle}
            panning={panning}
            middlePanning={middlePanning}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
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

// Type definitions for d3-time (minimal, for use in GanttChart)
// This file can be extended as needed for more d3-time features.
declare module 'd3-time' {
  interface TimeInterval {
    every(step: number): TimeInterval | null;
  }

  export const timeMinute: TimeInterval;
  export const timeHour: TimeInterval;
}

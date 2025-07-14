// Type definitions for d3-time (minimal, for use in GanttChart)
// This file can be extended as needed for more d3-time features.
declare module 'd3-time' {
  export const timeMinute: {
    every(step: number): any;
  };
  export const timeHour: {
    every(step: number): any;
  };
}

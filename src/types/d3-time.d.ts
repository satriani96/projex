// Type definitions for d3-time (minimal, for use in GanttChart)
// This file can be extended as needed for more d3-time features.
declare module 'd3-time' {
  export interface CountableTimeInterval {
    (date: Date): Date;
    floor(date: Date): Date;
    round(date: Date): Date;
    ceil(date: Date): Date;
    offset(date: Date, step?: number): Date;
    range(start: Date, stop: Date, step?: number): Date[];
  }

  export const timeMinute: CountableTimeInterval & {
    every(step: number): CountableTimeInterval | null;
  };

  export const timeHour: CountableTimeInterval & {
    every(step: number): CountableTimeInterval | null;
  };
}

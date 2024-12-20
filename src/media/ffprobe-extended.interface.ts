// src/media/ffprobe-custom.interface.ts

import { FFProbeStream } from 'ffprobe';

export interface FFProbeFormat {
  duration: string; // Duration in seconds as a string
  size?: string;
  bit_rate?: string;
  // Add other relevant properties as needed
}

export interface FFProbeCustomResult {
  format: FFProbeFormat;
  streams: FFProbeStream[];
}

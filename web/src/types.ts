export type Vector3Tuple = [number, number, number];
export type ElementPair = [number, number];

export interface ExampleMetrics {
  maxDisplacementM: number;
  maxAbsStressPa: number;
  maxUtilization: number;
  minimumSafetyFactor: number;
  massKg: number;
  equilibriumResidual: number;
}

export interface StressExample {
  id: string;
  title: string;
  category: string;
  description: string;
  parameters: Record<string, number | string>;
  deltaTemperatureC: number;
  nodes: Vector3Tuple[];
  elements: ElementPair[];
  displacementM: Vector3Tuple[];
  elementStressPa: number[];
  elementUtilization: number[];
  loadsN: Vector3Tuple[];
  fixedNodes: number[];
  metrics: ExampleMetrics;
  qualityMessage: string;
}

export interface DerivedSimulation extends StressExample {
  responseScale: number;
  displacementM: Vector3Tuple[];
  elementStressPa: number[];
  elementUtilization: number[];
  loadsN: Vector3Tuple[];
  metrics: ExampleMetrics;
}

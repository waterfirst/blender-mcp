import type {
  DerivedSimulation,
  ExampleMetrics,
  StressExample,
  Vector3Tuple,
} from "../types";

const scaleVector = (value: Vector3Tuple, scale: number): Vector3Tuple => [
  value[0] * scale,
  value[1] * scale,
  value[2] * scale,
];

export function deriveSimulation(
  example: StressExample,
  loadScale: number,
  areaScale: number,
): DerivedSimulation {
  if (loadScale < 0 || areaScale <= 0) {
    throw new RangeError("loadScale must be non-negative and areaScale must be positive");
  }

  // Uniform area scaling cancels from a pure thermal-strain problem because
  // stiffness and equivalent thermal load grow together. Mechanical cases
  // follow the linear truss relation response ∝ load / area.
  const thermalOnly = example.deltaTemperatureC !== 0;
  const responseScale = loadScale * (thermalOnly ? 1 : 1 / areaScale);
  const safeScale = Math.max(responseScale, Number.EPSILON);
  const metrics: ExampleMetrics = {
    maxDisplacementM: example.metrics.maxDisplacementM * responseScale,
    maxAbsStressPa: example.metrics.maxAbsStressPa * responseScale,
    maxUtilization: example.metrics.maxUtilization * responseScale,
    minimumSafetyFactor: example.metrics.minimumSafetyFactor / safeScale,
    massKg: example.metrics.massKg * areaScale,
    equilibriumResidual: example.metrics.equilibriumResidual,
  };

  return {
    ...example,
    deltaTemperatureC: example.deltaTemperatureC * loadScale,
    responseScale,
    displacementM: example.displacementM.map((value) => scaleVector(value, responseScale)),
    elementStressPa: example.elementStressPa.map((value) => value * responseScale),
    elementUtilization: example.elementUtilization.map((value) => value * responseScale),
    loadsN: example.loadsN.map((value) => scaleVector(value, loadScale)),
    metrics,
  };
}

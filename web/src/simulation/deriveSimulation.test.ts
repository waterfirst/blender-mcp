import { describe, expect, it } from "vitest";
import { deriveSimulation } from "./deriveSimulation";
import examplesJson from "../data/examples.json";
import type { StressExample } from "../types";

const base: StressExample = {
  id: "test",
  title: "Test",
  category: "test",
  description: "fixture",
  parameters: {},
  deltaTemperatureC: 0,
  nodes: [[0, 0, 0], [1, 0, 0]],
  elements: [[0, 1]],
  displacementM: [[0, 0, 0], [0.01, 0, 0]],
  elementStressPa: [100],
  elementUtilization: [0.5],
  loadsN: [[0, 0, 0], [10, 0, 0]],
  fixedNodes: [0],
  metrics: {
    maxDisplacementM: 0.01,
    maxAbsStressPa: 100,
    maxUtilization: 0.5,
    minimumSafetyFactor: 2,
    massKg: 8,
    equilibriumResidual: 1e-12,
  },
  qualityMessage: "screening only",
};

describe("deriveSimulation", () => {
  it("ships all FEM examples with matching render arrays", () => {
    const examples = examplesJson as StressExample[];
    expect(examples).toHaveLength(14);
    for (const example of examples) {
      expect(example.nodes.length).toBeGreaterThan(1);
      expect(example.elements).toHaveLength(example.elementStressPa.length);
      expect(example.elements).toHaveLength(example.elementUtilization.length);
      expect(example.displacementM).toHaveLength(example.nodes.length);
    }
  });

  it("applies mechanical load/area linear scaling", () => {
    const result = deriveSimulation(base, 2, 4);
    expect(result.responseScale).toBe(0.5);
    expect(result.metrics.maxDisplacementM).toBeCloseTo(0.005);
    expect(result.metrics.maxAbsStressPa).toBeCloseTo(50);
    expect(result.metrics.minimumSafetyFactor).toBeCloseTo(4);
    expect(result.metrics.massKg).toBeCloseTo(32);
  });

  it("does not divide thermal response by uniform area scale", () => {
    const thermal = { ...base, deltaTemperatureC: -125 };
    const result = deriveSimulation(thermal, 1.5, 2);
    expect(result.responseScale).toBe(1.5);
    expect(result.deltaTemperatureC).toBeCloseTo(-187.5);
  });

  it("rejects invalid scale values", () => {
    expect(() => deriveSimulation(base, -1, 1)).toThrow(RangeError);
    expect(() => deriveSimulation(base, 1, 0)).toThrow(RangeError);
  });
});

"""Create the compact, browser-safe example dataset from the Python FEM engine."""

from __future__ import annotations

import json
from pathlib import Path

from blender_mcp.stress_engine import list_examples, run_example


def compact_result(example_id: str) -> dict:
    result = run_example(example_id)
    model = result["model"]
    metrics = result["metrics"]
    return {
        "id": example_id,
        "title": model["title"],
        "category": model["category"],
        "description": model["description"],
        "parameters": model["parameters"],
        "deltaTemperatureC": model["delta_temperature_c"],
        "nodes": result["nodes"],
        "elements": result["elements"],
        "displacementM": result["displacement_m"],
        "elementStressPa": result["element_stress_pa"],
        "elementUtilization": result["element_utilization"],
        "loadsN": result["loads_n"],
        "fixedNodes": result["fixed_nodes"],
        "metrics": {
            "maxDisplacementM": metrics["max_displacement_m"],
            "maxAbsStressPa": metrics["max_abs_stress_pa"],
            "maxUtilization": metrics["max_utilization"],
            "minimumSafetyFactor": metrics["minimum_safety_factor"],
            "massKg": metrics["mass_kg"],
            "equilibriumResidual": metrics["equilibrium_residual"],
        },
        "qualityMessage": result["quality"]["message"],
    }


def main() -> None:
    output = Path(__file__).resolve().parents[1] / "src" / "data" / "examples.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = [compact_result(item["id"]) for item in list_examples()]
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(payload)} examples to {output}")


if __name__ == "__main__":
    main()

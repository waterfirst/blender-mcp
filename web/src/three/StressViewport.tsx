import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DerivedSimulation, Vector3Tuple } from "../types";

interface StressViewportProps {
  simulation: DerivedSimulation;
  deformationScale: number;
  animate: boolean;
  showReference: boolean;
  resetViewToken: number;
}

interface DynamicModel {
  geometry: THREE.BufferGeometry;
  basePositions: Float32Array;
  displacement: Float32Array;
}

const toSceneTuple = ([x, y, z]: Vector3Tuple): Vector3Tuple => [x, z, -y];

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

function stressColor(stress: number, utilization: number, maxUtilization: number): THREE.Color {
  const intensity = THREE.MathUtils.clamp(Math.abs(utilization) / Math.max(maxUtilization, 1e-9), 0, 1);
  const neutral = new THREE.Color("#dce7f6");
  const extreme = new THREE.Color(stress < 0 ? "#2563eb" : "#f43f5e");
  return neutral.lerp(extreme, 0.18 + intensity * 0.82);
}

export function StressViewport({
  simulation,
  deformationScale,
  animate,
  showReference,
  resetViewToken,
}: StressViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const modelRef = useRef<DynamicModel | null>(null);
  const lastFitKeyRef = useRef("");
  const animateRef = useRef(animate);
  const deformationScaleRef = useRef(deformationScale);

  useEffect(() => {
    animateRef.current = animate;
  }, [animate]);

  useEffect(() => {
    deformationScaleRef.current = deformationScale;
  }, [deformationScale]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#07101e");
    scene.fog = new THREE.Fog("#07101e", 16, 70);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 1000);
    camera.position.set(6, 4, 7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight("#cde7ff", "#1b2740", 2.2));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.5);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    resizeObserver.observe(host);

    let frame = 0;
    const render = (time: number) => {
      const dynamic = modelRef.current;
      if (dynamic) {
        const pulse = animateRef.current ? 0.58 + 0.42 * Math.sin(time / 720) : 1;
        const scale = deformationScaleRef.current * pulse;
        const position = dynamic.geometry.getAttribute("position") as THREE.BufferAttribute;
        const values = position.array as Float32Array;
        for (let index = 0; index < values.length; index += 1) {
          values[index] = dynamic.basePositions[index] + dynamic.displacement[index] * scale;
        }
        position.needsUpdate = true;
        dynamic.geometry.computeBoundingSphere();
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      if (modelGroupRef.current) disposeObject(modelGroupRef.current);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      disposeObject(modelGroupRef.current);
    }

    const group = new THREE.Group();
    group.name = `StressWeb::${simulation.id}`;
    modelGroupRef.current = group;
    scene.add(group);

    const sceneNodes = simulation.nodes.map((node) => new THREE.Vector3(...toSceneTuple(node)));
    const bounds = new THREE.Box3().setFromPoints(sceneNodes);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.01);

    const basePositions = new Float32Array(simulation.elements.length * 6);
    const displacements = new Float32Array(simulation.elements.length * 6);
    const colors = new Float32Array(simulation.elements.length * 6);
    const maxUtilization = Math.max(...simulation.elementUtilization.map(Math.abs), 1e-9);

    simulation.elements.forEach(([nodeA, nodeB], elementIndex) => {
      const offset = elementIndex * 6;
      const starts = [nodeA, nodeB];
      const color = stressColor(
        simulation.elementStressPa[elementIndex],
        simulation.elementUtilization[elementIndex],
        maxUtilization,
      );
      starts.forEach((nodeIndex, localIndex) => {
        const node = sceneNodes[nodeIndex];
        const delta = toSceneTuple(simulation.displacementM[nodeIndex]);
        const target = offset + localIndex * 3;
        basePositions.set([node.x, node.y, node.z], target);
        displacements.set(delta, target);
        colors.set([color.r, color.g, color.b], target);
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(basePositions.slice(), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false });
    group.add(new THREE.LineSegments(geometry, material));
    modelRef.current = { geometry, basePositions, displacement: displacements };

    if (showReference) {
      const referenceGeometry = new THREE.BufferGeometry();
      referenceGeometry.setAttribute("position", new THREE.BufferAttribute(basePositions.slice(), 3));
      group.add(
        new THREE.LineSegments(
          referenceGeometry,
          new THREE.LineDashedMaterial({ color: "#64748b", opacity: 0.38, transparent: true, dashSize: 0.04, gapSize: 0.025 }),
        ),
      );
    }

    const nodeGeometry = new THREE.BufferGeometry().setFromPoints(sceneNodes);
    group.add(
      new THREE.Points(
        nodeGeometry,
        new THREE.PointsMaterial({ color: "#dbeafe", size: maxDimension / 90, sizeAttenuation: true }),
      ),
    );

    const supportGeometry = new THREE.BoxGeometry(maxDimension / 35, maxDimension / 35, maxDimension / 35);
    const supportMaterial = new THREE.MeshStandardMaterial({ color: "#fbbf24", emissive: "#694400", metalness: 0.25 });
    simulation.fixedNodes.forEach((nodeIndex) => {
      const marker = new THREE.Mesh(supportGeometry, supportMaterial);
      marker.position.copy(sceneNodes[nodeIndex]);
      group.add(marker);
    });

    simulation.loadsN.forEach((load, nodeIndex) => {
      const direction = new THREE.Vector3(...toSceneTuple(load));
      if (direction.lengthSq() < 1e-18) return;
      direction.normalize();
      const length = maxDimension * 0.13;
      const origin = sceneNodes[nodeIndex].clone().addScaledVector(direction, -length);
      group.add(new THREE.ArrowHelper(direction, origin, length, "#22d3ee", length * 0.28, length * 0.15));
    });

    const grid = new THREE.GridHelper(maxDimension * 1.8, 12, "#304865", "#17263a");
    grid.position.set(center.x, bounds.min.y - maxDimension * 0.12, center.z);
    group.add(grid);

    const fitKey = `${simulation.id}:${resetViewToken}`;
    if (lastFitKeyRef.current !== fitKey) {
      const distance = maxDimension * 2.15;
      camera.near = Math.max(maxDimension / 1000, 0.0001);
      camera.far = Math.max(distance * 40, 100);
      camera.position.copy(center).add(new THREE.Vector3(distance * 0.9, distance * 0.62, distance));
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      lastFitKeyRef.current = fitKey;
    }
  }, [simulation, showReference, resetViewToken]);

  return <div className="viewport-host" ref={hostRef} aria-label={`${simulation.title} 3D 응력 시각화`} />;
}

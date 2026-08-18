import { useEffect, useMemo, useState } from "react";
import examplesJson from "./data/examples.json";
import { deriveSimulation } from "./simulation/deriveSimulation";
import { StressViewport } from "./three/StressViewport";
import type { StressExample } from "./types";

const examples = examplesJson as StressExample[];

const categoryNames: Record<string, string> = {
  structures: "구조물",
  civil: "토목",
  heavy_equipment: "중장비",
  robotics: "로봇",
  consumer_electronics: "소비자 전자",
  electronics: "전자",
  renewable_energy: "재생에너지",
  display: "디스플레이",
  semiconductor: "반도체",
  energy_infrastructure: "에너지 인프라",
  process_equipment: "공정 장비",
  mobility: "모빌리티",
  energy_storage: "에너지 저장",
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function modelExtent(example: StressExample): number {
  const axes = [0, 1, 2].map((axis) => {
    const values = example.nodes.map((node) => node[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  return Math.max(...axes, 0.001);
}

function autoDeformation(example: StressExample): number {
  return clamp((modelExtent(example) * 0.1) / Math.max(example.metrics.maxDisplacementM, 1e-12), 1, 250);
}

function formatStress(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1e9) return `${(value / 1e9).toFixed(2)} GPa`;
  return `${(value / 1e6).toFixed(1)} MPa`;
}

function formatDisplacement(value: number): string {
  if (Math.abs(value) < 1e-3) return `${(value * 1e6).toFixed(1)} µm`;
  return `${(value * 1e3).toFixed(2)} mm`;
}

export function App() {
  const [exampleId, setExampleId] = useState(examples[0].id);
  const [loadScale, setLoadScale] = useState(1);
  const [areaScale, setAreaScale] = useState(1);
  const [deformationScale, setDeformationScale] = useState(() => autoDeformation(examples[0]));
  const [animate, setAnimate] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [showReference, setShowReference] = useState(true);
  const [resetViewToken, setResetViewToken] = useState(0);

  const example = useMemo(
    () => examples.find((item) => item.id === exampleId) ?? examples[0],
    [exampleId],
  );
  const simulation = useMemo(
    () => deriveSimulation(example, loadScale, areaScale),
    [example, loadScale, areaScale],
  );

  useEffect(() => {
    setDeformationScale(autoDeformation(example));
    setLoadScale(1);
    setAreaScale(1);
  }, [example]);

  const resetControls = () => {
    setLoadScale(1);
    setAreaScale(1);
    setDeformationScale(autoDeformation(example));
    setAnimate(true);
    setShowReference(true);
    setResetViewToken((value) => value + 1);
  };

  const status = simulation.metrics.minimumSafetyFactor >= 1
    ? { label: "탄성 한계 내", className: "safe" }
    : { label: "항복 위험", className: "danger" };
  const thermal = example.deltaTemperatureC !== 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">BLENDER MCP · WEB STRESS LAB</p>
          <h1>3D 응력 시뮬레이터</h1>
        </div>
        <div className="topbar-actions">
          <span className="live-badge"><i /> GitHub Pages</span>
          <a href="https://github.com/waterfirst/blender-mcp" target="_blank" rel="noreferrer">소스 보기 ↗</a>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel panel">
          <div className="panel-heading">
            <span>01</span>
            <div><strong>실험 조건</strong><small>FEM 예제와 배율을 선택하세요</small></div>
          </div>

          <label className="field-label" htmlFor="example">예제 모델</label>
          <select id="example" value={exampleId} onChange={(event) => setExampleId(event.target.value)}>
            {examples.map((item) => (
              <option key={item.id} value={item.id}>
                {categoryNames[item.category] ?? item.category} · {item.title}
              </option>
            ))}
          </select>

          <div className="model-summary">
            <span>{categoryNames[example.category] ?? example.category}</span>
            <h2>{example.title}</h2>
            <p>{example.description}</p>
            <div className="model-counts">
              <b>{example.nodes.length}<small>노드</small></b>
              <b>{example.elements.length}<small>요소</small></b>
              <b>{example.fixedNodes.length}<small>고정점</small></b>
            </div>
          </div>

          <RangeControl
            id="load"
            label={thermal ? "온도 변화 배율" : "하중 배율"}
            value={loadScale}
            min={0.25}
            max={2}
            step={0.05}
            display={`${Math.round(loadScale * 100)}%`}
            onChange={setLoadScale}
          />
          <RangeControl
            id="area"
            label="부재 단면적 배율"
            value={areaScale}
            min={0.5}
            max={2}
            step={0.05}
            display={`${Math.round(areaScale * 100)}%`}
            onChange={setAreaScale}
          />
          {thermal && <p className="inline-note">열변형 응답은 전체 단면적을 같은 비율로 바꿔도 유지되며 질량만 변합니다.</p>}
          <RangeControl
            id="deformation"
            label="변형 표시 배율"
            value={deformationScale}
            min={1}
            max={250}
            step={1}
            display={`${Math.round(deformationScale)}×`}
            onChange={setDeformationScale}
          />

          <div className="toggle-row">
            <label><input type="checkbox" checked={animate} onChange={(event) => setAnimate(event.target.checked)} /> 변형 애니메이션</label>
            <label><input type="checkbox" checked={showReference} onChange={(event) => setShowReference(event.target.checked)} /> 원형 표시</label>
          </div>

          <div className="button-row">
            <button type="button" className="primary" onClick={() => setAnimate((value) => !value)}>{animate ? "일시정지" : "재생"}</button>
            <button type="button" onClick={resetControls}>초기화</button>
          </div>
        </aside>

        <section className="viewport-panel panel">
          <div className="viewport-toolbar">
            <div>
              <span className={`status-dot ${status.className}`} />
              <strong>{status.label}</strong>
              <small>마우스 드래그: 회전 · 휠: 확대</small>
            </div>
            <button type="button" onClick={() => setResetViewToken((value) => value + 1)}>시점 복원</button>
          </div>
          <StressViewport
            simulation={simulation}
            deformationScale={deformationScale}
            animate={animate}
            showReference={showReference}
            resetViewToken={resetViewToken}
          />
          <div className="legend" aria-label="응력 색상 범례">
            <span>압축</span><div className="legend-bar" /><span>인장</span>
          </div>
          <div className="viewport-tags">
            <span><i className="support-key" /> 고정점</span>
            <span><i className="load-key" /> 하중</span>
            <span><i className="reference-key" /> 원형</span>
          </div>
        </section>

        <aside className="results-panel panel">
          <div className="panel-heading">
            <span>02</span>
            <div><strong>해석 결과</strong><small>선형 3D 트러스 FEM</small></div>
          </div>

          <MetricCard label="최대 변위" value={formatDisplacement(simulation.metrics.maxDisplacementM)} detail={`표시 ${Math.round(deformationScale)}×`} />
          <MetricCard label="최대 절대응력" value={formatStress(simulation.metrics.maxAbsStressPa)} detail={`이용률 ${(simulation.metrics.maxUtilization * 100).toFixed(1)}%`} accent={simulation.metrics.maxUtilization >= 1} />
          <MetricCard label="최소 안전율" value={simulation.metrics.minimumSafetyFactor.toFixed(2)} detail={status.label} accent={simulation.metrics.minimumSafetyFactor < 1} />
          <MetricCard label="모델 질량" value={`${simulation.metrics.massKg.toFixed(2)} kg`} detail={`단면적 ${Math.round(areaScale * 100)}%`} />

          {thermal && (
            <div className="thermal-card">
              <span>등가 온도 변화</span>
              <strong>{simulation.deltaTemperatureC.toFixed(1)} °C</strong>
            </div>
          )}

          <div className="parameter-list">
            <h3>기준 모델</h3>
            {Object.entries(example.parameters).slice(0, 5).map(([key, value]) => (
              <div key={key}><span>{key.replaceAll("_", " ")}</span><b>{String(value)}</b></div>
            ))}
          </div>

          <div className="quality-note">
            <strong>⚠ 개념 검토용</strong>
            <p>선형 탄성·축력 부재 모델입니다. 인증 및 안전 판단에는 검증된 상용 해석과 실험이 필요합니다.</p>
          </div>
        </aside>
      </section>

      <footer>
        <span>Python FEM 결과 → 정적 JSON → React 상태 계산 → Three.js 시각화</span>
        <span>14개 산업 예제 · 서버 및 개인정보 전송 없음</span>
      </footer>
    </main>
  );
}

interface RangeControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function RangeControl({ id, label, value, min, max, step, display, onChange }: RangeControlProps) {
  return (
    <div className="range-control">
      <label htmlFor={id}><span>{label}</span><b>{display}</b></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <div><small>{min}</small><small>{max}</small></div>
    </div>
  );
}

function MetricCard({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <article className={`metric-card ${accent ? "metric-alert" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

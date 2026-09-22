import React from 'react';

import {
  AX,
  CAPTIONS,
  PW,
  SUB,
  TRK,
  T,
  VB_H,
  VB_W,
  f2,
  nice,
  px,
  py,
  sweepPath,
  vAt,
  type VtModel,
} from './vtModel';

const fmt = (x: number) => x.toFixed(1);

interface LayerItem {
  /** 动画进度阈值；null 表示常显元素 */
  at: number | null;
  node: React.ReactNode;
}

/** 下方轨道条：等分刻度 + 累计位移标注 + 段内位移标注 */
function buildTrack(model: VtModel): React.ReactNode {
  const nodes: React.ReactNode[] = [
    <text key="title" className="vt-tracktitle" x={AX.L} y={TRK.title}>
      {model.trackTitle}
    </text>,
    <line
      key="ruler"
      className="vt-axis"
      x1={AX.L - 14}
      y1={TRK.ruler}
      x2={AX.L + PW + 9}
      y2={TRK.ruler}
      markerEnd="url(#vt-arrow)"
    />,
    <text key="title-x" className="vt-axistitle" x={AX.L + PW + 22} y={TRK.ruler + 6}>
      x
    </text>,
  ];

  let prevX = AX.L;
  const last = model.pts.length - 1;
  model.pts.forEach((p, i) => {
    const tx = AX.L + p.trackX * PW;
    nodes.push(
      <line
        key={`tick${p.k}`}
        className="vt-tick"
        x1={fmt(tx)}
        y1={TRK.ruler - 7}
        x2={fmt(tx)}
        y2={TRK.ruler + 8}
      />,
    );
    nodes.push(
      <text
        key={`cum${p.k}`}
        className={i === last ? 'vt-trackcum vt-hi' : 'vt-trackcum'}
        x={fmt(tx)}
        y={TRK.cum}
        textAnchor={i === last ? 'end' : 'middle'}
      >
        {p.cumLbl}
      </text>,
    );
    if (tx - prevX > 22) {
      nodes.push(
        <text
          key={`seg${p.k}`}
          className="vt-trackseg"
          x={fmt((prevX + tx) / 2)}
          y={TRK.seg}
          textAnchor="middle"
        >
          {p.segLbl}
        </text>,
      );
    }
    prevX = tx;
  });

  return nodes;
}

/** 静态图元按绘制顺序铺开，动画标记在其中就地插入，以保持原有层叠关系 */
function buildLayers(m: VtModel): LayerItem[] {
  const out: LayerItem[] = [];
  const push = (node: React.ReactNode, at: number | null = null) => {
    out.push({ at, node });
  };

  for (const p of m.pts) {
    push(
      <line
        className="vt-gridline"
        x1={fmt(px(m, p.t))}
        y1={AX.TOP}
        x2={fmt(px(m, p.t))}
        y2={AX.GB}
      />,
    );
  }
  for (let j = 1; j <= 4; j += 1) {
    const gv = (m.vMax * j) / 4;
    push(
      <line
        className="vt-gridline"
        x1={AX.L}
        y1={fmt(py(m, gv))}
        x2={AX.L + PW}
        y2={fmt(py(m, gv))}
      />,
    );
  }

  if (m.key === 'tv' || m.key === 'sv') {
    for (const p of m.pts) {
      push(
        <line
          className="vt-guide-soft"
          x1={AX.L}
          y1={fmt(py(m, p.v))}
          x2={AX.L + PW}
          y2={fmt(py(m, p.v))}
        />,
        p.at,
      );
    }
  }

  push(
    <line
      className="vt-axis"
      x1={AX.L - 14}
      y1={AX.GB}
      x2={AX.L + PW + 9}
      y2={AX.GB}
      markerEnd="url(#vt-arrow)"
    />,
  );
  push(
    <line
      className="vt-axis"
      x1={AX.L}
      y1={AX.GB + 14}
      x2={AX.L}
      y2={AX.TOP - 12}
      markerEnd="url(#vt-arrow)"
    />,
  );
  push(
    <text className="vt-axistitle" x={AX.L + PW + 22} y={AX.GB + 6}>
      t
    </text>,
  );
  push(
    <text className="vt-axistitle" x={AX.L - 13} y={AX.TOP - 20} textAnchor="end">
      v
    </text>,
  );
  push(
    <text className="vt-axistext" x={AX.L - 12} y={AX.GB + 19} textAnchor="end">
      O
    </text>,
  );

  for (let j = 1; j <= 4; j += 1) {
    const yv = (m.vMax * j) / 4;
    push(
      <text
        className="vt-axistext"
        x={AX.L - 9}
        y={fmt(py(m, yv) + 4)}
        textAnchor="end"
      >
        {nice(yv)}
      </text>,
    );
  }

  if (m.family === 'rev') {
    push(
      <line
        className="vt-curve-ghost"
        x1={AX.L}
        y1={AX.GB}
        x2={fmt(px(m, m.tEnd))}
        y2={fmt(py(m, m.vEnd))}
      />,
    );
    push(
      <text
        className="vt-pmark-soft"
        x={fmt(px(m, m.tEnd) - 12)}
        y={fmt(py(m, m.vEnd) + 22)}
        textAnchor="end"
      >
        倒放：等效于初速为 0 的匀加速
      </text>,
    );
    push(
      <line
        className="vt-curve"
        x1={AX.L}
        y1={fmt(py(m, m.vEnd))}
        x2={fmt(px(m, m.tEnd))}
        y2={AX.GB}
      />,
    );
  } else {
    push(
      <line
        className="vt-curve"
        x1={AX.L}
        y1={AX.GB}
        x2={fmt(px(m, m.tEnd))}
        y2={fmt(py(m, m.vEnd))}
      />,
    );
  }

  if (m.key === 'tv') {
    for (const p of m.pts) {
      const bx = px(m, p.t);
      const by = py(m, p.v);
      push(
        <>
          <rect
            className="vt-bar"
            x={fmt(bx - 3.5)}
            y={fmt(by)}
            width={7}
            height={fmt(AX.GB - by)}
            rx={3.5}
          />
          <circle className="vt-dot-ring" cx={fmt(bx)} cy={fmt(by)} r={7} />
          <circle className="vt-dot" cx={fmt(bx)} cy={fmt(by)} r={5} />
          <text
            className="vt-pmark"
            x={fmt(bx - 11)}
            y={fmt(by - 11)}
            textAnchor="end"
          >
            {p.k === 1 ? 'aT' : `${p.k}aT`}
          </text>
        </>,
        p.at,
      );
    }
  }

  if (m.key === 'sv') {
    for (const p of m.pts) {
      const sx = px(m, p.t);
      const sy = py(m, p.v);
      push(
        <>
          <rect
            className="vt-bar"
            x={AX.L}
            y={fmt(sy - 3.5)}
            width={fmt(sx - AX.L)}
            height={7}
            rx={3.5}
          />
          <circle className="vt-dot-ring" cx={fmt(sx)} cy={fmt(sy)} r={7} />
          <circle className="vt-dot" cx={fmt(sx)} cy={fmt(sy)} r={5} />
          <text className="vt-pmark" x={AX.L + 10} y={fmt(sy + 4.5)}>
            {p.k === 1 ? '1' : `√${p.k}`}
          </text>
        </>,
        p.at,
      );
    }
  }

  if (m.key === 'tx' || m.key === 'st') {
    for (let k = m.pts.length; k >= 1; k -= 1) {
      const p = m.pts[k - 1];
      push(
        <path
          className="vt-area"
          d={`M${AX.L},${AX.GB} L${fmt(px(m, p.t))},${AX.GB} L${fmt(px(m, p.t))},${fmt(py(m, p.v))} Z`}
        />,
        p.at,
      );
    }
    for (const p of m.pts) {
      push(
        <circle
          className="vt-dot"
          cx={fmt(px(m, p.t))}
          cy={fmt(py(m, p.v))}
          r={4.5}
        />,
        p.at,
      );
    }
  }

  if (m.key === 'tdx') {
    for (const p of m.pts) {
      const x0 = px(m, (p.k - 1) * T);
      const x1 = px(m, p.k * T);
      const vA = m.a * (p.k - 1) * T;
      push(
        <>
          <path
            className="vt-strip"
            d={`M${fmt(x0 + 1)},${AX.GB} L${fmt(x1 - 1)},${AX.GB} L${fmt(x1 - 1)},${fmt(py(m, p.v))} L${fmt(x0 + 1)},${fmt(py(m, vA))} Z`}
          />
          <text
            className="vt-arealabel"
            x={fmt((x0 + x1) / 2)}
            y={fmt((AX.GB + py(m, (vA + p.v) / 2)) / 2)}
            textAnchor="middle"
          >
            {2 * p.k - 1}
          </text>
        </>,
        p.at,
      );
    }
  }

  if (m.key === 'sdt') {
    m.pts.forEach((p, i) => {
      const tA = p.k === 1 ? 0 : m.pts[i - 1].t;
      const vA = p.k === 1 ? 0 : m.pts[i - 1].v;
      const xa = px(m, tA);
      const xb = px(m, p.t);
      push(
        <>
          <path
            className="vt-strip"
            d={`M${fmt(xa + 1)},${AX.GB} L${fmt(xb - 1)},${AX.GB} L${fmt(xb - 1)},${fmt(py(m, p.v))} L${fmt(xa + 1)},${fmt(py(m, vA))} Z`}
          />
          <text
            className="vt-arealabel"
            x={fmt((xa + xb) / 2)}
            y={fmt((AX.GB + py(m, (vA + p.v) / 2)) / 2)}
            textAnchor="middle"
          >
            {p.k}
          </text>
        </>,
        p.at,
      );
    });
  }

  if (m.family === 'rev') {
    for (const p of m.pts) {
      const ra = m.tEnd - p.k * T;
      const rb = m.tEnd - (p.k - 1) * T;
      const rvA = m.a * p.k * T;
      const rvB = m.a * (p.k - 1) * T;
      const qa = px(m, ra);
      const qb = px(m, rb);
      push(
        <>
          <path
            className="vt-strip"
            d={`M${fmt(qa + 1)},${AX.GB} L${fmt(qb - 1)},${AX.GB} L${fmt(qb - 1)},${fmt(py(m, rvB))} L${fmt(qa + 1)},${fmt(py(m, rvA))} Z`}
          />
          <text
            className="vt-arealabel"
            x={fmt((qa + qb) / 2)}
            y={fmt((AX.GB + py(m, (rvA + rvB) / 2)) / 2)}
            textAnchor="middle"
          >
            {2 * p.k - 1}
          </text>
        </>,
        p.at,
      );
    }
  }

  for (const p of m.pts) {
    let lbl: string;
    if (m.family === 'rev') {
      const rem = m.n - p.k;
      lbl = rem === 0 ? '0' : `${rem}T`;
    } else if (m.family === 'space') {
      lbl = `t${SUB[p.k]}`;
    } else {
      lbl = p.k === 1 ? 'T' : `${p.k}T`;
    }
    push(
      <text
        className="vt-ticktext"
        x={fmt(px(m, p.t))}
        y={AX.GB + 19}
        textAnchor="middle"
      >
        {lbl}
      </text>,
    );
  }

  for (const p of m.pts) {
    let v2: string | null;
    if (m.key === 'tx' || m.family === 'rev') v2 = String(p.k * p.k);
    else if (m.key === 'st' || m.key === 'sdt') v2 = p.k === 1 ? '1' : `√${p.k}`;
    else v2 = null;
    if (v2 === null) continue;
    push(
      <text
        className="vt-arealabel"
        x={fmt(px(m, p.t))}
        y={AX.GB + 38}
        textAnchor="middle"
      >
        {v2}
      </text>,
      p.at,
    );
  }

  return out;
}

interface MarkProps {
  at: number;
  prog: number;
  children: React.ReactNode;
}

/** 进度到达阈值前淡出；children 元素身份稳定，逐帧重渲染时 React 会跳过子树 */
const Mark = React.memo(function Mark({ at, prog, children }: MarkProps) {
  const off = prog < at - 1e-6;
  return <g className={off ? 'vt-mark vt-off' : 'vt-mark'}>{children}</g>;
});

interface VtFigureProps {
  model: VtModel;
  /** 0 → 1 的播放进度 */
  prog: number;
}

export default function VtFigure({ model, prog }: VtFigureProps) {
  const layers = React.useMemo(() => buildLayers(model), [model]);
  const track = React.useMemo(() => buildTrack(model), [model]);

  const t = prog * model.tEnd;
  const v = vAt(model, t);
  const X = px(model, t);
  const Y = py(model, v);
  const s =
    model.family === 'rev'
      ? model.vEnd * t - 0.5 * model.a * t * t
      : 0.5 * model.a * t * t;
  const trackCx = AX.L + Math.max(0, Math.min(1, s / model.sMax)) * PW;
  const space = model.family === 'space';
  const cap = CAPTIONS[model.key];

  return (
    <>
      <figure>
        <div className="vt-svgscroll">
          <svg
            className="vt-svg"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            role="img"
            aria-label={`v-t 图：${cap}`}
          >
            <defs>
              <marker
                id="vt-arrow"
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto"
              >
                <path d="M0,1.4 L9,5 L0,8.6 z" fill="currentColor" />
              </marker>
            </defs>

            <g>
              {layers.map((it, i) => {
                const { at, node } = it;
                if (at === null) {
                  return <React.Fragment key={i}>{node}</React.Fragment>;
                }
                return (
                  <Mark key={i} at={at} prog={prog}>
                    {node}
                  </Mark>
                );
              })}
            </g>

            <path className="vt-sweep" d={sweepPath(model, t, v)} />

            <g>
              <line
                className="vt-guide"
                x1={fmt(X)}
                y1={fmt(Y)}
                x2={fmt(X)}
                y2={AX.GB}
              />
              <line
                className="vt-guide"
                x1={fmt(X)}
                y1={fmt(Y)}
                x2={AX.L}
                y2={fmt(Y)}
              />
              <circle className="vt-ball-halo" r={12} cx={fmt(X)} cy={fmt(Y)} />
              <circle className="vt-ball" r={5.5} cx={fmt(X)} cy={fmt(Y)} />
            </g>

            <g>{track}</g>

            <circle className="vt-ball" r={8} cx={fmt(trackCx)} cy={TRK.ruler} />
          </svg>
        </div>
        <figcaption>{`${cap}。下方轨道条显示物体的真实位置。`}</figcaption>
      </figure>

      <div className="vt-livestrip">
        <span>
          t = <b>{f2(t / model.ut) + (space ? '' : ' T')}</b>
        </span>
        <span>
          v = <b>{f2(v / model.uv) + (space ? '' : ' aT')}</b>
        </span>
        <span>
          累计位移 x = <b>{f2(s / model.ux) + (space ? '' : ' ½aT²')}</b>
        </span>
        <span>
          {space ? '（单位：√(2x/a)、√(2ax)、x）' : '（单位：T、aT、½aT²）'}
        </span>
      </div>
    </>
  );
}

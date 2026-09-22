/**
 * v-t 图六个比例演示 —— 运动学模型与几何映射
 *
 * 全部数值由 (n, a) 实时算出：T = 1、x₀ = 1 只是刻度设定，
 * 改变 a 只缩放图形，比例本身是运动学结论。
 */

/** 等分时间的时间刻度 */
export const T = 1;
/** 等分位移的位移刻度 */
export const X0 = 1;
/** 一次播放动画的时长（ms） */
export const RUN = 3600;

export const VB_W = 660;
export const VB_H = 650;
/** 坐标轴：左边界、右边界、上边界、时间轴高度 */
export const AX = { L: 72, R: 28, TOP: 26, GB: 476 };
export const PW = VB_W - AX.L - AX.R;
export const PH = AX.GB - AX.TOP;
/** 下方轨道条各行的纵坐标 */
export const TRK = { title: 540, seg: 570, ruler: 594, cum: 618 };

export const SUB = ['', '₁', '₂', '₃', '₄', '₅', '₆'];

export type VtKey = 'tv' | 'tx' | 'tdx' | 'sv' | 'st' | 'sdt' | 'rev';
export type VtFamily = 'time' | 'space' | 'rev';

export interface VtPoint {
  k: number;
  t: number;
  v: number;
  /** 动画进度阈值：0→1 */
  at: number;
  /** 该点的待比较量（累计位移 / 累计用时，以基本单位计） */
  cumU: number;
  /** 该段自身的量 */
  segU: number;
  /** 轨道条上的归一化位置 */
  trackX: number;
  cumLbl: string;
  segLbl: string;
}

export interface VtModel {
  key: VtKey;
  n: number;
  a: number;
  family: VtFamily;
  pts: VtPoint[];
  tEnd: number;
  vEnd: number;
  sMax: number;
  trackTitle: string;
  /** 读数条的三个基本单位 */
  ut: number;
  uv: number;
  ux: number;
  tMax: number;
  vMax: number;
}

export interface VtTab {
  key: VtKey;
  label: string;
  /** 组标题：只在该组第一个标签上出现 */
  group?: string;
}

export const TABS: VtTab[] = [
  { key: 'tv', label: '① 瞬时速度', group: '等分时间' },
  { key: 'tx', label: '② 前 nT 位移' },
  { key: 'tdx', label: '③ 第 n 个 T 内位移' },
  { key: 'sv', label: '④ 各分点速度', group: '等分位移' },
  { key: 'st', label: '⑤ 前 nx 用时' },
  { key: 'sdt', label: '⑥ 每段 x 用时' },
  { key: 'rev', label: '↺ 末速为 0', group: '逆向' },
];

export const CAPTIONS: Record<VtKey, string> = {
  tv: '图线上每个等分点的纵坐标就是该时刻的瞬时速度，依次为 aT、2aT、3aT…',
  tx: '从原点出发的三角形彼此相似，底边比 1 : 2 : 3…，面积比 1 : 4 : 9…',
  tdx: '等宽的梯形条带，面积依次是原点处小三角形的 1、3、5、7… 倍',
  sv: '等长位移处的高度按 √k 增长：速度涨得越来越慢',
  st: '同样大小的面积(位移)，对应的底边(时间)按 √k 拉开',
  sdt: '每段等长位移所用的时间越往右越短，条带因此越窄',
  rev: '减速线的最后几段：倒数第 k 个 T 的位移比是 1 : 3 : 5…',
};

export function f2(x: number): string {
  return (Math.abs(x) < 1e-9 ? 0 : x).toFixed(2);
}

export function nice(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
  return x.toFixed(2);
}

export function buildModel(key: VtKey, n: number, a: number): VtModel {
  const m: VtModel = {
    key,
    n,
    a,
    family: 'time',
    pts: [],
    tEnd: 0,
    vEnd: 0,
    sMax: 0,
    trackTitle: '',
    ut: T,
    uv: a * T,
    ux: 0.5 * a * T * T,
    tMax: 1,
    vMax: 1,
  };

  if (key === 'tv' || key === 'tx' || key === 'tdx') {
    m.family = 'time';
    m.tEnd = n * T;
    m.vEnd = a * n * T;
    m.sMax = 0.5 * a * m.tEnd * m.tEnd;
    for (let k = 1; k <= n; k += 1) {
      m.pts.push({
        k,
        t: k * T,
        v: a * k * T,
        at: k / n,
        cumU: k * k,
        segU: 2 * k - 1,
        trackX: (k * k) / (n * n),
        cumLbl: String(k * k),
        segLbl: String(2 * k - 1),
      });
    }
    m.trackTitle = '位移轴 · 每个 T 末的位置（单位 ½aT²）';
  } else if (key === 'sv' || key === 'st' || key === 'sdt') {
    m.family = 'space';
    m.tEnd = Math.sqrt((2 * n * X0) / a);
    m.vEnd = Math.sqrt(2 * a * n * X0);
    m.sMax = n * X0;
    for (let k = 1; k <= n; k += 1) {
      const t = Math.sqrt((2 * k * X0) / a);
      const tPrev = Math.sqrt((2 * (k - 1) * X0) / a);
      m.pts.push({
        k,
        t,
        v: Math.sqrt(2 * a * k * X0),
        at: t / m.tEnd,
        cumU: k,
        segU: t - tPrev,
        trackX: k / n,
        cumLbl: String(k),
        segLbl: f2(t - tPrev),
      });
    }
    m.trackTitle = '位移轴 · 每段等长 x₀，上排为该段用时';
  } else {
    m.family = 'rev';
    m.tEnd = n * T;
    m.vEnd = a * n * T;
    m.sMax = 0.5 * a * m.tEnd * m.tEnd;
    for (let k = 1; k <= n; k += 1) {
      m.pts.push({
        k,
        // 距停止还有 k 个 T
        t: m.tEnd - k * T,
        v: a * k * T,
        at: 1 - k / n,
        cumU: k * k,
        segU: 2 * k - 1,
        trackX: (k * k) / (n * n),
        cumLbl: String(k * k),
        // 从停止端倒数，1、3、5…
        segLbl: String(2 * (n - k + 1) - 1),
      });
    }
    m.trackTitle = '位移轴 · 段内位移从停止端倒数：1、3、5…';
  }

  if (m.family === 'space') {
    m.ut = Math.sqrt((2 * X0) / a);
    m.uv = Math.sqrt(2 * a * X0);
    m.ux = X0;
  }
  m.tMax = m.tEnd * 1.06;
  m.vMax = m.vEnd * 1.16;
  return m;
}

export function px(m: VtModel, t: number): number {
  return AX.L + (t / m.tMax) * PW;
}

export function py(m: VtModel, v: number): number {
  return AX.GB - (v / m.vMax) * PH;
}

/** 当前时刻的速度：逆向题里 v 随时间递减 */
export function vAt(m: VtModel, tau: number): number {
  return m.family === 'rev' ? m.a * (m.tEnd - tau) : m.a * tau;
}

/** 时刻 t 落在第几个条带（1-based） */
export function stripIndex(m: VtModel, t: number): number {
  let k: number;
  if (m.family === 'rev') {
    const e = m.tEnd - t;
    for (k = 1; k <= m.n; k += 1) if (e <= k * T + 1e-9) return k;
    return m.n;
  }
  if (m.key === 'tdx') return Math.min(m.n, Math.max(1, Math.ceil(t / T - 1e-9)));
  for (k = 1; k <= m.n; k += 1) if (t <= m.pts[k - 1].t + 1e-9) return k;
  return m.n;
}

/** 第 j 个条带的时间区间 */
export function stripBounds(m: VtModel, j: number): [number, number] {
  if (m.family === 'rev') return [m.tEnd - j * T, m.tEnd - (j - 1) * T];
  if (m.key === 'tdx') return [(j - 1) * T, j * T];
  return [j === 1 ? 0 : m.pts[j - 2].t, m.pts[j - 1].t];
}

/** 扫过区域：累计面积的形状随演示的推论而变 */
export function sweepPath(m: VtModel, t: number, v: number): string {
  if (m.key === 'tv' || m.key === 'sv') return '';
  if (m.key === 'tx' || m.key === 'st') {
    return `M${AX.L},${AX.GB} L${px(m, t).toFixed(1)},${AX.GB} L${px(m, t).toFixed(1)},${py(m, v).toFixed(1)} Z`;
  }
  const j = stripIndex(m, t);
  const [s0raw, s1raw] = stripBounds(m, j);
  const s0 = s0raw;
  const s1 = Math.max(s0, Math.min(t, s1raw));
  return (
    `M${px(m, s0).toFixed(1)},${AX.GB}` +
    ` L${px(m, s1).toFixed(1)},${AX.GB}` +
    ` L${px(m, s1).toFixed(1)},${py(m, vAt(m, s1)).toFixed(1)}` +
    ` L${px(m, s0).toFixed(1)},${py(m, vAt(m, s0)).toFixed(1)} Z`
  );
}

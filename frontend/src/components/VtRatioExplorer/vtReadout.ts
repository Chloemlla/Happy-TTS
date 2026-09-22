import { T, f2, type VtKey, type VtModel } from './vtModel';

export interface ReadoutRow {
  k: string;
  value: string;
  ratio: string;
}

export interface ReadoutConfig {
  /** 比例结论（LaTeX） */
  big: string;
  /** 通项（LaTeX） */
  formula: string;
  /** 数值核对表第二列的列名 */
  col2: string;
  note: string;
  rows: (m: VtModel) => ReadoutRow[];
}

const row = (k: number, value: string, ratio: string): ReadoutRow => ({
  k: String(k),
  value,
  ratio,
});

export const READOUT: Record<VtKey, ReadoutConfig> = {
  tv: {
    big: 'v_1:v_2:v_3:\\dots:v_n = 1:2:3:\\dots:n',
    formula: 'v_n = n\\,aT',
    col2: 'vₙ 数值',
    note: '纵坐标成等差数列，公差 aT。改变 a 只会整体缩放，比例不动。',
    rows: (m) => m.pts.map((p) => row(p.k, f2(p.v), String(p.k))),
  },
  tx: {
    big: 'x_1:x_2:x_3:\\dots:x_n = 1:4:9:\\dots:n^2',
    formula: 'x_n = \\tfrac12 a(nT)^2',
    col2: 'xₙ 数值',
    note: '相似三角形的面积比 = 相似比的平方。表中“比值”即各三角形面积相对第一个的倍数。',
    rows: (m) =>
      m.pts.map((p) => row(p.k, f2(0.5 * m.a * p.t * p.t), String(p.k * p.k))),
  },
  tdx: {
    big: 'x_{\\mathrm{I}}:x_{\\mathrm{II}}:x_{\\mathrm{III}}:\\dots = 1:3:5:\\dots:(2n-1)',
    formula: 'x_N = n^2-(n-1)^2 = 2n-1',
    col2: 'x_N 数值',
    note: '等宽条带的面积，恰为相邻两个平方数之差。图中的数字就是条带面积相对首个条带的倍数。',
    rows: (m) =>
      m.pts.map((p) =>
        row(p.k, f2(0.5 * m.a * T * T * (2 * p.k - 1)), String(2 * p.k - 1)),
      ),
  },
  sv: {
    big: 'v_1:v_2:v_3:\\dots:v_n = 1:\\sqrt2:\\sqrt3:\\dots:\\sqrt n',
    formula: 'v = \\sqrt{2ax}',
    col2: 'v 数值',
    note: '横轴是时间，但分点位置由等长位移决定；纵坐标按 √k 变高，涨得越来越慢。',
    rows: (m) =>
      m.pts.map((p) => row(p.k, f2(p.v), p.k === 1 ? '1' : `√${p.k}`)),
  },
  st: {
    big: 't_1:t_2:t_3:\\dots:t_n = 1:\\sqrt2:\\sqrt3:\\dots:\\sqrt n',
    formula: 't = \\sqrt{2x/a}',
    col2: 't 数值',
    note: '与上一条是同一个分点：读纵轴得速度比，读横轴得时间比。面积（位移）比是 1 : 2 : 3…，边长比取其平方根。',
    rows: (m) =>
      m.pts.map((p) => row(p.k, f2(p.t), p.k === 1 ? '1' : `√${p.k}`)),
  },
  sdt: {
    big: '1:(\\sqrt2-1):(\\sqrt3-\\sqrt2):\\dots',
    formula: 't_n = \\sqrt n-\\sqrt{n-1} = \\dfrac{1}{\\sqrt n+\\sqrt{n-1}}',
    col2: '每段用时',
    note: '有理化后分母单调变大，所以每段用时单调变短。图上条带越往右越窄，就是这个原因。',
    rows: (m) =>
      m.pts.map((p, i) => {
        const prev = i === 0 ? 0 : m.pts[i - 1].t;
        const r = p.k === 1 ? '1' : `√${p.k}−√${p.k - 1}`;
        return row(p.k, f2(p.t - prev), r);
      }),
  },
  rev: {
    big: 'x_{\\text{last }T}:x_{\\text{last }2T}:x_{\\text{last }3T} = 1:4:9',
    formula: '\\tilde x_k \\propto 2k-1\\quad 倒数第 k 个 T 内的位移',
    col2: '倒数第 k 段',
    note: '逆向等效为初速度为 0 的匀加速。表中列出倒数第 k 个 T 内的位移，比值即 1 : 3 : 5…；轴下数字则是从停止点倒数 k 段的累计位移，比值 1 : 4 : 9…。',
    rows: (m) =>
      m.pts.map((p) =>
        row(p.k, f2(0.5 * m.a * T * T * (2 * p.k - 1)), String(2 * p.k - 1)),
      ),
  },
};

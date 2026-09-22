import React from 'react';

import Tex from './Tex';
import type { VtKey } from './vtModel';

type Block =
  | { kind: 'p'; node: React.ReactNode }
  | { kind: 'eq'; tex: string[] }
  | { kind: 'why'; node: React.ReactNode };

interface CardSpec {
  idx?: string;
  title: React.ReactNode;
  /** 结论的比例式（LaTeX 源码） */
  ratio: string;
  blocks: Block[];
  /** 点它跳到图上的对应演示 */
  goto: VtKey;
}

interface SectionSpec {
  heading: string;
  lede: React.ReactNode;
  cards: CardSpec[];
}

const p = (node: React.ReactNode): Block => ({ kind: 'p', node });
const why = (node: React.ReactNode): Block => ({ kind: 'why', node });

const SECTIONS: SectionSpec[] = [
  {
    heading: '一、等分时间：T、2T、3T…',
    lede: (
      <>
        把时间轴按固定的 <i>T</i> 切开。因为 <i>v</i> 随 <i>t</i>{' '}
        线性增长，所有“相等时间”的结论都能在图线上直接读出来。
      </>
    ),
    cards: [
      {
        idx: '1',
        title: '瞬时速度之比',
        ratio: 'v_1:v_2:v_3:\\dots:v_n = 1:2:3:\\dots:n',
        blocks: [
          {
            kind: 'eq',
            tex: [
              String.raw`v_1 = aT,\qquad v_2 = a(2T) = 2aT,\qquad v_3 = a(3T) = 3aT,\qquad \dots,\qquad v_n = n\cdot aT`,
            ],
          },
          p(
            <>
              每一项都含公因式 <i>aT</i>，约掉它就是 <i>n</i>{' '}
              本身。所以只要初速度为 0、加速度不变，第 <i>n</i> 个 <i>T</i>{' '}
              末的速度永远等于 <i>n</i> 倍的第一段末速度。
            </>,
          ),
          why(
            <>
              图线上时间 <i>T</i>、2<i>T</i>、3<i>T</i>{' '}
              处各分点的<b>纵坐标成等差数列</b>，公差就是 <i>aT</i>。
            </>,
          ),
        ],
        goto: 'tv',
      },
      {
        idx: '2',
        title: (
          <>
            前 <i>nT</i> 内的总位移之比
          </>
        ),
        ratio: 'x_1:x_2:x_3:\\dots:x_n = 1:4:9:\\dots:n^2',
        blocks: [
          {
            kind: 'eq',
            tex: [
              String.raw`\begin{aligned}
  x_1 &= \tfrac12 aT^2 \\[2pt]
  x_2 &= \tfrac12 a(2T)^2 = 4\times\tfrac12 aT^2 \\[2pt]
  x_3 &= \tfrac12 a(3T)^2 = 9\times\tfrac12 aT^2 \\[2pt]
  &\;\;\vdots \\[2pt]
  x_n &= \tfrac12 a(nT)^2 = n^2\times\tfrac12 aT^2
\end{aligned}`,
            ],
          },
          p(
            <>
              时间被平方，比例就成了平方数。注意这里比的是<b>从出发算起的累计位移</b>
              ，不是某一段的位移。
            </>,
          ),
          why(
            <>
              从原点出发、底边分别为 <i>T</i>、2<i>T</i>、3<i>T</i>…{' '}
              的三角形彼此<b>相似</b>。相似图形的面积比 = 相似比的平方，底边比是 1 : 2 :
              3…，面积比就是 1 : 4 : 9…
            </>,
          ),
        ],
        goto: 'tx',
      },
      {
        idx: '3',
        title: (
          <>
            第 <i>n</i> 个 <i>T</i> 内的位移之比
          </>
        ),
        ratio:
          'x_{\\mathrm{I}}:x_{\\mathrm{II}}:\\dots:x_N = 1:3:5:\\dots:(2n-1)',
        blocks: [
          {
            kind: 'eq',
            tex: [
              String.raw`\begin{aligned}
  x_{\mathrm{I}} &= x_1 = 1\times\tfrac12 aT^2 \\[2pt]
  x_{\mathrm{II}} &= x_2 - x_1 = (4-1)\times\tfrac12 aT^2 = 3\times\tfrac12 aT^2 \\[2pt]
  x_{\mathrm{III}} &= x_3 - x_2 = (9-4)\times\tfrac12 aT^2 = 5\times\tfrac12 aT^2 \\[2pt]
  &\;\;\vdots \\[2pt]
  x_N &\propto n^2-(n-1)^2 = 2n-1
\end{aligned}`,
            ],
          },
          p(
            <>
              连着两个平方数相减，得到的正是连续奇数。反过来看也很有用：如果你在纸带上量出相邻两段位移是
              1 : 3 : 5，那就说明这段运动是初速度为 0 的匀加速。
            </>,
          ),
          why(
            <>
              图线被切成<b>等宽的梯形条带</b>
              ，每段都等于相邻两个大三角形之差，面积依次是原点处那个小三角形的
              1、3、5、7… 倍。
            </>,
          ),
        ],
        goto: 'tdx',
      },
    ],
  },
  {
    heading: '二、等分位移：x、2x、3x…',
    lede: (
      <>
        换一种切法：在轨道上划出一段段<b>长度相等</b>的区间，每段长 <i>x</i>
        。这一次，变的不是刻度而是“走完它要多久”。
      </>
    ),
    cards: [
      {
        idx: '4',
        title: '经过各分点的瞬时速度之比',
        ratio: 'v_x:v_{2x}:v_{3x}:\\dots:v_{nx} = 1:\\sqrt2:\\sqrt3:\\dots:\\sqrt n',
        blocks: [
          {
            kind: 'eq',
            tex: [
              String.raw`v^2 = 2ax \;\;\Longrightarrow\;\; v = \sqrt{2ax}`,
              String.raw`v_x = \sqrt{2ax},\qquad v_{2x} = \sqrt2\,\sqrt{2ax},\qquad v_{3x} = \sqrt3\,\sqrt{2ax},\qquad \dots`,
            ],
          },
          p(
            <>
              速度的平方与位移成正比，速度本身就只能随位移的平方根增长。所以在等长的路段上，速度涨得越来越慢
              —— 这是匀加速运动最容易被忽略的一条“减速感”。
            </>,
          ),
          why(
            <>
              纵坐标的间隔越来越挤：第 4 段只比第 3 段快了 0.27 倍，而第 1 段到第 2
              段快了 0.41 倍。
            </>,
          ),
        ],
        goto: 'sv',
      },
      {
        idx: '5',
        title: (
          <>
            通过前 <i>nx</i> 位移所用总时间之比
          </>
        ),
        ratio: 't_x:t_{2x}:t_{3x}:\\dots:t_{nx} = 1:\\sqrt2:\\sqrt3:\\dots:\\sqrt n',
        blocks: [
          {
            kind: 'eq',
            tex: [
              String.raw`x = \tfrac12 at^2 \;\;\Longrightarrow\;\; t = \sqrt{2x/a}`,
              String.raw`t_x = \sqrt{2x/a},\qquad t_{2x} = \sqrt2\,\sqrt{2x/a},\qquad t_{3x} = \sqrt3\,\sqrt{2x/a},\qquad \dots`,
            ],
          },
          p(
            <>
              和上一条长得一样，但一个是纵坐标之比、一个是横坐标之比 ——
              在图上它们的分点是同一个点，只是读的是不同的轴。
            </>,
          ),
          why(
            <>
              位移（三角形的面积）比是 <b>1 : 2 : 3…</b>，而相似图形的
              <b>对应边长之比 = 面积比的平方根</b>。时间轴上的底边因此按{' '}
              <Tex tex="1:\sqrt2:\sqrt3:\dots" /> 拉开。
            </>,
          ),
        ],
        goto: 'st',
      },
      {
        idx: '6',
        title: (
          <>
            通过第 <i>n</i> 个相等位移所用时间之比
          </>
        ),
        ratio:
          't_1:t_2:\\dots:t_n = 1:(\\sqrt2-1):(\\sqrt3-\\sqrt2):\\dots',
        blocks: [
          {
            kind: 'eq',
            tex: [
              String.raw`\begin{aligned}
  t_1 &= t_x \propto 1 \\[2pt]
  t_2 &= t_{2x}-t_x \propto \sqrt2-1 \approx 0.414 \\[2pt]
  t_3 &= t_{3x}-t_{2x} \propto \sqrt3-\sqrt2 \approx 0.318 \\[2pt]
  &\;\;\vdots \\[2pt]
  t_n &= t_{nx}-t_{(n-1)x} \propto \sqrt n-\sqrt{n-1} = \frac{1}{\sqrt n+\sqrt{n-1}}
\end{aligned}`,
            ],
          },
          p(
            <>
              每一段的时间，都等于“走到终点”减去“走到起点”。因为速度越来越快，走同样长的一段路只会越来越省时间。
            </>,
          ),
          why(
            <>
              把 <Tex tex="\sqrt n-\sqrt{n-1}" /> 有理化：它等于{' '}
              <Tex tex="1/(\sqrt n+\sqrt{n-1})" />
              。分母随 <i>n</i> 单调变大，所以这个差值单调变小 ——
              图上的条带越往右越窄。
            </>,
          ),
        ],
        goto: 'sdt',
      },
    ],
  },
  {
    heading: '三、逆向思维：末速度为 0',
    lede: (
      <>
        刹车、竖直上抛到最高点、物体滑上斜面后停下 ——
        这些运动的共同点是<b>末速度为 0</b>
        。把胶片倒过来放，它们就是标准的初速度为 0 的匀加速。
      </>
    ),
    cards: [
      {
        title: '倒过来看，一切照旧',
        ratio: 'x_{\\text{last }T}:x_{\\text{last }2T}:x_{\\text{last }3T} = 1:4:9',
        blocks: [
          p(
            <>
              匀减速直线运动在 <i>v-t</i> 图上是一条<b>从左上到右下</b>
              的斜线。把它绕中间某点旋转 180°，得到的就是一条过原点的上升直线 ——
              时间反演之后，速度方向和加速度方向同时反号，运动规律完全不变。
            </>,
          ),
          {
            kind: 'eq',
            tex: [
              String.raw`x_{\text{last }T} = 1\times\tfrac12 aT^2,\qquad x_{\text{last }2T} = 4\times\tfrac12 aT^2,\qquad x_{\text{last }3T} = 9\times\tfrac12 aT^2`,
              String.raw`\tilde x_1:\tilde x_2:\tilde x_3:\dots = 1:3:5:\dots:(2k-1)`,
            ],
          },
          p(
            <>
              式中 <Tex tex="\tilde x_k" /> 表示<b>倒数第 <i>k</i> 个 <i>T</i> 内</b>
              走过的位移，也就是从停止的时刻往前数第 <i>k</i> 段。
            </>,
          ),
          why(
            <>
              于是三条推论原封不动地搬过来：
              <b>最后 1T、2T、3T 内的位移之比 = 1 : 4 : 9</b>；
              <b>
                倒数第 1 个 T、倒数第 2 个 T、倒数第 3 个 T 的位移之比 = 1 : 3 : 5
              </b>
              。
            </>,
          ),
          p(
            <>
              换句话说是同一件事的两种问法：一个问“还剩最后几秒时已经走了多远”，一个问“每最后一秒各走了多远”。前者的比值是平方数，后者是奇数。
            </>,
          ),
        ],
        goto: 'rev',
      },
    ],
  },
];

interface VtArticleProps {
  onGoto: (key: VtKey) => void;
}

export default function VtArticle({ onGoto }: VtArticleProps) {
  return (
    <main className="vt-content">
      {SECTIONS.map((sec) => (
        <section key={sec.heading}>
          <div className="vt-sec-head">
            <h2>{sec.heading}</h2>
            <p>{sec.lede}</p>
          </div>
          <div className="vt-cards">
            {sec.cards.map((card, ci) => (
              <article className="vt-card" key={ci}>
                <div className="vt-card-head">
                  <h3>
                    {card.idx ? <span className="vt-idx">{card.idx}</span> : null}
                    {card.title}
                  </h3>
                  <span className="vt-ratio">
                    <Tex tex={card.ratio} />
                  </span>
                </div>
                {card.blocks.map((b, i) => {
                  if (b.kind === 'eq') {
                    return (
                      <div className="vt-eq" key={i}>
                        {b.tex.map((t, ti) => (
                          <Tex key={ti} tex={t} display />
                        ))}
                      </div>
                    );
                  }
                  if (b.kind === 'why') {
                    return (
                      <div className="vt-why" key={i}>
                        {b.node}
                      </div>
                    );
                  }
                  return <p key={i}>{b.node}</p>;
                })}
                <button
                  type="button"
                  className="vt-goto"
                  onClick={() => onGoto(card.goto)}
                >
                  在图上演示
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="vt-foot">
        图上所有数值都由 <i>a</i> = 1、<i>T</i> = 1、<i>x</i> = 1
        的设定实时算出；改变 <i>a</i> 只会缩放图形，比例本身是运动学结论，与具体取值无关。
      </p>
    </main>
  );
}

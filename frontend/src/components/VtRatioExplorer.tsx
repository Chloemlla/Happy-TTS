import React from 'react';

import Tex from './VtRatioExplorer/Tex';
import VtArticle from './VtRatioExplorer/VtArticle';
import VtFigure from './VtRatioExplorer/VtFigure';
import VtReadout from './VtRatioExplorer/VtReadout';
import { RUN, TABS, buildModel, type VtKey } from './VtRatioExplorer/vtModel';
import './VtRatioExplorer/vt-ratios.css';

/**
 * v-t 图上的六个比例 —— 交互式讲解页
 *
 * 一个过原点的直线（斜率 a、面积 x）就够推出全部六条推论，
 * 所以每个标签都只是把同一张图换一种切法。
 */
const VtRatioExplorer: React.FC = () => {
  const [key, setKeyState] = React.useState<VtKey>('tv');
  const [n, setN] = React.useState(4);
  const [a, setA] = React.useState(1);
  const [prog, setProg] = React.useState(1);
  const [playing, setPlaying] = React.useState(false);

  const stageRef = React.useRef<HTMLElement | null>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const rafRef = React.useRef<number | null>(null);
  const tStartRef = React.useRef(0);
  const playingRef = React.useRef(false);

  const reduceMotion = React.useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const model = React.useMemo(() => buildModel(key, n, a), [key, n, a]);

  const stopAnim = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    playingRef.current = false;
    setPlaying(false);
  };

  const step = (now: number) => {
    const ratio = (now - tStartRef.current) / RUN;
    const next = ratio >= 1 ? 1 : ratio;
    setProg(next);
    if (next < 1 && playingRef.current) {
      rafRef.current = window.requestAnimationFrame(step);
    } else {
      rafRef.current = null;
      playingRef.current = false;
      setPlaying(false);
    }
  };

  const play = () => {
    stopAnim();
    if (reduceMotion) {
      setProg(1);
      return;
    }
    setProg(0);
    playingRef.current = true;
    setPlaying(true);
    tStartRef.current = performance.now();
    rafRef.current = window.requestAnimationFrame(step);
  };

  const setKey = (next: VtKey, scroll: boolean) => {
    stopAnim();
    setKeyState(next);
    setProg(1);
    const stage = stageRef.current;
    if (scroll && stage) {
      const r = stage.getBoundingClientRect();
      if (r.top < 0 || r.top > 80) {
        stage.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    }
  };

  // 始终调用最新的闭包，同时给文章区一个稳定引用，避免逐帧重渲染
  const gotoRef = React.useRef<(next: VtKey) => void>(() => {});
  gotoRef.current = (next: VtKey) => {
    setKey(next, true);
    play();
  };
  const handleGoto = React.useCallback((next: VtKey) => {
    gotoRef.current(next);
  }, []);

  const article = React.useMemo(
    () => <VtArticle onGoto={handleGoto} />,
    [handleGoto],
  );
  const readout = React.useMemo(() => <VtReadout model={model} />, [model]);

  React.useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onTabKey = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d === 0) return;
    e.preventDefault();
    const next = (index + d + TABS.length) % TABS.length;
    tabRefs.current[next]?.focus();
    setKey(TABS[next].key, false);
  };

  const onPlayClick = () => {
    if (playingRef.current) {
      stopAnim();
      return;
    }
    if (prog >= 1) {
      play();
      return;
    }
    playingRef.current = true;
    setPlaying(true);
    tStartRef.current = performance.now() - prog * RUN;
    rafRef.current = window.requestAnimationFrame(step);
  };

  const onSegmentCount = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopAnim();
    setN(Number(e.target.value));
    setProg(1);
  };

  const onAccel = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopAnim();
    setA(Number(e.target.value));
    setProg(1);
  };

  const playLabel = playing ? '停止动画' : prog >= 1 ? '播放动画' : '继续';

  return (
    <div className="vt-page">
      <div className="vt-wrap">
        <header>
          <p className="vt-eyebrow">高中物理 · 必修一 · 匀变速直线运动</p>
          <h1>v-t 图上的六个比例</h1>
          <p className="vt-lede">
            初速度为 0 的匀加速运动，在 <i>v-t</i> 图上就是
            <b>一条过原点的直线</b>：斜率是加速度 <i>a</i>
            ，图线与时间轴围出的面积是位移 <i>x</i>
            。六个推论全部从这两句话里长出来 ——
            切一个标签，看它在图上长成什么形状。
          </p>
          <div className="vt-thesis">
            <Tex display tex="v = at \qquad\quad x = \tfrac12 at^2 \qquad\quad v^2 = 2ax" />
          </div>
        </header>

        <section className="vt-stage" ref={stageRef}>
          <div className="vt-tabs" role="group" aria-label="选择要演示的推论">
            {TABS.map((tab, i) => (
              <React.Fragment key={tab.key}>
                {tab.group ? (
                  <span className="vt-tabgroup">{tab.group}</span>
                ) : null}
                <button
                  type="button"
                  className="vt-tab"
                  aria-pressed={tab.key === key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  onClick={() => setKey(tab.key, false)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {tab.label}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="vt-stage-body">
            <div className="vt-figwrap">
              <VtFigure model={model} prog={prog} />
            </div>
            {readout}
          </div>

          <div className="vt-controls">
            <div className="vt-ctl">
              <label htmlFor="vt-ctl-n">
                等分段数 <i>n</i>
              </label>
              <input
                id="vt-ctl-n"
                type="range"
                min={2}
                max={6}
                step={1}
                value={n}
                onChange={onSegmentCount}
              />
              <span className="vt-ctl-val">{n}</span>
            </div>
            <div className="vt-ctl">
              <label htmlFor="vt-ctl-a">
                加速度 <i>a</i>
              </label>
              <input
                id="vt-ctl-a"
                type="range"
                min={0.6}
                max={2}
                step={0.2}
                value={a}
                onChange={onAccel}
              />
              <span className="vt-ctl-val">{a.toFixed(1)}</span>
            </div>
            <button
              type="button"
              className="vt-btn vt-btn-primary"
              onClick={onPlayClick}
            >
              {playLabel}
            </button>
            <span className="vt-ctl vt-hint">
              拖动 <i>a</i>：数值全变，比值不变。
            </span>
          </div>
        </section>

        {article}
      </div>
    </div>
  );
};

export default VtRatioExplorer;

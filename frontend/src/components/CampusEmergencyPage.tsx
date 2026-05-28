import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { IconType } from 'react-icons';
import {
  FaVolumeUp,
  FaVolumeMute,
  FaUsb,
  FaWifi,
  FaKeyboard,
  FaShieldAlt,
  FaExclamationTriangle,
  FaDesktop,
  FaPhone,
  FaNetworkWired,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaBroadcastTower,
  FaCheckCircle,
} from 'react-icons/fa';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

interface Character {
  id: string;
  name: string;
  role: string;
  icon: IconType;
  status: string;
}

interface Instruction {
  id: string;
  text: string;
  keywords: string[];
  response: string;
}

const characters: Character[] = [
  { id: '1', name: '张盼', role: '终端巡检', icon: FaDesktop, status: '正在检查教师机显示状态' },
  { id: '2', name: '李林', role: '输入设备', icon: FaKeyboard, status: '正在核验键盘输入延迟' },
  { id: '3', name: '刘辉', role: '网络连通', icon: FaNetworkWired, status: '正在上报网络连接结果' },
  { id: '4', name: '孙博', role: '异常记录', icon: FaExclamationTriangle, status: '正在登记异常现象' },
];

const instructions: Instruction[] = [
  {
    id: '1',
    text: '立即启动三级流量过滤，检查 3389 端口状态',
    keywords: ['三级流量过滤', '3389'],
    response: '是，正在执行指令',
  },
  {
    id: '2',
    text: '所有学生检查本机网络连接，报告异常情况',
    keywords: ['网络连接', '异常情况'],
    response: '是，开始检查',
  },
  {
    id: '3',
    text: '准备 U 盘启动，执行紧急重启预案',
    keywords: ['U 盘启动', '紧急重启'],
    response: '是，准备执行',
  },
];

const CampusEmergencyPage: React.FC = () => {
  const [isAudioPlaying, setIsAudioPlaying] = useState(true);
  const [currentInstruction, setCurrentInstruction] = useState(0);
  const [showTypewriter, setShowTypewriter] = useState(false);
  const [deviceFailures, setDeviceFailures] = useState<string[]>([]);
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected'>('connected');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentInstruction((prev) => (prev + 1) % instructions.length);
      setShowTypewriter(true);
      window.setTimeout(() => setShowTypewriter(false), 2800);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const simulateDeviceFailure = (device: string) => {
    setDeviceFailures((prev) => Array.from(new Set([...prev, device])));
    window.setTimeout(() => {
      setDeviceFailures((prev) => prev.filter((item) => item !== device));
    }, 2400);
  };

  const currentInstructionItem = instructions[currentInstruction];

  return (
    <InfoQueryShell>
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="Campus Emergency Desk"
          title="校园紧急响应看板"
          description="用于模拟校园网络突发事件中的广播、学生响应、教师指令与设备状态。信息以看板方式呈现，便于快速扫描和演练。"
          icon={FaBroadcastTower}
          tone="amber"
          meta={(
            <>
              <InfoBadge tone="amber">广播演练</InfoBadge>
              <InfoBadge tone={networkStatus === 'connected' ? 'emerald' : 'rose'}>
                网络{networkStatus === 'connected' ? '正常' : '中断'}
              </InfoBadge>
              <InfoBadge tone={deviceFailures.length ? 'rose' : 'slate'}>
                设备异常 {deviceFailures.length}
              </InfoBadge>
            </>
          )}
          actions={(
            <InfoPrimaryButton tone="amber" onClick={() => setIsAudioPlaying((prev) => !prev)}>
              {isAudioPlaying ? <FaVolumeUp /> : <FaVolumeMute />}
              {isAudioPlaying ? '暂停广播' : '恢复广播'}
            </InfoPrimaryButton>
          )}
        />

        <InfoPanel compact className="border-rose-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-rose-50 text-rose-700 ring-1 ring-rose-100">
                {isAudioPlaying ? <FaVolumeUp /> : <FaVolumeMute />}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Live Broadcast</p>
                <p className="mt-2 text-base font-semibold leading-7 text-slate-950">
                  校内广播：请注意，校园网络遭恶意攻击，计算机社团学生请立刻前往教机室。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-1">
                {Array.from({ length: 8 }).map((_, index) => (
                  <motion.span
                    key={index}
                    className="w-1.5 rounded-full bg-amber-500"
                    animate={isAudioPlaying ? { height: [8, 24, 12, 20, 8], opacity: [0.45, 1, 0.75, 1, 0.45] } : { height: 8, opacity: 0.25 }}
                    transition={{ duration: 0.7, repeat: Infinity, delay: index * 0.08 }}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-slate-500">{new Date().toLocaleTimeString('zh-CN')}</span>
            </div>
          </div>
        </InfoPanel>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoMetricCard
            label="网络状态"
            value={networkStatus === 'connected' ? '已连接' : '已中断'}
            detail="点击状态卡片下方按钮可模拟切换"
            icon={FaWifi}
            tone={networkStatus === 'connected' ? 'emerald' : 'rose'}
          />
          <InfoMetricCard
            label="设备异常"
            value={deviceFailures.length}
            detail={deviceFailures.length ? deviceFailures.join('、') : '暂无异常'}
            icon={FaDesktop}
            tone={deviceFailures.length ? 'rose' : 'slate'}
          />
          <InfoMetricCard
            label="杀毒软件"
            value="正常"
            detail="基础防护状态在线"
            icon={FaShieldAlt}
            tone="emerald"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <InfoPanel>
              <InfoSectionTitle
                title="学生通信桥"
                description="按角色展示现场响应人员与当前处理动作。"
                icon={FaUserGraduate}
                tone="sky"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {characters.map((character, index) => {
                  const Icon = character.icon;
                  return (
                    <motion.div
                      key={character.id}
                      className="rounded-[24px] border border-slate-200 bg-white/82 p-4 shadow-sm"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                          <Icon />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-950">{character.name}</h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{character.role}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{character.status}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </InfoPanel>

            <InfoPanel>
              <InfoSectionTitle
                title="设备模拟"
                description="触发临时异常用于演练广播与排障响应。"
                icon={FaDesktop}
                tone="amber"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => simulateDeviceFailure('屏幕')}
                  className="rounded-[22px] border border-slate-200 bg-white/82 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <FaDesktop className="text-rose-600" />
                  <div className="mt-3 font-semibold text-slate-950">屏幕异常</div>
                  <p className="mt-1 text-sm text-slate-500">模拟显示设备失效</p>
                </button>
                <button
                  type="button"
                  onClick={() => simulateDeviceFailure('键盘')}
                  className="rounded-[22px] border border-slate-200 bg-white/82 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <FaKeyboard className="text-amber-600" />
                  <div className="mt-3 font-semibold text-slate-950">键盘异常</div>
                  <p className="mt-1 text-sm text-slate-500">模拟输入设备失效</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNetworkStatus((status) => status === 'connected' ? 'disconnected' : 'connected')}
                  className="rounded-[22px] border border-slate-200 bg-white/82 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <FaWifi className={networkStatus === 'connected' ? 'text-emerald-600' : 'text-rose-600'} />
                  <div className="mt-3 font-semibold text-slate-950">网络切换</div>
                  <p className="mt-1 text-sm text-slate-500">模拟连通或中断状态</p>
                </button>
              </div>
            </InfoPanel>
          </div>

          <div className="space-y-6">
            <InfoPanel>
              <InfoSectionTitle
                title="老师指令区"
                description="当前轮询指令与学生响应。"
                icon={FaChalkboardTeacher}
                tone="emerald"
              />
              <div className="rounded-[26px] border border-emerald-100 bg-emerald-50/70 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-white text-emerald-700 ring-1 ring-emerald-100">
                    <FaChalkboardTeacher />
                  </div>
                  <div className="min-w-0 flex-1">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentInstructionItem.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
                      >
                        {showTypewriter ? (
                          <TypewriterText text={currentInstructionItem.text} />
                        ) : (
                          <p className="text-lg font-semibold leading-8 text-slate-950">
                            {currentInstructionItem.text.split(' ').map((word) => (
                              <span
                                key={`${currentInstructionItem.id}-${word}`}
                                className={currentInstructionItem.keywords.some((keyword) => word.includes(keyword)) ? 'rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-800' : ''}
                              >
                                {word}{' '}
                              </span>
                            ))}
                          </p>
                        )}
                        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          <FaCheckCircle /> 学生回应：{currentInstructionItem.response}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </InfoPanel>

            <InfoPanel>
              <InfoSectionTitle
                title="紧急预案"
                description="执行前需确认现场人员与设备状态。"
                icon={FaUsb}
                tone="rose"
              />
              <button
                type="button"
                onClick={() => simulateDeviceFailure('U盘启动预案')}
                className="w-full rounded-[26px] border border-rose-200 bg-rose-50/85 p-5 text-left text-rose-800 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-white text-rose-700 ring-1 ring-rose-100">
                    <FaUsb />
                  </div>
                  <div>
                    <div className="text-lg font-semibold">U 盘启动 - 紧急重启</div>
                    <p className="mt-1 text-sm leading-6 opacity-85">点击执行演练记录，系统会短暂登记预案触发状态。</p>
                  </div>
                </div>
              </button>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/75 p-4 text-sm leading-6 text-slate-600">
                当前建议：先确认网络分段、端口状态与本机连接，再执行重启预案。
              </div>
            </InfoPanel>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {deviceFailures.length > 0 && (
          <motion.div
            className="fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-2.5rem))] rounded-[26px] border border-rose-200 bg-white/95 p-4 text-rose-800 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-1 shrink-0" />
              <div>
                <div className="font-semibold">异常状态登记</div>
                <p className="mt-1 text-sm leading-6">{deviceFailures.join('、')} 已触发，正在等待恢复。</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </InfoQueryShell>
  );
};

const TypewriterText: React.FC<{ text: string }> = ({ text }) => {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    setDisplayText('');
    let index = 0;
    const timer = window.setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index += 1;
      } else {
        window.clearInterval(timer);
      }
    }, 45);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <p className="text-lg font-semibold leading-8 text-slate-950">
      {displayText}
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="ml-1"
      >
        |
      </motion.span>
    </p>
  );
};

export default CampusEmergencyPage;

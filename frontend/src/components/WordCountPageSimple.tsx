import React, { useState, useCallback, useMemo, useEffect, useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StatItemProps {
    label: string;
    value: string;
    id: string;
    variants: any;
    index: number;
}

const StatItem: React.FC<StatItemProps> = React.memo(({ label, value, variants, index }) => (
    <motion.div
        key={label}
        className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl"
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.3, delay: index * 0.05 }}
    >
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</div>
        <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </motion.div>
));

StatItem.displayName = 'StatItem';

import {
  FaPlay,
  FaTrash,
  FaFont,
  FaPenFancy,
  FaKeyboard,
  FaHandPointer,
  FaChartPie,
  FaEraser,
  FaStar,
  FaCalculator
} from 'react-icons/fa';
import { useNotification } from './Notification';

interface WordCountStats {
    totalChars: number;
    totalLines: number;
    chineseChars: number;
    chinesePuncs: number;
    letterChars: number;
    wordCount: number;
    englishPuncs: number;
    numberChars: number;
}

const WordCountPageSimple: React.FC = () => {
    const { setNotification } = useNotification();
    const [text, setText] = useState('');
    const [, setCurrentYear] = useState(new Date().getFullYear());
    const [updateDate, setUpdateDate] = useState('');
    const [stats, setStats] = useState<WordCountStats>({
        totalChars: 0,
        totalLines: 0,
        chineseChars: 0,
        chinesePuncs: 0,
        letterChars: 0,
        wordCount: 0,
        englishPuncs: 0,
        numberChars: 0
    });

    const [error, submitAction, isCalculating] = useActionState(
        async (previousState: string | null, formData: FormData) => {
            const inputText = formData.get('text') as string;

            if (!inputText || !inputText.trim()) {
                setNotification({ message: '请输入需要统计的文字内容', type: 'warning' });
                return '请输入需要统计的文字内容';
            }

            try {
                await new Promise(resolve => setTimeout(resolve, 300));

                const newStats = calculateStats(inputText);
                setStats(newStats);
                setNotification({ message: '统计完成，结果如下', type: 'success' });
                return null;
            } catch (err) {
                const errorMessage = '统计过程中发生错误，请重试';
                setNotification({ message: errorMessage, type: 'error' });
                return errorMessage;
            }
        },
        null
    );

    useEffect(() => {
        const today = new Date();
        setCurrentYear(today.getFullYear());
        setUpdateDate(`${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`);

        document.title = stats.totalChars > 0
            ? `字数统计 - ${stats.totalChars.toLocaleString()}字 | 在线工具`
            : '在线字数统计工具 - 免费精准字符计算';

        const description = stats.totalChars > 0
            ? `已统计${stats.totalChars.toLocaleString()}字，${stats.chineseChars}中文字符，${stats.wordCount}单词。免费在线字数统计工具，支持中英文混合文本统计。`
            : '免费在线字数统计工具，精准统计中文字符、英文单词、标点符号、行数等。支持实时计算，保护隐私。';

        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.setAttribute('name', 'description');
            document.head.appendChild(metaDescription);
        }
        metaDescription.setAttribute('content', description);
    }, [stats]);

    const calculateStats = useCallback((inputText: string): WordCountStats => {
        if (!inputText.trim()) {
            return {
                totalChars: 0,
                totalLines: 0,
                chineseChars: 0,
                chinesePuncs: 0,
                letterChars: 0,
                wordCount: 0,
                englishPuncs: 0,
                numberChars: 0
            };
        }

        const lines = inputText.split('\n').filter(line => line.trim().length > 0);
        const totalLines = lines.length;
        const totalChars = inputText.length;

        const chineseRegex = /[一-鿿]/g;
        const chineseChars = (inputText.match(chineseRegex) || []).length;

        const chinesePuncRegex = /[，。！？；：""''（）【】《》]/g;
        const chinesePuncs = (inputText.match(chinesePuncRegex) || []).length;

        const letterRegex = /[a-zA-Z]/g;
        const letterChars = (inputText.match(letterRegex) || []).length;

        const wordRegex = /[a-zA-Z]+/g;
        const wordCount = (inputText.match(wordRegex) || []).length;

        const englishPuncRegex = /[.,!?;:'"()\[\]{}\/\\@#%&*+=|~`<>]/g;
        const englishPuncs = (inputText.match(englishPuncRegex) || []).length;

        const numberRegex = /\d/g;
        const numberChars = (inputText.match(numberRegex) || []).length;

        return {
            totalChars,
            totalLines,
            chineseChars,
            chinesePuncs,
            letterChars,
            wordCount,
            englishPuncs,
            numberChars
        };
    }, []);

    const handleClear = useCallback(() => {
        setText('');
        setStats({
            totalChars: 0,
            totalLines: 0,
            chineseChars: 0,
            chinesePuncs: 0,
            letterChars: 0,
            wordCount: 0,
            englishPuncs: 0,
            numberChars: 0
        });
        setNotification({ message: '您输入的内容已经清空', type: 'info' });
    }, [setNotification]);

    const formatNumber = useCallback((num: number): string => {
        return num.toLocaleString('zh-CN');
    }, []);

    const statsVariants = useMemo(() => ({
        hidden: { opacity: 0, scale: 0.95 },
        visible: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 }
    }), []);

    const features = useMemo(() => [
        '精准统计', '多种指标', '实时计算', '隐私保护'
    ], []);

    const usageSteps = useMemo(() => [
        { icon: FaKeyboard, title: '输入或粘贴文本', desc: '将您需要统计的内容输入或粘贴到上方的文本框中。' },
        { icon: FaHandPointer, title: '点击开始统计', desc: '点击"开始统计"按钮，工具将立即分析您的文本。' },
        { icon: FaChartPie, title: '查看详细结果', desc: '下方的结果区会即时显示总字数、行数、标点等八项详细数据。' },
        { icon: FaEraser, title: '清空开始新任务', desc: '点击"清空内容"按钮，可以方便地开始一次新的字数统计任务。' }
    ], []);

    const statItems = useMemo(() => [
        { label: '总字数', value: formatNumber(stats.totalChars), id: 'total-chars' },
        { label: '总行数（不含空行）', value: formatNumber(stats.totalLines), id: 'total-lines' },
        { label: '中文字数', value: formatNumber(stats.chineseChars), id: 'chinese-chars' },
        { label: '中文标点', value: formatNumber(stats.chinesePuncs), id: 'chinese-puncs' },
        { label: '字母个数', value: formatNumber(stats.letterChars), id: 'letter-chars' },
        { label: '单词个数', value: formatNumber(stats.wordCount), id: 'word-count' },
        { label: '英文标点', value: formatNumber(stats.englishPuncs), id: 'english-puncs' },
        { label: '数字个数', value: formatNumber(stats.numberChars), id: 'number-chars' }
    ], [stats, formatNumber]);

    return (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12 space-y-6">
            {/* Main tool card */}
            <motion.div
                className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
                <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

                <div className="relative">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        <FaCalculator className="text-[10px]" /> Word Count
                    </div>
                    <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                        在线字数统计工具
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                        精准高效的在线字数统计工具，支持统计文字、字符、单词、标点和数字，满足多种场景需求。
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {features.map((feature) => (
                            <span
                                key={feature}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"
                            >
                                <FaStar className="text-[9px] text-amber-400" />
                                {feature}
                            </span>
                        ))}
                        {updateDate && (
                            <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                更新：{updateDate}
                            </span>
                        )}
                    </div>

                    <div className="mt-8">
                        <motion.textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="h-48 w-full resize-y rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 md:h-64"
                            placeholder="在此输入或粘贴需要统计的文字…"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                        />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <motion.button
                            onClick={() => {
                                const formData = new FormData();
                                formData.append('text', text);
                                submitAction(formData);
                            }}
                            disabled={!text.trim() || isCalculating}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                            whileHover={{ scale: text.trim() && !isCalculating ? 1.01 : 1 }}
                            whileTap={{ scale: text.trim() && !isCalculating ? 0.99 : 1 }}
                        >
                            {isCalculating ? (
                                <>
                                    <motion.div
                                        className="h-4 w-4 rounded-full border-2 border-white border-t-transparent"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    />
                                    <span>统计中…</span>
                                </>
                            ) : (
                                <>
                                    <FaPlay className="text-[12px]" />
                                    <span>开始统计</span>
                                </>
                            )}
                        </motion.button>

                        <motion.button
                            onClick={handleClear}
                            disabled={!text.trim()}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                            whileHover={{ scale: text.trim() ? 1.01 : 1 }}
                            whileTap={{ scale: text.trim() ? 0.99 : 1 }}
                        >
                            <FaTrash className="text-[12px]" />
                            清空内容
                        </motion.button>
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.div
                                className="mt-6 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-5 py-4 text-sm leading-7 text-rose-700"
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                            >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-rose-500">错误</div>
                                <div className="mt-1">{error}</div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {(stats.totalChars > 0 || isCalculating) && (
                            <motion.div
                                className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.4 }}
                            >
                                {statItems.map((item, index) => (
                                    <StatItem
                                        key={item.id}
                                        label={item.label}
                                        value={item.value}
                                        id={item.id}
                                        variants={statsVariants}
                                        index={index}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* Rating row */}
            <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/88 px-5 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                    <div className="flex items-center gap-0.5 text-amber-400">
                        {[...Array(5)].map((_, i) => (
                            <FaStar key={i} className="text-[12px]" />
                        ))}
                    </div>
                    <span className="text-sm font-semibold text-slate-800">4.9 / 5</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">5,344 users</span>
                </div>
            </div>

            {/* Feature details */}
            <section className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                    工具功能详情
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/82 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            <FaFont className="text-slate-500" />
                            字数统计
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                            快速统计文本中的总字数，精确到每一个字符；同时提供总行数（不包含空行）的统计，方便评估文本长度与结构。
                        </p>
                    </div>

                    <div className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/82 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            <FaPenFancy className="text-slate-500" />
                            字符与单词统计
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                            详细区分汉字、英文字母、数字以及中英文标点符号的数量；特别提供单词个数（连续的英文字母序列）统计，满足学术写作需求。
                        </p>
                    </div>
                </div>
            </section>

            {/* Usage steps */}
            <section className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                    如何使用
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {usageSteps.map((step, index) => (
                        <div
                            key={index}
                            className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/82 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl"
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                                <step.icon className="text-lg" />
                            </div>
                            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                Step {index + 1}
                            </div>
                            <h3 className="mt-1 text-sm font-semibold text-slate-900">{step.title}</h3>
                            <p className="mt-2 text-xs leading-6 text-slate-600">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </section>
        </section>
    );
};

export default WordCountPageSimple;

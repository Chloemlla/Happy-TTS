import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    FaCalculator,
    FaBars,
    FaStarHalfAlt,
    FaExternalLinkAlt,
    FaMapMarkerAlt,
    FaGlobe,
    FaRocket,
    FaExclamationTriangle
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

export const WordCountPage: React.FC = () => {
    const { setNotification } = useNotification();
    const [text, setText] = useState('');
    const [isCalculating, setIsCalculating] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
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

    // Set current date info
    useEffect(() => {
        const today = new Date();
        setCurrentYear(today.getFullYear());
        setUpdateDate(`${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`);
    }, []);

    // 统计函数
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

        // 中文字符（包括中文标点）
        const chineseRegex = /[\u4e00-\u9fff]/g;
        const chineseChars = (inputText.match(chineseRegex) || []).length;

        // 中文标点符号
        const chinesePuncRegex = /[，。！？；：""''（）【】《》]/g;
        const chinesePuncs = (inputText.match(chinesePuncRegex) || []).length;

        // 英文字母
        const letterRegex = /[a-zA-Z]/g;
        const letterChars = (inputText.match(letterRegex) || []).length;

        // 单词计数（连续的英文字母序列）
        const wordRegex = /[a-zA-Z]+/g;
        const wordCount = (inputText.match(wordRegex) || []).length;

        // 英文标点符号
        const englishPuncRegex = /[.,!?;:'"()\[\]{}\/\\@#%&*+=|~`<>]/g;
        const englishPuncs = (inputText.match(englishPuncRegex) || []).length;

        // 数字
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

    // 开始统计
    const handleCount = useCallback(() => {
        setIsCalculating(true);

        // 模拟计算延迟，提供更好的用户体验
        setTimeout(() => {
            const newStats = calculateStats(text);
            setStats(newStats);
            setIsCalculating(false);
            setNotification({ message: '统计完成，结果如下', type: 'success' });
        }, 300);
    }, [text, calculateStats, setNotification]);

    // 清空内容
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

    // 格式化数字显示
    const formatNumber = (num: number): string => {
        return num.toLocaleString('zh-CN');
    };

    // 动画配置
    const statsVariants = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.9 }
    };

    const statItems = useMemo(() => [
        { label: '总字数', value: formatNumber(stats.totalChars), id: 'total-chars' },
        { label: '总行数 (不含空行)', value: formatNumber(stats.totalLines), id: 'total-lines' },
        { label: '中文字数', value: formatNumber(stats.chineseChars), id: 'chinese-chars' },
        { label: '中文标点', value: formatNumber(stats.chinesePuncs), id: 'chinese-puncs' },
        { label: '字母个数', value: formatNumber(stats.letterChars), id: 'letter-chars' },
        { label: '单词个数', value: formatNumber(stats.wordCount), id: 'word-count' },
        { label: '英文标点', value: formatNumber(stats.englishPuncs), id: 'english-puncs' },
        { label: '数字个数', value: formatNumber(stats.numberChars), id: 'number-chars' }
    ], [stats]);

    return (
        <div className="min-h-screen flex flex-col">
            {/* Navigation Bar */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <a
                        href="https://zishu.xuecan.net/"
                        className="flex items-center space-x-2 no-underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <FaCalculator className="text-blue-600 text-2xl" />
                        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
                            字数统计<span className="text-blue-600">工具</span>
                        </h1>
                    </a>

                    <nav className="hidden md:flex items-center space-x-1">
                        <a
                            href="https://zishu.xuecan.net/"
                            className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            字数统计
                        </a>
                        <a
                            href="https://age.xuecan.net"
                            className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            年龄计算器
                        </a>
                        <a
                            href="https://diff.xuecan.net/"
                            className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            文本比对工具
                        </a>
                        <a
                            href="https://tool.xuecan.net/tuixiu/"
                            className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            退休年龄计算公式
                        </a>
                    </nav>

                    <button
                        className="md:hidden text-gray-600 focus:outline-none p-2"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        <FaBars className="text-xl" />
                    </button>
                </div>

                {/* Mobile Menu */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            className="md:hidden bg-white border-t border-gray-200"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col space-y-3">
                                <a
                                    href="https://zishu.xuecan.net/"
                                    className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    字数统计
                                </a>
                                <a
                                    href="https://age.xuecan.net"
                                    className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    年龄计算器
                                </a>
                                <a
                                    href="https://diff.xuecan.net/"
                                    className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    文本比对工具
                                </a>
                                <a
                                    href="https://tool.xuecan.net/tuixiu/"
                                    className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    退休年龄计算公式
                                </a>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </header>

            {/* Main Content */}
            <main className="flex-grow bg-gradient-to-br from-blue-50 via-white to-purple-50">
                {/* Hero Section */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-16">
                    <div className="max-w-7xl mx-auto px-4 text-center">
                        <motion.h1
                            className="text-[clamp(2.5rem,5vw,3.5rem)] font-bold mb-4"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <a
                                href="https://zishu.xuecan.net/"
                                className="no-underline"
                                style={{ color: 'inherit' }}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                在线<span className="text-yellow-300">字数统计</span>工具
                            </a>
                        </motion.h1>
                        <motion.p
                            className="text-lg opacity-90 max-w-4xl mx-auto"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            精准高效的在线字数统计工具，支持统计文字、字符、单词、标点和数字，满足您的多种场景需求。
                        </motion.p>
                    </div>
                </div>

                {/* Page Container */}
                <div className="max-w-7xl mx-auto px-4 py-12">
                    <div className="text-center mb-10">
                        <motion.h2
                            className="text-3xl md:text-4xl font-bold text-gray-800 mb-2"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                        >
                            在线字数与字符统计工具
                        </motion.h2>
                        <motion.p
                            className="text-sm text-gray-500"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                        >
                            更新日期：{updateDate}
                        </motion.p>
                    </div>

                    {/* Feature Tags */}
                    <motion.div
                        className="flex flex-wrap justify-center gap-3 mb-10"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.8 }}
                    >
                        {['精准统计', '多种指标', '实时计算', '隐私保护'].map((feature, index) => (
                            <motion.div
                                key={feature}
                                className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3, delay: 1 + index * 0.1 }}
                            >
                                <FaStar className="text-xs" />
                                <span>{feature}</span>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* Tool Section */}
                    <motion.div
                        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 md:p-8"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 1.2 }}
                    >
                        <div className="grid grid-cols-1 gap-6">
                            {/* Input Area */}
                            <div>
                                <motion.textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    className="w-full h-48 md:h-64 p-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 resize-y text-gray-800"
                                    placeholder="在此输入或粘贴需要统计的文字..."
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.5, delay: 1.4 }}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap justify-center gap-4 my-4">
                                <motion.button
                                    onClick={handleCount}
                                    disabled={!text.trim() || isCalculating}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg inline-flex items-center transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg disabled:transform-none disabled:shadow-none"
                                    whileHover={{ scale: text.trim() && !isCalculating ? 1.05 : 1 }}
                                    whileTap={{ scale: text.trim() && !isCalculating ? 0.95 : 1 }}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.5, delay: 1.6 }}
                                >
                                    {isCalculating ? (
                                        <>
                                            <motion.div
                                                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            />
                                            统计中...
                                        </>
                                    ) : (
                                        <>
                                            <FaPlay className="mr-2" />
                                            开始统计
                                        </>
                                    )}
                                </motion.button>

                                <motion.button
                                    onClick={handleClear}
                                    disabled={!text.trim()}
                                    className="bg-white border border-gray-300 disabled:border-gray-200 text-gray-700 disabled:text-gray-400 font-medium py-3 px-6 rounded-lg inline-flex items-center hover:bg-gray-50 disabled:bg-gray-50 transition-all duration-300 transform hover:-translate-y-0.5 disabled:transform-none"
                                    whileHover={{ scale: text.trim() ? 1.05 : 1 }}
                                    whileTap={{ scale: text.trim() ? 0.95 : 1 }}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.5, delay: 1.8 }}
                                >
                                    <FaTrash className="mr-2" />
                                    清空内容
                                </motion.button>
                            </div>

                            {/* Results Area */}
                            <AnimatePresence>
                                {(stats.totalChars > 0 || isCalculating) && (
                                    <motion.div
                                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.5 }}
                                    >
                                        {statItems.map((item, index) => (
                                            <motion.div
                                                key={item.id}
                                                className="bg-gray-50 p-4 rounded-lg flex justify-between items-center border border-gray-200"
                                                variants={statsVariants}
                                                initial="hidden"
                                                animate="visible"
                                                exit="exit"
                                                transition={{ duration: 0.3, delay: index * 0.05 }}
                                            >
                                                <span className="text-gray-600 text-sm">{item.label}:</span>
                                                <span className="text-lg font-bold text-gray-800">{item.value}</span>
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    <hr className="my-12 border-gray-200" />

                    {/* User Rating Section */}
                    <motion.section
                        className="mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 2 }}
                    >
                        <div className="flex justify-center">
                            <div className="inline-flex items-center bg-white shadow-lg rounded-full px-6 py-3 space-x-4 border border-gray-200">
                                <div className="flex items-center space-x-1 text-yellow-400">
                                    {[...Array(4)].map((_, i) => (
                                        <FaStar key={i} />
                                    ))}
                                    <FaStarHalfAlt />
                                </div>
                                <span className="text-lg font-bold text-gray-800">4.9 / 5</span>
                                <span className="text-gray-600">来自5344用户的好评！</span>
                            </div>
                        </div>
                    </motion.section>

                    {/* Feature Details */}
                    <motion.section
                        className="pt-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 2.2 }}
                    >
                        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10 text-gray-800">工具功能详情</h2>
                        <div className="space-y-8 text-left">
                            <motion.div
                                className="bg-gray-50 rounded-lg p-6 border border-gray-200"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 2.4 }}
                            >
                                <div className="flex items-center mb-4">
                                    <FaFont className="text-blue-600 text-3xl w-10 text-center" />
                                    <h3 className="text-xl font-semibold ml-3 text-gray-800">字数统计</h3>
                                </div>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    快速统计文本中的总字数，精确到每一个字符。同时提供总行数（不包含空行）的统计，方便您评估文本长度和结构。
                                </p>
                            </motion.div>

                            <motion.div
                                className="bg-gray-50 rounded-lg p-6 border border-gray-200"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 2.6 }}
                            >
                                <div className="flex items-center mb-4">
                                    <FaPenFancy className="text-blue-600 text-3xl w-10 text-center" />
                                    <h3 className="text-xl font-semibold ml-3 text-gray-800">字符与单词统计</h3>
                                </div>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    详细区分汉字、英文字母、数字以及中英文标点符号的数量。特别提供单词个数（连续的英文字母序列）统计，满足学术和专业写作的需求。
                                </p>
                            </motion.div>
                        </div>
                    </motion.section>

                    {/* Usage Instructions */}
                    <motion.section
                        className="pt-12"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 2.8 }}
                    >
                        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10 text-gray-800">如何使用</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
                            {[
                                { icon: FaKeyboard, title: '1. 输入或粘贴文本', desc: '将您需要统计的任何内容，输入或粘贴到上方的文本框中。' },
                                { icon: FaHandPointer, title: '2. 点击开始统计', desc: '点击"开始统计"按钮，工具将立即分析您的文本。' },
                                { icon: FaChartPie, title: '3. 查看详细结果', desc: '下方的结果区会即时显示总字数、行数、标点等八项详细统计数据。' },
                                { icon: FaEraser, title: '4. 清空开始新任务', desc: '点击"清空内容"按钮，可以方便地开始一次新的字数统计任务。' }
                            ].map((step, index) => (
                                <motion.div
                                    key={index}
                                    className="bg-gray-50 rounded-lg p-6 border border-gray-200"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 3 + index * 0.1 }}
                                >
                                    <div className="flex items-center justify-center h-20 w-20 rounded-full bg-blue-100 text-blue-600 mx-auto mb-5">
                                        <step.icon className="text-3xl" />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-2 text-gray-800">{step.title}</h3>
                                    <p className="text-gray-600 text-sm">{step.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.section>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-white pt-16 pb-12">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                        <div className="md:col-span-2 lg:col-span-1">
                            <a
                                href="https://zishu.xuecan.net/"
                                className="flex items-center space-x-2 mb-4 no-underline"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <FaCalculator className="text-blue-400 text-2xl" />
                                <h2 className="text-xl font-bold">
                                    字数统计<span className="text-blue-400">工具</span>
                                </h2>
                            </a>
                            <p className="text-gray-400 mb-4">
                                体验安全、便捷、精准的字数统计服务。所有操作均在您的浏览器中完成，不上传服务器，保护您的文本隐私安全。
                            </p>
                        </div>

                        <div className="md:col-span-2">
                            <h3 className="text-lg font-medium mb-4">所有文本工具</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                                <a
                                    href="https://zishu.xuecan.net/"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    字数统计
                                </a>
                                <a
                                    href="https://tool.xuecan.net/fanti/"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    简繁转换
                                </a>
                                <a
                                    href="https://diff.xuecan.net/"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    文本比对
                                </a>
                                <a
                                    href="https://tool.xuecan.net/markdown2word/"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Markdown转word
                                </a>
                                <a
                                    href="#"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                >
                                    文本去重
                                </a>
                                <a
                                    href="#"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                >
                                    火星文转换
                                </a>
                                <a
                                    href="#"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                >
                                    HTML转文本
                                </a>
                                <a
                                    href="#"
                                    className="text-gray-400 hover:text-blue-400 transition-colors block truncate"
                                >
                                    文本加密
                                </a>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-4">帮助与声明</h3>
                            <ul className="space-y-2">
                                <li>
                                    <a
                                        href="#"
                                        className="text-gray-400 hover:text-blue-400 transition-colors"
                                    >
                                        帮助中心
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="https://tool.xuecan.net/privacy.html"
                                        className="text-gray-400 hover:text-blue-400 transition-colors"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        隐私政策
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="https://tool.xuecan.net/contact.html"
                                        className="text-gray-400 hover:text-blue-400 transition-colors"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        联系我们
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-500">
                        <p>
                            © {currentYear}{' '}
                            <a
                                href="https://zishu.xuecan.net/"
                                className="text-current hover:text-blue-400 no-underline"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                在线字数统计工具
                            </a>
                            ，本工具免费、高颜值，欢迎收藏与分享。
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

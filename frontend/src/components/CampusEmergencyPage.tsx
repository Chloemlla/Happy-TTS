import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaVolumeUp, FaVolumeMute, FaUsb, FaWifi, FaCommentSlash,
    FaKeyboard, FaMouse, FaShieldAlt, FaExclamationTriangle,
    FaDesktop, FaPhone, FaSoundcloud, FaNetworkWired
} from 'react-icons/fa';
import { WifiOff, Speech } from 'lucide-react';
interface Character {
    id: string;
    name: string;
    position: 'left' | 'right';
    avatar: string;
    currentAction?: string;
}

interface Instruction {
    id: string;
    text: string;
    keywords: string[];
    response: string;
}

const CampusEmergencyPage: React.FC = () => {
    // Audio and broadcast state
    const [isAudioPlaying, setIsAudioPlaying] = useState(true);
    const [currentScene, setCurrentScene] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);

    // Characters and interactions
    const [characters] = useState<Character[]>([
        { id: '1', name: '张盼', position: 'left', avatar: '👨‍💻' },
        { id: '2', name: '李林', position: 'right', avatar: '👩‍💻' },
        { id: '3', name: '刘辉', position: 'left', avatar: '🙋‍♂️' },
        { id: '4', name: '孙博', position: 'right', avatar: '😱' }
    ]);

    // Instructions and responses
    const [instructions] = useState<Instruction[]>([
        {
            id: '1',
            text: '立即启动三级流量过滤，检查3389端口状态',
            keywords: ['三级流量过滤', '3389端口'],
            response: '是！正在执行指令'
        },
        {
            id: '2',
            text: '所有学生检查本机网络连接，报告异常情况',
            keywords: ['网络连接', '异常情况'],
            response: '是！开始检查'
        },
        {
            id: '3',
            text: '准备U盘启动，执行紧急重启预案',
            keywords: ['U盘启动', '紧急重启'],
            response: '是！准备执行'
        }
    ]);

    const [currentInstruction, setCurrentInstruction] = useState(0);
    const [showTypewriter, setShowTypewriter] = useState(false);
    const [deviceFailures, setDeviceFailures] = useState<string[]>([]);
    const [networkStatus, setNetworkStatus] = useState('connected');
    const [antivirusStatus, setAntivirusStatus] = useState('normal');

    // Effects and animations
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentInstruction(prev => (prev + 1) % instructions.length);
            setShowTypewriter(true);
            setTimeout(() => setShowTypewriter(false), 3000);
        }, 5000);

        return () => clearInterval(timer);
    }, [instructions.length]);

    const toggleAudio = () => {
        setIsAudioPlaying(!isAudioPlaying);
    };

    const simulateDeviceFailure = (device: string) => {
        setDeviceFailures(prev => [...prev, device]);
        setTimeout(() => {
            setDeviceFailures(prev => prev.filter(d => d !== device));
        }, 2000);
    };

    const triggerNetworkChange = () => {
        setNetworkStatus(networkStatus === 'connected' ? 'disconnected' : 'connected');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 text-white overflow-hidden">
            {/* Broadcast Alert Bar */}
            <motion.div
                className="bg-red-600 text-yellow-300 p-4 relative overflow-hidden"
                animate={{
                    backgroundColor: ['#dc2626', '#ef4444', '#dc2626'],
                    boxShadow: ['0 0 20px #dc2626', '0 0 40px #ef4444', '0 0 20px #dc2626']
                }}
                transition={{ duration: 1, repeat: Infinity }}
            >
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <motion.button
                            onClick={toggleAudio}
                            className="text-2xl hover:scale-110 transition-transform"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            {isAudioPlaying ? <FaVolumeUp /> : <FaVolumeMute />}
                        </motion.button>

                        {/* Audio Visualization */}
                        <div className="flex items-center gap-1">
                            {[...Array(8)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="w-1 bg-yellow-300 rounded-full"
                                    animate={isAudioPlaying ? {
                                        height: [4, 20, 8, 16, 4],
                                        opacity: [0.5, 1, 0.7, 1, 0.5]
                                    } : { height: 4, opacity: 0.3 }}
                                    transition={{
                                        duration: 0.5,
                                        repeat: Infinity,
                                        delay: i * 0.1
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <motion.div
                        className="text-center flex-1 font-bold text-lg"
                        animate={{ opacity: [1, 0.7, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                    >
                        校内广播：请注意，紧急情况，校园网络遭恶意攻击，计算机社团学生请立刻前往教机室
                    </motion.div>

                    <div className="text-sm opacity-75">
                        {new Date().toLocaleTimeString()}
                    </div>
                </div>
            </motion.div>

            {/* Main Content Area */}
            <div className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Left Column - Bridge and Characters */}
                <div className="space-y-6">
                    {/* Communication Bridge */}
                    <motion.div
                        className="relative bg-gradient-to-b from-cyan-900/50 to-blue-900/50 rounded-2xl p-6 backdrop-blur-sm border border-cyan-500/30"
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h3 className="text-xl font-bold mb-4 text-cyan-300">学生通信桥</h3>

                        {/* Bridge Visualization */}
                        <div className="relative h-48 bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg overflow-hidden">
                            {/* Background Equipment */}
                            <div className="absolute inset-0 flex justify-between items-center p-4">
                                <div className="flex flex-col items-center gap-2">
                                    <Speech className="text-3xl text-green-400" />
                                    <span className="text-xs">发报机</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <FaPhone className="text-3xl text-blue-400" />
                                    <span className="text-xs">通信设备</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <FaNetworkWired className="text-3xl text-purple-400" />
                                    <span className="text-xs">网络设备</span>
                                </div>
                            </div>

                            {/* Bridge Structure */}
                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-32 h-8 bg-gradient-to-t from-gray-600 to-gray-400 rounded-t-full" />

                            {/* Characters on Bridge */}
                            <div className="absolute bottom-8 left-8">
                                <motion.div
                                    className="text-4xl"
                                    animate={{
                                        y: [0, -5, 0],
                                        rotate: [0, 5, 0, -5, 0]
                                    }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                >
                                    {characters[0].avatar}
                                </motion.div>
                                <div className="text-xs mt-1">{characters[0].name}</div>
                            </div>

                            <div className="absolute bottom-8 right-8">
                                <motion.div
                                    className="text-4xl"
                                    animate={{
                                        y: [0, -3, 0],
                                        x: [0, 2, 0, -2, 0]
                                    }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                    {characters[1].avatar}
                                </motion.div>
                                <div className="text-xs mt-1">{characters[1].name}</div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Student Reactions */}
                    <motion.div
                        className="bg-gradient-to-b from-purple-900/50 to-pink-900/50 rounded-2xl p-6 backdrop-blur-sm border border-purple-500/30"
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <h3 className="text-xl font-bold mb-4 text-purple-300">学生反应区</h3>

                        <div className="space-y-4">
                            {characters.map((char, index) => (
                                <motion.div
                                    key={char.id}
                                    className="flex items-center gap-3 p-3 bg-black/20 rounded-lg"
                                    whileHover={{ scale: 1.02 }}
                                >
                                    <div className="text-2xl">{char.avatar}</div>
                                    <div className="flex-1">
                                        <div className="font-semibold">{char.name}</div>
                                        <motion.div
                                            className="text-sm opacity-75"
                                            animate={{ opacity: [0.5, 1, 0.5] }}
                                            transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
                                        >
                                            {index === 0 && "正在拍打电机..."}
                                            {index === 1 && "快速敲击键盘..."}
                                            {index === 2 && "举手报告问题..."}
                                            {index === 3 && "检测到异常！"}
                                        </motion.div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        {index === 0 && (
                                            <motion.button
                                                onClick={() => simulateDeviceFailure('screen')}
                                                className="p-2 bg-red-500/20 rounded hover:bg-red-500/40 transition-colors"
                                                whileTap={{ scale: 0.9 }}
                                            >
                                                <FaDesktop />
                                            </motion.button>
                                        )}
                                        {index === 1 && (
                                            <motion.button
                                                onClick={() => simulateDeviceFailure('keyboard')}
                                                className="p-2 bg-yellow-500/20 rounded hover:bg-yellow-500/40 transition-colors"
                                                whileTap={{ scale: 0.9 }}
                                            >
                                                <FaKeyboard />
                                            </motion.button>
                                        )}
                                        {index === 2 && (
                                            <motion.button
                                                onClick={triggerNetworkChange}
                                                className="p-2 bg-blue-500/20 rounded hover:bg-blue-500/40 transition-colors"
                                                whileTap={{ scale: 0.9 }}
                                            >
                                                {networkStatus === 'connected' ? <FaWifi /> : <WifiOff />}
                                            </motion.button>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Right Column - Instructions and Status */}
                <div className="space-y-6">
                    {/* Teacher Instructions */}
                    <motion.div
                        className="bg-gradient-to-b from-green-900/50 to-emerald-900/50 rounded-2xl p-6 backdrop-blur-sm border border-green-500/30"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.1 }}
                    >
                        <h3 className="text-xl font-bold mb-4 text-green-300">老师指令区</h3>

                        <div className="flex items-start gap-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-2xl">
                                👨‍🏫
                            </div>

                            <div className="flex-1">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={currentInstruction}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="bg-black/30 rounded-lg p-4"
                                    >
                                        {showTypewriter ? (
                                            <TypewriterText text={instructions[currentInstruction].text} />
                                        ) : (
                                            <div className="text-lg">
                                                {instructions[currentInstruction].text.split(' ').map((word, i) => (
                                                    <span
                                                        key={i}
                                                        className={instructions[currentInstruction].keywords.some(k => word.includes(k)) ? 'bg-yellow-500/30 px-1 rounded' : ''}
                                                    >
                                                        {word}{' '}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <motion.div
                                            className="mt-2 text-sm text-green-300"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 2 }}
                                        >
                                            学生回应：{instructions[currentInstruction].response}
                                        </motion.div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>

                    {/* System Status */}
                    <motion.div
                        className="bg-gradient-to-b from-orange-900/50 to-red-900/50 rounded-2xl p-6 backdrop-blur-sm border border-orange-500/30"
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                    >
                        <h3 className="text-xl font-bold mb-4 text-orange-300">系统状态监控</h3>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Network Status */}
                            <div className="bg-black/20 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    {networkStatus === 'connected' ?
                                        <FaWifi className="text-green-400" /> :
                                        <WifiOff className="text-red-400" />
                                    }
                                    <span className="text-sm">网络状态</span>
                                </div>
                                <motion.div
                                    className={`w-3 h-3 rounded-full ${networkStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 1, repeat: Infinity }}
                                />
                            </div>

                            {/* Antivirus Status */}
                            <div className="bg-black/20 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <FaShieldAlt className={antivirusStatus === 'normal' ? 'text-green-400' : 'text-red-400'} />
                                    <span className="text-sm">杀毒软件</span>
                                </div>
                                <motion.div
                                    className={`w-3 h-3 rounded-full ${antivirusStatus === 'normal' ? 'bg-green-400' : 'bg-red-400'}`}
                                    animate={antivirusStatus === 'alert' ? {
                                        backgroundColor: ['#ef4444', '#fbbf24', '#ef4444'],
                                        scale: [1, 1.2, 1]
                                    } : {}}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                />
                            </div>

                            {/* Device Failures */}
                            <div className="col-span-2 bg-black/20 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <FaExclamationTriangle className="text-yellow-400" />
                                    <span className="text-sm">设备状态</span>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {deviceFailures.map((device, index) => (
                                        <motion.span
                                            key={index}
                                            className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs"
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0 }}
                                        >
                                            {device}失效
                                        </motion.span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Emergency Actions */}
                    <motion.div
                        className="bg-gradient-to-b from-red-900/50 to-pink-900/50 rounded-2xl p-6 backdrop-blur-sm border border-red-500/30"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                    >
                        <h3 className="text-xl font-bold mb-4 text-red-300">紧急预案</h3>

                        <div className="space-y-4">
                            <motion.button
                                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg p-4 flex items-center justify-center gap-3 transition-all"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                animate={{
                                    boxShadow: ['0 0 20px rgba(59, 130, 246, 0.5)', '0 0 40px rgba(147, 51, 234, 0.5)', '0 0 20px rgba(59, 130, 246, 0.5)']
                                }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                >
                                    <FaUsb className="text-2xl" />
                                </motion.div>
                                <span className="font-bold">U盘启动 - 紧急重启</span>
                            </motion.button>

                            <div className="text-sm text-center opacity-75">
                                点击执行紧急重启预案
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Device Failure Overlays */}
            <AnimatePresence>
                {deviceFailures.includes('screen') && (
                    <motion.div
                        className="fixed inset-0 bg-red-500/20 pointer-events-none z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, repeat: 3 }}
                    />
                )}

                {deviceFailures.includes('keyboard') && (
                    <motion.div
                        className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="text-6xl font-mono text-green-400 opacity-50">
                            {Array.from({ length: 20 }, (_, i) => (
                                <motion.span
                                    key={i}
                                    animate={{ opacity: [0, 1, 0] }}
                                    transition={{ duration: 0.1, repeat: Infinity, delay: i * 0.05 }}
                                >
                                    {String.fromCharCode(65 + Math.floor(Math.random() * 26))}
                                </motion.span>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// Typewriter Effect Component
const TypewriterText: React.FC<{ text: string }> = ({ text }) => {
    const [displayText, setDisplayText] = useState('');

    useEffect(() => {
        setDisplayText(''); // Reset display text when text changes
        let i = 0;
        const timer = setInterval(() => {
            if (i < text.length) {
                setDisplayText(text.slice(0, i + 1));
                i++;
            } else {
                clearInterval(timer);
            }
        }, 50);

        return () => clearInterval(timer);
    }, [text]);

    return (
        <div className="text-lg">
            {displayText}
            <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="ml-1"
            >
                |
            </motion.span>
        </div>
    );
};

export default CampusEmergencyPage;

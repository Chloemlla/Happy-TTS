import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useTts } from '../hooks/useTts';
import { TtsRequest, TtsResponse } from '../types/tts';

interface TtsFormProps {
    onSuccess?: (result: TtsResponse) => void;
}

export const TtsForm: React.FC<TtsFormProps> = ({ onSuccess }) => {
    const [text, setText] = useState('');
    const [model, setModel] = useState('tts-1-hd');
    const [voice, setVoice] = useState('nova');
    const [outputFormat, setOutputFormat] = useState('mp3');
    const [speed, setSpeed] = useState(1.0);
    const [customFileName, setCustomFileName] = useState('');
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(false);
    const [cooldownTime, setCooldownTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const { generateSpeech, loading, error: ttsError, audioUrl } = useTts();

    const voices = [
        { id: 'alloy', name: 'Alloy' },
        { id: 'echo', name: 'Echo' },
        { id: 'fable', name: 'Fable' },
        { id: 'onyx', name: 'Onyx' },
        { id: 'nova', name: 'Nova' },
        { id: 'shimmer', name: 'Shimmer' }
    ];

    useEffect(() => {
        // 检查本地存储中的冷却时间
        const savedCooldown = localStorage.getItem('ttsCooldown');
        if (savedCooldown) {
            const cooldownEnd = parseInt(savedCooldown);
            if (cooldownEnd > Date.now()) {
                startCooldown(cooldownEnd - Date.now());
            }
        }
    }, []);

    useEffect(() => {
        if (audioUrl) {
            if (audioRef.current) {
                audioRef.current.src = audioUrl;
                audioRef.current.load();
            }
        }
    }, [audioUrl]);

    const startCooldown = (duration: number) => {
        setCooldown(true);
        setCooldownTime(Math.ceil(duration / 1000));
        
        localStorage.setItem('ttsCooldown', (Date.now() + duration).toString());

        const timer = setInterval(() => {
            setCooldownTime(prev => {
                if (prev <= 1) {
                    setCooldown(false);
                    clearInterval(timer);
                    localStorage.removeItem('ttsCooldown');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (cooldown) {
            setError(`请等待 ${cooldownTime} 秒后再试`);
            return;
        }

        if (!text) {
            setError('请输入要转换的文本');
            return;
        }

        try {
            const request: TtsRequest = {
                text,
                model,
                voice,
                output_format: outputFormat,
                speed
            };

            const result = await generateSpeech(request);

            if (onSuccess) {
                onSuccess(result);
            }
        } catch (error: any) {
            if (error.status === 429) {
                startCooldown(10000);
                setError('请求过于频繁，请等待10秒后再试');
            } else {
                setError(error.message || '转换失败');
            }
        }
    };

    const handlePlayPause = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
    };

    // 合并本地错误和 TTS 错误
    const displayError = error || ttsError;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl mx-auto p-8 bg-white rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300"
        >
            <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                    <label className="block text-gray-700 text-lg font-semibold mb-3">
                        输入文本
                    </label>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300"
                        rows={4}
                        placeholder="请输入要转换的文本..."
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <label className="block text-gray-700 text-lg font-semibold mb-3">
                            模型
                        </label>
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundSize: '1.5em 1.5em'
                            }}
                        >
                            <option value="tts-1">TTS-1</option>
                            <option value="tts-1-hd">TTS-1-HD</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-gray-700 text-lg font-semibold mb-3">
                            声音
                        </label>
                        <select
                            value={voice}
                            onChange={(e) => setVoice(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundSize: '1.5em 1.5em'
                            }}
                        >
                            {voices.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-gray-700 text-lg font-semibold mb-3">
                            输出格式
                        </label>
                        <select
                            value={outputFormat}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundSize: '1.5em 1.5em'
                            }}
                        >
                            <option value="mp3">MP3</option>
                            <option value="opus">Opus</option>
                            <option value="aac">AAC</option>
                            <option value="flac">FLAC</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-gray-700 text-lg font-semibold mb-3">
                            语速
                        </label>
                        <div className="relative">
                            <input
                                type="range"
                                value={speed}
                                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="text-center text-gray-600 mt-2 font-medium">{speed}x</div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-gray-700 text-lg font-semibold mb-3">
                        自定义文件名（可选）
                    </label>
                    <input
                        type="text"
                        value={customFileName}
                        onChange={(e) => setCustomFileName(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300"
                        placeholder="输入自定义文件名..."
                    />
                </div>

                <AnimatePresence>
                    {displayError && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="p-4 bg-red-100 text-red-700 rounded-xl border-2 border-red-200"
                        >
                            {displayError}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex flex-col space-y-4">
                    <motion.button
                        type="submit"
                        disabled={loading || cooldown}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                        {!loading && !cooldown && '转换文本'}
                        {loading && '转换中...'}
                        {cooldown && `冷却中 (${cooldownTime}秒)`}
                    </motion.button>

                    {audioUrl && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-center space-x-4"
                        >
                            <audio
                                ref={audioRef}
                                onEnded={handleAudioEnded}
                                className="hidden"
                            />
                            <motion.button
                                type="button"
                                onClick={handlePlayPause}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="flex items-center justify-center w-12 h-12 bg-blue-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
                            >
                                {isPlaying ? (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </motion.button>
                        </motion.div>
                    )}
                </div>
            </form>
        </motion.div>
    );
};

export default TtsForm; 
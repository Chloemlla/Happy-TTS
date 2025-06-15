import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useTts } from '../hooks/useTts';

interface TtsFormProps {
    onSuccess?: (result: any) => void;
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

    const { generateSpeech, isConverting } = useTts();

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
            const result = await generateSpeech({
                text,
                model,
                voice,
                output_format: outputFormat as any,
                speed
            });

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

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-gray-700 text-sm font-bold mb-2">
                        输入文本
                    </label>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        rows={4}
                        placeholder="请输入要转换的文本..."
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            模型
                        </label>
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="tts-1">TTS-1</option>
                            <option value="tts-1-hd">TTS-1-HD</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            声音
                        </label>
                        <select
                            value={voice}
                            onChange={(e) => setVoice(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {voices.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            输出格式
                        </label>
                        <select
                            value={outputFormat}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="mp3">MP3</option>
                            <option value="opus">Opus</option>
                            <option value="aac">AAC</option>
                            <option value="flac">FLAC</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            语速
                        </label>
                        <input
                            type="range"
                            value={speed}
                            onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            className="w-full"
                        />
                        <div className="text-center text-gray-600">{speed}x</div>
                    </div>
                </div>

                <div>
                    <label className="block text-gray-700 text-sm font-bold mb-2">
                        自定义文件名（可选）
                    </label>
                    <input
                        type="text"
                        value={customFileName}
                        onChange={(e) => setCustomFileName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="输入自定义文件名..."
                    />
                </div>

                {error && (
                    <div className="p-4 bg-red-100 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isConverting || cooldown}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {!isConverting && !cooldown && '转换文本'}
                    {isConverting && '转换中...'}
                    {cooldown && `冷却中 (${cooldownTime}秒)`}
                </button>
            </form>
        </motion.div>
    );
};

export default TtsForm; 
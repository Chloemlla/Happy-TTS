import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTts } from '../hooks/useTts';
import { TtsRequest, TtsResponse } from '../types/tts';
import { AudioPreview } from './AudioPreview';

interface TtsFormProps {
    onSuccess?: (result: TtsResponse) => void;
}

export const TtsForm: React.FC<TtsFormProps> = ({ onSuccess }) => {
    const [text, setText] = useState('');
    const [model, setModel] = useState('tts-1-hd');
    const [voice, setVoice] = useState('nova');
    const [outputFormat, setOutputFormat] = useState('mp3');
    const [speed, setSpeed] = useState(1.0);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(false);
    const [cooldownTime, setCooldownTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const { generateSpeech, loading, error: ttsError, audioUrl: ttsAudioUrl } = useTts();

    const voices = [
        { id: 'alloy', name: 'Alloy' },
        { id: 'echo', name: 'Echo' },
        { id: 'fable', name: 'Fable' },
        { id: 'onyx', name: 'Onyx' },
        { id: 'nova', name: 'Nova' },
        { id: 'shimmer', name: 'Shimmer' }
    ];

    useEffect(() => {
        const savedCooldown = localStorage.getItem('ttsCooldown');
        if (savedCooldown) {
            const cooldownEnd = parseInt(savedCooldown);
            if (cooldownEnd > Date.now()) {
                startCooldown(cooldownEnd - Date.now());
            }
        }
    }, []);

    useEffect(() => {
        if (ttsAudioUrl) {
            setAudioUrl(ttsAudioUrl);
        }
    }, [ttsAudioUrl]);

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

    const handleDownload = () => {
        if (audioUrl) {
            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `tts-${Date.now()}.${outputFormat}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const displayError = error || ttsError;

    return (
        <div className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <input
                            type="range"
                            min="0.25"
                            max="4.0"
                            step="0.25"
                            value={speed}
                            onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <div className="text-center text-gray-600 mt-2">
                            {speed}x
                        </div>
                    </div>
                </div>

                {displayError && (
                    <div className="text-red-500 text-sm">{displayError}</div>
                )}

                <div className="flex space-x-4">
                    <button
                        type="submit"
                        disabled={loading || cooldown}
                        className={`flex-1 py-3 px-6 rounded-xl text-white font-semibold transition-all duration-200 ${
                            loading || cooldown
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-600'
                        }`}
                    >
                        {loading ? '生成中...' : cooldown ? `请等待 ${cooldownTime} 秒` : '生成语音'}
                    </button>

                    {audioUrl && (
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="flex items-center justify-center px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            下载
                        </button>
                    )}
                </div>
            </form>

            {audioUrl && (
                <AudioPreview
                    audioUrl={audioUrl}
                    onClose={() => setAudioUrl(null)}
                />
            )}
        </div>
    );
};

export default TtsForm; 
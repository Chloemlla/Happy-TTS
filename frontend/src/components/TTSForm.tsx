import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTts } from '../hooks/useTts';
import { TtsRequest, TtsResponse } from '../types/tts';
import { AudioPreview } from './AudioPreview';
import { Notification } from './Notification';
import { Input } from './ui';

interface TtsFormProps {
    onSuccess?: (result: TtsResponse) => void;
    userId?: string;
    isAdmin?: boolean;
}

export const TtsForm: React.FC<TtsFormProps> = ({ onSuccess, userId, isAdmin }) => {
    const [text, setText] = useState('');
    const [model, setModel] = useState('tts-1-hd');
    const [voice, setVoice] = useState('nova');
    const [outputFormat, setOutputFormat] = useState('mp3');
    const [speed, setSpeed] = useState(1.0);
    const [generationCode, setGenerationCode] = useState('');
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(false);
    const [cooldownTime, setCooldownTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [notification, setNotification] = useState<{
        message: string;
        type: 'success' | 'error' | 'warning' | 'info';
    } | null>(null);

    const { generateSpeech, loading, error: ttsError, audioUrl: ttsAudioUrl } = useTts();

    const voices = [
        { id: 'alloy', name: 'Alloy' },
        { id: 'echo', name: 'Echo' },
        { id: 'fable', name: 'Fable' },
        { id: 'onyx', name: 'Onyx' },
        { id: 'nova', name: 'Nova' },
        { id: 'shimmer', name: 'Shimmer' }
    ];

    const MAX_TEXT_LENGTH = 4096;

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

        if (!generationCode) {
            setError('请输入生成码');
            return;
        }

        try {
            const request: TtsRequest = {
                text,
                model,
                voice,
                outputFormat: outputFormat,
                speed,
                userId,
                isAdmin,
                customFileName: `tts-${Date.now()}`,
                generationCode
            };

            const result = await generateSpeech(request);
            
            if (result.isDuplicate) {
                setNotification({
                    message: '检测到重复内容，已返回已有音频。请注意：重复提交相同内容可能导致账号被封禁。',
                    type: 'warning'
                });
            } else {
                setNotification({
                    message: '语音生成成功',
                    type: 'success'
                });
            }

            if (onSuccess) {
                onSuccess(result);
            }
        } catch (error: any) {
            console.error('TTS生成错误:', error);
            
            if (error.message.includes('封禁')) {
                setNotification({
                    message: error.message,
                    type: 'error'
                });
            } else if (error.message.includes('网络连接错误')) {
                setNotification({
                    message: '网络连接错误，请检查网络连接后重试',
                    type: 'error'
                });
            } else if (error.message.includes('超时')) {
                setNotification({
                    message: '请求超时，请稍后重试',
                    type: 'error'
                });
            } else if (error.message.includes('生成码无效')) {
                const match = error.message.match(/提供的生成码: (.*?), 期望的生成码: (.*?)$/);
                const providedCode = match ? match[1] : '无';
                const expectedCode = match ? match[2] : '无';
                
                setNotification({
                    message: `生成码验证失败`,
                    type: 'error'
                });
            } else {
                setNotification({
                    message: error.message || '生成失败，请稍后重试',
                    type: 'error'
                });
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
        <div className="relative">
            <AnimatePresence>
                {notification && (
                    <motion.div
                        className="absolute -top-4 left-0 right-0 z-50"
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Notification
                            message={notification.message}
                            type={notification.type}
                            onClose={() => setNotification(null)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.form 
                onSubmit={handleSubmit} 
                className="space-y-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                >
                    <motion.label 
                        className="block text-gray-700 text-lg font-semibold mb-3"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                    >
                        输入文本
                    </motion.label>
                    <motion.textarea
                        value={text}
                        onChange={(e) => {
                            const newText = e.target.value;
                            if (newText.length <= MAX_TEXT_LENGTH) {
                                setText(newText);
                            }
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 bg-white"
                        rows={4}
                        placeholder="请输入要转换的文本..."
                        whileFocus={{ scale: 1.01 }}
                    />
                    <motion.div 
                        className="text-right text-sm text-gray-500 mt-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.5 }}
                    >
                        {text.length}/{MAX_TEXT_LENGTH} 字符
                    </motion.div>
                </motion.div>

                <motion.div 
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                >
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                    >
                        <motion.label 
                            className="block text-gray-700 text-lg font-semibold mb-3"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.6 }}
                        >
                            模型
                        </motion.label>
                        <motion.select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundSize: '1.5em 1.5em'
                            }}
                            whileFocus={{ scale: 1.01 }}
                        >
                            <option value="tts-1">TTS-1</option>
                            <option value="tts-1-hd">TTS-1-HD</option>
                        </motion.select>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.6 }}
                    >
                        <motion.label 
                            className="block text-gray-700 text-lg font-semibold mb-3"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.7 }}
                        >
                            声音
                        </motion.label>
                        <motion.select
                            value={voice}
                            onChange={(e) => setVoice(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundSize: '1.5em 1.5em'
                            }}
                            whileFocus={{ scale: 1.01 }}
                        >
                            {voices.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </motion.select>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.7 }}
                    >
                        <motion.label 
                            className="block text-gray-700 text-lg font-semibold mb-3"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.8 }}
                        >
                            输出格式
                        </motion.label>
                        <motion.select
                            value={outputFormat}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300 appearance-none bg-white bg-no-repeat bg-right pr-10"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundSize: '1.5em 1.5em'
                            }}
                            whileFocus={{ scale: 1.01 }}
                        >
                            <option value="mp3">MP3</option>
                            <option value="opus">Opus</option>
                            <option value="aac">AAC</option>
                            <option value="flac">FLAC</option>
                        </motion.select>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.8 }}
                    >
                        <motion.label 
                            className="block text-gray-700 text-lg font-semibold mb-3"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.9 }}
                        >
                            语速
                        </motion.label>
                        <motion.input
                            type="range"
                            min="0.25"
                            max="4.0"
                            step="0.25"
                            value={speed}
                            onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            className="w-full"
                            whileHover={{ scale: 1.02 }}
                        />
                        <motion.div 
                            className="text-center text-gray-600 mt-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 1.0 }}
                        >
                            {speed}x
                        </motion.div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.9 }}
                    >
                        <motion.label 
                            className="block text-gray-700 text-lg font-semibold mb-3"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 1.0 }}
                        >
                            生成码
                            <span className="text-red-500 ml-1">*</span>
                        </motion.label>
                        <motion.input
                            type="password"
                            value={generationCode}
                            onChange={(e) => setGenerationCode(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300"
                            placeholder="请输入生成码..."
                            required
                            whileFocus={{ scale: 1.01 }}
                        />
                        <motion.p 
                            className="text-sm text-gray-500 mt-1"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 1.1 }}
                        >
                            生成码用于验证您的身份，请确保输入正确
                        </motion.p>
                    </motion.div>
                </motion.div>

                <AnimatePresence>
                    {displayError && (
                        <motion.div 
                            className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3"
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            transition={{ duration: 0.3 }}
                        >
                            {displayError}
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div 
                    className="flex space-x-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 1.0 }}
                >
                    <motion.button
                        type="submit"
                        disabled={loading || cooldown}
                        className={`flex-1 py-3 px-6 rounded-xl text-white font-semibold transition-all duration-200 ${
                            loading || cooldown
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
                        }`}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {loading ? (
                            <motion.div className="flex items-center justify-center">
                                <motion.div 
                                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                />
                                生成中...
                            </motion.div>
                        ) : cooldown ? (
                            `请等待 ${cooldownTime} 秒`
                        ) : (
                            '生成语音'
                        )}
                    </motion.button>

                    <AnimatePresence>
                        {audioUrl && (
                            <motion.button
                                type="button"
                                onClick={handleDownload}
                                className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                whileHover={{ scale: 1.05, y: -1 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <motion.svg 
                                    className="w-5 h-5 mr-2" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                    whileHover={{ scale: 1.1 }}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </motion.svg>
                                下载
                            </motion.button>
                        )}
                    </AnimatePresence>
                </motion.div>
            </motion.form>

            <AnimatePresence>
                {audioUrl && (
                    <motion.div
                        className="mt-6"
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
                    >
                        <AudioPreview
                            audioUrl={audioUrl}
                            onClose={() => setAudioUrl(null)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TtsForm; 
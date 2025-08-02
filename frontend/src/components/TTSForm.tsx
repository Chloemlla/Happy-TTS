import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTts } from '../hooks/useTts';
import { TtsRequest, TtsResponse } from '../types/tts';
import { AudioPreview } from './AudioPreview';
import { Input } from './ui';
import { useNotification } from './Notification';
import { FaLock, FaDownload, FaTimes } from 'react-icons/fa';

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
    const { setNotification } = useNotification();
    const [cfToken, setCfToken] = useState<string>('');
    const [cfVerified, setCfVerified] = useState(false);
    const [cfError, setCfError] = useState(false);
    const [cfHidden, setCfHidden] = useState(false);
    const [cfInstanceId, setCfInstanceId] = useState(0);
    const [cfLoading, setCfLoading] = useState(true);
    const turnstileRef = useRef<HTMLDivElement>(null);

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

    // 默认关闭人机验证，只有明确设置为 'true' 时才启用
    const enableTurnstile = import.meta.env.VITE_ENABLE_TURNSTILE === 'true';

    // 设置全局Turnstile回调函数
    useEffect(() => {
        // 定义全局回调函数
        (window as any).turnstileCallback = (token: string) => {
            handleCfVerify(token);
        };
        
        (window as any).turnstileExpiredCallback = () => {
            handleCfExpire();
        };
        
        (window as any).turnstileErrorCallback = () => {
            handleCfError();
        };

        // 清理函数
        return () => {
            delete (window as any).turnstileCallback;
            delete (window as any).turnstileExpiredCallback;
            delete (window as any).turnstileErrorCallback;
        };
    }, []);

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

    // 只负责渲染，不再插入script
    useEffect(() => {
        setCfLoading(true);
        const sitekey = '0x4AAAAAABkocXH4KiqcoV1a';
        if (turnstileRef.current && (window as any).turnstile) {
            try {
                // 官方隐式渲染方式
                (window as any).turnstile.render(turnstileRef.current, {
                    sitekey,
                    theme: 'light',
                    size: 'normal',
                    callback: (token: string) => handleCfVerify(token),
                    'expired-callback': () => handleCfExpire(),
                    'error-callback': () => handleCfError(),
                });
                setCfError(false);
            } catch (error) {
                setCfError(true);
            }
        } else {
            setCfError(true);
        }
        setCfLoading(false);
        // eslint-disable-next-line
    }, [cfInstanceId]);

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

        // 只有在启用人机验证时才检查验证状态
        if (enableTurnstile && (!cfVerified || !cfToken)) {
            setError('请完成人机验证');
            return;
        }

        // 验证通过后隐藏验证组件
        setCfHidden(true);

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
                generationCode,
                // 只有在启用人机验证时才发送 cfToken
                ...(enableTurnstile && { cfToken })
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

            // 生成成功后重置验证状态，为下一次生成做准备
            resetCfVerification();

            if (onSuccess) {
                onSuccess(result);
            }
        } catch (error: any) {
            console.error('TTS生成错误:', error);
            
            // 生成失败时重置验证状态，允许用户重新验证
            resetCfVerification();
            
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
            } else if (error.message.includes('人机验证失败')) {
                setNotification({
                    message: '人机验证失败，请重新验证',
                    type: 'error'
                });
            } else {
                setNotification({
                    message: error.message || '生成失败，请稍后重试',
                    type: 'error'
                });
            }
        } finally {
            // 每次提交后都重置cf验证状态并强制刷新cf-turnstile
            resetCfVerification();
            setCfInstanceId(id => id + 1);
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

    const handleCfVerify = (token: string) => {
        setCfToken(token);
        setCfVerified(true);
        setCfError(false);
        setCfHidden(false); // 确保验证组件可见
    };

    const handleCfExpire = () => {
        setCfToken('');
        setCfVerified(false);
        setCfError(false);
        setCfHidden(false); // 过期时显示验证组件
    };

    const handleCfError = () => {
        setCfToken('');
        setCfVerified(false);
        setCfError(true);
        setCfHidden(false); // 错误时显示验证组件
    };

    // 重置验证状态，用于下一次生成
    const resetCfVerification = () => {
        setCfToken('');
        setCfVerified(false);
        setCfError(false);
        setCfHidden(false);
    };

    return (
        <div className="relative">
            <AnimatePresence>
                {/* 所有 setNotification({ message, type }) 保持不变，直接调用 context */}
                {/* 删除 notification 渲染相关代码 */}
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

                {/* 人机验证区域（可选） */}
                {enableTurnstile && (
                    <div>
                        <AnimatePresence>
                            {!cfHidden && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20, height: 0 }}
                                    transition={{ duration: 0.5, delay: 1.0 }}
                                >
                                    <motion.label 
                                        className="block text-gray-700 text-lg font-semibold mb-3"
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: 1.1 }}
                                    >
                                        人机验证
                                        <span className="text-red-500 ml-1">*</span>
                                    </motion.label>
                                    {/* 只保留官方Turnstile组件，无任何装饰样式 */}
                                    <div>
                                        <div
                                            className="cf-turnstile"
                                            data-sitekey="0x4AAAAAABkocXH4KiqcoV1a"
                                            // data-theme="light"
                                            // data-callback="turnstileCallback"
                                            // data-expired-callback="turnstileExpiredCallback"
                                            // data-error-callback="turnstileErrorCallback"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {/* 验证失败提示 */}
                        <AnimatePresence>
                            {cfError && (
                                <motion.div
                                    className="flex items-center justify-center bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-3 shadow-sm"
                                    initial={{ opacity: 0, scale: 0.8, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.8, y: -10 }}
                                    transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
                                >
                                    <div className="flex flex-col items-center space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-6 h-6 bg-gradient-to-r from-red-400 to-pink-500 rounded-full flex items-center justify-center">
                                                <FaTimes className="w-4 h-4 text-white" />
                                            </div>
                                            <span className="text-red-700 font-medium">验证失败，请重试</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCfError(false);
                                                    setCfLoading(true);
                                                    setCfInstanceId(id => id + 1);
                                                }}
                                                className="mt-2 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                            >
                                                重试
                                            </button>
                                        </div>
                                        {/* 详细错误信息打印 */}
                                        {cfError && typeof cfError === 'object' && (
                                            <pre className="mt-2 text-xs text-red-500 bg-red-100 rounded p-2 max-w-xl overflow-x-auto">
                                                {JSON.stringify(cfError, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        
                        {/* 安全验证说明 */}
                        <motion.div
                            className="flex items-center justify-center space-x-2 text-sm text-gray-600 mt-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 1.3 }}
                        >
                            <FaLock className="w-4 h-4 text-blue-500" />
                            <span>请完成人机验证以证明您是人类用户，保护系统免受自动化攻击</span>
                        </motion.div>
                    </div>
                )}

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
                                <motion.div whileHover={{ scale: 1.1 }}>
                                    <FaDownload className="w-5 h-5 mr-2" />
                                </motion.div>
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
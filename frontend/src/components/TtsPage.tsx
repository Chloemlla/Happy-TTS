import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTts } from '../hooks/useTts';
import { useAuth } from '../hooks/useAuth';
import { TtsForm } from './TTSForm';
import { TtsResponse } from '../types/tts';
import { useDomProtection } from '../hooks/useDomProtection';
import { FaVolumeUp, FaDownload, FaPlay, FaPause, FaInfoCircle, FaShieldAlt } from 'react-icons/fa';

export const TtsPage: React.FC = () => {
    const { user } = useAuth();
    const {
        loading,
        error,
        audioUrl,
        generateSpeech
    } = useTts();
    

    const [isPlaying, setIsPlaying] = useState(false);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

    // 只对静态内容区域启用 DOM 防篡改保护
    const noticeRef = useDomProtection('legal-notice');

    const handleSuccess = useCallback((result: TtsResponse) => {
        // 处理成功后的逻辑
        if (audioElement) {
            audioElement.pause();
            setIsPlaying(false);
        }
    }, [audioElement]);
    
    const togglePlayPause = useCallback(() => {
        if (!audioUrl) return;
        
        if (!audioElement) {
            const audio = new Audio(audioUrl);
            audio.onended = () => setIsPlaying(false);
            audio.onpause = () => setIsPlaying(false);
            audio.onplay = () => setIsPlaying(true);
            setAudioElement(audio);
            audio.play();
        } else {
            if (isPlaying) {
                audioElement.pause();
            } else {
                audioElement.play();
            }
        }
    }, [audioUrl, audioElement, isPlaying]);
    
    const handleDownload = useCallback(() => {
        if (audioUrl) {
            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `tts-${Date.now()}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [audioUrl]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 rounded-3xl">
            <div className="max-w-7xl mx-auto px-4 space-y-8">
                {/* 优化的标题和使用须知部分 */}
                <motion.div 
                    className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                        <div className="text-center">
                            <motion.div 
                                className="flex items-center justify-center gap-3 mb-4"
                                initial={{ scale: 0.9 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                <FaVolumeUp className="text-4xl" />
                                <h1 className="text-4xl font-bold">文本转语音</h1>
                            </motion.div>
                            <motion.p 
                                className="text-blue-100 text-lg"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.4 }}
                            >
                                将您的文本转换为自然流畅的语音
                            </motion.p>
                        </div>
                    </div>
                    
                    <div className="p-6">
                        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                            <FaInfoCircle className="text-blue-600" />
                            <span className="font-semibold text-gray-800">使用须知与联系方式</span>
                        </div>
                        
                        <div
                            ref={noticeRef as React.RefObject<HTMLDivElement>}
                            className="space-y-4"
                        >
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <FaShieldAlt className="text-red-600" />
                                            <h3 className="text-red-700 font-semibold">使用须知</h3>
                                        </div>
                                        <div className="space-y-3 text-sm text-red-700">
                                            <div>
                                                <p className="font-medium mb-2">1. 禁止生成违法违规内容：</p>
                                                <ul className="list-disc list-inside ml-4 space-y-1">
                                                    <li>政治敏感、民族歧视内容</li>
                                                    <li>色情、暴力、恐怖主义内容</li>
                                                    <li>侵犯知识产权内容</li>
                                                    <li>虚假信息或误导性内容</li>
                                                </ul>
                                            </div>
                                            <div>
                                                <p className="font-medium mb-2">2. 违规处理措施：</p>
                                                <ul className="list-disc list-inside ml-4 space-y-1">
                                                    <li>立即停止服务并封禁账号</li>
                                                    <li>配合执法部门调查</li>
                                                    <li>提供使用记录和生成内容</li>
                                                    <li>保留追究法律责任权利</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                        <h3 className="text-blue-700 font-semibold mb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                            联系我们
                                        </h3>
                                        <p className="text-blue-700 text-sm">
                                            如有任何问题或建议，请联系开发者：
                                            <a
                                                href="mailto:admin@hapxs.com"
                                                className="font-medium hover:text-blue-800 transition-colors duration-200 ml-1 underline"
                                            >
                                                admin@hapxs.com
                                            </a>
                                         </p>
                                    </div>
                        </div>
                    </div>
                </motion.div>

                {/* 优化的表单和音频预览部分 */}
                <div className="flex flex-col xl:flex-row gap-8">
                    <motion.div 
                        className="flex-1"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                    >
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                            <TtsForm
                                onSuccess={handleSuccess}
                                userId={user?.id}
                                isAdmin={user?.role === 'admin'}
                            />
                            <AnimatePresence>
                                {error && (
                                    <motion.div 
                                        className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                                        </svg>
                                        {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {audioUrl && (
                            <motion.div 
                                className="flex-1 xl:max-w-md"
                                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                                transition={{ duration: 0.5 }}
                            >
                                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 sticky top-8">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-blue-500"></div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <FaVolumeUp className="text-green-600" />
                                        音频预览
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <audio 
                                                controls 
                                                className="w-full"
                                                onPlay={() => setIsPlaying(true)}
                                                onPause={() => setIsPlaying(false)}
                                                onEnded={() => setIsPlaying(false)}
                                            >
                                                <source src={audioUrl} type="audio/mpeg" />
                                                您的浏览器不支持音频播放
                                            </audio>
                                        </div>
                                        <div className="flex gap-3">
                                            <motion.button
                                                onClick={togglePlayPause}
                                                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 px-4 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                {isPlaying ? <FaPause /> : <FaPlay />}
                                                {isPlaying ? '暂停' : '播放'}
                                            </motion.button>
                                            <motion.button
                                                onClick={handleDownload}
                                                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <FaDownload />
                                                下载
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
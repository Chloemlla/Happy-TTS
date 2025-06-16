import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AudioPreviewProps {
    audioUrl: string | null;
    onClose?: () => void;
}

export const AudioPreview: React.FC<AudioPreviewProps> = ({ audioUrl, onClose }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (audioUrl && audioRef.current) {
            setIsLoading(true);
            // 重置状态
            setCurrentTime(0);
            setDuration(0);
            setIsPlaying(false);
            
            // 加载新的音频文件
            audioRef.current.load();
            
            // 监听加载完成事件
            const handleLoadedMetadata = () => {
                if (audioRef.current) {
                    setDuration(audioRef.current.duration);
                    setIsLoading(false);
                }
            };

            audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
            
            return () => {
                if (audioRef.current) {
                    audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
                }
            };
        }
    }, [audioUrl]);

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
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

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (!audioUrl) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 shadow-lg"
            >
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={handlePlayPause}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
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
                            </button>
                            <div className="flex items-center space-x-2">
                                <span className="text-sm">{formatTime(currentTime)}</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={duration || 0}
                                    value={currentTime}
                                    onChange={handleSeek}
                                    className="w-64 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-sm">{formatTime(duration)}</span>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="flex space-x-1">
                                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                    <button
                                        key={rate}
                                        onClick={() => setPlaybackRate(rate)}
                                        className={`px-2 py-1 rounded text-sm ${
                                            playbackRate === rate ? 'bg-white/20' : 'hover:bg-white/10'
                                        }`}
                                    >
                                        {rate}x
                                    </button>
                                ))}
                            </div>
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-white/10 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                        </div>
                    )}
                </div>
                <audio
                    ref={audioRef}
                    src={audioUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                />
            </motion.div>
        </AnimatePresence>
    );
}; 
import React from 'react';
import { useTts } from '../hooks/useTts';
import { useAuth } from '../hooks/useAuth';
import { TtsForm } from './TTSForm';
import { LegalNotice } from './LegalNotice';
import { TtsResponse } from '../types/tts';
import Footer from './Footer';
import { useDomProtection } from '../hooks/useDomProtection';

export const TtsPage: React.FC = () => {
    const { user } = useAuth();
    const { 
        loading,
        error,
        audioUrl,
        generateSpeech
    } = useTts();

    // 只对静态内容区域启用 DOM 防篡改保护
    const noticeRef = useDomProtection('legal-notice');

    const handleSuccess = (result: TtsResponse) => {
        // 可以在这里处理成功后的逻辑
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 space-y-8">
                {/* 标题和使用须知部分 */}
                <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">文本转语音</h1>
                        <p className="text-gray-600 mb-4">将您的文本转换为自然流畅的语音</p>
                    </div>
                    <div ref={noticeRef as React.RefObject<HTMLDivElement>} className="border-t border-gray-200 pt-4">
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-3">
                            <h3 className="text-red-700 font-semibold mb-2">使用须知</h3>
                            <div className="space-y-2">
                                <p className="text-red-700 text-sm">
                                    1. 禁止生成任何违反国家法律法规的内容，包括但不限于：
                                </p>
                                <ul className="list-disc list-inside text-red-700 text-sm ml-4 space-y-1">
                                    <li>涉及政治敏感、民族歧视的内容</li>
                                    <li>色情、暴力、恐怖主义相关内容</li>
                                    <li>侵犯他人知识产权的内容</li>
                                    <li>虚假信息或误导性内容</li>
                                </ul>
                                <p className="text-red-700 text-sm mt-2">
                                    2. 如发现违规内容，我们将：
                                </p>
                                <ul className="list-disc list-inside text-red-700 text-sm ml-4 space-y-1">
                                    <li>立即停止服务并封禁相关账号</li>
                                    <li>配合公安机关和政府调查</li>
                                    <li>提供相关使用记录和生成内容</li>
                                    <li>保留追究法律责任的权利</li>
                                </ul>
                            </div>
                        </div>
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                            <h3 className="text-blue-700 font-semibold mb-2">联系我们</h3>
                            <p className="text-blue-700 text-sm">
                                如有任何问题或建议，请联系开发者：
                                <a 
                                    href="mailto:admin@hapxs.com" 
                                    className="font-medium hover:text-blue-800 transition-colors duration-200 ml-1"
                                >
                                    admin@hapxs.com
                                </a>
                            </p>
                        </div>
                    </div>
                </div>

                {/* 表单和音频预览部分 */}
                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="flex-1">
                        <div className="bg-white rounded-2xl shadow-lg p-6 relative">
                            <TtsForm
                                onSuccess={handleSuccess}
                            />
                            {error && (
                                <div className="text-red-500 mt-4">{error}</div>
                            )}
                        </div>
                    </div>

                    {audioUrl && (
                        <div className="flex-1">
                            <div className="bg-white rounded-2xl shadow-lg p-6">
                                <div className="space-y-4">
                                    <audio controls className="w-full">
                                        <source src={audioUrl} type="audio/mpeg" />
                                        您的浏览器不支持音频播放
                                    </audio>
                                    <button
                                        onClick={() => window.open(audioUrl, '_blank')}
                                        className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
                                    >
                                        下载音频
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}; 
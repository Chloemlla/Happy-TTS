import React from 'react';
import { motion } from 'framer-motion';
import { AuthForm } from './AuthForm';

export const WelcomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            欢迎使用 OpenAI TTS
          </h1>
          <p className="text-xl text-gray-600">
            将您的文本转换为自然流畅的语音
          </p>
        </motion.div>

        <div className="max-w-md mx-auto mb-8">
          <AuthForm />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">高质量语音</h3>
            <p className="text-gray-600">使用 OpenAI 最新的 TTS 技术，生成自然流畅的语音</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">多种声音选择</h3>
            <p className="text-gray-600">提供多种声音选项，满足不同场景需求</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">简单易用</h3>
            <p className="text-gray-600">直观的界面设计，轻松上手使用</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}; 
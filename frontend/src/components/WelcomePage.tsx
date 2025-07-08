import React from 'react';
import { motion } from 'framer-motion';
import { AuthForm } from './AuthForm';
import Footer from './Footer';

export const WelcomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, type: 'spring', stiffness: 100 }}
          className="text-center mb-8"
        >
          <motion.h1
            className="text-4xl font-bold text-gray-900 mb-4"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 200 }}
          >
            欢迎使用 Synapse
          </motion.h1>
          <motion.p
            className="text-gray-600"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            使用最新的语音合成技术，生成自然流畅的语音
          </motion.p>
        </motion.div>

        <motion.div
          className="max-w-md mx-auto mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, type: 'spring', stiffness: 120 }}
        >
          <AuthForm />
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.15
              }
            }
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {[{
            title: '高质量语音',
            desc: '使用 OpenAI 最新的 TTS 技术，生成自然流畅的语音'
          }, {
            title: '多种声音选择',
            desc: '提供多种声音选项，满足不同场景需求'
          }, {
            title: '简单易用',
            desc: '直观的界面设计，轻松上手使用'
          }].map((item, idx) => (
            <motion.div
              key={item.title}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 + idx * 0.15, type: 'spring', stiffness: 200 }}
              whileHover={{ scale: 1.04, y: -2 }}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-gray-600">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}; 
import React from 'react';
import { motion } from 'framer-motion';
import { AuthForm } from './AuthForm';
import Footer from './Footer';
import { useNotification } from './Notification';
import { FaVolumeUp, FaStar, FaUsers, FaRocket } from 'react-icons/fa';

export const WelcomePage: React.FC = () => {
  const { setNotification } = useNotification();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 rounded-3xl">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* 统一的标题头部 */}
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
                <h1 className="text-4xl font-bold">欢迎使用 Synapse</h1>
              </motion.div>
              <motion.p 
                className="text-blue-100 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                使用最新的语音合成技术，生成自然流畅的语音
              </motion.p>
            </div>
          </div>
          
          {/* 登录表单区域 */}
          <div className="p-6">
            <motion.div
              className="max-w-md mx-auto"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, type: 'spring', stiffness: 120 }}
            >
              <AuthForm setNotification={setNotification} />
            </motion.div>
          </div>
        </motion.div>

        {/* 功能特色卡片 */}
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
            desc: '使用 OpenAI 最新的 TTS 技术，生成自然流畅的语音',
            icon: FaStar
          }, {
            title: '多种声音选择',
            desc: '提供多种声音选项，满足不同场景需求',
            icon: FaUsers
          }, {
            title: '简单易用',
            desc: '直观的界面设计，轻松上手使用',
            icon: FaRocket
          }].map((item, idx) => (
            <motion.div
              key={item.title}
              className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 hover:shadow-2xl transition-all duration-300"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 + idx * 0.15, type: 'spring', stiffness: 200 }}
              whileHover={{ scale: 1.04, y: -2 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <item.icon className="text-2xl text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              </div>
              <p className="text-gray-600">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
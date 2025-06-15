import React, { useState } from 'react';
import axios from 'axios';
import AudioPreview from './components/AudioPreview';
import WelcomeToast from './components/WelcomeToast';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [text, setText] = useState('');
  const [model, setModel] = useState('tts-1-hd');
  const [voice, setVoice] = useState('nova');
  const [outputFormat, setOutputFormat] = useState('mp3');
  const [speed, setSpeed] = useState(1.0);
  const [customFileName, setCustomFileName] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [showEmail, setShowEmail] = useState(true);

  const convertText = async () => {
    if (!text) {
      setError('请输入要转换的文本');
      return;
    }

    setIsConverting(true);
    setError('');
    setAudioUrl('');

    try {
      const response = await axios.post('/api/tts', {
        text,
        model,
        voice,
        output_format: outputFormat,
        speed,
        custom_file_name: customFileName
      });

      setAudioUrl(`/finish/${response.data.fileName}`);
    } catch (error: any) {
      setError(error.response?.data?.error || '转换失败');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <WelcomeToast />
      <div className="container mx-auto px-4 py-8">
        {/* 顶部导航栏 */}
        <motion.nav
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="bg-white/80 backdrop-blur-lg shadow-lg rounded-lg mb-8"
        >
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between h-16">
              <motion.div
                className="flex items-center"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Synapse
                </span>
              </motion.div>
              <div className="flex items-center space-x-4">
                <motion.a
                  href="https://tts-terms-of-use.happys.icu/"
                  className="text-gray-600 hover:text-indigo-600"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  服务条款
                </motion.a>
                <motion.a
                  href="https://github.com/Happy-clo/OpenAI-TTS-Gradio/"
                  className="text-gray-600 hover:text-indigo-600"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  GitHub
                </motion.a>
              </div>
            </div>
          </div>
        </motion.nav>

        {/* 主要内容区域 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-lg rounded-xl shadow-xl p-8"
        >
          <motion.h1
            className="text-4xl font-bold text-gray-900 mb-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            文本转语音
          </motion.h1>

          {/* 使用须知 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-8 p-6 bg-red-50 rounded-lg border border-red-200"
          >
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <svg className="h-5 w-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-gray-600">
                  <h3 className="font-medium text-red-600 mb-2">使用须知</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-gray-700 mb-1">1. 禁止内容</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-600">
                        <li>违反国家法律法规的内容</li>
                        <li>涉及政治敏感、民族歧视的内容</li>
                        <li>色情、暴力、恐怖主义相关内容</li>
                        <li>侵犯他人知识产权的内容</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-700 mb-1">2. 数据使用</h4>
                      <p className="text-gray-600">
                        根据《中华人民共和国网络安全法》等相关法律法规，本网站将在政府或公安机关依法要求时提供用户使用记录、生成内容等数据。
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-700 mb-1">3. 使用规范</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-600">
                        <li>请合理使用服务，避免频繁请求</li>
                        <li>生成内容仅用于合法用途</li>
                        <li>遵守相关法律法规和平台规则</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-700 mb-1">4. 免责声明</h4>
                      <p className="text-gray-600">
                        用户因使用本服务产生的任何问题，本网站不承担法律责任。本网站保留对违规用户采取法律措施的权利。
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 开发者邮箱提示框 */}
              <AnimatePresence>
                {showEmail && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 p-3 bg-white rounded-lg border border-gray-200 relative"
                  >
                    <button
                      onClick={() => setShowEmail(false)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm text-gray-600">开发者邮箱：admin@hapxs.com</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          
          {/* 文本输入区域 */}
          <motion.div
            className="mb-8"
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="text">
              输入文本
            </label>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              rows={4}
              placeholder="请输入要转换的文本..."
            />
          </motion.div>

          {/* 设置选项 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* 模型选择 */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <label className="block text-gray-700 text-sm font-bold mb-2">
                模型
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              >
                <option value="tts-1">TTS-1</option>
                <option value="tts-1-hd">TTS-1-HD</option>
              </select>
            </motion.div>

            {/* 声音选择 */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <label className="block text-gray-700 text-sm font-bold mb-2">
                声音
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              >
                <option value="alloy">Alloy</option>
                <option value="echo">Echo</option>
                <option value="fable">Fable</option>
                <option value="onyx">Onyx</option>
                <option value="nova">Nova</option>
                <option value="shimmer">Shimmer</option>
              </select>
            </motion.div>

            {/* 输出格式 */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <label className="block text-gray-700 text-sm font-bold mb-2">
                输出格式
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              >
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
                <option value="aac">AAC</option>
                <option value="flac">FLAC</option>
              </select>
            </motion.div>

            {/* 语速调节 */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
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
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-center text-gray-600 mt-2">{speed}x</div>
            </motion.div>
          </div>

          {/* 自定义文件名 */}
          <motion.div
            className="mb-8"
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="customFileName">
              自定义文件名（可选）
            </label>
            <input
              type="text"
              id="customFileName"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              placeholder="输入自定义文件名..."
            />
          </motion.div>

          {/* 转换按钮 */}
          <motion.button
            onClick={convertText}
            disabled={isConverting}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 px-6 rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isConverting ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                转换中...
              </div>
            ) : (
              '开始转换'
            )}
          </motion.button>

          {/* 错误信息 */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-red-100 text-red-700 rounded-xl"
            >
              {error}
            </motion.div>
          )}

          {/* 音频预览 */}
          {audioUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8"
            >
              <AudioPreview audioUrl={audioUrl} format={outputFormat} />
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default App; 
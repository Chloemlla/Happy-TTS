// 此组件已在 App.tsx 中通过 React.lazy 实现懒加载
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

interface CaseConverterProps {}

const CaseConverter: React.FC<CaseConverterProps> = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isEnglish, setIsEnglish] = useState(false);
  const [showOriginalOutput, setShowOriginalOutput] = useState(false);
  const [addOriginalToDict, setAddOriginalToDict] = useState(false);

  // 中英文文案
  const t = {
    title: isEnglish ? 'Case Converter' : '字母大小写转换',
    subtitle: isEnglish ? 'Convert text case formats easily' : '轻松转换文本大小写格式',
    inputPlaceholder: isEnglish ? 'Paste your text here...' : '请把你需要转换的内容粘贴在这里',
    outputLabel: isEnglish ? 'Result:' : '新文本框显示结果：',
    originalOutput: isEnglish ? 'No' : '否',
    addToDict: isEnglish ? 'Add original to dictionary:' : '添加原样输出词库：',
    copy: isEnglish ? 'Copy' : '复制',
    cut: isEnglish ? 'Cut' : '剪切',
    clear: isEnglish ? 'Clear' : '清空',
    backToHome: isEnglish ? 'Back to Home' : '返回首页',
    language: isEnglish ? '中文' : 'English',
    
    // 转换功能
    functions: {
      uppercase: isEnglish ? 'UPPERCASE' : '全大写',
      lowercase: isEnglish ? 'lowercase' : '全小写',
      firstUpper: isEnglish ? 'First Letter Upper' : '首字母大写',
      firstLower: isEnglish ? 'first letter lower' : '首字母小写',
      sentenceCase: isEnglish ? 'Sentence case' : '句子首字母大写',
      titleCase: isEnglish ? 'Title Case' : '标题大小写',
      spaceToUnderscore: isEnglish ? 'Space → Underscore' : '空格→下划线',
      underscoreToCamel: isEnglish ? 'Underscore & Space → Camel' : '下划线&空格→驼峰',
      camelToUnderscore: isEnglish ? 'Camel → Underscore' : '驼峰→下划线',
      camelToSpace: isEnglish ? 'Camel → Space' : '驼峰→空格',
      spaceToDash: isEnglish ? 'Space → Dash' : '空格→中横线',
      underscoreToDash: isEnglish ? 'Underscore → Dash' : '下划线→中横线',
      dashToUnderscore: isEnglish ? 'Dash → Underscore' : '中横线→下划线',
      underscoreToSpace: isEnglish ? 'Underscore → Space' : '下划线→空格',
      underscoreToDot: isEnglish ? 'Underscore → Dot' : '下划线→小数点',
      dotToUnderscore: isEnglish ? 'Dot → Underscore' : '小数点→下划线',
      spaceToNewline: isEnglish ? 'Space → Newline' : '空格→换行',
      newlineToSpace: isEnglish ? 'Newline → Space' : '换行→空格',
      removeSymbols: isEnglish ? 'Remove Symbols' : '清除符号',
      removeSpaces: isEnglish ? 'Remove Spaces' : '清除空格',
      removeNewlines: isEnglish ? 'Remove Newlines' : '清除换行'
    },

    // 提示信息
    tips: {
      firstLetterTip: isEnglish ? 'First letter uppercase only works when there is a space before the English word' : '首字母转大写仅在英文单词前有空格的情况下才有效',
      sentenceTip: isEnglish ? 'Sentence case only works for the first word after symbols ".!?:"' : '每句首字母大写仅在符号".!?:"后的第一个单词有效',
      titleTip: isEnglish ? 'Title case currently has limited uppercase abbreviation dictionary, feedback is welcome' : '标题大小写目前的全大写缩写词库还比较少，大家可以反馈提交',
      copied: isEnglish ? 'Copied to clipboard!' : '已复制到剪贴板！',
      cleared: isEnglish ? 'Text cleared!' : '文本已清空！'
    }
  };

  // 转换函数
  const convertCase = (type: string) => {
    if (!inputText.trim()) return;

    let result = '';
    switch (type) {
      case 'uppercase':
        result = inputText.toUpperCase();
        break;
      case 'lowercase':
        result = inputText.toLowerCase();
        break;
      case 'firstUpper':
        result = inputText.replace(/\b\w/g, (char) => char.toUpperCase());
        break;
      case 'firstLower':
        result = inputText.replace(/\b\w/g, (char) => char.toLowerCase());
        break;
      case 'sentenceCase':
        result = inputText.toLowerCase().replace(/(^|\.\s+|!\s+|\?\s+)\w/g, (match) => match.toUpperCase());
        break;
      case 'titleCase':
        const minorWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as', 'so', 'yet', 'off', 'if', 'per', 'via', 'out'];
        result = inputText.toLowerCase().replace(/\b\w+/g, (word, index, string) => {
          if (index === 0 || index + word.length === string.length) {
            return word.charAt(0).toUpperCase() + word.slice(1);
          }
          return minorWords.includes(word) ? word : word.charAt(0).toUpperCase() + word.slice(1);
        });
        break;
      case 'spaceToUnderscore':
        result = inputText.replace(/\s+/g, '_');
        break;
      case 'underscoreToCamel':
        result = inputText.replace(/[_\s]+(.)/g, (_, char) => char.toUpperCase()).replace(/^(.)/, (_, char) => char.toLowerCase());
        break;
      case 'camelToUnderscore':
        result = inputText.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        break;
      case 'camelToSpace':
        result = inputText.replace(/([A-Z])/g, ' $1').replace(/^ /, '');
        break;
      case 'spaceToDash':
        result = inputText.replace(/\s+/g, '-');
        break;
      case 'underscoreToDash':
        result = inputText.replace(/_/g, '-');
        break;
      case 'dashToUnderscore':
        result = inputText.replace(/-/g, '_');
        break;
      case 'underscoreToSpace':
        result = inputText.replace(/_/g, ' ');
        break;
      case 'underscoreToDot':
        result = inputText.replace(/_/g, '.');
        break;
      case 'dotToUnderscore':
        result = inputText.replace(/\./g, '_');
        break;
      case 'spaceToNewline':
        result = inputText.replace(/\s+/g, '\n');
        break;
      case 'newlineToSpace':
        result = inputText.replace(/\n+/g, ' ');
        break;
      case 'removeSymbols':
        result = inputText.replace(/[^\w\s]/g, '');
        break;
      case 'removeSpaces':
        result = inputText.replace(/\s+/g, '');
        break;
      case 'removeNewlines':
        result = inputText.replace(/\n+/g, '');
        break;
      default:
        result = inputText;
    }
    setOutputText(result);
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 这里可以添加toast提示
      console.log(t.tips.copied);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // 清空文本
  const clearText = () => {
    setInputText('');
    setOutputText('');
    console.log(t.tips.cleared);
  };

  return (
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* 顶部导航栏 */}
      <motion.div 
        className="bg-white shadow-sm border-b border-gray-100"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.div 
              className="flex items-center space-x-4"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Link 
                to="/"
                className="flex items-center space-x-2 text-gray-600 hover:text-indigo-600 transition-colors duration-200"
              >
                <motion.svg 
                  className="w-5 h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  whileHover={{ scale: 1.1, rotate: -5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </motion.svg>
                <span className="font-medium">{t.backToHome}</span>
              </Link>
            </motion.div>

            <motion.div 
              className="flex items-center space-x-4"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <motion.button
                onClick={() => setIsEnglish(!isEnglish)}
                className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all duration-200 font-medium"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {t.language}
              </motion.button>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* 主要内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 标题区域 */}
        <motion.div 
          className="text-center mb-8"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <motion.h1 
            className="text-4xl font-bold text-gray-900 mb-2"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            {t.title}
          </motion.h1>
          <motion.p 
            className="text-lg text-gray-600"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            {t.subtitle}
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 输入区域 */}
          <motion.div 
            className="space-y-4"
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t.inputPlaceholder}
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full h-64 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                placeholder={t.inputPlaceholder}
              />
              
              {/* 操作按钮 */}
              <div className="flex space-x-3 mt-4">
                <motion.button
                  onClick={() => copyToClipboard(inputText)}
                  className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t.copy}
                </motion.button>
                <motion.button
                  onClick={() => {
                    copyToClipboard(inputText);
                    setInputText('');
                  }}
                  className="flex-1 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t.cut}
                </motion.button>
                <motion.button
                  onClick={clearText}
                  className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t.clear}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* 输出区域 */}
          <motion.div 
            className="space-y-4"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  {t.outputLabel}
                </label>
                <div className="flex items-center space-x-4 text-sm">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={showOriginalOutput}
                      onChange={(e) => setShowOriginalOutput(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-gray-600">{t.originalOutput}</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={addOriginalToDict}
                      onChange={(e) => setAddOriginalToDict(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-gray-600">{t.addToDict}</span>
                  </label>
                </div>
              </div>
              <textarea
                value={outputText}
                readOnly
                className="w-full h-64 p-4 border border-gray-200 rounded-xl resize-none bg-gray-50 text-gray-700"
                placeholder="转换结果将显示在这里..."
              />
              
              {/* 操作按钮 */}
              <div className="flex space-x-3 mt-4">
                <motion.button
                  onClick={() => copyToClipboard(outputText)}
                  className="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t.copy}
                </motion.button>
                <motion.button
                  onClick={() => setOutputText('')}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t.clear}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 转换功能区域 */}
        <motion.div 
          className="mt-12"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6 text-center">
              {isEnglish ? 'Conversion Functions' : '转换功能'}
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {Object.entries(t.functions).map(([key, label], index) => (
                <motion.button
                  key={key}
                  onClick={() => convertCase(key)}
                  className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-xl text-sm font-medium text-indigo-700 transition-all duration-200 shadow-sm hover:shadow-md"
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 1 + index * 0.05 }}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 提示信息 */}
        <motion.div 
          className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1.2 }}
        >
          <h4 className="text-lg font-semibold text-blue-900 mb-3">
            {isEnglish ? 'Tips' : '提示'}
          </h4>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• {t.tips.firstLetterTip}</li>
            <li>• {t.tips.sentenceTip}</li>
            <li>• {t.tips.titleTip}</li>
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
};

export { CaseConverter }; 
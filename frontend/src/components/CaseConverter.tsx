// 此组件已在 App.tsx 中通过 React.lazy 实现懒加载
import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

interface CaseConverterProps {}

const CaseConverter: React.FC<CaseConverterProps> = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isEnglish, setIsEnglish] = useState(false);
  const [showOriginalOutput, setShowOriginalOutput] = useState(false);
  const [addOriginalToDict, setAddOriginalToDict] = useState(false);

  // 使用 useMemo 优化文案计算，避免每次渲染都重新创建对象
  const t = useMemo(() => ({
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
      // 基础大小写转换
      uppercase: isEnglish ? 'UPPERCASE' : '全大写',
      lowercase: isEnglish ? 'lowercase' : '全小写',
      firstUpper: isEnglish ? 'First Letter Upper' : '首字母大写',
      firstLower: isEnglish ? 'first letter lower' : '首字母小写',
      sentenceCase: isEnglish ? 'Sentence case' : '句子首字母大写',
      titleCase: isEnglish ? 'Title Case' : '标题大小写',
      
      // 智能转换
      smartCase: isEnglish ? 'Smart Case' : '智能大小写',
      alternatingCase: isEnglish ? 'aLtErNaTiNg' : '交替大小写',
      spongebobCase: isEnglish ? 'SpOnGeBoB' : '海绵宝宝体',
      leetspeak: isEnglish ? 'L33t5p34k' : '黑客体',
      
      // 分隔符转换
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
      
      // 格式转换
      spaceToNewline: isEnglish ? 'Space → Newline' : '空格→换行',
      newlineToSpace: isEnglish ? 'Newline → Space' : '换行→空格',
      singleLine: isEnglish ? 'Single Line' : '单行化',
      properLineBreaks: isEnglish ? 'Proper Line Breaks' : '规范换行',
      
      // 清理功能
      removeSymbols: isEnglish ? 'Remove Symbols' : '清除符号',
      removeSpaces: isEnglish ? 'Remove Spaces' : '清除空格',
      removeNewlines: isEnglish ? 'Remove Newlines' : '清除换行',
      removeDuplicates: isEnglish ? 'Remove Duplicates' : '清除重复',
      trimWhitespace: isEnglish ? 'Trim Whitespace' : '修剪空白',
      
      // 编码转换
      toBase64: isEnglish ? 'To Base64' : '转Base64',
      fromBase64: isEnglish ? 'From Base64' : '从Base64',
      toUrlEncode: isEnglish ? 'URL Encode' : 'URL编码',
      fromUrlEncode: isEnglish ? 'URL Decode' : 'URL解码',
      
      // 特殊格式
      toSlug: isEnglish ? 'To Slug' : '转Slug',
      toHashtag: isEnglish ? 'To Hashtag' : '转话题标签',
      toMention: isEnglish ? 'To Mention' : '转提及格式',
      toCodeBlock: isEnglish ? 'To Code Block' : '转代码块',
      
      // 智能处理
      autoFormat: isEnglish ? 'Auto Format' : '自动格式化',
      normalizeText: isEnglish ? 'Normalize Text' : '文本标准化',
      fixCommonErrors: isEnglish ? 'Fix Common Errors' : '修复常见错误',
      enhanceReadability: isEnglish ? 'Enhance Readability' : '提升可读性'
    },

    // 提示信息
    tips: {
      firstLetterTip: isEnglish ? 'First letter uppercase only works when there is a space before the English word' : '首字母转大写仅在英文单词前有空格的情况下才有效',
      sentenceTip: isEnglish ? 'Sentence case only works for the first word after symbols ".!?:"' : '每句首字母大写仅在符号".!?:"后的第一个单词有效',
      titleTip: isEnglish ? 'Title case currently has limited uppercase abbreviation dictionary, feedback is welcome' : '标题大小写目前的全大写缩写词库还比较少，大家可以反馈提交',
      smartCaseTip: isEnglish ? 'Smart case automatically detects and applies appropriate case based on context' : '智能大小写会根据上下文自动检测并应用合适的大小写',
      autoFormatTip: isEnglish ? 'Auto format intelligently formats text based on content type and structure' : '自动格式化会根据内容类型和结构智能格式化文本',
      copied: isEnglish ? 'Copied to clipboard!' : '已复制到剪贴板！',
      cleared: isEnglish ? 'Text cleared!' : '文本已清空！'
    }
  }), [isEnglish]);

  // 转换函数 - 使用 useCallback 优化性能
  const convertCase = useCallback((type: string) => {
    if (!inputText.trim()) return;

    let result = '';
    switch (type) {
      // 基础大小写转换
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
      
      // 智能转换
      case 'smartCase':
        result = inputText.split(' ').map(word => {
          // 检测是否为缩写词
          if (word.length <= 3 && /^[A-Z]+$/.test(word)) return word;
          // 检测是否为专有名词
          if (/^[A-Z][a-z]+$/.test(word)) return word;
          // 检测是否为全大写
          if (/^[A-Z]+$/.test(word)) return word;
          // 默认首字母大写
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
        break;
      case 'alternatingCase':
        result = inputText.split('').map((char, index) => 
          index % 2 === 0 ? char.toLowerCase() : char.toUpperCase()
        ).join('');
        break;
      case 'spongebobCase':
        result = inputText.split('').map((char, index) => 
          index % 2 === 0 ? char.toLowerCase() : char.toUpperCase()
        ).join('');
        break;
      case 'leetspeak':
        const leetMap: { [key: string]: string } = {
          'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5', 't': '7', 'g': '9', 'l': '|'
        };
        result = inputText.toLowerCase().replace(/[aeiostgl]/g, char => leetMap[char] || char);
        break;
      
      // 分隔符转换
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
      
      // 格式转换
      case 'spaceToNewline':
        result = inputText.replace(/\s+/g, '\n');
        break;
      case 'newlineToSpace':
        result = inputText.replace(/\n+/g, ' ');
        break;
      case 'singleLine':
        result = inputText.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
        break;
      case 'properLineBreaks':
        result = inputText.replace(/\n{3,}/g, '\n\n').replace(/\s+$/gm, '');
        break;
      
      // 清理功能
      case 'removeSymbols':
        result = inputText.replace(/[^\w\s]/g, '');
        break;
      case 'removeSpaces':
        result = inputText.replace(/\s+/g, '');
        break;
      case 'removeNewlines':
        result = inputText.replace(/\n+/g, '');
        break;
      case 'removeDuplicates':
        const lines = inputText.split('\n');
        const uniqueLines = [...new Set(lines)];
        result = uniqueLines.join('\n');
        break;
      case 'trimWhitespace':
        result = inputText.split('\n').map(line => line.trim()).join('\n');
        break;
      
      // 编码转换
      case 'toBase64':
        try {
          result = btoa(unescape(encodeURIComponent(inputText)));
        } catch (e) {
          result = 'Error: Invalid characters for Base64 encoding';
        }
        break;
      case 'fromBase64':
        try {
          result = decodeURIComponent(escape(atob(inputText)));
        } catch (e) {
          result = 'Error: Invalid Base64 string';
        }
        break;
      case 'toUrlEncode':
        result = encodeURIComponent(inputText);
        break;
      case 'fromUrlEncode':
        try {
          result = decodeURIComponent(inputText);
        } catch (e) {
          result = 'Error: Invalid URL encoded string';
        }
        break;
      
      // 特殊格式
      case 'toSlug':
        result = inputText.toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        break;
      case 'toHashtag':
        result = inputText.split(/\s+/).map(word => 
          word.startsWith('#') ? word : `#${word}`
        ).join(' ');
        break;
      case 'toMention':
        result = inputText.split(/\s+/).map(word => 
          word.startsWith('@') ? word : `@${word}`
        ).join(' ');
        break;
      case 'toCodeBlock':
        result = `\`\`\`\n${inputText}\n\`\`\``;
        break;
      
      // 智能处理
      case 'autoFormat':
        result = autoFormatText(inputText);
        break;
      case 'normalizeText':
        result = normalizeText(inputText);
        break;
      case 'fixCommonErrors':
        result = fixCommonErrors(inputText);
        break;
      case 'enhanceReadability':
        result = enhanceReadability(inputText);
        break;
      
      default:
        result = inputText;
    }
    setOutputText(result);
  }, [inputText]);

  // 智能处理函数
  const autoFormatText = useCallback((text: string): string => {
    // 检测文本类型并应用相应的格式化
    const lines = text.split('\n');
    const isCode = lines.some(line => line.includes('function') || line.includes('const') || line.includes('var') || line.includes('if') || line.includes('for'));
    const isList = lines.some(line => /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line));
    const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
    
    if (isJson) {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }
    
    if (isCode) {
      return lines.map(line => line.trim()).join('\n');
    }
    
    if (isList) {
      return lines.map(line => {
        if (/^\s*[-*+]\s/.test(line)) {
          return line.replace(/^\s*[-*+]\s*/, '- ');
        }
        if (/^\s*\d+\.\s/.test(line)) {
          return line.replace(/^\s*\d+\.\s*/, (match, num) => `${parseInt(num) + 1}. `);
        }
        return line;
      }).join('\n');
    }
    
    // 普通文本格式化
    return text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/gm, '')
      .replace(/^\s+/gm, '');
  }, []);

  const normalizeText = useCallback((text: string): string => {
    // 标准化文本格式
    return text
      .replace(/\r\n/g, '\n') // 统一换行符
      .replace(/\r/g, '\n')
      .replace(/\t/g, '    ') // 制表符转空格
      .replace(/[^\S\r\n]+/g, ' ') // 多个空格合并
      .replace(/\n{3,}/g, '\n\n') // 多个换行合并
      .trim();
  }, []);

  const fixCommonErrors = useCallback((text: string): string => {
    // 修复常见错误
    return text
      .replace(/\s+([.,!?;:])/g, '$1') // 标点符号前的空格
      .replace(/([.,!?;:])\s*([A-Z])/g, '$1 $2') // 标点符号后的大写字母
      .replace(/\s+/g, ' ') // 多个空格合并
      .replace(/\n\s*\n\s*\n/g, '\n\n') // 多个空行合并
      .replace(/^\s+|\s+$/gm, '') // 行首行尾空格
      .trim();
  }, []);

  const enhanceReadability = useCallback((text: string): string => {
    // 提升可读性
    const sentences = text.split(/([.!?]+)\s+/);
    const enhanced = sentences.map((part, index) => {
      if (index % 2 === 0) {
        // 句子内容
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      } else {
        // 标点符号
        return part;
      }
    }).join('');
    
    return enhanced
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }, []);

  // 复制到剪贴板 - 添加错误处理和降级方案
  const copyToClipboard = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    try {
      // 优先使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        console.log(t.tips.copied);
        return;
      }
      
      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        console.log(t.tips.copied);
      } else {
        console.error('Failed to copy text using execCommand');
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, [t.tips.copied]);

  // 清空文本
  const clearText = useCallback(() => {
    setInputText('');
    setOutputText('');
    console.log(t.tips.cleared);
  }, [t.tips.cleared]);

  // 键盘快捷键处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter: 转换为大写
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      convertCase('uppercase');
    }
    // Ctrl/Cmd + Shift + Enter: 转换为小写
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      convertCase('lowercase');
    }
    // Ctrl/Cmd + K: 清空文本
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      clearText();
    }
    // Ctrl/Cmd + S: 智能大小写
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      convertCase('smartCase');
    }
    // Ctrl/Cmd + A: 自动格式化
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      convertCase('autoFormat');
    }
    // Ctrl/Cmd + N: 文本标准化
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      convertCase('normalizeText');
    }
    // Ctrl/Cmd + F: 修复常见错误
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      convertCase('fixCommonErrors');
    }
    // Ctrl/Cmd + R: 提升可读性
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      convertCase('enhanceReadability');
    }
  }, [convertCase, clearText]);

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div 
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
            🔤
            {t.title}
          </h2>
          <Link 
            to="/"
            className="flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-colors duration-200"
          >
            <motion.span 
              className="text-lg"
              whileHover={{ scale: 1.1, rotate: -5 }}
            >
              ←
            </motion.span>
            <span className="font-medium">{t.backToHome}</span>
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>{t.subtitle}</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">{isEnglish ? 'Features:' : '功能说明：'}</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>{isEnglish ? 'Convert text case formats easily' : '轻松转换文本大小写格式'}</li>
                <li>{isEnglish ? 'Support multiple conversion types' : '支持多种转换类型'}</li>
                <li>{isEnglish ? 'Copy and paste functionality' : '复制粘贴功能'}</li>
                <li>{isEnglish ? 'Bilingual interface support' : '双语界面支持'}</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 输入区块 */}
      <motion.div 
        className="bg-blue-50 rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            📝
            {isEnglish ? 'Input Text' : '输入文本'}
          </h3>
          <motion.button
            onClick={() => setIsEnglish(!isEnglish)}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            {t.language}
          </motion.button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block mb-2 font-semibold text-gray-700">
              {t.inputPlaceholder}
            </label>
            <textarea
              value={inputText}
              onChange={(e) => {
                // 限制输入长度，防止性能问题
                const value = e.target.value;
                if (value.length <= 10000) { // 限制10KB文本
                  setInputText(value);
                }
              }}
              onKeyDown={handleKeyDown}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" 
              rows={8} 
              placeholder={t.inputPlaceholder}
              maxLength={10000}
              aria-label={t.inputPlaceholder}
            />
            {inputText.length > 9000 && (
              <div className="text-sm text-orange-600 mt-1">
                {isEnglish ? 'Text is getting long, consider breaking it into smaller chunks' : '文本较长，建议分段处理'}
              </div>
            )}
          </div>
          
          {/* 操作按钮 */}
          <div className="flex space-x-3">
            <motion.button
              onClick={() => copyToClipboard(inputText)}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              📋
              {t.copy}
            </motion.button>
            <motion.button
              onClick={() => {
                copyToClipboard(inputText);
                setInputText('');
              }}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              ✂️
              {t.cut}
            </motion.button>
            <motion.button
              onClick={clearText}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              🗑️
              {t.clear}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 输出区块 */}
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            📋
            {t.outputLabel}
          </h3>
          <div className="flex items-center space-x-4 text-sm">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showOriginalOutput}
                onChange={(e) => setShowOriginalOutput(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-600">{t.originalOutput}</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={addOriginalToDict}
                onChange={(e) => setAddOriginalToDict(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-600">{t.addToDict}</span>
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <textarea
            value={outputText}
            readOnly
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700" 
            rows={8}
            placeholder="转换结果将显示在这里..."
            aria-label={isEnglish ? 'Conversion result' : '转换结果'}
            aria-describedby="output-description"
          />
          <div id="output-description" className="sr-only">
            {isEnglish ? 'This is the converted text result' : '这是转换后的文本结果'}
          </div>
          
          {/* 操作按钮 */}
          <div className="flex space-x-3">
            <motion.button
              onClick={() => copyToClipboard(outputText)}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              📋
              {t.copy}
            </motion.button>
            <motion.button
              onClick={() => setOutputText('')}
              className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              🗑️
              {t.clear}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 转换功能区域 */}
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            🔄
            {isEnglish ? 'Conversion Functions' : '转换功能'}
          </h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Object.entries(t.functions).map(([key, label], index) => (
            <motion.button
              key={key}
              onClick={() => convertCase(key)}
              className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
            >
              {label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* 提示信息 */}
      <motion.div 
        className="bg-blue-50 border border-blue-200 rounded-xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h4 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          💡
          {isEnglish ? 'Tips' : '提示'}
        </h4>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>• {t.tips.firstLetterTip}</li>
          <li>• {t.tips.sentenceTip}</li>
          <li>• {t.tips.titleTip}</li>
          <li>• {t.tips.smartCaseTip}</li>
          <li>• {t.tips.autoFormatTip}</li>
          <li>• {isEnglish ? 'Keyboard shortcuts: Ctrl+Enter (UPPERCASE), Ctrl+Shift+Enter (lowercase), Ctrl+K (Clear), Ctrl+S (Smart), Ctrl+A (Auto), Ctrl+N (Normalize), Ctrl+F (Fix), Ctrl+R (Readable)' : '键盘快捷键：Ctrl+Enter (全大写)，Ctrl+Shift+Enter (全小写)，Ctrl+K (清空)，Ctrl+S (智能)，Ctrl+A (自动)，Ctrl+N (标准化)，Ctrl+F (修复)，Ctrl+R (可读性)'}</li>
          <li>• {isEnglish ? 'New features: Smart case detection, Auto formatting, Text normalization, Error fixing' : '新功能：智能大小写检测、自动格式化、文本标准化、错误修复'}</li>
        </ul>
      </motion.div>
    </motion.div>
  );
};

export { CaseConverter }; 
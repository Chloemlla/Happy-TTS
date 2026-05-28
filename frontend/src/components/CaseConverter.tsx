// 此组件已在 App.tsx 中通过 React.lazy 实现懒加载
import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import {
  FaFont,
  FaCopy,
  FaCut,
  FaTrash,
  FaArrowLeft,
  FaMagic,
  FaCode,
  FaLink,
  FaHashtag,
  FaAt,
  FaTimes,
  FaSync,
  FaLightbulb,
  FaArrowUp,
  FaArrowDown,
  FaSortAlphaDown,
  FaSortAlphaUp,
  FaParagraph,
  FaHeading,
  FaBrain,
  FaRandom,
  FaSmile,
  FaKeyboard,
  FaMinus,
  FaDotCircle,
  FaExchangeAlt,
  FaArrowsAltH,
  FaArrowsAltV,
  FaBroom,
  FaEraser,
  FaFilter,
  FaSort,
  FaTrashAlt,
  FaCog,
  FaLock,
  FaUnlock,
  FaGlobe,
  FaNetworkWired,
  FaWrench,
  FaEye,
  FaLanguage,
  FaStar,
  FaMobile,
  FaInfoCircle,
  FaFileCode,
  FaPlay
} from 'react-icons/fa';

interface CaseConverterProps {}

const CaseConverter: React.FC<CaseConverterProps> = React.memo(() => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isEnglish, setIsEnglish] = useState(false);
  const [showOriginalOutput, setShowOriginalOutput] = useState(false);
  const [addOriginalToDict, setAddOriginalToDict] = useState(false);
  const [hoveredFunction, setHoveredFunction] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, direction: 'bottom' });
  const [isMobile, setIsMobile] = useState(false);
  const { setNotification } = useNotification();

  // 功能图标映射
  const functionIcons = useMemo(() => ({
    // 基础大小写转换
    uppercase: FaArrowUp,
    lowercase: FaArrowDown,
    firstUpper: FaSortAlphaUp,
    firstLower: FaSortAlphaDown,
    sentenceCase: FaParagraph,
    titleCase: FaHeading,

    // 智能转换
    smartCase: FaBrain,
    alternatingCase: FaRandom,
    spongebobCase: FaSmile,
    leetspeak: FaKeyboard,

    // 分隔符转换
    spaceToUnderscore: FaExchangeAlt,
    underscoreToCamel: FaArrowsAltH,
    camelToUnderscore: FaArrowsAltH,
    camelToSpace: FaArrowsAltH,
    spaceToDash: FaMinus,
    underscoreToDash: FaExchangeAlt,
    dashToUnderscore: FaExchangeAlt,
    underscoreToSpace: FaArrowsAltH,
    underscoreToDot: FaDotCircle,
    dotToUnderscore: FaDotCircle,

    // 格式转换
    spaceToNewline: FaArrowsAltV,
    newlineToSpace: FaArrowsAltH,
    singleLine: FaArrowsAltH,
    properLineBreaks: FaArrowsAltV,
    newlineToComma: FaArrowsAltH,

    // 清理功能
    removeSymbols: FaBroom,
    removeSpaces: FaEraser,
    removeNewlines: FaFilter,
    removeDuplicates: FaSort,
    trimWhitespace: FaTrashAlt,

    // 编码转换
    toBase64: FaLock,
    fromBase64: FaUnlock,
    toUrlEncode: FaGlobe,
    fromUrlEncode: FaNetworkWired,

    // 特殊格式
    toSlug: FaLink,
    toHashtag: FaHashtag,
    toMention: FaAt,
    toCodeBlock: FaCode,

    // 智能处理
    autoFormat: FaMagic,
    normalizeText: FaCog,
    fixCommonErrors: FaWrench,
    enhanceReadability: FaEye
  }), []);

  // 功能按钮分组（用于细微视觉区分，但整体保持 slate 调性）
  const functionColors = useMemo(() => ({
    // 统一使用 slate 风格，保留 key 以维持原有 API
    uppercase: '',
    lowercase: '',
    firstUpper: '',
    firstLower: '',
    sentenceCase: '',
    titleCase: '',
    smartCase: '',
    alternatingCase: '',
    spongebobCase: '',
    leetspeak: '',
    spaceToUnderscore: '',
    underscoreToCamel: '',
    camelToUnderscore: '',
    camelToSpace: '',
    spaceToDash: '',
    underscoreToDash: '',
    dashToUnderscore: '',
    underscoreToSpace: '',
    underscoreToDot: '',
    dotToUnderscore: '',
    spaceToNewline: '',
    newlineToSpace: '',
    singleLine: '',
    properLineBreaks: '',
    newlineToComma: '',
    removeSymbols: '',
    removeSpaces: '',
    removeNewlines: '',
    removeDuplicates: '',
    trimWhitespace: '',
    toBase64: '',
    fromBase64: '',
    toUrlEncode: '',
    fromUrlEncode: '',
    toSlug: '',
    toHashtag: '',
    toMention: '',
    toCodeBlock: '',
    autoFormat: '',
    normalizeText: '',
    fixCommonErrors: '',
    enhanceReadability: ''
  }), []);

  // 检测是否为移动设备
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 全局点击事件监听器，点击外部关闭提示框
  React.useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (hoveredFunction && !(event.target as Element).closest('.tooltip-container')) {
        setHoveredFunction(null);
      }
    };

    const handleScroll = () => {
      if (hoveredFunction && isMobile) {
        setHoveredFunction(null);
      }
    };

    if (hoveredFunction) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      if (isMobile) {
        document.addEventListener('scroll', handleScroll, { passive: true });
        // 防止背景滚动
        document.body.style.overflow = 'hidden';
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      if (isMobile) {
        document.removeEventListener('scroll', handleScroll);
        document.body.style.overflow = '';
      }
    };
  }, [hoveredFunction, isMobile]);

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
      newlineToComma: isEnglish ? 'Newline → Comma' : '换行→逗号',

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
    },

    // 功能说明和代码示例
    functionDetails: {
      uppercase: {
        description: isEnglish ? 'Convert all characters to uppercase' : '将所有字符转换为大写',
        code: 'text.toUpperCase()',
        example: isEnglish ? 'hello → HELLO' : 'hello → HELLO'
      },
      lowercase: {
        description: isEnglish ? 'Convert all characters to lowercase' : '将所有字符转换为小写',
        code: 'text.toLowerCase()',
        example: isEnglish ? 'HELLO → hello' : 'HELLO → hello'
      },
      firstUpper: {
        description: isEnglish ? 'Capitalize first letter of each word' : '每个单词首字母大写',
        code: 'text.replace(/\\b\\w/g, char => char.toUpperCase())',
        example: isEnglish ? 'hello world → Hello World' : 'hello world → Hello World'
      },
      firstLower: {
        description: isEnglish ? 'Lowercase first letter of each word' : '每个单词首字母小写',
        code: 'text.replace(/\\b\\w/g, char => char.toLowerCase())',
        example: isEnglish ? 'Hello World → hello world' : 'Hello World → hello world'
      },
      sentenceCase: {
        description: isEnglish ? 'Capitalize first letter after sentence endings' : '句子结尾后首字母大写',
        code: 'text.toLowerCase().replace(/(^|\\.\\s+|!\\s+|\\?\\s+)\\w/g, match => match.toUpperCase())',
        example: isEnglish ? 'hello. world! → Hello. World!' : 'hello. world! → Hello. World!'
      },
      titleCase: {
        description: isEnglish ? 'Title case with minor words in lowercase' : '标题大小写，小词保持小写',
        code: 'Complex logic with minor words dictionary',
        example: isEnglish ? 'the quick brown fox → The Quick Brown Fox' : 'the quick brown fox → The Quick Brown Fox'
      },
      smartCase: {
        description: isEnglish ? 'Smart case detection based on context' : '基于上下文的智能大小写检测',
        code: 'Detect abbreviations, proper nouns, and apply appropriate case',
        example: isEnglish ? 'USA hello → USA Hello' : 'USA hello → USA Hello'
      },
      alternatingCase: {
        description: isEnglish ? 'Alternate between upper and lowercase' : '交替大小写',
        code: 'text.split("").map((char, i) => i % 2 === 0 ? char.toLowerCase() : char.toUpperCase()).join("")',
        example: isEnglish ? 'hello → hElLo' : 'hello → hElLo'
      },
      spongebobCase: {
        description: isEnglish ? 'Spongebob meme case (alternating)' : '海绵宝宝体（交替大小写）',
        code: 'Same as alternating case',
        example: isEnglish ? 'hello → hElLo' : 'hello → hElLo'
      },
      leetspeak: {
        description: isEnglish ? 'Convert to leetspeak (1337)' : '转换为黑客体（1337）',
        code: 'Replace letters with numbers: a→4, e→3, i→1, o→0, s→5',
        example: isEnglish ? 'hello → h3ll0' : 'hello → h3ll0'
      },
      spaceToUnderscore: {
        description: isEnglish ? 'Replace spaces with underscores' : '空格替换为下划线',
        code: 'text.replace(/\\s+/g, "_")',
        example: isEnglish ? 'hello world → hello_world' : 'hello world → hello_world'
      },
      underscoreToCamel: {
        description: isEnglish ? 'Convert underscore to camelCase' : '下划线转换为驼峰命名',
        code: 'text.replace(/[_\\s]+(.)/g, (_, char) => char.toUpperCase())',
        example: isEnglish ? 'hello_world → helloWorld' : 'hello_world → helloWorld'
      },
      camelToUnderscore: {
        description: isEnglish ? 'Convert camelCase to underscore' : '驼峰命名转换为下划线',
        code: 'text.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")',
        example: isEnglish ? 'helloWorld → hello_world' : 'helloWorld → hello_world'
      },
      camelToSpace: {
        description: isEnglish ? 'Convert camelCase to space separated' : '驼峰命名转换为空格分隔',
        code: 'text.replace(/([A-Z])/g, " $1").replace(/^ /, "")',
        example: isEnglish ? 'helloWorld → hello World' : 'helloWorld → hello World'
      },
      spaceToDash: {
        description: isEnglish ? 'Replace spaces with dashes' : '空格替换为中横线',
        code: 'text.replace(/\\s+/g, "-")',
        example: isEnglish ? 'hello world → hello-world' : 'hello world → hello-world'
      },
      underscoreToDash: {
        description: isEnglish ? 'Replace underscores with dashes' : '下划线替换为中横线',
        code: 'text.replace(/_/g, "-")',
        example: isEnglish ? 'hello_world → hello-world' : 'hello_world → hello-world'
      },
      dashToUnderscore: {
        description: isEnglish ? 'Replace dashes with underscores' : '中横线替换为下划线',
        code: 'text.replace(/-/g, "_")',
        example: isEnglish ? 'hello-world → hello_world' : 'hello-world → hello_world'
      },
      underscoreToSpace: {
        description: isEnglish ? 'Replace underscores with spaces' : '下划线替换为空格',
        code: 'text.replace(/_/g, " ")',
        example: isEnglish ? 'hello_world → hello world' : 'hello_world → hello world'
      },
      underscoreToDot: {
        description: isEnglish ? 'Replace underscores with dots' : '下划线替换为小数点',
        code: 'text.replace(/_/g, ".")',
        example: isEnglish ? 'hello_world → hello.world' : 'hello_world → hello.world'
      },
      dotToUnderscore: {
        description: isEnglish ? 'Replace dots with underscores' : '小数点替换为下划线',
        code: 'text.replace(/\\./g, "_")',
        example: isEnglish ? 'hello.world → hello_world' : 'hello.world → hello_world'
      },
      spaceToNewline: {
        description: isEnglish ? 'Replace spaces with newlines' : '空格替换为换行',
        code: 'text.replace(/\\s+/g, "\\n")',
        example: isEnglish ? 'hello world → hello\\nworld' : 'hello world → hello\\nworld'
      },
      newlineToSpace: {
        description: isEnglish ? 'Replace newlines with spaces' : '换行替换为空格',
        code: 'text.replace(/\\n+/g, " ")',
        example: isEnglish ? 'hello\\nworld → hello world' : 'hello\\nworld → hello world'
      },
      singleLine: {
        description: isEnglish ? 'Convert to single line' : '转换为单行',
        code: 'text.replace(/\\n+/g, " ").replace(/\\s+/g, " ")',
        example: isEnglish ? 'hello\\nworld → hello world' : 'hello\\nworld → hello world'
      },
      properLineBreaks: {
        description: isEnglish ? 'Normalize line breaks' : '规范化换行',
        code: 'text.replace(/\\n{3,}/g, "\\n\\n").replace(/\\s+$/gm, "")',
        example: isEnglish ? 'Multiple\\n\\n\\nbreaks → Multiple\\n\\nbreaks' : 'Multiple\\n\\n\\nbreaks → Multiple\\n\\nbreaks'
      },
      newlineToComma: {
        description: isEnglish ? 'Convert newlines to comma-separated values' : '将换行转换为逗号分隔值',
        code: 'text.split("\\\\n").filter(line => line.trim()).join(", ")',
        example: isEnglish
          ? 'chatgpt-4o-latest\ngpt-4o\ngpt-4o-2024-05-13 → chatgpt-4o-latest,gpt-4o,gpt-4o-2024-05-13'
          : 'chatgpt-4o-latest\ngpt-4o\ngpt-4o-2024-05-13 → chatgpt-4o-latest,gpt-4o,gpt-4o-2024-05-13'
      },
      removeSymbols: {
        description: isEnglish ? 'Remove all symbols except letters, numbers, and spaces' : '移除除字母、数字、空格外的所有符号',
        code: 'text.replace(/[^\\w\\s]/g, "")',
        example: isEnglish ? 'hello@world! → hello world' : 'hello@world! → hello world'
      },
      removeSpaces: {
        description: isEnglish ? 'Remove all spaces' : '移除所有空格',
        code: 'text.replace(/\\s+/g, "")',
        example: isEnglish ? 'hello world → helloworld' : 'hello world → helloworld'
      },
      removeNewlines: {
        description: isEnglish ? 'Remove all newlines' : '移除所有换行',
        code: 'text.replace(/\\n+/g, "")',
        example: isEnglish ? 'hello\\nworld → helloworld' : 'hello\\nworld → helloworld'
      },
      removeDuplicates: {
        description: isEnglish ? 'Remove duplicate lines' : '移除重复行',
        code: '[...new Set(text.split("\\n"))].join("\\n")',
        example: isEnglish ? 'hello\\nworld\\nhello → hello\\nworld' : 'hello\\nworld\\nhello → hello\\nworld'
      },
      trimWhitespace: {
        description: isEnglish ? 'Trim whitespace from each line' : '修剪每行的空白',
        code: 'text.split("\\n").map(line => line.trim()).join("\\n")',
        example: isEnglish ? '  hello  \\n  world  → hello\\nworld' : '  hello  \\n  world  → hello\\nworld'
      },
      toBase64: {
        description: isEnglish ? 'Encode text to Base64' : '将文本编码为Base64',
        code: 'btoa(unescape(encodeURIComponent(text)))',
        example: isEnglish ? 'hello → aGVsbG8=' : 'hello → aGVsbG8='
      },
      fromBase64: {
        description: isEnglish ? 'Decode text from Base64' : '从Base64解码文本',
        code: 'decodeURIComponent(escape(atob(text)))',
        example: isEnglish ? 'aGVsbG8= → hello' : 'aGVsbG8= → hello'
      },
      toUrlEncode: {
        description: isEnglish ? 'URL encode text' : 'URL编码文本',
        code: 'encodeURIComponent(text)',
        example: isEnglish ? 'hello world → hello%20world' : 'hello world → hello%20world'
      },
      fromUrlEncode: {
        description: isEnglish ? 'URL decode text' : 'URL解码文本',
        code: 'decodeURIComponent(text)',
        example: isEnglish ? 'hello%20world → hello world' : 'hello%20world → hello world'
      },
      toSlug: {
        description: isEnglish ? 'Convert to URL-friendly slug' : '转换为URL友好的slug',
        code: 'text.toLowerCase().replace(/[^\\w\\s-]/g, "").replace(/[\\s_-]+/g, "-")',
        example: isEnglish ? 'Hello World! → hello-world' : 'Hello World! → hello-world'
      },
      toHashtag: {
        description: isEnglish ? 'Convert words to hashtags' : '将单词转换为话题标签',
        code: 'text.split(/\\s+/).map(word => word.startsWith("#") ? word : `#${word}`).join(" ")',
        example: isEnglish ? 'hello world → #hello #world' : 'hello world → #hello #world'
      },
      toMention: {
        description: isEnglish ? 'Convert words to mentions' : '将单词转换为提及格式',
        code: 'text.split(/\\s+/).map(word => word.startsWith("@") ? word : `@${word}`).join(" ")',
        example: isEnglish ? 'hello world → @hello @world' : 'hello world → @hello @world'
      },
      toCodeBlock: {
        description: isEnglish ? 'Wrap text in code block' : '将文本包装在代码块中',
        code: '`\\`\\`\\`\\n${text}\\n\\`\\`\\``',
        example: isEnglish ? 'hello → ```\\nhello\\n```' : 'hello → ```\\nhello\\n```'
      },
      autoFormat: {
        description: isEnglish ? 'Intelligently format text based on content type' : '根据内容类型智能格式化文本',
        code: 'Detect JSON, code, lists and apply appropriate formatting',
        example: isEnglish ? 'JSON: {"a":1} → {\\n  "a": 1\\n}' : 'JSON: {"a":1} → {\\n  "a": 1\\n}'
      },
      normalizeText: {
        description: isEnglish ? 'Normalize text format (line endings, spaces)' : '标准化文本格式（换行符、空格）',
        code: 'Unify line endings, normalize spaces, trim whitespace',
        example: isEnglish ? 'Mixed\\r\\nline\\rendings → Unified\\nline\\nendings' : 'Mixed\\r\\nline\\rendings → Unified\\nline\\nendings'
      },
      fixCommonErrors: {
        description: isEnglish ? 'Fix common text formatting errors' : '修复常见文本格式错误',
        code: 'Fix punctuation spacing, multiple spaces, empty lines',
        example: isEnglish ? 'hello ,world ! → hello, world!' : 'hello ,world ! → hello, world!'
      },
      enhanceReadability: {
        description: isEnglish ? 'Enhance text readability' : '提升文本可读性',
        code: 'Capitalize sentences, normalize spacing, improve structure',
        example: isEnglish ? 'hello world. → Hello world.' : 'hello world. → Hello world.'
      }
    }
  }), [isEnglish]);

    // 转换函数 - 使用 useCallback 优化性能
  const convertCase = useCallback((type: string) => {
    if (!inputText.trim()) {
      setNotification({
        message: isEnglish ? 'Please enter some text to convert' : '请输入要转换的文本',
        type: 'warning'
      });
      return;
    }

    // 输入验证和清理
    const sanitizedInput = DOMPurify.sanitize(inputText.trim());
    if (sanitizedInput.length > 10000) {
      setNotification({
        message: isEnglish ? 'Text is too long (max 10,000 characters)' : '文本过长（最多10,000字符）',
        type: 'warning'
      });
      return;
    }

    let result = '';

    try {
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
      case 'newlineToComma':
        result = inputText.split('\n').filter(line => line.trim()).join(',');
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
        result = sanitizedInput;
    }
    setOutputText(result);
  } catch (error) {
    console.error('Conversion error:', error);
    setNotification({
      message: isEnglish ? 'An error occurred during conversion' : '转换过程中发生错误',
      type: 'error'
    });
    setOutputText('');
  }
  }, [inputText, isEnglish, setNotification]);

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
    if (!text.trim()) {
      setNotification({
        message: isEnglish ? 'No text to copy' : '没有可复制的文本',
        type: 'warning'
      });
      return;
    }

    // 验证文本长度
    if (text.length > 10000) {
      setNotification({
        message: isEnglish ? 'Text is too long to copy' : '文本过长，无法复制',
        type: 'warning'
      });
      return;
    }

    try {
      // 优先使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setNotification({
          message: t.tips.copied,
          type: 'success'
        });
        return;
      }

      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        setNotification({
          message: t.tips.copied,
          type: 'success'
        });
      } else {
        throw new Error('execCommand failed');
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setNotification({
        message: isEnglish ? 'Failed to copy text to clipboard' : '复制到剪贴板失败',
        type: 'error'
      });
    }
  }, [t.tips.copied, isEnglish, setNotification]);

  // 清空文本
  const clearText = useCallback(() => {
    setInputText('');
    setOutputText('');
    setNotification({
      message: t.tips.cleared,
      type: 'info'
    });
  }, [t.tips.cleared, setNotification]);

  // 计算提示框位置
  const calculateTooltipPosition = useCallback((event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>, key: string) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 提示框的预估尺寸
    const tooltipWidth = isMobile ? 280 : 320;
    const tooltipHeight = 200;

    let direction = 'bottom';
    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    let y = rect.bottom + 8;

    // 检查右边界
    if (x + tooltipWidth > viewportWidth - 20) {
      x = viewportWidth - tooltipWidth - 20;
    }

    // 检查左边界
    if (x < 20) {
      x = 20;
    }

    // 检查下边界，如果超出则显示在上方
    if (y + tooltipHeight > viewportHeight - 20) {
      direction = 'top';
      y = rect.top - tooltipHeight - 8;
    }

    // 检查上边界
    if (y < 20) {
      y = 20;
    }

    setTooltipPosition({ x, y, direction });
    setHoveredFunction(key);
  }, [isMobile]);

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    setHoveredFunction(null);
  }, []);

  // 处理触摸事件（移动端）
  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLButtonElement>, key: string) => {
    if (isMobile) {
      event.preventDefault();
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 提示框的预估尺寸
      const tooltipWidth = 280;
      const tooltipHeight = 200;

      let direction = 'bottom';
      let x = rect.left + rect.width / 2 - tooltipWidth / 2;
      let y = rect.bottom + 8;

      // 检查右边界
      if (x + tooltipWidth > viewportWidth - 20) {
        x = viewportWidth - tooltipWidth - 20;
      }

      // 检查左边界
      if (x < 20) {
        x = 20;
      }

      // 检查下边界，如果超出则显示在上方
      if (y + tooltipHeight > viewportHeight - 20) {
        direction = 'top';
        y = rect.top - tooltipHeight - 8;
      }

      // 检查上边界
      if (y < 20) {
        y = 20;
      }

      setTooltipPosition({ x, y, direction });
      setHoveredFunction(key);
    }
  }, [isMobile]);

  // 处理触摸结束事件（移动端）
  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLButtonElement>) => {
    if (isMobile) {
      // 延迟隐藏，给用户时间查看提示框
      setTimeout(() => {
        setHoveredFunction(null);
      }, 3000); // 3秒后自动隐藏
    }
  }, [isMobile]);

  // 处理长按事件（移动端）
  const handleLongPress = useCallback((event: React.TouchEvent<HTMLButtonElement>, key: string) => {
    if (isMobile) {
      event.preventDefault();
      // 长按时显示提示框，但不执行转换
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 提示框的预估尺寸
      const tooltipWidth = 280;
      const tooltipHeight = 200;

      let direction = 'bottom';
      let x = rect.left + rect.width / 2 - tooltipWidth / 2;
      let y = rect.bottom + 8;

      // 检查右边界
      if (x + tooltipWidth > viewportWidth - 20) {
        x = viewportWidth - tooltipWidth - 20;
      }

      // 检查左边界
      if (x < 20) {
        x = 20;
      }

      // 检查下边界，如果超出则显示在上方
      if (y + tooltipHeight > viewportHeight - 20) {
        direction = 'top';
        y = rect.top - tooltipHeight - 8;
      }

      // 检查上边界
      if (y < 20) {
        y = 20;
      }

      setTooltipPosition({ x, y, direction });
      setHoveredFunction(key);
    }
  }, [isMobile]);

  // 处理移动端点击事件
  const handleMobileClick = useCallback((event: React.MouseEvent<HTMLButtonElement>, key: string) => {
    if (isMobile) {
      event.preventDefault();
      event.stopPropagation();

      // 执行转换功能
      convertCase(key);

      // 如果提示框没有显示，则显示它
      if (hoveredFunction !== key) {
        const button = event.currentTarget;
        const rect = button.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 提示框的预估尺寸
        const tooltipWidth = 280;
        const tooltipHeight = 200;

        let direction = 'bottom';
        let x = rect.left + rect.width / 2 - tooltipWidth / 2;
        let y = rect.bottom + 8;

        // 检查右边界
        if (x + tooltipWidth > viewportWidth - 20) {
          x = viewportWidth - tooltipWidth - 20;
        }

        // 检查左边界
        if (x < 20) {
          x = 20;
        }

        // 检查下边界，如果超出则显示在上方
        if (y + tooltipHeight > viewportHeight - 20) {
          direction = 'top';
          y = rect.top - tooltipHeight - 8;
        }

        // 检查上边界
        if (y < 20) {
          y = 20;
        }

        setTooltipPosition({ x, y, direction });
        setHoveredFunction(key);
      }
    }
  }, [isMobile, hoveredFunction, convertCase]);

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
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <motion.div
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative space-y-8">
          {/* 标题区 */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                <FaFont className="text-[10px]" /> CASE CONVERTER
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                {t.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                {t.subtitle}
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <li className="flex items-center gap-2">
                  <FaFont className="h-3 w-3 flex-shrink-0 text-slate-500" />
                  {isEnglish ? 'Convert text case formats easily' : '轻松转换文本大小写格式'}
                </li>
                <li className="flex items-center gap-2">
                  <FaSync className="h-3 w-3 flex-shrink-0 text-slate-500" />
                  {isEnglish ? 'Support multiple conversion types' : '支持多种转换类型'}
                </li>
                <li className="flex items-center gap-2">
                  <FaCopy className="h-3 w-3 flex-shrink-0 text-slate-500" />
                  {isEnglish ? 'Copy and paste functionality' : '复制粘贴功能'}
                </li>
                <li className="flex items-center gap-2">
                  <FaLanguage className="h-3 w-3 flex-shrink-0 text-slate-500" />
                  {isEnglish ? 'Bilingual interface support' : '双语界面支持'}
                </li>
              </ul>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
              >
                <FaArrowLeft className="text-xs" />
                <span>{t.backToHome}</span>
              </Link>
              <motion.button
                onClick={() => setIsEnglish(!isEnglish)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                whileTap={{ scale: 0.97 }}
              >
                <FaLanguage className="h-4 w-4" />
                {t.language}
              </motion.button>
            </div>
          </div>

          {/* 输入区块 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaFont className="text-slate-500" />
              {isEnglish ? 'Input Text' : '输入文本'}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {t.inputPlaceholder}
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => {
                    // 限制输入长度，防止性能问题
                    const value = e.target.value;
                    if (value.length <= 10000) { // 限制10KB文本
                      setInputText(value);
                    } else {
                      setNotification({
                        message: isEnglish ? 'Text is too long (max 10,000 characters)' : '文本过长（最多10,000字符）',
                        type: 'warning'
                      });
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400"
                  rows={8}
                  placeholder={t.inputPlaceholder}
                  maxLength={10000}
                  aria-label={t.inputPlaceholder}
                />
                {inputText.length > 9000 && (
                  <div className="mt-2 text-xs text-amber-600">
                    {isEnglish ? 'Text is getting long, consider breaking it into smaller chunks' : '文本较长，建议分段处理'}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-3">
                <motion.button
                  onClick={() => copyToClipboard(inputText)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                  whileTap={{ scale: 0.97 }}
                >
                  <FaCopy className="h-4 w-4" />
                  {t.copy}
                </motion.button>
                <motion.button
                  onClick={() => {
                    copyToClipboard(inputText);
                    setInputText('');
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                  whileTap={{ scale: 0.97 }}
                >
                  <FaCut className="h-4 w-4" />
                  {t.cut}
                </motion.button>
                <motion.button
                  onClick={clearText}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                  whileTap={{ scale: 0.97 }}
                >
                  <FaTrash className="h-4 w-4" />
                  {t.clear}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* 输出区块 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                <FaCopy className="text-slate-500" />
                {t.outputLabel}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={showOriginalOutput}
                    onChange={(e) => setShowOriginalOutput(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
                  <span>{t.originalOutput}</span>
                </label>
                <label className="flex items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={addOriginalToDict}
                    onChange={(e) => setAddOriginalToDict(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
                  <span>{t.addToDict}</span>
                </label>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <textarea
                value={outputText}
                readOnly
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-slate-300 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400"
                rows={8}
                placeholder={isEnglish ? 'Conversion result will appear here...' : '转换结果将显示在这里...'}
                aria-label={isEnglish ? 'Conversion result' : '转换结果'}
                aria-describedby="output-description"
                data-testid="output-textarea"
              />
              <div id="output-description" className="sr-only">
                {isEnglish ? 'This is the converted text result' : '这是转换后的文本结果'}
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-3">
                <motion.button
                  onClick={() => copyToClipboard(outputText)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                  whileTap={{ scale: 0.97 }}
                >
                  <FaCopy className="h-4 w-4" />
                  {t.copy}
                </motion.button>
                <motion.button
                  onClick={() => setOutputText('')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                  whileTap={{ scale: 0.97 }}
                >
                  <FaTrash className="h-4 w-4" />
                  {t.clear}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* 转换功能区域 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaSync className="text-slate-500" />
              {isEnglish ? 'Conversion Functions' : '转换功能'}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {Object.entries(t.functions).map(([key, label], index) => {
                const IconComponent = functionIcons[key as keyof typeof functionIcons];
                return (
                  <div key={key} className="relative">
                    <motion.button
                      onClick={(e) => {
                        if (isMobile) {
                          handleMobileClick(e, key);
                        } else {
                          convertCase(key);
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.015 }}
                      onMouseEnter={(e) => !isMobile && calculateTooltipPosition(e, key)}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={(e) => handleTouchStart(e, key)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={(e) => {
                        // 防止触摸移动时触发其他事件
                        e.preventDefault();
                      }}
                      onFocus={(e) => !isMobile && calculateTooltipPosition(e, key)}
                      onBlur={handleMouseLeave}
                      aria-label={`${label} - ${t.functionDetails[key as keyof typeof t.functionDetails]?.description || ''}`}
                      data-testid={`convert-${key}`}
                    >
                      {IconComponent && <IconComponent className="h-4 w-4 flex-shrink-0 text-slate-500" />}
                      <span className="truncate">{label}</span>
                    </motion.button>
                  </div>
                );
              })}
            </div>

            {/* 移动端背景遮罩 */}
            {hoveredFunction && isMobile && (
              <motion.div
                className="fixed inset-0 z-40 bg-slate-900/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={handleMouseLeave}
                onTouchStart={handleMouseLeave}
              />
            )}

            {/* 全局悬停提示框 */}
            {hoveredFunction && (
              <motion.div
                className={`tooltip-container fixed z-50 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-500 ${
                  isMobile ? 'w-70 max-w-[calc(100vw-40px)]' : 'w-80'
                }`}
                style={{
                  left: tooltipPosition.x,
                  top: tooltipPosition.y,
                  maxHeight: isMobile ? '60vh' : '300px',
                  overflowY: 'auto',
                  ...(isMobile && {
                    left: '20px',
                    right: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 'auto',
                    zIndex: 9999
                  })
                }}
                initial={{ opacity: 0, y: tooltipPosition.direction === 'top' ? 10 : -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: tooltipPosition.direction === 'top' ? 10 : -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onMouseEnter={() => !isMobile && setHoveredFunction(hoveredFunction)}
                onMouseLeave={() => !isMobile && handleMouseLeave()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {/* 箭头 - 仅在桌面端显示 */}
                {!isMobile && (
                  <div
                    className={`absolute h-0 w-0 border-l-4 border-r-4 border-transparent ${
                      tooltipPosition.direction === 'top'
                        ? '-bottom-2 border-t-4 border-t-slate-900'
                        : '-top-2 border-b-4 border-b-slate-900'
                    }`}
                    style={{
                      left: '50%',
                      transform: 'translateX(-50%)'
                    }}
                  ></div>
                )}

                {/* 关闭按钮（移动端） */}
                {isMobile && (
                  <button
                    onClick={handleMouseLeave}
                    className="absolute right-2 top-2 text-slate-400 transition-colors hover:text-white"
                    aria-label={isEnglish ? 'Close tooltip' : '关闭提示'}
                  >
                    <FaTimes className="h-4 w-4" />
                  </button>
                )}

                <div className="space-y-3 pr-2">
                  {/* 功能描述 */}
                  <div>
                    <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                      <FaInfoCircle className="h-3.5 w-3.5" />
                      {isEnglish ? 'Description' : '功能描述'}
                    </h4>
                    <div className="max-h-24 overflow-y-auto text-sm text-slate-200 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-500">
                      <p>
                        {DOMPurify.sanitize(t.functionDetails[hoveredFunction as keyof typeof t.functionDetails]?.description || '')}
                      </p>
                    </div>
                  </div>

                  {/* 代码示例 */}
                  <div>
                    <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                      <FaFileCode className="h-3.5 w-3.5" />
                      {isEnglish ? 'Code' : '代码'}
                    </h4>
                    <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-800 p-2 font-mono text-xs text-emerald-200 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-500">
                      <pre className="whitespace-pre-wrap break-words">
                        {DOMPurify.sanitize(t.functionDetails[hoveredFunction as keyof typeof t.functionDetails]?.code || '')}
                      </pre>
                    </div>
                  </div>

                  {/* 示例 */}
                  <div>
                    <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
                      <FaPlay className="h-3.5 w-3.5" />
                      {isEnglish ? 'Example' : '示例'}
                    </h4>
                    <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-800 p-2 font-mono text-xs text-amber-200 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-500">
                      <pre className="whitespace-pre-wrap break-words">
                        {DOMPurify.sanitize(t.functionDetails[hoveredFunction as keyof typeof t.functionDetails]?.example || '')}
                      </pre>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* 提示信息 */}
          <motion.div
            className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              <FaLightbulb className="text-slate-500" />
              {isEnglish ? 'Tips' : '提示'}
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-7 text-slate-600">
              <li className="flex items-start gap-2">
                <FaFont className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {t.tips.firstLetterTip}
              </li>
              <li className="flex items-start gap-2">
                <FaParagraph className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {t.tips.sentenceTip}
              </li>
              <li className="flex items-start gap-2">
                <FaHeading className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {t.tips.titleTip}
              </li>
              <li className="flex items-start gap-2">
                <FaBrain className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {t.tips.smartCaseTip}
              </li>
              <li className="flex items-start gap-2">
                <FaMagic className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {t.tips.autoFormatTip}
              </li>
              <li className="flex items-start gap-2">
                <FaKeyboard className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {isEnglish ? 'Keyboard shortcuts: Ctrl+Enter (UPPERCASE), Ctrl+Shift+Enter (lowercase), Ctrl+K (Clear), Ctrl+S (Smart), Ctrl+A (Auto), Ctrl+N (Normalize), Ctrl+F (Fix), Ctrl+R (Readable)' : '键盘快捷键：Ctrl+Enter (全大写)，Ctrl+Shift+Enter (全小写)，Ctrl+K (清空)，Ctrl+S (智能)，Ctrl+A (自动)，Ctrl+N (标准化)，Ctrl+F (修复)，Ctrl+R (可读性)'}
              </li>
              <li className="flex items-start gap-2">
                <FaStar className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {isEnglish ? 'New features: Smart case detection, Auto formatting, Text normalization, Error fixing' : '新功能：智能大小写检测、自动格式化、文本标准化、错误修复'}
              </li>
              <li className="flex items-start gap-2">
                <FaEye className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {isEnglish ? 'Enhanced tooltip: Auto-adaptive positioning, scrollable content, mobile-friendly design' : '增强提示框：自动适配定位、可滚动内容、移动端友好设计'}
              </li>
              <li className="flex items-start gap-2">
                <FaMobile className="mt-1 h-3 w-3 flex-shrink-0 text-slate-500" />
                {isEnglish ? 'Mobile support: Touch-friendly interface, responsive design, background overlay' : '移动端支持：触摸友好界面、响应式设计、背景遮罩'}
              </li>
            </ul>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
});

export { CaseConverter };

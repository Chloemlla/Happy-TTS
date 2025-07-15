import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VerifyCodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  loading?: boolean;
  error?: string;
  inputClassName?: string; // 新增
}

const BOX_STYLE =
  'w-12 h-14 sm:w-14 sm:h-16 mx-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-2xl sm:text-3xl text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-150 flex-1 min-w-0 shadow-none dark:text-white';

export const VerifyCodeInput: React.FC<VerifyCodeInputProps> = ({
  length = 8,
  onComplete,
  loading,
  error,
  inputClassName = '', // 新增
}) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // 自动提交
  useEffect(() => {
    if (values.every((v) => v.length === 1)) {
      onComplete(values.join(''));
    }
    // eslint-disable-next-line
  }, [values]);

  // 粘贴事件优化：支持任意输入框粘贴，自动分配
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, idx: number) => {
    const paste = e.clipboardData.getData('text').replace(/\s/g, '').slice(0, length);
    if (/^[a-zA-Z0-9]{1,8}$/.test(paste)) {
      const chars = paste.split('');
      setValues(prev => {
        const arr = [...prev];
        for (let i = 0; i < chars.length && idx + i < length; i++) {
          arr[idx + i] = chars[i];
        }
        return arr;
      });
    }
    e.preventDefault();
  };

  // 输入事件
  const handleChange = (idx: number, val: string) => {
    if (!val) {
      setValues((prev) => {
        const arr = [...prev];
        arr[idx] = '';
        return arr;
      });
      return;
    }
    const v = val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1);
    setValues((prev) => {
      const arr = [...prev];
      arr[idx] = v;
      return arr;
    });
    // 跳到下一个
    if (v && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  // 退格事件
  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (values[idx]) {
        setValues((prev) => {
          const arr = [...prev];
          arr[idx] = '';
          return arr;
        });
      } else if (idx > 0) {
        inputsRef.current[idx - 1]?.focus();
        setValues((prev) => {
          const arr = [...prev];
          arr[idx - 1] = '';
          return arr;
        });
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-center mb-4 w-full max-w-md gap-2">
        {Array.from({ length }).map((_, idx) => (
          <motion.input
            key={idx}
            ref={el => { inputsRef.current[idx] = el; }}
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            maxLength={1}
            className={BOX_STYLE + (error ? ' border-red-400 dark:border-red-500' : '') + ' ' + inputClassName}
            value={values[idx]}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={(e) => handlePaste(e, idx)}
            disabled={loading}
            style={{ transition: 'box-shadow 0.2s, border-color 0.2s' }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: values[idx] ? 1.08 : 1, opacity: 1, boxShadow: inputsRef.current[idx] === document.activeElement ? '0 0 0 2px #6366f1' : undefined, borderColor: inputsRef.current[idx] === document.activeElement ? '#6366f1' : undefined }}
            whileFocus={{ scale: 1.13, boxShadow: '0 0 0 3px #6366f1', borderColor: '#6366f1' }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.18, delay: idx * 0.03 }}
          />
        ))}
      </div>
      <AnimatePresence>
        {error && (
          <motion.div
            className="text-red-500 text-xs text-center mb-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VerifyCodeInput; 
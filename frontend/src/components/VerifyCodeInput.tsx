import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VerifyCodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  loading?: boolean;
  error?: string;
}

const BOX_STYLE =
  'w-10 h-12 sm:w-12 sm:h-14 mx-1 rounded-xl border-2 border-gray-200 bg-white text-2xl sm:text-3xl text-center font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-150';

export const VerifyCodeInput: React.FC<VerifyCodeInputProps> = ({
  length = 8,
  onComplete,
  loading,
  error,
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

  // 粘贴事件
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const paste = e.clipboardData.getData('text').replace(/\s/g, '').slice(0, length);
    if (/^[a-zA-Z0-9]{1,8}$/.test(paste)) {
      setValues(paste.split('').concat(Array(length - paste.length).fill('')));
      // 自动提交由 useEffect 触发
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
      <div className="flex justify-center mb-2">
        {Array.from({ length }).map((_, idx) => (
          <motion.input
            key={idx}
            ref={el => { inputsRef.current[idx] = el; }}
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            maxLength={1}
            className={BOX_STYLE + (error ? ' border-red-400' : '')}
            value={values[idx]}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            disabled={loading}
            style={{ transition: 'box-shadow 0.2s' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
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
import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import EmailSender from './EmailSender';

interface EmailSenderProps {
  to: string;
  subject: string;
  content: string;
  code: string;
  setTo: (v: string) => void;
  setSubject: (v: string) => void;
  setContent: (v: string) => void;
  setCode: (v: string) => void;
  loading: boolean;
  success: string;
  error: string;
  handleSend: () => void;
  isOutEmail?: boolean;
}

const OutEmail: React.FC = () => {
  // 这里只需在 OutEmail 组件中复用 EmailSender 的表单和校验逻辑，
  // 并传递 props 控制 API 路径、校验码输入、无需登录等差异。
  // 可通过 props 或 context 方式实现。
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSend = async () => {
    setError(''); setSuccess('');
    if (!to.trim() || !subject.trim() || !content.trim() || !code.trim()) {
      setError('请填写所有字段');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/outemail', {
        to,
        subject,
        content,
        code
      });
      if (res.data.success) {
        setSuccess('邮件发送成功！');
        setTo(''); setSubject(''); setContent(''); setCode('');
      } else {
        setError(res.data.error || '发送失败');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <motion.div 
        className="w-full max-w-lg bg-white rounded-xl shadow-lg p-4 sm:p-8 m-0"
        style={{ boxSizing: 'border-box' }}
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 120 }}
      >
        <h2 className="text-2xl font-bold mb-6">对外邮件发送</h2>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        {success && <div className="text-green-600 mb-4">{success}</div>}
        <EmailSender
          to={to}
          subject={subject}
          content={content}
          code={code}
          setTo={setTo}
          setSubject={setSubject}
          setContent={setContent}
          setCode={setCode}
          loading={loading}
          success={success}
          error={error}
          handleSend={handleSend}
          isOutEmail={true} // 标识为对外邮件发送
        />
      </motion.div>
    </div>
  );
};

export default OutEmail; 
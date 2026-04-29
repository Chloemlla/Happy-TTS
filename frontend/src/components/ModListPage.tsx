import React from 'react';
import { Link } from 'react-router-dom';
import { FaExclamationTriangle, FaArrowLeft } from 'react-icons/fa';

const ModListPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] bg-gradient-to-br from-slate-50 via-white to-amber-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-amber-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <FaExclamationTriangle className="text-2xl" />
        </div>
        <h1 className="mt-6 text-center text-3xl font-black tracking-tight text-slate-900">
          ModList 已临时关闭
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-7 text-slate-600">
          当前前端已临时屏蔽 `ModListEditor` 的加载，以避免线上继续触发运行时异常。
          等对应问题修复后，再恢复该页面入口。
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            <FaArrowLeft />
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ModListPage; 

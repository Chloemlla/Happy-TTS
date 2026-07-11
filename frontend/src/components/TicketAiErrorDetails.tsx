import { FiAlertCircle } from "react-icons/fi";
import type { ITicketAiErrorDetails } from "../api/ticketApi";

interface TicketAiErrorDetailsProps {
  diagnostics: ITicketAiErrorDetails;
}

export function TicketAiErrorDetails({ diagnostics }: TicketAiErrorDetailsProps) {
  return (
    <details className="mt-3 rounded-[14px] border border-rose-200 bg-rose-50/80 p-3 text-slate-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-rose-700">
        <FiAlertCircle aria-hidden="true" />
        后端错误详情（仅管理员可见）
      </summary>

      <div className="mt-3 space-y-3 text-xs">
        <div className="rounded-[10px] border border-rose-100 bg-white/80 p-3">
          <div className="font-semibold text-slate-800">{diagnostics.summary}</div>
          <div className="mt-1 text-slate-500">
            类型：{diagnostics.reason} · 时间：{new Date(diagnostics.occurredAt).toLocaleString()}
          </div>
        </div>

        {diagnostics.attempts.length === 0 ? (
          <div className="text-slate-600">没有检测到可用的对话服务 Provider 配置。</div>
        ) : (
          diagnostics.attempts.map((attempt, index) => (
            <div
              key={`${attempt.baseUrl}-${attempt.model}-${index}`}
              className="rounded-[10px] border border-slate-200 bg-white p-3"
            >
              <div className="font-semibold text-slate-800">失败点 {index + 1}</div>
              <dl className="mt-2 grid gap-1 text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium">Provider：</dt>
                  <dd className="inline break-all">{attempt.baseUrl}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">模型：</dt>
                  <dd className="inline break-all">{attempt.model}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">HTTP 状态：</dt>
                  <dd className="inline">{attempt.status ?? "未知"}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">错误码：</dt>
                  <dd className="inline break-all">{attempt.code || "未知"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline font-medium">错误摘要：</dt>
                  <dd className="inline break-words">{attempt.message}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline font-medium">发生时间：</dt>
                  <dd className="inline">{new Date(attempt.occurredAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

import React from 'react';

interface HistoryRecord {
    fileName: string;
    text: string;
    timestamp: number;
}

interface HistoryListProps {
    records: HistoryRecord[];
}

export const HistoryList: React.FC<HistoryListProps> = ({ records }) => {
    if (records.length === 0) {
        return null;
    }

    return (
        <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">历史记录</h2>
            <div className="space-y-4">
                {records.map((record, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <div className="mb-2">
                            <span className="text-sm text-gray-600">
                                生成时间: {new Date(record.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <div className="mb-2">
                            <span className="text-sm text-gray-600">
                                文本内容: {record.text}
                            </span>
                        </div>
                        <audio controls className="w-full">
                            <source src={`/static/audio/${record.fileName}`} type={`audio/${record.fileName.split('.').pop()}`} />
                            您的浏览器不支持音频播放。
                        </audio>
                        <div className="mt-2 flex justify-between items-center">
                            <span className="text-sm text-gray-600">
                                文件名: {record.fileName}
                            </span>
                            <a
                                href={`/static/audio/${record.fileName}`}
                                download
                                className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center"
                            >
                                <span className="material-icons text-sm mr-1">download</span>
                                下载
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}; 
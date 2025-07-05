import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebugInfoModal } from './DebugInfoModal';

// Mock framer-motion
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>
    },
    AnimatePresence: ({ children }: any) => <div>{children}</div>
}));

describe('DebugInfoModal', () => {
    const mockDebugInfos = [
        {
            action: '开始Passkey认证',
            username: 'testuser',
            timestamp: '2024-01-01T00:00:00.000Z'
        },
        {
            action: 'Passkey认证API响应',
            status: 200,
            hasData: true,
            timestamp: '2024-01-01T00:00:01.000Z'
        }
    ];

    const defaultProps = {
        isOpen: true,
        onClose: jest.fn(),
        debugInfos: mockDebugInfos
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('应该正确渲染调试信息', () => {
        render(<DebugInfoModal {...defaultProps} />);
        
        expect(screen.getByText('Passkey 调试信息')).toBeInTheDocument();
        expect(screen.getByText('请将此信息提供给管理员进行问题诊断')).toBeInTheDocument();
        expect(screen.getByText('开始Passkey认证')).toBeInTheDocument();
        expect(screen.getByText('Passkey认证API响应')).toBeInTheDocument();
    });

    it('应该显示调试信息数量', () => {
        render(<DebugInfoModal {...defaultProps} />);
        
        expect(screen.getByText('共 2 条调试信息')).toBeInTheDocument();
    });

    it('应该能够关闭弹窗', () => {
        render(<DebugInfoModal {...defaultProps} />);
        
        const closeButton = screen.getByRole('button', { name: /关闭/i });
        fireEvent.click(closeButton);
        
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('应该能够复制调试信息', async () => {
        const mockClipboard = {
            writeText: jest.fn().mockResolvedValue(undefined)
        };
        Object.assign(navigator, { clipboard: mockClipboard });

        render(<DebugInfoModal {...defaultProps} />);
        
        const copyButton = screen.getByRole('button', { name: /复制调试信息/i });
        fireEvent.click(copyButton);
        
        expect(mockClipboard.writeText).toHaveBeenCalled();
    });

    it('当isOpen为false时不应该渲染', () => {
        render(<DebugInfoModal {...defaultProps} isOpen={false} />);
        
        expect(screen.queryByText('Passkey 调试信息')).not.toBeInTheDocument();
    });

    it('应该正确显示时间戳', () => {
        render(<DebugInfoModal {...defaultProps} />);
        
        // 检查时间戳是否被正确格式化显示
        const timestamps = screen.getAllByText(/^\d{1,2}:\d{2}:\d{2}$/);
        expect(timestamps.length).toBeGreaterThan(0);
    });
}); 
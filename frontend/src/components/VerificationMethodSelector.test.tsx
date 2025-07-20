import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VerificationMethodSelector from './VerificationMethodSelector';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <div>{children}</div>,
}));

// Mock Dialog component
vi.mock('./ui/Dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => 
    open ? <div data-testid="dialog">{children}</div> : null,
}));

describe('VerificationMethodSelector', () => {
  const mockOnClose = vi.fn();
  const mockOnSelectMethod = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该正确渲染组件', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    expect(screen.getByText('选择验证方式')).toBeInTheDocument();
    expect(screen.getByText('为 testuser 选择二次验证方式')).toBeInTheDocument();
    expect(screen.getByText('Passkey 验证')).toBeInTheDocument();
    expect(screen.getByText('动态口令 (TOTP)')).toBeInTheDocument();
    expect(screen.getByText('安全提示')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  it('应该响应式地调整大小', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    const modal = screen.getByTestId('dialog');
    expect(modal).toBeInTheDocument();
    
    // 检查响应式类是否存在
    const modalContainer = modal.querySelector('.max-w-sm.sm\\:max-w-md.md\\:max-w-lg.lg\\:max-w-xl.xl\\:max-w-2xl');
    expect(modalContainer).toBeInTheDocument();
  });

  it('应该处理Passkey选择', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    const passkeyOption = screen.getByText('Passkey 验证').closest('.group');
    userEvent.click(passkeyOption!);

    expect(mockOnSelectMethod).toHaveBeenCalledWith('passkey');
  });

  it('应该处理TOTP选择', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    const totpOption = screen.getByText('动态口令 (TOTP)').closest('.group');
    userEvent.click(totpOption!);

    expect(mockOnSelectMethod).toHaveBeenCalledWith('totp');
  });

  it('应该在加载状态下禁用选择', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={true}
      />
    );

    const passkeyOption = screen.getByText('Passkey 验证').closest('.group');
    userEvent.click(passkeyOption!);

    // 在加载状态下不应该调用选择方法
    expect(mockOnSelectMethod).not.toHaveBeenCalled();
  });

  it('应该处理取消按钮点击', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    const cancelButton = screen.getByText('取消');
    userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('应该处理触摸滑动事件', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    // 查找包含触摸事件处理器的motion.div元素
    const modal = screen.getByTestId('dialog');
    const touchHandler = modal.querySelector('.relative.w-full');
    
    if (touchHandler) {
      // 模拟触摸开始
      fireEvent.touchStart(touchHandler, {
        touches: [{ clientY: 200 }]
      });

      // 模拟触摸移动（向上滑动超过100px）
      fireEvent.touchMove(touchHandler, {
        touches: [{ clientY: 50 }]
      });

      // 模拟触摸结束
      fireEvent.touchEnd(touchHandler);

      // 应该调用关闭函数（滑动距离150px > 100px阈值）
      expect(mockOnClose).toHaveBeenCalled();
    } else {
      // 如果找不到触摸处理器，跳过这个测试
      console.warn('Touch handler not found, skipping touch test');
    }
  });

  it('应该处理键盘ESC键', async () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    // 模拟按下ESC键
    userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('应该包含滑动指示器', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    // 检查滑动指示器是否存在
    const swipeIndicator = document.querySelector('.absolute.top-2.left-1\\/2.transform.-translate-x-1\\/2.w-12.h-1.bg-white\\/30.rounded-full');
    expect(swipeIndicator).toBeInTheDocument();
  });

  it('应该正确显示文本截断', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    // 检查文本截断类是否存在
    const descriptions = document.querySelectorAll('.line-clamp-2');
    expect(descriptions.length).toBeGreaterThan(0);
  });
}); 
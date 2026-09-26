import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VerificationMethodSelector from '../components/VerificationMethodSelector';

// framer-motion 的替身由 vitest.setup.ts 统一提供（按标签惰性生成透传组件）。
// 这里曾经本身再 mock 一遗，而且只列了 motion.div：组件里的 motion.button / motion.p
// 拿到 undefined，React 报 "Element type is invalid"，10 个用例全部在渲染阶段就挂。
// 保留重复 mock 只会让两边不一致，所以删掉，让全局生效。

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
    // 副标题是「为 <span>{username}</span> 选择安全验证方式」（22607ecf 把「二次验证方式」改成了
    // 「安全验证方式」），用户名在 span 里。getByText 的默认匹配只拼元素的**直接**文本节点，
    // 所以整串永远匹配不上；必须拿 textContent 做函数匹配器，这样用户名插值仍在断言里。
    expect(
      screen.getByText((_, element) => element?.textContent === '为 testuser 选择安全验证方式')
    ).toBeInTheDocument();
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

    // 查找 modal 的 motion.div
    const modalContainer = document.querySelector('.relative.w-full');
    expect(modalContainer).toBeInTheDocument();
  });

  it('应该处理Passkey选择', async () => {
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

    // user-event v14 的 click 返回 Promise，事件在下一个宏任务才派发；不 await 的话
    // 断言永远看到 0 次调用（本套件四个 click 用例都是这么挂的）。
    await waitFor(() => {
      expect(mockOnSelectMethod).toHaveBeenCalledWith('passkey');
    });
  });

  it('应该处理TOTP选择', async () => {
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

    await waitFor(() => {
      expect(mockOnSelectMethod).toHaveBeenCalledWith('totp');
    });
  });

  it('应该在加载状态下禁用选择', async () => {
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
    await userEvent.click(passkeyOption!);

    // 在加载状态下不应该调用选择方法。这里必须 await：不 await 的话事件还没派发，
    // not.toHaveBeenCalled() 恒真，就算禁用的守卫被删掉这条用例也照样绿。
    expect(mockOnSelectMethod).not.toHaveBeenCalled();
  });

  it('应该处理取消按钮点击', async () => {
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

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
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
    const touchHandler = document.querySelector('.relative.w-full');
    // 原来是 if (touchHandler) {...} else { console.warn('skipping') }：面板一旦消失，
    // 这条用例会静默通过。改成硬断言，缺面板就是失败。
    expect(touchHandler).toBeInTheDocument();

    // 模拟触摸开始
    fireEvent.touchStart(touchHandler!, {
      touches: [{ clientY: 200 }]
    });
    // 模拟触摸移动（向上滑动超过100px）
    fireEvent.touchMove(touchHandler!, {
      touches: [{ clientY: 50 }]
    });
    // 模拟触摸结束
    fireEvent.touchEnd(touchHandler!);
    // 应该调用关闭函数（滑动距离150px > 100px阈值）
    expect(mockOnClose).toHaveBeenCalled();
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

  it('应该提供可滑动的面板', () => {
    render(
      <VerificationMethodSelector
        isOpen={true}
        onClose={mockOnClose}
        onSelectMethod={mockOnSelectMethod}
        username="testuser"
        loading={false}
      />
    );

    // 旧版面板顶部有一条 `.absolute.top-2.left-1/2 ... bg-white/30` 的白色圆角把手做滑动提示，
    // 22607ecf 改版时删掉了这条装饰（本用例写下的 51787b65 里它就已经不存在，所以从来没绿过）。
    // 滑动关闭的能力没有删：onTouchStart/onTouchMove/onTouchEnd 现在挂在整块面板上。
    // 断言仍然钉住同一件事——存在一块承担滑动手势的面板本体，且它就是可滚动的那块。
    const swipeSurface = document.querySelector('.relative.w-full');
    expect(swipeSurface).toBeInTheDocument();
    expect(swipeSurface!.className).toContain('max-h-[90vh]');
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

    // 22607ecf 改版后描述文字不再用 line-clamp-2 截断（那是旧版的类），标题改用 truncate 防止
    // 长方法名撑破卡片。断言跟着契约走：两条验证方式的标题都必须带 truncate。
    expect(screen.getByText('Passkey 验证').className).toContain('truncate');
    expect(screen.getByText('动态口令 (TOTP)').className).toContain('truncate');
  });
}); 
import React from 'react';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TOTPSetup from '../components/TOTPSetup';
import { vi } from 'vitest';

// Mock the API module instead of axios directly
vi.mock('../api/api', () => ({
  api: {
    post: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/totp/generate-setup')) {
        return Promise.resolve({
          data: {
            otpauthUrl: 'otpauth://totp/xxx',
            secret: 'MOCKSECRET',
            backupCodes: ['CODE1', 'CODE2']
          }
        });
      }
      if (url.includes('/api/totp/verify-and-enable')) {
        return Promise.resolve({ data: {} });
      }
      return Promise.resolve({ data: {} });
    }),
    get: vi.fn(),
  },
}));

describe('TOTPSetup 组件', () => {
  it('弹窗打开时能正常渲染', async () => {
    render(<TOTPSetup isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => {
      // 标题现在是「启用 TOTP」（旧断言钉的是已经被改掉的文案「二次验证」）。
      expect(screen.getByText('启用 TOTP')).toBeInTheDocument();
    });
  });

  it('显示二维码说明文字', async () => {
    render(<TOTPSetup isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => {
      // 组件里只有「使用认证器应用扫描」这一句（旧正则要求的整串包了「QR码」与 Google
      // Authenticator 字样，文案改版后就不存在了）。这里必须用单一精确串：
      // getByText 传正则时会把所有文本节点去匹配，多命中会抛 Found multiple elements。
      expect(screen.getByText('使用认证器应用扫描')).toBeInTheDocument();
    });
  });

  it('点击取消按钮会调用onClose', async () => {
    const onClose = vi.fn();
    render(<TOTPSetup isOpen={true} onClose={onClose} onSuccess={vi.fn()} />);
    const cancelBtn = await waitFor(() => screen.getByText('取消'));
    userEvent.click(cancelBtn);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
}); 
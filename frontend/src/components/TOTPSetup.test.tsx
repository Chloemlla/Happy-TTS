import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TOTPSetup from './TOTPSetup';
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
      expect(screen.getByText('二次验证')).toBeInTheDocument();
    });
  });

  it('显示二维码说明文字', async () => {
    render(<TOTPSetup isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByText(/使用认证器应用扫描QR码|使用Google Authenticator/)
      ).toBeInTheDocument();
    });
  });

  it('点击取消按钮会调用onClose', async () => {
    const onClose = vi.fn();
    render(<TOTPSetup isOpen={true} onClose={onClose} onSuccess={vi.fn()} />);
    const cancelBtn = await waitFor(() => screen.getByText('取消'));
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
}); 
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DeviceSessionsPanel from './DeviceSessionsPanel';
import { normalizeDeviceSession } from './profileHelpers';

const sessions = [
  {
    id: 'web-current',
    deviceName: 'Chrome on Windows',
    client: 'Web',
    platform: 'Windows',
    lastActiveAt: '2026-08-03T10:00:00.000Z',
    ip: '203.0.113.10',
    ipLocation: '上海',
    isCurrent: true,
  },
  {
    id: 'piliplus-1',
    deviceName: 'PiliPlus',
    client: 'PiliPlus',
    platform: 'Android',
    lastActiveAt: '2026-08-03T09:00:00.000Z',
    ip: '203.0.113.11',
    ipLocation: '北京',
    isCurrent: false,
  },
];

describe('DeviceSessionsPanel', () => {
  it('does not render an executable logout button for the current Profile device', () => {
    render(
      <DeviceSessionsPanel
        sessions={sessions}
        loading={false}
        error={null}
        securitySessionActive={true}
        actionLoading={false}
        onRefresh={vi.fn()}
        onRequestVerification={vi.fn()}
        onLogoutAll={vi.fn()}
      />,
    );

    const currentCard = screen.getByText('当前 Profile 设备').closest('article');
    expect(currentCard).toBeInTheDocument();
    expect(currentCard?.querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: '退出其他全部会话' })).toBeInTheDocument();
  });

  it('requests security verification before logout when the security session is inactive', async () => {
    const user = userEvent.setup();
    const onRequestVerification = vi.fn();

    render(
      <DeviceSessionsPanel
        sessions={sessions}
        loading={false}
        error={null}
        securitySessionActive={false}
        actionLoading={false}
        onRefresh={vi.fn()}
        onRequestVerification={onRequestVerification}
        onLogoutAll={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '验证后退出其他会话' }));
    expect(onRequestVerification).toHaveBeenCalledTimes(1);
  });

  it('normalizes the backend device shape and current marker', () => {
    expect(normalizeDeviceSession({
      sessionId: 'client-1',
      name: 'Synapse Client',
      clientName: 'Synapse-Client',
      os: 'Android',
      lastSeen: '2026-08-03T09:00:00.000Z',
      ipAddress: '203.0.113.12',
      location: '广东',
    }, 'web-current')).toEqual({
      id: 'client-1',
      deviceName: 'Synapse Client',
      client: 'Synapse-Client',
      platform: 'Android',
      lastActiveAt: '2026-08-03T09:00:00.000Z',
      ip: '203.0.113.12',
      ipLocation: '广东',
      isCurrent: false,
    });
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import { ipCheckMiddleware } from '../middleware/ipCheck';
import { Request, Response } from 'express';
import { config } from '../config/config';

describe('IP Check Middleware', () => {
  let mockRequest: { 
    ip?: string; 
    headers: { [key: string]: string }; 
  };
  let mockResponse: { 
    status: jest.Mock; 
    json: jest.Mock;
    send: jest.Mock;
  };
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    nextFunction = jest.fn();
  });

  it('应该允许本地IP访问', () => {
    mockRequest.ip = '127.0.0.1';
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该允许白名单IP访问', () => {
    mockRequest.ip = config.localIps[0];
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该处理X-Forwarded-For头', () => {
    mockRequest.headers['x-forwarded-for'] = '192.168.1.1, 10.0.0.1';
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(mockRequest.ip).toBe('192.168.1.1');
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该处理X-Real-IP头', () => {
    mockRequest.headers['x-real-ip'] = '192.168.1.1';
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(mockRequest.ip).toBe('192.168.1.1');
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该正确处理IPv6地址', () => {
    mockRequest.ip = '::1';
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该正确处理无效IP地址', () => {
    mockRequest.ip = 'invalid-ip';
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: '无效的IP地址' });
  });

  it('应该正确处理缺少IP信息的请求', () => {
    mockRequest.ip = undefined;
    mockRequest.headers = {};
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: '无法确定客户端IP' });
  });

  it('应该记录IP访问日志', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    mockRequest.ip = '192.168.1.1';
    ipCheckMiddleware(mockRequest as unknown as Request, mockResponse as unknown as Response, nextFunction);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('192.168.1.1'));
    consoleSpy.mockRestore();
  });
}); 
import { describe, expect, it, jest } from '@jest/globals';
import { tamperProtectionMiddleware } from '../middleware/tamperProtection';
import { Request, Response, NextFunction } from 'express';
import { signContent } from '../utils/sign';

describe('Tamper Protection Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      method: 'GET'
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    } as Partial<Response>;
    nextFunction = jest.fn();
  });

  it('应该允许没有签名的GET请求通过', () => {
    mockRequest.method = 'GET';
    tamperProtectionMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该验证有效的签名', () => {
    const testData = { test: 'data' };
    const timestamp = Date.now();
    const signature = signContent(JSON.stringify(testData) + timestamp);

    mockRequest.method = 'POST';
    mockRequest.body = testData;
    mockRequest.headers = {
      'x-timestamp': timestamp.toString(),
      'x-signature': signature
    };

    tamperProtectionMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('应该拒绝无效的签名', () => {
    const testData = { test: 'data' };
    const timestamp = Date.now();
    const invalidSignature = 'invalid-signature';

    mockRequest.method = 'POST';
    mockRequest.body = testData;
    mockRequest.headers = {
      'x-timestamp': timestamp.toString(),
      'x-signature': invalidSignature
    };

    tamperProtectionMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: '签名验证失败' });
  });

  it('应该拒绝过期的请求', () => {
    const testData = { test: 'data' };
    const timestamp = Date.now() - 1000 * 60 * 6; // 6分钟前
    const signature = signContent(JSON.stringify(testData) + timestamp);

    mockRequest.method = 'POST';
    mockRequest.body = testData;
    mockRequest.headers = {
      'x-timestamp': timestamp.toString(),
      'x-signature': signature
    };

    tamperProtectionMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: '请求已过期' });
  });

  it('应该处理缺少时间戳的请求', () => {
    const testData = { test: 'data' };
    const signature = signContent(JSON.stringify(testData));

    mockRequest.method = 'POST';
    mockRequest.body = testData;
    mockRequest.headers = {
      'x-signature': signature
    };

    tamperProtectionMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: '缺少时间戳' });
  });

  it('应该处理缺少签名的请求', () => {
    const testData = { test: 'data' };
    const timestamp = Date.now();

    mockRequest.method = 'POST';
    mockRequest.body = testData;
    mockRequest.headers = {
      'x-timestamp': timestamp.toString()
    };

    tamperProtectionMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: '缺少签名' });
  });
}); 
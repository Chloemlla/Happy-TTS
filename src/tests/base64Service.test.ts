import { NetworkService } from '../services/networkService';

describe('NetworkService - Base64', () => {
  describe('base64Operation', () => {
    it('应该成功进行Base64编码', () => {
      const result = NetworkService.base64Operation('encode', '123456');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('MTIzNDU2');
    });

    it('应该成功进行Base64解码', () => {
      const result = NetworkService.base64Operation('decode', 'MTIzNDU2');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('123456');
    });

    it('应该处理中文编码', () => {
      const result = NetworkService.base64Operation('encode', '你好世界');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('5L2g5aW95LiW55WM');
    });

    it('应该处理中文解码', () => {
      const result = NetworkService.base64Operation('decode', '5L2g5aW95LiW55WM');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('你好世界');
    });

    it('应该处理特殊字符编码', () => {
      const result = NetworkService.base64Operation('encode', 'Hello@World#123');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('SGVsbG9AV29ybGQjMTIz');
    });

    it('应该处理特殊字符解码', () => {
      const result = NetworkService.base64Operation('decode', 'SGVsbG9AV29ybGQjMTIz');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('Hello@World#123');
    });

    it('应该处理空文本', () => {
      const result = NetworkService.base64Operation('encode', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('操作文本不能为空');
    });

    it('应该处理null文本', () => {
      const result = NetworkService.base64Operation('encode', null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('操作文本不能为空');
    });

    it('应该处理无效的操作类型', () => {
      const result = NetworkService.base64Operation('invalid' as any, '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('操作类型必须是 encode(编码) 或 decode(解码)');
    });

    it('应该处理无效的Base64字符串解码', () => {
      const result = NetworkService.base64Operation('decode', 'invalid-base64!@#');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Base64解码失败：输入不是有效的Base64字符串');
    });

    it('应该处理不完整的Base64字符串', () => {
      const result = NetworkService.base64Operation('decode', 'MTIzNDU');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Base64解码失败：输入不是有效的Base64字符串');
    });

    it('应该处理包含非Base64字符的字符串', () => {
      const result = NetworkService.base64Operation('decode', 'MTIzNDU2!@#');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Base64解码失败：输入不是有效的Base64字符串');
    });

    it('应该处理编码解码的往返测试', () => {
      const originalText = 'Hello World 你好世界 123!@#';
      
      // 先编码
      const encodeResult = NetworkService.base64Operation('encode', originalText);
      expect(encodeResult.success).toBe(true);
      
      // 再解码
      const decodeResult = NetworkService.base64Operation('decode', encodeResult.data.data);
      expect(decodeResult.success).toBe(true);
      
      // 验证结果一致
      expect(decodeResult.data.data).toBe(originalText);
    });
  });
}); 
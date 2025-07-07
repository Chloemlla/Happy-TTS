import axios from 'axios';
import { NetworkService } from '../services/networkService';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock axios.isAxiosError
(axios.isAxiosError as any) = jest.fn((error) => {
  return error && error.isAxiosError === true;
});

// 创建正确的axios错误对象
const createAxiosError = (config: any) => {
  const error = new Error(config.message || 'Axios Error') as any;
  error.isAxiosError = true;
  error.config = config;
  error.response = config.response;
  error.request = config.request;
  return error;
};

describe('NetworkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('douyinHot', () => {
    it('应该成功获取抖音热榜数据', async () => {
      // Mock 成功的响应
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: [
            {
              word: '测试热榜标题',
              hot_value: 1000000,
              position: 1,
              event_time: 1735533481,
              video_count: 3,
              word_cover: {
                uri: 'test-uri',
                url_list: ['https://example.com/image1.jpg']
              },
              label: 3,
              group_id: 'test-group-id',
              sentence_id: 'test-sentence-id',
              sentence_tag: 5000,
              word_type: 1,
              article_detail_count: 0,
              discuss_video_count: 1,
              display_style: 0,
              can_extend_detail: false,
              hotlist_param: '{"version":1}',
              related_words: null,
              word_sub_board: null,
              aweme_infos: null,
              drift_info: null
            }
          ],
          request_id: 'test-request-id'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/douyinhot',
        { timeout: 15000 }
      );
    });

    it('应该处理网络错误', async () => {
      // Mock 网络错误
      const networkError = new Error('Network Error');
      mockedAxios.get.mockRejectedValueOnce(networkError);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network Error');
    });

    it('应该处理HTTP错误响应', async () => {
      // Mock HTTP错误响应
      const httpError = createAxiosError({
        response: {
          status: 500,
          data: { message: '服务器内部错误' }
        }
      });
      mockedAxios.get.mockRejectedValueOnce(httpError);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(false);
      expect(result.error).toBe('抖音热榜获取失败: 500 - 服务器内部错误');
    });

    it('应该处理请求超时', async () => {
      // Mock 请求超时
      const timeoutError = createAxiosError({
        request: {},
        message: 'timeout of 15000ms exceeded'
      });
      mockedAxios.get.mockRejectedValueOnce(timeoutError);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(false);
      expect(result.error).toBe('抖音热榜服务无响应，请稍后重试');
    });

    it('应该处理空响应数据', async () => {
      // Mock 空响应
      const emptyResponse = { data: null };
      mockedAxios.get.mockResolvedValueOnce(emptyResponse);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('hashEncrypt', () => {
    it('应该成功进行MD5加密', () => {
      const result = NetworkService.hashEncrypt('md5', '123456');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('e10adc3949ba59abbe56e057f20f883e');
    });

    it('应该成功进行SHA1加密', () => {
      const result = NetworkService.hashEncrypt('sha1', '123456');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('7c4a8d09ca3762af61e59520943dc26494f8941b');
    });

    it('应该成功进行SHA256加密', () => {
      const result = NetworkService.hashEncrypt('sha256', '123456');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
    });

    it('应该成功进行SHA512加密', () => {
      const result = NetworkService.hashEncrypt('sha512', '123456');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('ba3253876aed6bc22d4a6ff53d8406c6ad864195ed144ab5c87621b6c233b548baeae6956df346ec8c17f5ea10f35ee3cbc514797ed7ddd3145464e2a0bab413');
    });

    it('应该处理MD4加密（使用MD5替代）', () => {
      const result = NetworkService.hashEncrypt('md4', '123456');

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe('数据请求成功');
      expect(result.data.data).toBe('e10adc3949ba59abbe56e057f20f883e'); // MD5结果
    });

    it('应该处理空文本', () => {
      const result = NetworkService.hashEncrypt('md5', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('加密文本不能为空');
    });

    it('应该处理不支持的算法', () => {
      const result = NetworkService.hashEncrypt('invalid' as any, '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('不支持的加密算法: invalid。支持的算法: md4, md5, sha1, sha256, sha512');
    });

    it('应该处理null文本', () => {
      const result = NetworkService.hashEncrypt('md5', null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('加密文本不能为空');
    });

    it('应该处理空白文本', () => {
      const result = NetworkService.hashEncrypt('md5', '   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('加密文本不能为空');
    });
  });

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

  describe('tcpPing', () => {
    it('应该成功进行TCP连接检测', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '连接成功',
          data: { address: '8.8.8.8', port: 53, status: 'open' }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.tcpPing('8.8.8.8', 53);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/tcping',
        {
          params: { address: '8.8.8.8', port: 53 },
          timeout: 10000
        }
      );
    });
  });

  describe('ping', () => {
    it('应该成功进行Ping检测', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Ping成功',
          data: { url: 'https://www.baidu.com', response_time: 50 }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.ping('https://www.baidu.com');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/ping',
        {
          params: { url: 'https://www.baidu.com' },
          timeout: 15000
        }
      );
    });
  });

  describe('speedTest', () => {
    it('应该成功进行网站测速', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '测速完成',
          data: { url: 'https://www.google.com', speed: '1.2s' }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.speedTest('https://www.google.com');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/speed',
        {
          params: { url: 'https://www.google.com' },
          timeout: 30000
        }
      );
    });
  });

  describe('portScan', () => {
    it('应该成功进行端口扫描', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '扫描完成',
          data: { address: '8.8.8.8', open_ports: [53, 80, 443] }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.portScan('8.8.8.8');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/portscan',
        {
          params: { address: '8.8.8.8' },
          timeout: 60000
        }
      );
    });
  });

  describe('ipQuery', () => {
    it('应该成功进行IP查询', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '查询成功',
          data: {
            ip: '8.8.8.8',
            country: '美国',
            province: '加利福尼亚州',
            city: '山景城',
            isp: 'Google LLC'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.ipQuery('8.8.8.8');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/ipv2',
        {
          params: { ip: '8.8.8.8' },
          timeout: 10000
        }
      );
    });
  });

  describe('randomQuote', () => {
    it('应该成功获取一言', async () => {
      const mockResponse = {
        data: {
          code: '200',
          data: '生活就像一盒巧克力，你永远不知道下一颗是什么味道。',
          msg: '获取成功'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomQuote('hitokoto');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/yiyan',
        {
          params: { type: 'hitokoto' },
          timeout: 8000
        }
      );
    });

    it('应该成功获取古诗词', async () => {
      const mockResponse = {
        data: {
          code: '200',
          data: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
          msg: '获取成功'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomQuote('poetry');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/yiyan',
        {
          params: { type: 'poetry' },
          timeout: 8000
        }
      );
    });
  });
}); 
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

describe('NetworkService - FLAC to MP3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('flacToMp3', () => {
    it('应该成功转换FLAC到MP3（JSON返回）', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: 'https://cdn.xxhzm.cn/v2api/cache/tmp/eccff0986cfb04e146db63e6d108b35e88fb1dff.mp3',
          request_id: '6ed78b93988a3305ab75649f'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.flacToMp3('https://example.com/audio.flac', 'json');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/flactomp3?url=https%3A%2F%2Fexample.com%2Faudio.flac&return=json',
        {
          timeout: 60000,
          maxRedirects: 5
        }
      );
    });

    it('应该成功转换FLAC到MP3（302返回）', async () => {
      const mockResponse = {
        data: 'https://cdn.xxhzm.cn/v2api/cache/tmp/eccff0986cfb04e146db63e6d108b35e88fb1dff.mp3'
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.flacToMp3('https://example.com/audio.flac', '302');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/flactomp3?url=https%3A%2F%2Fexample.com%2Faudio.flac&return=302',
        {
          timeout: 60000,
          maxRedirects: 5
        }
      );
    });

    it('应该处理空URL参数', async () => {
      const result = await NetworkService.flacToMp3('', 'json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('URL参数不能为空');
    });

    it('应该处理null URL参数', async () => {
      const result = await NetworkService.flacToMp3(null as any, 'json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('URL参数不能为空');
    });

    it('应该处理无效URL格式', async () => {
      const result = await NetworkService.flacToMp3('invalid-url', 'json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('URL格式不正确');
    });

    it('应该处理HTTP错误响应', async () => {
      const httpError = createAxiosError({
        response: {
          status: 500,
          data: { message: '服务器内部错误' }
        }
      });
      mockedAxios.get.mockRejectedValueOnce(httpError);

      const result = await NetworkService.flacToMp3('https://example.com/audio.flac', 'json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('FLAC转MP3转换失败: 500 - 服务器内部错误');
    });

    it('应该处理请求超时', async () => {
      const timeoutError = createAxiosError({
        request: {},
        message: 'timeout of 60000ms exceeded'
      });
      mockedAxios.get.mockRejectedValueOnce(timeoutError);

      const result = await NetworkService.flacToMp3('https://example.com/audio.flac', 'json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('音频转换服务无响应，请稍后重试');
    });

    it('应该处理网络错误', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.get.mockRejectedValueOnce(networkError);

      const result = await NetworkService.flacToMp3('https://example.com/audio.flac', 'json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('FLAC转MP3转换失败: Network Error');
    });

    it('应该使用默认JSON返回类型', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: 'https://example.com/converted.mp3'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.flacToMp3('https://example.com/audio.flac');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/flactomp3?url=https%3A%2F%2Fexample.com%2Faudio.flac&return=json',
        {
          timeout: 60000,
          maxRedirects: 5
        }
      );
    });
  });
}); 
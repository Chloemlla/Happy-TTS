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

describe('NetworkService - 随机驾考题目', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('randomJiakao', () => {
    it('应该成功获取科目1题目（判断题）', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: {
            answer: '对',
            chapter: '道路通行条件及通行规定',
            explain: '《道路交通安全法》第六十八条：机动车在高速公路上发生故障时，应当依照本法第五十二条的有关规定办理；警告标志应当设置在故障车来车方向一百五十米以外，车上人员应当迅速转移到右侧路肩上或者应急车道内，并且迅速报警。',
            question: '机动车在高速公路上发生故障时，将车上人员迅速转移到右侧路肩上或者应急车道内，并且迅速报警。',
            type: 'C1,C2,C3'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomJiakao('1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/jiakao?subject=1',
        {
          timeout: 15000,
          maxRedirects: 3
        }
      );
    });

    it('应该成功获取科目4题目（选择题）', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: {
            answer: 'B',
            chapter: '驾驶证和机动车管理规定',
            explain: 'A2为重型牵引挂车；B1为中型客车；B2为大型货车；A1为大型客车。',
            option1: 'A、A2',
            option2: 'B、B1',
            option3: 'C、B2',
            option4: 'D、A1',
            question: '中型客车的车型代号是什么?',
            type: 'C1,C2,C3'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomJiakao('4');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/jiakao?subject=4',
        {
          timeout: 15000,
          maxRedirects: 3
        }
      );
    });

    it('应该处理无效的科目参数', async () => {
      const result = await NetworkService.randomJiakao('2' as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('科目参数必须是 1(科目1) 或 4(科目4)');
    });

    it('应该处理空科目参数', async () => {
      const result = await NetworkService.randomJiakao('' as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('科目参数必须是 1(科目1) 或 4(科目4)');
    });

    it('应该处理null科目参数', async () => {
      const result = await NetworkService.randomJiakao(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('科目参数必须是 1(科目1) 或 4(科目4)');
    });

    it('应该处理HTTP错误响应', async () => {
      const httpError = createAxiosError({
        response: {
          status: 500,
          data: { message: '服务器内部错误' }
        }
      });
      mockedAxios.get.mockRejectedValueOnce(httpError);

      const result = await NetworkService.randomJiakao('1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('随机驾考题目获取失败: 500 - 服务器内部错误');
    });

    it('应该处理请求超时', async () => {
      const timeoutError = createAxiosError({
        request: {},
        message: 'timeout of 15000ms exceeded'
      });
      mockedAxios.get.mockRejectedValueOnce(timeoutError);

      const result = await NetworkService.randomJiakao('1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('驾考题目服务无响应，请稍后重试');
    });

    it('应该处理网络错误', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.get.mockRejectedValueOnce(networkError);

      const result = await NetworkService.randomJiakao('1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('随机驾考题目获取失败: Network Error');
    });

    it('应该处理空响应数据', async () => {
      const emptyResponse = { data: null };
      mockedAxios.get.mockResolvedValueOnce(emptyResponse);

      const result = await NetworkService.randomJiakao('1');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('应该验证科目1题目数据结构', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: {
            answer: '对',
            chapter: '道路通行条件及通行规定',
            explain: '相关法律条文解释',
            question: '测试题目内容',
            type: 'C1,C2,C3'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomJiakao('1');

      expect(result.success).toBe(true);
      expect(result.data.data).toHaveProperty('question');
      expect(result.data.data).toHaveProperty('answer');
      expect(result.data.data).toHaveProperty('chapter');
      expect(result.data.data).toHaveProperty('explain');
      expect(result.data.data).toHaveProperty('type');
    });

    it('应该验证科目4题目数据结构', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: '数据请求成功',
          data: {
            answer: 'B',
            chapter: '驾驶证和机动车管理规定',
            explain: '选项解释',
            option1: 'A、选项1',
            option2: 'B、选项2',
            option3: 'C、选项3',
            option4: 'D、选项4',
            question: '测试选择题',
            type: 'C1,C2,C3'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomJiakao('4');

      expect(result.success).toBe(true);
      expect(result.data.data).toHaveProperty('question');
      expect(result.data.data).toHaveProperty('answer');
      expect(result.data.data).toHaveProperty('chapter');
      expect(result.data.data).toHaveProperty('explain');
      expect(result.data.data).toHaveProperty('type');
      expect(result.data.data).toHaveProperty('option1');
      expect(result.data.data).toHaveProperty('option2');
      expect(result.data.data).toHaveProperty('option3');
      expect(result.data.data).toHaveProperty('option4');
    });
  });
}); 
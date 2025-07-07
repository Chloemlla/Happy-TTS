import { Request, Response } from 'express';
import { NetworkController } from '../controllers/networkController';
import { NetworkService } from '../services/networkService';

// Mock NetworkService
jest.mock('../services/networkService');
const mockedNetworkService = NetworkService as jest.Mocked<typeof NetworkService>;

describe('NetworkController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockRequest = {
      query: {},
      headers: {
        'user-agent': 'test-user-agent'
      },
      ip: '127.0.0.1'
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus
    };

    jest.clearAllMocks();
  });

  describe('douyinHot', () => {
    it('应该成功获取抖音热榜数据', async () => {
      const mockData = {
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
      };

      mockedNetworkService.douyinHot.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.douyinHot(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.douyinHot).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: '抖音热榜获取完成',
        data: mockData
      });
    });

    it('应该处理服务失败', async () => {
      mockedNetworkService.douyinHot.mockResolvedValue({
        success: false,
        error: '服务暂时不可用'
      });

      await NetworkController.douyinHot(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: '服务暂时不可用'
      });
    });

    it('应该处理异常', async () => {
      const error = new Error('测试异常');
      mockedNetworkService.douyinHot.mockRejectedValue(error);

      await NetworkController.douyinHot(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: '测试异常'
      });
    });
  });

  describe('tcpPing', () => {
    it('应该成功进行TCP连接检测', async () => {
      mockRequest.query = { address: '8.8.8.8', port: '53' };

      const mockData = {
        code: 200,
        msg: '连接成功',
        data: { address: '8.8.8.8', port: 53, status: 'open' }
      };

      mockedNetworkService.tcpPing.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.tcpPing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.tcpPing).toHaveBeenCalledWith('8.8.8.8', 53);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'TCP连接检测完成',
        data: mockData
      });
    });

    it('应该验证必需的参数', async () => {
      mockRequest.query = {};

      await NetworkController.tcpPing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: '地址参数不能为空'
      });
    });

    it('应该验证端口参数格式', async () => {
      mockRequest.query = { address: '8.8.8.8', port: 'invalid' };

      await NetworkController.tcpPing(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: '端口参数必须是1-65535之间的数字'
      });
    });
  });

  describe('ping', () => {
    it('应该成功进行Ping检测', async () => {
      mockRequest.query = { url: 'https://www.baidu.com' };

      const mockData = {
        code: 200,
        msg: 'Ping成功',
        data: { url: 'https://www.baidu.com', response_time: 50 }
      };

      mockedNetworkService.ping.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.ping(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.ping).toHaveBeenCalledWith('https://www.baidu.com');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Ping检测完成',
        data: mockData
      });
    });

    it('应该验证URL参数', async () => {
      mockRequest.query = {};

      await NetworkController.ping(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'URL参数不能为空'
      });
    });
  });

  describe('speedTest', () => {
    it('应该成功进行网站测速', async () => {
      mockRequest.query = { url: 'https://www.google.com' };

      const mockData = {
        code: 200,
        msg: '测速完成',
        data: { url: 'https://www.google.com', speed: '1.2s' }
      };

      mockedNetworkService.speedTest.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.speedTest(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.speedTest).toHaveBeenCalledWith('https://www.google.com');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: '网站测速完成',
        data: mockData
      });
    });
  });

  describe('portScan', () => {
    it('应该成功进行端口扫描', async () => {
      mockRequest.query = { address: '8.8.8.8' };

      const mockData = {
        code: 200,
        msg: '扫描完成',
        data: { address: '8.8.8.8', open_ports: [53, 80, 443] }
      };

      mockedNetworkService.portScan.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.portScan(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.portScan).toHaveBeenCalledWith('8.8.8.8');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: '端口扫描完成',
        data: mockData
      });
    });
  });

  describe('ipQuery', () => {
    it('应该成功进行IP查询', async () => {
      mockRequest.query = { ip: '8.8.8.8' };

      const mockData = {
        code: 200,
        msg: '查询成功',
        data: {
          ip: '8.8.8.8',
          country: '美国',
          province: '加利福尼亚州',
          city: '山景城',
          isp: 'Google LLC'
        }
      };

      mockedNetworkService.ipQuery.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.ipQuery(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.ipQuery).toHaveBeenCalledWith('8.8.8.8');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: '精准IP查询完成',
        data: mockData
      });
    });

    it('应该验证IP参数', async () => {
      mockRequest.query = {};

      await NetworkController.ipQuery(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'IP参数不能为空'
      });
    });

    it('应该验证IP格式', async () => {
      mockRequest.query = { ip: 'invalid-ip' };

      await NetworkController.ipQuery(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'IP地址格式不正确'
      });
    });
  });

  describe('randomQuote', () => {
    it('应该成功获取一言', async () => {
      mockRequest.query = { type: 'hitokoto' };

      const mockData = {
        code: '200',
        data: '生活就像一盒巧克力，你永远不知道下一颗是什么味道。',
        msg: '获取成功'
      };

      mockedNetworkService.randomQuote.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.randomQuote(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.randomQuote).toHaveBeenCalledWith('hitokoto');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: '随机一言古诗词获取完成',
        data: mockData
      });
    });

    it('应该成功获取古诗词', async () => {
      mockRequest.query = { type: 'poetry' };

      const mockData = {
        code: '200',
        data: '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
        msg: '获取成功'
      };

      mockedNetworkService.randomQuote.mockResolvedValue({
        success: true,
        data: mockData
      });

      await NetworkController.randomQuote(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockedNetworkService.randomQuote).toHaveBeenCalledWith('poetry');
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: '随机一言古诗词获取完成',
        data: mockData
      });
    });

    it('应该验证类型参数', async () => {
      mockRequest.query = {};

      await NetworkController.randomQuote(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: '类型参数不能为空'
      });
    });

    it('应该验证类型参数值', async () => {
      mockRequest.query = { type: 'invalid' };

      await NetworkController.randomQuote(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: '类型参数必须是 hitokoto(一言) 或 poetry(古诗词)'
      });
    });
  });
}); 
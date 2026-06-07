import axios from "axios";
import { config } from "../config/config";
import { InternalServiceClientError } from "../services/internalServiceClient";
import { NetworkService } from "../services/networkService";
import { rustNetworkToolsClient } from "../services/rustNetworkToolsClient";

// Mock axios
jest.mock("axios");
jest.mock("../services/rustNetworkToolsClient", () => ({
  rustNetworkToolsClient: {
    tcpPing: jest.fn(),
    portScan: jest.fn(),
    ping: jest.fn(),
    speedTest: jest.fn(),
  },
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedRustNetworkToolsClient = rustNetworkToolsClient as jest.Mocked<typeof rustNetworkToolsClient>;

// Mock axios.isAxiosError
(axios.isAxiosError as any) = jest.fn((error) => {
  return error && error.isAxiosError === true;
});

// 创建正确的axios错误对象
const createAxiosError = (config: any) => {
  const error = new Error(config.message || "Axios Error") as any;
  error.isAxiosError = true;
  error.config = config;
  error.response = config.response;
  error.request = config.request;
  return error;
};

describe("NetworkService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.rustServices.networkTools.enabled = false;
    config.rustServices.networkTools.fallbackEnabled = true;
    config.rustServices.networkTools.blockPrivateTargets = true;
  });

  describe("douyinHot", () => {
    it("应该成功获取抖音热榜数据", async () => {
      // Mock 成功的响应
      const mockResponse = {
        data: {
          code: 200,
          msg: "数据请求成功",
          data: [
            {
              word: "测试热榜标题",
              hot_value: 1000000,
              position: 1,
              event_time: 1735533481,
              video_count: 3,
              word_cover: {
                uri: "test-uri",
                url_list: ["https://example.com/image1.jpg"],
              },
              label: 3,
              group_id: "test-group-id",
              sentence_id: "test-sentence-id",
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
              drift_info: null,
            },
          ],
          request_id: "test-request-id",
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/douyinhot", { timeout: 15000 });
    });

    it("应该处理网络错误", async () => {
      // Mock 网络错误
      const networkError = new Error("Network Error");
      mockedAxios.get.mockRejectedValueOnce(networkError);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network Error");
    });

    it("应该处理HTTP错误响应", async () => {
      // Mock HTTP错误响应
      const httpError = createAxiosError({
        response: {
          status: 500,
          data: { message: "服务器内部错误" },
        },
      });
      mockedAxios.get.mockRejectedValueOnce(httpError);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(false);
      expect(result.error).toBe("抖音热榜获取失败: 500 - 服务器内部错误");
    });

    it("应该处理请求超时", async () => {
      // Mock 请求超时
      const timeoutError = createAxiosError({
        request: {},
        message: "timeout of 15000ms exceeded",
      });
      mockedAxios.get.mockRejectedValueOnce(timeoutError);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(false);
      expect(result.error).toBe("抖音热榜服务无响应，请稍后重试");
    });

    it("应该处理空响应数据", async () => {
      // Mock 空响应
      const emptyResponse = { data: null };
      mockedAxios.get.mockResolvedValueOnce(emptyResponse);

      const result = await NetworkService.douyinHot();

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe("hashEncrypt", () => {
    it("应该成功进行MD5加密", () => {
      const result = NetworkService.hashEncrypt("md5", "123456");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("e10adc3949ba59abbe56e057f20f883e");
    });

    it("应该成功进行SHA1加密", () => {
      const result = NetworkService.hashEncrypt("sha1", "123456");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("7c4a8d09ca3762af61e59520943dc26494f8941b");
    });

    it("应该成功进行SHA256加密", () => {
      const result = NetworkService.hashEncrypt("sha256", "123456");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92");
    });

    it("应该成功进行SHA512加密", () => {
      const result = NetworkService.hashEncrypt("sha512", "123456");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe(
        "ba3253876aed6bc22d4a6ff53d8406c6ad864195ed144ab5c87621b6c233b548baeae6956df346ec8c17f5ea10f35ee3cbc514797ed7ddd3145464e2a0bab413",
      );
    });

    it("应该处理MD4加密（使用MD5替代）", () => {
      const result = NetworkService.hashEncrypt("md4", "123456");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("e10adc3949ba59abbe56e057f20f883e"); // MD5结果
    });

    it("应该处理空文本", () => {
      const result = NetworkService.hashEncrypt("md5", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("加密文本不能为空");
    });

    it("应该处理不支持的算法", () => {
      const result = NetworkService.hashEncrypt("invalid" as any, "123456");

      expect(result.success).toBe(false);
      expect(result.error).toBe("不支持的加密算法: invalid。支持的算法: md4, md5, sha1, sha256, sha512");
    });

    it("应该处理null文本", () => {
      const result = NetworkService.hashEncrypt("md5", null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe("加密文本不能为空");
    });

    it("应该处理空白文本", () => {
      const result = NetworkService.hashEncrypt("md5", "   ");

      expect(result.success).toBe(false);
      expect(result.error).toBe("加密文本不能为空");
    });
  });

  describe("base64Operation", () => {
    it("应该成功进行Base64编码", () => {
      const result = NetworkService.base64Operation("encode", "123456");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("MTIzNDU2");
    });

    it("应该成功进行Base64解码", () => {
      const result = NetworkService.base64Operation("decode", "MTIzNDU2");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("123456");
    });

    it("应该处理中文编码", () => {
      const result = NetworkService.base64Operation("encode", "你好世界");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("5L2g5aW95LiW55WM");
    });

    it("应该处理中文解码", () => {
      const result = NetworkService.base64Operation("decode", "5L2g5aW95LiW55WM");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("你好世界");
    });

    it("应该处理特殊字符编码", () => {
      const result = NetworkService.base64Operation("encode", "Hello@World#123");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("SGVsbG9AV29ybGQjMTIz");
    });

    it("应该处理特殊字符解码", () => {
      const result = NetworkService.base64Operation("decode", "SGVsbG9AV29ybGQjMTIz");

      expect(result.success).toBe(true);
      expect(result.data.code).toBe(200);
      expect(result.data.msg).toBe("数据请求成功");
      expect(result.data.data).toBe("Hello@World#123");
    });

    it("应该处理空文本", () => {
      const result = NetworkService.base64Operation("encode", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("操作文本不能为空");
    });

    it("应该处理null文本", () => {
      const result = NetworkService.base64Operation("encode", null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe("操作文本不能为空");
    });

    it("应该处理无效的操作类型", () => {
      const result = NetworkService.base64Operation("invalid" as any, "123456");

      expect(result.success).toBe(false);
      expect(result.error).toBe("操作类型必须是 encode(编码) 或 decode(解码)");
    });

    it("应该处理无效的Base64字符串解码", () => {
      const result = NetworkService.base64Operation("decode", "invalid-base64!@#");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Base64解码失败：输入不是有效的Base64字符串");
    });

    it("应该处理不完整的Base64字符串", () => {
      const result = NetworkService.base64Operation("decode", "MTIzNDU");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Base64解码失败：输入不是有效的Base64字符串");
    });

    it("应该处理编码解码的往返测试", () => {
      const originalText = "Hello World 你好世界 123!@#";

      // 先编码
      const encodeResult = NetworkService.base64Operation("encode", originalText);
      expect(encodeResult.success).toBe(true);

      // 再解码
      const decodeResult = NetworkService.base64Operation("decode", encodeResult.data.data);
      expect(decodeResult.success).toBe(true);

      // 验证结果一致
      expect(decodeResult.data.data).toBe(originalText);
    });
  });

  describe("tcpPing", () => {
    it("应该成功进行TCP连接检测", async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: "连接成功",
          data: { address: "8.8.8.8", port: 53, status: "open" },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.tcpPing("8.8.8.8", 53);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/tcping", {
        params: { address: "8.8.8.8", port: 53 },
        timeout: 10000,
      });
    });

    it("启用Rust时应该优先调用network-tools", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.tcpPing.mockResolvedValueOnce({
        success: true,
        data: {
          address: "example.com",
          port: 443,
          reachable: true,
          latencyMs: 12,
          source: "rust-network-tools",
        },
      });

      const result = await NetworkService.tcpPing("example.com", 443);

      expect(result.success).toBe(true);
      expect(result.data.source).toBe("rust-network-tools");
      expect(mockedRustNetworkToolsClient.tcpPing).toHaveBeenCalledWith("example.com", 443);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("Rust超时时应该按配置回退到现有外部API", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.tcpPing.mockRejectedValueOnce(
        new InternalServiceClientError("rust-network-tools timed out after 5000ms", {
          code: "timeout",
          serviceName: "rust-network-tools",
        }),
      );
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          msg: "连接成功",
          data: { address: "8.8.8.8", port: 53, status: "open" },
        },
      });

      const result = await NetworkService.tcpPing("8.8.8.8", 53);

      expect(result.success).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/tcping", {
        params: { address: "8.8.8.8", port: 53 },
        timeout: 10000,
      });
    });

    it("关闭fallback时Rust失败应该返回明确错误", async () => {
      config.rustServices.networkTools.enabled = true;
      config.rustServices.networkTools.fallbackEnabled = false;
      mockedRustNetworkToolsClient.tcpPing.mockRejectedValueOnce(new Error("network-tools down"));

      const result = await NetworkService.tcpPing("example.com", 443);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rust network-tools TCP连接检测失败: network-tools down");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("Rust拒绝非法目标时不应该回退到外部API", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.tcpPing.mockRejectedValueOnce(
        new InternalServiceClientError("rust-network-tools private or reserved target addresses are blocked", {
          code: "bad_request",
          serviceName: "rust-network-tools",
          statusCode: 400,
        }),
      );

      const result = await NetworkService.tcpPing("127.0.0.1", 80);

      expect(result.success).toBe(false);
      expect(result.error).toContain("private or reserved target addresses are blocked");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("ping", () => {
    it("应该成功进行Ping检测", async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: "Ping成功",
          data: { url: "https://www.baidu.com", response_time: 50 },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.ping("https://www.baidu.com");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/ping", {
        params: { url: "https://www.baidu.com" },
        timeout: 15000,
      });
    });

    it("启用Rust时应该优先调用network-tools Ping检测", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.ping.mockResolvedValueOnce({
        success: true,
        data: {
          target: "https://example.com/",
          reachable: true,
          method: "http-head",
          latencyMs: 25,
          source: "rust-network-tools",
        },
      });

      const result = await NetworkService.ping("https://example.com");

      expect(result.success).toBe(true);
      expect(result.data.source).toBe("rust-network-tools");
      expect(mockedRustNetworkToolsClient.ping).toHaveBeenCalledWith("https://example.com");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("启用Rust时裸IP Ping不应该调用外部API", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.ping.mockResolvedValueOnce({
        success: true,
        data: {
          target: "134.209.101.203",
          reachable: true,
          method: "tcp-default",
          port: 22,
          latencyMs: 18,
          source: "rust-network-tools",
        },
      });

      const result = await NetworkService.ping("134.209.101.203");

      expect(result.success).toBe(true);
      expect(result.data.method).toBe("tcp-default");
      expect(mockedRustNetworkToolsClient.ping).toHaveBeenCalledWith("134.209.101.203");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("Rust Ping超时时应该回退到现有外部API", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.ping.mockRejectedValueOnce(
        new InternalServiceClientError("rust-network-tools timed out after 5000ms", {
          code: "timeout",
          serviceName: "rust-network-tools",
        }),
      );
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          msg: "Ping成功",
          data: { url: "https://www.baidu.com", response_time: 50 },
        },
      });

      const result = await NetworkService.ping("https://www.baidu.com");

      expect(result.success).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/ping", {
        params: { url: "https://www.baidu.com" },
        timeout: 15000,
      });
    });
  });

  describe("speedTest", () => {
    it("应该成功进行网站测速", async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: "测速完成",
          data: { url: "https://www.google.com", speed: "1.2s" },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.speedTest("https://www.google.com");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/speed", {
        params: { url: "https://www.google.com" },
        timeout: 30000,
      });
    });

    it("启用Rust时应该优先调用network-tools网站测速", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.speedTest.mockResolvedValueOnce({
        success: true,
        data: {
          url: "https://example.com/",
          statusCode: 200,
          bytesRead: 1024,
          totalMs: 100,
          throughputBytesPerSec: 10240,
          truncated: false,
          source: "rust-network-tools",
        },
      });

      const result = await NetworkService.speedTest("https://example.com");

      expect(result.success).toBe(true);
      expect(result.data.source).toBe("rust-network-tools");
      expect(mockedRustNetworkToolsClient.speedTest).toHaveBeenCalledWith("https://example.com");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("portScan", () => {
    it("应该成功进行端口扫描", async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: "扫描完成",
          data: { address: "8.8.8.8", open_ports: [53, 80, 443] },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.portScan("8.8.8.8");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/portscan", {
        params: { address: "8.8.8.8" },
        timeout: 60000,
      });
    });

    it("启用Rust时应该优先调用network-tools端口扫描", async () => {
      config.rustServices.networkTools.enabled = true;
      mockedRustNetworkToolsClient.portScan.mockResolvedValueOnce({
        success: true,
        data: {
          address: "example.com",
          scannedPorts: [80, 443],
          openPorts: [443],
          results: [
            { port: 80, open: false },
            { port: 443, open: true, latencyMs: 9 },
          ],
          source: "rust-network-tools",
        },
      });

      const result = await NetworkService.portScan("example.com");

      expect(result.success).toBe(true);
      expect(result.data.source).toBe("rust-network-tools");
      expect(mockedRustNetworkToolsClient.portScan).toHaveBeenCalledWith("example.com");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("ipQuery", () => {
    it("应该成功进行IP查询", async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: "查询成功",
          data: {
            ip: "8.8.8.8",
            country: "美国",
            province: "加利福尼亚州",
            city: "山景城",
            isp: "Google LLC",
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.ipQuery("8.8.8.8");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/ipv2", {
        params: { ip: "8.8.8.8" },
        timeout: 10000,
      });
    });
  });

  describe("randomQuote", () => {
    it("应该成功获取一言", async () => {
      const mockResponse = {
        data: {
          code: "200",
          data: "生活就像一盒巧克力，你永远不知道下一颗是什么味道。",
          msg: "获取成功",
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomQuote("hitokoto");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/yiyan", {
        params: { type: "hitokoto" },
        timeout: 8000,
      });
    });

    it("应该成功获取古诗词", async () => {
      const mockResponse = {
        data: {
          code: "200",
          data: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
          msg: "获取成功",
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await NetworkService.randomQuote("poetry");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith("https://v2.xxapi.cn/api/yiyan", {
        params: { type: "poetry" },
        timeout: 8000,
      });
    });
  });
});

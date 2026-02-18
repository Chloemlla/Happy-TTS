/**
 * 安踏服务测试
 * 用于验证HTML解析功能
 */

import { AntaService } from "../services/antaService";

// 模拟的HTML响应（基于提供的示例）
const mockValidHtmlResponse = `<!DOCTYPE html><html xml:lang="zh-CN"><!--引入thymeleaf--><head><title></title><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><link rel="stylesheet" href="https://ascm.anta.com/consumer/js/layui/css/layui.css" media="all"><script src="https://ascm.anta.com/consumer/js/layui/layui.js"></script></head><body><script>var redirectCountryFlag = 'false';var websiteAddress =  'https://www.anta.com/';if (redirectCountryFlag == true || redirectCountryFlag == 'true') {window.open(websiteAddress,"_self") ;}</script><div style="margin: 0 auto; max-width: 600px; width:600px;"><div class="layui-row"><div class="layui-col-xs12"><div class="grid-demo" style="font-size:24px;text-align:center"><br/><img src="https://ascm.anta.com/consumer/image/logo.jpg" alt="" height="37px" width="68px"/>&nbsp;&nbsp;&nbsp;产品查询</div></div></div></div><div style="margin: 10px auto; max-width: 900px; width:900px;height: 120px" height="120px"><div class="layui-row"><div class="layui-col-xs12" style="position: relative"><img src="https://ascm.anta.com/consumer/image/query.png" alt="" style="position: absolute; width:900px;height: 120px"><div style="position: absolute;width:900px;height: 120px"><div class="layui-form" style="position: absolute;width: 90%; height: 100%; top: 35px;margin: 0 auto"><div class="layui-form-item"><label class="layui-form-label" style="color: #f6f6f6">产品ID</label><div class="layui-input-block" style="display: flex"><input type="text" id="code" required lay-verify="required" placeholder=""autocomplete="off" class="layui-input" style="width: 80%"><script>function query() {var value = document.getElementById("code").value;if (value) {var url = window.location.origin + window.location.pathname + "?code=&&&" + value + "&CN";window.location.href = url;}}</script><button type="button" class="layui-btn layui-btn-primary" style="width: 10%;margin-left: 20px" onclick="query()">查询</button></div></div><div style="color: #f6f6f6;width: 100%;text-align: center">查询提示：找到鞋盒贴标上的二维码ID，将ID完整输入查询框，点击右侧查询按钮。</div></div></div></div></div><br><div style="margin: 130px auto 20px auto; max-width: 600px; width:600px;height:150px;border:1px solid #0000FF;"><div class="layui-row"><div class="layui-col-xs12"><div class="grid-demo" style="padding-left: 20px;color: red">感谢您购买安踏公司生产的产品，产品详情如下</div></div></div><div class="layui-row"><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">条码：BRA047EBXF</div></div><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">性别：男</div></div></div><div class="layui-row"><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">品名：跑鞋</div></div><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">系列：跑步系列</div></div></div><div class="layui-row"><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">货号：112535584-1</div></div><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">EAN：2000000134554</div></div></div><div class="layui-row"><div class="layui-col-xs6" align="left"><div class="grid-demo" style="padding-left: 20px">尺码：11</div></div><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">零售价：799.00</div></div></div><div class="layui-row"><!--        <div class="layui-col-xs6">--><!--            <div class="grid-demo" style="padding-left: 20px" th:utext="'颜色：'+\${color}"></div>--><!--        </div>--><div class="layui-col-xs6"><div class="grid-demo" style="padding-left: 20px">查询次数：167</div></div></div></div><div style="margin: 0 auto; max-width: 650px; width:650px;margin-top: 30px;"><a style="text-decoration: underline; color:#0000ff;" href='https://www.anta.com/' target="_blank">安踏官网</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a style="text-decoration: underline; color:#0000ff;" href='https://www.anta.cn/cms/statement' target="_blank">隐私条款</a></div></body></html><script>layui.use(['form', 'layedit', 'laydate'], function() {var form = layui.form;var layer = layui.layer;});</script>`;

const mockEmptyHtmlResponse = `<!DOCTYPE html><html><head><title>查询页面</title></head><body><div>产品查询</div></body></html>`;

const mockNotFoundHtmlResponse = `<!DOCTYPE html><html><head><title>未找到</title></head><body><div>未找到该产品信息</div></body></html>`;

describe("AntaService HTML解析测试", () => {
  let antaService: AntaService;

  beforeEach(() => {
    antaService = new AntaService();
  });

  describe("parseProductInfo 方法测试", () => {
    test("应该正确解析有效的产品HTML", () => {
      const parseProductInfo = (antaService as any).parseProductInfo.bind(antaService);
      const result = parseProductInfo(mockValidHtmlResponse);

      expect(result).not.toBeNull();
      expect(result.barcode).toBe("BRA047EBXF");
      expect(result.gender).toBe("男");
      expect(result.productName).toBe("跑鞋");
      expect(result.series).toBe("跑步系列");
      expect(result.itemNumber).toBe("112535584-1");
      expect(result.ean).toBe("2000000134554");
      expect(result.size).toBe("11");
      expect(result.retailPrice).toBe(799.0);
    });

    test("应该正确处理空HTML", () => {
      const parseProductInfo = (antaService as any).parseProductInfo.bind(antaService);
      const result = parseProductInfo("");

      expect(result).toBeNull();
    });

    test("应该正确处理无效HTML", () => {
      const parseProductInfo = (antaService as any).parseProductInfo.bind(antaService);
      const result = parseProductInfo("<html><body>无效内容</body></html>");

      expect(result).toBeNull();
    });

    test("应该正确处理缺少必要字段的HTML", () => {
      const parseProductInfo = (antaService as any).parseProductInfo.bind(antaService);
      const incompleteHtml = `<html><body><div class="grid-demo">条码：TEST123</div></body></html>`;
      const result = parseProductInfo(incompleteHtml);

      expect(result).toBeNull();
    });
  });

  describe("extractQueryCount 方法测试", () => {
    test("应该正确提取查询次数", () => {
      const extractQueryCount = (antaService as any).extractQueryCount.bind(antaService);
      const result = extractQueryCount(mockValidHtmlResponse);

      expect(result).toBe(167);
    });

    test("应该处理没有查询次数的HTML", () => {
      const extractQueryCount = (antaService as any).extractQueryCount.bind(antaService);
      const result = extractQueryCount(mockEmptyHtmlResponse);

      expect(result).toBe(0);
    });

    test("应该处理空HTML", () => {
      const extractQueryCount = (antaService as any).extractQueryCount.bind(antaService);
      const result = extractQueryCount("");

      expect(result).toBe(0);
    });
  });

  describe("isProductNotFound 方法测试", () => {
    test("应该正确识别有效产品页面", () => {
      const isProductNotFound = (antaService as any).isProductNotFound.bind(antaService);
      const result = isProductNotFound(mockValidHtmlResponse);

      expect(result).toBe(false);
    });

    test("应该正确识别产品未找到页面", () => {
      const isProductNotFound = (antaService as any).isProductNotFound.bind(antaService);
      const result = isProductNotFound(mockNotFoundHtmlResponse);

      expect(result).toBe(true);
    });

    test("应该正确识别空页面", () => {
      const isProductNotFound = (antaService as any).isProductNotFound.bind(antaService);
      const result = isProductNotFound(mockEmptyHtmlResponse);

      expect(result).toBe(true);
    });

    test("应该处理空HTML", () => {
      const isProductNotFound = (antaService as any).isProductNotFound.bind(antaService);
      const result = isProductNotFound("");

      expect(result).toBe(true);
    });
  });

  describe("isInvalidProductIdResponse 方法测试", () => {
    test("应该识别有效产品ID响应", () => {
      const isInvalidProductIdResponse = (antaService as any).isInvalidProductIdResponse.bind(antaService);
      const result = isInvalidProductIdResponse(mockValidHtmlResponse);

      expect(result).toBe(false);
    });

    test("应该识别无效产品ID响应", () => {
      const isInvalidProductIdResponse = (antaService as any).isInvalidProductIdResponse.bind(antaService);
      const invalidIdHtml = "<html><body><div>格式不正确</div></body></html>";
      const result = isInvalidProductIdResponse(invalidIdHtml);

      expect(result).toBe(true);
    });

    test("应该处理空HTML", () => {
      const isInvalidProductIdResponse = (antaService as any).isInvalidProductIdResponse.bind(antaService);
      const result = isInvalidProductIdResponse("");

      expect(result).toBe(false);
    });
  });

  describe("parsePrice 方法测试", () => {
    test("应该正确解析价格字符串", () => {
      const parsePrice = (antaService as any).parsePrice.bind(antaService);

      expect(parsePrice("799.00")).toBe(799.0);
      expect(parsePrice("¥799.00")).toBe(799.0);
      expect(parsePrice("价格：799.00元")).toBe(799.0);
      expect(parsePrice("1299")).toBe(1299);
    });

    test("应该处理无效价格字符串", () => {
      const parsePrice = (antaService as any).parsePrice.bind(antaService);

      expect(parsePrice("")).toBe(0);
      expect(parsePrice("无价格")).toBe(0);
      expect(parsePrice("abc")).toBe(0);
    });
  });

  describe("validateProductId 方法测试", () => {
    test("应该验证有效的产品ID", () => {
      const validateProductId = (antaService as any).validateProductId.bind(antaService);

      expect(validateProductId("BRA047EBXF")).toBe(true);
      expect(validateProductId("TEST123")).toBe(true);
      expect(validateProductId("ABC-123_456.789")).toBe(true);
    });

    test("应该拒绝无效的产品ID", () => {
      const validateProductId = (antaService as any).validateProductId.bind(antaService);

      expect(validateProductId("")).toBe(false);
      expect(validateProductId("AB")).toBe(false); // 太短
      expect(validateProductId("A".repeat(51))).toBe(false); // 太长
      expect(validateProductId("ABC@123")).toBe(false); // 包含特殊字符
      expect(validateProductId("ABC 123")).toBe(false); // 包含空格
    });

    test("应该处理非字符串输入", () => {
      const validateProductId = (antaService as any).validateProductId.bind(antaService);

      expect(validateProductId(null)).toBe(false);
      expect(validateProductId(undefined)).toBe(false);
      expect(validateProductId(123)).toBe(false);
    });
  });
});

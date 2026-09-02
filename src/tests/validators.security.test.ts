import { sanitizeInput, validateName, validateURL } from "../utils/validators";

// G8-30 之后的三层分工，本文件逐层断言：
//   1. sanitizeInput 只做归一化（截断 / 去控制字符 / trim）；
//   2. 拒绝非法值由入口校验器完成（validateName / validateURL 直接 400）；
//   3. 转义由输出点完成（HTML 走 src/utils/announcementHtml.ts 的 DOMPurify，
//      其余走前端 JSX 文本节点的默认转义）。
// 不要再把转义或字面量删除塞回 sanitizeInput：那样既挡不住编码变体，又会静默损坏
// 合法数据（`https://a/b` 落库成 `https:&#x2F;&#x2F;a&#x2F;b`、`prescription` 落库成 `preion`）。

describe("sanitizeInput - 归一化契约", () => {
  test("截断到 maxLength，默认 500", () => {
    expect(sanitizeInput("a".repeat(1000), 100)).toHaveLength(100);
    expect(sanitizeInput("a".repeat(1000))).toHaveLength(500);
  });

  test("移除控制字符", () => {
    expect(sanitizeInput("test\x00\x01\x02\x1F\x7Fstring")).toBe("teststring");
  });

  test("去掉首尾空白", () => {
    expect(sanitizeInput("  John Doe  ")).toBe("John Doe");
  });

  test("空值与非字符串返回空串", () => {
    expect(sanitizeInput("")).toBe("");
    expect(sanitizeInput(null)).toBe("");
    expect(sanitizeInput(undefined)).toBe("");
  });

  test("截断先于去控制字符，长度上限按原始输入计算", () => {
    // substring 先执行：窗口外的内容一律丢弃，被删掉的控制字符不会让窗口右移补位
    expect(sanitizeInput(`${"a".repeat(99)}\x00bbbb`, 100)).toBe("a".repeat(99));
  });
});

describe("sanitizeInput - 不得破坏合法输入", () => {
  test("URL 里的 : / ? & 原样保留", () => {
    const url = "https://www.fbi.gov/wanted/topten/photo.jpg?v=1&size=large";
    expect(sanitizeInput(url, 2000)).toBe(url);
  });

  test("含 script 子串的正常单词不被截肢", () => {
    // 旧实现 replace(/script/gi, "") 会把 prescription 变成 preion、description 变成 deion
    expect(sanitizeInput("prescription")).toBe("prescription");
    expect(sanitizeInput("Description of the manuscript")).toBe("Description of the manuscript");
  });

  test("引号、& 与尖括号不被转义", () => {
    expect(sanitizeInput('He said "stop" & left <fast>')).toBe('He said "stop" & left <fast>');
  });

  test("中文与货币符号原样保留", () => {
    expect(sanitizeInput("悬赏金额: $1,000,000")).toBe("悬赏金额: $1,000,000");
  });

  test("换行与制表符属于控制字符，会被移除", () => {
    // \n \r \t 都落在 \x00-\x1F 内；需要保留换行的字段不要用 sanitizeInput
    expect(sanitizeInput("line1\nline2\tend")).toBe("line1line2end");
  });
});

describe("sanitizeInput - 危险字面量按设计原样通过", () => {
  // 这些断言是有意为之，不是漏洞：sanitizeInput 不是 XSS 防线。
  // 拦截见下面两个 describe，转义见输出点。
  test("不删除 javascript: / data: / on*= / script 字面量", () => {
    expect(sanitizeInput("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(sanitizeInput("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
    expect(sanitizeInput("onerror=alert(1)")).toBe("onerror=alert(1)");
    expect(sanitizeInput("data:text/html,<script>alert(1)</script>")).toBe("data:text/html,<script>alert(1)</script>");
  });
});

// 旧实现把这些 payload 改写后照样入库，改写还留下可绕过的残渣；现在一律在入口拒绝，
// 调用方（fbiWantedController 的 createWanted / updateWanted）据此返回 400。
describe("validateName - 入口拒绝危险输入", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<SCRIPT>alert(1)</SCRIPT>",
    "<<script>script>alert(1)<</script>/script>",
    "<scr<script>ipt>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<img/src=x/onerror=alert(1)>",
    "javascript:alert(1)",
    "javascript:vbscript:data:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "onclick=alert(1)",
    "onload=alert(1)",
    "onmouseover=alert(1)",
    // 嵌套残渣型 payload：旧实现逐轮删除后可能重新拼回，现在只要出现字面量就整体拒绝
    "jjavascript:avascript:alert(1)",
    "jjavajavascript:script:vbscript:alert(1)",
    "ddata:ata:text/html,<script>alert(1)</script>",
    "ononclick=click=alert(1)",
    "<img src=x ononerror=error=javascript:alert(1)>",
    // 大小写混合
    "JaVaScRiPt:alert(1)",
    "VBSCRIPT:alert(1)",
    "DaTa:text/html,<script>",
    "OnClIcK=alert(1)",
  ];

  test.each(attacks)("拒绝 %s", (attack) => {
    expect(validateName(attack).valid).toBe(false);
  });

  test("长度与类型边界", () => {
    expect(validateName("").valid).toBe(false);
    expect(validateName("A").valid).toBe(false);
    expect(validateName("a".repeat(101)).valid).toBe(false);
    expect(validateName(123).valid).toBe(false);
    expect(validateName(null).valid).toBe(false);
    expect(validateName(undefined).valid).toBe(false);
  });

  test("接受合法姓名，包括含 script 子串的词", () => {
    for (const name of ["John Doe", "FBI Most Wanted", "Manuscript Thief", "José Ángel Pérez-Núñez", "张三"]) {
      expect(validateName(name)).toEqual({ valid: true });
    }
  });
});

describe("validateURL - 入口拒绝危险 URL", () => {
  test("拒绝非 http(s) 协议", () => {
    expect(validateURL("javascript:alert(1)").valid).toBe(false);
    expect(validateURL("vbscript:alert(1)").valid).toBe(false);
    expect(validateURL("data:text/html,<script>alert(1)</script>").valid).toBe(false);
    expect(validateURL("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==").valid).toBe(false);
    expect(validateURL("file:///etc/passwd").valid).toBe(false);
    expect(validateURL("//evil.test/x.jpg").valid).toBe(false);
  });

  test("危险协议藏在 http(s) 之后也拒绝（纵深防御，非仅靠 new URL 的 protocol）", () => {
    expect(validateURL("https://evil.test/#javascript:alert(1)").valid).toBe(false);
  });

  test("拒绝超长 URL 与非字符串", () => {
    expect(validateURL(`https://a.test/${"a".repeat(2000)}`).valid).toBe(false);
    expect(validateURL(12345).valid).toBe(false);
  });

  test("接受合法 http(s) URL", () => {
    expect(validateURL("https://www.fbi.gov/wanted/topten/photo.jpg").valid).toBe(true);
    expect(validateURL("http://example.test/a/b?c=d&e=f").valid).toBe(true);
  });

  test("空值默认放行，required 时拒绝", () => {
    expect(validateURL("").valid).toBe(true);
    expect(validateURL(undefined).valid).toBe(true);
    expect(validateURL("", true).valid).toBe(false);
  });
});

describe("性能 - 无灾难性回溯", () => {
  // 上限取得很宽松：这里只为拦住指数级回溯（那会挂到 jest 超时），不做性能基准，
  // 免得 CI 负载抖动把测试变成随机失败。
  test("sanitizeInput 对 10 万字符输入线性完成", () => {
    const start = Date.now();
    sanitizeInput("a".repeat(100_000), 100_000);
    expect(Date.now() - start).toBeLessThan(500);
  });

  test("危险模式正则的输入被长度上限锁死，构造不出回溯放大", () => {
    const start = Date.now();
    // 长度检查先于正则：超长输入在进正则前就被拒绝
    expect(validateName(`on${"a".repeat(5000)}`).valid).toBe(false);
    // 正则能看到的最坏输入只有 100 字符：on 后接大量 \w 却始终不出现 =
    expect(validateName(`on${"a".repeat(98)}`).valid).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

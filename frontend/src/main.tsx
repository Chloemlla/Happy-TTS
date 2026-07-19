import "../lang/index.js"; // 自动生成的语言配置，需置于入口第一行
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { integrityChecker } from "./utils/integrityCheck";
import {
  createClientIntegrityCheck,
  createFailedClientIntegrityCheck,
  type ClientIntegrityCheckResult,
} from "./utils/integrityDiagnostics";
import "./utils/ipVerification";

// 统一危险关键字 - 扩展更多关键词
const DANGEROUS_KEYWORDS = [
  "supercopy",
  "fatkun",
  "downloader",
  "copyy",
  "copycat",
  "copyhelper",
  "copyall",
  "copytext",
  "copycontent",
  "copyweb",
  "supercopy",
  "supercopyy",
  "supercopycat",
  "supercopyhelper",
  "fatkun",
  "fatkundownloader",
  "fatkunbatch",
  "fatkunimage",
  "imagecapture",
  "screenshot",
  "screencapture",
  "webcapture",
  "webscraper",
  "datascraper",
  "contentscraper",
  "textscraper",
  "ocrtool",
  "ocrreader",
  "textrecognizer",
  "batchdownload",
  "bulkdownload",
  "massdownload",
  "clipboardmanager",
  "clipboardhelper",
  "textselection",
  "contentselection",
  // 油猴相关关键词
  "tampermonkey",
  "greasemonkey",
  "violentmonkey",
  "userscript",
  "userscripts",
  "scriptmonkey",
  "grease",
  "violent",
  "userjs",
  "user.js",
  "gm_",
  "GM_",
  "unsafeWindow",
  "grant",
  "namespace",
];

// CSS类名白名单 - 豁免常见的无害CSS类名
const CSS_CLASS_WHITELIST = [
  "object-cover",
  "object-contain",
  "object-fill",
  "object-none",
  "object-scale-down",
  "bg-cover",
  "bg-contain",
  "bg-fill",
  "bg-none",
  "bg-scale-down",
  "cover",
  "contain",
  "fill",
  "none",
  "scale-down",
  "text-center",
  "text-left",
  "text-right",
  "text-justify",
  "flex",
  "grid",
  "block",
  "inline",
  "inline-block",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  "static",
  "overflow-hidden",
  "overflow-auto",
  "overflow-scroll",
  "overflow-visible",
  "rounded",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-3xl",
  "shadow",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
  "border",
  "border-t",
  "border-b",
  "border-l",
  "border-r",
  "p-1",
  "p-2",
  "p-3",
  "p-4",
  "p-5",
  "p-6",
  "p-8",
  "p-10",
  "p-12",
  "m-1",
  "m-2",
  "m-3",
  "m-4",
  "m-5",
  "m-6",
  "m-8",
  "m-10",
  "m-12",
  "w-full",
  "h-full",
  "w-auto",
  "h-auto",
  "w-screen",
  "h-screen",
  "max-w",
  "max-h",
  "min-w",
  "min-h",
  "opacity",
  "transition",
  "transform",
  "scale",
  "rotate",
  "translate",
  "hover",
  "focus",
  "active",
  "disabled",
  "group",
  "peer",
];

// 扩展特定的检测模式
const EXTENSION_PATTERNS = [
  // SuperCopy 相关
  { pattern: /supercopy/i, name: "SuperCopy" },
  { pattern: /copyy/i, name: "CopyY" },
  { pattern: /copycat/i, name: "CopyCat" },

  // Fatkun 相关
  { pattern: /fatkun/i, name: "Fatkun批量下载" },
  { pattern: /batch.*download/i, name: "批量下载工具" },

  // OCR 相关
  { pattern: /ocr.*tool/i, name: "OCR识别工具" },
  { pattern: /text.*recognizer/i, name: "文字识别工具" },

  // 截图相关
  { pattern: /screenshot/i, name: "截图工具" },
  { pattern: /screen.*capture/i, name: "屏幕捕获工具" },

  // 抓取相关
  { pattern: /scraper/i, name: "内容抓取工具" },
  { pattern: /data.*extractor/i, name: "数据提取工具" },

  // 油猴相关
  { pattern: /tampermonkey/i, name: "Tampermonkey" },
  { pattern: /greasemonkey/i, name: "Greasemonkey" },
  { pattern: /violentmonkey/i, name: "Violentmonkey" },
  { pattern: /userscript/i, name: "用户脚本" },
  { pattern: /==UserScript==/i, name: "用户脚本头部" },
  { pattern: /@grant/i, name: "油猴权限" },
  { pattern: /@match/i, name: "油猴匹配规则" },
  { pattern: /@include/i, name: "油猴包含规则" },
  { pattern: /@exclude/i, name: "油猴排除规则" },
  { pattern: /@namespace/i, name: "油猴命名空间" },
  { pattern: /unsafeWindow/i, name: "油猴不安全窗口" },
  { pattern: /GM_/i, name: "油猴API" },
];

// 记录命中的危险特征
let detectedReasons: string[] = [];

function hasDangerousExtension(): ClientIntegrityCheckResult {
  detectedReasons = [];
  const check = createClientIntegrityCheck("dangerous-extension");
  let confidence = 0; // 累积分数，弱信号需要叠加

  // 豁免：页面仅包含base64图片或blob图片（如用户头像上传、图片预览）时不触发拦截
  const TRUSTED_HOST_PREFIXES = [
    "http://localhost",
    "https://localhost",
    "https://ipfs.chloemlla.com",
    "https://cdn.jsdelivr.net",
    "https://tts-api-docs.hapx.one",
    "https://tts-api-docs.chloemlla.com",
    "https://tts.chloemlla.com",
    "https://tts.chloemlla.com",
  ];
  const allImgs = Array.from(document.querySelectorAll("img"));
  if (allImgs.length > 0) {
    const hasExternalImages = allImgs.some(
      (img) =>
        !img.src.startsWith("data:image/") &&
        !img.src.startsWith("blob:") &&
        !TRUSTED_HOST_PREFIXES.some((prefix) => img.src.startsWith(prefix))
    );

    // 如果所有图片都是本地图片（data:、blob:、localhost），则豁免检测
    if (!hasExternalImages) {
      return check.finish(false, detectedReasons);
    }
  }

  // 页面级豁免：特定上传/管理页面易出现可疑关键词但属于正常功能
  const isImageUploadPage =
    window.location.pathname.includes("image-upload") ||
    document.title.includes("图片上传") ||
    !!document.querySelector('[data-page="image-upload"]');
  if (isImageUploadPage) {
    return check.finish(false, detectedReasons);
  }

  const isFBIWantedPage =
    window.location.pathname.includes("fbi-wanted") ||
    window.location.pathname.includes("admin") ||
    document.title.includes("FBI") ||
    !!document.querySelector('[data-component="FBIWantedManager"]') ||
    !!document.querySelector('[data-component="FBIWantedPublic"]') ||
    document.body.innerHTML.includes("FBIWantedManager") ||
    document.body.innerHTML.includes("FBIWantedPublic");
  if (isFBIWantedPage) {
    return check.finish(false, detectedReasons);
  }

  // 1. 检查所有 script 标签（src 和内容，模糊匹配）
  const scripts = Array.from(document.querySelectorAll("script"));
  for (const s of scripts) {
    const src = (s.src || "").toLowerCase();
    if (TRUSTED_HOST_PREFIXES.some((prefix) => src.startsWith(prefix))) {
      // 信任域名的脚本不计分
    } else {
      const content = (s.textContent || "").toLowerCase();
      for (const kw of DANGEROUS_KEYWORDS) {
        // 仅统计明显特征，避免过短或常见词引发误判
        if (kw.length < 6) continue;
        if (src.includes(kw)) {
          detectedReasons.push(`script标签src命中关键词：${kw}`);
          confidence += 1;
        }
        if (content.includes(kw)) {
          detectedReasons.push(`script标签内容命中关键词：${kw}`);
          confidence += 1;
        }
      }
    }
  }

  // 2. 检查已知扩展注入的 DOM 元素（仅检查 id，移除无效的 data-* 匹配，降低误判）
  for (const kw of DANGEROUS_KEYWORDS) {
    if (kw.length < 6) continue;
    if (document.querySelector(`[id*="${kw}"]`)) {
      detectedReasons.push(`DOM节点id命中关键词：${kw}`);
      confidence += 1;
    }

    // 检查 class 属性，但排除白名单中的类名
    const elementsWithClass = document.querySelectorAll(`[class*="${kw}"]`);
    for (const element of elementsWithClass) {
      const classList = (element as HTMLElement).className
        .split(" ")
        .filter(Boolean);
      const hasDangerousClass = classList.some(
        (cls) => cls.includes(kw) && !CSS_CLASS_WHITELIST.includes(cls)
      );
      if (hasDangerousClass) {
        detectedReasons.push(`DOM节点class属性命中关键词：${kw}`);
        confidence += 1;
        break;
      }
    }
  }

  // 3. 检查 body/head 属性
  const allAttrs = [
    ...Array.from(document.body.attributes),
    ...Array.from(document.head ? document.head.attributes : []),
  ].map((a) => a.name + "=" + a.value.toLowerCase());
  for (const attr of allAttrs) {
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (attr.includes(kw)) {
        detectedReasons.push(`body/head属性命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 4. 检查全局变量（强信号）。属性访问可能被浏览器或扩展代理拒绝。
  const extensionGlobals = [
    "GM_info",
    "GM_getValue",
    "GM_setValue",
    "GM_addStyle",
    "unsafeWindow",
    "tampermonkey",
    "greasemonkey",
    "violentmonkey",
  ];
  for (const name of extensionGlobals) {
    const value = check.probe(`window-global-${name}`, () => (window as unknown as Record<string, unknown>)[name]);
    if (value) {
      detectedReasons.push(`window全局变量命中：${name}`);
      return check.finish(true, detectedReasons);
    }
  }

  // 5. 检查扩展注入的样式
  const styles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]')
  );
  for (const style of styles) {
    const href = (style as HTMLLinkElement).href
      ? (style as HTMLLinkElement).href.toLowerCase()
      : "";
    if (
      href &&
      TRUSTED_HOST_PREFIXES.some((prefix) => href.startsWith(prefix))
    ) {
      continue; // 信任域名的样式直接跳过
    }
    const content = (style.textContent || "").toLowerCase();
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (content.includes(kw)) {
        detectedReasons.push(`样式内容命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 6. 检查扩展的 iframe
  const iframes = Array.from(document.querySelectorAll("iframe"));
  for (const iframe of iframes) {
    const src = (iframe.src || "").toLowerCase();
    if (TRUSTED_HOST_PREFIXES.some((prefix) => src.startsWith(prefix))) {
      continue;
    }
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (src.includes(kw)) {
        detectedReasons.push(`iframe src命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 7. 检查扩展的 web accessible resources
  const links = Array.from(document.querySelectorAll("link"));
  for (const link of links) {
    const href = (link.href || "").toLowerCase();
    if (TRUSTED_HOST_PREFIXES.some((prefix) => href.startsWith(prefix))) {
      continue;
    }
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (href.includes(kw)) {
        detectedReasons.push(`link href命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 8. 检查扩展的模式匹配（弱信号：累加）
  const pageContent = document.documentElement.outerHTML.toLowerCase();
  for (const pattern of EXTENSION_PATTERNS) {
    if (pattern.pattern.test(pageContent)) {
      detectedReasons.push(`页面源码命中扩展特征：${pattern.name}`);
      confidence += 1;
    }
  }

  // 8.1 页面级组件豁免（通过组件名称/标记进行识别）
  const COMPONENT_EXEMPT_MARKERS = [
    "MarkdownExportPage",
    "MarkdownPreview",
    "ResourceStoreList",
    "ResourceStoreApp",
    "ResourceStoreManager",
    "ShortLinkManager",
    "CDKStoreManager",
    "ApiDocs",
    "EmailSender",
    "ImageUploadPage",
    "ImageUploadSection",
  ];
  const bodyHtml = document.body.innerHTML;
  if (COMPONENT_EXEMPT_MARKERS.some((m) => bodyHtml.includes(m))) {
    return check.finish(false, detectedReasons);
  }

  // 9. 检查扩展的特定DOM结构（确认 position:fixed 且 z-index 很高才记分）
  const suspiciousSelectors = [
    '[id*="copy"]',
    '[class*="copy"]',
    '[id*="download"]',
    '[class*="download"]',
    '[id*="ocr"]',
    '[class*="ocr"]',
    '[id*="scraper"]',
    '[class*="scraper"]',
    '[id*="capture"]',
    '[class*="capture"]',
    '[style*="position: fixed"]',
    '[style*="position:fixed"]',
  ];
  for (const selector of suspiciousSelectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) continue;
    const computedStyle = window.getComputedStyle(element);
    const z = parseInt(computedStyle.zIndex || "0", 10);
    if (computedStyle.position === "fixed" && z > 1000) {
      detectedReasons.push(`可疑元素固定定位且高z-index：${selector}`);
      confidence += 1;
    }
  }

  // 10. 检查扩展的 MutationObserver 监听器（弱信号）
  try {
    const originalObserver = window.MutationObserver;
    const obsStr =
      originalObserver &&
        originalObserver.prototype &&
        originalObserver.prototype.observe
        ? originalObserver.prototype.observe.toString()
        : "";
    if (obsStr.includes("copy") || obsStr.includes("download")) {
      detectedReasons.push("MutationObserver监听器可能拦截copy/download");
      confidence += 1;
    }
  } catch {
    check.fail("mutation-observer-introspection");
  }

  // 11. 检查油猴脚本管理器（强信号）。任何属性读取失败都标记为 check-failed。
  const scriptManagerGlobals = [
    "GM_info",
    "tampermonkey",
    "greasemonkey",
    "violentmonkey",
    "unsafeWindow",
  ];
  for (const name of scriptManagerGlobals) {
    const present = check.probe(`script-manager-${name}`, () =>
      typeof (window as unknown as Record<string, unknown>)[name] !== "undefined"
    );
    if (present) {
      detectedReasons.push(`检测到脚本管理器全局变量 ${name}`);
      return check.finish(true, detectedReasons);
    }
  }

  // 12. 检查用户脚本内容（弱信号：累加）
  try {
    const pageText = document.documentElement.outerHTML;
    const userScriptPatterns = [
      /==UserScript==/i,
      /==\/UserScript==/i,
      /@name\s+/i,
      /@version\s+/i,
      /@description\s+/i,
      /@author\s+/i,
      /@match\s+/i,
      /@include\s+/i,
      /@exclude\s+/i,
      /@grant\s+/i,
      /@namespace\s+/i,
      /@require\s+/i,
      /@resource\s+/i,
      /@connect\s+/i,
      /@antifeature\s+/i,
      /@unwrap\s+/i,
      /@noframes\s+/i,
      /@run-at\s+/i,
      /@sandbox\s+/i,
    ];
    for (const pattern of userScriptPatterns) {
      if (pattern.test(pageText)) {
        detectedReasons.push(`页面源码命中用户脚本特征：${pattern}`);
        confidence += 1;
      }
    }
    const scriptTags = Array.from(document.querySelectorAll("script"));
    for (const script of scriptTags) {
      const content = script.textContent || "";
      for (const pattern of userScriptPatterns) {
        if (pattern.test(content)) {
          detectedReasons.push(`script标签内容命中用户脚本特征：${pattern}`);
          confidence += 1;
          break;
        }
      }
    }
  } catch {
    check.fail("userscript-content-scan");
  }

  // 13. 检查油猴注入的DOM元素（弱信号：累加）
  try {
    const tampermonkeySelectors = [
      '[id*="tampermonkey"]',
      '[class*="tampermonkey"]',
      '[id*="greasemonkey"]',
      '[class*="greasemonkey"]',
      '[id*="violentmonkey"]',
      '[class*="violentmonkey"]',
      '[id*="userscript"]',
      '[class*="userscript"]',
      '[id*="gm-"]',
      '[class*="gm-"]',
      '[id*="GM_"]',
      '[class*="GM_"]',
    ];
    for (const selector of tampermonkeySelectors) {
      if (document.querySelector(selector)) {
        detectedReasons.push(`DOM节点命中油猴特征选择器：${selector}`);
        confidence += 1;
        break;
      }
    }
    const styleTags = Array.from(document.querySelectorAll("style"));
    for (const style of styleTags) {
      const content = (style.textContent || "").toLowerCase();
      if (
        content.includes("tampermonkey") ||
        content.includes("greasemonkey") ||
        content.includes("violentmonkey") ||
        content.includes("userscript") ||
        content.includes("gm_")
      ) {
        detectedReasons.push("样式内容命中油猴特征");
        confidence += 1;
        break;
      }
    }
  } catch {
    check.fail("script-manager-dom-scan");
  }

  // 14. 检查油猴的脚本管理器特征（弱信号：累加；隐藏标记为强信号）
  try {
    const functionNames = Object.getOwnPropertyNames(window);
    const tampermonkeyFunctions = [
      "tampermonkey",
      "greasemonkey",
      "violentmonkey",
      "userscript",
      "scriptmonkey",
      "tamper",
      "grease",
      "violent",
    ];
    for (const funcName of functionNames) {
      for (const tmFunc of tampermonkeyFunctions) {
        if (funcName.toLowerCase().includes(tmFunc)) {
          detectedReasons.push(`window全局函数名命中油猴特征：${funcName}`);
          confidence += 1;
          break;
        }
      }
    }
    const hiddenMarkers = ["__tampermonkey__", "__greasemonkey__", "__violentmonkey__"];
    for (const marker of hiddenMarkers) {
      const present = check.probe(`hidden-marker-${marker}`, () =>
        Boolean((window as unknown as Record<string, unknown>)[marker])
      );
      if (present) {
        detectedReasons.push(`window.${marker} 命中`);
        return check.finish(true, detectedReasons);
      }
    }
  } catch {
    check.fail("window-property-name-scan");
  }

  // 若仅有弱信号，则需要至少两个独立命中才视为 detected。
  return check.finish(confidence >= 2, detectedReasons);
}

// 检测执行时机和多重保险
let lastExtensionCheck: ClientIntegrityCheckResult | null = null;
let lastExtensionCheckAt = 0;
const EXTENSION_CHECK_THROTTLE_MS = 5_000;

export function runDangerousExtensionCheck(): ClientIntegrityCheckResult {
  const now = Date.now();
  if (lastExtensionCheck && now - lastExtensionCheckAt < EXTENSION_CHECK_THROTTLE_MS) {
    return lastExtensionCheck;
  }

  lastExtensionCheckAt = now;

  try {
    // 图片预览豁免：如果页面所有 img 都是 blob: 或 data:image/，则不检测。
    const allImgs = Array.from(document.querySelectorAll("img"));
    if (
      allImgs.length > 0 &&
      allImgs.every(
        (img) => img.src.startsWith("data:image/") || img.src.startsWith("blob:")
      )
    ) {
      const check = createClientIntegrityCheck("dangerous-extension");
      lastExtensionCheck = check.finish(false);
      return lastExtensionCheck;
    }

    lastExtensionCheck = hasDangerousExtension();
    return lastExtensionCheck;
  } catch {
    // A client-side integrity signal is attacker-controlled and is never an authorization
    // boundary. Unexpected failures therefore become low-trust diagnostics, not blocking UI.
    lastExtensionCheck = createFailedClientIntegrityCheck(
      "dangerous-extension",
      "top-level-scan"
    );
    return lastExtensionCheck;
  }
}

// 注释危险扩展检测相关调用，避免阻断页面渲染
document.addEventListener("DOMContentLoaded", () => {
  runDangerousExtensionCheck();
  setTimeout(runDangerousExtensionCheck, 500);
  setTimeout(runDangerousExtensionCheck, 1500);
  setTimeout(runDangerousExtensionCheck, 3000);

  // MutationObserver 监听整个 document
  const observer = new MutationObserver(runDangerousExtensionCheck);
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  // setInterval 定时检测，防止极端延迟注入
  setInterval(runDangerousExtensionCheck, 20000);
});

// 初始化完整性检查
document.addEventListener("DOMContentLoaded", () => {
  // 记录初始状态
  const criticalElements = [
    "app-header",
    "app-footer",
    "tts-form",
    "legal-notice",
  ];

  criticalElements.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      integrityChecker.setIntegrity(id, element.innerHTML);
    }
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

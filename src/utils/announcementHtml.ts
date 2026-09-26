import DOMPurify from "dompurify";
import type { DOMWindow } from "jsdom";

// jsdom 只能延迟加载，见下方 createWindow 的说明；这里只留类型（type-only import 不出现在运行时）。

// G11-13: 公告按管理员原文入库（format:'html' 本来就该带标签），HTML 净化只在出参这一层做。
// 把净化挪回写入端会再次让 format:'html' 形同虚设，并且改白名单也救不回已被剥标签的旧数据。
const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = [
  "alt",
  "class",
  "colspan",
  "height",
  "href",
  "rel",
  "rowspan",
  "src",
  "target",
  "title",
  "width",
];

let purifier: typeof DOMPurify | null = null;

/**
 * 为什么不在文件顶层 `import { JSDOM } from "jsdom"`：
 * jsdom@30 的依赖链（html-encoding-sniffer@7 → @exodus/bytes）已经是 ESM-only，
 * 顶层 import 会把这条链拉进每一个 admin 路由测试的 CommonJS require 里，
 * jest 在模块加载阶段就抛 "Must use import to load ES Module"，整套件直接阵亡
 * （CI 实测：13 个后端套件同一个原因）。require 改成首次净化时才做：
 * 不碰测试图的导入，生产行为与白名单完全不变，还额外省掉进程启动时构建 JSDOM 的开销。
 */
function createWindow(): DOMWindow {
  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  return new JSDOM("").window as unknown as DOMWindow;
}

function getPurifier(): typeof DOMPurify {
  if (!purifier) {
    purifier = DOMPurify(createWindow() as any);
  }
  return purifier;
}

export function sanitizeAnnouncementForOutput(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc;

  const record = doc as Record<string, unknown>;
  const content = record.content;
  if (record.format !== "html" || typeof content !== "string") return doc;

  return {
    ...record,
    content: getPurifier().sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    }),
  };
}

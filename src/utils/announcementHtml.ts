import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

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

function getPurifier(): typeof DOMPurify {
  if (!purifier) {
    purifier = DOMPurify(new JSDOM("").window as any);
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

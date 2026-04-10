import { load, type CheerioAPI } from "cheerio";

const FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "link", "meta", "style", "foreignObject"];
const URI_ATTRS = new Set(["href", "xlink:href", "src"]);
const XML_NAMESPACE_ATTRS = new Set(["xmlns", "xmlns:xlink"]);
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const CDATA_RE = /<!\[CDATA\[[\s\S]*?\]\]>/g;
const ESCAPED_CONTENT_RE = /&#x?[0-9a-f]+;|\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|\\u\{[0-9a-f]+\}/gi;
const UNSAFE_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*\s*:/i;
const UNSAFE_URL_RE = /url\(\s*["']?\s*(?!#)/i;
const UNSAFE_STYLE_RE = /url\(\s*["']?\s*(?!#)|javascript\s*:|vbscript\s*:|data\s*:/i;

type SvgRoot = ReturnType<ReturnType<CheerioAPI["root"]>["children"]>;

type SvgDocument = {
  $: CheerioAPI;
  root: SvgRoot | null;
};

function preprocessSvg(content: string): string {
  return content.replace(COMMENT_RE, "").replace(CDATA_RE, "");
}

function loadSvgDocument(content: string): SvgDocument {
  const $ = load(preprocessSvg(content), { xmlMode: true });
  const topLevelTags = $.root()
    .children()
    .filter((_, node) => node.type === "tag");

  if (topLevelTags.length !== 1 || topLevelTags.get(0)?.name !== "svg") {
    return { $, root: null };
  }

  return { $, root: topLevelTags.eq(0) };
}

function hasUnsafeUrlReference(value: string): boolean {
  return UNSAFE_URL_RE.test(value);
}

function hasUnsafeProtocol(value: string): boolean {
  return UNSAFE_PROTOCOL_RE.test(value);
}

function hasUnsafeStyle(value: string): boolean {
  return UNSAFE_STYLE_RE.test(value);
}

function hasEscapedContent(value: string): boolean {
  return ESCAPED_CONTENT_RE.test(value);
}

function getSvgNodes(root: SvgRoot) {
  return root.add(root.find("*")).toArray();
}

function inspectAttribute(name: string, value: string): string | null {
  const lowerName = name.toLowerCase();
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^on/i.test(lowerName)) {
    return `event:${name}`;
  }

  if (URI_ATTRS.has(lowerName) && !trimmedValue.startsWith("#")) {
    return `external-ref:${name}`;
  }

  if (hasUnsafeUrlReference(trimmedValue)) {
    return `unsafe-url:${name}`;
  }

  if (lowerName === "style" && hasUnsafeStyle(trimmedValue)) {
    return `unsafe-style:${name}`;
  }

  if (!XML_NAMESPACE_ATTRS.has(lowerName) && hasUnsafeProtocol(trimmedValue) && !trimmedValue.startsWith("#")) {
    return `unsafe-protocol:${name}`;
  }

  if (hasEscapedContent(trimmedValue)) {
    return `escaped-content:${name}`;
  }

  return null;
}

export function sanitizeSvgContent(content: string): string {
  const { $, root } = loadSvgDocument(content);
  if (!root) {
    return "";
  }

  for (const tag of FORBIDDEN_TAGS) {
    root.find(tag).remove();
  }

  for (const node of getSvgNodes(root)) {
    const element = $(node);
    const attribs = { ...(node.attribs || {}) } as Record<string, string>;

    for (const [name, value] of Object.entries(attribs)) {
      if (name.toLowerCase().startsWith("data-")) {
        element.removeAttr(name);
        continue;
      }

      if (inspectAttribute(name, value)) {
        element.removeAttr(name);
      }
    }
  }

  return $.xml(root);
}

export function validateSvgContent(content: string): { valid: true } | { valid: false; reason: string } {
  if (!content.includes("<svg") || !content.includes("</svg>")) {
    return { valid: false, reason: "SVG is missing required svg root tags" };
  }

  if (content.length > 1024 * 1024) {
    return { valid: false, reason: "SVG exceeds the 1MB safety limit" };
  }

  const { root } = loadSvgDocument(content);
  if (!root) {
    return { valid: false, reason: "SVG root element is invalid" };
  }

  for (const tag of FORBIDDEN_TAGS) {
    if (root.find(tag).length > 0) {
      return { valid: false, reason: `SVG contains forbidden tag: ${tag}` };
    }
  }

  for (const node of getSvgNodes(root)) {
    const attribs = { ...(node.attribs || {}) } as Record<string, string>;
    for (const [name, value] of Object.entries(attribs)) {
      const issue = inspectAttribute(name, value);
      if (issue) {
        return { valid: false, reason: `SVG contains unsafe attribute ${name} (${issue})` };
      }
    }
  }

  return { valid: true };
}

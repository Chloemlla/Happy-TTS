// 出站邮件正文 HTML→纯文本 / 实体净化：从 outEmailService.ts 抽出（G6-07），原实现原样迁移。
// 拆出原因：正文发送路径超过 800 行文件护栏（check-ts-file-size），本模块与发送方拆分后均低于上限。
// 警告：本模块被 CodeQL 复核过（js/incomplete-sanitize 等），任何正则化重写都可能回归告警，改动须保守。

// HTML→纯文本 / 实体净化：单遍线性扫描，不用正则剥离标签或实体。
// 遇到 <script>/<style> 连内容整体丢弃；注释/doctype 跳过；普通标签按语义决定换行；
// 实体只解码一次；仅当输出 HTML 分支时在最后做一次反向转义，避免二次解码/转义。
const HTML_BLOCK_CLOSE_TAGS = new Set(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);

function startsWithCI(raw: string, pos: number, needle: string): boolean {
  if (pos + needle.length > raw.length) return false;
  for (let k = 0; k < needle.length; k++) {
    let a = raw.charCodeAt(pos + k);
    let b = needle.charCodeAt(k);
    if (a >= 65 && a <= 90) a += 32;
    if (b >= 65 && b <= 90) b += 32;
    if (a !== b) return false;
  }
  return true;
}

function indexOfCI(raw: string, from: number, needle: string): number {
  for (let p = from; p + needle.length <= raw.length; p++) {
    if (startsWithCI(raw, p, needle)) return p;
  }
  return -1;
}

function decodeEntityAt(raw: string, i: number): { value: string; length: number } | null {
  const n = raw.length;
  if (raw.charCodeAt(i + 1) === 35 /* # */) {
    let j = i + 2;
    let value = 0;
    let digits = 0;
    while (j < n && digits < 7) {
      const c = raw.charCodeAt(j);
      if (c >= 48 && c <= 57) {
        value = value * 10 + (c - 48);
        digits++;
        j++;
      } else {
        break;
      }
    }
    if (digits > 0 && j < n && raw[j] === ";") {
      if (value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)) {
        return { value: String.fromCodePoint(value), length: j - i + 1 };
      }
    }
    return null;
  }
  // 命名实体：只在固定小窗口内找 ';'，避免长距离回溯。
  let j = i + 1;
  const maxEnd = Math.min(n, i + 9);
  while (j < maxEnd && raw.charCodeAt(j) !== 59 /* ; */) j++;
  if (j >= maxEnd || raw.charCodeAt(j) !== 59) return null;
  switch (raw.slice(i + 1, j).toLowerCase()) {
    case "amp":
      return { value: "&", length: j - i + 1 };
    case "lt":
      return { value: "<", length: j - i + 1 };
    case "gt":
      return { value: ">", length: j - i + 1 };
    case "quot":
      return { value: '"', length: j - i + 1 };
    case "nbsp":
      return { value: " ", length: j - i + 1 };
    default:
      return null;
  }
}

// 把 raw[from..] 按“字面文本 + 固定实体解码”追加（用于剩余串已无任何 '>'、不可能再构成标签的情况）。
function appendLiteralText(pieces: string[], raw: string, from: number): void {
  const n = raw.length;
  let p = from;
  while (p < n) {
    if (raw.charCodeAt(p) === 38 /* & */) {
      const entity = decodeEntityAt(raw, p);
      if (entity) {
        pieces.push(entity.value);
        p += entity.length;
      } else {
        pieces.push("&");
        p += 1;
      }
    } else {
      const nextAmp = raw.indexOf("&", p);
      if (nextAmp === -1) {
        pieces.push(raw.slice(p));
        return;
      }
      pieces.push(raw.slice(p, nextAmp));
      p = nextAmp;
    }
  }
}

function escapeHtmlOnce(value: string): string {
  let out = "";
  for (const ch of value) {
    switch (ch) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "'":
        out += "&#39;";
        break;
      case "\n":
        out += "<br>";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

export function plainTextifyHtmlContent(content: unknown): { text: string; html: string } {
  const raw = String(content ?? "");
  const pieces: string[] = [];
  const n = raw.length;
  let i = 0;

  while (i < n) {
    const code = raw.charCodeAt(i);

    // 实体：只解码一次，解码后从 ';' 之后继续，绝不对已输出内容二次解码。
    if (code === 38 /* & */) {
      const entity = decodeEntityAt(raw, i);
      if (entity) {
        pieces.push(entity.value);
        i += entity.length;
      } else {
        pieces.push("&");
        i += 1;
      }
      continue;
    }

    // 普通文本：直接快进到下一个可能特殊字符。
    if (code !== 60 /* < */) {
      const nextLt = raw.indexOf("<", i);
      const nextAmp = raw.indexOf("&", i);
      let stop = n;
      if (nextLt !== -1 && nextLt < stop) stop = nextLt;
      if (nextAmp !== -1 && nextAmp < stop) stop = nextAmp;
      pieces.push(raw.slice(i, stop));
      i = stop;
      continue;
    }

    // code === 60：'<'
    const nc = i + 1 < n ? raw.charCodeAt(i + 1) : -1;

    if (nc === -1) {
      pieces.push("<");
      i = n;
      continue;
    }

    if (nc === 33 /* ! */) {
      // HTML 注释整体跳到 -->；doctype/CDATA 或未闭合注释跳到下一个 '>'。
      if (startsWithCI(raw, i, "<!--")) {
        const close = raw.indexOf("-->", i + 4);
        if (close !== -1) {
          i = close + 3;
          continue;
        }
      }
      const gt = raw.indexOf(">", i + 1);
      if (gt === -1) {
        appendLiteralText(pieces, raw, i);
        i = n;
      } else {
        i = gt + 1;
      }
      continue;
    }

    if (nc === 47 /* / */) {
      // 闭合标签。
      const first = i + 2 < n ? raw.charCodeAt(i + 2) : -1;
      const isNameStart = (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
      if (!isNameStart) {
        pieces.push("<");
        i += 1;
        continue;
      }
      let j = i + 2;
      while (j < n) {
        const c = raw.charCodeAt(j);
        const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
        const isDigit = c >= 48 && c <= 57;
        if (isLetter || isDigit) j++;
        else break;
      }
      const name = raw.slice(i + 2, j).toLowerCase();
      const gt = raw.indexOf(">", j);
      if (gt === -1) {
        // 剩余串已无 '>'，不可能再有完整标签：按字面文本保留（含实体解码）。
        appendLiteralText(pieces, raw, i);
        i = n;
        continue;
      }
      // 复刻原行为：仅精确的 "</块级>" 输出换行。
      if (HTML_BLOCK_CLOSE_TAGS.has(name) && raw[j] === ">") {
        pieces.push("\n");
      }
      i = gt + 1;
      continue;
    }

    const isLetter = (nc >= 65 && nc <= 90) || (nc >= 97 && nc <= 122);
    if (!isLetter) {
      // '<' 后不是标签起始（空格/数字/符号等），按字面输出。
      pieces.push("<");
      i += 1;
      continue;
    }

    // 开标签 / 普通标签：先读标签名。
    let j = i + 1;
    while (j < n) {
      const c = raw.charCodeAt(j);
      const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
      const isDigit = c >= 48 && c <= 57;
      if (isLetter || isDigit) j++;
      else break;
    }
    const name = raw.slice(i + 1, j).toLowerCase();

    // <script>/<style>：连同原始内容整体丢弃，不输出其中任何字符（未闭合则丢弃到结尾）。
    if (name === "script" || name === "style") {
      const closeIdx = indexOfCI(raw, j, `</${name}`);
      if (closeIdx === -1) {
        i = n;
      } else {
        const gt = raw.indexOf(">", closeIdx + name.length + 2);
        i = gt === -1 ? n : gt + 1;
      }
      continue;
    }

    const gt = raw.indexOf(">", j);
    if (gt === -1) {
      // 剩余串已无 '>'：不存在完整标签，按字面文本保留（含实体解码）。
      appendLiteralText(pieces, raw, i);
      i = n;
      continue;
    }

    if (name === "br") {
      pieces.push("\n");
    }
    // 其余标签（含属性）整体跳过，不输出任何尖括号内容。
    i = gt + 1;
  }

  const text = pieces
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const html = escapeHtmlOnce(text);
  return { text, html };
}

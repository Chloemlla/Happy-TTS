const fs = require('fs');
const path = require('path');

function encodeBase64(input) {
	return Buffer.from(input).toString('base64');
}

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function replaceMailtoAnchors(html) {
	const mailtoRe = /<a([^>]*?)href=(['"])mailto:([^"'<>]+)\2([^>]*)>([\s\S]*?)<\/a>/gi;
	return html.replace(mailtoRe, (m, before, quote, email, after, inner) => {
		const encoded = encodeBase64(email);
		let attrs = `${before || ''} href="#" ${after || ''}`.replace(/\s+/g, ' ');
		// 确保 class 与 data-email 注入
		if (!/class=/.test(attrs)) {
			attrs += ' class="email-protected"';
		} else {
			attrs = attrs.replace(/class=(['"])((?:.(?!\1))*)\1/, (mm, q, v) => `class=${q}${v} email-protected${q}`);
		}
		attrs += ` data-email="${encoded}"`;
		return `<a${attrs}></a>`; // 移除可见文本，防被静态抓取
	});
}

function replacePlainEmailsOutsideTags(segment) {
	// 仅替换标签外纯文本中的邮箱，避免修改属性
	const tagRe = /<[^>]+>/g;
	let result = '';
	let lastIndex = 0;
	let m;
	while ((m = tagRe.exec(segment))) {
		const text = segment.slice(lastIndex, m.index).replace(EMAIL_REGEX, (email) => {
			return `<span class="email-protected" data-email="${encodeBase64(email)}"></span>`;
		});
		result += text + m[0];
		lastIndex = tagRe.lastIndex;
	}
	result += segment.slice(lastIndex).replace(EMAIL_REGEX, (email) => `<span class="email-protected" data-email="${encodeBase64(email)}"></span>`);
	return result;
}

function protectEmailsInHtml(html) {
	// 跳过 <code>/<pre> 内部
	const codeBlockRe = /<(code|pre)\b[\s\S]*?<\/\1>/gi;
	let out = '';
	let last = 0;
	let m;
	while ((m = codeBlockRe.exec(html))) {
		const before = html.slice(last, m.index);
		let processed = replaceMailtoAnchors(before);
		processed = replacePlainEmailsOutsideTags(processed);
		out += processed + m[0];
		last = codeBlockRe.lastIndex;
	}
	let tail = html.slice(last);
	tail = replaceMailtoAnchors(tail);
	tail = replacePlainEmailsOutsideTags(tail);
	out += tail;
	return out;
}

async function walkDir(dir, onFile) {
	const entries = await fs.promises.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkDir(full, onFile);
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			await onFile(full);
		}
	}
}

module.exports = function emailProtectionPlugin() {
	return {
		name: 'email-protection',
		async postBuild({ outDir }) {
			await walkDir(outDir, async (file) => {
				try {
					const html = await fs.promises.readFile(file, 'utf8');
					if (!EMAIL_REGEX.test(html) && html.indexOf('mailto:') === -1) return;
					const protectedHtml = protectEmailsInHtml(html);
					if (protectedHtml !== html) {
						await fs.promises.writeFile(file, protectedHtml, 'utf8');
					}
				} catch (e) {
					// 忽略单文件错误，避免中断构建
				}
			});
		},
	};
}; 
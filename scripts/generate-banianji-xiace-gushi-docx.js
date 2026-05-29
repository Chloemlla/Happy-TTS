#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

const SITE_ORIGIN = 'https://www.gushiwenku.cn';
const DEFAULT_SOURCE = `${SITE_ORIGIN}/banianji-xiace/gushi/`;
const DEFAULT_DOCX = '初中八年级下册古诗.docx';
const DEFAULT_MARKDOWN = '初中八年级下册古诗.md';

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_DOCX,
    markdown: DEFAULT_MARKDOWN,
    docx: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--source') {
      args.source = argv[++i];
    } else if (arg === '--output') {
      args.output = argv[++i];
    } else if (arg === '--markdown') {
      args.markdown = argv[++i];
    } else if (arg === '--no-docx') {
      args.docx = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-banianji-xiace-gushi-docx.js [options]

Options:
  --source <url>      First list page URL. Defaults to ${DEFAULT_SOURCE}
  --output <path>     Output .docx path. Defaults to ${DEFAULT_DOCX}
  --markdown <path>   Intermediate markdown path. Defaults to ${DEFAULT_MARKDOWN}
  --no-docx           Only generate markdown; skip pandoc .docx conversion.
`);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function escapeMarkdownLinkText(value) {
  return String(value || '').replace(/([\\[\]])/g, '\\$1');
}

function absoluteUrl(href) {
  return new URL(href, SITE_ORIGIN).href;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 gushiwenku-docx-generator',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parsePoems(html) {
  const poems = [];
  const sectionPattern = /<section\s+class="card">([\s\S]*?)<\/section>/g;
  let sectionMatch;

  while ((sectionMatch = sectionPattern.exec(html))) {
    const section = sectionMatch[1];

    if (!section.includes('poem-headers') || !section.includes('text-content')) {
      continue;
    }

    const linkMatch = section.match(/<a\s+href="([^"]+)"\s+class="poem-link">/);
    const titleMatch = section.match(/<h3\s+class="poem-title">([\s\S]*?)<\/h3>/);
    const dynastyMatch = section.match(/<span\s+class="poem-dynasty">([\s\S]*?)<\/span>/);
    const authorMatch = section.match(/<span\s+class="poem-author">([\s\S]*?)<\/span>/);
    const contentMatch = section.match(/<div\s+class="text-content">([\s\S]*?)<\/div>/);

    if (!linkMatch || !titleMatch || !contentMatch) {
      continue;
    }

    const paragraphs = [...contentMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);

    poems.push({
      title: stripTags(titleMatch[1]),
      dynasty: dynastyMatch ? stripTags(dynastyMatch[1]) : '',
      author: authorMatch ? stripTags(authorMatch[1]) : '',
      url: absoluteUrl(linkMatch[1]),
      paragraphs,
    });
  }

  return poems;
}

function parseNextUrl(html, currentUrl) {
  const nextMatch = html.match(/<a\s+href="([^"]+)"\s+class="pagination-link pagination-next"\s+rel="next">/);
  return nextMatch ? new URL(nextMatch[1], currentUrl).href : '';
}

async function crawlPoems(firstUrl) {
  const poems = [];
  const visited = new Set();
  let url = firstUrl;

  while (url) {
    if (visited.has(url)) {
      throw new Error(`Pagination loop detected at ${url}`);
    }

    visited.add(url);
    console.log(`Fetching ${url}`);

    const html = await fetchHtml(url);
    poems.push(...parsePoems(html));
    url = parseNextUrl(html, url);
  }

  return poems;
}

function toMarkdown(poems) {
  return `${poems
    .map((poem) => {
      const title = escapeMarkdownLinkText(poem.title);
      const meta = escapeMarkdownLinkText(`${poem.dynasty}${poem.author}`);
      const body = poem.paragraphs.join('\n\n');

      return `[**${title}**](${poem.url})\n\n[${meta}](${poem.url})\n\n${body}`;
    })
    .join('\n\n')}\n`;
}

async function writeMarkdown(markdownPath, markdown) {
  const target = path.resolve(markdownPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, markdown, 'utf8');
  return target;
}

function generateDocx(markdownPath, outputPath) {
  const target = path.resolve(outputPath);
  const result = spawnSync('pandoc', [markdownPath, '-o', target], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) {
    throw new Error(`Failed to run pandoc: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`pandoc failed:\n${result.stderr || result.stdout}`);
  }

  return target;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const poems = await crawlPoems(args.source);

  if (!poems.length) {
    throw new Error('No poems parsed from source pages.');
  }

  const markdownPath = await writeMarkdown(args.markdown, toMarkdown(poems));
  console.log(`Wrote ${poems.length} poems to ${markdownPath}`);

  if (args.docx) {
    const docxPath = generateDocx(markdownPath, args.output);
    console.log(`Wrote ${docxPath}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

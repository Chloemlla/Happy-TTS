import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vitePluginsAutoI18n, { GoogleTranslator } from 'vite-auto-i18n-plugin'
import path from 'path'
import JavaScriptObfuscator from 'javascript-obfuscator'

// 在 build 结束后自动混淆 dist 目录下的 JS 文件
import { execSync } from 'child_process';
import fs from 'fs';

function obfuscateDistJs() {
  const distDir = path.resolve(__dirname, 'dist/assets');
  if (!fs.existsSync(distDir)) return;
  const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(distDir, file);
    const code = fs.readFileSync(filePath, 'utf-8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      deadCodeInjection: true,
      stringArray: true,
      stringArrayEncoding: ['rc4'],
      stringArrayThreshold: 0.75,
      selfDefending: true,
      disableConsoleOutput: true,
      unicodeEscapeSequence: true,
    }).getObfuscatedCode();
    fs.writeFileSync(filePath, obfuscated, 'utf-8');
  }
}

// 构建后：将 JS 文件中的所有非 ASCII 字符（如中文）转换为 Unicode \uXXXX 形式
function escapeUnicodeInDistJs() {
  const distDir = path.resolve(__dirname, 'dist/assets');
  if (!fs.existsSync(distDir)) return;
  const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

  // 将任意字符串中的非 ASCII 字符转为 \uXXXX（对 >0xFFFF 的码点使用代理项对）
  const toUnicodeEscapes = (input: string) => {
    let out = '';
    for (const ch of input) {
      const codePoint = ch.codePointAt(0)!;
      if (codePoint <= 0x7F) {
        out += ch; // ASCII 直接保留
      } else if (codePoint <= 0xFFFF) {
        const hex = codePoint.toString(16).padStart(4, '0');
        out += `\\u${hex}`;
      } else {
        // 需要拆分为 UTF-16 代理项对
        const cp = codePoint - 0x10000;
        const high = 0xD800 + ((cp >> 10) & 0x3FF);
        const low = 0xDC00 + (cp & 0x3FF);
        out += `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
      }
    }
    return out;
  };

  for (const file of files) {
    const filePath = path.join(distDir, file);
    let code = fs.readFileSync(filePath, 'utf-8');
    // 快速检查是否含有非 ASCII 字符
    if (!/[\u0080-\uFFFF]/.test(code)) continue;
    const converted = toUnicodeEscapes(code);
    fs.writeFileSync(filePath, converted, 'utf-8');
  }
}

// 构建后：混淆页面中的电子邮件地址，并注入浏览器端还原脚本
function obfuscateEmailsInDist() {
  try {
    const distRoot = path.resolve(__dirname, 'dist');
    const assetsDir = path.join(distRoot, 'assets');
    if (!fs.existsSync(distRoot)) return;

    // 1) 写入客户端还原脚本
    if (fs.existsSync(assetsDir)) {
      const clientJs = `(() => {\n  function decodePlaceholders(str) {\n    return str.replace(/\\\\[\\\\[EMAIL_ENC:([A-Za-z0-9+/=]+)\\\\]\\\\]/g, (_, b64) => {\n      try { return atob(b64); } catch { return ''; }\n    });\n  }\n  function walk(node) {\n    if (node.nodeType === Node.TEXT_NODE) {\n      const decoded = decodePlaceholders(node.nodeValue || '');\n      if (decoded !== node.nodeValue) node.nodeValue = decoded;\n      return;\n    }\n    if (node.nodeType !== Node.ELEMENT_NODE) return;\n    const el = node;\n    for (const attr of el.getAttributeNames()) {\n      const val = el.getAttribute(attr) || '';\n      const dec = decodePlaceholders(val);\n      if (dec !== val) el.setAttribute(attr, dec);\n    }\n    for (const child of Array.from(el.childNodes)) walk(child);\n  }\n  function upgradeMailtoLinks() {\n    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {\n      const href = a.getAttribute('href') || '';\n      const m = href.match(/\\\\[\\\\[EMAIL_ENC:([A-Za-z0-9+/=]+)\\\\]\\\\]/);\n      if (m) {\n        try {\n          const email = atob(m[1]);\n          a.setAttribute('href', 'mailto:' + email);\n          if (!a.textContent || !a.textContent.trim()) a.textContent = email;\n        } catch {}\n      }\n    });\n  }\n  function run() {\n    walk(document.body);\n    upgradeMailtoLinks();\n  }\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', run);\n  } else {\n    run();\n  }\n})();\n`;
      const epFile = path.join(assetsDir, 'email-protection.js');
      fs.writeFileSync(epFile, clientJs, 'utf-8');
    }

    // 2) 注入还原脚本到 index.html
    const indexHtml = path.join(distRoot, 'index.html');
    if (fs.existsSync(indexHtml)) {
      let html = fs.readFileSync(indexHtml, 'utf-8');
      if (!/email-protection\.js/.test(html)) {
        html = html.replace(/<\/body>/i, '  <script defer src="/assets/email-protection.js"></script>\n</body>');
        fs.writeFileSync(indexHtml, html, 'utf-8');
      }
    }

    // 3) 将所有 html/js 文件中的邮箱替换为占位符 [[EMAIL_ENC:BASE64]]
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const replaceEmails = (content: string) => content.replace(emailRegex, (m: string) => `[[EMAIL_ENC:${Buffer.from(m, 'utf-8').toString('base64')}]]`);

    const processFile = (filePath: string) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.html' && ext !== '.js') return;
      let code = fs.readFileSync(filePath, 'utf-8');
      const next = replaceEmails(code);
      if (next !== code) fs.writeFileSync(filePath, next, 'utf-8');
    };

    // index.html
    if (fs.existsSync(indexHtml)) processFile(indexHtml);
    // assets 下 js 与可能存在的 html
    if (fs.existsSync(assetsDir)) {
      for (const name of fs.readdirSync(assetsDir)) {
        const p = path.join(assetsDir, name);
        if (fs.statSync(p).isFile()) processFile(p);
      }
    }
  } catch (err) {
    console.warn('[email-protect] obfuscate failed:', err);
  }
}

// 生成 sitemap.xml（只包含静态、可公开访问的前端路由）
function generateSitemapXml() {
  try {
    const distDir = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(distDir)) return;

    const siteUrlRaw = process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://tts.hapxs.com';
    const siteUrl = String(siteUrlRaw).replace(/\/$/, '');

    // 注意：仅列出静态公共路由；排除需要鉴权的管理/用户页与动态参数路由
    const routes: string[] = [
      '/',
      '/welcome',
      '/policy',
      '/api-docs',
      '/fbi-wanted',
      '/logshare',
      '/case-converter',
      '/outemail',
      '/modlist',
      '/smart-human-check',
      '/librechat',
      '/tiger-adventure',
      '/coin-flip',
      '/markdown-export',
      '/store'
    ];

    const lastmod = new Date().toISOString();
    const urlsXml = routes.map((p) => {
      const loc = `${siteUrl}${p}`;
      // 基本优先级：根路径最高，其余设为中等
      const priority = p === '/' ? '1.0' : '0.6';
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${urlsXml}\n` +
      `</urlset>\n`;

    fs.writeFileSync(path.join(distDir, 'sitemap.xml'), xml, 'utf-8');
    console.log('[sitemap] generated');
  } catch (err) {
    // 静默失败，不阻断构建
    console.warn('[sitemap] generate failed:', err);
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config = {
    plugins: [
      react(),
      // 自动多语言翻译插件（默认使用 Google 翻译）
      // vitePluginsAutoI18n({
      //   enabled: false,
      //   deepScan: true,
      //   translateType: 'full-auto',
      //   translateKey: '$t',
      //   // 默认只扫描 src 目录
      //   includePath: [/src\//],
      //   // 生成语言文件的目录（相对项目根目录），入口需引入 ../lang/index.js
      //   globalPath: './lang',
      //   // 基础语言与目标语言
      //   originLang: 'zh-cn', // 源语言（简体中文）
      //   // 支持 en、zhcn(=zh-cn)、zhtw(=zh-tw)
      //   targetLangList: ['en', 'zh-cn', 'zh-tw'],
      //   // 构建行为
      //   buildToDist: true,
      //   // 将打包后的翻译文件输出到 dist/lang 目录
      //   distPath: 'lang',
      //   // 打包后的翻译主文件名称
      //   distKey: 'index',
      //   rewriteConfig: true,
      //   // 使用默认 Google 翻译（生产环境不走代理）
      //   translator: new GoogleTranslator(
      //     process.env.NODE_ENV === 'production'
      //       ? {}
      //       : {
      //         proxyOption: {
      //           host: '127.0.0.1',
      //           port: 7890,
      //           headers: { 'User-Agent': 'Node' }
      //         }
      //       }
      //   ),
      // }),
      {
        name: 'obfuscator',
        enforce: 'post' as const,
        transform(code: string, id: string) {
          // 只在生产环境进行代码混淆
          if (mode === 'production' && id.endsWith('.js')) {
            const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
              compact: true, // 压缩输出体积，去除多余空白与换行
              controlFlowFlattening: false, // 关闭控制流扁平化（性能开销大，影响运行速度）
              deadCodeInjection: false, // 不注入死代码（避免包体积大幅增长）
              debugProtection: true, // 阻止使用 DevTools 调试（检测 debugger 等）
              debugProtectionInterval: 2000, // 调试防护轮询间隔（毫秒），与 debugProtection 配合
              disableConsoleOutput: true, // 移除/替换 console 输出，降低信息泄露
              identifierNamesGenerator: 'hexadecimal', // 标识符改写为十六进制格式
              log: false, // 关闭混淆器自身日志
              numbersToExpressions: true, // 将字面量数字替换为等价表达式，增加阅读难度
              renameGlobals: false, // 不重命名全局变量，避免与外部环境冲突
              selfDefending: true, // 自我防护：防止格式化/美化与运行时篡改
              simplify: true, // 启用语义保持的简化变换，提升混淆一致性
              splitStrings: true, // 拆分长字符串为片段
              splitStringsChunkLength: 10, // 字符串拆分片段长度
              stringArray: true, // 启用字符串抽离到数组
              stringArrayCallsTransform: true, // 将直接字符串访问改为通过函数访问
              stringArrayCallsTransformThreshold: 0.75, // 上述转换应用的概率阈值
              stringArrayEncoding: ['base64'], // 字符串数组编码方式（base64）
              stringArrayIndexShift: true, // 访问字符串数组时启用索引偏移
              stringArrayRotate: true, // 旋转字符串数组元素顺序
              stringArrayShuffle: true, // 打乱字符串数组顺序
              stringArrayWrappersCount: 2, // 生成多层包装器数量（增加还原成本）
              stringArrayWrappersChainedCalls: true, // 包装器链式调用，进一步混淆
              stringArrayWrappersParametersMaxCount: 4, // 包装器的最大参数个数
              stringArrayWrappersType: 'function', // 包装器实现类型
              stringArrayThreshold: 0.75, // 抽离到字符串数组的概率阈值
              transformObjectKeys: true, // 混淆对象字面量的键名
              unicodeEscapeSequence: true // 使用 Unicode 转义输出字符串
            });
            return {
              code: obfuscationResult.getObfuscatedCode(),
              map: null
            };
          }
        }
      }
    ],
    server: {
      host: '0.0.0.0',
      port: 3001,
      proxy: mode === 'development' ? {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response:', proxyRes.statusCode, req.url);
            });
          }
        },
        '/static': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        },
        '/collect_data': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => '/api/data-collection/collect_data'
        }
      } : undefined,
      allowedHosts: [
        'tts.hapx.one',
        '18.217.88.110',
        'tts.hapxs.com',
        'localhost',
        '127.0.0.1',
        '192.168.137.1'
      ]
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    esbuild: {
      sourcemap: false,
      legalComments: 'none' as const, // 修正为合法枚举值
      logOverride: { 'this-is-undefined-in-esm': 'silent' as const }, // 修正为合法 LogLevel
      treeShaking: true, // 启用tree shaking
      minifyIdentifiers: true, // 暂时禁用以减少内存使用
      minifySyntax: true, // 暂时禁用以减少内存使用
      minifyWhitespace: true, // 暂时禁用以减少内存使用
      keepNames: true, // 保留名称以减少内存使用
      target: 'es2020'
    },
    build: {
      minify: 'terser' as const,
      terserOptions: {
        compress: {
          drop_console: true, // 移除console.log
          drop_debugger: true, // 移除debugger
          pure_funcs: ['console.log', 'console.info', 'console.debug'], // 移除特定函数调用
        },
        mangle: {
          toplevel: true, // 混淆顶级变量名
        },
      },
      rollupOptions: {
        treeshake: true, // 启用tree shaking
        external: (id: string) => {
          // 避免 Rollup 尝试处理可选依赖
          if (process.env.VITE_SKIP_ROLLUP_NATIVE === 'true') {
            return id.includes('@rollup/rollup-linux-x64-gnu') ||
              id.includes('@rollup/rollup-darwin-x64') ||
              id.includes('@rollup/rollup-win32-x64-msvc') ||
              id.includes('@rollup/rollup-win32-x64-gnu');
          }
          return false;
        },
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'router': ['react-router-dom'],
            'ui': ['@radix-ui/react-dialog', 'lucide-react', 'react-icons'],
            'utils': ['axios', 'clsx', 'tailwind-merge'],
            'auth': ['@simplewebauthn/browser', 'qrcode.react'],
            'animations': ['framer-motion'],
            'code-highlight': ['react-syntax-highlighter', 'prismjs'],
            'toast': ['react-toastify'],
            'swagger': ['swagger-ui-react']
          },
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: (assetInfo: any) => {
            if (!assetInfo.name) {
              return 'assets/[name].[hash].[ext]';
            }
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/\.(css)$/.test(assetInfo.name)) {
              return `assets/css/[name].[hash].${ext}`;
            }
            if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name)) {
              return `assets/images/[name].[hash].${ext}`;
            }
            return `assets/[name].[hash].${ext}`;
          }
        },
        onwarn(warning: any, warn: any) {
          if (warning.message && warning.message.includes('sourcemap')) {
            return;
          }
          warn(warning);
        }
      },
      sourcemap: false,
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      reportCompressedSize: true, // 启用压缩大小报告
      target: 'esnext',
      modulePreload: {
        polyfill: false
      },
      chunkSizeWarningLimit: 500, // 降低警告阈值以更好地控制包大小
      emptyOutDir: true
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'axios',
        'clsx',
        'tailwind-merge'
      ],
      exclude: [
        'javascript-obfuscator'
      ],
      force: false
    },
    worker: {
      format: 'es' as const
    },
    // 添加SPA路由支持
    preview: {
      port: 3001,
      host: '0.0.0.0'
    }
  };
  if (mode === 'production') {
    config.build = config.build || {};
    config.build.rollupOptions = config.build.rollupOptions || {};
    // 只在 output 层级添加 writeBundle 钩子
    if (!config.build.rollupOptions.output) config.build.rollupOptions.output = {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'router': ['react-router-dom'],
        'ui': ['@radix-ui/react-dialog', 'lucide-react', 'react-icons'],
        'utils': ['axios', 'clsx', 'tailwind-merge'],
        'auth': ['@simplewebauthn/browser', 'qrcode.react'],
        'animations': ['framer-motion'],
        'code-highlight': ['react-syntax-highlighter', 'prismjs'],
        'toast': ['react-toastify'],
        'swagger': ['swagger-ui-react']
      },
      entryFileNames: 'assets/[name].[hash].js',
      chunkFileNames: 'assets/[name].[hash].js',
      assetFileNames: (assetInfo: any) => {
        if (!assetInfo.name) {
          return 'assets/[name].[hash].[ext]';
        }
        const info = assetInfo.name.split('.');
        const ext = info[info.length - 1];
        if (/\.(css)$/.test(assetInfo.name)) {
          return `assets/css/[name].[hash].${ext}`;
        }
        if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name)) {
          return `assets/images/[name].[hash].${ext}`;
        }
        return `assets/[name].[hash].${ext}`;
      }
    };
    const output = config.build.rollupOptions.output;
    const originalWriteBundle = (typeof output === 'object' && 'writeBundle' in output) ? (output as any).writeBundle : undefined;
    (output as any).writeBundle = () => {
      obfuscateDistJs();
      escapeUnicodeInDistJs();
      generateSitemapXml();
      obfuscateEmailsInDist();
      if (originalWriteBundle) originalWriteBundle();
    };
  }
  return config as any;
}); 
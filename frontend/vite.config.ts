import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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
    }).getObfuscatedCode();
    fs.writeFileSync(filePath, obfuscated, 'utf-8');
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config = {
    plugins: [
      react(),
      {
        name: 'obfuscator',
        enforce: 'post' as const,
        transform(code: string, id: string) {
          // 只在生产环境进行代码混淆
          if (mode === 'production' && id.endsWith('.js')) {
            const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
              compact: true,
              controlFlowFlattening: false,
              deadCodeInjection: false,
              debugProtection: true,
              debugProtectionInterval: 2000,
              disableConsoleOutput: true,
              identifierNamesGenerator: 'hexadecimal',
              log: false,
              numbersToExpressions: true,
              renameGlobals: false,
              selfDefending: true,
              simplify: true,
              splitStrings: true,
              splitStringsChunkLength: 10,
              stringArray: true,
              stringArrayCallsTransform: true,
              stringArrayCallsTransformThreshold: 0.75,
              stringArrayEncoding: ['base64'],
              stringArrayIndexShift: true,
              stringArrayRotate: true,
              stringArrayShuffle: true,
              stringArrayWrappersCount: 2,
              stringArrayWrappersChainedCalls: true,
              stringArrayWrappersParametersMaxCount: 4,
              stringArrayWrappersType: 'function',
              stringArrayThreshold: 0.75,
              transformObjectKeys: true,
              unicodeEscapeSequence: false
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
      // proxy: mode === 'development' ? {
      //   '/api': {
      //     target: 'http://127.0.0.1:3000',
      //     changeOrigin: true,
      //     secure: false,
      //     ws: true,
      //     configure: (proxy, _options) => {
      //       proxy.on('error', (err, _req, _res) => {
      //         console.log('proxy error', err);
      //       });
      //       proxy.on('proxyReq', (proxyReq, req, _res) => {
      //         console.log('Sending Request:', req.method, req.url);
      //       });
      //       proxy.on('proxyRes', (proxyRes, req, _res) => {
      //         console.log('Received Response:', proxyRes.statusCode, req.url);
      //       });
      //     }
      //   },
      //   '/static': {
      //     target: 'http://127.0.0.1:3000',
      //     changeOrigin: true,
      //     secure: false,
      //   }
      // } : undefined,
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
      if (originalWriteBundle) originalWriteBundle();
    };
  }
  return config;
}); 
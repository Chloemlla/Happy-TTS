import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import JavaScriptObfuscator from 'javascript-obfuscator'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'obfuscator',
      enforce: 'post',
      transform(code, id) {
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
    legalComments: 'none',
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    treeShaking: true, // 启用tree shaking
    minifyIdentifiers: true, // 暂时禁用以减少内存使用
    minifySyntax: true, // 暂时禁用以减少内存使用
    minifyWhitespace: true, // 暂时禁用以减少内存使用
    keepNames: true, // 保留名称以减少内存使用
    target: 'es2020'
  },
  build: {
    minify: 'terser', // 使用terser进行更好的压缩
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
      output: {
        manualChunks: (id) => {
          // 更细粒度的代码分割策略
          if (id.includes('node_modules')) {
            // React相关库
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // 路由相关
            if (id.includes('react-router')) {
              return 'router';
            }
            // UI组件库
            if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('react-icons')) {
              return 'ui-components';
            }
            // 动画库
            if (id.includes('framer-motion')) {
              return 'animations';
            }
            // 认证相关
            if (id.includes('@simplewebauthn') || id.includes('qrcode.react')) {
              return 'auth';
            }
            // 代码高亮
            if (id.includes('react-syntax-highlighter') || id.includes('prismjs')) {
              return 'code-highlight';
            }
            // 工具库
            if (id.includes('axios') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'utils';
            }
            // 通知库
            if (id.includes('react-toastify')) {
              return 'toast';
            }
            // API文档
            if (id.includes('swagger-ui-react')) {
              return 'swagger';
            }
            // 其他第三方库
            return 'vendor';
          }
          // 组件级别的分割
          if (id.includes('/components/')) {
            if (id.includes('TOTP') || id.includes('Passkey')) {
              return 'auth-components';
            }
            if (id.includes('ApiDocs') || id.includes('LogShare')) {
              return 'admin-components';
            }
            if (id.includes('TTS') || id.includes('Audio')) {
              return 'tts-components';
            }
            return 'common-components';
          }
        },
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: (assetInfo) => {
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
      onwarn(warning, warn) {
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
    format: 'es'
  }
})) 
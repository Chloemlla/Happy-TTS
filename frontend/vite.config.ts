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
    // 增强摇树优化
    treeShaking: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        // 增强摇树优化
        passes: 2,
        unsafe: true,
        unsafe_comps: true,
        unsafe_Function: true,
        unsafe_math: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        unsafe_undefined: true
      },
      mangle: {
        safari10: true,
        // 增强名称混淆
        toplevel: true,
        properties: {
          regex: /^_/
        }
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      // 增强摇树优化配置
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
        tryCatchDeoptimization: false
      },
      output: {
        manualChunks: mode === 'analyze' ? undefined : {
          // 更精细的代码分割
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
        // 确保生成的文件名是唯一的
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      },
      onwarn(warning, warn) {
        if (warning.message && warning.message.includes('sourcemap')) {
          return;
        }
        warn(warning);
      }
    },
    // 启用源码映射，方便调试
    sourcemap: false,
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 启用资源压缩
    assetsInlineLimit: 4096,
    // 启用 gzip 压缩
    reportCompressedSize: true,
    // 增强摇树优化
    target: 'esnext',
    modulePreload: {
      polyfill: false
    }
  },
  // 优化依赖预构建
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
    ]
  }
})) 
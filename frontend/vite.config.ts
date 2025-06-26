import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import JavaScriptObfuscator from 'javascript-obfuscator'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'obfuscator',
      enforce: 'post',
      transform(code, id) {
        if (id.endsWith('.js')) {
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
    host: true,
    port: 3001,
    allowedHosts: [
      'tts.hapx.one',
      '18.217.88.110',
      'tts.hapxs.com',
      'localhost',
      '127.0.0.1'
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
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          utils: ['axios', 'framer-motion']
        },
        // 确保生成的文件名是唯一的
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    },
    // 启用源码映射，方便调试
    sourcemap: false,
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 启用资源压缩
    assetsInlineLimit: 4096,
    // 启用 gzip 压缩
    reportCompressedSize: true
  }
}) 
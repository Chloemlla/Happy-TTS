import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Synapse API 文档',
  tagline: 'Synapse 文本转语音服务 API 文档',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://synapse-docs.example.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'synapse', // Usually your GitHub org/user name.
  projectName: 'synapse', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/synapse/synapse/tree/main/frontend/docs/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/synapse/synapse/tree/main/frontend/docs/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Synapse API',
      logo: {
        alt: 'Synapse Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API 文档',
        },
        {to: '/blog', label: '更新日志', position: 'left'},
        {
          href: 'https://github.com/synapse/synapse',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            {
              label: 'API 文档',
              to: '/docs/intro',
            },
            {
              label: '快速开始',
              to: '/docs/getting-started',
            },
          ],
        },
        {
          title: '社区',
          items: [
            {
              label: 'GitHub Issues',
              href: 'https://github.com/synapse/synapse/issues',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/synapse',
            },
          ],
        },
        {
          title: '更多',
          items: [
            {
              label: '更新日志',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/synapse/synapse',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Synapse. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    metadata: [
      {name: 'keywords', content: 'TTS, 文本转语音, API, 文档'},
      {name: 'description', content: 'Synapse 文本转语音服务 API 文档'},
    ],
  } satisfies Preset.ThemeConfig,

  // 添加自定义配置
  customFields: {
    // 自定义字段
  },

  // 添加端口配置
  scripts: [
    // 可以添加自定义脚本
  ],

  // 添加样式配置
  stylesheets: [
    // 可以添加自定义样式表
  ],

  // 添加插件配置
  plugins: [
    // 可以添加自定义插件
  ],

  // 添加主题配置
  themes: [
    // 可以添加自定义主题
  ],
};

export default config;

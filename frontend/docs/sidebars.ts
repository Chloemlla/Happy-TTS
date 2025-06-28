import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  apiSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: '介绍',
    },
    {
      type: 'doc',
      id: 'getting-started',
      label: '快速开始',
    },
    {
      type: 'category',
      label: 'API 参考',
      items: [
        'api/authentication',
        'api/tts-endpoints',
        'api/user-management',
        'api/error-codes',
      ],
    },
    {
      type: 'category',
      label: '教程',
      items: [
        'tutorials/basic-usage',
      ],
    },
    {
      type: 'link',
      label: '博客',
      href: '/blog',
    },
    {
      type: 'category',
      label: 'SDK 文档',
      items: [
        { type: 'doc', id: 'sdk/tts-sdk', label: 'TTS SDK (Node.js)' },
        { type: 'doc', id: 'sdk/python-sdk', label: 'Python SDK' },
        { type: 'doc', id: 'sdk/rest-api', label: 'REST API' },
        { type: 'doc', id: 'sdk/java-sdk', label: 'Java SDK' },
        { type: 'doc', id: 'sdk/go-sdk', label: 'Go SDK' },
        { type: 'doc', id: 'sdk/web-frontend', label: 'Web 前端调用' },
        { type: 'doc', id: 'sdk/rust-sdk', label: 'Rust SDK' },
      ],
    },
  ],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

export default sidebars;
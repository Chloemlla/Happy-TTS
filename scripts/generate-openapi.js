const swaggerJSDoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

// glob 在所有平台都把 `\` 当转义符，所以 path.join 拼出的 Windows 路径会 0 命中，
// 生成一份 paths 为空的 openapi.json。glob 模式必须始终用正斜杠。
const projectRoot = process.cwd().split(path.sep).join('/');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Synapse API 文档',
      version: '1.0.0',
      description: '基于 OpenAPI 3.0 的接口文档'
    }
  },
  apis: [
    `${projectRoot}/src/routes/**/*.ts`,
    `${projectRoot}/dist/routes/**/*.js`
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

fs.writeFileSync(
  path.join(process.cwd(), 'openapi.json'),
  JSON.stringify(swaggerSpec, null, 2),
  'utf-8'
);

console.log('openapi.json has been generated.'); 

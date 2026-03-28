const swaggerJSDoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

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
    path.join(process.cwd(), 'src/routes/*.ts'),
    path.join(process.cwd(), 'dist/routes/*.js')
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

fs.writeFileSync(
  path.join(process.cwd(), 'openapi.json'),
  JSON.stringify(swaggerSpec, null, 2),
  'utf-8'
);

console.log('openapi.json has been generated.'); 
import React, { useState, useMemo, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  desc: string;
  descEn?: string;
  example?: any;
  children?: ApiParam[];
}
interface ApiError {
  code: number;
  msg: string;
  msgEn?: string;
}
interface ApiItem {
  name: string;
  nameEn?: string;
  method: string;
  path: string;
  desc: string;
  descEn?: string;
  params: ApiParam[];
  response: string;
  responseExample?: any;
  errors: ApiError[];
}
interface ApiGroup {
  group: string;
  groupEn?: string;
  apis: ApiItem[];
}

// 递归解析 OpenAPI schema 为参数结构
function parseSchema(name: string, schema: any, required: boolean, lang: 'zh'|'en'): ApiParam {
  const param: ApiParam = {
    name,
    type: schema.type || 'object',
    required,
    desc: schema.description || name,
    descEn: schema['x-desc-en'] || '',
    example: schema.example,
  };
  if (schema.type === 'object' && schema.properties) {
    param.children = Object.entries(schema.properties).map(([k, v]: [string, any]) =>
      parseSchema(k, v, (schema.required || []).includes(k), lang)
    );
  } else if (schema.type === 'array' && schema.items) {
    param.children = [parseSchema('items', schema.items, true, lang)];
  }
  return param;
}

// 分组自定义排序
const groupOrderZh = ['用户认证与账户 User Authentication', '二次验证（TOTP）', '语音合成', '管理员接口', '其它接口 Others'];
const groupOrderEn = ['User Authentication', 'TOTP', 'TTS', 'Admin', 'Others'];
function sortGroups(groups: ApiGroup[], lang: 'zh'|'en') {
  const order = lang === 'zh' ? groupOrderZh : groupOrderEn;
  return [...groups].sort((a, b) => {
    const aName = lang === 'zh' ? a.group : a.groupEn || a.group;
    const bName = lang === 'zh' ? b.group : b.groupEn || b.group;
    const aIdx = order.findIndex(g => aName.includes(g));
    const bIdx = order.findIndex(g => bName.includes(g));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return aName.localeCompare(bName, lang === 'zh' ? 'zh' : 'en');
  });
}

// 示例代码多语言tab
const codeLangs = [
  { key: 'curl', zh: 'curl 示例', en: 'curl Example', lang: 'bash' },
  { key: 'axios', zh: 'axios 示例', en: 'axios Example', lang: 'javascript' },
  { key: 'fetch', zh: 'fetch 示例', en: 'fetch Example', lang: 'javascript' },
  { key: 'python', zh: 'Python requests', en: 'Python requests', lang: 'python' },
  { key: 'go', zh: 'Go', en: 'Go', lang: 'go' },
];

// 生成多语言代码示例
function genExample(api: ApiItem) {
  let url = api.path.replace(/:([a-zA-Z_]+)/g, (_m: string, p1: string) => `\u007f${p1}\u007f`);
  let urlForShow = url.replace(/\u007f([a-zA-Z_]+)\u007f/g, '<$1>');
  let urlForCode = url.replace(/\u007f([a-zA-Z_]+)\u007f/g, '${$1}');
  let method = api.method.toUpperCase();
  let base = 'https://tts-api.hapxs.com';
  let headers: Record<string, string> = {};
  let body: Record<string, string> = {};
  (api.params || []).forEach((p: ApiParam) => {
    if (p.type === 'header') headers[p.name] = p.required ? 'YOUR_TOKEN' : '';
    else if (method === 'GET') urlForShow += (urlForShow.includes('?') ? '&' : '?') + `${p.name}=${p.required ? '<必填>' : ''}`;
    else body[p.name] = p.required ? '<必填>' : '';
  });
  let curl = `curl -X ${method} '${base}${urlForShow}'`;
  if (Object.keys(headers).length)
    curl += ' \\\n  -H ' + Object.entries(headers).map(([k, v]) => `'${k}: Bearer ${v}'`).join(' -H ');
  if (method !== 'GET' && Object.keys(body).length)
    curl += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
  let axiosCode = `axios.${method.toLowerCase()}('${base}${urlForCode}'${method === 'GET' ? '' : ', ' + JSON.stringify(body, null, 2)}${Object.keys(headers).length ? ', { headers: { ' + Object.entries(headers).map(([k, v]) => `'${k}': 'Bearer ${v}'`).join(', ') + ' } }' : ''})`;
  let fetchCode = `fetch('${base}${urlForCode}', {\n  method: '${method}',\n  headers: {\n    ${Object.keys(headers).map(k => `'${k}': 'Bearer ${headers[k]}'`).join(',\n    ')}\n    'Content-Type': 'application/json'\n  },\n  ${method !== 'GET' && Object.keys(body).length ? `body: JSON.stringify(${JSON.stringify(body, null, 2)}),` : ''}\n})`;
  let python = `import requests\nurl = '${base}${urlForShow}'\nheaders = {${Object.keys(headers).map(k => `'${k}': 'Bearer ${headers[k]}'`).join(', ')}}\n${method !== 'GET' ? `data = ${JSON.stringify(body, null, 2)}\n` : ''}response = requests.${method.toLowerCase()}(url${method !== 'GET' ? ', json=data' : ''}, headers=headers)\nprint(response.json())`;
  let go = `package main\nimport (\n  \"fmt\"\n  \"net/http\"\n  \"io/ioutil\"\n  \"strings\"\n)\nfunc main() {\n  url := \"${base}${urlForShow}\"\n  method := \"${method}\"\n  client := &http.Client{}\n  req, _ := http.NewRequest(method, url, strings.NewReader(${method !== 'GET' && Object.keys(body).length ? '`' + JSON.stringify(body, null, 2) + '`' : '""'}))\n  req.Header.Add(\"Content-Type\", \"application/json\")\n  ${Object.keys(headers).map(k => `req.Header.Add(\"${k}\", \"Bearer ${headers[k]}\")`).join('\n  ')}\n  res, _ := client.Do(req)\n  defer res.Body.Close()\n  body, _ := ioutil.ReadAll(res.Body)\n  fmt.Println(string(body))\n}`;
  return { curl, axios: axiosCode, fetch: fetchCode, python, go };
}

// 复制到剪贴板
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// 递归渲染参数结构
function renderParams(params: ApiParam[], lang: 'zh'|'en', level = 0) {
  return params.map((p, k) => (
    <React.Fragment key={k}>
      <tr className={level ? 'bg-gray-50 dark:bg-gray-900' : ''}>
        <td className="px-2 py-1 font-mono text-blue-700 dark:text-blue-300" style={{paddingLeft: level * 16}}>{p.name}</td>
        <td className="px-2 py-1 text-green-700 dark:text-green-300">{p.type}</td>
        <td className="px-2 py-1">{p.required ? (lang==='zh' ? '是' : 'Yes') : (lang==='zh' ? '否' : 'No')}</td>
        <td className="px-2 py-1 text-gray-600 dark:text-gray-400">{lang==='zh' ? p.desc : p.descEn || p.desc}</td>
        <td className="px-2 py-1 text-yellow-700 dark:text-yellow-300">{p.example !== undefined ? JSON.stringify(p.example) : ''}</td>
      </tr>
      {/* 递归渲染子属性 */}
      {Array.isArray((p as any).children) && (p as any).children.length > 0 && renderParams((p as any).children, lang, level + 1)}
    </React.Fragment>
  ));
}

// openApiToApiDocs 增强，递归解析 requestBody schema
function openApiToApiDocs(openapi: any): ApiGroup[] {
  if (!openapi.paths || typeof openapi.paths !== 'object') return [];
  const tagMap: Record<string, ApiGroup> = {};
  for (const path in openapi.paths) {
    for (const method in openapi.paths[path]) {
      const op = openapi.paths[path][method];
      const tags = op.tags || ['其它接口 Others'];
      const groupName = tags[0];
      if (!tagMap[groupName]) tagMap[groupName] = { group: groupName, apis: [] };
      // 参数
      let params: ApiParam[] = [];
      if (op.parameters) {
        for (const p of op.parameters) {
          params.push({
            name: p.name,
            type: p.schema?.type || 'string',
            required: !!p.required,
            desc: p.description || p.name,
            descEn: p['x-desc-en'] || '',
            example: p.example
          });
        }
      }
      // requestBody递归解析
      if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
        const schema = op.requestBody.content['application/json'].schema;
        if (schema && schema.properties) {
          for (const k in schema.properties) {
            params.push(parseSchema(k, schema.properties[k], (schema.required || []).includes(k), 'zh'));
          }
        }
      }
      // header参数
      if (op.parameters) {
        for (const p of op.parameters) {
          if (p.in === 'header') {
            params.push({
              name: p.name,
              type: 'header',
              required: !!p.required,
              desc: p.description || p.name,
              descEn: p['x-desc-en'] || '',
              example: p.example
            });
          }
        }
      }
      // 响应
      let response = '';
      let responseExample = undefined;
      if (op.responses) {
        const codes = Object.keys(op.responses);
        if (codes.length) {
          const first = op.responses[codes[0]];
          if (first.content && first.content['application/json']) {
            if (first.content['application/json'].example) {
              response = JSON.stringify(first.content['application/json'].example, null, 2);
              responseExample = first.content['application/json'].example;
            } else if (first.content['application/json'].examples) {
              const ex = Object.values(first.content['application/json'].examples)[0] as any;
              if (ex && ex.value) {
                response = JSON.stringify(ex.value, null, 2);
                responseExample = ex.value;
              }
            }
          } else if (first.description) {
            response = first.description;
          }
        }
      }
      // 错误码
      const errors: ApiError[] = [];
      if (op.responses) {
        for (const code in op.responses) {
          if (code === '200' || code === '201') continue;
          const desc = op.responses[code].description || '';
          errors.push({ code: Number(code), msg: desc, msgEn: op.responses[code]['x-desc-en'] });
        }
      }
      tagMap[groupName].apis.push({
        name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
        nameEn: op['x-summary-en'] || '',
        method: method.toUpperCase(),
        path,
        desc: op.description || '',
        descEn: op['x-desc-en'] || '',
        params,
        response,
        responseExample,
        errors
      });
    }
  }
  return Object.values(tagMap);
}

const ApiDocs: React.FC = () => {
  const [apiDocs, setApiDocs] = useState<ApiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fold, setFold] = useState<Record<number, boolean>>({});
  const [copyTip, setCopyTip] = useState('');
  const [lang, setLang] = useState<'zh'|'en'>('zh');
  const [dark, setDark] = useState(false);
  const [codeTab, setCodeTab] = useState<'curl'|'axios'|'fetch'|'python'|'go'>('curl');

  useEffect(() => {
    let timeoutId: any;
    let didTimeout = false;

    // 超时2秒后上报
    timeoutId = setTimeout(() => {
      didTimeout = true;
      fetch('/api/report-docs-timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: '/api/api-docs.json',
          timestamp: Date.now(),
          userAgent: navigator.userAgent
        })
      });
    }, 2000);

    fetch('/api/api-docs.json')
      .then(res => res.json())
      .then(openapi => {
        if (!didTimeout) {
          clearTimeout(timeoutId);
          const docs = openApiToApiDocs(openapi);
          setApiDocs(docs);
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => clearTimeout(timeoutId);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return apiDocs;
    const s = search.trim().toLowerCase();
    return apiDocs
      .map(group => ({
        ...group,
        apis: group.apis.filter(api =>
          (lang === 'zh' ? api.name : api.nameEn || api.name).toLowerCase().includes(s) ||
          api.path.toLowerCase().includes(s) ||
          (lang === 'zh' ? api.desc : api.descEn || api.desc).toLowerCase().includes(s) ||
          (api.params || []).some(p => (lang === 'zh' ? p.name : p.name).toLowerCase().includes(s))
        )
      }))
      .filter(g => g.apis.length);
  }, [search, apiDocs, lang]);

  function handleCopy(text: string) {
    copyToClipboard(text);
    setCopyTip(lang === 'zh' ? '已复制' : 'Copied!');
    setTimeout(() => setCopyTip(''), 1200);
  }

  const syntaxTheme = dark ? oneDark : oneLight;

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-lg text-gray-500">{lang === 'zh' ? '正在加载API文档...' : 'Loading API docs...'}</div>;
  }

  return (
    <div className={dark ? 'dark bg-gray-900 min-h-screen' : ''}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">API 文档 / API Documentation</h1>
          <div className="flex gap-2 items-center">
            <button className={lang==='zh' ? 'font-bold underline' : ''} onClick={()=>setLang('zh')}>中文</button>
            <span className="text-gray-400">/</span>
            <button className={lang==='en' ? 'font-bold underline' : ''} onClick={()=>setLang('en')}>EN</button>
            <span className="ml-4 cursor-pointer" onClick={()=>setDark(d=>!d)} title="切换深色模式/Toggle dark mode">{dark ? '🌙' : '☀️'}</span>
          </div>
        </div>
        <div className="mb-8 bg-indigo-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <p className="text-gray-700 dark:text-gray-200 mb-2">{lang==='zh' ? '本页面详细介绍后端所有API接口，包含请求方式、参数、返回值、错误码及中英文对照说明。' : 'This page documents all backend API endpoints, including method, params, response, errors, and bilingual description.'}</p>
        </div>
        <div className="mb-8 flex items-center gap-4">
          <input
            className="border rounded px-3 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:bg-gray-900 dark:text-white"
            placeholder={lang==='zh' ? '搜索接口/参数/描述...' : 'Search API/param/desc...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="text-gray-400 text-sm">{lang==='zh' ? '共' : 'Total'} {filtered.reduce((a, g) => a + g.apis.length, 0)} {lang==='zh' ? '个接口' : 'APIs'}</span>
        </div>
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">{lang==='zh' ? '目录' : 'Table of Contents'}</h2>
          <ul className="list-disc ml-6 space-y-1">
            {filtered.map((group, i) => (
              <li key={i}>
                <a href={`#group-${i}`} className="text-indigo-600 hover:underline dark:text-indigo-300">{lang==='zh' ? group.group : group.groupEn || group.group}</a>
              </li>
            ))}
          </ul>
        </div>
        {sortGroups(filtered, lang).map((group, i) => (
          <div key={i} className="mb-12" id={`group-${i}`}> 
            <h2
              className="text-2xl font-bold text-indigo-800 dark:text-indigo-200 mb-4 border-b pb-2 cursor-pointer select-none flex items-center"
              onClick={() => setFold(f => ({ ...f, [i]: !f[i] }))}
            >
              <span className="mr-2">{lang==='zh' ? group.group : group.groupEn || group.group}</span>
              <span className="text-xs text-indigo-400">[{fold[i] ? (lang==='zh' ? '展开' : 'Expand') : (lang==='zh' ? '折叠' : 'Fold')}]</span>
            </h2>
            {!fold[i] && group.apis.map((api, j) => {
              const ex = genExample(api);
              return (
                <div key={j} className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-indigo-100 dark:border-gray-700">
                  <div className="flex flex-wrap items-center mb-2">
                    <span className="font-bold text-lg text-indigo-700 dark:text-indigo-200 mr-4">{lang==='zh' ? api.name : api.nameEn || api.name}</span>
                    <span className="bg-indigo-100 dark:bg-gray-700 text-indigo-700 dark:text-indigo-200 px-2 py-1 rounded text-xs font-mono mr-2">{api.method}</span>
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{api.path}</span>
                  </div>
                  <div className="mb-2 text-gray-700 dark:text-gray-200 whitespace-pre-line">{lang==='zh' ? api.desc : api.descEn || api.desc}</div>
                  <div className="mb-2">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{lang==='zh' ? '参数' : 'Params'}:</span>
                    <table className="w-full text-sm mt-1 mb-2 border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700">
                          <th className="px-2 py-1 text-left">{lang==='zh' ? '名称' : 'Name'}</th>
                          <th className="px-2 py-1 text-left">{lang==='zh' ? '类型' : 'Type'}</th>
                          <th className="px-2 py-1 text-left">{lang==='zh' ? '必填' : 'Required'}</th>
                          <th className="px-2 py-1 text-left">{lang==='zh' ? '描述' : 'Description'}</th>
                          <th className="px-2 py-1 text-left">{lang==='zh' ? '示例' : 'Example'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {api.params.length === 0 && <tr><td colSpan={5} className="text-gray-400 dark:text-gray-500">{lang==='zh' ? '无' : 'None'}</td></tr>}
                        {renderParams(api.params, lang)}
                      </tbody>
                    </table>
                  </div>
                  <div className="mb-2">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{lang==='zh' ? '返回示例' : 'Response Example'}:</span>
                    {api.responseExample ? (
                      <SyntaxHighlighter language="json" style={syntaxTheme} className="rounded border border-gray-100 dark:border-gray-700 mt-1">
                        {JSON.stringify(api.responseExample, null, 2)}
                      </SyntaxHighlighter>
                    ) : (
                      <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-sm overflow-x-auto border border-gray-100 dark:border-gray-700 mt-1">{api.response}</pre>
                    )}
                  </div>
                  <div className="mb-2">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{lang==='zh' ? '错误码' : 'Errors'}:</span>
                    <ul className="list-disc ml-6">
                      {api.errors.length === 0 && <li className="text-gray-400 dark:text-gray-500">{lang==='zh' ? '无' : 'None'}</li>}
                      {api.errors.map((e, k) => (
                        <li key={k}><span className="font-mono text-sm text-red-700 dark:text-red-300">{e.code}</span> <span className="ml-2 text-gray-500 dark:text-gray-400">{lang==='zh' ? e.msg : e.msgEn || e.msg}</span></li>
                      ))}
                    </ul>
                  </div>
                  {/* 示例代码多语言tab切换 */}
                  <div className="mb-2">
                    <div className="flex items-center mb-1 gap-2">
                      {codeLangs.map(tab => (
                        <button
                          key={tab.key}
                          className={`text-xs px-2 py-1 rounded ${codeTab===tab.key ? 'bg-indigo-500 text-white' : 'text-indigo-500 hover:underline'}`}
                          onClick={()=>setCodeTab(tab.key as any)}
                        >{lang==='zh' ? tab.zh : tab.en}</button>
                      ))}
                      <button className="ml-auto text-xs text-indigo-500 hover:underline" onClick={() => handleCopy(ex[codeTab])}>{lang==='zh' ? '复制' : 'Copy'}</button>
                    </div>
                    <SyntaxHighlighter language={codeLangs.find(t=>t.key===codeTab)?.lang||'bash'} style={syntaxTheme} className="rounded border border-gray-100 dark:border-gray-700 mt-1">
                      {ex[codeTab]}
                    </SyntaxHighlighter>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {/* 复制提示 */}
        {copyTip && <div className="fixed bottom-8 right-8 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50 animate-bounce">{copyTip}</div>}
      </div>
    </div>
  );
};

export default ApiDocs; 
import React, { useState, useMemo } from 'react';

interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  desc: string;
}
interface ApiError {
  code: number;
  msg: string;
}
interface ApiItem {
  name: string;
  method: string;
  path: string;
  desc: string;
  params: ApiParam[];
  response: string;
  errors: ApiError[];
}
interface ApiGroup {
  group: string;
  apis: ApiItem[];
}

// 生成curl/axios/fetch示例代码
function genExample(api: ApiItem) {
  // 路径参数替换
  let url = api.path.replace(/:([a-zA-Z_]+)/g, (_m: string, p1: string) => `\u007f${p1}\u007f`); // 用特殊符号防止和json冲突
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
  // curl
  let curl = `curl -X ${method} '${base}${urlForShow}'`;
  if (Object.keys(headers).length)
    curl += ' \\\n  -H ' + Object.entries(headers).map(([k, v]) => `'${k}: Bearer ${v}'`).join(' -H ');
  if (method !== 'GET' && Object.keys(body).length)
    curl += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
  // axios
  let axiosCode = `axios.${method.toLowerCase()}('${base}${urlForCode}'${method === 'GET' ? '' : ', ' + JSON.stringify(body, null, 2)}${Object.keys(headers).length ? ', { headers: { ' + Object.entries(headers).map(([k, v]) => `'${k}': 'Bearer ${v}'`).join(', ') + ' } }' : ''})`;
  // fetch
  let fetchCode = `fetch('${base}${urlForCode}', {\n  method: '${method}',\n  headers: {\n    ${Object.keys(headers).map(k => `'${k}': 'Bearer ${headers[k]}'`).join(',\n    ')}\n    'Content-Type': 'application/json'\n  },\n  ${method !== 'GET' && Object.keys(body).length ? `body: JSON.stringify(${JSON.stringify(body, null, 2)}),` : ''}\n})`;
  return { curl, axios: axiosCode, fetch: fetchCode };
}

// 复制到剪贴板
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// 远程api-docs.json自动同步（预留，当前用本地数据）
// 可用useEffect+fetch('/api/api-docs.json')实现

const apiDocs: ApiGroup[] = [
  {
    group: '用户认证与账户 User Authentication',
    apis: [
      {
        name: '注册 Register',
        method: 'POST',
        path: '/api/auth/register',
        desc: '用户注册。\nRegister a new user.',
        params: [
          { name: 'username', type: 'string', required: true, desc: '用户名 Username' },
          { name: 'email', type: 'string', required: true, desc: '邮箱 Email' },
          { name: 'password', type: 'string', required: true, desc: '密码 Password' },
        ],
        response: `{
  "id": "xxx",
  "username": "testuser",
  "email": "test@example.com",
  "role": "user",
  "createdAt": "2024-06-01T12:00:00Z"
}`,
        errors: [
          { code: 400, msg: '缺少参数/格式错误/用户名或邮箱已被使用\nMissing params/invalid format/username or email already used' },
          { code: 500, msg: '注册失败\nRegister failed' },
        ],
      },
      {
        name: '登录 Login',
        method: 'POST',
        path: '/api/auth/login',
        desc: '用户登录。\nUser login.',
        params: [
          { name: 'identifier', type: 'string', required: true, desc: '用户名或邮箱 Username or Email' },
          { name: 'password', type: 'string', required: true, desc: '密码 Password' },
        ],
        response: `{
  "user": { ... },
  "token": "xxx",
  "requiresTOTP": true // 若启用二次验证 If TOTP enabled
}`,
        errors: [
          { code: 400, msg: '缺少参数\nMissing params' },
          { code: 401, msg: '用户名/邮箱或密码错误\nWrong username/email or password' },
          { code: 500, msg: '登录失败\nLogin failed' },
        ],
      },
      {
        name: '获取当前用户信息 Get Current User',
        method: 'GET',
        path: '/api/auth/me',
        desc: '获取当前登录用户信息。\nGet current user info.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
        ],
        response: `{
  "id": "xxx",
  "username": "testuser",
  ...
}`,
        errors: [
          { code: 401, msg: '未登录\nNot logged in' },
          { code: 404, msg: '用户不存在\nUser not found' },
        ],
      },
      {
        name: '退出登录 Logout',
        method: 'POST',
        path: '/api/auth/logout',
        desc: '退出登录。\nLogout.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
        ],
        response: `{
  "success": true
}`,
        errors: [],
      },
    ],
  },
  {
    group: '二次验证 TOTP',
    apis: [
      {
        name: '生成TOTP设置 Generate TOTP Setup',
        method: 'POST',
        path: '/api/totp/generate-setup',
        desc: '生成TOTP密钥、二维码和恢复码。\nGenerate TOTP secret, QR code and backup codes.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
        ],
        response: `{
  "secret": "xxxx",
  "otpauthUrl": "otpauth://...",
  "qrCodeDataUrl": "data:image/png;base64,...",
  "backupCodes": ["XXXX-XXXX", ...],
  "message": "请使用认证器应用扫描QR码..."
}`,
        errors: [
          { code: 401, msg: '未授权\nUnauthorized' },
          { code: 400, msg: 'TOTP已经启用\nTOTP already enabled' },
        ],
      },
      {
        name: '验证并启用TOTP Verify and Enable TOTP',
        method: 'POST',
        path: '/api/totp/verify-and-enable',
        desc: '输入验证码，启用TOTP。\nInput code to enable TOTP.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
          { name: 'token', type: 'string', required: true, desc: '6位验证码 6-digit code' },
        ],
        response: `{
  "message": "TOTP设置成功",
  "enabled": true
}`,
        errors: [
          { code: 400, msg: '验证码错误\nWrong code' },
          { code: 429, msg: '验证尝试次数过多\nToo many attempts' },
        ],
      },
      {
        name: '登录时验证TOTP Verify TOTP at Login',
        method: 'POST',
        path: '/api/totp/verify-token',
        desc: '登录时输入验证码或恢复码。\nVerify TOTP or backup code at login.',
        params: [
          { name: 'userId', type: 'string', required: true, desc: '用户ID User ID' },
          { name: 'token', type: 'string', required: false, desc: '6位验证码 6-digit code' },
          { name: 'backupCode', type: 'string', required: false, desc: '备用恢复码 Backup code' },
        ],
        response: `{
  "message": "验证成功",
  "verified": true
}`,
        errors: [
          { code: 400, msg: '验证码/恢复码错误\nWrong code/backup code' },
          { code: 429, msg: '验证尝试次数过多\nToo many attempts' },
        ],
      },
      {
        name: '获取TOTP状态 Get TOTP Status',
        method: 'GET',
        path: '/api/totp/status',
        desc: '获取TOTP是否启用及恢复码状态。\nGet TOTP enabled and backup code status.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
        ],
        response: `{
  "enabled": true,
  "hasBackupCodes": true
}`,
        errors: [],
      },
      {
        name: '获取恢复码 Get Backup Codes',
        method: 'GET',
        path: '/api/totp/backup-codes',
        desc: '获取当前可用的恢复码。\nGet available backup codes.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
        ],
        response: `{
  "backupCodes": ["XXXX-XXXX", ...],
  "remainingCount": 5,
  "message": "备用恢复码获取成功"
}`,
        errors: [
          { code: 404, msg: '没有可用的备用恢复码\nNo backup codes' },
        ],
      },
      {
        name: '禁用TOTP Disable TOTP',
        method: 'POST',
        path: '/api/totp/disable',
        desc: '禁用二次验证。\nDisable TOTP.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
          { name: 'token', type: 'string', required: true, desc: '6位验证码 6-digit code' },
        ],
        response: `{
  "message": "TOTP已禁用",
  "enabled": false
}`,
        errors: [
          { code: 400, msg: '验证码错误\nWrong code' },
        ],
      },
      {
        name: '重新生成恢复码 Regenerate Backup Codes',
        method: 'POST',
        path: '/api/totp/regenerate-backup-codes',
        desc: '重新生成备用恢复码。\nRegenerate backup codes.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token' },
        ],
        response: `{
  "backupCodes": ["XXXX-XXXX", ...],
  "remainingCount": 5,
  "message": "备用恢复码重新生成成功"
}`,
        errors: [],
      },
    ],
  },
  {
    group: '语音合成 TTS',
    apis: [
      {
        name: '语音合成 Generate Speech',
        method: 'POST',
        path: '/api/tts',
        desc: '提交文本生成语音。\nSubmit text to generate speech.',
        params: [
          { name: 'text', type: 'string', required: true, desc: '文本内容 Text' },
          { name: 'model', type: 'string', required: false, desc: '模型 Model' },
          { name: 'voice', type: 'string', required: false, desc: '声音 Voice' },
          { name: 'output_format', type: 'string', required: false, desc: '输出格式 Output format' },
          { name: 'speed', type: 'number', required: false, desc: '语速 Speed' },
          { name: 'fingerprint', type: 'string', required: false, desc: '指纹 Fingerprint' },
          { name: 'generationCode', type: 'string', required: true, desc: '生成码 Generation code' },
        ],
        response: `{
  "audioUrl": "https://...",
  "signature": "..."
}`,
        errors: [
          { code: 400, msg: '文本内容不能为空/文本长度超限/违禁词/重复内容\nText required/too long/prohibited/duplicate' },
          { code: 403, msg: '生成码无效\nInvalid generation code' },
          { code: 429, msg: '今日使用次数已达上限\nUsage limit reached' },
        ],
      },
      {
        name: '获取历史记录 Get Recent Generations',
        method: 'GET',
        path: '/api/tts/recent',
        desc: '获取最近的语音合成记录。\nGet recent speech generations.',
        params: [
          { name: 'fingerprint', type: 'string', required: false, desc: '指纹 Fingerprint' },
        ],
        response: `[
  { "audioUrl": "...", "text": "..." },
  ...
]`,
        errors: [],
      },
    ],
  },
  {
    group: '管理员接口 Admin',
    apis: [
      {
        name: '获取所有用户 Get All Users',
        method: 'GET',
        path: '/api/admin/users',
        desc: '获取所有用户信息。\nGet all users.',
        params: [
          { name: 'Authorization', type: 'header', required: true, desc: 'Bearer token (admin)' },
        ],
        response: `[
  { "id": "...", "username": "...", ... },
  ...
]`,
        errors: [],
      },
      {
        name: '创建用户 Create User',
        method: 'POST',
        path: '/api/admin/users',
        desc: '创建新用户。\nCreate a new user.',
        params: [
          { name: 'username', type: 'string', required: true, desc: '用户名 Username' },
          { name: 'email', type: 'string', required: true, desc: '邮箱 Email' },
          { name: 'password', type: 'string', required: true, desc: '密码 Password' },
          { name: 'role', type: 'string', required: true, desc: '角色 Role (user/admin)' },
        ],
        response: `{
  "id": "...",
  "username": "...",
  ...
}`,
        errors: [],
      },
      {
        name: '更新用户 Update User',
        method: 'PUT',
        path: '/api/admin/users/:id',
        desc: '更新用户信息。\nUpdate user info.',
        params: [
          { name: 'id', type: 'string', required: true, desc: '用户ID User ID (in URL)' },
          { name: 'username', type: 'string', required: true, desc: '用户名 Username' },
          { name: 'email', type: 'string', required: true, desc: '邮箱 Email' },
          { name: 'password', type: 'string', required: false, desc: '密码 Password' },
          { name: 'role', type: 'string', required: true, desc: '角色 Role' },
        ],
        response: `{
  "id": "...",
  "username": "...",
  ...
}`,
        errors: [],
      },
      {
        name: '删除用户 Delete User',
        method: 'DELETE',
        path: '/api/admin/users/:id',
        desc: '删除用户。\nDelete user.',
        params: [
          { name: 'id', type: 'string', required: true, desc: '用户ID User ID (in URL)' },
        ],
        response: `{
  "id": "...",
  "username": "...",
  ...
}`,
        errors: [],
      },
    ],
  },
  {
    group: '其它接口 Others',
    apis: [
      {
        name: '服务健康检查 Health Check',
        method: 'GET',
        path: '/api/status',
        desc: '检查服务状态。\nCheck service status.',
        params: [],
        response: `{
  "status": "ok"
}`,
        errors: [],
      },
      {
        name: '篡改检测上报 Tamper Report',
        method: 'POST',
        path: '/api/tamper/report-tampering',
        desc: '上报前端检测到的篡改事件。\nReport tampering event.',
        params: [
          { name: 'ip', type: 'string', required: false, desc: 'IP地址 IP (auto)' },
          { name: 'userAgent', type: 'string', required: false, desc: '浏览器UA UserAgent (auto)' },
        ],
        response: `{
  "message": "篡改报告已记录"
}`,
        errors: [],
      },
      {
        name: '数据收集 Data Collection',
        method: 'ALL',
        path: '/api/collect_data',
        desc: '收集任意数据。\nCollect any data.',
        params: [
          { name: 'data', type: 'any', required: false, desc: '任意数据 Any data' },
        ],
        response: `{
  "status": "success",
  "message": "Data received via ..."
}`,
        errors: [],
      },
    ],
  },
];

const ApiDocs: React.FC = () => {
  const [search, setSearch] = useState('');
  const [fold, setFold] = useState<Record<number, boolean>>({});
  const [copyTip, setCopyTip] = useState('');

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return apiDocs;
    const s = search.trim().toLowerCase();
    return apiDocs
      .map(group => ({
        ...group,
        apis: group.apis.filter(api =>
          api.name.toLowerCase().includes(s) ||
          api.path.toLowerCase().includes(s) ||
          api.desc.toLowerCase().includes(s) ||
          (api.params || []).some(p => p.name.toLowerCase().includes(s))
        )
      }))
      .filter(g => g.apis.length);
  }, [search]);

  // 复制提示
  function handleCopy(text: string) {
    copyToClipboard(text);
    setCopyTip('已复制 Copied!');
    setTimeout(() => setCopyTip(''), 1200);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-indigo-700">API 文档 / API Documentation</h1>
      <div className="mb-8 bg-indigo-50 rounded-lg p-4 shadow-sm">
        <p className="text-gray-700 mb-2">本页面详细介绍后端所有API接口，包含请求方式、参数、返回值、错误码及中英文对照说明。</p>
        <p className="text-gray-700">This page documents all backend API endpoints, including method, params, response, errors, and bilingual description.</p>
      </div>
      <div className="mb-8 flex items-center gap-4">
        <input
          className="border rounded px-3 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="搜索接口/参数/描述... Search API/param/desc..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="text-gray-400 text-sm">共 {filtered.reduce((a, g) => a + g.apis.length, 0)} 个接口</span>
      </div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">目录 Table of Contents</h2>
        <ul className="list-disc ml-6 space-y-1">
          {filtered.map((group, i) => (
            <li key={i}>
              <a href={`#group-${i}`} className="text-indigo-600 hover:underline">{group.group}</a>
            </li>
          ))}
        </ul>
      </div>
      {filtered.map((group, i) => (
        <div key={i} className="mb-12" id={`group-${i}`}> 
          <h2
            className="text-2xl font-bold text-indigo-800 mb-4 border-b pb-2 cursor-pointer select-none flex items-center"
            onClick={() => setFold(f => ({ ...f, [i]: !f[i] }))}
          >
            <span className="mr-2">{group.group}</span>
            <span className="text-xs text-indigo-400">[{fold[i] ? '展开 Expand' : '折叠 Fold'}]</span>
          </h2>
          {!fold[i] && group.apis.map((api, j) => {
            const ex = genExample(api);
            return (
              <div key={j} className="mb-8 bg-white rounded-lg shadow p-6 border border-indigo-100">
                <div className="flex flex-wrap items-center mb-2">
                  <span className="font-bold text-lg text-indigo-700 mr-4">{api.name}</span>
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-mono mr-2">{api.method}</span>
                  <span className="font-mono text-sm text-gray-700">{api.path}</span>
                </div>
                <div className="mb-2 text-gray-700 whitespace-pre-line">{api.desc}</div>
                <div className="mb-2">
                  <span className="font-semibold text-gray-800">参数 Params:</span>
                  <ul className="list-disc ml-6">
                    {api.params.map((p, k) => (
                      <li key={k}>
                        <span className="font-mono text-sm text-blue-700">{p.name}</span>
                        <span className="ml-2 text-gray-600">({p.type}{p.required ? ', 必填 required' : ''})</span>
                        <span className="ml-2 text-gray-500">- {p.desc}</span>
                      </li>
                    ))}
                    {api.params.length === 0 && <li className="text-gray-400">无 None</li>}
                  </ul>
                </div>
                <div className="mb-2">
                  <span className="font-semibold text-gray-800">返回示例 Response Example:</span>
                  <pre className="bg-gray-50 rounded p-2 text-sm overflow-x-auto border border-gray-100 mt-1">{api.response}</pre>
                </div>
                <div className="mb-2">
                  <span className="font-semibold text-gray-800">错误码 Errors:</span>
                  <ul className="list-disc ml-6">
                    {api.errors.length === 0 && <li className="text-gray-400">无 None</li>}
                    {api.errors.map((e, k) => (
                      <li key={k}><span className="font-mono text-sm text-red-700">{e.code}</span> <span className="ml-2 text-gray-500">{e.msg}</span></li>
                    ))}
                  </ul>
                </div>
                {/* 示例代码块 */}
                <div className="mb-2">
                  <div className="flex items-center mb-1">
                    <span className="font-semibold text-gray-800 mr-2">curl 示例</span>
                    <button className="ml-auto text-xs text-indigo-500 hover:underline" onClick={() => handleCopy(ex.curl)}>复制 Copy</button>
                  </div>
                  <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto border border-gray-100 mt-1">{ex.curl}</pre>
                </div>
                <div className="mb-2">
                  <div className="flex items-center mb-1">
                    <span className="font-semibold text-gray-800 mr-2">axios 示例</span>
                    <button className="ml-auto text-xs text-indigo-500 hover:underline" onClick={() => handleCopy(ex.axios)}>复制 Copy</button>
                  </div>
                  <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto border border-gray-100 mt-1">{ex.axios}</pre>
                </div>
                <div className="mb-2">
                  <div className="flex items-center mb-1">
                    <span className="font-semibold text-gray-800 mr-2">fetch 示例</span>
                    <button className="ml-auto text-xs text-indigo-500 hover:underline" onClick={() => handleCopy(ex.fetch)}>复制 Copy</button>
                  </div>
                  <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto border border-gray-100 mt-1">{ex.fetch}</pre>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {/* 复制提示 */}
      {copyTip && <div className="fixed bottom-8 right-8 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50 animate-bounce">{copyTip}</div>}
    </div>
  );
};

export default ApiDocs; 
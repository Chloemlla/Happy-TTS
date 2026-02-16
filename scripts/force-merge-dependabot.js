#!/usr/bin/env node
/**
 * 强制 squash merge 所有 Dependabot 的 open PR
 * 
 * 用法: GITHUB_TOKEN=<token> node scripts/force-merge-dependabot.js
 * 或:   GITHUB_TOKEN=<token> node scripts/force-merge-dependabot.js owner/repo
 */

const https = require('https');

const token = process.env.GITHUB_TOKEN;
const repo = process.argv[2] || process.env.GITHUB_REPOSITORY;

if (!token || !repo) {
  console.error('用法: GITHUB_TOKEN=<token> node scripts/force-merge-dependabot.js [owner/repo]');
  process.exit(1);
}

const [owner, repoName] = repo.split('/');

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'force-merge-dependabot',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log(`🔍 获取 ${repo} 的所有 open PR...\n`);

  const { data: prs } = await api('GET', `/repos/${owner}/${repoName}/pulls?state=open&per_page=100`);

  const dependabotPRs = prs.filter((pr) => pr.user.login === 'dependabot[bot]');

  if (dependabotPRs.length === 0) {
    console.log('没有找到 Dependabot 的 open PR。');
    return;
  }

  console.log(`找到 ${dependabotPRs.length} 个 Dependabot PR:\n`);

  let merged = 0;
  let failed = 0;

  for (const pr of dependabotPRs) {
    const num = pr.number;
    const title = pr.title;
    process.stdout.write(`#${num} ${title} ... `);

    // 先关闭 auto-merge（如果有的话）
    try {
      const disableMutation = `
        mutation($id: ID!) {
          disablePullRequestAutoMerge(input: { pullRequestId: $id }) {
            clientMutationId
          }
        }
      `;
      await api('POST', '/graphql', { query: disableMutation, variables: { id: pr.node_id } });
    } catch {
      // 忽略，可能本来就没开
    }

    // 强制 squash merge
    const { status, data } = await api(
      'PUT',
      `/repos/${owner}/${repoName}/pulls/${num}/merge`,
      {
        merge_method: 'squash',
        commit_title: `${title} (#${num})`,
      }
    );

    if (status === 200 && data.merged) {
      console.log('✅ merged');
      merged++;
    } else {
      const msg = data?.message || JSON.stringify(data);
      console.log(`❌ ${msg}`);
      failed++;
    }
  }

  console.log(`\n完成: ${merged} 个已合并, ${failed} 个失败`);
}

run().catch((err) => {
  console.error('执行出错:', err);
  process.exit(1);
});

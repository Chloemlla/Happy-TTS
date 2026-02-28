#!/usr/bin/env node
/**
 * 强制 squash merge 所有 Dependabot 的 open PR
 * (检查 Check Runs 和 Commit Statuses，Docker Build Verification 成功时执行)
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
  let skipped = 0;
  let failed = 0;

  for (const pr of dependabotPRs) {
    const num = pr.number;
    const title = pr.title;
    const sha = pr.head.sha;
    
    console.log(`\n----------------------------------------`);
    console.log(`处理 PR #${num}: ${title}`);
    console.log(`Commit SHA: ${sha}`);

    // 1. 获取 Check Runs 和 Commit Statuses
    const [checkRes, statusRes] = await Promise.all([
      api('GET', `/repos/${owner}/${repoName}/commits/${sha}/check-runs`),
      api('GET', `/repos/${owner}/${repoName}/commits/${sha}/statuses`)
    ]);

    let dockerCheckPassed = false;
    let dockerCheckFound = false;
    let currentStatusMsg = '';

    // --- 处理 Check Runs ---
    if (checkRes.status === 200) {
      const checkData = checkRes.data;
      console.log(`📋 找到 ${checkData.total_count || 0} 个 Check Runs:`);
      
      if (checkData.check_runs && checkData.check_runs.length > 0) {
        checkData.check_runs.forEach(run => {
          console.log(`   - [Check Run] 名字: "${run.name}" | 状态: ${run.status} | 结论: ${run.conclusion}`);
          
          if (run.name === 'Docker Build Verification') {
            dockerCheckFound = true;
            if (run.conclusion === 'success') {
              dockerCheckPassed = true;
            } else {
              currentStatusMsg = run.conclusion || run.status;
            }
          }
        });
      }
    } else {
      console.log(`⚠️ 获取 Check Runs 失败 (HTTP ${checkRes.status})`);
    }

    // --- 处理 Commit Statuses ---
    if (statusRes.status === 200) {
      const statusData = statusRes.data;
      console.log(`📊 找到 ${statusData.length || 0} 个 Commit Statuses:`);
      
      if (statusData && statusData.length > 0) {
        // Statuses API 会返回历史记录，我们需要去重，只看最新的 context
        const seenContexts = new Set();
        statusData.forEach(status => {
          if (!seenContexts.has(status.context)) {
            seenContexts.add(status.context);
            console.log(`   - [Status] 上下文: "${status.context}" | 状态: ${status.state}`);
            
            if (status.context === 'Docker Build Verification') {
              dockerCheckFound = true;
              if (status.state === 'success') {
                dockerCheckPassed = true;
              } else {
                currentStatusMsg = status.state;
              }
            }
          }
        });
      }
    } else {
      console.log(`⚠️ 获取 Commit Statuses 失败 (HTTP ${statusRes.status})`);
    }

    // 2. 判断是否满足合并条件
    if (!dockerCheckFound) {
      console.log(`⏭️ 跳过: 未找到名为 'Docker Build Verification' 的检查项 (Check Runs 和 Statuses 中均无)`);
      skipped++;
      continue;
    }

    if (!dockerCheckPassed) {
      console.log(`⏳ 跳过: 'Docker Build Verification' 未通过，当前状态为 '${currentStatusMsg}'`);
      skipped++;
      continue;
    }

    // 3. 如果 Check 通过，先尝试关闭 auto-merge（防止冲突）
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
      // 忽略
    }

    // 4. 强制 squash merge
    const { status: mergeStatus, data: mergeData } = await api(
      'PUT',
      `/repos/${owner}/${repoName}/pulls/${num}/merge`,
      {
        merge_method: 'squash',
        commit_title: `${title} (#${num})`,
        commit_message: pr.body || '', 
      }
    );

    if (mergeStatus === 200 && mergeData.merged) {
      console.log('✅ 强制合并成功');
      merged++;
    } else {
      const msg = mergeData?.message || JSON.stringify(mergeData);
      console.log(`❌ 合并失败: ${msg}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`执行完成: ${merged} 个已合并, ${skipped} 个已跳过, ${failed} 个失败`);
}

run().catch((err) => {
  console.error('执行出错:', err);
  process.exit(1);
});

import { Octokit } from '@octokit/rest';

// 初始化 Octokit 实例
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN // 从环境变量获取 GitHub token
});

async function autoApproveDependabotPRs() {
  try {
    // 获取仓库信息
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    
    // 获取所有由 dependabot 打开的 PR
    const { data: pullRequests } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      head: 'dependabot'
    });
    
    // 遍历每个 PR
    for (const pr of pullRequests) {
      try {
        // 获取 PR 的检查状态
        const { data: statuses } = await octokit.repos.getCombinedStatusForRef({
          owner,
          repo,
          ref: pr.head.sha
        });
        
        // 检查所有状态是否都是成功
        const allChecksPassed = statuses.statuses.every(status => status.state === 'success');
        
        if (allChecksPassed) {
          // 创建 approve 评论
          await octokit.pulls.createReview({
            owner,
            repo,
            pull_number: pr.number,
            event: 'APPROVE',
            body: 'Automatically approved by dependabot-auto-approve script'
          });
          
          console.log(`✅ Approved PR #${pr.number}: ${pr.title}`);
        } else {
          console.log(`⏳ PR #${pr.number}: ${pr.title} does not have all checks passing`);
        }
      } catch (error) {
        console.error(`❌ Error processing PR #${pr.number}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Error fetching pull requests:', error.message);
  }
}

// 执行函数
autoApproveDependabotPRs();
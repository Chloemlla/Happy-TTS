import asyncio
import aiohttp
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging
from asyncio import Semaphore

# 初始化FastAPI应用程序
app = FastAPI()

# 定义GitHub凭证模型，用于接收用户名和token
class GithubCredentials(BaseModel):
    username: str
    token: str

# 定义路由，用于列出用户的GitHub仓库
@app.post("/list-repositories/")
async def list_repositories(credentials: GithubCredentials):
    """
    列出用户的GitHub仓库。

    参数:
    - credentials: GithubCredentials，包含用户名和token。

    返回:
    - 包含仓库列表的字典，如果找不到仓库则抛出HTTPException。
    """
    try:
        repos = await get_repos(credentials.username, credentials.token)
        if not repos:
            raise HTTPException(status_code=404, detail="No repositories found")
        return {"repositories": repos}
    except Exception as e:
        logging.error(f'请求失败: {e}')
        raise HTTPException(status_code=500, detail=str(e))

# 限制并发请求的数量
CONCURRENT_REQUESTS_LIMIT = int(os.getenv('CONCURRENT_REQUESTS_LIMIT', '40'))  # 通过环境变量设置，默认为40
semaphore = Semaphore(CONCURRENT_REQUESTS_LIMIT)

# 配置日志记录
logging.basicConfig(filename='workflow_failures.log', level=logging.INFO, format='%(asctime)s - %(message)s')

# 从环境变量获取GitHub用户名和token
USERNAME = os.getenv('GITHUB_USERNAME')
TOKEN = os.getenv('GITHUB_TOKEN')
if not USERNAME or not TOKEN:
    raise ValueError("GITHUB_USERNAME and GITHUB_TOKEN must be set as environment variables")

# GitHub API的基础URL
BASE_URL = 'https://api.github.com'
DEFAULT_WAIT_TIME = int(os.getenv('DEFAULT_WAIT_TIME', '1200'))  # 通过环境变量设置，默认为1200秒

# 创建请求头，包含GitHub令牌认证信息
def create_headers():
    """
    创建请求头。

    返回:
    - 包含认证信息的请求头字典。
    """
    return {'Authorization': f'token {TOKEN}'}

# 封装HTTP请求，包括错误处理和并发控制
async def make_request(session, method, url, headers=None, params=None, json=None):
    """
    封装HTTP请求。

    参数:
    - session: HTTP会话对象。
    - method: HTTP请求方法。
    - url: 请求URL。
    - headers: 请求头。
    - params: 请求参数。
    - json: 请求JSON数据。

    返回:
    - 请求的JSON响应。

    异常:
    - HTTPException: 如果请求失败，则抛出。
    """
    async with semaphore:  # 添加这一行来控制并发
        try:
            async with session.request(method, url, headers=headers, params=params, json=json) as response:
                if response.status != 200:
                    raise aiohttp.HttpProcessingError(message=f'Unexpected status {response.status}', code=response.status)
                return await response.json()
        except Exception as e:
            logging.error(f'请求失败: {e}')
            return None

# 分页获取用户的所有仓库
async def get_repos(session):
    """
    分页获取用户的所有仓库。

    参数:
    - session: HTTP会话对象。

    返回:
    - 仓库列表。
    """
    repos = []
    page = 1
    while True:
        url = f'{BASE_URL}/user/repos'
        headers = create_headers()
        params = {'per_page': 100, 'page': page}
        data = await make_request(session, 'GET', url, headers=headers, params=params)
        if not data:
            break
        repos.extend(data)
        page += 1
    return repos

# 获取仓库的默认分支
async def get_default_branch(session, repo):
    """
    获取仓库的默认分支。

    参数:
    - session: HTTP会话对象。
    - repo: 仓库字典。

    返回:
    - 默认分支名称。
    """
    url = f'{BASE_URL}/repos/{USERNAME}/{repo["name"]}'
    headers = create_headers()
    data = await make_request(session, 'GET', url, headers=headers)
    return data.get('default_branch', 'main')

# 触发指定仓库的所有工作流
async def trigger_workflows(session, repo, branch):
    """
    触发指定仓库的所有工作流。

    参数:
    - session: HTTP会话对象。
    - repo: 仓库字典。
    - branch: 分支名称。
    """
    # 此处省略具体实现，与原逻辑相同
    pass

# 检查并删除指定仓库的工作流失败的运行记录
async def check_and_log_failed_runs(session, repo):
    """
    检查并删除指定仓库的工作流失败的运行记录。

    参数:
    - session: HTTP会话对象。
    - repo: 仓库字典。
    """
    # 此处省略具体实现，与原逻辑相同
    pass

# 使用给定的用户名和Token获取GitHub仓库列表
async def get_repos(username, token):
    """
    使用给定的用户名和Token获取GitHub仓库列表。

    参数:
    - username: GitHub用户名。
    - token: GitHub访问token。

    返回:
    - GitHub仓库列表。
    """
    headers = {'Authorization': f'token {token}'}
    async with aiohttp.ClientSession(headers=headers) as session:
        url = f'https://api.github.com/users/{username}/repos'
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            else:
                return None

# 主函数，执行工作流触发和失败运行检查
async def main():
    """
    主函数，执行工作流触发和失败运行检查。
    """
    async with aiohttp.ClientSession() as session:
        repos = await get_repos(USERNAME, TOKEN)
        trigger_tasks = []
        for repo in repos:
            branch = await get_default_branch(session, repo)
            trigger_task = asyncio.create_task(trigger_workflows(session, repo, branch))
            trigger_tasks.append(trigger_task)
        await asyncio.gather(*trigger_tasks)
        logging.info(f'等待{DEFAULT_WAIT_TIME}秒...')
        await asyncio.sleep(DEFAULT_WAIT_TIME)  # 使用变量
        delete_tasks = []
        for repo in repos:
            delete_task = asyncio.create_task(check_and_log_failed_runs(session, repo))
            delete_tasks.append(delete_task)
        await asyncio.gather(*delete_tasks)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    asyncio.run(main())
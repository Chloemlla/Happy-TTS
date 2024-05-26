# OpenAI-TTS-Gradio

## 简介

此项目是一个基于 Gradio 和 OpenAI 的应用程序，允许用户通过图形界面与 OpenAI 的 API 进行交互。项目使用了`watchdog`库来监控文件系统事件，并通过`dotenv`库加载环境变量。

## 功能

- 通过 Gradio 提供用户友好的图形界面。
- 使用 OpenAI API 进行文本生成。
- 监控文件系统事件。
- 通过环境变量配置 API 密钥等敏感信息。

## 安装

1. 克隆此仓库：

   ```bash
   git clone https://github.com/your-repo/project-name.git
   cd project-name
   ```

2. 创建并激活虚拟环境：

   ```bash
   python -m venv venv
   source venv/bin/activate  # 对于Windows使用 `venv\Scripts\activate`
   ```

3. 安装依赖：

   ```bash
   pip install -r requirements.txt
   ```

4. 创建`.env`文件并添加你的 OpenAI API 密钥：

   ```env
   OPENAI_API_KEY=your_api_key_here
   ```

## 使用

运行以下命令启动应用程序：

```bash
python app.py
```

## 日志配置

日志配置已调整为仅在控制台输出日志信息。以下是相关的代码片段：

```python
import logging

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
logger.setLevel(logging.INFO)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
logger.addHandler(console_handler)
```

## 贡献

欢迎贡献！请提交拉取请求（Pull Request）或报告问题（Issues）。

## 许可证

此项目使用 MIT 许可证。有关详细信息，请参阅 LICENSE 文件。

```

这个README文件涵盖了项目的基本信息、安装步骤、使用方法以及日志配置的调整。你可以根据需要对其进行修改和扩展。
```

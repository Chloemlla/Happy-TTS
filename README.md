# OpenAI TTS Gradio 应用 README

## 项目简介

本应用程序集成了 OpenAI 的文本转语音服务，并借助 Gradio 构建了交互界面。用户仅需输入文本，即可选择不同模型、声音特质、输出格式和播放速率来生成个性化语音。本 README 旨在指导用户完成从安装到使用的全过程。

## 安装指南

### Docker 快速部署

#### 步骤

1. **镜像获取**

   ```bash
   docker pull happyclo/tts:latest
   ```

2. **容器启动**
   ```bash
   docker run -d -p 7860:7860 \
       -v /opt/tts-openai/logs:/usr/src/app/logs \
       -v /opt/tts-openai/.env:/usr/src/app/.env \
       -e OPENAI_KEY=your_api_key_here \
       happyclo/tts:latest
   ```

记得将`your_api_key_here`替换为你的 OpenAI API 密钥。

### 手动安装步骤

1. **克隆项目**

   ```bash
   git clone https://github.com/Happy-clo/OpenAI-TTS-Gradio.git
   cd OpenAI-TTS-Gradio
   ```

2. **创建虚拟环境**

   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: `venv\Scripts\activate`
   ```

3. **安装依赖**

   ```bash
   pip install -r requirements.txt
   ```

4. **配置环境变量**

   在项目根目录新建`.env`文件，填入：

   ```
   OPENAI_KEY=your_api_key_here
   OPENAI_BASE_URL=https://api.openai.com/v1
   ```

5. **运行应用**
   ```bash
   python app.py
   ```

然后访问[http://localhost:7860](http://localhost:7860)开始使用。

## 功能亮点

- **Docker 一键部署**：简化部署流程，加速服务上线。
- **本地安装选项**：适合本地开发调试或定制化环境配置。
- **直观 Gradio UI**：文本输入、模型与声音风格自由切换。
- **详细日志记录**：便于故障排查与系统监控。
- **错误报告**：内置错误处理，记录日志中。
- **文本去重**：减少重复处理，提升效率。
- **请求节流**：控制 API 调用频次，防滥用。
- **动态文件管理**：自定义文件命名，自动清理旧文件。

## 注意事项

- 确保持有有效的 OpenAI API 密钥。
- 手动安装时，遵循指引确保每步操作无误。
- 根据实际情况调整 Docker 映射路径和环境变量。

## 参与贡献

欢迎提交代码、报告问题或提出建议。更多信息，请访问项目[GitHub 页面](https://github.com/Happy-clo/OpenAI-TTS-Gradio)。

本项目意在使高质量的语音合成技术触手可及，无论通过 Docker 的便捷部署，还是手动配置的灵活性，皆能轻松体验。
# Statement

> [!CAUTION]  
> 本分支仅用于个人开发提供学习研究，请勿直接使用任何附件。如出现任何有关源附件问题，本作者概不负责。

---

> [!CAUTION]  
> This branch is only for personal development, study and research. Please do not use any attachments directly. The author is not responsible for any problems with the source attachments.

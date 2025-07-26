---
title: 集成示例
sidebar_position: 3
---

# 集成示例

## 简介

本章节提供 Synapse 在不同平台和框架中的集成示例，帮助开发者快速上手。

## Web 前端集成

### React 集成示例

```jsx
import React, { useState } from "react";

function TTSComponent() {
  const [text, setText] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const generateSpeech = async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("apiKey")}`,
        },
        body: JSON.stringify({
          text,
          model: "tts-1",
          voice: "alloy",
          output_format: "mp3",
        }),
      });

      const result = await response.json();
      setAudioUrl(result.audioUrl);
    } catch (error) {
      console.error("生成语音失败:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入要转换的文本..."
        rows={4}
        style={{ width: "100%", marginBottom: "10px" }}
      />
      <button onClick={generateSpeech} disabled={loading || !text.trim()}>
        {loading ? "生成中..." : "生成语音"}
      </button>
      {audioUrl && (
        <audio controls style={{ marginTop: "10px", width: "100%" }}>
          <source src={audioUrl} type="audio/mpeg" />
        </audio>
      )}
    </div>
  );
}

export default TTSComponent;
```

### Vue.js 集成示例

```vue
<template>
  <div class="tts-container">
    <textarea
      v-model="text"
      placeholder="输入要转换的文本..."
      rows="4"
      class="text-input"
    />
    <button
      @click="generateSpeech"
      :disabled="loading || !text.trim()"
      class="generate-btn"
    >
      {{ loading ? "生成中..." : "生成语音" }}
    </button>
    <audio v-if="audioUrl" controls class="audio-player">
      <source :src="audioUrl" type="audio/mpeg" />
    </audio>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "TTSComponent",
  data() {
    return {
      text: "",
      audioUrl: "",
      loading: false,
    };
  },
  methods: {
    async generateSpeech() {
      if (!this.text.trim()) return;

      this.loading = true;
      try {
        const response = await axios.post(
          "/api/tts/generate",
          {
            text: this.text,
            model: "tts-1",
            voice: "alloy",
            output_format: "mp3",
          },
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("apiKey")}`,
            },
          }
        );

        this.audioUrl = response.data.audioUrl;
      } catch (error) {
        console.error("生成语音失败:", error);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.tts-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.text-input {
  width: 100%;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.generate-btn {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.generate-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.audio-player {
  margin-top: 10px;
  width: 100%;
}
</style>
```

## 后端集成

### Node.js Express 集成

```javascript
const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// TTS 生成接口
app.post("/api/tts/generate", async (req, res) => {
  try {
    const { text, model = "tts-1", voice = "alloy" } = req.body;

    // 调用 Synapse API
    const response = await axios.post(
      "https://api.hapxs.com/api/tts/generate",
      {
        text,
        model,
        voice,
        output_format: "mp3",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TTS_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("TTS 生成失败:", error);
    res.status(500).json({ error: "语音生成失败" });
  }
});

// 批量生成接口
app.post("/api/tts/batch-generate", async (req, res) => {
  try {
    const { texts } = req.body;
    const results = [];

    for (const text of texts) {
      const response = await axios.post(
        "https://api.hapxs.com/api/tts/generate",
        {
          text,
          model: "tts-1",
          voice: "alloy",
          output_format: "mp3",
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.TTS_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      results.push(response.data);
    }

    res.json(results);
  } catch (error) {
    console.error("批量 TTS 生成失败:", error);
    res.status(500).json({ error: "批量语音生成失败" });
  }
});

app.listen(3000, () => {
  console.log("服务器运行在端口 3000");
});
```

### Python Flask 集成

```python
from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

@app.route('/api/tts/generate', methods=['POST'])
def generate_tts():
    try:
        data = request.get_json()
        text = data.get('text')
        model = data.get('model', 'tts-1')
        voice = data.get('voice', 'alloy')

        # 调用 Synapse API
        response = requests.post(
            'https://api.hapxs.com/api/tts/generate',
            json={
                'text': text,
                'model': model,
                'voice': voice,
                'output_format': 'mp3'
            },
            headers={
                'Authorization': f'Bearer {os.getenv("TTS_API_KEY")}',
                'Content-Type': 'application/json'
            }
        )

        return jsonify(response.json())
    except Exception as e:
        print(f'TTS 生成失败: {str(e)}')
        return jsonify({'error': '语音生成失败'}), 500

@app.route('/api/tts/batch-generate', methods=['POST'])
def batch_generate_tts():
    try:
        data = request.get_json()
        texts = data.get('texts', [])
        results = []

        for text in texts:
            response = requests.post(
                'https://api.hapxs.com/api/tts/generate',
                json={
                    'text': text,
                    'model': 'tts-1',
                    'voice': 'alloy',
                    'output_format': 'mp3'
                },
                headers={
                    'Authorization': f'Bearer {os.getenv("TTS_API_KEY")}',
                    'Content-Type': 'application/json'
                }
            )
            results.append(response.json())

        return jsonify(results)
    except Exception as e:
        print(f'批量 TTS 生成失败: {str(e)}')
        return jsonify({'error': '批量语音生成失败'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

## 移动端集成

### React Native 集成

```javascript
import React, { useState } from "react";
import { View, TextInput, Button, Text, Alert } from "react-native";
import { Audio } from "expo-av";

const TTSComponent = () => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sound, setSound] = useState();

  const generateSpeech = async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        "https://api.hapxs.com/api/tts/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${YOUR_API_KEY}`,
          },
          body: JSON.stringify({
            text,
            model: "tts-1",
            voice: "alloy",
            output_format: "mp3",
          }),
        }
      );

      const result = await response.json();

      // 播放音频
      const { sound: audioSound } = await Audio.Sound.createAsync({
        uri: result.audioUrl,
      });
      setSound(audioSound);
      await audioSound.playAsync();
    } catch (error) {
      Alert.alert("错误", "生成语音失败");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="输入要转换的文本..."
        multiline
        numberOfLines={4}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 10,
          marginBottom: 10,
          borderRadius: 4,
        }}
      />
      <Button
        title={loading ? "生成中..." : "生成语音"}
        onPress={generateSpeech}
        disabled={loading || !text.trim()}
      />
    </View>
  );
};

export default TTSComponent;
```

## 桌面应用集成

### Electron 集成示例

```javascript
const { app, BrowserWindow, ipcMain } = require("electron");
const axios = require("axios");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");
}

// 处理 TTS 生成请求
ipcMain.handle("generate-tts", async (event, text) => {
  try {
    const response = await axios.post(
      "https://api.hapxs.com/api/tts/generate",
      {
        text,
        model: "tts-1",
        voice: "alloy",
        output_format: "mp3",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TTS_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    throw new Error("语音生成失败");
  }
});

app.whenReady().then(createWindow);
```

## 下一步

- 📊 了解 [最佳实践](../best-practices/performance.md)
- 🔧 探索 [API 参考](../api/tts-endpoints.md)
- 📖 学习 [高级功能](./advanced-features.md)

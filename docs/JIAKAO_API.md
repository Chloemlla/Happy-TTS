# 随机驾考题目 API 文档

## 概述

随机驾考题目 API 提供免费获取驾考题目的功能，帮助用户练习驾考理论。支持科目 1 和科目 4 的题目获取，适用于驾考模拟、教育应用和驾驶学习平台。

## 接口信息

- **接口地址**: `GET /api/network/jiakao`
- **功能描述**: 随机获取驾考题目，支持科目 1 和科目 4
- **实现方式**: 转发请求到外部驾考题目服务

## 请求参数

| 参数名  | 类型   | 必填 | 说明                                   |
| ------- | ------ | ---- | -------------------------------------- |
| subject | string | 是   | 科目类型，支持：1(科目 1) 或 4(科目 4) |

### 支持的科目类型

- **1**: 科目 1 - 道路交通安全法律、法规和相关知识
- **4**: 科目 4 - 安全文明驾驶常识

## 请求示例

### cURL

```bash
# 获取科目1题目
curl -X GET "http://localhost:3000/api/network/jiakao?subject=1"

# 获取科目4题目
curl -X GET "http://localhost:3000/api/network/jiakao?subject=4"
```

### JavaScript (axios)

```javascript
const axios = require("axios");

// 获取科目1题目
const subject1Response = await axios.get(
  "http://localhost:3000/api/network/jiakao",
  {
    params: { subject: "1" },
  }
);

// 获取科目4题目
const subject4Response = await axios.get(
  "http://localhost:3000/api/network/jiakao",
  {
    params: { subject: "4" },
  }
);

console.log(subject1Response.data);
console.log(subject4Response.data);
```

### Python

```python
import requests

# 获取科目1题目
subject1_response = requests.get('http://localhost:3000/api/network/jiakao', {
    'subject': '1'
})

# 获取科目4题目
subject4_response = requests.get('http://localhost:3000/api/network/jiakao', {
    'subject': '4'
})

print(subject1_response.json())
print(subject4_response.json())
```

## 响应格式

### 科目 1 题目响应（判断题）

```json
{
  "success": true,
  "message": "随机驾考题目获取完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": {
      "answer": "对",
      "chapter": "道路通行条件及通行规定",
      "explain": "《道路交通安全法》第六十八条：机动车在高速公路上发生故障时，应当依照本法第五十二条的有关规定办理；警告标志应当设置在故障车来车方向一百五十米以外，车上人员应当迅速转移到右侧路肩上或者应急车道内，并且迅速报警。",
      "question": "机动车在高速公路上发生故障时，将车上人员迅速转移到右侧路肩上或者应急车道内，并且迅速报警。",
      "type": "C1,C2,C3"
    }
  }
}
```

### 科目 4 题目响应（选择题）

```json
{
  "success": true,
  "message": "随机驾考题目获取完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": {
      "answer": "B",
      "chapter": "驾驶证和机动车管理规定",
      "explain": "A2为重型牵引挂车；B1为中型客车；B2为大型货车；A1为大型客车。",
      "option1": "A、A2",
      "option2": "B、B1",
      "option3": "C、B2",
      "option4": "D、A1",
      "question": "中型客车的车型代号是什么?",
      "type": "C1,C2,C3"
    }
  }
}
```

### 参数错误 (400)

```json
{
  "success": false,
  "error": "科目参数必须是 1(科目1) 或 4(科目4)"
}
```

### 服务器错误 (500)

```json
{
  "success": false,
  "error": "随机驾考题目获取失败: 服务器内部错误"
}
```

## 响应字段说明

| 字段名             | 类型    | 说明                                       |
| ------------------ | ------- | ------------------------------------------ |
| success            | boolean | 请求是否成功                               |
| message            | string  | 成功时的消息                               |
| error              | string  | 错误时的错误信息                           |
| data.code          | integer | 响应状态码                                 |
| data.msg           | string  | 响应消息                                   |
| data.data.question | string  | 题目内容                                   |
| data.data.answer   | string  | 正确答案（判断题：对/错，选择题：A/B/C/D） |
| data.data.chapter  | string  | 所属章节或类别                             |
| data.data.explain  | string  | 答案解释，包含相关法律条文                 |
| data.data.type     | string  | 适用驾驶证类型                             |
| data.data.option1  | string  | 选项 A（仅选择题）                         |
| data.data.option2  | string  | 选项 B（仅选择题）                         |
| data.data.option3  | string  | 选项 C（仅选择题）                         |
| data.data.option4  | string  | 选项 D（仅选择题）                         |

## 题目类型说明

### 科目 1 题目（判断题）

- **题目类型**: 判断题
- **答案格式**: "对" 或 "错"
- **特点**: 包含题目、答案、章节、解释和适用类型

### 科目 4 题目（选择题）

- **题目类型**: 选择题
- **答案格式**: "A"、"B"、"C" 或 "D"
- **特点**: 包含题目、四个选项、答案、章节、解释和适用类型

## 测试用例

### 1. 科目 1 题目测试

- **输入**: `subject=1`
- **期望输出**: 判断题格式的题目数据

### 2. 科目 4 题目测试

- **输入**: `subject=4`
- **期望输出**: 选择题格式的题目数据

### 3. 无效科目参数测试

- **输入**: `subject=2`
- **期望输出**: 参数错误响应

## 错误处理

### 常见错误类型

1. **参数错误**

   - 缺少 subject 参数
   - subject 参数值不在支持范围内（1 或 4）

2. **网络错误**

   - 外部题目服务无响应
   - 请求超时（15 秒）
   - 网络连接失败

3. **服务错误**
   - 外部服务返回错误
   - 题目数据格式异常

### 错误响应示例

```json
{
  "success": false,
  "error": "随机驾考题目获取失败: 500 - 服务器内部错误"
}
```

## 使用建议

1. **科目选择**:

   - 科目 1：适合初学者，主要考察交通法规知识
   - 科目 4：适合有经验的驾驶员，主要考察安全文明驾驶

2. **题目练习**:

   - 建议按章节系统练习
   - 重点关注答案解释中的法律条文
   - 注意区分不同驾驶证类型的适用性

3. **错误处理**:

   - 处理网络超时情况
   - 提供用户友好的错误提示
   - 实现题目缓存机制

4. **应用场景**:
   - 驾考模拟考试
   - 在线学习平台
   - 移动端驾考 APP
   - 驾校教学系统

## 注意事项

1. **题目随机性**: 每次请求返回的题目都是随机的，适合练习使用
2. **数据准确性**: 题目内容基于最新的交通法规，具有权威性
3. **适用性**: 注意题目适用的驾驶证类型
4. **更新频率**: 题目库会定期更新，保持与法规同步

## 相关链接

- [道路交通安全法](http://www.npc.gov.cn/npc/c30834/201901/ff8080816a8c4c9e016a8c4c9e9e0001.shtml)
- [机动车驾驶证申领和使用规定](http://www.gov.cn/gongbao/content/2016/content_5068866.htm)
- [驾考理论考试大纲](http://www.mps.gov.cn/n2254314/n2254409/n2254410/n2254411/c2254412/content.html)

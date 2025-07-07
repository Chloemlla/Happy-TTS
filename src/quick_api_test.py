#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
快速API测试脚本
批量调用后端不需要授权的API接口
"""

import requests
import json
import time
import random
from datetime import datetime

# 配置
BASE_URL = "https://tts-api.hapxs.com"
DELAY_RANGE = (1, 2)  # 请求间隔（秒）

# 不需要授权的API端点列表
ENDPOINTS = [
    # IP查询
    {
        "name": "精准IP查询",
        "path": "/api/network/ipquery",
        "method": "GET",
        "params": {"ip": "8.8.8.8"},
    },
    {
        "name": "IP信息查询",
        "path": "/api/network/ipquery",
        "method": "GET",
        "params": {"ip": "8.8.8.8"},
    },
    # 一言古诗词
    {
        "name": "随机一言",
        "path": "/api/network/yiyan",
        "method": "GET",
        "params": {"type": "hitokoto"},
    },
    {
        "name": "古诗词",
        "path": "/api/network/yiyan",
        "method": "GET",
        "params": {"type": "poetry"},
    },
    # 抖音热榜
    {"name": "抖音热榜", "path": "/api/network/douyinhot", "method": "GET"},
    # 工具类
    {
        "name": "字符串Hash",
        "path": "/api/network/hash",
        "method": "GET",
        "params": {"text": "Hello World", "type": "md5"},
    },
    {
        "name": "Base64编码",
        "path": "/api/network/base64",
        "method": "GET",
        "params": {"text": "Hello World", "type": "encode"},
    },
    {
        "name": "Base64解码",
        "path": "/api/network/base64",
        "method": "GET",
        "params": {"text": "SGVsbG8gV29ybGQ=", "type": "decode"},
    },
    {
        "name": "BMI计算",
        "path": "/api/network/bmi",
        "method": "GET",
        "params": {"weight": 70, "height": 175},
    },
    # 媒体转换
    {
        "name": "FLAC转MP3",
        "path": "/api/network/flactomp3",
        "method": "GET",
        "params": {"url": "https://example.com/test.flac"},
    },
    # 驾考题目
    {
        "name": "随机驾考题",
        "path": "/api/network/jiakao",
        "method": "GET",
        "params": {"subject": "1"},
    },
]


def test_api(endpoint):
    """测试单个API端点"""
    url = f"{BASE_URL}{endpoint['path']}"

    print(f"测试: {endpoint['name']}")
    print(f"URL: {url}")

    try:
        if endpoint["method"] == "GET":
            response = requests.get(url, params=endpoint.get("params"), timeout=30)
        else:
            response = requests.post(url, json=endpoint.get("data"), timeout=30)

        # 输出结果
        if response.status_code == 200:
            print(f"✓ 成功 (状态码: {response.status_code})")
            try:
                data = response.json()
                response_text = json.dumps(data, ensure_ascii=False, indent=2)[:200]
                print(f"  响应: {response_text}...")
            except Exception:
                print(f"  响应: {response.text[:200]}...")
        elif response.status_code == 429:
            print(f"⚠ 频率限制 (状态码: {response.status_code})")
        else:
            print(f"✗ 失败 (状态码: {response.status_code})")
            print(f"  错误: {response.text}")

        print(f"  耗时: {response.elapsed.total_seconds():.2f}秒")

    except Exception as e:
        print(f"✗ 请求异常: {e}")

    print("-" * 50)


def batch_test(rounds=1):
    """批量测试所有API"""
    print("开始批量测试API接口")
    print(f"基础URL: {BASE_URL}")
    print(f"测试轮次: {rounds}")
    print(f"端点数量: {len(ENDPOINTS)}")
    print("=" * 60)

    start_time = datetime.now()

    for round_num in range(1, rounds + 1):
        print(f"\n=== 第 {round_num} 轮测试 ===")

        for endpoint in ENDPOINTS:
            test_api(endpoint)

            # 随机延迟
            if round_num < rounds or endpoint != ENDPOINTS[-1]:
                delay = random.uniform(*DELAY_RANGE)
                print(f"等待 {delay:.1f} 秒...")
                time.sleep(delay)

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    print("\n=== 测试完成 ===")
    print(f"总耗时: {duration:.2f} 秒")
    print(f"开始时间: {start_time.strftime('%H:%M:%S')}")
    print(f"结束时间: {end_time.strftime('%H:%M:%S')}")


def test_single_endpoint(endpoint_name):
    """测试单个指定的端点"""
    endpoint = next((ep for ep in ENDPOINTS if ep["name"] == endpoint_name), None)
    if endpoint:
        print(f"测试单个端点: {endpoint_name}")
        test_api(endpoint)
    else:
        print(f"未找到端点: {endpoint_name}")
        print("可用端点:")
        for ep in ENDPOINTS:
            print(f"  - {ep['name']}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        if sys.argv[1] == "--single" and len(sys.argv) > 2:
            test_single_endpoint(sys.argv[2])
        elif sys.argv[1] == "--rounds" and len(sys.argv) > 2:
            batch_test(int(sys.argv[2]))
        else:
            print("用法:")
            print("  python quick_api_test.py                    # 默认测试1轮")
            print("  python quick_api_test.py --rounds 3         # 测试3轮")
            print("  python quick_api_test.py --single '服务状态'  # 测试单个端点")
    else:
        batch_test(1)

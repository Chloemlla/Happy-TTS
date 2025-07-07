#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量调用后端API接口测试脚本
用于测试不需要授权的API接口，包含调用次数限制处理
"""

import requests
import json
import time
import random
from typing import Dict, List, Any
from dataclasses import dataclass
from datetime import datetime
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("api_test.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


@dataclass
class ApiEndpoint:
    """API端点配置"""

    name: str
    path: str
    method: str = "GET"
    params: Dict[str, Any] = None
    data: Dict[str, Any] = None
    headers: Dict[str, str] = None
    expected_status: int = 200
    delay_range: tuple = (1, 3)  # 延迟范围（秒）


class ApiBatchTester:
    """API批量测试器"""

    def __init__(self, base_url: str = "https://tts-api.hapxs.com"):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "BatchApiTester/1.0",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )

        # 测试结果统计
        self.stats = {
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "rate_limited_calls": 0,
            "start_time": None,
            "end_time": None,
        }

        # 定义不需要授权的API端点
        self.endpoints = [
            # IP查询相关
            ApiEndpoint(
                name="精准IP查询",
                path="/api/network/ipquery",
                method="GET",
                params={"ip": "8.8.8.8"},
            ),
            ApiEndpoint(
                name="IP信息查询",
                path="/api/network/ipquery",
                method="GET",
                params={"ip": "8.8.8.8"},
            ),
            # 一言古诗词
            ApiEndpoint(
                name="随机一言",
                path="/api/network/yiyan",
                method="GET",
                params={"type": "hitokoto"},
            ),
            ApiEndpoint(
                name="古诗词",
                path="/api/network/yiyan",
                method="GET",
                params={"type": "poetry"},
            ),
            # 抖音热榜
            ApiEndpoint(name="抖音热榜", path="/api/network/douyinhot", method="GET"),
            # 工具类API
            ApiEndpoint(
                name="字符串Hash",
                path="/api/network/hash",
                method="GET",
                params={"text": "Hello World", "type": "md5"},
            ),
            ApiEndpoint(
                name="Base64编码",
                path="/api/network/base64",
                method="GET",
                params={"text": "Hello World", "type": "encode"},
            ),
            ApiEndpoint(
                name="Base64解码",
                path="/api/network/base64",
                method="GET",
                params={"text": "SGVsbG8gV29ybGQ=", "type": "decode"},
            ),
            ApiEndpoint(
                name="BMI计算",
                path="/api/network/bmi",
                method="GET",
                params={"weight": 70, "height": 175},
            ),
            # 媒体转换
            ApiEndpoint(
                name="FLAC转MP3",
                path="/api/network/flactomp3",
                method="GET",
                params={"url": "https://example.com/test.flac"},
            ),
            # 驾考题目
            ApiEndpoint(
                name="随机驾考题",
                path="/api/network/jiakao",
                method="GET",
                params={"subject": "1"},
            ),
        ]

    def make_request(self, endpoint: ApiEndpoint) -> Dict[str, Any]:
        """发送单个API请求"""
        url = f"{self.base_url}{endpoint.path}"

        try:
            if endpoint.method == "GET":
                response = self.session.get(
                    url, params=endpoint.params, headers=endpoint.headers, timeout=30
                )
            else:
                response = self.session.post(
                    url,
                    params=endpoint.params,
                    json=endpoint.data,
                    headers=endpoint.headers,
                    timeout=30,
                )

            result = {
                "endpoint": endpoint.name,
                "url": url,
                "method": endpoint.method,
                "status_code": response.status_code,
                "success": response.status_code == endpoint.expected_status,
                "response_time": response.elapsed.total_seconds(),
                "timestamp": datetime.now().isoformat(),
            }

            # 处理响应
            if response.status_code == 429:  # Rate Limited
                result["rate_limited"] = True
                result["message"] = "请求频率限制"
                self.stats["rate_limited_calls"] += 1
            elif response.status_code == 200:
                try:
                    result["data"] = response.json()
                except:
                    result["data"] = response.text
                self.stats["successful_calls"] += 1
            else:
                result["error"] = response.text
                self.stats["failed_calls"] += 1

            return result

        except requests.exceptions.RequestException as e:
            return {
                "endpoint": endpoint.name,
                "url": url,
                "method": endpoint.method,
                "status_code": None,
                "success": False,
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
            }

    def test_single_endpoint(
        self, endpoint: ApiEndpoint, delay: bool = True
    ) -> Dict[str, Any]:
        """测试单个端点"""
        logger.info(f"测试端点: {endpoint.name}")

        result = self.make_request(endpoint)
        self.stats["total_calls"] += 1

        if result["success"]:
            logger.info(f"✓ {endpoint.name} - 成功 ({result['response_time']:.2f}s)")
        elif result.get("rate_limited"):
            logger.warning(f"⚠ {endpoint.name} - 频率限制")
        else:
            logger.error(f"✗ {endpoint.name} - 失败: {result.get('error', '未知错误')}")

        # 随机延迟，避免触发频率限制
        if delay:
            delay_time = random.uniform(*endpoint.delay_range)
            time.sleep(delay_time)

        return result

    def batch_test(
        self, rounds: int = 3, delay_between_rounds: int = 5
    ) -> List[Dict[str, Any]]:
        """批量测试所有端点"""
        logger.info(f"开始批量测试，共 {rounds} 轮")
        logger.info(f"基础URL: {self.base_url}")
        logger.info(f"端点数量: {len(self.endpoints)}")

        self.stats["start_time"] = datetime.now()
        all_results = []

        for round_num in range(1, rounds + 1):
            logger.info(f"\n=== 第 {round_num} 轮测试 ===")

            round_results = []
            for endpoint in self.endpoints:
                result = self.test_single_endpoint(endpoint)
                round_results.append(result)

            all_results.extend(round_results)

            # 轮次间延迟
            if round_num < rounds:
                logger.info(f"等待 {delay_between_rounds} 秒后开始下一轮...")
                time.sleep(delay_between_rounds)

        self.stats["end_time"] = datetime.now()
        return all_results

    def generate_report(self, results: List[Dict[str, Any]]) -> str:
        """生成测试报告"""
        duration = (self.stats["end_time"] - self.stats["start_time"]).total_seconds()

        report = f"""
=== API批量测试报告 ===
测试时间: {self.stats['start_time'].strftime('%Y-%m-%d %H:%M:%S')} - {self.stats['end_time'].strftime('%Y-%m-%d %H:%M:%S')}
总耗时: {duration:.2f} 秒

统计信息:
- 总调用次数: {self.stats['total_calls']}
- 成功调用: {self.stats['successful_calls']}
- 失败调用: {self.stats['failed_calls']}
- 频率限制: {self.stats['rate_limited_calls']}
- 成功率: {(self.stats['successful_calls'] / self.stats['total_calls'] * 100):.1f}%

详细结果:
"""

        # 按端点分组统计
        endpoint_stats = {}
        for result in results:
            name = result["endpoint"]
            if name not in endpoint_stats:
                endpoint_stats[name] = {
                    "total": 0,
                    "success": 0,
                    "failed": 0,
                    "rate_limited": 0,
                    "avg_response_time": 0,
                    "response_times": [],
                }

            stats = endpoint_stats[name]
            stats["total"] += 1

            if result["success"]:
                stats["success"] += 1
                if "response_time" in result:
                    stats["response_times"].append(result["response_time"])
            elif result.get("rate_limited"):
                stats["rate_limited"] += 1
            else:
                stats["failed"] += 1

        # 计算平均响应时间
        for name, stats in endpoint_stats.items():
            if stats["response_times"]:
                stats["avg_response_time"] = sum(stats["response_times"]) / len(
                    stats["response_times"]
                )

        # 输出每个端点的统计
        for name, stats in endpoint_stats.items():
            success_rate = (
                (stats["success"] / stats["total"] * 100) if stats["total"] > 0 else 0
            )
            report += f"\n{name}:"
            report += f"\n  调用次数: {stats['total']}"
            report += f"\n  成功率: {success_rate:.1f}%"
            report += f"\n  平均响应时间: {stats['avg_response_time']:.2f}s"
            if stats["rate_limited"] > 0:
                report += f"\n  频率限制次数: {stats['rate_limited']}"

        return report

    def save_results(self, results: List[Dict[str, Any]], filename: str = None):
        """保存测试结果到文件"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"api_test_results_{timestamp}.json"

        data = {
            "stats": self.stats,
            "results": results,
            "report": self.generate_report(results),
        }

        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"测试结果已保存到: {filename}")
        return filename


def main():
    """主函数"""
    # 创建测试器
    tester = ApiBatchTester("https://tts-api.hapxs.com")

    try:
        # 执行批量测试
        results = tester.batch_test(rounds=2, delay_between_rounds=3)

        # 生成报告
        report = tester.generate_report(results)
        print(report)

        # 保存结果
        tester.save_results(results)

    except KeyboardInterrupt:
        logger.info("测试被用户中断")
    except Exception as e:
        logger.error(f"测试过程中发生错误: {e}")


if __name__ == "__main__":
    main()

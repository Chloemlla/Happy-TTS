# 导入必要的库以支持应用程序的功能
import os
import sys
import time
import difflib
import tempfile
import psutil
import threading
import logging
import shutil
import requests
import hashlib
import gradio as gr
import base64
import json
import markdown
import resend

# 导入Flask和线程库，用于设置Web服务器和处理并发
from flask import Flask, jsonify, request
from threading import Thread
from typing import Union, Literal
from bs4 import BeautifulSoup
from openai import OpenAI
from dotenv import load_dotenv
from random import randint
from datetime import datetime, timedelta
from logging.handlers import TimedRotatingFileHandler
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# 设置日志目录和文件，确保其存在，并初始化日志记录器
# 确保logs文件夹存在
logs_dir = "logs"
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

# 检查并创建processed_content.txt文件
processed_file_path = "processed_content.txt"
if not os.path.exists(processed_file_path):
    open(processed_file_path, "w").close()

# 获取今日日期字符串
today_str = datetime.now().strftime("%Y.%m.%d")

# 计算今日已有的日志文件数量
today_logs_count = (
    len([name for name in os.listdir(logs_dir) if name.startswith(today_str)]) + 1
)

# 设置日志文件名
log_filename = os.path.join(logs_dir, f"{today_str}-{today_logs_count}.log")

# 定义ip_data.txt文件的行数限制
MAX_LINES = 200

resend.api_key = "填写此处"


# 设置日志记录器
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# 文件处理器，每次启动创建新文件
file_handler = logging.handlers.RotatingFileHandler(
    log_filename, maxBytes=1024 * 1024, backupCount=5, encoding="utf-8"
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))

# 控制台处理器
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.WARNING)  # 控制台只显示WARNING及以上级别的日志
console_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
)

logger.addHandler(file_handler)
logger.addHandler(console_handler)

# 加载环境变量
load_dotenv()
logging.info("环境变量已加载。")
# 存储IP数据的文件名
IP_DATA_FILE = "ip_data.txt"
# 存储最新的镜像信息
latest_record = None
# API 密码
PASSWORD = "wmy"
# 存储每个 IP 地址的失败尝试次数和时间戳
failed_attempts = {}
# 设置时间窗口为 60 秒
TIME_WINDOW = 60
# 设置最大错误密码尝试次数
MAX_ATTEMPTS = 1

logging.info("邮箱环境变量已加载。")

# 从环境变量读取配置，用于OpenAI API调用
server_name = os.getenv("SERVER_NAME", "tts.happys.icu")
correct_password = os.getenv("SERVER_PASSWORD")
openai_key = os.getenv("OPENAI_KEY")
openai_base_url = os.getenv("OPENAI_BASE_URL")
logging.info("从环境变量中读取服务器名称和OpenAI密钥以及请求地址。")

# 检查OpenAI API密钥是否有效，无效则退出程序
if openai_key == "<YOUR_OPENAI_KEY>":
    openai_key = ""
if openai_key == "":
    sys.exit("请提供您的OpenAI API密钥。")
logging.info("OpenAI API密钥已设置。")


# 定义一个简单的限流器类，用于限制调用频率
class RateLimiter:
    def __init__(self, max_calls, period):
        self.calls = []
        self.max_calls = max_calls
        self.period = period

    def attempt(self):
        now = time.time()
        self.calls = [call for call in self.calls if call > now - self.period]
        if len(self.calls) < self.max_calls:
            self.calls.append(now)
            return True
        return False


# 全局变量用于限制处理速度和存储已处理文本的哈希
tts_rate_limiter = RateLimiter(max_calls=5, period=30)
processed_texts = set()
processed_texts_lock = threading.Lock()

# 定义全局变量用于限制错误报告频率
last_error_report_time = datetime.min

# 全局变量用于存储当前正在处理的文本
current_processing_text = ""


# 生成文本的唯一哈希标识
def generate_text_hash(text: str) -> str:
    # 使用md5生成文本的哈希值，为了确保md5能够处理中文，需要先将文本编码为utf-8
    md5_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
    # 将md5的结果与内置hash函数的结果结合，进一步降低冲突概率
    combined_hash = f"{hash(text)}-{md5_hash}"
    return combined_hash


def load_processed_texts():
    """启动时加载已处理文本到内存"""
    global processed_texts
    with open(processed_file_path, "r", encoding="utf-8") as file:
        # 调整分隔符以匹配text_detail中使用的'-'*40
        texts = file.read().split("-" * 40 + "\n")  # 新的分隔符匹配text_detail格式
        # 确保列表中不包含空字符串，并去除每段文本前后的空白后生成哈希
        processed_texts = {
            generate_text_hash(text.strip()) for text in texts if text.strip()
        }


# 检查是否可以报告错误
def can_report_error() -> bool:
    """检查是否可以报告错误，一分钟内不可超过两次"""
    global last_error_report_time
    now = datetime.now()
    if (now - last_error_report_time).total_seconds() > 10:
        last_error_report_time = now
        return True
    return False


# 报告错误信息到日志，并根据频率限制决定是否提示用户报告错误
def report_error(error_message: str):
    """保存错误消息到日志文件并通过Gradio按钮报告错误"""
    error_file_path = os.path.join("error.txt")
    if not os.path.exists(error_file_path):
        open(error_file_path, "w").close()

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    full_error_message = f"[{timestamp}] {error_message}\n"

    with open(error_file_path, "a", encoding="utf-8") as error_file:
        error_file.write(full_error_message)

    if can_report_error():
        return f"生成语音时出现错误：{error_message}。请点击报告错误按钮。"
    else:
        return f"生成语音时出现错误：{error_message}。请稍后再报告。"


def generate_text_hash_1(text):
    """
    生成给定文本的哈希值。
    这里使用MD5作为一个简单示例，实际应用中可以根据需要选择不同的哈希算法。
    """
    # 确保文本是字节类型，因为hashlib需要字节输入
    text_bytes = text.encode("utf-8")
    # 使用MD5算法生成哈希
    return hashlib.md5(text_bytes).hexdigest()


# 保存已处理的文本内容
def save_processed_text(text: str):
    """保存已处理的文本，并附上时间戳和详细信息"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    text_detail = f"时间: {timestamp}\n内容: {text}\n{'-'*40}\n"
    with open(processed_file_path, "a", encoding="utf-8") as file:
        file.write(text_detail)


# 检查新文本与已处理文本的相似度
def check_similarity(new_text: str) -> bool:
    """
    检查新文本与已处理文本的相似度

    该函数通过比较新文本与之前已处理并存储的文本内容，判断是否存在较高的相似度。
    它首先从存储文件中读取已处理的文本内容，然后计算这些内容与新文本的相似度。

    参数:
    new_text: 待检查的新文本字符串。

    返回:
    如果新文本与已处理文本的相似度超过0.9，则返回True，否则返回False。
    """
    # 打开已处理文本文件，以读取模式打开，编码方式为utf-8
    with open(processed_file_path, "r", encoding="utf-8") as file:
        old_texts = file.read()

    # 提取已处理文本的实际内容部分进行相似度计算
    old_text_contents = [
        line.split("内容: ")[1]
        for line in old_texts.split("时间: ")
        if "内容: " in line
    ]
    # 将提取的内容合并为一个字符串，用换行符分隔
    combined_old_text = "\n".join(old_text_contents)

    # 使用difflib库计算合并后的旧文本与新文本的相似度
    similarity = difflib.SequenceMatcher(None, combined_old_text, new_text).ratio()
    # 返回相似度是否大于0.9的布尔值
    return similarity > 0.9


# 主函数：处理文本转语音的请求
def tts(
    text: str,
    model: Union[str, Literal["tts-1", "tts-1-hd"]],
    voice: Literal["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    output_file_format: Literal["mp3", "opus", "aac", "flac"] = "mp3",
    speed: float = 1.0,
    custom_file_name: str = None,
):
    global current_processing_text

    current_processing_text = text  # 更新当前正在处理的文本

    # 生成文本的唯一标识符
    text_hash = generate_text_hash(text)

    # 检查文本哈希是否已经处理过
    with processed_texts_lock:
        if text_hash in processed_texts:
            logging.info("检测到重复的文本输入，跳过处理。")
            raise gr.Error("重复的请求，不做处理。")
            return  # 这里不需要再次调用report_error或打印日志，因为已经在raise之前处理过了
        else:
            processed_texts.add(text_hash)

    # 限制请求速率
    if not tts_rate_limiter.attempt():
        raise gr.Error("超出请求频率限制，请稍后再试。")
        return report_error("超出请求频率限制，请稍后再试。")
        logging.info("客户端超出请求频率限制，不做处理")

    # 检查输入文本长度
    if len(text) == 0:
        logging.info("无文本输入，返回默认静音文件。")
        return "1-second-of-silence.mp3"

    # 检查新文本与之前处理的文本相似度
    if check_similarity(text):
        raise gr.Error("此内容与之前处理的内容相似度超过90%，不进行处理。")
        return report_error("此内容与之前处理的内容相似度超过90%，不进行处理。")
        logging.info("此内容与之前处理的内容相似度超过90%，不进行处理。")
        return  # 直接返回，不再执行后续的处理逻辑
    else:
        save_processed_text(text)
        logging.info(f"接收到文本：{text}")
        logging.info("正在请求OpenAI API进行文本转语音...")
        client = OpenAI(api_key=openai_key, base_url=openai_base_url)
        try:
            response = client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                response_format=output_file_format,
                speed=speed,
            )
            logging.info("语音合成请求成功！")
        except Exception as error:
            logging.error(str(error))
            raise gr.Error("生成语音时出现错误，请向站点管理员报告。")
            return report_error("生成语音时出现错误，请向站点管理员报告。")
            logging.info("生成语音时出现错误，请检查API密钥并重试。")
        finally:
            current_processing_text = ""  # 清空当前正在处理的文本，无论成功还是失败

        file_name = (
            custom_file_name
            if custom_file_name
            else tempfile.mktemp(suffix=f".{output_file_format}")
        )
        file_name = os.path.join("finish", file_name)
        logging.info(f"正在写入语音文件到：{file_name}")
        with open(file_name, "wb") as file:
            file.write(response.content)

    current_processing_text = ""  # 清空当前正在处理的文本
    return file_name


# 封装tts函数以处理Gradio接口的调用
def wrap_tts(
    text: str,
    model: str = "tts-1",
    voice: str = "alloy",
    output_file_format: str = "mp3",
    speed: float = 1.0,
    custom_file_name: str = "",
):
    # 如果提供了自定义文件名并且它没有后缀或者后缀不正确
    if custom_file_name and not custom_file_name.endswith(f".{output_file_format}"):
        # 从自定义文件名中移除现有的文件扩展名（如果有的话），并添加正确的扩展名
        base_name = os.path.splitext(custom_file_name)[0]
        custom_file_name = f"{base_name}.{output_file_format}"

    try:
        # 调用修改后的tts函数
        file_name = tts(
            text=text,
            model=model,
            voice=voice,
            output_file_format=output_file_format,
            speed=speed,
            custom_file_name=custom_file_name if custom_file_name else None,
        )
        return (
            file_name,
            "本次运行没有错误，谢谢使用！",
            True,
        )  # 如果没有错误，返回音频文件路径，成功信息和True
    except Exception as e:
        error_message = str(e)
        logging.error(error_message)
        return None, error_message, False


class MyHandler(FileSystemEventHandler):
    def __init__(self, observer):
        self.observer = observer

    def on_modified(self, event):
        # 如果变更发生在logs文件夹内，不执行任何操作
        if "logs" in event.src_path:
            return

        # 如果是Python脚本文件或环境变量文件被修改，重启脚本
        if event.src_path.endswith("app.py") or event.src_path.endswith(".env"):
            logging.info(f"检测到文件变化: {event.src_path}")
            self.observer.stop()  # 停止观察
            time.sleep(1)  # 等待观察器停止
            os.execv(sys.executable, [sys.executable] + sys.argv)  # 重启脚本


def get_folder_size(folder: str) -> int:
    """返回文件夹的大小（以字节为单位）。"""
    # 初始化文件夹总大小为0
    total_size = 0
    # 使用os.walk遍历文件夹及其子文件夹
    for dirpath, dirnames, filenames in os.walk(folder):
        # 遍历当前目录下的所有文件
        for filename in filenames:
            # 拼接得到文件的完整路径
            file_path = os.path.join(dirpath, filename)
            # 检查文件是否存在
            if os.path.exists(file_path):
                # 累加文件大小到总大小中
                total_size += os.path.getsize(file_path)
    # 返回文件夹的总大小
    return total_size


def clear_logs_folder(folder: str):
    """清空指定的文件夹。"""
    for file_name in os.listdir(folder):
        file_path = os.path.join(folder, file_name)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            logging.error(f"Failed to delete {file_path}. Reason: {e}")


def monitor_logs_folder():
    """
    监控日志文件夹的大小，并在超过40MB时进行清空。

    此函数会持续监控指定的日志文件夹（默认路径为'logs'），如果文件夹大小超过1MB，
    则会清空文件夹内的所有日志文件。监控间隔为60秒。
    """
    logs_dir = "logs"
    while True:
        folder_size = get_folder_size(logs_dir)
        folder_size_mb = folder_size / (1024 * 1024)  # 将文件夹大小转换为MB
        if folder_size_mb > 5:
            logging.info("日志文件夹大小超过1MB，正在清空文件夹...")
            clear_logs_folder(logs_dir)
            logging.info("日志文件夹已清空。")
        time.sleep(1)  # 每隔60秒检查一次


def watch_files():
    observer = Observer()

    event_handler = MyHandler(observer)
    observer.schedule(event_handler, ".", recursive=True)

    try:
        observer.start()
        while observer.is_alive():
            observer.join(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


def report_button_click():
    """处理报告错误按钮点击事件"""
    logging.info("用户已报告错误")


iface = gr.Interface(
    fn=wrap_tts,
    inputs=[
        gr.Textbox(label="文本"),
        gr.Dropdown(choices=["tts-1", "tts-1-hd"], label="模型", value="tts-1-hd"),
        gr.Radio(
            choices=["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
            label="声音",
            value="nova",
        ),
        gr.Dropdown(
            choices=["mp3", "opus", "aac", "flac"], label="输出文件格式", value="mp3"
        ),
        gr.Slider(minimum=0.5, maximum=2.0, step=0.1, value=1.0, label="速度"),
        gr.Textbox(label="自定义文件名（可选）", value=""),
    ],
    outputs=[
        gr.Audio(label="预览音频", type="filepath", autoplay=True),
        gr.Textbox(label="错误信息", interactive=False, visible=True, lines=2),
        gr.Button("报告错误", visible=False),
    ],
    title="Happy 文本转语音",
    description="""
    转换文字为语音，操作便捷高效：\n

    - **快速输入**：只需粘贴或键入期望转换的文字。\n
    - **个性化设置**：自由选择声音特质、语速等，定制专属听觉体验。\n
    - **高级定制**（可选）：指定输出文件名，为每次创作增添个性标签。\n

    **核心声明**：\n
    - 本服务基于OpenAI前沿的TTS技术，旨在促进公益与教育资源的普及。\n
    - 敬请遵守使用规则，确保内容适宜，避免涉及商业用途，共同维护良好环境。\n
    - 我们致力于提供服务，但不保证不间断运行或内容的绝对精确度。\n

    **联系我们**：\n
    - 邮箱：[admin@happys.icu](mailto:admin@happys.icu)\n

    **相关链接**：\n
    - [服务条款](https://tts-terms-of-use.happys.icu/) | [GitHub项目](https://github.com/Happy-clo/OpenAI-TTS-Gradio/)\n
    """,
    css="""footer.svelte-1rjryqp { display: none !important; }""",
    allow_flagging="never",
)

app = Flask(__name__)

command_queue = []


@app.route("/bili-done", methods=["POST"])
def bili_done():
    # 从请求中获取 JSON 数据
    try:
        data = request.get_json(force=True)  # 强制解析为 JSON
        print("接收到的请求内容:", data)  # 打印请求内容
    except Exception as e:
        return jsonify({"error": f"解析失败: {str(e)}"}), 400

    # 解析传入 JSON 中的内容
    try:
        if data.get("msgtype") != "markdown":  # 确保 msgtype 是 "markdown"
            return jsonify({"error": "msgtype 必须为 'markdown'"}), 400

        markdown_content = data.get("markdown", {}).get("content", "")
        if not markdown_content:  # 检查是否有内容
            return jsonify({"error": "未找到内容"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    # 将 Markdown 内容转换为 HTML
    html_content = markdown.markdown(markdown_content)

    # 准备邮件参数
    params = {
        "from": "Happy <happy@wdsj.one>",
        "to": ["happy@wdsj.one"],
        "subject": "来自 /bili-done Email API 请求的新内容",
        "html": f"{html_content}",
    }
    logging.info(f"准备发送邮件，内容：{html_content}")
    # 发送邮件
    try:
        email = resend.Emails.send(params)
        return jsonify({"success": True, "email": email}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.before_request
def limit_requests():
    ip = request.remote_addr  # 获取客户端真实IP
    now = time.time()

    # 清理过期的尝试记录
    if ip in failed_attempts:
        failed_attempts[ip] = [
            (attempt_time, attempt_count)
            for attempt_time, attempt_count in failed_attempts[ip]
            if now - attempt_time < TIME_WINDOW
        ]

    # 检查当前尝试次数
    if (
        ip in failed_attempts
        and sum(attempt_count for _, attempt_count in failed_attempts[ip])
        >= MAX_ATTEMPTS
    ):
        return jsonify({"error": "过多的错误尝试，请稍后重试。"}), 429


@app.route("/email", methods=["POST"])
def email_api():
    # 从请求中获取 JSON 数据
    data = request.get_json(force=True)

    # 确认密码正确
    password = data.get("password")
    if password != PASSWORD:
        ip = request.remote_addr
        now = time.time()

        if ip not in failed_attempts:
            failed_attempts[ip] = []

        # 记录失败尝试
        failed_attempts[ip].append((now, 1))

        return jsonify({"error": "密码错误"}), 403

    # 解析传入的 JSON 内容
    try:
        if data.get("msgtype") != "markdown":
            return jsonify({"error": "msgtype 必须为 'markdown'"}), 400

        markdown_content = data.get("markdown", {}).get("content", "")
        if not markdown_content:
            return jsonify({"error": "未找到内容"}), 400

        # 获取发件人和收件人的信息
        sender_name = data.get("from", "Happy")
        sender_email = data.get("from_email", "happy@wdsj.one")
        recipient_email = data.get("to", ["happy@wdsj.one"])
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    # 将 Markdown 内容转换为 HTML
    html_content = markdown.markdown(markdown_content)

    # 准备邮件参数
    params = {
        "from": f"{sender_name} <{sender_email}>",
        "to": recipient_email,
        "subject": "来自 /email Email API 请求的新内容",
        "html": f"{html_content}",
    }
    logging.info(params)
    # 发送邮件
    try:
        email = resend.Emails.send(params)
        return jsonify({"success": True, "email": email}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def get_ip_location(ip):
    try:
        response = requests.get(f"https://api.vore.top/api/IPdata?ip={ip}")
        data = response.json()
        if data["code"] == 200:
            info = data["ipdata"]
            location = f"{info['info1']}, {info['info2']}, {info['info3']} 运营商: {info['isp']}"
            return location
        else:
            return "未找到位置"
    except Exception as e:
        logging.error(f"获取 IP {ip} 位置时出错: {e}")
        return "获取位置时出错"


def log_ip_data(ip, location):
    with open(IP_DATA_FILE, "a") as f:
        f.write(f"{ip}, {location}\n")


def read_ip_data():
    if not os.path.exists(IP_DATA_FILE):
        return {}

    ip_data = {}
    with open(IP_DATA_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if line:  # 确保行不为空
                parts = line.split(", ", 1)
                if len(parts) == 2:  # 确保有两个部分
                    ip, location = parts
                    ip_data[ip] = location
                else:
                    logging.warning(f"无效的行格式: {line}")  # 记录无效行
    return ip_data


@app.route("/ip")
def get_ip():
    # 检查是否有查询参数 'ip'
    provided_ip = request.args.get("ip")
    real_time = request.args.get("real-time")  # 检查是否请求实时结果

    if provided_ip:
        ip = provided_ip
    else:
        # 从请求头获取真实 IP
        if "X-Forwarded-For" in request.headers:
            ip = request.headers["X-Forwarded-For"].split(",")[0]
        elif "X-Real-IP" in request.headers:
            ip = request.headers["X-Real-IP"]
            logging.info(f"使用 X-Real-IP: {ip}")
        else:
            ip = request.remote_addr

    logging.info(f"获取到的 IP: {ip}")

    # 如果请求实时结果，直接调用外部API
    if real_time is not None:
        location_info = get_ip_location(ip)
        log_ip_data(ip, location_info)  # 记录到文件
        return jsonify(
            {
                "ip": ip,
                "location": location_info,
                "message": "实时结果",
            }
        )

    # 读取已记录的IP数据
    ip_data = read_ip_data()

    if ip in ip_data:
        # 如果是缓存结果
        location_info = ip_data[ip]
        logging.info(f"从文件获取位置: {location_info}")
        return jsonify(
            {
                "ip": ip,
                "location": location_info,
                "message": "本次内容为缓存结果。您可以请求 /ip?real-time 来获取实时结果。",
            }
        )
    else:
        # 获取 IP 归属地
        location_info = get_ip_location(ip)
        log_ip_data(ip, location_info)  # 记录到文件
        logging.info(location_info)

        return jsonify(
            {
                "ip": ip,
                "location": location_info,
                "message": "如果您提供的 IP 是 VPN 服务器的地址，位置信息可能不准确。",
            }
        )


def fetch_and_record():
    global latest_record
    while True:
        # 指定页面URL
        url = "https://github.com/danny-avila/LibreChat/pkgs/container/librechat-dev"

        try:
            # 获取页面内容
            response = requests.get(url)
            response.raise_for_status()  # 检查请求是否成功

            # 解析HTML
            soup = BeautifulSoup(response.content, "html.parser")

            # 查找Docker命令
            docker_command = soup.find("clipboard-copy")["value"]
            filtered_command = docker_command.replace("docker pull ", "")

            # 获取当前时间
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            latest_record = (current_time, filtered_command)

            # 记录到文件
            with open("lc_data.txt", "a") as f:
                f.write(f"{current_time}, {filtered_command}\n")

        except Exception as e:
            print(f"Error fetching data: {e}")

        # 每小时访问一次
        time.sleep(3600)


@app.route("/y", methods=["GET"])
def add_command():
    command = request.args.get("command")
    password = request.args.get("password")

    # 检查密码是否正确
    if password != "wumy":
        return jsonify({"status": "error", "message": "Invalid password"}), 403

    if command:
        command_queue.append(command)
        return jsonify({"status": "command added", "command": command})

    return jsonify({"status": "error", "message": "No command provided"})


@app.route("/q", methods=["GET"])
def get_command():
    if command_queue:
        command = command_queue[0]  # 获取队列中的第一个命令
        return jsonify({"command": command})
    return jsonify({"command": None})


@app.route("/p", methods=["POST"])
def remove_command():
    command = request.form.get("command")

    # 检查命令是否在队列中
    if command in command_queue:
        command_queue.remove(command)
        return jsonify({"status": "command removed", "command": command})

    return jsonify({"status": "error", "message": "Command not found"})


@app.route("/doing", methods=["GET"])
def doing():
    # 获取请求中的密码
    password = request.args.get("password")

    # 验证密码
    if password == correct_password:
        # 将当前正在处理的文本转换为JSON
        data = {"text": current_processing_text}
        json_data = json.dumps(data)
        # 将JSON数据编码为Base64
        base64_encoded_data = base64.b64encode(json_data.encode("utf-8")).decode(
            "utf-8"
        )
        return jsonify({"data": base64_encoded_data})
    else:
        # 如果密码不正确，返回错误信息而不是随机数据
        return jsonify({"error": "Invalid password"}), 401  # 返回401 Unauthorized状态码


@app.route("/lc", methods=["GET"])
def get_docker_command():
    if latest_record:
        # 返回最近一次记录的信息
        return jsonify({"update_time": latest_record[0], "image_name": latest_record[1]})
    else:
        return jsonify({"error": "No data available."}), 404


@app.route("/", methods=["GET"])
def home_page():
    return jsonify({ "hello": "Welcome to my api!!" })


@app.route("/a", methods=["GET"])
def receive_data():
    # 获取GET请求参数
    data = request.args.to_dict()

    # 将参数写入文件
    with open("data.txt", "a") as f:
        f.write(str(data) + "\n")

    return "Data received and written to file", 200


@app.route(
    "/collect_data",
    methods=["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
def collect_data():
    file_dir = "data"
    file_path = os.path.join(file_dir, "data.txt")

    # 如果目录不存在，则创建
    if not os.path.exists(file_dir):
        os.makedirs(file_dir)

    # 获取前端发送的数据，支持 JSON、表单数据或纯文本
    if request.json:
        data = request.json
    elif request.form:
        data = request.form.to_dict()
    else:
        data = {"raw_data": request.data.decode("utf-8")}

    print("收到的数据:", data)

    # 写入数据到文件，采用追加模式
    with open(file_path, "a") as f:
        f.write(json.dumps(data) + "\n")  # 将字典转换为JSON字符串并写入

    # 返回成功响应
    return jsonify(
        {"status": "success", "message": f"Data received via {request.method} method."}
    )


@app.route("/server_status", methods=["GET"])
def server_status():
    # 从请求参数中获取密码
    password = request.args.get("password")

    # 验证密码
    if password == correct_password:
        # 获取系统启动时间
        boot_time = psutil.boot_time()
        # 将启动时间转换为可读的日期格式
        boot_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(boot_time))

        # 获取其他状态信息（例如 CPU 使用率、内存使用情况等）
        cpu_percent = psutil.cpu_percent(interval=1)
        memory_info = psutil.virtual_memory()
        memory_used = memory_info.used
        memory_total = memory_info.total
        memory_percent = memory_info.percent

        # 构建状态信息字典
        status_info = {
            "boot_time": boot_time_str,
            "uptime": time.time() - boot_time,
            "cpu_usage_percent": cpu_percent,
            "memory_usage": {
                "used": memory_used,
                "total": memory_total,
                "percent": memory_percent,
            },
        }
    else:
        # 如果密码不正确，返回一组随机生成的模拟数据
        status_info = {
            "boot_time": "2023-01-01 00:00:00",
            "uptime": randint(1800, 36000),  # 随机生成 30分钟 到 10小时 的运行时间
            "cpu_usage_percent": randint(5, 95),  # 随机生成 5% 到 95% 的 CPU 使用率
            "memory_usage": {
                "used": randint(
                    500 * 1024 * 1024, 8 * 1024 * 1024 * 1024
                ),  # 随机生成 500MB 到 8GB 的内存使用量
                "total": randint(
                    2 * 1024 * 1024 * 1024, 16 * 1024 * 1024 * 1024
                ),  # 随机生成 2GB 到 16GB 的总内存
                "percent": randint(5, 95),  # 随机生成 5% 到 95% 的内存使用百分比
            },
        }

    return jsonify(status_info), 200


@app.route("/hello")
def hello():
    # 获取请求中的密码参数
    password = request.args.get("password")

    # 检查密码是否正确
    if password == correct_password:
        # 如果密码正确，返回固定消息
        return jsonify({"return_data": "Hello, this is my Gradio project!"})
    else:
        # 如果密码不正确，生成并返回一个随机复杂字符串
        random_string = "".join(
            random.choices(
                string.ascii_letters + string.digits + string.punctuation, k=50
            )
        )
        return jsonify({"return_data": random_string})


def run_flask():
    app.run(port=1002)

def check_and_trim_file():
    # 确保这个函数是线程安全的
    try:
        if os.path.exists(IP_DATA_FILE):
            with open(IP_DATA_FILE, "r") as f:
                lines = f.readlines()
            if len(lines) > MAX_LINES:
                logging.info(f"文件 {IP_DATA_FILE} 超过 {MAX_LINES} 行，正在删除多余行...")
                # 写回前 MAX_LINES 行
                with open(IP_DATA_FILE, "w") as f:
                    f.writelines(lines[:MAX_LINES])
                logging.info("多余行已删除。")
        else:
            logging.warning(f"文件 {IP_DATA_FILE} 不存在。")
    except Exception as e:
        logging.error(f"检查或清理文件 {IP_DATA_FILE} 时出错: {e}")

# 定时器：每10分钟运行一次
def start_periodic_file_check():
    def periodic_task():
        check_and_trim_file()
        # 每1分钟（60秒）运行一次
        threading.Timer(60, periodic_task).start()

    # 启动定时任务
    periodic_task()

if __name__ == "__main__":
    if not os.path.exists("finish"):
        os.makedirs("finish")
    # 在主函数开始或其他合适位置调用这个函数
    load_processed_texts()
    path = "."
    # 启动观察者线程
    observer = Observer()
    event_handler = MyHandler(observer)
    observer.schedule(event_handler, path, recursive=True)
    observer.start()

    # 启动LibreChat定时任务线程
    thread = threading.Thread(target=fetch_and_record, daemon=True)
    thread.start()

    # 启动日志监视线程
    start_periodic_file_check()
    logs_monitor_thread = Thread(target=monitor_logs_folder)
    logs_monitor_thread.start()

    # 启动Flask应用
    flask_thread = Thread(target=run_flask)
    flask_thread.start()

    try:
        # 启动Gradio界面
        iface.launch(share=False)

        # 保持主程序持续运行
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()  # 停止观察者
    observer.join()  # 等待观察者线程结束

import time
import random
from lxml import etree
from DrissionPage import ChromiumPage

# options = ... # 请根据实际情况初始化options
options = None  # 占位，需根据实际环境配置


def get_turnstile_response():
    driver = ChromiumPage(options)
    url = "https://minitts.ai/"
    while True:
        try:
            driver.get(url)  # 重试页面5
            time.sleep(random.randint(2, 5))
            result = driver.html
            html = etree.HTML(result)
            cf_turnstile_response = html.xpath(
                '//*[@id="turnstile-flight-search"]/input/@value'
            )
            print(f"cf_turnstile_response:{cf_turnstile_response[0]}")
            return cf_turnstile_response[0]
        except Exception as e:
            print(e)

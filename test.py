import os
import re
import requests
import time
from os import remove
import aiofiles
from aiohttp import ClientSession, ClientTimeout
import asyncio
from colorama import init
from json import loads
 
 
def len_str(string):
    count = 0
    for ch in string:
        if ch >= '\u007f':
            count += 1
    return count
 
 
def width(string, length):
    if length < len_str(string):
        return 0
    else:
        return length - len_str(string)
 
 
async def fanqie_singe_chapter(id, sem):
    if len(id):
        chapter_url = f'http://fq.travacocro.com/content?item_id={id}'  # 拼接章节网址
        ii = 0
        async with sem:
            while ii < 5:
                ii += 1
                try:
                    timeout = ClientTimeout(total = 50)
                    async with ClientSession(headers = headers1, timeout = timeout) as session:
                        async with session.get(chapter_url) as resp_content:
                            jsons = await resp_content.json()
                            single_content = jsons['data']['data']['content']
                            name2 = jsons['data']['data']['title']
                            async with aiofiles.open(f"./小说/{id}.txt", "w", encoding = "utf-8") as f:  # 在小说目录下创建临时的单章txt
                                await f.write(name2 + '\n\n\n')
                                await f.write(single_content.replace('\n', '\n\n'))
                            print(f'{name2:<{width(name2,60)}}finish')
                            break
                except Exception as e:
                    print(f'{id}     false      {ii}/5')
                    print(e)
 
 
# 创建异步任务
async def fanqie_create_tasks(ids, lens):
    tasks = []
    if lens > 100:
        sema = 100
    else:
        sema = lens
    sem = asyncio.Semaphore(sema)
    for id in ids:
        tasks.append(asyncio.create_task(fanqie_singe_chapter(id, sem)))  # 创建任务
    await asyncio.gather(*tasks)
 
 
def fanqie_download(book_id):
    if book_id.isdigit():
        time1 = time.time()
        resp_info = requests.get(f'https://fanqienovel.com/page/{book_id}', headers = headers1)
        json1 = loads(re.findall('window.__INITIAL_STATE__=(.*?);', resp_info.text)[0].replace('undefined', 'null'))['page']
        item_ids = json1['itemIds']
        novel_name = json1['bookName']
        novel_author = json1['author']
        if not novel_name:
            print('该书不是正常书籍状态，可能书籍更换了书籍号或者出现了其他原因，内容无法保证正确，请尽量检索完整的小说书名！！')
            novel_name = '异常书籍' + str(book_id)
        else:
            novel_name = novel_name + '-' + novel_author
        if len(item_ids):
            print(f"\033[31m《{novel_name}》({book_id})共{len(item_ids)}章, 开始下载！！\033[0m\n\n")
            item_ids.reverse()
            loop.run_until_complete(fanqie_create_tasks(item_ids, len(item_ids)))  # 提交任务
            time2 = time.time()
            with open(f'./小说/{novel_name}.txt', 'w', encoding = 'utf-8') as f1:  # 将分散的小说章节写入一个{书名}.txt中
                for id in item_ids:
                    try:
                        with open(f'./小说/{id}.txt', 'r', encoding = 'utf-8') as f2:
                            text1 = f2.read()
                            f1.write(text1)
                        remove(f"./小说/{id}.txt")  # 移除已写入{书名}.txt的临时章节
                    except:
                        print(f'{id}  false')
                print('==============================下载完成==============================\n')
            print(f'共耗时：\033[33m{time2 - time1:.2f}s\033[0m\n\n')
            print(f'\033[32m《{novel_name}》已下载！！！！\033[0m\n\n\n')
        else:
            print('\033[31m请输入有效的书籍ID\033[0m\n')
    else:
        print('\033[31m请输入纯数字的书籍ID！！！！\033[0m')
 
 
if __name__ == '__main__':
    headers1 = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; TAS-AN00 Build/HUAWEITAS-AN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.61 Mobile Safari/537.36 Super 4.6.5"
    }
    init(autoreset = True)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    strinfo = re.compile('[/:*?"<>|\\\\]')  # 匹配字符串中特殊的字符
    if not os.path.exists("小说"):
        os.mkdir("小说")
    a = input('番茄小说ID下载：    1 \n番茄小说搜索下载：  2 \n请选择：')
    if a == '1':
        print(
            '\n\033[31m注意\033[0m：下载番茄小说的小说，需要自行获取书籍的id，可以通过网页搜索的方式获取\n      就是书籍章节页面url后面那一串数字，输入那一串数字即可\n')
        while True:
            bookid = input('请输入番茄小说ID(批量下载请用空格分割)：')
            if bookid:
                for id in bookid.split(' '):
                    fanqie_download(id)
                    time.sleep(0.5)
    elif a == '2':
        print('\n\033[31m番茄小说搜索下载功能\033[0m：尽量检索完整小说书名，可能会出现正常网页检索不出的书籍，请注意甄别')
        while True:
            search_name = input('请输入书名或者作者名进行搜索：')
            book_id, num = [], 0
            for i in range(3):
                new_url = f'https://novel.snssdk.com/api/novel/channel/homepage/search/search/v1/?device_platform=android&parent_enterfrom=novel_channel_search.tab&aid=1967&offset={i * 10}&q={search_name}'
                for _ in range(3):
                    resp = requests.get(url = new_url, headers = headers1).json()
                    if resp['message'] == 'success':
                        break
                    else:
                        time.sleep(1)
                if resp['message'] != 'success':
                    print(resp['message'])
                    continue
                for book in resp['data']['ret_data']:
                    if book['author'] == '番茄漫画' or book['author'] == '番茄畅听':
                        continue
                    else:
                        book_id.append(book['book_id'])
                        title, author = book['title'], book['author']
                        num += 1
                        print(f'{num:<4}{title:^{width(title, 60)}}{author:<{width(author, 40)}}')
                if not resp['data']['has_more']:
                    break
            choose = input('请输入书籍序号，输入\033[32m0\033[0m重新搜索(批量下载请用空格分割序号)：')
            choose_list = choose.split(' ')
            for ids in choose_list:
                if ids.isdigit():
                    if int(ids) <= len(book_id):
                        if int(ids):
                            fanqie_download(book_id[int(ids) - 1])
                            time.sleep(0.5)
                        else:
                            continue
                    else:
                        print('\033[31m序号超出范围，请重新搜索！！\033[0m')
                else:
                    print('\033[31m请输入正确格式的书籍序号！！！！\033[0m')
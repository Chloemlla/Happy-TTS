import express from 'express';
import { NetworkController } from '../controllers/networkController';
import axios from 'axios';

const router = express.Router();

/**
 * @openapi
 * /api/network/tcping:
 *   get:
 *     summary: TCP连接检测
 *     description: 检测目标地址的TCP端口是否可连接
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标地址
 *       - in: query
 *         name: port
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 65535
 *         description: 端口号
 *     responses:
 *       200:
 *         description: 检测成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 检测结果数据
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/tcping', NetworkController.tcpPing);

/**
 * @openapi
 * /api/network/ping:
 *   get:
 *     summary: Ping检测
 *     description: 检测服务器的网络连接状况
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标URL
 *     responses:
 *       200:
 *         description: 检测成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 检测结果数据
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/ping', NetworkController.ping);

/**
 * @openapi
 * /api/network/speed:
 *   get:
 *     summary: 网站测速
 *     description: 检测网站的加载速度
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标URL
 *     responses:
 *       200:
 *         description: 测速成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 测速结果数据
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/speed', NetworkController.speedTest);

/**
 * @openapi
 * /api/network/portscan:
 *   get:
 *     summary: 端口扫描
 *     description: 扫描目标IP地址的开放端口
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标IP地址
 *     responses:
 *       200:
 *         description: 扫描成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 扫描结果数据
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/portscan', NetworkController.portScan);

/**
 * @openapi
 * /api/network/ipquery:
 *   get:
 *     summary: 精准IP查询
 *     description: 查询IP地址的精准地理位置信息，可定位到县级行政区
 *     parameters:
 *       - in: query
 *         name: ip
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
 *         description: 要查询的IP地址
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: IP地理位置信息
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: object
 *                       description: IP详细信息
 *                       properties:
 *                         ip:
 *                           type: string
 *                           description: IP地址
 *                         country:
 *                           type: string
 *                           description: 国家
 *                         country_code:
 *                           type: string
 *                           description: 国家代码
 *                         country_en:
 *                           type: string
 *                           description: 国家英文名
 *                         province:
 *                           type: string
 *                           description: 省份
 *                         city:
 *                           type: string
 *                           description: 城市
 *                         district:
 *                           type: string
 *                           description: 区县
 *                         address:
 *                           type: string
 *                           description: 完整地址
 *                         isp:
 *                           type: string
 *                           description: 运营商
 *                         latitude:
 *                           type: number
 *                           description: 纬度
 *                         longitude:
 *                           type: number
 *                           description: 经度
 *                         adcode:
 *                           type: string
 *                           description: 行政区划代码
 *                         continent:
 *                           type: string
 *                           description: 大洲
 *                     request_id:
 *                       type: string
 *                       description: 请求ID
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/ipquery', NetworkController.ipQuery);

/**
 * @openapi
 * /api/network/yiyan:
 *   get:
 *     summary: 随机一言古诗词
 *     description: 获取随机的一言或古诗词，为应用提供灵感
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [hitokoto, poetry]
 *         description: 返回类型 - hitokoto(一言) 或 poetry(古诗词)
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 一言古诗词数据
 *                   properties:
 *                     code:
 *                       type: string
 *                       description: 响应状态码
 *                     data:
 *                       type: string
 *                       description: 一言或古诗词内容
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/yiyan', NetworkController.randomQuote);

/**
 * @openapi
 * /api/network/douyinhot:
 *   get:
 *     summary: 抖音热榜查询
 *     description: 获取抖音平台上的热门视频、话题和实时排行榜数据
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 抖音热榜数据
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: array
 *                       description: 热榜数据列表
 *                       items:
 *                         type: object
 *                         properties:
 *                           word:
 *                             type: string
 *                             description: 热榜标题
 *                           hot_value:
 *                             type: integer
 *                             description: 热度值
 *                           position:
 *                             type: integer
 *                             description: 排名位置
 *                           event_time:
 *                             type: integer
 *                             description: 事件时间戳
 *                           video_count:
 *                             type: integer
 *                             description: 相关视频数量
 *                           word_cover:
 *                             type: object
 *                             description: 封面图片信息
 *                             properties:
 *                               uri:
 *                                 type: string
 *                                 description: 图片URI
 *                               url_list:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                                 description: 图片URL列表
 *                           label:
 *                             type: integer
 *                             description: 标签类型
 *                           group_id:
 *                             type: string
 *                             description: 分组ID
 *                           sentence_id:
 *                             type: string
 *                             description: 句子ID
 *                           sentence_tag:
 *                             type: integer
 *                             description: 句子标签
 *                           word_type:
 *                             type: integer
 *                             description: 词条类型
 *                           article_detail_count:
 *                             type: integer
 *                             description: 文章详情数量
 *                           discuss_video_count:
 *                             type: integer
 *                             description: 讨论视频数量
 *                           display_style:
 *                             type: integer
 *                             description: 显示样式
 *                           can_extend_detail:
 *                             type: boolean
 *                             description: 是否可扩展详情
 *                           hotlist_param:
 *                             type: string
 *                             description: 热榜参数
 *                           related_words:
 *                             type: object
 *                             nullable: true
 *                             description: 相关词汇
 *                           word_sub_board:
 *                             type: array
 *                             nullable: true
 *                             items:
 *                               type: integer
 *                             description: 子板块信息
 *                           aweme_infos:
 *                             type: object
 *                             nullable: true
 *                             description: 视频信息
 *                           drift_info:
 *                             type: object
 *                             nullable: true
 *                             description: 漂移信息
 *                           room_count:
 *                             type: integer
 *                             description: 房间数量
 *                     request_id:
 *                       type: string
 *                       description: 请求ID
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/douyinhot', NetworkController.douyinHot);

/**
 * @openapi
 * /api/network/hash:
 *   get:
 *     summary: 字符串Hash加密
 *     description: 提供多种哈希加密算法支持，包括MD4、MD5、SHA1、SHA256和SHA512
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [md4, md5, sha1, sha256, sha512]
 *         description: 加密算法类型
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *         description: 需要加密的字符串
 *     responses:
 *       200:
 *         description: 加密成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 加密结果数据
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: string
 *                       description: 加密后的Hash值
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/hash', NetworkController.hashEncrypt);

/**
 * @openapi
 * /api/network/base64:
 *   get:
 *     summary: Base64编码与解码
 *     description: 支持Base64编码与解码操作，提供快速稳定的接口服务
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [encode, decode]
 *         description: 操作类型 - encode(编码) 或 decode(解码)
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *         description: 需要编码或解码的字符串
 *     responses:
 *       200:
 *         description: 操作成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 操作结果数据
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: string
 *                       description: 编码或解码后的结果
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/base64', NetworkController.base64Operation);

/**
 * @openapi
 * /api/network/bmi:
 *   get:
 *     summary: BMI身体指数计算
 *     description: 根据身高（cm）和体重（kg）计算BMI值，返回健康建议
 *     parameters:
 *       - in: query
 *         name: height
 *         required: true
 *         schema:
 *           type: string
 *         description: 身高（厘米），如180
 *       - in: query
 *         name: weight
 *         required: true
 *         schema:
 *           type: string
 *         description: 体重（公斤），如80
 *     responses:
 *       200:
 *         description: 计算成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: integer
 *                     msg:
 *                       type: string
 *                     data:
 *                       type: object
 *                       properties:
 *                         bmi:
 *                           type: number
 *                         msg:
 *                           type: string
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/bmi', NetworkController.bmiCalculate);

/**
 * @openapi
 * /api/network/flactomp3:
 *   get:
 *     summary: FLAC转MP3音频转换
 *     description: 专业的FLAC转MP3 API接口，提供高效的音频格式转换服务
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 需要转换的FLAC文件URL
 *       - in: query
 *         name: return
 *         required: false
 *         schema:
 *           type: string
 *           enum: [json, 302]
 *           default: json
 *         description: 返回类型 - json(返回JSON数据) 或 302(重定向到MP3文件)
 *     responses:
 *       200:
 *         description: 转换成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 转换结果数据
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: string
 *                       description: 转换后的MP3文件URL
 *                     request_id:
 *                       type: string
 *                       description: 请求ID
 *       302:
 *         description: 重定向到MP3文件（当return=302时）
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/flactomp3', NetworkController.flacToMp3);

/**
 * @openapi
 * /api/network/jiakao:
 *   get:
 *     summary: 随机驾考题目
 *     description: 免费API提供随机获取驾考题目的功能，帮助用户练习驾考理论
 *     parameters:
 *       - in: query
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *           enum: [1, 4]
 *         description: 科目类型 - 1(科目1) 或 4(科目4)
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   description: 驾考题目数据
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: object
 *                       description: 题目详情
 *                       properties:
 *                         question:
 *                           type: string
 *                           description: 题目内容
 *                         answer:
 *                           type: string
 *                           description: 正确答案
 *                         chapter:
 *                           type: string
 *                           description: 所属章节
 *                         explain:
 *                           type: string
 *                           description: 答案解释
 *                         type:
 *                           type: string
 *                           description: 适用驾驶证类型
 *                         option1:
 *                           type: string
 *                           description: 选项A（选择题）
 *                         option2:
 *                           type: string
 *                           description: 选项B（选择题）
 *                         option3:
 *                           type: string
 *                           description: 选项C（选择题）
 *                         option4:
 *                           type: string
 *                           description: 选项D（选择题）
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.get('/jiakao', NetworkController.randomJiakao);

// 新增：获取公网IP的代理接口
router.get('/get-ip', async (req, res) => {
  try {
    // 推荐用国内可访问的IP API
    const response = await axios.get('https://ip.useragentinfo.com/json');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch IP' });
  }
});

export default router; 
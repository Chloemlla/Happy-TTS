import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Moon, Sun, User, Heart, Star, MessageCircle, Share2,
  MapPin, Coffee, Utensils, Shirt, Camera, Home as HomeIcon,
  Video, Plus, MessageSquare, ShoppingBag, Sparkles, TrendingUp
} from 'lucide-react';

// 卡片数据类型
interface CardData {
  id: number;
  category: string;
  title: string;
  image: string;
  likes: number;
  collects: number;
  user: string;
  avatar: string;
  description: string;
}

// 小红书风格展示页面
const XiaohongshuDemo: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [displayCount, setDisplayCount] = useState(12);
  const [isLoading, setIsLoading] = useState(false);
  const [likedCards, setLikedCards] = useState<Set<number>>(new Set());
  const [collectedCards, setCollectedCards] = useState<Set<number>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // 模拟数据
  const mockData: CardData[] = [
    {
      id: 1,
      category: 'travel',
      title: '成都旅游攻略｜3天2夜玩转春熙路宽窄巷子',
      image: 'https://picsum.photos/seed/1/400/600',
      likes: 12400,
      collects: 3200,
      user: '旅行达人小美',
      avatar: 'https://i.pravatar.cc/150?img=1',
      description: '成都是一座来了就不想走的城市！这次三天两夜的旅行让我彻底爱上了这里。第一天打卡春熙路、太古里，感受现代都市的繁华；第二天去宽窄巷子、锦里，品味地道川味小吃；第三天熊猫基地看国宝，超级可爱！美食推荐：老妈蹄花、钵钵鸡、冰粉。住宿推荐春熙路附近，交通方便。'
    },
    {
      id: 2,
      category: 'food',
      title: '日料爱好者必看！人均200吃到撑的宝藏店',
      image: 'https://picsum.photos/seed/2/400/500',
      likes: 8900,
      collects: 2100,
      user: '美食探店王',
      avatar: 'https://i.pravatar.cc/150?img=2',
      description: '终于找到一家性价比超高的日料店！刺身新鲜，三文鱼入口即化，金枪鱼油脂丰富。寿司师傅现场制作，每一贯都用心。特别推荐他们家的炙烤系列，芝士焗生蚝太绝了！人均200就能吃得非常满意。环境优雅，适合约会聚餐。记得提前预约！'
    },
    {
      id: 3,
      category: 'fashion',
      title: '秋季穿搭分享｜温柔风格搭配指南',
      image: 'https://picsum.photos/seed/3/400/550',
      likes: 15600,
      collects: 4800,
      user: '穿搭博主Lily',
      avatar: 'https://i.pravatar.cc/150?img=3',
      description: '秋天最适合温柔风穿搭了！今天分享几套我最爱的look：针织开衫+半身裙，温柔又知性；奶茶色大衣+白色内搭，高级又百搭；卡其色风衣+牛仔裤，休闲chic。配色建议以大地色系为主，增添温柔气质。鞋子推荐乐福鞋或小白鞋，舒适又时髦！'
    },
    {
      id: 4,
      category: 'photography',
      title: '夕阳摄影技巧｜手机也能拍出大片感',
      image: 'https://picsum.photos/seed/4/400/600',
      likes: 20100,
      collects: 6500,
      user: '摄影师Jason',
      avatar: 'https://i.pravatar.cc/150?img=4',
      description: '不需要专业相机，手机也能拍出震撼的夕阳大片！技巧分享：1. 黄金时间是日落前30分钟 2. 开启HDR模式平衡曝光 3. 善用剪影效果 4. 寻找有趣的前景 5. 调整色温增强氛围感。后期建议：提高饱和度、降低高光、增加暗部细节。记住，好的光线胜过一切器材！'
    },
    {
      id: 5,
      category: 'cafe',
      title: '杭州咖啡馆探店｜西湖边的宝藏咖啡店',
      image: 'https://picsum.photos/seed/5/400/520',
      likes: 9800,
      collects: 2900,
      user: '咖啡爱好者',
      avatar: 'https://i.pravatar.cc/150?img=5',
      description: '在西湖边发现了一家超棒的咖啡馆！环境清幽，可以看到湖景。手冲咖啡豆子新鲜，风味层次丰富。拿铁拉花超美，奶泡绵密细腻。甜品推荐提拉米苏，不会太甜刚刚好。店内设计简约日式风，很适合拍照。周末会有live音乐，氛围超棒！人均50元左右。'
    },
    {
      id: 6,
      category: 'travel',
      title: '大理洱海骑行攻略｜环海路线推荐',
      image: 'https://picsum.photos/seed/6/400/580',
      likes: 18700,
      collects: 5600,
      user: '骑行爱好者',
      avatar: 'https://i.pravatar.cc/150?img=6',
      description: '洱海环海骑行是来大理必体验的项目！推荐路线：古城→喜洲→双廊→挖色→海东。全程约120公里，建议2天完成。租电动车更轻松，记得带防晒！沿途风景绝美，每个角度都是大片。必打卡：喜洲古镇、海舌公园、双廊古镇。住宿可选海景民宿，性价比高！'
    },
    {
      id: 7,
      category: 'food',
      title: '火锅爱好者｜重庆老火锅测评',
      image: 'https://picsum.photos/seed/7/400/490',
      likes: 11200,
      collects: 3400,
      user: '吃货小王',
      avatar: 'https://i.pravatar.cc/150?img=7',
      description: '作为火锅狂热爱好者，这家重庆老火锅必须推荐！牛油锅底香而不腻，麻辣适中。毛肚、鹅肠、黄喉必点，涮7-8秒最嫩。蘸料用香油+蒜泥+香菜，绝配！环境是老重庆风格，很有氛围感。服务周到，会主动提醒涮煮时间。人均100左右，性价比很高！'
    },
    {
      id: 8,
      category: 'life',
      title: '早餐仪式感｜10分钟快手营养早餐',
      image: 'https://picsum.photos/seed/8/400/530',
      likes: 13500,
      collects: 4200,
      user: '生活家小美',
      avatar: 'https://i.pravatar.cc/150?img=8',
      description: '不想早起也能吃到营养早餐！分享我的快手食谱：全麦吐司+煎蛋+牛油果，配上一杯燕麦拿铁。做法超简单：吐司烤2分钟，鸡蛋煎3分钟，牛油果切片。燕麦拿铁用即食燕麦+牛奶+浓缩咖啡。10分钟搞定，营养均衡又好吃！坚持吃早餐，一整天都有好状态！'
    },
    {
      id: 9,
      category: 'fashion',
      title: '职场穿搭｜通勤也能很时髦',
      image: 'https://picsum.photos/seed/9/400/560',
      likes: 16800,
      collects: 5100,
      user: '职场丽人',
      avatar: 'https://i.pravatar.cc/150?img=9',
      description: '职场穿搭不等于沉闷！分享我的通勤穿搭秘诀：西装外套选版型好的，立马提升气场；衬衫可以选择有设计感的，比如荷叶边、泡泡袖；下装推荐西裤或A字裙，显瘦又得体。配饰很重要：简约耳钉、细链项链、小方包。鞋子选择尖头低跟鞋，优雅又舒适。记住，自信是最好的穿搭！'
    },
    {
      id: 10,
      category: 'photography',
      title: '夜景拍摄教程｜城市光影魅力',
      image: 'https://picsum.photos/seed/10/400/590',
      likes: 22400,
      collects: 7200,
      user: '夜景大师',
      avatar: 'https://i.pravatar.cc/150?img=10',
      description: '夜景摄影是我最喜欢的题材！分享拍摄技巧：1. 使用三脚架保证稳定 2. 手动对焦确保清晰 3. ISO控制在800以内 4. 快门速度1-2秒拍流光 5. 白平衡调暖营造氛围。最佳时间是蓝调时刻，天空还有一丝蓝色。推荐地点：外滩、东方明珠、陆家嘴。后期适当提亮暗部，增强对比度。'
    },
    {
      id: 11,
      category: 'travel',
      title: '西藏自驾游攻略｜川藏线318国道',
      image: 'https://picsum.photos/seed/11/400/610',
      likes: 28900,
      collects: 9800,
      user: '自驾游达人',
      avatar: 'https://i.pravatar.cc/150?img=11',
      description: '川藏线被誉为"中国最美景观大道"！全程约2150公里，建议10-15天完成。必经景点：海螺沟、稻城亚丁、然乌湖、米堆冰川、林芝桃花沟。注意事项：提前做好高反准备，带上氧气瓶；检查车况，准备应急工具；预订沿途住宿；尊重当地文化。最佳时间5月或10月，风景最美！这是一次终生难忘的旅程！'
    },
    {
      id: 12,
      category: 'cafe',
      title: '上海咖啡地图｜魔都隐藏咖啡店',
      image: 'https://picsum.photos/seed/12/400/540',
      likes: 14200,
      collects: 4600,
      user: '咖啡猎人',
      avatar: 'https://i.pravatar.cc/150?img=12',
      description: '上海的咖啡文化太丰富了！今天推荐几家宝藏店：1. 永康路的手冲咖啡馆，豆子选择超多 2. 武康路的复古咖啡店，装修超有感觉 3. 田子坊的庭院咖啡馆，环境清幽。每家都有自己的特色，值得慢慢探索。推荐点：埃塞俄比亚日晒、哥伦比亚水洗，风味独特。周末约上好友，来一场咖啡之旅吧！'
    },
    {
      id: 13,
      category: 'food',
      title: '烘焙日记｜新手也能成功的蛋糕配方',
      image: 'https://picsum.photos/seed/13/400/520',
      likes: 17800,
      collects: 6200,
      user: '烘焙爱好者',
      avatar: 'https://i.pravatar.cc/150?img=13',
      description: '烘焙新手看过来！分享一个零失败的戚风蛋糕配方：鸡蛋5个、低筋面粉85g、玉米油40g、牛奶40g、细砂糖60g。关键步骤：蛋白打发至硬性发泡，面糊翻拌要轻柔，烤箱预热很重要。150度烤60分钟，出炉倒扣冷却。口感松软细腻，入口即化。失败原因通常是蛋白消泡或烘烤温度不对，多练习就能掌握！'
    },
    {
      id: 14,
      category: 'travel',
      title: '厦门鼓浪屿｜文艺青年必去景点',
      image: 'https://picsum.photos/seed/14/400/570',
      likes: 19600,
      collects: 6100,
      user: '文艺旅行者',
      avatar: 'https://i.pravatar.cc/150?img=14',
      description: '鼓浪屿真的太美了！建议早上乘船上岛，避开人潮。必打卡：日光岩看全景、菽庄花园看海、风琴博物馆听音乐、各种特色小店淘宝。美食推荐：叶氏麻糍、原巷口鱼丸、赵小姐馅饼。岛上禁止车辆，步行或租自行车游览。建议住一晚，感受夜晚的宁静。傍晚在海边看日落，超级浪漫！'
    },
    {
      id: 15,
      category: 'beauty',
      title: '护肤心得｜敏感肌的温和护肤之路',
      image: 'https://picsum.photos/seed/15/400/510',
      likes: 21300,
      collects: 7800,
      user: '护肤达人',
      avatar: 'https://i.pravatar.cc/150?img=15',
      description: '作为敏感肌，护肤真的要格外小心！分享我的护肤心得：1. 温和洁面，不过度清洁 2. 精简护肤步骤 3. 选择无香料、无酒精产品 4. 做好防晒 5. 避免频繁更换产品。推荐成分：神经酰胺修护、烟酰胺美白、透明质酸保湿。记住，皮肤屏障健康比什么都重要！养好皮肤是一场持久战，耐心很重要。'
    },
    {
      id: 16,
      category: 'photography',
      title: '樱花拍摄技巧｜春日限定浪漫',
      image: 'https://picsum.photos/seed/16/400/600',
      likes: 25700,
      collects: 8900,
      user: '樱花摄影师',
      avatar: 'https://i.pravatar.cc/150?img=16',
      description: '樱花季来了！分享我的拍摄心得：1. 选择晴天拍摄，光线柔和 2. 使用大光圈虚化背景 3. 尝试仰拍或俯拍角度 4. 寻找有趣的前景 5. 拍摄人像时让模特与樱花互动。推荐时间：上午9-10点或下午4-5点，光线最好。后期调整：提高饱和度让粉色更明显，增加亮度营造清新感。记录春天的美好时光！'
    },
    {
      id: 17,
      category: 'cafe',
      title: '北京咖啡探店｜胡同里的咖啡香',
      image: 'https://picsum.photos/seed/17/400/530',
      likes: 12800,
      collects: 3900,
      user: '胡同咖啡',
      avatar: 'https://i.pravatar.cc/150?img=17',
      description: '北京的咖啡文化越来越丰富了！今天推荐几家胡同咖啡馆：1. 南锣鼓巷的创意咖啡店 2. 五道营的庭院咖啡馆 3. 方家胡同的老字号。每家都保留了老北京的韵味，又融入了现代咖啡文化。推荐尝试：冷萃咖啡、手冲单品、创意拿铁。坐在四合院里喝咖啡，别有一番滋味。环境安静，很适合工作或阅读。'
    },
    {
      id: 18,
      category: 'life',
      title: '房间改造｜出租屋也能有温馨感',
      image: 'https://picsum.photos/seed/18/400/550',
      likes: 19200,
      collects: 6700,
      user: '改造达人',
      avatar: 'https://i.pravatar.cc/150?img=18',
      description: '出租屋也能装饰得很温馨！分享我的改造经验：1. 添加暖色系装饰，增加温暖感 2. 使用收纳盒整理物品 3. 挂上照片墙或挂画 4. 摆放绿植净化空气 5. 添加氛围灯营造情调。推荐好物：粘钩不伤墙、收纳筐、地毯、窗帘、抱枕。花小钱就能大变样，让租来的房子也有家的感觉！'
    },
    {
      id: 19,
      category: 'travel',
      title: '苏州园林｜江南水乡的诗意栖居',
      image: 'https://picsum.photos/seed/19/400/590',
      likes: 16400,
      collects: 5200,
      user: '园林爱好者',
      avatar: 'https://i.pravatar.cc/150?img=19',
      description: '苏州园林真的太美了！推荐路线：拙政园（最大最美）→狮子林（假山精妙）→留园（建筑精美）→虎丘（苏州地标）。游览建议：早上去人少，慢慢欣赏；租讲解器了解历史；穿汉服拍照超有感觉。美食推荐：松鹤楼的松鼠桂鱼、哑巴生煎、鸡头米。苏州的慢节奏生活让人放松，值得多待几天！'
    },
    {
      id: 20,
      category: 'food',
      title: '早茶文化｜广式早茶必点清单',
      image: 'https://picsum.photos/seed/20/400/500',
      likes: 14900,
      collects: 4500,
      user: '早茶爱好者',
      avatar: 'https://i.pravatar.cc/150?img=20',
      description: '广式早茶是一种生活态度！必点清单：虾饺（皮薄馅鲜）、烧卖（肉质紧实）、叉烧包（甜咸适中）、凤爪（软烂入味）、肠粉（滑嫩爽口）、流沙包（爆浆好吃）。推荐茶饮：普洱茶解腻、菊花茶清火。早茶礼仪：倒茶时敲桌示意感谢。周末约上家人朋友，一壶茶几笼点心，慢慢聊天，享受悠闲时光！'
    },
    {
      id: 21,
      category: 'beauty',
      title: '妆容教程｜日常淡妆简单上手',
      image: 'https://picsum.photos/seed/21/400/540',
      likes: 18600,
      collects: 6400,
      user: '美妆博主',
      avatar: 'https://i.pravatar.cc/150?img=21',
      description: '分享我的日常淡妆步骤：1. 妆前保湿很重要 2. 轻薄底妆打造透亮肌 3. 遮瑕膏点涂瑕疵处 4. 眉毛用眉笔填补空隙 5. 大地色眼影打造深邃感 6. 睫毛膏刷出卷翘效果 7. 腮红提升气色 8. 豆沙色口红温柔知性。整个过程15分钟搞定，清爽不厚重，适合日常通勤！'
    },
    {
      id: 22,
      category: 'photography',
      title: '街头摄影｜捕捉城市瞬间',
      image: 'https://picsum.photos/seed/22/400/580',
      likes: 23100,
      collects: 8200,
      user: '街拍摄影师',
      avatar: 'https://i.pravatar.cc/150?img=22',
      description: '街头摄影是我的最爱！分享一些心得：1. 保持相机随时待命 2. 观察有趣的光影 3. 捕捉人物情绪 4. 利用几何构图 5. 尝试不同角度。推荐镜头：35mm或50mm定焦，轻便灵活。拍摄技巧：预判构图、快速抓拍、尊重被摄者。最重要的是多走多看，发现生活中的美好瞬间。每张照片都是城市的故事！'
    },
    {
      id: 23,
      category: 'cafe',
      title: '深圳咖啡馆｜创意咖啡新体验',
      image: 'https://picsum.photos/seed/23/400/520',
      likes: 11500,
      collects: 3600,
      user: '咖啡创客',
      avatar: 'https://i.pravatar.cc/150?img=23',
      description: '深圳的咖啡文化很有创新精神！推荐几家特色店：1. 华侨城的艺术咖啡馆，定期有展览 2. 蛇口的海景咖啡店，风景绝佳 3. 车公庙的工业风咖啡馆，氛围独特。特色饮品：氮气冷萃、手冲单品、创意特调。这些店不仅咖啡好喝，环境也超适合拍照。周末来这里度过悠闲时光，感受都市慢生活！'
    },
    {
      id: 24,
      category: 'life',
      title: '周末vlog｜一个人的精致周末',
      image: 'https://picsum.photos/seed/24/400/560',
      likes: 15800,
      collects: 5300,
      user: '生活记录者',
      avatar: 'https://i.pravatar.cc/150?img=24',
      description: '一个人的周末也可以很精彩！我的周末routine：早上睡到自然醒，做一顿丰盛早午餐；下午去咖啡馆看书或工作；傍晚去公园散步或健身；晚上做个简单晚餐，看喜欢的电影或剧集；睡前护肤放松，准备迎接新一周。享受独处时光，与自己对话，充电后满血复活！记住，取悦自己最重要！'
    },
    {
      id: 25,
      category: 'beauty',
      title: '口红推荐｜显白色号大盘点',
      image: 'https://picsum.photos/seed/25/400/490',
      likes: 20400,
      collects: 7600,
      user: '口红收藏家',
      avatar: 'https://i.pravatar.cc/150?img=25',
      description: '作为口红爱好者，分享几个超显白的色号！1. 番茄红色：气色满分 2. 豆沙粉色：温柔知性 3. 枫叶红色：复古优雅 4. 梅子色：高级感满满 5. 正红色：气场强大。选色技巧：冷皮适合粉调，暖皮适合橘调。质地建议：日常选哑光或丝绒，约会选滋润或镜光。一支好口红能提升整体妆容，值得投资！'
    },
    {
      id: 26,
      category: 'travel',
      title: '日本京都｜古都的四季之美',
      image: 'https://picsum.photos/seed/26/400/600',
      likes: 27800,
      collects: 9200,
      user: '日本旅行',
      avatar: 'https://i.pravatar.cc/150?img=26',
      description: '京都一年四季都美！春天赏樱（清水寺、岚山）、夏天祇园祭、秋天赏枫（东福寺、永观堂）、冬天雪景（金阁寺）。必去景点：伏见稻荷大社（千鸟居）、岚山竹林、八坂神社、哲学之道。美食推荐：怀石料理、汤豆腐、抹茶甜品。建议穿和服游览，租赁店很多。京都的古典美让人流连忘返！'
    },
    {
      id: 27,
      category: 'food',
      title: '家常菜谱｜妈妈的味道红烧肉',
      image: 'https://picsum.photos/seed/27/400/530',
      likes: 13200,
      collects: 4800,
      user: '家常菜大师',
      avatar: 'https://i.pravatar.cc/150?img=27',
      description: '分享妈妈传授的红烧肉秘方！材料：五花肉500g、冰糖、生抽、老抽、料酒、姜葱、八角。做法：1. 五花肉焯水去腥 2. 炒糖色上色 3. 加入调料小火慢炖 4. 收汁至浓稠。秘诀：选肥瘦相间的五花肉、炖煮时间要足够（至少1小时）、最后大火收汁。肥而不腻，入口即化，配白米饭绝了！'
    },
    {
      id: 28,
      category: 'photography',
      title: '风光摄影｜山川湖海的壮丽画卷',
      image: 'https://picsum.photos/seed/28/400/610',
      likes: 26500,
      collects: 9100,
      user: '风光摄影师',
      avatar: 'https://i.pravatar.cc/150?img=28',
      description: '风光摄影是我的挚爱！分享拍摄经验：1. 提前查看天气和日出日落时间 2. 使用三脚架保证稳定 3. 尝试长曝光拍摄流水 4. 善用前景增强纵深感 5. 后期调整提升画面张力。推荐地点：青海湖、茶卡盐湖、香格里拉、喀纳斯。装备建议：广角镜头、渐变灰滤镜、偏振镜。大自然的壮美值得我们用心记录！'
    },
    {
      id: 29,
      category: 'life',
      title: '健身日记｜新手入门训练计划',
      image: 'https://picsum.photos/seed/29/400/550',
      likes: 17900,
      collects: 6300,
      user: '健身教练',
      avatar: 'https://i.pravatar.cc/150?img=29',
      description: '健身新手看过来！推荐入门训练计划：周一三五力量训练（深蹲、卧推、硬拉）、周二四有氧训练（慢跑、单车）、周六日拉伸放松。建议：1. 从轻重量开始，掌握正确姿势 2. 循序渐进增加强度 3. 保证充足睡眠 4. 合理饮食补充蛋白质 5. 坚持3个月看到效果。记住，健康比体型更重要！'
    },
    {
      id: 30,
      category: 'beauty',
      title: '发型推荐｜适合不同脸型的发型',
      image: 'https://picsum.photos/seed/30/400/570',
      likes: 19700,
      collects: 6900,
      user: '发型设计师',
      avatar: 'https://i.pravatar.cc/150?img=30',
      description: '选对发型很重要！脸型与发型匹配建议：圆脸→中长发S卷修饰，方脸→侧分长发柔和线条，长脸→空气刘海缩短比例，菱形脸→外翻卷增加宽度，鹅蛋脸→各种发型都适合。发色推荐：黑褐色显白、栗棕色温柔、蜜糖棕时尚。护发tips：定期修剪、使用护发精油、避免高温伤害。好的发型能提升颜值和气质！'
    }
  ];

  // 分类列表
  const categories = [
    { id: 'all', name: '发现', icon: Sparkles },
    { id: 'travel', name: '旅行', icon: MapPin },
    { id: 'food', name: '美食', icon: Utensils },
    { id: 'fashion', name: '时尚', icon: Shirt },
    { id: 'photography', name: '摄影', icon: Camera },
    { id: 'cafe', name: '咖啡', icon: Coffee },
    { id: 'life', name: '生活', icon: HomeIcon },
    { id: 'beauty', name: '美妆', icon: Sparkles }
  ];

  // 热门搜索建议
  const hotSearches = [
    '成都旅游攻略',
    '秋季穿搭分享',
    '咖啡馆探店',
    '美食打卡',
    '摄影技巧',
    '护肤心得'
  ];

  // 底部导航
  const bottomNavItems = [
    { id: 'home', name: '首页', icon: HomeIcon, active: true },
    { id: 'video', name: '视频', icon: Video, active: false },
    { id: 'publish', name: '发布', icon: Plus, active: false },
    { id: 'message', name: '消息', icon: MessageSquare, active: false },
    { id: 'profile', name: '我', icon: User, active: false }
  ];

  // 过滤数据
  const filteredData = mockData.filter(card => {
    const matchCategory = activeCategory === 'all' || card.category === activeCategory;
    const matchSearch = searchQuery === '' || card.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // 显示的卡片
  const displayedCards = filteredData.slice(0, displayCount);

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + 'w';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  // 滚动加载更多
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || isLoading) return;

      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      
      // 距离底部100px时触发加载
      if (scrollHeight - scrollTop - clientHeight < 100 && displayCount < filteredData.length) {
        setIsLoading(true);
        setTimeout(() => {
          setDisplayCount(prev => Math.min(prev + 6, filteredData.length));
          setIsLoading(false);
        }, 1000);
      }
    };

    const contentElement = contentRef.current;
    contentElement?.addEventListener('scroll', handleScroll);
    return () => contentElement?.removeEventListener('scroll', handleScroll);
  }, [displayCount, filteredData.length, isLoading]);

  // 重置显示数量
  useEffect(() => {
    setDisplayCount(12);
  }, [activeCategory, searchQuery]);

  // 切换主题
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // 打开详情
  const openModal = (card: CardData) => {
    setSelectedCard(card);
    setShowModal(true);
    document.body.style.overflow = 'hidden';
  };

  // 关闭详情
  const closeModal = () => {
    setShowModal(false);
    setSelectedCard(null);
    document.body.style.overflow = 'auto';
  };

  // 切换点赞
  const toggleLike = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 切换收藏
  const toggleCollect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollectedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div 
      className={`min-h-screen ${theme === 'dark' ? 'bg-[#1A1A1A]' : 'bg-white'} transition-colors duration-300`}
      style={{
        ['--primary-color' as any]: '#FF2442',
        ['--primary-hover' as any]: '#FF507A',
        ['--bg-color' as any]: theme === 'dark' ? '#1A1A1A' : '#FFFFFF',
        ['--secondary-bg' as any]: theme === 'dark' ? '#2A2A2A' : '#F8F8F8',
        ['--text-primary' as any]: theme === 'dark' ? '#EFEFEF' : '#333333',
        ['--text-secondary' as any]: theme === 'dark' ? '#AAAAAA' : '#666666',
        ['--text-light' as any]: theme === 'dark' ? '#777777' : '#999999',
        ['--border-color' as any]: theme === 'dark' ? '#333333' : '#EEEEEE',
        ['--shadow' as any]: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
        ['--shadow-hover' as any]: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.15)',
      }}
    >
      {/* 顶部导航栏 */}
      <header className="fixed top-0 left-0 right-0 z-[1000] h-[60px] px-5 bg-white/90 dark:bg-[#1A1A1A]/90 backdrop-blur-md border-b"
        style={{ borderBottomColor: 'var(--border-color)' }}>
        <div className="h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center mr-5 gap-2">
            <ShoppingBag className="w-6 h-6 text-[#FF2442]" />
            <span className="text-2xl font-bold text-[#FF2442] cursor-pointer">小红书</span>
          </div>

          {/* 搜索框 */}
          <div className="flex-1 max-w-[500px] relative mx-5">
            <div className="h-10 px-4 rounded-full flex items-center gap-2 transition-all duration-300"
              style={{ backgroundColor: 'var(--secondary-bg)' }}
              onFocus={() => setShowSearchSuggestions(true)}>
              <Search className="w-4 h-4" style={{ color: 'var(--text-light)' }} />
              <input
                type="text"
                placeholder="搜索你感兴趣的内容..."
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
              />
            </div>

            {/* 搜索建议 */}
            {showSearchSuggestions && (
              <div className="absolute top-[calc(100%+10px)] left-0 w-[90%] max-w-[500px] p-4 rounded-xl animate-[slideUp_0.3s_ease-out]"
                style={{
                  backgroundColor: 'var(--bg-color)',
                  boxShadow: 'var(--shadow-hover)'
                }}>
                <div className="flex items-center gap-1 text-xs mb-2" style={{ color: 'var(--text-light)' }}>
                  <TrendingUp className="w-3 h-3" />
                  <span>热门搜索</span>
                </div>
                <div className="flex flex-col gap-1">
                  {hotSearches.map((search, index) => (
                    <div
                      key={index}
                      className="px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-all duration-200 hover:scale-[1.02]"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--secondary-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => {
                        setSearchQuery(search);
                        setShowSearchSuggestions(false);
                      }}
                    >
                      {search}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 用户操作区 */}
          <div className="flex items-center gap-4">
            {/* 主题切换按钮 */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
              style={{ backgroundColor: 'var(--secondary-bg)' }}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* 用户头像 */}
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-[#FF2442] to-[#FF8C00] cursor-pointer transition-transform duration-300 hover:scale-110">
              <User className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </header>

      {/* 分类标签栏 */}
      <div className="fixed top-[60px] left-0 right-0 z-[999] h-[50px] overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{
          backgroundColor: 'var(--bg-color)',
          borderBottom: '1px solid var(--border-color)'
        }}>
        <div className="flex items-center gap-8 px-5 h-full min-w-max">
          {categories.map(category => (
            <div
              key={category.id}
              className="relative flex flex-col items-center justify-center py-1 cursor-pointer transition-all duration-300"
              onClick={() => setActiveCategory(category.id)}
            >
              <div className="flex items-center gap-1">
                <category.icon className="w-4 h-4" />
                <span
                  className={`text-[15px] transition-all duration-300 ${activeCategory === category.id ? 'font-semibold' : ''}`}
                  style={{ color: activeCategory === category.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {category.name}
                </span>
              </div>
              {activeCategory === category.id && (
                <div className="absolute bottom-0 w-5 h-0.5 bg-[#FF2442] rounded-full" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div
        ref={contentRef}
        className="pt-[110px] pb-20 md:pb-5 px-5 min-h-screen overflow-y-auto"
        style={{ backgroundColor: 'var(--secondary-bg)' }}
      >
        {/* 瀑布流网格 */}
        <div className="max-w-[1400px] mx-auto">
          <div className="grid gap-2.5 md:gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {displayedCards.map((card, index) => (
              <div
                key={card.id}
                className="rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 animate-[fadeIn_0.5s_ease-out]"
                style={{
                  backgroundColor: 'var(--bg-color)',
                  boxShadow: 'var(--shadow)',
                  animationDelay: `${index * 0.1}s`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--shadow-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--shadow)';
                }}
                onClick={() => openModal(card)}
              >
                {/* 图片 */}
                <div className="relative w-full aspect-[3/4] overflow-hidden">
                  <img
                    src={card.image}
                    alt={card.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>

                {/* 内容 */}
                <div className="p-3">
                  {/* 标题 */}
                  <h3 className="text-sm leading-[1.5] font-medium mb-2.5 line-clamp-2"
                    style={{ color: 'var(--text-primary)' }}>
                    {card.title}
                  </h3>

                  {/* 底部信息 */}
                  <div className="flex items-center justify-between">
                    {/* 统计 */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Heart className="w-3 h-3" style={{ color: 'var(--text-light)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-light)' }}>
                          {formatNumber(card.likes)}
                        </span>
                      </div>
                    </div>

                    {/* 用户头像 */}
                    <img
                      src={card.avatar}
                      alt={card.user}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 加载指示器 */}
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--text-light)' }}>
              <span>加载中</span>
              <span className="inline-block ml-2.5 w-5 h-5 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'var(--border-color)',
                  borderTopColor: '#FF2442'
                }} />
            </div>
          )}

          {/* 已加载全部 */}
          {!isLoading && displayCount >= filteredData.length && filteredData.length > 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-light)' }}>
              已加载全部内容
            </div>
          )}

          {/* 无结果 */}
          {filteredData.length === 0 && (
            <div className="text-center py-20 text-sm" style={{ color: 'var(--text-light)' }}>
              暂无相关内容
            </div>
          )}
        </div>
      </div>

      {/* 底部导航栏 (仅移动端) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[1000] h-[60px] flex items-center justify-around pb-safe"
        style={{
          backgroundColor: 'var(--bg-color)',
          borderTop: '1px solid var(--border-color)'
        }}>
          {bottomNavItems.map(item => (
          <div
            key={item.id}
            className="flex flex-col items-center gap-1 py-1.5 px-4 transition-all duration-300"
            style={{
              color: item.active ? '#FF2442' : 'var(--text-light)'
            }}
          >
            <item.icon className={`${item.id === 'publish' ? 'w-7 h-7 -translate-y-2' : 'w-6 h-6'}`} />
            <span className="text-[11px]">{item.name}</span>
          </div>
        ))}
      </div>

      {/* 模态框 */}
      {showModal && selectedCard && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 animate-[fadeIn_0.3s_ease-out] p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-[900px] lg:max-w-[1200px] max-h-[90vh] rounded-xl overflow-hidden animate-[slideUp_0.3s_ease-out] flex flex-col lg:flex-row"
            style={{ backgroundColor: 'var(--bg-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-xl transition-all duration-300 hover:bg-black/70 hover:rotate-90"
            >
              ✕
            </button>

            {/* 图片区域 */}
            <div className="w-full lg:w-[60%] max-h-[600px] lg:max-h-none flex items-center justify-center"
              style={{ backgroundColor: 'var(--secondary-bg)' }}>
              <img
                src={selectedCard.image}
                alt={selectedCard.title}
                className="w-full h-full object-contain"
              />
            </div>

            {/* 内容区域 */}
            <div className="w-full lg:w-[40%] p-5 overflow-y-auto">
              {/* 标题 */}
              <h2 className="text-xl font-semibold leading-[1.5] mb-4"
                style={{ color: 'var(--text-primary)' }}>
                {selectedCard.title}
              </h2>

              {/* 用户信息 */}
              <div className="flex items-center gap-2.5 mb-4">
                <img
                  src={selectedCard.avatar}
                  alt={selectedCard.user}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {selectedCard.user}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-light)' }}>
                    2小时前
                  </div>
                </div>
                <button className="px-5 py-1.5 rounded-full bg-[#FF2442] text-white text-sm font-medium hover:bg-[#FF507A] transition-colors">
                  关注
                </button>
              </div>

              {/* 描述 */}
              <p className="text-[15px] leading-[1.8] mb-5"
                style={{ color: 'var(--text-secondary)' }}>
                {selectedCard.description}
              </p>

              {/* 操作按钮 */}
              <div className="flex items-center gap-8 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  onClick={(e) => toggleLike(selectedCard.id, e)}
                  className="flex flex-col items-center gap-1 transition-transform hover:scale-110"
                >
                  <Heart 
                    className={`w-6 h-6 ${likedCards.has(selectedCard.id) ? 'animate-[heartBeat_0.6s_ease-in-out] fill-current' : ''}`}
                    style={{ color: likedCards.has(selectedCard.id) ? '#FF2442' : 'var(--text-secondary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatNumber(selectedCard.likes + (likedCards.has(selectedCard.id) ? 1 : 0))}
                  </span>
                </button>

                <button
                  onClick={(e) => toggleCollect(selectedCard.id, e)}
                  className="flex flex-col items-center gap-1 transition-transform hover:scale-110"
                >
                  <Star 
                    className={`w-6 h-6 ${collectedCards.has(selectedCard.id) ? 'animate-[heartBeat_0.6s_ease-in-out] fill-current' : ''}`}
                    style={{ color: collectedCards.has(selectedCard.id) ? '#FFB800' : 'var(--text-secondary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatNumber(selectedCard.collects + (collectedCards.has(selectedCard.id) ? 1 : 0))}
                  </span>
                </button>

                <button className="flex flex-col items-center gap-1 transition-transform hover:scale-110">
                  <MessageCircle className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>评论</span>
                </button>

                <button className="flex flex-col items-center gap-1 transition-transform hover:scale-110">
                  <Share2 className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>分享</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(50px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes heartBeat {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(1.1); }
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .pb-safe {
            padding-bottom: env(safe-area-inset-bottom);
          }
        }
      `}</style>
    </div>
  );
};

export default XiaohongshuDemo;


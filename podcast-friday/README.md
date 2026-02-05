# 🎙️ Podcast Friday

**每周五精选 8 集全球顶级思想播客，AI 中文摘要，一目了然。**

## 🔗 访问地址

**线上地址：** https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com/podcast-friday/

## 📁 项目结构

```
podcast-friday/
├── frontend/           # 前端静态文件
│   ├── index.html      # 主页面
│   ├── style.css       # 样式（移动端优先）
│   ├── app.js          # 前端逻辑（Vanilla JS）
│   └── data.json       # 数据文件（脚本生成）
├── scripts/
│   └── fetch-youtube-data.js  # 数据抓取+AI摘要生成
├── functions/
│   └── podcast-read/   # CloudBase 云函数（备用）
│       ├── index.js
│       ├── package.json
│       └── data.json
├── cloudbaserc.json    # CloudBase 配置
└── README.md
```

## 🚀 使用方法

### 更新数据（每周五运行）

```bash
cd mind-our-times/podcast-friday
node scripts/fetch-youtube-data.js
```

脚本会：
1. 从 16 个 YouTube 频道抓取过去 30 天的视频
2. 按时长、观看数、新鲜度综合评分
3. 限制每频道最多 2 集，选出 Top 8
4. 使用 OpenAI GPT-4o-mini 生成中文摘要
5. 输出到 `frontend/data.json`

### 部署

```bash
cd mind-our-times/podcast-friday
tcb hosting deploy frontend/ podcast-friday/ -e mind-our-times-3g7c3va270081e5c
```

### 本地预览

```bash
cd mind-our-times/podcast-friday/frontend
python3 -m http.server 3456
# 打开 http://localhost:3456
```

## 📡 数据源

16 个 YouTube 频道，覆盖 6 大领域：

| 领域 | 频道 |
|------|------|
| 🔧 技术 | Lex Fridman, Dwarkesh, a16z, ARK Invest, ML Street Talk |
| 🏛️ 政治 | Ezra Klein Show, Foreign Affairs, CFR, Brookings |
| 🤔 哲学 | Conversations with Tyler, Long Now, Santa Fe, Intelligence Squared |
| 💰 金融 | Real Vision, Bridgewater, All-In Podcast |

### 筛选规则

- **时间范围：** 过去 30 天
- **时长门槛：** ≥30 分钟（≥60 分钟有加分）
- **综合评分：** `log10(观看数) × 时长加分 × 新鲜度衰减`
- **多样性：** 每频道最多 2 集

## 🎨 设计语言

- **审美：** 知识分子风格，干净、高信息密度
- **色彩：** 黑白灰主色 + #FF6B35 橙色强调
- **字体：** Inter（英文）+ Noto Sans SC（中文）
- **布局：** 卡片式，移动端优先
- **交互：** 摘要折叠/展开，点击跳转 YouTube

## 🔧 技术栈

- **前端：** 纯 HTML/CSS/JS，零依赖
- **数据：** YouTube Data API v3 + OpenAI GPT-4o-mini
- **部署：** 腾讯 CloudBase 静态托管
- **云函数：** CloudBase（预留，当前使用静态 JSON）

## 💰 成本

- YouTube Data API：免费额度内（每次约 16×3 = ~48 requests）
- OpenAI：~$0.02/次更新（8 × gpt-4o-mini）
- CloudBase 托管：免费额度内

## 📋 TODO

- [ ] 自动化：设置 cron 每周五自动运行
- [ ] 云函数动态化：前端从云函数获取数据
- [ ] 往期存档：保留历史数据
- [ ] 社交分享：OG 图片生成

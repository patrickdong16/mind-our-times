# 🎙️ Podcast Friday — 播客日

**每周五精选 8 集全球顶级思想播客，GPT-4o 中文解读，一目了然。**

## 🔗 访问地址

- **主站播客日 Tab：** https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com/#podcast
- **独立页面：** https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com/podcast-friday/

## 📁 项目结构

```
podcast-friday/
├── frontend/              # 独立前端静态文件
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data.json          # 数据文件（脚本生成）
├── scripts/
│   └── fetch-youtube-data.js    # Node.js 版数据抓取
├── functions/
│   └── podcast-read/      # CloudBase 云函数
├── cloudbaserc.json
└── README.md

scripts/                    # Python 版脚本（推荐使用）
├── fetch-podcast-episodes.py     # YouTube API 抓取
├── generate-podcast-summaries.py # GPT-4o 摘要生成
├── recommend-podcast-topics.py   # 深度选题推荐
└── push-podcast-to-cloudbase.py  # 数据推送到 CloudBase

cloudbase/functions/        # CloudBase 云函数
├── articles-read/          # 已扩展：支持 podcast-latest/podcast-archive
└── podcast-write/          # 新增：写入 podcast_articles 集合
```

## 🚀 每周五更新流程

### 方法 A：Python 脚本（推荐）

```bash
# Step 1: 抓取 YouTube 数据
python3 scripts/fetch-podcast-episodes.py

# Step 2: 生成 GPT-4o 中文解读
python3 scripts/generate-podcast-summaries.py

# Step 3: 推荐 3 个深度选题给 DQ
python3 scripts/recommend-podcast-topics.py

# Step 4: 推送到 CloudBase
python3 scripts/push-podcast-to-cloudbase.py
```

### 方法 B：Node.js 脚本

```bash
cd mind-our-times/podcast-friday
node scripts/fetch-youtube-data.js
```

### 部署

```bash
# 部署主站 webapp（含播客日 tab）
cd mind-our-times/webapp && npm run build
tcb hosting deploy dist/ -e mind-our-times-3g7c3va270081e5c

# 部署独立播客页
tcb hosting deploy frontend/ podcast-friday/ -e mind-our-times-3g7c3va270081e5c

# 部署云函数
cd mind-our-times/cloudbase
tcb fn deploy articles-read -e mind-our-times-3g7c3va270081e5c --force
tcb fn deploy podcast-write -e mind-our-times-3g7c3va270081e5c --force
```

## 📡 数据源

16 个 YouTube 频道，覆盖 4 大领域：

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

## ☁️ 数据库 Schema

### podcast_articles 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | `podcast_{date}_{序号}` |
| date | string | 发布日期（周五 YYYY-MM-DD） |
| video_id | string | YouTube video ID |
| title | string | 中文标题 |
| title_original | string | 原标题 |
| channel | string | 频道名 |
| duration | string | 时长显示 |
| duration_minutes | number | 时长（分钟） |
| views | number | 观看数 |
| views_formatted | string | 观看数显示 |
| published_at | string | 发布时间 |
| thumbnail | string | 封面图 URL |
| summary_cn | string | 中文摘要 250-300字 |
| why_listen | string | 为什么值得听 50字 |
| domain | string | 领域（T/P/H/Φ/R/F） |
| youtube_url | string | YouTube 链接 |
| score | number | 综合评分 |
| created_at | string | 写入时间 |

## 🎨 设计语言

- **主站播客日 Tab：** 纽约客风格，衬线字体，大封面图卡片
- **独立页面：** 知识分子风格，无衬线，信息密集
- **共同点：** 移动端优先、暗色模式、点击跳转 YouTube
- **封面图：** 16:9 大图，领域标签 + 时长标签叠加

## 💰 成本

- YouTube Data API：免费额度内（每次约 48 requests）
- OpenAI GPT-4o：~$0.10/次更新（8 × GPT-4o）
- CloudBase：免费额度内

## 📋 TODO

- [ ] 自动化：设置 cron 每周五 06:00 自动运行
- [ ] 往期存档：保留历史播客数据
- [ ] 社交分享：OG 图片生成
- [ ] 字幕提取：用 yt-dlp 抓取字幕增强摘要质量

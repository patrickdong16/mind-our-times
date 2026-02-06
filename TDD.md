# Mind Our Times — 技术设计文档 (TDD)

> **版本**：v1.6  
> **日期**：2026-02-06  
> **对应需求**：REQUIREMENTS.md v1.6

### 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.6 | 2026-02-06 | **首发完成**：vote云函数上线、H5投票页（纽约客风格）、选题追踪数据库（topic-history.json） |
| v1.5 | 2026-02-06 | 投票问题设计规范（内核固定+形式轻松）、周五播客日运营规则（不生成RSS内容） |
| v1.4 | 2026-02-06 | 投票系统（H5页面+云函数）、选题结构化推荐、月度趋势报告 |
| v1.3 | 2026-02-06 | 短分析格式固化、thumbnail 字段（og:image 抓取）、图文卡片展示 |
| v1.2 | 2026-02-06 | 播客内容增强（intro+双语金句）、自动刷新机制、podcast-write 函数更新 |
| v1.1 | 2026-02-05 | 播客日功能、youtube-transcript-api 集成 |
| v1.0 | 2026-02-04 | 初版 |

---

## 一、项目结构

```
mind-our-times/
├── README.md
├── REQUIREMENTS.md
├── TDD.md
├── TESTING.md
│
├── cloudbase/                    # CloudBase 云函数
│   ├── functions/
│   │   ├── articles-write/       # 写入文章（Pepper 调用）
│   │   │   ├── index.js
│   │   │   └── package.json
│   │   ├── articles-read/        # 读取文章（Webapp 调用）
│   │   │   ├── index.js
│   │   │   └── package.json
│   │   ├── digest-write/         # 写入综述（Pepper 调用）
│   │   │   ├── index.js
│   │   │   └── package.json
│   │   ├── vote/                 # 投票 API（Phase 2）
│   │   │   ├── index.js
│   │   │   └── package.json
│   │   └── wechat/               # 微信公众号（Phase 2）
│   │       ├── index.js
│   │       └── package.json
│   └── cloudbaserc.json          # CloudBase 配置
│
├── webapp/                       # 静态前端
│   ├── index.html                # 单页应用
│   ├── style.css                 # 样式
│   ├── app.js                    # 逻辑
│   ├── config.js                 # API 地址等配置
│   └── assets/
│       └── favicon.ico
│
├── vote-h5/                      # H5 投票页（Phase 2）
│   ├── index.html
│   ├── style.css
│   └── vote.js
│
├── pepper/                       # Pepper 端脚本
│   ├── generate-daily.py         # 每日内容生成主脚本
│   ├── publish-cloudbase.py      # 写入 CloudBase API
│   ├── generate-digest.py        # 综述生成（Phase 2）
│   └── config.json               # RSS 源 + 领域配置
│
└── scripts/                      # 工具脚本
    ├── init-domains.js           # 初始化领域配置
    └── deploy.sh                 # 部署脚本
```

---

## 二、数据库设计 (CloudBase 云数据库)

CloudBase 云数据库是文档型数据库（类 MongoDB）。

### 2.1 集合：`domains`

领域配置，配置驱动。

```json
{
  "_id": "T",
  "name": "技术",
  "core_question": "AI 是否正在加剧社会分层？",
  "yes_label": "正在加剧",
  "no_label": "趋向普惠",
  "sort_order": 1,
  "active": true
}
```

**索引**：`sort_order`（排序用）

### 2.2 集合：`daily_articles`（v1.3 增强）

每日短分析，每条一个文档。**以 2026-02-04 为质量基准。**

```json
{
  "_id": "2026-02-04_T_001",
  "date": "2026-02-04",
  "domain": "T",
  "title": "掠食性霸权：特朗普如何挥舞美国权力",
  "author_name": "Stephen M. Walt",
  "author_intro": "哈佛大学肯尼迪学院国际关系讲席教授，当代国际关系现实主义学派最具影响力的学者之一",
  "source": "Foreign Affairs",
  "source_date": "2026-02-03",
  "source_url": "https://www.foreignaffairs.com/united-states/predatory-hegemon-walt",
  "thumbnail": "https://cdn.foreignaffairs.com/images/articles/2026/02/03/predatory-hegemon.jpg",
  "content": "摘要 300-400 字（背景+核心论点+关键数据，自然分段无小标题）...",
  "detail": "深度分析 500-700 字（分析框架、历史纵深、投资启示）...",
  "insight": "💭 题外话：100-200 字的时代洞察...",
  "created_at": "2026-02-04T06:00:00Z"
}
```

**字段说明（v1.3）：**
| 字段 | 说明 |
|------|------|
| thumbnail | 原文 og:image URL，用于图文卡片展示 |
| content | 摘要（300-400字），webapp 直接展示 |
| detail | 深度分析（500-700字），供详版/公众号使用 |
| source_date | 原文发布日期（YYYY-MM-DD） |

**索引**：
- `date`（按日期查询，最核心）
- `domain`（按领域筛选）
- `date + domain`（组合查询）

### 2.3 集合：`daily_digest`

每日综述，每天一条。

```json
{
  "_id": "digest_2026-02-04",
  "date": "2026-02-04",
  "title": "当算法开始决定谁值得被倾听",
  "content": "综述正文 1500-2500 字...",
  "vote_question": "OpenAI GPT-5 定价 $200/月，这是否在制造新的数字鸿沟？",
  "vote_domain": "T",
  "vote_yes_label": "正在加剧",
  "vote_no_label": "趋向普惠",
  "article_ids": ["2026-02-04_T_001", "2026-02-04_P_001", "2026-02-04_Φ_001"],
  "wechat_status": "draft",
  "created_at": "2026-02-04T06:30:00Z"
}
```

**索引**：`date`

### 2.4 集合：`votes`（Phase 2）

```json
{
  "_id": "vote_xxxxx",
  "digest_id": "digest_2026-02-04",
  "domain": "T",
  "vote": "yes",
  "voter_id": "fp_a1b2c3d4",
  "created_at": "2026-02-04T10:15:30Z"
}
```

**索引**：
- `digest_id`（单日统计）
- `domain + created_at`（趋势查询）
- `voter_id + digest_id`（防重复投票）

---

## 三、云函数 API 设计

### 3.1 articles-write（Pepper 写入）

**触发方式**：HTTP 调用  
**认证**：API Key（请求头 `x-api-key`）

```
POST /articles-write

Body:
{
  "date": "2026-02-04",
  "articles": [
    {
      "domain": "T",
      "title": "...",
      "author_name": "...",
      "author_intro": "...",
      "source": "...",
      "source_url": "...",
      "content": "...",
      "insight": "..."
    },
    ... (共 10 条)
  ]
}

Response:
{
  "success": true,
  "inserted": 10,
  "date": "2026-02-04"
}
```

**逻辑**：
1. 验证 API Key
2. 验证每条数据完整性（必填字段、字数）
3. 生成 `_id`：`{date}_{domain}_{序号}`
4. 检查该日期是否已有数据（幂等：有则覆盖）
5. 批量写入 `daily_articles`

### 3.2 articles-read（Webapp 读取）

**触发方式**：HTTP 调用  
**认证**：无（公开）

```
GET /articles-read?action=today
→ 返回今日全部文章 + 领域配置

GET /articles-read?action=archive&page=1&limit=20&domain=T
→ 返回往期文章（分页、领域筛选）

GET /articles-read?action=domains
→ 返回领域配置列表
```

**today 响应结构**：
```json
{
  "date": "2026-02-04",
  "domains": [
    {"id": "T", "name": "技术", ...}
  ],
  "articles": [
    {"domain": "T", "title": "...", ...}
  ],
  "total": 10
}
```

**archive 响应结构**：
```json
{
  "articles": [...],
  "total": 156,
  "page": 1,
  "pages": 8,
  "hasMore": true
}
```

### 3.3 digest-write（Phase 2）

```
POST /digest-write
Body: { date, title, content, vote_question, vote_domain, ... }
```

### 3.4 vote（Phase 2）

```
POST /vote
Body: { digest_id, vote: "yes"|"no", voter_id }

GET /vote?action=result&digest_id=xxx
→ { total: 234, yes: 145, no: 89, yes_pct: 62 }

GET /vote?action=trend&domain=T&days=90
→ [{ date: "2026-02-04", yes_pct: 62, total: 234 }, ...]
```

### 3.5 podcast-write（v1.1 新增）

**触发方式**：tcb fn invoke（Pepper 调用）  
**认证**：CloudBase 服务端凭证

```
POST /podcast-write
Body: {
  date: "2026-02-06",
  articles: [
    {
      video_id: "EV7WhVT270Q",
      title: "中文标题",
      title_original: "English Title",
      channel: "频道名",
      duration: "1小时30分钟",
      duration_minutes: 90,
      views: 423664,
      views_formatted: "424K",
      published_at: "2026-01-31T00:06:51Z",
      thumbnail: "https://...",
      intro: "开篇导语（80-120字）...",        // v1.2 新增
      summary_cn: "深度摘要（600-800字）...",
      why_listen: "一句话推荐...",
      key_quotes: [                           // v1.2 格式变更：中英双语
        { en: "English quote", cn: "中文翻译" }
      ],
      guest_bio: "嘉宾介绍（150-200字）...",
      domain: "T",
      focus: "深度访谈",
      youtube_url: "https://youtube.com/watch?v=...",
      score: 7.5,
      like_count: 10110
    }
  ]
}
```

**行为**：
1. 幂等：先删除该日期旧数据
2. 批量写入 `podcast_articles` 集合
3. 自动添加 `_id`（格式：`podcast_YYYY-MM-DD_001`）和 `created_at`

### 3.6 articles-read 扩展（v1.1）

**播客相关 actions：**

```
GET /articles-read?action=today
→ 周五时自动返回 podcast_articles 数据（contentType: "podcast"）

GET /articles-read?action=podcast-latest
→ 返回最新一期播客数据（按 created_at 排序）
```

**today 响应（周五）：**
```json
{
  "date": "2026-02-06",
  "contentType": "podcast",
  "articles": [
    { "intro": "...", "summary_cn": "...", "key_quotes": [...], ... }
  ],
  "domains": [...],
  "total": 8
}
```

---

## 四、Webapp 技术方案

### 4.1 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| 框架 | 无（Vanilla JS） | 极简、快速、零构建 |
| 样式 | 单文件 CSS | 移动端优先，纽约客风格 |
| 字体 | Noto Serif SC + Playfair Display | 中英文衬线，阅读体验好 |
| API 调用 | fetch() | 原生，零依赖 |
| 路由 | Hash 路由 (`#today` / `#archive`) | 单页应用，无服务端 |
| 暗色模式 | CSS `prefers-color-scheme` + 手动切换 | 跟随系统 + 用户选择 |

### 4.2 样式规范

```css
/* 核心变量 */
:root {
  --bg: #fafaf8;
  --card-bg: #ffffff;
  --text: #1a1a1a;
  --text-secondary: #4a4a4a;
  --text-muted: #8a8a8a;
  --accent: #c0392b;              /* 思想雷达红 */
  --border: #e8e8e8;
  --font-serif: 'Noto Serif SC', 'Playfair Display', Georgia, serif;
  --font-sans: -apple-system, 'PingFang SC', sans-serif;
  --max-width: 680px;             /* 阅读最佳宽度 */
  --spacing: 24px;
}

/* 暗色模式 */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --card-bg: #242424;
    --text: #e8e8e8;
    --text-secondary: #b0b0b0;
    --border: #333333;
  }
}
```

### 4.3 性能目标

| 指标 | 目标 |
|------|------|
| 首屏加载 | < 2 秒（国内网络） |
| HTML + CSS + JS 总大小 | < 50KB（不含字体） |
| API 响应 | < 500ms |
| Lighthouse Performance | > 90 |

### 4.4 缓存策略

- API 响应缓存：今日数据缓存 5 分钟，往期数据缓存 1 小时
- 静态资源：强缓存 + 版本号破缓存
- 领域配置：缓存 24 小时（极少变化）

### 4.5 自动刷新机制（v1.2 新增）

**目的**：用户长时间停留在页面时自动获取最新内容，避免看到旧数据

**实现方案**：

```javascript
// 配置
const CONFIG = {
  autoRefreshInterval: 5 * 60 * 1000  // 5分钟
};

// 启动自动刷新
function startAutoRefresh() {
  setInterval(() => {
    // 仅当页面可见且在"今日"Tab 时刷新
    if (document.visibilityState === 'visible' && state.currentTab === 'today') {
      silentRefresh();
    }
  }, CONFIG.autoRefreshInterval);
  
  // 页面重新可见时立即刷新
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.currentTab === 'today') {
      silentRefresh();
    }
  });
}

// 静默刷新
async function silentRefresh() {
  // 1. 清除缓存
  delete cache['today'];
  delete cache['podcast'];
  
  // 2. 请求最新数据
  const data = await callFunction('articles-read', { action: 'today' });
  
  // 3. 检测是否有更新（比较日期或文章数量）
  if (hasChanges(state.todayData, data)) {
    state.todayData = data;
    renderToday();
    showRefreshToast('内容已更新');  // Toast 提示
  }
}
```

**Toast 样式**：

```css
.refresh-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 0.85rem;
  opacity: 0;
  transition: all 0.3s ease;
  z-index: 1000;
}
.refresh-toast.show { opacity: 1; }
```

---

## 五、Pepper 脚本设计

### 5.1 generate-daily.py

基于现有 `daily-briefing.py` 改造：

```python
# 核心流程
def main():
    # 1. 加载 RSS 源配置
    sources = load_config("pepper/config.json")
    
    # 2. 抓取 RSS + 筛选
    candidates = fetch_and_filter(sources)
    
    # 3. AI 分析生成 10 篇短分析
    articles = generate_articles(candidates, count=10)
    
    # 4. 写入 CloudBase
    publish_to_cloudbase(articles)
    
    # 5. 通知 DQ
    notify_telegram("今日思想雷达已更新")
```

### 5.2 publish-cloudbase.py

```python
import requests

CLOUDBASE_API = "https://xxx.tcloudbaseapp.com/articles-write"
API_KEY = load_key(".config/api_keys/cloudbase")

def publish(articles, date):
    resp = requests.post(CLOUDBASE_API, json={
        "date": date,
        "articles": articles
    }, headers={"x-api-key": API_KEY})
    
    if resp.status_code == 200:
        result = resp.json()
        print(f"✅ Published {result['inserted']} articles for {date}")
    else:
        raise Exception(f"❌ Publish failed: {resp.text}")
```

### 5.3 thumbnail 抓取（v1.3 新增）

**目的**：为每篇文章抓取原文配图，用于 webapp 图文卡片和公众号文章

**抓取逻辑**：
```python
import urllib.request
import re

def fetch_og_image(url):
    """从 URL 抓取 og:image"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; Pepper/1.0)'
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')[:50000]
            
            # 优先级 1: og:image
            match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html)
            if not match:
                match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html)
            if match:
                return match.group(1)
            
            # 优先级 2: twitter:image
            match = re.search(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', html)
            if match:
                return match.group(1)
            
            return ""
    except:
        return ""
```

**集成到 cron 流程**：
1. AI 分析生成完 8-12 条文章后
2. 遍历每条，调用 `fetch_og_image(source_url)`
3. 将结果存入 `thumbnail` 字段
4. 抓取失败（超时/无图）时 thumbnail = ""，前端 graceful fallback

**脚本位置**：`scripts/fetch-og-image.py`（独立模块，供 cron agent 调用）

### 5.4 配置文件 (pepper/config.json)

沿用现有 `CONTENT_SOURCES.json` 格式，增加领域映射：

```json
{
  "domains": ["T", "P", "H", "Φ", "R", "F"],
  "daily_count": 10,
  "article_min_words": 300,
  "article_max_words": 400,
  "rssFeeds": { ... },
  "cloudbase_api": "https://xxx.tcloudbaseapp.com"
}
```

---

## 六、CloudBase 项目配置

### 6.1 cloudbaserc.json

```json
{
  "envId": "mind-our-times-xxxxx",
  "region": "ap-shanghai",
  "functionRoot": "cloudbase/functions",
  "functions": [
    {
      "name": "articles-write",
      "timeout": 30,
      "runtime": "Nodejs16.13",
      "handler": "index.main",
      "envVariables": {
        "API_KEY": "{{env.API_KEY}}"
      }
    },
    {
      "name": "articles-read",
      "timeout": 10,
      "runtime": "Nodejs16.13",
      "handler": "index.main"
    }
  ]
}
```

### 6.2 初始化脚本

```bash
# 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 创建环境（如果还没有）
tcb env:create --alias mind-our-times

# 部署云函数
tcb functions:deploy articles-write
tcb functions:deploy articles-read

# 部署静态网站
tcb hosting:deploy webapp/ -e mind-our-times-xxxxx

# 初始化领域数据
tcb functions:invoke init-domains
```

---

## 七、安全设计

| 层面 | 措施 |
|------|------|
| 写入 API | API Key 认证，仅 Pepper 持有 |
| 读取 API | 公开，无需认证 |
| 投票 API | 频率限制（同一 voter_id 每日每题限 1 次） |
| 数据库 | CloudBase 安全规则：读公开，写需认证 |
| 公众号 | AppSecret 存 CloudBase 环境变量 |
| CORS | 白名单：webapp 域名 + 公众号 H5 域名 |

---

## 八、监控与运维

| 项目 | 方案 |
|------|------|
| 内容生成失败 | Pepper 脚本异常 → Telegram 告警 DQ |
| API 健康检查 | 每日 cron 检查 API 可用性 |
| 数据库备份 | CloudBase 自动备份（每日） |
| 错误日志 | CloudBase 云函数日志（控制台查看） |
| 内容缺失检测 | Pepper 写入后校验返回的 inserted 数量 |

---

## 九、Phase 1 实施步骤

按执行顺序：

| 步骤 | 任务 | 估时 |
|------|------|------|
| 1 | 创建 GitHub repo `mind-our-times` | 5 min |
| 2 | CloudBase 项目初始化 + 创建云数据库集合 | 30 min |
| 3 | 开发 articles-write 云函数 | 1h |
| 4 | 开发 articles-read 云函数 | 1h |
| 5 | 初始化 domains 数据 | 15 min |
| 6 | Webapp 开发（今日 Tab） | 3h |
| 7 | Webapp 开发（往期 Tab） | 2h |
| 8 | Pepper 脚本改造 | 2h |
| 9 | Vercel 测试部署 + 联调 | 1h |
| 10 | CloudBase 静态托管部署 | 30 min |
| 11 | 端到端测试（Pepper 生成 → API → Webapp 展示） | 1h |
| 12 | Telegram 通知降级 | 30 min |

**Phase 1 总估时：~12 小时开发**

---

*本文件是 Mind Our Times 的技术设计文档，与 REQUIREMENTS.md 配套使用。*

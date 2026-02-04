# Mind Our Times — 技术设计文档 (TDD)

> **版本**：v1.0  
> **日期**：2026-02-04  
> **对应需求**：REQUIREMENTS.md v1.0

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

### 2.2 集合：`daily_articles`

每日短分析，每条一个文档。

```json
{
  "_id": "2026-02-04_T_001",
  "date": "2026-02-04",
  "domain": "T",
  "title": "GPT-5 定价策略的阶层含义",
  "author_name": "Sam Altman",
  "author_intro": "OpenAI CEO，全球 AI 竞赛的核心推动者",
  "source": "2026年2月3日 · OpenAI Blog",
  "source_url": "https://openai.com/blog/gpt-5",
  "content": "正文 300-400 字...",
  "insight": "当技术的价格标签开始决定谁能思考、谁不能思考，我们离赛博朋克还有多远？",
  "created_at": "2026-02-04T06:00:00Z"
}
```

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

### 5.3 配置文件 (pepper/config.json)

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

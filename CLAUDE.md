# Mind Our Times — 项目规则

> 本文件是项目级编码规则，补充全局规范 `GEMINI.md`（宪法）。  
> 如有冲突，以 `GEMINI.md` 为准。

---

## 📋 文档索引

| 文档 | 内容 | 状态 |
|------|------|------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 产品需求规格书 | ✅ v1.0 |
| [TDD.md](./TDD.md) | 技术设计文档 | ✅ v1.0 |
| [TESTING.md](./TESTING.md) | 测试规范 | ✅ v1.0 |
| [GEMINI.md](../gemini-config/GEMINI.md) | 全局开发规范（宪法） | ✅ 参照 |

---

## 📁 项目结构

```
mind-our-times/
├── REQUIREMENTS.md           # 需求
├── TDD.md                    # 技术设计
├── TESTING.md                # 测试规范
├── CLAUDE.md                 # 本文件
├── README.md                 # 项目说明
│
├── cloudbase/                # CloudBase 云函数
│   ├── functions/
│   │   ├── articles-write/   # 写入 API
│   │   ├── articles-read/    # 读取 API
│   │   ├── digest-write/     # 综述写入 (Phase 2)
│   │   ├── vote/             # 投票 API (Phase 2)
│   │   └── wechat/           # 微信公众号 (Phase 2)
│   └── cloudbaserc.json
│
├── webapp/                   # 静态前端
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── config.js
│
├── pepper/                   # Pepper 端脚本
│   ├── generate-daily.py
│   ├── publish-cloudbase.py
│   └── config.json
│
└── scripts/                  # 工具脚本
    ├── init-domains.js
    ├── test-api.sh
    └── deploy.sh
```

---

## 🔧 技术栈偏差说明

本项目技术栈与 GEMINI.md 默认推荐不同，原因如下：

| 组件 | GEMINI.md 推荐 | 本项目选择 | 理由 |
|------|----------------|------------|------|
| 前端 | Next.js + Tailwind | 纯 HTML/CSS/JS | 极简、零构建、移动端加载快 |
| 后端 | FastAPI + PostgreSQL | CloudBase 云函数 + 云数据库 | 国内部署、一站式、免费额度 |
| 样式 | Tailwind CSS | 手写 CSS | 代码量极小，无需框架 |

**但以下规则不变（强制遵守）：**
- API 响应格式：`{ success, data?, error? }`
- 所有网络请求：timeout + retry
- 零硬编码密钥
- 环境变量管理

---

## 🚨 项目特有规则

### 1. 内容真实性（零容忍）

与 Thoughts-hunter 同级规则，继承不减：
- 禁止虚构 URL、作者、日期、引用
- source_url 必须真实可访问
- author_name 必须是真实人物
- 不确定就不发布

### 2. CloudBase 操作规范

- **部署前确认环境**：`tcb env:list` 打印当前环境 ID
- **生产数据库操作**：必须先告知 DQ
- **云函数更新**：先在测试环境验证，再部署生产
- 环境变量通过 CloudBase 控制台设置，不写入代码

### 3. Webapp 性能约束

- HTML + CSS + JS 总大小 < 50KB（不含字体）
- 无第三方 JS 框架依赖
- 首屏加载 < 2 秒（国内网络）
- 图片懒加载（如有）

### 4. Pepper 脚本规范

- Python 3.10+
- 所有 HTTP 请求：`timeout=10`, `retries=3`
- 写入失败必须 Telegram 告警
- 脚本异常退出码非零

---

## 🧪 常用命令

### 本地开发

```bash
# Webapp 本地预览
cd webapp && python3 -m http.server 8080

# 测试云函数 API
bash scripts/test-api.sh

# 初始化领域数据
cd cloudbase && tcb functions:invoke init-domains
```

### 部署

```bash
# 部署云函数
cd cloudbase && tcb functions:deploy articles-write
cd cloudbase && tcb functions:deploy articles-read

# 部署 Webapp 到 CloudBase
tcb hosting:deploy webapp/ -e <env-id>

# 部署 Webapp 到 Vercel（测试）
cd webapp && vercel --prod
```

### Pepper 端

```bash
# 手动触发内容生成
python3 pepper/generate-daily.py

# 手动写入 CloudBase
python3 pepper/publish-cloudbase.py --date 2026-02-04

# 测试生成（不写入，只输出）
python3 pepper/generate-daily.py --dry-run
```

---

## 📝 变更规范

1. 需求变更 → 先改 REQUIREMENTS.md → 再改代码
2. 架构变更 → 先改 TDD.md → 再改代码
3. 每次变更后检查 TESTING.md 是否需要更新
4. 本文件（CLAUDE.md）随项目演进持续更新

---

*本文件仅对 Mind Our Times 项目生效。*

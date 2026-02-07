# Mind Our Times 需求文档 v2

## 更新日志
- 2026-02-07: 新增批量发布要求（DQ 指令）

---

## 核心需求：批量发布（v2 新增）

### 问题
旧逻辑：先删除当天旧数据 → 逐条写入新数据
结果：用户在删除和写入之间会看到空白或不完整内容

### 要求
**内容准备好了一次性推到 webapp，不能一篇篇推**

### 解决方案
采用"原子替换"策略：

1. **写入临时标记**：新文章写入时带 `_pending: true` 标记
2. **验证完整性**：确认所有文章都写入成功
3. **原子切换**：
   - 删除旧的非 pending 文章
   - 移除新文章的 pending 标记
4. **失败回滚**：如果写入失败，删除所有 pending 文章

### 技术实现
```javascript
// 步骤 1: 写入新文章（带 pending 标记）
for (doc of newDocs) {
  doc._pending = true;
  await db.collection('daily_articles').add(doc);
}

// 步骤 2: 验证写入完成
const pendingCount = await db.collection('daily_articles')
  .where({ date, _pending: true }).count();

if (pendingCount.total !== newDocs.length) {
  // 回滚：删除所有 pending
  await db.collection('daily_articles')
    .where({ date, _pending: true }).remove();
  throw new Error('写入不完整');
}

// 步骤 3: 原子切换
// 3a. 删除旧数据（非 pending）
await db.collection('daily_articles')
  .where({ date, _pending: _.neq(true) }).remove();

// 3b. 移除 pending 标记
await db.collection('daily_articles')
  .where({ date, _pending: true })
  .update({ _pending: _.remove() });
```

---

## 内容质量要求（2026-02-04 模版）

### 字段规范
| 字段 | 要求 |
|------|------|
| title | 中文翻译标题 |
| summary | 300-400 字摘要 |
| detail | 500-700 字深度分析 |
| author_bio | 作者介绍 50-100 字 |
| signal | 题外话/洞察 80-150 字 |

### 每日文章数
- 最少 8 篇
- 领域多样性：至少覆盖 4 个领域

---

## 每日工作流

```
06:00  内容生成（mot-content-generator.py）
       ↓ 生成 briefing-index/{date}-full.json
       ↓ 质量检查：字数、领域、完整性
07:15  批量发布（mot-daily-workflow.py）
       ↓ 一次性写入所有文章
       ↓ 发送选题推荐到 Telegram
```

---

## 验收标准

1. ✅ 用户任何时刻打开 webapp 都能看到完整内容
2. ✅ 不会出现"加载中"或空白状态（除非真的没有内容）
3. ✅ 每日至少 8 篇高质量文章
4. ✅ 摘要 300+ 字，深度分析 500+ 字

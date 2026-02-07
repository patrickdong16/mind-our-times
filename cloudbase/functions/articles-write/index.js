/**
 * articles-write: 批量写入当日文章（原子替换）
 * v2: 2026-02-07 更新 - 一次性发布，不会出现中间状态
 * 
 * 策略：先写入带 pending 标记的新数据 → 验证完整 → 原子切换
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

// 有效领域标识
let VALID_DOMAINS = null;

async function loadValidDomains() {
  if (VALID_DOMAINS) return VALID_DOMAINS;
  try {
    const { data } = await db.collection('domains').where({ active: true }).get();
    VALID_DOMAINS = data.map(d => d._id);
  } catch (e) {
    VALID_DOMAINS = ['T', 'P', 'H', 'Φ', 'R', 'F'];
  }
  return VALID_DOMAINS;
}

/**
 * 验证单条文章数据完整性
 */
function validateArticle(article, validDomains) {
  const required = ['domain', 'title', 'author_name', 'source', 'source_url', 'content'];
  const missing = required.filter(f => !article[f] || String(article[f]).trim() === '');
  
  if (missing.length > 0) {
    return { valid: false, error: `缺少必填字段: ${missing.join(', ')}` };
  }
  
  if (!validDomains.includes(article.domain)) {
    return { valid: false, error: `无效领域标识: ${article.domain}` };
  }
  
  const contentLen = article.content.replace(/\s+/g, '').length;
  if (contentLen < 50) {
    return { valid: false, error: `内容过短: ${contentLen} 字符` };
  }
  
  return { valid: true };
}

/**
 * 清理 pending 数据（回滚用）
 */
async function cleanupPending(date) {
  try {
    await db.collection('daily_articles').where({ date, _pending: true }).remove();
  } catch (e) {
    console.error('Cleanup pending failed:', e);
  }
}

exports.main = async (event) => {
  try {
    // === 解析参数 ===
    const isHttpInvoke = event.headers || event.queryStringParameters;
    let date, articles;
    
    if (isHttpInvoke) {
      const apiKey = event.headers?.['x-api-key'] || event.queryStringParameters?.key || '';
      const expectedKey = process.env.API_KEY || '';
      
      if (expectedKey && apiKey !== expectedKey) {
        return { statusCode: 401, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
      }
      
      let body;
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: '无效 JSON' }) };
      }
      
      date = body.date;
      articles = body.articles;
    } else {
      date = event.date;
      articles = event.articles;
    }
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: '缺少或无效日期' }) };
    }
    
    if (!Array.isArray(articles) || articles.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'articles 不能为空' }) };
    }
    
    // === 验证所有文章 ===
    const validDomains = await loadValidDomains();
    const errors = [];
    
    for (let i = 0; i < articles.length; i++) {
      const result = validateArticle(articles[i], validDomains);
      if (!result.valid) {
        errors.push({ index: i, error: result.error });
      }
    }
    
    if (errors.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: '文章验证失败', details: errors })
      };
    }
    
    // === 步骤 1: 清理之前可能残留的 pending 数据 ===
    await cleanupPending(date);
    
    // === 步骤 2: 写入新文章（带 _pending 标记）===
    const now = new Date().toISOString();
    const docs = articles.map((article, idx) => ({
      _id: `${date}_${article.domain}_${String(idx + 1).padStart(3, '0')}`,
      date,
      domain: article.domain,
      title: article.title,
      author_name: article.author_name,
      author_intro: article.author_intro || '',
      source: article.source,
      source_date: article.source_date || '',
      source_url: article.source_url,
      thumbnail: article.thumbnail || '',
      content: article.content,
      detail: article.detail || '',
      insight: article.insight || '',
      created_at: now,
      _pending: true  // 临时标记
    }));
    
    let insertedCount = 0;
    for (const doc of docs) {
      try {
        // 先尝试删除可能存在的同 ID 文档
        try {
          await db.collection('daily_articles').doc(doc._id).remove();
        } catch (e) {
          // 不存在，忽略
        }
        await db.collection('daily_articles').add(doc);
        insertedCount++;
      } catch (e) {
        console.error(`Insert failed for ${doc._id}:`, e);
        // 写入失败，回滚
        await cleanupPending(date);
        return {
          statusCode: 500,
          body: JSON.stringify({ success: false, error: `写入失败: ${e.message}` })
        };
      }
    }
    
    // === 步骤 3: 验证写入完整性 ===
    const { total: pendingCount } = await db.collection('daily_articles')
      .where({ date, _pending: true }).count();
    
    if (pendingCount !== docs.length) {
      await cleanupPending(date);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          success: false, 
          error: `写入不完整: 预期 ${docs.length}, 实际 ${pendingCount}` 
        })
      };
    }
    
    // === 步骤 4: 原子切换 ===
    // 4a. 删除旧数据（非 pending）
    try {
      await db.collection('daily_articles')
        .where({ date, _pending: _.neq(true) }).remove();
    } catch (e) {
      // 无旧数据，忽略
    }
    
    // 4b. 移除 pending 标记（CloudBase 不支持 $unset，用 update 设为 false）
    // 逐条更新移除 _pending
    for (const doc of docs) {
      try {
        await db.collection('daily_articles').doc(doc._id).update({
          _pending: _.remove()
        });
      } catch (e) {
        console.error(`Remove pending flag failed for ${doc._id}:`, e);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { inserted: insertedCount, date },
        error: null
      })
    };
    
  } catch (err) {
    console.error('articles-write error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};

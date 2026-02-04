/**
 * articles-write: 批量写入当日文章
 * Pepper 通过 HTTP 调用，需 API Key 认证
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

// 有效领域标识（配置驱动，从 domains 集合读取）
let VALID_DOMAINS = null;

async function loadValidDomains() {
  if (VALID_DOMAINS) return VALID_DOMAINS;
  try {
    const { data } = await db.collection('domains').where({ active: true }).get();
    VALID_DOMAINS = data.map(d => d._id);
  } catch (e) {
    // 降级：使用默认领域
    VALID_DOMAINS = ['T', 'P', 'H', 'Φ', 'R', 'F'];
  }
  return VALID_DOMAINS;
}

/**
 * 验证单条文章数据完整性
 */
function validateArticle(article, validDomains) {
  const required = ['domain', 'title', 'author_name', 'author_intro', 'source', 'source_url', 'content', 'insight'];
  const missing = required.filter(f => !article[f] || String(article[f]).trim() === '');
  
  if (missing.length > 0) {
    return { valid: false, error: `缺少必填字段: ${missing.join(', ')}` };
  }
  
  if (!validDomains.includes(article.domain)) {
    return { valid: false, error: `无效领域标识: ${article.domain}` };
  }
  
  // 内容字数检查（中文字符 + 英文单词混合计数）
  const contentLen = article.content.replace(/\s+/g, '').length;
  if (contentLen < 100) {
    return { valid: false, error: `内容过短: ${contentLen} 字符（最少 100）` };
  }
  
  return { valid: true };
}

exports.main = async (event) => {
  try {
    // === 认证 ===
    const apiKey = event.headers?.['x-api-key'] || event.queryStringParameters?.key || '';
    const expectedKey = process.env.API_KEY || '';
    
    if (!expectedKey) {
      return { statusCode: 500, body: JSON.stringify({ success: false, error: 'API_KEY 未配置' }) };
    }
    
    if (apiKey !== expectedKey) {
      return { statusCode: 401, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
    }
    
    // === 解析请求体 ===
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: '无效 JSON' }) };
    }
    
    const { date, articles } = body || {};
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: '缺少或无效日期（格式 YYYY-MM-DD）' }) };
    }
    
    if (!Array.isArray(articles) || articles.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'articles 不能为空数组' }) };
    }
    
    // === 验证每条文章 ===
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
    
    // === 幂等写入：先删除当天旧数据 ===
    try {
      await db.collection('daily_articles').where({ date }).remove();
    } catch (e) {
      // 集合不存在或无数据，忽略
    }
    
    // === 批量写入 ===
    const now = new Date().toISOString();
    const docs = articles.map((article, idx) => ({
      _id: `${date}_${article.domain}_${String(idx + 1).padStart(3, '0')}`,
      date,
      domain: article.domain,
      title: article.title,
      author_name: article.author_name,
      author_intro: article.author_intro,
      source: article.source,
      source_url: article.source_url,
      content: article.content,
      insight: article.insight,
      created_at: now
    }));
    
    // CloudBase 批量添加（每次最多 20 条）
    let inserted = 0;
    const batchSize = 20;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      for (const doc of batch) {
        try {
          await db.collection('daily_articles').add(doc);
          inserted++;
        } catch (e) {
          // 如果 _id 冲突，先删再加（幂等）
          if (e.code === 'DATABASE_DOCUMENT_EXIST') {
            await db.collection('daily_articles').doc(doc._id).remove();
            await db.collection('daily_articles').add(doc);
            inserted++;
          } else {
            throw e;
          }
        }
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { inserted, date },
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

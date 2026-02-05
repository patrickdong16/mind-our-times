/**
 * podcast-write: 写入播客日数据到 podcast_articles 集合
 * 
 * 调用参数：
 *   date: "YYYY-MM-DD" (发布日期)
 *   articles: [...] (播客文章数组)
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();

exports.main = async (event) => {
  try {
    const { date, articles } = event;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false, error: '缺少或无效日期' };
    }
    
    if (!Array.isArray(articles) || articles.length === 0) {
      return { success: false, error: 'articles 不能为空' };
    }
    
    // 确保集合存在
    try {
      await db.createCollection('podcast_articles');
      console.log('Created podcast_articles collection');
    } catch (e) {
      // 集合已存在，忽略
      if (!e.message || !e.message.includes('already exists')) {
        console.log('createCollection note:', e.message);
      }
    }
    
    // 幂等：先删除当天旧数据
    try {
      await db.collection('podcast_articles').where({ date }).remove();
    } catch (e) {
      // 无数据，忽略
      console.log('remove old data note:', e.message);
    }
    
    // 写入新数据
    const now = new Date().toISOString();
    let inserted = 0;
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const doc = {
        _id: `podcast_${date}_${String(i + 1).padStart(3, '0')}`,
        date,
        video_id: article.video_id || article.videoId || '',
        title: article.title || '',
        title_original: article.title_original || article.title || '',
        channel: article.channel || article.channelName || '',
        duration: article.duration || '',
        duration_minutes: article.duration_minutes || 0,
        views: article.views || article.viewCount || 0,
        views_formatted: article.views_formatted || article.viewCountFormatted || '',
        published_at: article.published_at || article.publishedAt || '',
        thumbnail: article.thumbnail || '',
        summary_cn: article.summary_cn || article.summary || '',
        why_listen: article.why_listen || '',
        domain: article.domain || 'T',
        focus: article.focus || '',
        youtube_url: article.youtube_url || article.youtubeUrl || '',
        score: article.score || 0,
        like_count: article.like_count || article.likeCount || 0,
        created_at: now,
      };
      
      try {
        await db.collection('podcast_articles').add(doc);
        inserted++;
      } catch (e) {
        if (e.code === 'DATABASE_DOCUMENT_EXIST') {
          await db.collection('podcast_articles').doc(doc._id).remove();
          await db.collection('podcast_articles').add(doc);
          inserted++;
        } else {
          console.error(`Failed to write doc ${i}:`, e.message);
        }
      }
    }
    
    return {
      success: true,
      data: { inserted, date, total: articles.length },
    };
    
  } catch (err) {
    console.error('podcast-write error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * podcast-read: CloudBase 云函数
 * 返回 Podcast Friday 数据
 */
const cloud = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();

exports.main = async (event, context) => {
  try {
    const action = event.action || 'latest';
    
    if (action === 'latest') {
      // Try database first
      try {
        const { data } = await db.collection('podcast_friday')
          .orderBy('generatedAt', 'desc')
          .limit(1)
          .get();
        
        if (data && data.length > 0) {
          return { success: true, data: data[0] };
        }
      } catch (dbErr) {
        console.log('DB read failed, falling back to static data:', dbErr.message);
      }
      
      // Fallback: static JSON file
      const filePath = path.resolve(__dirname, 'data.json');
      if (fs.existsSync(filePath)) {
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return { success: true, data: jsonData };
      }
      
      return { success: false, error: '暂无数据' };
    }
    
    return { success: false, error: 'Unknown action' };
  } catch (e) {
    console.error('podcast-read error:', e);
    return { success: false, error: e.message };
  }
};

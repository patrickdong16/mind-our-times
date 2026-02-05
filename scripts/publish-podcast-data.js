#!/usr/bin/env node
/**
 * 将 podcast data.json 发布到 CloudBase podcast_articles 集合
 * 通过调用 podcast-write 云函数
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'mind-our-times-3g7c3va270081e5c';
const DATA_FILE = path.join(__dirname, '..', 'podcast-friday', 'frontend', 'data.json');

// 读取数据
const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
const episodes = rawData.episodes || [];

// 计算播客日日期（下一个周五）
function getNextFriday() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + (day <= 5 ? (5 - day) : daysUntilFriday));
  return friday.toISOString().split('T')[0];
}

// 使用今天的日期作为发布日期
const today = new Date().toISOString().split('T')[0];
const podcastDate = today; // 2026-02-05

// 转换格式
const articles = episodes.map(ep => ({
  video_id: ep.videoId,
  title: ep.title_cn || ep.title,
  title_original: ep.title,
  channel: ep.channelName,
  duration: ep.durationFormatted,
  duration_minutes: ep.duration,
  views: ep.viewCount,
  views_formatted: ep.viewCountFormatted,
  published_at: ep.publishedAt,
  thumbnail: ep.thumbnail,
  summary_cn: ep.summary_cn || ep.summary,
  why_listen: ep.why_listen || '',
  domain: ep.domain,
  focus: ep.focus || '',
  youtube_url: ep.youtubeUrl,
  score: ep.score,
  like_count: ep.likeCount,
}));

console.log(`📡 Publishing ${articles.length} podcast episodes for ${podcastDate}`);
articles.forEach((a, i) => {
  console.log(`  ${i+1}. [${a.domain}] ${a.title.substring(0, 50)}...`);
});

// 调用 tcb 命令行来调用云函数
const { execSync } = require('child_process');
const payload = JSON.stringify({ date: podcastDate, articles });

// 写入临时文件
const tmpFile = '/tmp/podcast-payload.json';
fs.writeFileSync(tmpFile, payload);

try {
  const result = execSync(
    `tcb fn invoke podcast-write --envId ${ENV_ID} --params '${payload.replace(/'/g, "'\\''")}'`,
    { encoding: 'utf-8', timeout: 60000 }
  );
  console.log('\n📤 Cloud function response:');
  console.log(result);
} catch (e) {
  console.error('tcb invoke failed:', e.message);
  console.log('\n尝试 HTTP API 方式...');
  
  // Fallback: HTTP request to cloud function
  const postData = JSON.stringify({
    date: podcastDate,
    articles: articles
  });
  
  const options = {
    hostname: `${ENV_ID}.service.tcloudbase.com`,
    port: 443,
    path: '/podcast-write',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('HTTP response:', res.statusCode);
      console.log('Body:', data);
    });
  });
  
  req.on('error', (err) => {
    console.error('HTTP request failed:', err.message);
  });
  
  req.write(postData);
  req.end();
}

fs.unlinkSync(tmpFile);
console.log('\n✅ Done!');

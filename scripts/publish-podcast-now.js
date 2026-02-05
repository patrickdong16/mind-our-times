#!/usr/bin/env node
/**
 * Publish podcast data to CloudBase via podcast-write function
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'mind-our-times-3g7c3va270081e5c';
const DATA_FILE = path.join(__dirname, '..', 'podcast-friday', 'frontend', 'data.json');

// Read data
const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
const episodes = rawData.episodes || [];

// Date for the podcast (upcoming Friday: 2026-02-07)
const podcastDate = '2026-02-07';

// Convert to podcast_articles format
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
  console.log(`  ${i+1}. [${a.domain}] ${(a.title || '').substring(0, 60)}...`);
});

// Write payload to temp file
const payload = { date: podcastDate, articles };
const tmpFile = '/tmp/podcast-payload.json';
fs.writeFileSync(tmpFile, JSON.stringify(payload));

try {
  // Use tcb fn invoke with file-based params
  const cmd = `tcb fn invoke podcast-write --envId ${ENV_ID} --params-path ${tmpFile}`;
  console.log(`\n🚀 Invoking: ${cmd}`);
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
  console.log(result);
} catch (e) {
  console.error('tcb invoke with --params-path failed:', e.message);
  
  // Fallback: inline params (may fail if too long)
  try {
    const shortPayload = JSON.stringify(payload);
    const cmd2 = `tcb fn invoke podcast-write --envId ${ENV_ID} --params '${shortPayload.replace(/'/g, "\\'")}'`;
    console.log('Trying inline params...');
    const result2 = execSync(cmd2, { encoding: 'utf-8', timeout: 60000 });
    console.log(result2);
  } catch (e2) {
    console.error('Inline params also failed:', e2.message);
    console.log('\n❌ Both methods failed. Trying batch approach...');
    
    // Batch: write one article at a time
    for (let i = 0; i < articles.length; i++) {
      const singlePayload = { date: podcastDate, articles: [articles[i]] };
      const singleFile = `/tmp/podcast-single-${i}.json`;
      fs.writeFileSync(singleFile, JSON.stringify(singlePayload));
      
      try {
        const cmd3 = `tcb fn invoke podcast-write --envId ${ENV_ID} --params '${JSON.stringify(singlePayload).replace(/'/g, "\\'")}'`;
        const result3 = execSync(cmd3, { encoding: 'utf-8', timeout: 30000 });
        console.log(`  ✅ Article ${i+1}: ${articles[i].title?.substring(0, 40)}...`);
      } catch (e3) {
        console.error(`  ❌ Article ${i+1} failed:`, e3.message?.substring(0, 100));
      }
      
      fs.unlinkSync(singleFile);
    }
  }
}

try { fs.unlinkSync(tmpFile); } catch(e) {}
console.log('\n✅ Done!');

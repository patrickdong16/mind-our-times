#!/usr/bin/env node
/**
 * Podcast Friday — YouTube Data Fetcher
 * 
 * Fetches recent long-form podcast episodes from curated channels,
 * filters by duration & views, picks top 8, generates AI summaries.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// === Config ===
const YOUTUBE_API_KEY = fs.readFileSync(
  path.resolve(__dirname, '../../../.config/api_keys/youtube'), 'utf-8'
).trim();

const OPENAI_API_KEY = fs.readFileSync(
  path.resolve(__dirname, '../../../.config/api_keys/openai'), 'utf-8'
).trim();

// Known YouTube channel IDs (pre-mapped to save API quota)
const CHANNELS = [
  { id: 'UCSHZKyawb77ixDdsGog4iWA', name: 'Lex Fridman Podcast', domain: 'T', focus: '深度访谈' },
  { id: 'UCkS_HP3m9NXOgswVAKbMeJQ', name: 'Dwarkesh Podcast', domain: 'T', focus: 'AI 专访' },
  { id: 'UCVhQ2NnY5Rskt6UjCUkJ_DA', name: 'a16z', domain: 'T', focus: '风投视角' },
  { id: 'UCo5fWDJRo2aEjHLCI5CF1bg', name: 'ARK Invest', domain: 'T', focus: '创新投资' },
  { id: 'UCMLtBahI5DMrt0NPvDSoIRQ', name: 'Machine Learning Street Talk', domain: 'T', focus: 'AI 学术' },
  { id: 'UCm4R7l9ApmKMUUROqtsfRBw', name: 'Conversations with Tyler', domain: 'Φ', focus: 'Tyler Cowen 深度访谈' },
  { id: 'UCjz6mwgmrEB9V8I70C_wVPg', name: 'The Ezra Klein Show', domain: 'P', focus: '政策与政治深度访谈' },
  { id: 'UCsHGpiAN-UQiIYs4YkqAiPg', name: 'Foreign Affairs', domain: 'P', focus: '外交政策' },
  { id: 'UCkzuQQbC1JLDCWstc0Ccfcg', name: 'Council on Foreign Relations', domain: 'P', focus: '国际关系' },
  { id: 'UC-RBODo7sNhEcRfSGMH2etw', name: 'Brookings Institution', domain: 'P', focus: '政策研究' },
  { id: 'UCa2GPSDO50MV6aFmyFHLaaA', name: 'Long Now Foundation', domain: 'Φ', focus: '长期思维' },
  { id: 'UCyiBLaKgpEA-czbTPJi_u5A', name: 'Santa Fe Institute', domain: 'Φ', focus: '复杂系统' },
  { id: 'UCmeRrV0lFALimWhRbUDPl7A', name: 'Intelligence Squared', domain: 'Φ', focus: '辩论' },
  { id: 'UCqK_GSMbpiV8spgD3ZGloSw', name: 'Real Vision', domain: 'F', focus: '投资访谈' },
  { id: 'UCO1cgjhGzsSYb1rsB3Gklag', name: 'Bridgewater', domain: 'F', focus: 'Ray Dalio' },
  { id: 'UCESLZhusAkFfsNsApnjF_Cg', name: 'The All-In Podcast', domain: 'F', focus: '硅谷投资' },
];

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const TOP_N = 8;

// === HTTP Helper ===
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.substring(0, 200)}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// === YouTube API Functions ===

// Search for channel by name, return channel ID
async function searchChannel(channelName) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelName)}&maxResults=1&key=${YOUTUBE_API_KEY}`;
  const data = await httpsGet(url);
  if (data.items && data.items.length > 0) {
    return data.items[0].snippet.channelId;
  }
  return null;
}

// Get channel's uploads playlist ID
async function getUploadsPlaylistId(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const data = await httpsGet(url);
  if (data.items && data.items.length > 0) {
    return data.items[0].contentDetails.relatedPlaylists.uploads;
  }
  return null;
}

// Get recent videos from a playlist
async function getPlaylistVideos(playlistId, maxResults = 20) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
  const data = await httpsGet(url);
  return (data.items || []).map(item => ({
    videoId: item.contentDetails.videoId,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails?.maxres?.url 
      || item.snippet.thumbnails?.high?.url 
      || item.snippet.thumbnails?.medium?.url,
    channelTitle: item.snippet.channelTitle,
  }));
}

// Get video details (duration, viewCount, etc.)
async function getVideoDetails(videoIds) {
  if (videoIds.length === 0) return [];
  // YouTube API allows up to 50 IDs per request
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }
  
  let allItems = [];
  for (const chunk of chunks) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${chunk.join(',')}&key=${YOUTUBE_API_KEY}`;
    const data = await httpsGet(url);
    if (data.items) allItems = allItems.concat(data.items);
  }
  
  return allItems.map(item => ({
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.maxres?.url
      || item.snippet.thumbnails?.high?.url
      || item.snippet.thumbnails?.medium?.url,
    duration: parseDuration(item.contentDetails.duration),
    durationRaw: item.contentDetails.duration,
    viewCount: parseInt(item.statistics.viewCount || '0'),
    likeCount: parseInt(item.statistics.likeCount || '0'),
    commentCount: parseInt(item.statistics.commentCount || '0'),
  }));
}

// Parse ISO 8601 duration to minutes
function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 60 + minutes + (seconds > 30 ? 1 : 0);
}

// Format duration for display
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分钟`;
  return `${h}小时${m > 0 ? m + '分钟' : ''}`;
}

// Format view count
function formatViewCount(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(0) + 'K';
  return count.toString();
}

// === OpenAI Summary Generation ===
async function generateSummary(video) {
  const prompt = `你是一位知识密度极高的中文内容策展人。请为以下播客/长视频写一段中文摘要（300-500字），包含：
1. 核心观点（3-5个要点）
2. 为什么值得听（1-2句话）

要求：
- 语言简洁有力，像《经济学人》的中文版
- 不要使用"首先、其次、最后"这种结构
- 突出最有冲击力的观点
- 如果有知名嘉宾，提及其身份和独特视角

视频信息：
标题：${video.title}
频道：${video.channelTitle}
时长：${formatDuration(video.duration)}
描述：${(video.description || '').substring(0, 1500)}`;

  try {
    const response = await httpsPost('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '你是一位专注于深度内容策展的知识分子，擅长用精炼的中文提炼长篇内容的核心价值。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7,
    }, {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    });

    if (response.choices && response.choices[0]) {
      return response.choices[0].message.content.trim();
    }
    return null;
  } catch (e) {
    console.error(`  ⚠️ Summary generation failed for "${video.title}":`, e.message);
    return null;
  }
}

// === Main Pipeline ===
async function main() {
  console.log('🎙️ Podcast Friday — Data Fetch Pipeline');
  console.log('=========================================\n');
  
  let allVideos = [];
  
  // Step 1: Fetch videos from each channel
  for (const channel of CHANNELS) {
    process.stdout.write(`📡 ${channel.name}... `);
    try {
      // First verify channel ID works, if not search for it
      let channelId = channel.id;
      const uploadsId = await getUploadsPlaylistId(channelId);
      
      if (!uploadsId) {
        console.log('⚠️ Channel ID invalid, searching...');
        channelId = await searchChannel(channel.name);
        if (!channelId) {
          console.log('❌ Not found');
          continue;
        }
        const retryUploads = await getUploadsPlaylistId(channelId);
        if (!retryUploads) {
          console.log('❌ No uploads playlist');
          continue;
        }
      }
      
      const uploadsPlaylistId = (await getUploadsPlaylistId(channelId));
      const videos = await getPlaylistVideos(uploadsPlaylistId, 15);
      
      // Filter: only videos from last 30 days
      const recentVideos = videos.filter(v => v.publishedAt >= THIRTY_DAYS_AGO);
      
      if (recentVideos.length === 0) {
        console.log(`0 recent videos`);
        continue;
      }
      
      // Get full details
      const videoIds = recentVideos.map(v => v.videoId);
      const details = await getVideoDetails(videoIds);
      
      // Filter: duration > 60 minutes (for tier 1) or > 30 minutes (for tier 2)
      const longVideos = details.filter(v => v.duration >= 30);
      
      // Add channel metadata
      for (const v of longVideos) {
        v.channelName = channel.name;
        v.domain = channel.domain;
        v.focus = channel.focus;
      }
      
      allVideos = allVideos.concat(longVideos);
      console.log(`${longVideos.length} episodes (of ${recentVideos.length} recent)`);
      
      // Rate limit: 100ms between channels
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
    }
  }
  
  console.log(`\n📊 Total candidates: ${allVideos.length}`);
  
  // Step 2: Score and rank
  // Scoring: viewCount * durationBonus * recencyBonus
  const now = Date.now();
  const scored = allVideos.map(v => {
    const ageHours = (now - new Date(v.publishedAt).getTime()) / (1000 * 60 * 60);
    const recencyBonus = Math.max(0.3, 1 - (ageHours / (30 * 24)) * 0.7);
    const durationBonus = v.duration >= 60 ? 1.5 : (v.duration >= 45 ? 1.2 : 1.0);
    const viewScore = Math.log10(Math.max(v.viewCount, 1));
    v.score = viewScore * durationBonus * recencyBonus;
    return v;
  });
  
  // Sort by score, pick top N with per-channel diversity (max 2 per channel)
  scored.sort((a, b) => b.score - a.score);
  const topVideos = [];
  const channelCount = {};
  const MAX_PER_CHANNEL = 2;
  for (const v of scored) {
    if (topVideos.length >= TOP_N) break;
    const count = channelCount[v.channelName] || 0;
    if (count >= MAX_PER_CHANNEL) continue;
    topVideos.push(v);
    channelCount[v.channelName] = count + 1;
  }
  
  console.log(`\n🏆 Top ${TOP_N} selected:`);
  topVideos.forEach((v, i) => {
    console.log(`  ${i + 1}. [${formatDuration(v.duration)}] ${v.title} (${formatViewCount(v.viewCount)} views, score: ${v.score.toFixed(2)})`);
  });
  
  // Step 3: Generate AI summaries
  console.log('\n✍️ Generating summaries...');
  for (let i = 0; i < topVideos.length; i++) {
    const v = topVideos[i];
    process.stdout.write(`  ${i + 1}/${topVideos.length} "${v.title.substring(0, 50)}..."  `);
    const summary = await generateSummary(v);
    v.summary = summary || '摘要生成中，请稍后查看。';
    console.log('✅');
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Step 4: Format output
  const output = {
    generatedAt: new Date().toISOString(),
    weekLabel: getWeekLabel(),
    episodes: topVideos.map(v => ({
      videoId: v.videoId,
      title: v.title,
      channelName: v.channelName,
      domain: v.domain,
      focus: v.focus,
      publishedAt: v.publishedAt,
      duration: v.duration,
      durationFormatted: formatDuration(v.duration),
      viewCount: v.viewCount,
      viewCountFormatted: formatViewCount(v.viewCount),
      likeCount: v.likeCount,
      thumbnail: v.thumbnail,
      youtubeUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      summary: v.summary,
      score: v.score,
    })),
  };
  
  // Save
  const outputPath = path.resolve(__dirname, '../frontend/data.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n💾 Saved to ${outputPath}`);
  
  // Also save a copy for cloud function
  const cfOutputPath = path.resolve(__dirname, '../functions/podcast-read/data.json');
  fs.writeFileSync(cfOutputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`💾 Saved to ${cfOutputPath}`);
  
  console.log('\n✅ Done!');
}

function getWeekLabel() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  // Get the Friday of this week
  const dayOfWeek = now.getDay();
  const daysToFriday = (5 - dayOfWeek + 7) % 7;
  const friday = new Date(now);
  friday.setDate(friday.getDate() + (daysToFriday === 0 && dayOfWeek !== 5 ? 7 : daysToFriday));
  return `${friday.getFullYear()}年${friday.getMonth() + 1}月${friday.getDate()}日`;
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

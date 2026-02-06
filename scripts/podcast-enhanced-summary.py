#!/usr/bin/env python3
"""
Podcast Enhanced Summary Generator (Option C)

Uses yt-dlp to download subtitles, then GPT-4o to generate
high-quality, structured summaries from full transcripts.

Cost: ~$0.04-0.15 per podcast (depending on length)
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional, Dict, List

# Paths
SCRIPT_DIR = Path(__file__).parent
WORKSPACE = SCRIPT_DIR.parent  # mind-our-times/
ROOT_WORKSPACE = SCRIPT_DIR.parent.parent  # ~/.openclaw/workspace/
DATA_FILE = WORKSPACE / "podcast-friday/frontend/data.json"
OPENAI_KEY_FILE = ROOT_WORKSPACE / ".config/api_keys/openai"
YT_DLP = "yt-dlp"

def load_openai_key():
    return OPENAI_KEY_FILE.read_text().strip()

def download_transcript(video_id: str) -> Optional[str]:
    """Download transcript using youtube-transcript-api."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id)
        
        # Combine all snippets into full text
        text_parts = [snippet.text for snippet in transcript.snippets]
        full_text = ' '.join(text_parts)
        
        # Clean up
        full_text = full_text.replace('\n', ' ').replace('  ', ' ')
        
        print(f"  📥 Got transcript: {len(full_text):,} chars")
        return full_text
        
    except Exception as e:
        error_name = type(e).__name__
        if 'NoTranscript' in error_name or 'Disabled' in error_name:
            print(f"  ⚠️ No transcript available for {video_id}")
        else:
            print(f"  ⚠️ Transcript error ({error_name}): {str(e)[:50]}")
        return None

def parse_srt(content: str) -> str:
    """Parse SRT/VTT format, extract text, remove duplicates and timestamps."""
    import re
    
    lines = []
    seen = set()
    
    for line in content.split('\n'):
        line = line.strip()
        
        # Skip VTT header
        if line.startswith('WEBVTT') or line.startswith('Kind:') or line.startswith('Language:'):
            continue
        # Skip timestamp lines (both SRT and VTT format)
        if '-->' in line:
            continue
        # Skip numeric index lines (SRT)
        if line.isdigit():
            continue
        # Skip empty lines
        if not line:
            continue
        # Skip position/alignment tags
        if line.startswith('align:') or line.startswith('position:'):
            continue
        
        # Remove VTT tags like <c>, </c>, <00:00:00.000>
        line = re.sub(r'<[^>]+>', '', line)
        line = line.strip()
        
        if not line:
            continue
            
        # Skip duplicate lines (common in auto-subs)
        if line in seen:
            continue
        seen.add(line)
        lines.append(line)
    
    # Join and clean up
    text = ' '.join(lines)
    # Remove common artifacts
    text = text.replace('[Music]', '').replace('[Applause]', '')
    text = text.replace('  ', ' ')  # Clean double spaces
    return text

def generate_enhanced_summary(video: dict, transcript: Optional[str], max_retries: int = 3) -> Optional[dict]:
    """Generate enhanced summary using GPT-4o with full transcript."""
    import urllib.request
    import time
    
    api_key = load_openai_key()
    
    # Build context
    if transcript and len(transcript) > 500:
        # Use transcript (truncate if too long for context)
        max_chars = 100000  # ~75K tokens, safe for 128K context
        context = transcript[:max_chars]
        context_type = "full transcript"
    else:
        # Fallback to description
        context = video.get('description', '')[:3000]
        context_type = "description only"
    
    print(f"  📝 Using {context_type} ({len(context):,} chars)")
    
    # 获取发布日期
    published_at = video.get('publishedAt', '')
    if published_at:
        # 格式化日期：2026-02-03T12:00:00Z -> 2026年2月3日
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
            date_str = f"{dt.year}年{dt.month}月{dt.day}日"
        except:
            date_str = published_at[:10]
    else:
        date_str = ""
    
    prompt = f"""你是一位知识密度极高的中文内容策展人，为高知人群筛选深度内容。

请为以下播客生成结构化的深度摘要。

【播客信息】
标题：{video.get('title', '')}
频道：{video.get('channelName', '')}
时长：{video.get('durationFormatted', '')}
发布日期：{date_str}

【{context_type.upper()}】
{context}

【输出要求】
请返回 JSON 格式，包含以下字段：

{{
  "intro": "开篇导语（80-120字）：融合标题主题 + 为什么值得听 + 发布时间。
    例如：'{date_str}，Lex Fridman 与 OpenAI 联合创始人 Ilya Sutskever 展开了一场关于...'
    要求：自然流畅，交代清楚这期的核心主题和有意思的地方，不要'标题：'这样的小标题",
  
  "summary_cn": "核心内容（600-800字）的深度摘要。要求：
    - 自然分段，不要用'核心论点：''关键论据：'这样的小标题
    - 第一段：这期播客最重要的洞察是什么？
    - 第二段：支撑核心论点的2-3个关键事实或论证，写清楚论点和论据的逻辑关系
    - 第三段：争议、启示、或值得深思的问题
    语言风格：《经济学人》中文版，信息密集，避免空话",
  
  "key_quotes": [
    {{
      "en": "原文金句1（英文原话，从transcript中提取最有冲击力的表达）",
      "cn": "中文翻译1"
    }},
    {{
      "en": "原文金句2",
      "cn": "中文翻译2"
    }}
  ],
  
  "guest_bio": "嘉宾深度介绍（150-200字）：包括学术/职业背景、代表作品或成就、独特视角来源、为何是这个话题的权威声音。如果是多位嘉宾，分别介绍。如果是主持人独白，写主持人的背景和影响力。",
  
  "title_cn": "中文标题（简洁有力，不超过25字）"
}}

只返回 JSON，不要其他内容。"""

    body = {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Retry with exponential backoff
    for attempt in range(max_retries):
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(body).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                content = result['choices'][0]['message']['content']
                return json.loads(content)
        except urllib.error.HTTPError as e:
            if e.code == 429:  # Rate limit
                wait_time = (2 ** attempt) * 15  # 15s, 30s, 60s
                print(f"  ⏳ Rate limited, waiting {wait_time}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                continue
            else:
                print(f"  ❌ GPT-4o HTTP error {e.code}: {e.reason}")
                return None
        except Exception as e:
            print(f"  ❌ GPT-4o error: {e}")
            return None
    
    print(f"  ❌ Failed after {max_retries} retries")
    return None

def process_podcasts():
    """Process all podcasts in data.json with enhanced summaries."""
    
    if not DATA_FILE.exists():
        print(f"❌ Data file not found: {DATA_FILE}")
        sys.exit(1)
    
    data = json.loads(DATA_FILE.read_text())
    episodes = data.get('episodes', [])
    
    print(f"📡 Processing {len(episodes)} podcasts with enhanced summaries...\n")
    
    for i, ep in enumerate(episodes, 1):
        video_id = ep.get('videoId', '')
        title = ep.get('title', '')[:50]
        print(f"[{i}/{len(episodes)}] {title}...")
        
        # Download transcript
        transcript = download_transcript(video_id)
        
        # Generate enhanced summary
        enhanced = generate_enhanced_summary(ep, transcript)
        
        if enhanced:
            # Update episode with enhanced data
            ep['intro'] = enhanced.get('intro', '')  # 开篇导语（融合标题+为什么值得听+时间）
            ep['summary_cn'] = enhanced.get('summary_cn', ep.get('summary_cn', ''))
            ep['why_listen'] = enhanced.get('why_listen', ep.get('why_listen', ''))
            ep['key_quotes'] = enhanced.get('key_quotes', [])
            ep['guest_bio'] = enhanced.get('guest_bio', '')
            ep['title_cn'] = enhanced.get('title_cn', ep.get('title_cn', ''))
            print(f"  ✅ Enhanced ({len(ep['summary_cn'])} chars)")
        else:
            print(f"  ⚠️ Keeping original summary")
        
        print()
        
        # Delay between podcasts to avoid rate limits
        if i < len(episodes):
            import time
            time.sleep(5)
    
    # Save updated data
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"💾 Saved to {DATA_FILE}")
    
    # Show summary
    print("\n📊 Summary:")
    for ep in episodes:
        summary_len = len(ep.get('summary_cn', ''))
        has_quotes = '✓' if ep.get('key_quotes') else '✗'
        print(f"  [{ep.get('domain', '?')}] {ep.get('title_cn', '')[:30]}... ({summary_len} chars, quotes: {has_quotes})")

if __name__ == "__main__":
    process_podcasts()

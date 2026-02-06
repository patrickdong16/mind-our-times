#!/usr/bin/env python3
"""
Fetch og:image from URLs for Mind Our Times articles.

Usage:
    python3 scripts/fetch-og-image.py <url>
    python3 scripts/fetch-og-image.py --batch <json_file>
"""

import sys
import json
import urllib.request
import re


def fetch_og_image(url):
    """从 URL 抓取 og:image"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')[:100000]
            
            # 优先级 1: og:image
            patterns = [
                r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            ]
            for pattern in patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    img_url = match.group(1)
                    # 处理相对 URL
                    if img_url.startswith('//'):
                        img_url = 'https:' + img_url
                    elif img_url.startswith('/'):
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        img_url = f"{parsed.scheme}://{parsed.netloc}{img_url}"
                    return img_url
            
            # 优先级 2: twitter:image
            patterns = [
                r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
            ]
            for pattern in patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    img_url = match.group(1)
                    if img_url.startswith('//'):
                        img_url = 'https:' + img_url
                    elif img_url.startswith('/'):
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        img_url = f"{parsed.scheme}://{parsed.netloc}{img_url}"
                    return img_url
            
            return ""
    except Exception as e:
        print(f"  ⚠️ Failed to fetch og:image for {url}: {e}", file=sys.stderr)
        return ""


def process_batch(json_file):
    """批量处理 JSON 文件中的文章，添加 thumbnail 字段"""
    with open(json_file, 'r', encoding='utf-8') as f:
        articles = json.load(f)
    
    for i, article in enumerate(articles):
        url = article.get('url', article.get('source_url', ''))
        if not url:
            article['thumbnail'] = ''
            continue
        
        print(f"[{i+1}/{len(articles)}] Fetching og:image for {url[:60]}...")
        article['thumbnail'] = fetch_og_image(url)
        if article['thumbnail']:
            print(f"  ✅ {article['thumbnail'][:80]}...")
        else:
            print(f"  ⚠️ No og:image found")
    
    # 写回
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Processed {len(articles)} articles, saved to {json_file}")


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 scripts/fetch-og-image.py <url>")
        print("  python3 scripts/fetch-og-image.py --batch <json_file>")
        sys.exit(1)
    
    if sys.argv[1] == '--batch':
        if len(sys.argv) < 3:
            print("Error: --batch requires a JSON file path")
            sys.exit(1)
        process_batch(sys.argv[2])
    else:
        url = sys.argv[1]
        og_image = fetch_og_image(url)
        if og_image:
            print(og_image)
        else:
            print("No og:image found", file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
将思想雷达输出发布到 Mind Our Times (CloudBase)
用法：python3 publish-to-cloudbase.py <日期YYYY-MM-DD>
"""
import sys
import json
import requests
from datetime import datetime

# CloudBase API配置
CLOUDBASE_ENV = "mind-our-times-3g7c3va270081e5c"
API_URL = f"https://{CLOUDBASE_ENV}.service.tcloudbase.com/articles-write"
API_KEY = "FhoEwlj6ybrT3Mv1T6GceJvqgu2PQBazsKEz6Y-5Pkg"

# 领域映射：思想雷达中文→Mind Our Times标识
DOMAIN_MAP = {
    "技术": "T",
    "AI": "T",
    "科技": "T",
    "政治": "P",
    "地缘政治": "P",
    "政策": "P",
    "历史": "H",
    "哲学": "Φ",
    "思想": "Φ",
    "宗教": "R",
    "金融": "F",
    "经济": "F",
}

def map_domain(radar_domain):
    """
    映射思想雷达的领域到Mind Our Times标识
    思想雷达格式: "地缘政治"、"政治/政策"、"金融/科技"
    """
    for keyword, code in DOMAIN_MAP.items():
        if keyword in radar_domain:
            return code
    # 默认映射
    return "Φ"  # 哲学/思想作为默认分类

def shorten_bio(bio, max_len=50):
    """精简作者介绍"""
    if len(bio) <= max_len:
        return bio
    # 取第一句话或前50字
    first_sentence = bio.split("。")[0]
    if len(first_sentence) <= max_len:
        return first_sentence
    return bio[:max_len] + "..."

def clean_insight(signal):
    """清理题外话：去掉💭前缀"""
    return signal.replace("💭 题外话：", "").replace("💭题外话：", "").replace("💭 ", "")

def convert_article(radar_item):
    """转换单条文章"""
    return {
        "domain": map_domain(radar_item["domain"]),
        "title": radar_item["title"],
        "author_name": radar_item["author"],
        "author_intro": shorten_bio(radar_item["author_bio"]),
        "source": radar_item["source"],
        "source_url": radar_item["url"],
        "content": radar_item["summary"],
        "insight": clean_insight(radar_item["signal"])
    }

def publish_to_cloudbase(date, articles):
    """发布到CloudBase"""
    payload = {
        "date": date,
        "articles": articles
    }
    
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    }
    
    print(f"正在发布 {len(articles)} 篇文章到 CloudBase...")
    response = requests.post(API_URL, json=payload, headers=headers)
    
    if response.status_code == 200:
        result = response.json()
        if result.get("success"):
            print(f"✓ 成功发布 {result['data']['inserted']} 篇文章")
            return True
        else:
            print(f"✗ 发布失败：{result.get('error')}")
            return False
    else:
        print(f"✗ HTTP {response.status_code}: {response.text}")
        return False

def main():
    if len(sys.argv) < 2:
        print("用法: python3 publish-to-cloudbase.py <日期YYYY-MM-DD>")
        sys.exit(1)
    
    date = sys.argv[1]
    
    # 读取思想雷达输出
    input_file = f"/Users/dq/.openclaw/workspace/memory/briefing-index/{date}-full.json"
    try:
        with open(input_file, "r", encoding="utf-8") as f:
            radar_data = json.load(f)
    except FileNotFoundError:
        print(f"✗ 文件不存在: {input_file}")
        sys.exit(1)
    
    # 转换格式
    articles = [convert_article(item) for item in radar_data]
    
    print(f"读取 {len(articles)} 篇文章:")
    for article in articles:
        print(f"  [{article['domain']}] {article['title']}")
    
    # 发布
    success = publish_to_cloudbase(date, articles)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

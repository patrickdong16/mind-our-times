#!/usr/bin/env python3
"""
将思想雷达输出转换为CloudBase格式的JSON，
然后通过CLI调用云函数发布
"""
import sys
import json

def main():
    if len(sys.argv) < 2:
        print("用法: python3 publish.py YYYY-MM-DD")
        sys.exit(1)
    
    date = sys.argv[1]
    input_file = f"./memory/briefing-index/{date}-full.json"
    
    # 领域映射
    DOMAIN_MAP = {
        "技术": "T", "AI": "T", "科技": "T",
        "政治": "P", "地缘政治": "P", "政策": "P",
        "历史": "H",
        "哲学": "Φ", "思想": "Φ",
        "宗教": "R",
        "金融": "F", "经济": "F",
    }
    
    def map_domain(d):
        for k, v in DOMAIN_MAP.items():
            if k in d:
                return v
        return "Φ"
    
    def shorten_bio(bio, max_len=50):
        if len(bio) <= max_len:
            return bio
        first = bio.split("。")[0]
        if len(first) <= max_len:
            return first
        return bio[:max_len] + "..."
    
    def clean_insight(s):
        return s.replace("💭 题外话：", "").replace("💭题外话：", "").replace("💭 ", "")
    
    with open(input_file, "r") as f:
        data = json.load(f)
    
    articles = []
    for item in data:
        articles.append({
            "domain": map_domain(item["domain"]),
            "title": item["title"],
            "author_name": item["author"],
            "author_intro": shorten_bio(item["author_bio"]),
            "source": item["source"],
            "source_url": item["url"],
            "content": item["summary"],
            "insight": clean_insight(item["signal"])
        })
    
    payload = {
        "date": date,
        "articles": articles,
        "headers": {
            "x-api-key": "FhoEwlj6ybrT3Mv1T6GceJvqgu2PQBazsKEz6Y-5Pkg"
        }
    }
    
    # 输出JSON供cloudbase CLI使用
    print(json.dumps(payload, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

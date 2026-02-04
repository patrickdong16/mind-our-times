#!/usr/bin/env python3
"""批量发布今日所有文章"""
import json
import subprocess

date = "2026-02-04"
input_file = f"/Users/dq/.openclaw/workspace/memory/briefing-index/{date}-full.json"

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

with open(input_file) as f:
    data = json.load(f)

articles = []
for item in data:
    # 提取日期（格式："2026-02-03"或"2026-02-03 12:13"）
    source_date = item["date"].split()[0] if item.get("date") else ""
    
    articles.append({
        "domain": map_domain(item["domain"]),
        "title": item["title"],
        "author_name": item["author"],
        "author_intro": item["author_bio"],  # 保持完整，前端自动换行
        "source": item["source"],
        "source_date": source_date,
        "source_url": item["url"],
        "content": item["summary"],
        "insight": item["signal"].replace("💭 题外话：", "").replace("💭题外话：", "").replace("💭 ", "")
    })

payload = {"date": date, "articles": articles}
payload_json = json.dumps(payload, ensure_ascii=False)

print(f"正在发布 {len(articles)} 篇文章...")

result = subprocess.run([
    "cloudbase", "functions:invoke", "articles-write",
    "--params", payload_json,
    "-e", "mind-our-times-3g7c3va270081e5c"
], capture_output=True, text=True)

print(result.stdout)
if result.returncode != 0:
    print(result.stderr)
    exit(1)

print(f"\n✅ 发布完成！访问：https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com")

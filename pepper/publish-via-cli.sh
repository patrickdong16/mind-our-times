#!/bin/bash
# 通过CloudBase CLI调用云函数发布文章

DATE=$1
if [ -z "$DATE" ]; then
  echo "用法: ./publish-via-cli.sh YYYY-MM-DD"
  exit 1
fi

FULLDATA="/Users/dq/.openclaw/workspace/memory/briefing-index/${DATE}-full.json"
if [ ! -f "$FULLDATA" ]; then
  echo "✗ 文件不存在: $FULLDATA"
  exit 1
fi

# 转换格式并生成临时JSON
TEMP_JSON="/tmp/mot-publish-${DATE}.json"
python3 << 'PYEOF' > "$TEMP_JSON"
import sys
import json

date = sys.argv[1]
input_file = f"/Users/dq/.openclaw/workspace/memory/briefing-index/{date}-full.json"

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

payload = {"date": date, "articles": articles}
print(json.dumps(payload, ensure_ascii=False))
PYEOF

python3 "$TEMP_JSON" "$DATE"

# 调用云函数
echo ""
echo "正在发布 $DATE 的文章到 CloudBase..."
cloudbase functions:invoke articles-write \
  --params "$(cat $TEMP_JSON)" \
  -e mind-our-times-3g7c3va270081e5c

# 清理
rm -f "$TEMP_JSON"

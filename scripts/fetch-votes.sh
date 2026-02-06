#!/bin/bash
# 从 CloudBase 数据库拉取投票数据

ENV_ID="mind-our-times-3g7c3va270081e5c"

# 查询所有投票记录
tcb database query \
  --envId "$ENV_ID" \
  --collection "votes" \
  --limit 1000 \
  2>/dev/null | jq -c '.'

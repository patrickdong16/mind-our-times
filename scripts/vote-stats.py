#!/usr/bin/env python3
"""
Mind Our Times - 投票统计脚本 v2
每日运行，追踪所有活跃投票问题的数据变化

功能：
1. 从配置文件读取问题列表
2. 通过 CloudBase SDK 页面获取数据
3. 计算总票数、增量、比例
4. 存档到 JSON 文件
5. 发送 Telegram 日报

用法：
  python3 scripts/vote-stats.py           # 运行统计并发 Telegram
  python3 scripts/vote-stats.py --dry-run # 只统计不发送
  python3 scripts/vote-stats.py --add <question_id> <question_text>  # 添加问题
"""

import json
import os
import sys
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

# 路径配置
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
WORKSPACE_DIR = PROJECT_DIR.parent
DATA_DIR = PROJECT_DIR / "data" / "vote-stats"
HISTORY_FILE = DATA_DIR / "history.json"
QUESTIONS_FILE = DATA_DIR / "questions.json"

# CloudBase 配置
ENV_ID = "mind-our-times-3g7c3va270081e5c"
WEBAPP_URL = f"https://{ENV_ID}-1397697000.tcloudbaseapp.com"

def ensure_dirs():
    """确保数据目录存在"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def load_questions():
    """加载问题配置"""
    if QUESTIONS_FILE.exists():
        with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    # 默认问题
    return {
        "questions": [
            {
                "id": "2026-02-06-ai-fear",
                "question": "AI时代，你更担心哪个？",
                "publish_date": "2026-02-06",
                "active": True
            }
        ]
    }

def save_questions(data):
    """保存问题配置"""
    ensure_dirs()
    with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_history():
    """加载历史数据"""
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"questions": {}, "daily_snapshots": []}

def save_history(history):
    """保存历史数据"""
    ensure_dirs()
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

def fetch_question_result(question_id):
    """通过访问投票页获取单个问题的结果"""
    # 构建投票结果页 URL（带 question_id 参数）
    vote_url = f"{WEBAPP_URL}/vote.html?id={question_id}"
    
    try:
        # 使用 curl 获取页面（投票结果在页面加载后通过 JS 生成）
        # 这里我们直接调用云函数的 HTTP 接口
        # 如果 HTTP 不可用，返回 None，稍后用 browser
        
        # 尝试直接访问（可能需要 browser）
        print(f"  Fetching {question_id}...")
        return None  # 暂时返回 None，使用 fallback
        
    except Exception as e:
        print(f"  Error fetching {question_id}: {e}")
        return None

def fetch_all_stats_via_browser():
    """通过 browser 抓取 stats 页面获取所有统计"""
    try:
        # 检查 browser 状态
        status = subprocess.run(
            ["openclaw", "browser", "status", "--json"],
            capture_output=True, text=True, timeout=10
        )
        
        if "stopped" in status.stdout.lower():
            print("  Starting browser...")
            subprocess.run(
                ["openclaw", "browser", "start", "--browser-profile", "openclaw"],
                capture_output=True, timeout=15
            )
            import time
            time.sleep(2)
        
        # 导航到 stats 页面
        stats_url = f"{WEBAPP_URL}/stats.html"
        print(f"  Navigating to {stats_url}...")
        
        nav = subprocess.run(
            ["openclaw", "browser", "navigate", stats_url],
            capture_output=True, text=True, timeout=30
        )
        
        if nav.returncode != 0:
            print(f"  Navigate failed: {nav.stderr}")
            return None
        
        import time
        
        # 检查是否有 CloudBase 中间页（测试域名保护）
        time.sleep(3)
        check_redirect = subprocess.run(
            ["openclaw", "browser", "evaluate", "--json",
             "--fn", "() => document.getElementById('submitBtn') ? 'REDIRECT_PAGE' : 'OK'"],
            capture_output=True, text=True, timeout=10
        )
        
        if "REDIRECT_PAGE" in check_redirect.stdout:
            print("  Clicking through CloudBase redirect page...")
            # 等待倒计时（3秒）
            time.sleep(4)
            # 点击"确定访问"按钮
            subprocess.run(
                ["openclaw", "browser", "evaluate", "--json",
                 "--fn", "() => { document.getElementById('submitBtn').click(); return 'clicked'; }"],
                capture_output=True, text=True, timeout=10
            )
            # 等待页面加载
            time.sleep(4)
        
        # 等待 SDK 初始化和数据加载（CloudBase SDK 需要较长时间）
        print("  Waiting for SDK to initialize...")
        time.sleep(8)
        
        # 执行 JS 获取 stats 内容
        result = subprocess.run(
            ["openclaw", "browser", "evaluate", "--json",
             "--fn", "() => document.getElementById('stats')?.textContent || 'NOT_FOUND'"],
            capture_output=True, text=True, timeout=15
        )
        
        if result.returncode != 0:
            print(f"  Evaluate failed: {result.stderr}")
            return None
        
        content = result.stdout.strip()
        print(f"  Raw content length: {len(content)}")
        
        # 解析 JSON 结果
        try:
            # browser evaluate 返回的可能是 JSON 包装的结果
            wrapper = json.loads(content)
            if isinstance(wrapper, dict):
                if 'result' in wrapper:
                    content = wrapper['result']
                elif 'value' in wrapper:
                    content = wrapper['value']
        except:
            pass
        
        if isinstance(content, str):
            if 'NOT_FOUND' in content or 'Loading' in content or 'Error' in content:
                print(f"  Page not ready: {content[:100]}")
                return None
            
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                print(f"  Invalid JSON in content: {content[:200]}")
                return None
        else:
            data = content
        
        if isinstance(data, dict) and 'questions' in data:
            return data['questions']
        elif isinstance(data, list):
            return data
        
        print(f"  Unexpected data type: {type(data)}")
        return None
        
    except subprocess.TimeoutExpired:
        print("  Browser timeout")
        return None
    except Exception as e:
        print(f"  Browser error: {e}")
        return None

def calculate_stats(current_data, history, questions_config):
    """计算统计数据，包括增量"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    # 获取昨天的快照用于计算增量
    yesterday_snapshot = {}
    if history["daily_snapshots"]:
        last = history["daily_snapshots"][-1]
        if last["date"] != today:
            yesterday_snapshot = {q["question_id"]: q for q in last["questions"]}
    
    # 合并问题配置和实际数据
    stats = []
    active_questions = {q["id"]: q for q in questions_config["questions"] if q.get("active", True)}
    
    for q in current_data or []:
        qid = q.get("question_id", q.get("id", ""))
        if not qid:
            continue
        
        config = active_questions.get(qid, {})
        prev = yesterday_snapshot.get(qid, {})
        
        total = q.get("total", 0)
        count_a = q.get("count_a", 0)
        count_b = q.get("count_b", 0)
        
        # 计算增量
        delta = total - prev.get("total", 0)
        
        # 计算比例
        percent_a = round(count_a / total * 100) if total > 0 else 0
        percent_b = 100 - percent_a if total > 0 else 0
        
        # 计算活跃天数
        publish_date = q.get("publish_date") or config.get("publish_date") or qid[:10]
        try:
            days_active = (datetime.now() - datetime.strptime(publish_date, "%Y-%m-%d")).days + 1
        except:
            days_active = 1
        
        stats.append({
            "question_id": qid,
            "question": q.get("question") or config.get("question", "未知问题"),
            "total": total,
            "delta": delta,
            "count_a": count_a,
            "count_b": count_b,
            "percent_a": percent_a,
            "percent_b": percent_b,
            "days_active": days_active,
            "publish_date": publish_date
        })
    
    # 对于没有数据的活跃问题，补零
    for qid, config in active_questions.items():
        if not any(s["question_id"] == qid for s in stats):
            prev = yesterday_snapshot.get(qid, {})
            stats.append({
                "question_id": qid,
                "question": config.get("question", "未知问题"),
                "total": 0,
                "delta": 0 - prev.get("total", 0),
                "count_a": 0,
                "count_b": 0,
                "percent_a": 0,
                "percent_b": 0,
                "days_active": 1,
                "publish_date": config.get("publish_date", today)
            })
    
    return stats

def format_report(stats, date):
    """格式化 Telegram 报告"""
    if not stats:
        return f"📊 投票日报 {date}\n━━━━━━━━━━━━━━━━━━━━\n暂无活跃投票"
    
    lines = [f"📊 投票日报 {date}", "━━━━━━━━━━━━━━━━━━━━"]
    
    for q in sorted(stats, key=lambda x: (-x["total"], x["question_id"])):
        delta_str = f"+{q['delta']}" if q['delta'] > 0 else str(q['delta']) if q['delta'] < 0 else "±0"
        
        # 简化问题文本
        question_short = q["question"][:25] + "..." if len(q["question"]) > 25 else q["question"]
        
        lines.append(f"\n【{question_short}】")
        lines.append(f"📈 总票数: {q['total']} ({delta_str})")
        if q['total'] > 0:
            lines.append(f"🅰️ {q['percent_a']}% / 🅱️ {q['percent_b']}%")
        lines.append(f"📅 活跃 {q['days_active']} 天")
    
    # 总计
    total_votes = sum(q["total"] for q in stats)
    total_delta = sum(q["delta"] for q in stats)
    delta_str = f"+{total_delta}" if total_delta > 0 else str(total_delta)
    
    lines.append(f"\n━━━━━━━━━━━━━━━━━━━━")
    lines.append(f"📊 总计: {len(stats)} 个问题, {total_votes} 票 ({delta_str})")
    
    return "\n".join(lines)

def send_telegram(message):
    """发送 Telegram 消息"""
    try:
        result = subprocess.run(
            ["openclaw", "message", "send", 
             "--channel", "telegram",
             "--target", "8548089012",
             "--message", message],
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.returncode == 0
    except Exception as e:
        print(f"Failed to send Telegram: {e}")
        return False

def add_question(question_id, question_text):
    """添加新问题"""
    ensure_dirs()
    questions = load_questions()
    
    # 检查是否已存在
    for q in questions["questions"]:
        if q["id"] == question_id:
            print(f"Question {question_id} already exists")
            return
    
    questions["questions"].append({
        "id": question_id,
        "question": question_text,
        "publish_date": question_id[:10] if question_id[:10].count('-') == 2 else datetime.now().strftime("%Y-%m-%d"),
        "active": True
    })
    
    save_questions(questions)
    print(f"✅ Added: {question_id}")

def main():
    dry_run = "--dry-run" in sys.argv
    today = datetime.now().strftime("%Y-%m-%d")
    
    # 处理 --add 命令
    if "--add" in sys.argv:
        idx = sys.argv.index("--add")
        if len(sys.argv) > idx + 2:
            add_question(sys.argv[idx + 1], sys.argv[idx + 2])
        else:
            print("Usage: --add <question_id> <question_text>")
        return 0
    
    print(f"📊 投票统计 {today}")
    ensure_dirs()
    
    # 加载配置和历史
    questions_config = load_questions()
    history = load_history()
    
    # 从 CloudBase 拉取数据
    print("📡 Fetching votes from CloudBase...")
    current_data = fetch_all_stats_via_browser()
    
    if current_data is None:
        print("⚠️ Could not fetch from CloudBase, using empty data")
        current_data = []
    else:
        print(f"✅ Got {len(current_data)} questions from CloudBase")
    
    # 计算统计
    print("📊 Calculating stats...")
    stats = calculate_stats(current_data, history, questions_config)
    
    # 生成报告
    report = format_report(stats, today)
    print("\n" + report)
    
    # 保存快照
    snapshot = {
        "date": today,
        "timestamp": datetime.now().isoformat(),
        "questions": stats
    }
    
    # 避免同一天重复记录
    if history["daily_snapshots"] and history["daily_snapshots"][-1]["date"] == today:
        history["daily_snapshots"][-1] = snapshot
    else:
        history["daily_snapshots"].append(snapshot)
    
    # 更新问题历史
    for q in stats:
        qid = q["question_id"]
        if qid not in history["questions"]:
            history["questions"][qid] = {
                "question": q["question"],
                "publish_date": q["publish_date"],
                "daily_totals": []
            }
        
        daily = history["questions"][qid]["daily_totals"]
        entry = {"date": today, "total": q["total"], "count_a": q["count_a"], "count_b": q["count_b"]}
        if daily and daily[-1]["date"] == today:
            daily[-1] = entry
        else:
            daily.append(entry)
    
    save_history(history)
    save_questions(questions_config)
    print(f"\n✅ History saved to {HISTORY_FILE}")
    
    # 发送 Telegram
    if not dry_run:
        print("\n📤 Sending Telegram...")
        if send_telegram(report):
            print("✅ Telegram sent")
        else:
            print("❌ Telegram failed")
    else:
        print("\n[dry-run] Skipping Telegram")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())

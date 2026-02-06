#!/usr/bin/env python3
"""
发布深度编译文章到微信公众号草稿箱
支持 Markdown 转换为微信 HTML 格式
"""
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import re
from pathlib import Path
from datetime import datetime

class WeChatPublisher:
    def __init__(self):
        self.appid, self.appsecret = self.load_credentials()
        self.access_token = None
        self.token_expires_at = 0
    
    def load_credentials(self):
        config_file = Path('./.config/api_keys/wechat_mot')
        content = config_file.read_text()
        appid = appsecret = None
        for line in content.strip().split('\n'):
            if line.startswith('AppID:'):
                appid = line.split(':', 1)[1].strip()
            elif line.startswith('AppSecret:'):
                appsecret = line.split(':', 1)[1].strip()
        return appid, appsecret
    
    def get_access_token(self):
        if self.access_token and time.time() < self.token_expires_at:
            return self.access_token
        url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={self.appid}&secret={self.appsecret}"
        resp = urllib.request.urlopen(url, timeout=10)
        result = json.loads(resp.read())
        self.access_token = result['access_token']
        self.token_expires_at = time.time() + result['expires_in'] - 300
        return self.access_token
    
    def upload_image(self, image_path):
        token = self.get_access_token()
        url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
        with open(image_path, 'rb') as f:
            image_data = f.read()
        boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
        body = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="media"; filename="cover.png"\r\n'
            f'Content-Type: image/png\r\n\r\n'
        ).encode() + image_data + f'\r\n--{boundary}--\r\n'.encode()
        req = urllib.request.Request(url, data=body, 
            headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}, method='POST')
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read())
        return result['media_id']
    
    def add_draft(self, articles, thumb_media_id):
        token = self.get_access_token()
        url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
        news_items = []
        for article in articles:
            item = {
                "title": article['title'],
                "author": article.get('author', '')[:8],
                "digest": article.get('digest', '')[:120],
                "content": article['content'],
                "content_source_url": article.get('url', ''),
                "thumb_media_id": thumb_media_id,
                "need_open_comment": 0,
                "only_fans_can_comment": 0,
                "show_cover_pic": 0
            }
            news_items.append(item)
        payload = {"articles": news_items}
        req = urllib.request.Request(url,
            data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json'}, method='POST')
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read())
        return result['media_id']


def markdown_to_wechat_html(md_content, vote_url=None, vote_question=None):
    """Convert markdown to WeChat-compatible HTML"""
    
    # 定义样式
    STYLES = {
        'h1': 'font-size: 22px; font-weight: bold; color: #1a1a1a; margin: 30px 0 20px 0; line-height: 1.4;',
        'h2': 'font-size: 18px; font-weight: bold; color: #2c3e50; margin: 28px 0 15px 0; line-height: 1.4; border-bottom: 1px solid #eee; padding-bottom: 8px;',
        'h3': 'font-size: 16px; font-weight: bold; color: #34495e; margin: 20px 0 12px 0;',
        'p': 'font-size: 16px; color: #333; line-height: 1.8; margin: 16px 0; text-align: justify;',
        'strong': 'font-weight: bold; color: #1a1a1a;',
        'blockquote': 'border-left: 3px solid #3498db; padding: 12px 20px; margin: 20px 0; background: #f8f9fa; color: #555; font-style: italic;',
        'li': 'font-size: 16px; color: #333; line-height: 1.8; margin: 8px 0;',
        'hr': 'border: none; border-top: 1px solid #ddd; margin: 30px 0;',
        'a': 'color: #3498db; text-decoration: none;',
    }
    
    lines = md_content.split('\n')
    html_parts = []
    in_blockquote = False
    in_list = False
    list_items = []
    
    for line in lines:
        stripped = line.strip()
        
        # 处理分隔线
        if stripped == '---':
            if in_list:
                html_parts.append(f'<ul style="padding-left: 20px; margin: 16px 0;">{"".join(list_items)}</ul>')
                list_items = []
                in_list = False
            html_parts.append(f'<hr style="{STYLES["hr"]}">')
            continue
        
        # 处理引用块
        if stripped.startswith('>'):
            quote_text = stripped[1:].strip()
            # 处理引用中的加粗
            quote_text = re.sub(r'\*\*(.+?)\*\*', r'<strong style="font-weight:bold;">\1</strong>', quote_text)
            html_parts.append(f'<blockquote style="{STYLES["blockquote"]}">{quote_text}</blockquote>')
            continue
        
        # 处理列表
        if stripped.startswith('- ') or re.match(r'^\d+\. ', stripped):
            in_list = True
            if stripped.startswith('- '):
                item_text = stripped[2:]
            else:
                item_text = re.sub(r'^\d+\. ', '', stripped)
            # 处理加粗
            item_text = re.sub(r'\*\*(.+?)\*\*', r'<strong style="font-weight:bold;">\1</strong>', item_text)
            list_items.append(f'<li style="{STYLES["li"]}">{item_text}</li>')
            continue
        elif in_list and stripped:
            html_parts.append(f'<ul style="padding-left: 20px; margin: 16px 0;">{"".join(list_items)}</ul>')
            list_items = []
            in_list = False
        
        # 处理标题
        if stripped.startswith('# '):
            text = stripped[2:]
            html_parts.append(f'<h1 style="{STYLES["h1"]}">{text}</h1>')
            continue
        elif stripped.startswith('## '):
            text = stripped[3:]
            html_parts.append(f'<h2 style="{STYLES["h2"]}">{text}</h2>')
            continue
        elif stripped.startswith('### '):
            text = stripped[4:]
            html_parts.append(f'<h3 style="{STYLES["h3"]}">{text}</h3>')
            continue
        
        # 处理普通段落
        if stripped:
            # 处理加粗
            text = re.sub(r'\*\*(.+?)\*\*', rf'<strong style="{STYLES["strong"]}">\1</strong>', stripped)
            # 处理链接
            text = re.sub(r'\[(.+?)\]\((.+?)\)', rf'<a style="{STYLES["a"]}" href="\2">\1</a>', text)
            # 处理斜体
            text = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', text)
            html_parts.append(f'<p style="{STYLES["p"]}">{text}</p>')
    
    # 处理剩余列表
    if list_items:
        html_parts.append(f'<ul style="padding-left: 20px; margin: 16px 0;">{"".join(list_items)}</ul>')
    
    # 添加投票区块
    if vote_url and vote_question:
        vote_section = f'''
<section style="margin: 40px 0; padding: 24px; background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%); border-radius: 8px; text-align: center;">
    <p style="font-size: 14px; color: #666; margin: 0 0 12px 0; letter-spacing: 0.1em;">📊 今日之问</p>
    <p style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin: 0 0 20px 0; line-height: 1.5;">{vote_question}</p>
    <a href="{vote_url}" style="display: inline-block; padding: 12px 32px; background: #1a1a1a; color: white; text-decoration: none; border-radius: 4px; font-size: 15px;">参与投票 →</a>
    <p style="font-size: 12px; color: #999; margin: 16px 0 0 0;">投票后查看实时结果</p>
</section>
'''
        html_parts.append(vote_section)
    
    return '\n'.join(html_parts)


def main():
    # 配置
    ARTICLE_PATH = './mind-our-times/drafts/lex-fridman-ai-2026-02-06.md'
    VOTE_URL = 'https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com/vote.html?id=2026-02-06-ai-fear'
    VOTE_QUESTION = 'AI时代，你更担心哪个？'
    
    # 读取文章
    with open(ARTICLE_PATH) as f:
        md_content = f.read()
    
    # 提取标题
    lines = md_content.split('\n')
    title = lines[0].replace('# ', '').strip()
    
    # 转换为 HTML
    html_content = markdown_to_wechat_html(md_content, VOTE_URL, VOTE_QUESTION)
    
    # 包装完整 HTML
    full_html = f'''
<section style="padding: 0; margin: 0; background: #fff;">
    <p style="text-align: center; color: #999; font-size: 13px; margin: 0 0 20px 0; letter-spacing: 0.1em;">MIND OUR TIMES</p>
    {html_content}
    <section style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
        <p style="font-size: 13px; color: #999; margin: 0;">追踪时代思想脉搏</p>
    </section>
</section>
'''
    
    # 发布到草稿箱
    print(f"📝 标题：{title}")
    print(f"📊 投票链接：{VOTE_URL}")
    print(f"📄 内容长度：{len(html_content)} 字符")
    
    publisher = WeChatPublisher()
    
    # 生成封面图
    cover_path = '/tmp/mot_cover.png'
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new('RGB', (900, 500), color='#1a1a1a')
        draw = ImageDraw.Draw(img)
        try:
            font_large = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 36)
            font_small = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 20)
        except:
            font_large = ImageFont.load_default()
            font_small = ImageFont.load_default()
        # 标题（截断到合适长度）
        display_title = title[:20] + '...' if len(title) > 20 else title
        draw.text((450, 230), display_title, font=font_large, fill='#ffffff', anchor='mm')
        draw.text((450, 290), 'MIND OUR TIMES', font=font_small, fill='#888888', anchor='mm')
        img.save(cover_path)
    except ImportError:
        # 没有 PIL，用默认封面
        print("⚠️ PIL 未安装，使用默认封面")
        cover_path = '/tmp/default_cover.png'
    
    print("🖼️ 上传封面图...")
    thumb_media_id = publisher.upload_image(cover_path)
    print(f"   Media ID: {thumb_media_id}")
    
    print("📤 发布草稿...")
    article = {
        'title': title,
        'author': 'Pepper',
        'digest': '当硅谷发现"大力出奇迹"不太灵了——一场四小时播客的深度解读',
        'content': full_html,
        'url': 'https://www.youtube.com/watch?v=EV7WhVT270Q'
    }
    
    media_id = publisher.add_draft([article], thumb_media_id)
    print(f"\n✅ 草稿发布成功！")
    print(f"   Media ID: {media_id}")
    print(f"\n📋 下一步：")
    print(f"   1. 登录公众号后台 https://mp.weixin.qq.com")
    print(f"   2. 素材管理 → 草稿 → 找到这篇文章")
    print(f"   3. 预览确认后发布")


if __name__ == '__main__':
    main()

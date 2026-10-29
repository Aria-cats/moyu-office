#!/usr/bin/env python3
"""A small shared fish pond. Python 3.9+, standard library only."""
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import OrderedDict
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('MOYU_DB', str(ROOT / 'moyu.sqlite3')))
TARGET = max(1, int(os.environ.get('MOYU_TARGET', '10000')))
CHOICE_SECONDS = max(1, int(os.environ.get('MOYU_CHOICE_SECONDS', '180')))
RATE = max(1, float(os.environ.get('MOYU_RATE', '8')))
DISHES = ('红烧', '清蒸', '剁椒', '放生')
STATIC = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
          '/app.js': ('app.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}


def connect():
    connection = sqlite3.connect(DB, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0,
            target INTEGER, winner TEXT, winner_name TEXT, dish TEXT, finished_at REAL, auto_released INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS contributions(round INTEGER, player TEXT, name TEXT,
            count INTEGER DEFAULT 0, PRIMARY KEY(round,player));
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, created REAL);
        CREATE TABLE IF NOT EXISTS touches(round INTEGER, player TEXT, event TEXT,
            PRIMARY KEY(round,player,event));
        ''')
        columns = {r['name'] for r in c.execute('PRAGMA table_info(rounds)')}
        if 'finished_at' not in columns:
            c.execute('ALTER TABLE rounds ADD COLUMN finished_at REAL')
        if 'auto_released' not in columns:
            c.execute('ALTER TABLE rounds ADD COLUMN auto_released INTEGER DEFAULT 0')
        c.execute('UPDATE rounds SET finished_at=? WHERE count>=target AND dish IS NULL AND finished_at IS NULL', (time.time(),))
        if not c.execute('SELECT 1 FROM rounds').fetchone():
            c.execute('INSERT INTO rounds(target) VALUES(?)', (TARGET,))


def expire_choice(c):
    c.execute("UPDATE rounds SET dish='放生',auto_released=1 WHERE dish IS NULL AND finished_at IS NOT NULL AND finished_at<=?",
              (time.time() - CHOICE_SECONDS,))


def snapshot(c, player):
    r = c.execute('SELECT * FROM rounds ORDER BY id DESC LIMIT 1').fetchone()
    mine = c.execute('SELECT count FROM contributions WHERE round=? AND player=?', (r['id'], player)).fetchone()
    people = c.execute('SELECT count(*) FROM contributions WHERE round=?', (r['id'],)).fetchone()[0]
    history = [dict(x) for x in c.execute('''SELECT id AS round,dish,winner_name AS winnerName,target,
        auto_released AS autoReleased,(SELECT count(*) FROM contributions WHERE round=rounds.id) AS participants
        FROM rounds WHERE dish IS NOT NULL ORDER BY id DESC LIMIT 30''')]
    return dict(round=r['id'], count=r['count'], target=r['target'], canChoose=r['winner'] == player,
                winnerName=r['winner_name'], dish=r['dish'], mine=mine[0] if mine else 0,
                participants=people, history=history, autoReleased=bool(r['auto_released']),
                choiceRemaining=max(0, int(CHOICE_SECONDS - (time.time() - r['finished_at']))) if r['finished_at'] else None)


class RateLimiter:
    def __init__(self):
        self.lock = threading.Lock()
        self.buckets = OrderedDict()

    def allow(self, player):
        with self.lock:
            now = time.monotonic()
            tokens, last = self.buckets.pop(player, (12., now))
            tokens = min(12., tokens + (now - last) * RATE)
            allowed = tokens >= 1
            self.buckets[player] = (tokens - 1 if allowed else tokens, now)
            while len(self.buckets) > 10000:
                self.buckets.popitem(last=False)
            return allowed


limiter = RateLimiter()


class Handler(BaseHTTPRequestHandler):
    server_version = 'Moyu/1.0'

    def setup(self):
        super().setup()
        self.connection.settimeout(10)
        self.new_cookie = None

    def reply(self, data, status=200, content_type='application/json'):
        raw = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Frame-Options', 'DENY')
        if self.new_cookie:
            secure = '; Secure' if os.environ.get('MOYU_SECURE_COOKIE') == '1' else ''
            self.send_header('Set-Cookie', f'moyu_session={self.new_cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000{secure}')
        self.end_headers()
        if self.command != 'HEAD':
            try:
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def identity(self, c, create=False):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie.get('moyu_session')
            token = token.value if token else ''
        except Exception:
            token = ''
        digest = hashlib.sha256(token.encode()).hexdigest()
        if token and c.execute('SELECT 1 FROM sessions WHERE token=?', (digest,)).fetchone():
            return digest
        if not create:
            return None
        self.new_cookie = secrets.token_urlsafe(32)
        digest = hashlib.sha256(self.new_cookie.encode()).hexdigest()
        c.execute('INSERT INTO sessions VALUES(?,?)', (digest, time.time()))
        return digest

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path in STATIC:
                filename, content_type = STATIC[path]
                return self.reply((ROOT / filename).read_bytes(), content_type=content_type)
            if path == '/healthz':
                with connect() as c:
                    c.execute('SELECT 1 FROM rounds LIMIT 1').fetchone()
                return self.reply({'ok': True})
            if path == '/api/state':
                with connect() as c:
                    c.execute('BEGIN IMMEDIATE')
                    player = self.identity(c, create=True)
                    expire_choice(c)
                    result = snapshot(c, player)
                return self.reply(result)
            self.reply({'error': '未找到'}, 404)
        except sqlite3.Error:
            self.reply({'error': '鱼塘繁忙，请稍后重试'}, 503)

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ('/api/touch', '/api/cook', '/api/next'):
            return self.reply({'error': '未知操作'}, 404)
        origin = self.headers.get('Origin')
        if (origin and urlparse(origin).netloc != self.headers.get('Host')) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return self.reply({'error': '请从本站参与摸鱼'}, 403)
        if self.headers.get_content_type() != 'application/json':
            return self.reply({'error': '请使用 JSON 请求'}, 415)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096:
                return self.reply({'error': '请求大小不正确'}, 413)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict) or type(data.get('round')) is not int or data['round'] < 1:
                return self.reply({'error': '请求格式错误'}, 400)
            name = data.get('name', '匿名打工人')
            if not isinstance(name, str):
                return self.reply({'error': '昵称格式错误'}, 400)
            name = ''.join(ch for ch in name.strip() if ch.isprintable())[:16] or '匿名打工人'
            event = data.get('event', '')
            if path == '/api/touch' and (not isinstance(event, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}', event)):
                return self.reply({'error': '摸鱼编号无效'}, 400)
            with connect() as c:
                c.execute('BEGIN IMMEDIATE')
                player = self.identity(c)
                if not player:
                    return self.reply({'error': '请刷新鱼塘后重试'}, 401)
                expire_choice(c)
                r = c.execute('SELECT * FROM rounds ORDER BY id DESC LIMIT 1').fetchone()
                accepted = False
                if data['round'] != r['id']:
                    result = snapshot(c, player)
                elif path == '/api/touch':
                    duplicate = c.execute('SELECT 1 FROM touches WHERE round=? AND player=? AND event=?', (r['id'], player, event)).fetchone()
                    if duplicate:
                        accepted = True
                    elif r['count'] < r['target'] and not r['dish']:
                        if not limiter.allow(player):
                            return self.reply({'error': '慢一点，鱼都被你摸冒烟了。'}, 429)
                        c.execute('INSERT INTO touches VALUES(?,?,?)', (r['id'], player, event))
                        c.execute('''INSERT INTO contributions VALUES(?,?,?,1) ON CONFLICT(round,player)
                            DO UPDATE SET count=count+1,name=excluded.name''', (r['id'], player, name))
                        if r['count'] + 1 == r['target']:
                            c.execute('UPDATE rounds SET count=count+1,winner=?,winner_name=?,finished_at=? WHERE id=?', (player, name, time.time(), r['id']))
                        else:
                            c.execute('UPDATE rounds SET count=count+1 WHERE id=?', (r['id'],))
                        accepted = True
                    result = snapshot(c, player)
                elif path == '/api/cook':
                    if r['winner'] != player:
                        return self.reply({'error': '只有最后一摸的人才能决定鱼的命运'}, 403)
                    if data.get('dish') not in DISHES:
                        return self.reply({'error': '未知做法'}, 400)
                    if not r['dish']:
                        c.execute('UPDATE rounds SET dish=? WHERE id=?', (data['dish'], r['id']))
                    result = snapshot(c, player)
                else:
                    if not r['dish']:
                        return self.reply({'error': '这条鱼还没决定去向'}, 409)
                    c.execute('INSERT INTO rounds(target) VALUES(?)', (TARGET,))
                    c.execute('DELETE FROM touches WHERE round<?', (r['id'] - 2,))
                    result = snapshot(c, player)
                result['accepted'] = accepted
            self.reply(result)
        except (ValueError, TypeError, UnicodeDecodeError):
            self.reply({'error': '请求格式错误'}, 400)
        except (TimeoutError, OSError):
            self.reply({'error': '请求超时'}, 408)
        except sqlite3.Error:
            self.reply({'error': '鱼塘繁忙，请稍后重试'}, 503)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    initialize()
    port = int(os.environ.get('PORT', '8765'))
    print(f'摸鱼办事处已开门 → http://localhost:{port}', flush=True)
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    server.serve_forever()

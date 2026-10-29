import concurrent.futures
import hashlib
import http.cookiejar
import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server as app


class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.call('state')

    def call(self, path, data=None, raw=None, headers=None):
        body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
        req = urllib.request.Request(self.base + '/api/' + path, data=body,
                                     headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with self.http.open(req, timeout=15) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def touch(self, event, round=1):
        return self.call('touch', {'round': round, 'event': event, 'name': '测试打工人'})


class PondTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        app.DB = Path(self.temp.name) / 'pond.sqlite3'
        app.TARGET = 20
        app.ALLOWED_ORIGINS = frozenset()
        app.RATE = 10000
        app.limiter = app.RateLimiter()
        app.initialize()
        self.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_address[1]}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def test_concurrent_finish_and_winner_permissions(self):
        clients = [Client(self.base) for _ in range(32)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda pair: pair[1].touch('event000' + str(pair[0])), enumerate(clients)))
        self.assertTrue(all(status == 200 for status, _ in results))
        states = [c.call('state')[1] for c in clients]
        self.assertTrue(all(s['count'] == 20 and s['participants'] == 20 for s in states))
        winners = [i for i, s in enumerate(states) if s['canChoose']]
        self.assertEqual(len(winners), 1)
        self.assertTrue(all('winner' not in s for s in states))
        winner = clients[winners[0]]
        loser = clients[(winners[0] + 1) % len(clients)]
        status, _ = loser.call('cook', {'round': 1, 'dish': '红烧', 'player': 'pretend-to-be-winner'})
        self.assertEqual(status, 403)
        self.assertEqual(winner.call('cook', {'round': 1, 'dish': '红烧'})[1]['dish'], '红烧')
        self.assertEqual(winner.call('cook', {'round': 1, 'dish': '放生'})[1]['dish'], '红烧')
        self.assertEqual(len(winner.call('state')[1]['history']), 1)

    def test_retry_does_not_double_count(self):
        c = Client(self.base)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: c.touch('same-event-0001'), range(6)))
        self.assertTrue(all(result[1]['accepted'] for result in results))
        self.assertEqual(c.call('state')[1]['count'], 1)
        self.assertEqual(c.call('state')[1]['mine'], 1)

    def test_abandoned_winner_releases_and_next_is_atomic(self):
        c = Client(self.base)
        for i in range(20):
            c.touch(f'event-000{i}')
        with app.connect() as db:
            db.execute('UPDATE rounds SET finished_at=?', (time.time() - app.CHOICE_SECONDS - 1,))
        s = c.call('state')[1]
        self.assertEqual(s['dish'], '放生')
        self.assertTrue(s['autoReleased'])
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            states = list(pool.map(lambda _: c.call('next', {'round': 1}), range(6)))
        self.assertTrue(all(s['round'] == 2 for _, s in states))
        self.assertEqual(c.touch('late-event-000', round=1)[1]['count'], 0)
        app.initialize()
        self.assertEqual(c.call('state')[1]['round'], 2)
        self.assertEqual(len(c.call('state')[1]['history']), 1)

    def test_validation_and_no_data_file_access(self):
        c = Client(self.base)
        for raw in (b'[]', b'null', b'false', b'{', b'{"round":true}'):
            self.assertEqual(c.call('touch', raw=raw)[0], 400)
        self.assertEqual(c.call('touch', raw=b'x' * 4097)[0], 413)
        self.assertEqual(c.touch('short')[0], 400)
        self.assertEqual(c.call('touch', {'round': 1, 'event': 'event-0001'}, headers={'Origin': 'https://elsewhere.invalid'})[0], 403)
        self.assertEqual(c.call('next', {'round': 1})[0], 409)
        for file in ('moyu.sqlite3', 'server.py', '../server.py'):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(self.base + '/' + file)
            self.assertEqual(caught.exception.code, 404)
        self.assertEqual(c.call('state')[1]['count'], 0)

    def test_rate_limit_counts_only_accepted_touches(self):
        c = Client(self.base)
        app.RATE = .01
        statuses = [c.touch(f'rate-event-{i}')[0] for i in range(16)]
        self.assertIn(429, statuses)
        self.assertEqual(c.call('state')[1]['count'], statuses.count(200))

    def test_config_assets_and_explicit_frontend_origin(self):
        for asset in ('config.js', 'api.js'):
            with urllib.request.urlopen(self.base + '/' + asset) as r:
                self.assertEqual(r.status, 200)
                self.assertIn('javascript', r.headers['Content-Type'])
        origin = 'https://fish.example.com'
        app.ALLOWED_ORIGINS = frozenset({origin})
        request = urllib.request.Request(self.base + '/api/touch', method='OPTIONS', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'})
        with urllib.request.urlopen(request) as r:
            self.assertEqual(r.status, 204)
            self.assertEqual(r.headers['Access-Control-Allow-Origin'], origin)
            self.assertEqual(r.headers['Access-Control-Allow-Credentials'], 'true')
        c = Client(self.base)
        status, state = c.call('touch', {'round': 1, 'event': 'cors-event-0001'}, headers={'Origin': origin})
        self.assertEqual(status, 200)
        self.assertEqual(state['count'], 1)
        self.assertEqual(c.call('touch', {'round': 1, 'event': 'cors-event-0002'}, headers={'Origin': 'https://wrong.example.com'})[0], 403)
        request.headers['Origin'] = 'https://wrong.example.com'
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)
        self.assertEqual(caught.exception.code, 403)

    def test_old_database_schema_migration(self):
        with app.connect() as db:
            db.executescript('DROP TABLE rounds; CREATE TABLE rounds(id INTEGER PRIMARY KEY,count INTEGER DEFAULT 0,target INTEGER,winner TEXT,winner_name TEXT,dish TEXT); INSERT INTO rounds VALUES(1,20,20,"legacy","老用户",NULL);')
        app.initialize()
        c = Client(self.base)
        s = c.call('state')[1]
        self.assertEqual(s['count'], 20)
        self.assertGreaterEqual(s['choiceRemaining'], 0)
        self.assertNotIn('legacy', json.dumps(s))


if __name__ == '__main__':
    unittest.main()

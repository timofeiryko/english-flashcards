import tempfile
import unittest
import sqlite3
import json
import hashlib
from unittest.mock import patch
from pathlib import Path
from server import create_app


class ProgressTest(unittest.TestCase):
    def test_auth_validation_and_persistence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'test.sqlite3'
            app = create_app(path)
            client = app.test_client()
            headers = {'X-Flashcards': '1'}
            self.assertEqual(client.get('/api/progress').status_code, 401)
            self.assertEqual(client.post('/api/login', json={'username':'tim', 'password':'wrong'}, headers=headers).status_code, 401)
            self.assertEqual(client.post('/api/login', json={'username':'tim', 'password':'tim'}).status_code, 403)
            self.assertEqual(client.post('/api/login', json={'username':'tim', 'password':'tim'}, headers=headers).status_code, 200)
            state = dict(hard=[1], seen=[0,1], deck=[1,0], index=1, unit='all', mode='word', only=False)
            headers['If-Match'] = client.get('/api/progress').json['revision']
            self.assertEqual(client.put('/api/progress', json=state, headers=headers).status_code, 200)
            self.assertEqual(client.put('/api/progress', json={**state,'index':5}, headers=headers).status_code, 400)
            other = create_app(path).test_client()
            other.post('/api/login', json={'username':'tim', 'password':'tim'}, headers=headers)
            self.assertEqual(other.get('/api/progress').json['progress'], state)
            self.assertEqual(other.put('/api/progress', json={**state, 'hard':[]}, headers=headers).status_code, 409)
            self.assertEqual(other.get('/api/progress').json['progress'], state)
            self.assertEqual(other.put('/api/progress', json=state, headers={'X-Flashcards':'1'}).status_code, 409)
            self.assertEqual(other.put('/api/study', json={'key':'essay-draft','value':'My essay'}, headers=headers).status_code, 200)
            self.assertEqual(other.put('/api/study', json={'key':'kerch-1','value':2}, headers=headers).status_code, 200)
            self.assertEqual(other.put('/api/study', json={'key':'../bad','value':2}, headers=headers).status_code, 400)
            self.assertEqual(other.get('/api/study').json['study'], {'essay-draft':'My essay', 'kerch-1':2})
            self.assertEqual(other.get('/api/progress').json['progress'], state)
            client.post('/api/logout', headers=headers)
            self.assertEqual(client.get('/api/progress').status_code, 401)

    def test_existing_database_and_legacy_cookie_survive(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'existing.sqlite3'
            raw = '{"hard":[62,171],"seen":[3,62,171],"deck":[171,62,3],"index":2,"unit":"all","mode":"definition","only":false}'
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE progress (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)')
                db.execute('INSERT INTO progress VALUES(1,?)', (raw,))
            db.close()
            with patch.dict('os.environ', {'COOKIE_PATH':'/flashcards/', 'COOKIE_SECURE':'1'}):
                app = create_app(path)
                client = app.test_client()
                h = {'X-Flashcards':'1'}
                login = client.post('/api/login', json={'username':'tim','password':'tim'}, headers=h)
                cookie = client.get_cookie('english_session', path='/flashcards/')
                client.set_cookie('english_session', cookie.value, path='/')
                migrated = client.get('/legacy')
                self.assertEqual(migrated.location, '/flashcards/')
                self.assertTrue(any('Path=/flashcards/' in c and 'Secure' in c for c in migrated.headers.getlist('Set-Cookie')))
                self.assertTrue(any('Path=/english/' in c and 'Max-Age=0' in c for c in migrated.headers.getlist('Set-Cookie')))
                self.assertEqual(client.get('/api/progress').json['progress'], json.loads(raw))
                self.assertEqual(client.get('/api/progress').json['revision'], hashlib.sha256(raw.encode()).hexdigest())
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute('SELECT data FROM progress WHERE id=1').fetchone()[0], raw)
            db.close()


if __name__ == '__main__':
    unittest.main()

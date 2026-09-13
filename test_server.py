import tempfile
import unittest
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
            self.assertEqual(client.put('/api/progress', json=state, headers=headers).status_code, 200)
            self.assertEqual(client.put('/api/progress', json={**state,'index':5}, headers=headers).status_code, 400)
            other = create_app(path).test_client()
            other.post('/api/login', json={'username':'tim', 'password':'tim'}, headers=headers)
            self.assertEqual(other.get('/api/progress').json['progress'], state)
            client.post('/api/logout', headers=headers)
            self.assertEqual(client.get('/api/progress').status_code, 401)


if __name__ == '__main__':
    unittest.main()

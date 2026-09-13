"""Single-user demo flashcards with server-side sessions and SQLite progress."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
from contextlib import contextmanager

from flask import Flask, abort, jsonify, request, send_file
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).parent


def create_app(db_path=None):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = 20000
    database = str(db_path or os.environ.get('DATABASE_PATH', ROOT / 'progress.sqlite3'))
    password_hash = generate_password_hash(os.environ.get('DEMO_PASSWORD', 'tim'))

    @contextmanager
    def connect():
        db = sqlite3.connect(database, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
        ''')

    def token_hash():
        return hashlib.sha256(request.cookies.get('english_session', '').encode()).hexdigest()

    @app.before_request
    def guard():
        if not request.path.startswith('/api/'):
            return
        if request.method in ('POST', 'PUT'):
            # Custom header + no CORS prevents cross-origin browser writes.
            if request.headers.get('X-Flashcards') != '1':
                abort(403)
        if request.path != '/api/login':
            with connect() as db:
                session = db.execute('SELECT expires FROM sessions WHERE token=?', (token_hash(),)).fetchone()
            if not session or session[0] < time.time():
                abort(401)

    @app.after_request
    def headers(response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/')
    def index():
        return send_file(ROOT / 'index.html')

    @app.post('/api/login')
    def login():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or data.get('username') != 'tim' or not isinstance(data.get('password'), str) or not check_password_hash(password_hash, data['password']):
            abort(401)
        token = secrets.token_urlsafe(32)
        with connect() as db:
            db.execute('DELETE FROM sessions WHERE expires < ?', (int(time.time()),))
            db.execute('INSERT INTO sessions VALUES (?, ?)', (hashlib.sha256(token.encode()).hexdigest(), int(time.time()) + 30*86400))
        response = jsonify(user='tim')
        response.set_cookie('english_session', token, httponly=True, samesite='Strict', secure=os.environ.get('COOKIE_SECURE') == '1', path=os.environ.get('COOKIE_PATH', '/'), max_age=30*86400)
        return response

    @app.post('/api/logout')
    def logout():
        with connect() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (token_hash(),))
        response = jsonify(ok=True)
        response.delete_cookie('english_session', path=os.environ.get('COOKIE_PATH', '/'))
        return response

    @app.get('/api/progress')
    def get_progress():
        with connect() as db:
            row = db.execute('SELECT data FROM progress WHERE id=1').fetchone()
        return jsonify(user='tim', progress=json.loads(row[0]) if row else None)

    @app.put('/api/progress')
    def save_progress():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {'hard', 'seen', 'deck', 'index', 'unit', 'mode', 'only'}:
            abort(400)
        for key in ('hard', 'seen', 'deck'):
            items = data[key]
            if not isinstance(items, list) or len(items) > 288 or any(type(i) is not int or not 0 <= i < 288 for i in items) or len(set(items)) != len(items):
                abort(400)
        if data['unit'] not in ('all', '4', '5', '6') or data['mode'] not in ('word', 'definition') or type(data['only']) is not bool:
            abort(400)
        if type(data['index']) is not int or not 0 <= data['index'] < max(1, len(data['deck'])):
            abort(400)
        with connect() as db:
            db.execute('INSERT INTO progress VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (json.dumps(data),))
        return jsonify(ok=True)

    return app


if __name__ == '__main__':
    from waitress import serve
    serve(create_app(), host=os.environ.get('HOST', '127.0.0.1'), port=int(os.environ.get('PORT', '8080')))

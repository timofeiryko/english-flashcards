# Academic English Flashcards

288 vocabulary flashcards for Units 4–6: Values, Ecology and Health, Intelligence.

Open `index.html` in a browser. The HTML contains the complete card dataset.

- English explanations with Russian translations below.
- Word → explanation and explanation → word modes.
- Unit selection, shuffle, and difficult-card review.
- Material Design 3 inspired interface with light and dark themes.
- Guest marks last for the current session. Sign in on https://tryko.site/english/ to save progress in SQLite.

## Server

Run `pip install -r requirements.txt` then `python server.py`. Open http://127.0.0.1:8080/. Demo login: `tim` / `tim`. Configure `DATABASE_PATH`, `PORT`, `COOKIE_SECURE=1` (HTTPS), `COOKIE_PATH` and optionally `DEMO_PASSWORD` via environment variables. SQLite files are excluded from Git.

Progress includes current card and shuffled order, seen and difficult cards, topic and mode. The demo account is shared by anyone using these credentials. Latest save wins across simultaneous devices.

Tests: `python -m unittest test_server -v`.

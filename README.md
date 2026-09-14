# Academic English Flashcards

288 vocabulary flashcards for Units 4–6: Values, Ecology and Health, Intelligence.

Open `index.html` in a browser alongside `app.js` and `study.css`. The HTML contains the complete card dataset. Live application: https://tryko.site/flashcards/.

- English explanations with Russian translations below.
- Word → explanation and explanation → word modes.
- Unit selection, shuffle, and difficult-card review.
- Material Design 3 inspired interface with light and dark themes.
- Reading summaries, detailed recall questions, self-assessment and vocabulary exercises.
- Essay structure, examples, saved outline/draft and checklist.
- Presentation practice guide.
- Guest marks last for the current session. Sign in on https://tryko.site/flashcards/ to save progress in SQLite.

## Server

Run `pip install -r requirements.txt` then `python server.py`. Open http://127.0.0.1:8080/. Demo login: `tim` / `tim`. Configure `DATABASE_PATH`, `PORT`, `COOKIE_SECURE=1` (HTTPS), `COOKIE_PATH` and optionally `DEMO_PASSWORD` via environment variables. SQLite files are excluded from Git.

Progress includes current card and shuffled order, seen and difficult cards, topic and mode. The demo account is shared by anyone using these credentials. Vocabulary writes use a revision check: stale clients receive HTTP 409. The current client merges explicit changes to difficult cards and combines seen cards before retrying. Unsaved changes are also cached locally until acknowledged. Reading marks and essay fields live in a separate `study` table and are saved per field.

Do not reorder or replace the 288 vocabulary items: their array positions are persistent IDs. Keep `DATABASE_PATH=/var/lib/english-flashcards/progress.sqlite3` on production. Never deploy a local SQLite file. Back up the live database with SQLite's backup API before deployment. `/legacy` migrates an existing session cookie from `/english/` when routed through the old URL. Set production `COOKIE_PATH=/flashcards/`.

Tests: `python -m unittest test_server -v`.

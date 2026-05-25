import sqlite3
import os

DB_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DB_DIR, 'pomodoro.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            is_completed INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            session_type TEXT DEFAULT 'work',
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES ('work_duration', '25');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('break_duration', '5');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('long_break_duration', '15');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('long_break_interval', '4');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sound_enabled', '1');
    """)
    conn.commit()
    conn.close()

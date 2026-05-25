from flask import Flask, render_template, request, jsonify, g
from database import get_db, init_db

app = Flask(__name__)


@app.before_request
def before_request():
    g.db = get_db()


@app.teardown_request
def teardown_request(exception):
    db = g.pop('db', None)
    if db:
        db.close()


# ── Pages ──────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Settings API ────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def get_settings():
    rows = g.db.execute("SELECT key, value FROM settings").fetchall()
    return jsonify({r['key']: r['value'] for r in rows})


@app.route('/api/settings', methods=['PUT'])
def update_settings():
    data = request.get_json()
    for key, value in data.items():
        g.db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    g.db.commit()
    return jsonify({"status": "ok"})


# ── Tasks API ──────────────────────────────────────────

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    rows = g.db.execute(
        "SELECT id, title, is_completed, created_at FROM tasks ORDER BY is_completed ASC, created_at DESC"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    title = data.get('title', '').strip()
    if not title:
        return jsonify({"error": "任务标题不能为空"}), 400
    cursor = g.db.execute("INSERT INTO tasks (title) VALUES (?)", (title,))
    g.db.commit()
    task = g.db.execute("SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(task)), 201


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.get_json()
    if 'is_completed' in data:
        g.db.execute("UPDATE tasks SET is_completed = ? WHERE id = ?", (data['is_completed'], task_id))
    if 'title' in data:
        g.db.execute("UPDATE tasks SET title = ? WHERE id = ?", (data['title'], task_id))
    g.db.commit()
    task = g.db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify(dict(task))


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    g.db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    g.db.commit()
    return jsonify({"status": "ok"})


# ── Sessions API ───────────────────────────────────────

@app.route('/api/sessions', methods=['POST'])
def create_session():
    data = request.get_json()
    cursor = g.db.execute(
        "INSERT INTO pomodoro_sessions (task_id, start_time, end_time, session_type) VALUES (?, ?, ?, ?)",
        (data.get('task_id'), data.get('start_time'), data.get('end_time'), data.get('session_type', 'work'))
    )
    g.db.commit()
    return jsonify({"id": cursor.lastrowid}), 201


# ── Stats API ──────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    today = g.db.execute(
        "SELECT COUNT(*) as count FROM pomodoro_sessions WHERE session_type='work' AND date(start_time)=date('now','localtime')"
    ).fetchone()['count']

    week = g.db.execute("""
        SELECT date(start_time) as d, COUNT(*) as count
        FROM pomodoro_sessions
        WHERE session_type='work' AND start_time >= date('now','localtime','-6 days')
        GROUP BY d ORDER BY d
    """).fetchall()

    total_minutes = g.db.execute(
        "SELECT COALESCE(SUM(strftime('%s',end_time)-strftime('%s',start_time)),0)/60 as m FROM pomodoro_sessions WHERE session_type='work'"
    ).fetchone()['m']

    return jsonify({
        "today_count": today,
        "week_data": [{"date": r['d'], "count": r['count']} for r in week],
        "total_minutes": total_minutes
    })


if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)

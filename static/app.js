// ── 全局状态 ──────────────────────────────────────────
const state = {
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    longBreakInterval: 4,
    soundEnabled: true,

    timeLeft: 25 * 60,
    totalTime: 25 * 60,
    isRunning: false,
    sessionType: 'work',       // 'work' | 'break' | 'long_break'
    sessionCount: 0,           // completed work sessions in this cycle
    currentTaskId: null,
    currentTaskName: '无',
    timerInterval: null,
};

const CIRCUMFERENCE = 2 * Math.PI * 90; // r=90

// ── 初始化 ────────────────────────────────────────────
async function init() {
    await loadSettings();
    await loadTasks();
    await loadStats();
    updateTimerDisplay();
    updateProgressRing();
}

// ── 设置 ──────────────────────────────────────────────
async function loadSettings() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    state.workDuration = parseInt(data.work_duration) * 60;
    state.breakDuration = parseInt(data.break_duration) * 60;
    state.longBreakDuration = parseInt(data.long_break_duration) * 60;
    state.longBreakInterval = parseInt(data.long_break_interval);
    state.soundEnabled = data.sound_enabled === '1';
    state.timeLeft = state.workDuration;
    state.totalTime = state.workDuration;

    document.getElementById('set-work').value = data.work_duration;
    document.getElementById('set-break').value = data.break_duration;
    document.getElementById('set-long-break').value = data.long_break_duration;
    document.getElementById('set-interval').value = data.long_break_interval;
    document.getElementById('set-sound').checked = state.soundEnabled;

    state.sessionCount = 0;
    updateSessionInfo();
}

async function saveSettings() {
    const data = {
        work_duration: document.getElementById('set-work').value,
        break_duration: document.getElementById('set-break').value,
        long_break_duration: document.getElementById('set-long-break').value,
        long_break_interval: document.getElementById('set-interval').value,
        sound_enabled: document.getElementById('set-sound').checked ? '1' : '0',
    };
    await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    await loadSettings();
    resetTimer();
}

// ── 计时器 ────────────────────────────────────────────
function startTimer() {
    if (state.isRunning) return;
    state.isRunning = true;
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-pause').disabled = false;

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();
        updateProgressRing();
        if (state.timeLeft <= 0) {
            completeSession();
        }
    }, 1000);
}

function pauseTimer() {
    state.isRunning = false;
    clearInterval(state.timerInterval);
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = true;
}

function resetTimer() {
    pauseTimer();
    if (state.sessionType === 'work') {
        state.timeLeft = state.workDuration;
    } else if (state.sessionType === 'long_break') {
        state.timeLeft = state.longBreakDuration;
    } else {
        state.timeLeft = state.breakDuration;
    }
    state.totalTime = state.timeLeft;
    updateTimerDisplay();
    updateProgressRing();
}

function completeSession() {
    clearInterval(state.timerInterval);
    state.isRunning = false;
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = true;

    const now = new Date().toISOString();
    const startTime = new Date(Date.now() - state.totalTime * 1000).toISOString();

    fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            task_id: state.currentTaskId,
            start_time: startTime,
            end_time: now,
            session_type: state.sessionType,
        }),
    });

    notify();

    if (state.sessionType === 'work') {
        state.sessionCount++;
        if (state.sessionCount % state.longBreakInterval === 0) {
            switchTo('long_break');
        } else {
            switchTo('break');
        }
    } else {
        switchTo('work');
    }

    updateSessionInfo();
    loadStats();
}

function switchTo(type) {
    state.sessionType = type;
    if (type === 'work') {
        state.timeLeft = state.workDuration;
    } else if (type === 'long_break') {
        state.timeLeft = state.longBreakDuration;
    } else {
        state.timeLeft = state.breakDuration;
    }
    state.totalTime = state.timeLeft;
    updateTimerDisplay();
    updateProgressRing();
}

function updateTimerDisplay() {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    document.getElementById('timer-time').textContent =
        String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

    const labels = { work: '专注中', break: '休息中', long_break: '长休息中' };
    document.getElementById('timer-label').textContent = labels[state.sessionType];
}

function updateProgressRing() {
    const progress = 1 - state.timeLeft / state.totalTime;
    const offset = CIRCUMFERENCE * (1 - progress);
    document.getElementById('progress-ring').style.strokeDashoffset = offset;

    const colors = { work: '#ff6b6b', break: '#4ecdc4', long_break: '#4ecdc4' };
    document.getElementById('progress-ring').style.stroke = colors[state.sessionType];
}

function updateSessionInfo() {
    const names = { work: '工作中', break: '休息中', long_break: '长休息中' };
    document.getElementById('session-type').textContent = names[state.sessionType];
    document.getElementById('session-count').textContent = state.sessionCount + 1;
}

// ── 通知 ──────────────────────────────────────────────
function notify() {
    const messages = {
        work: '一个番茄完成！休息一下吧 🎉',
        break: '休息结束，开始新的番茄！💪',
        long_break: '长休息结束，准备专注！🚀',
    };

    if (Notification.permission === 'granted') {
        new Notification('番茄钟', { body: messages[state.sessionType] });
    } else if (Notification.permission === 'default') {
        Notification.requestPermission();
    }

    if (state.soundEnabled) {
        playSound();
    }
}

function playSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [800, 1000, 1200];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
}

// ── 任务 ──────────────────────────────────────────────
async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const list = document.getElementById('task-list');
    list.innerHTML = '';

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.is_completed ? ' completed' : '');
        li.innerHTML = `
            <input type="checkbox" ${task.is_completed ? 'checked' : ''}
                onchange="toggleTask(${task.id}, this.checked)">
            <span class="task-title">${escapeHtml(task.title)}</span>
            <button class="task-select ${state.currentTaskId === task.id ? 'active' : ''}"
                onclick="selectTask(${task.id}, '${escapeHtml(task.title)}')">关联</button>
            <button class="task-delete" onclick="deleteTask(${task.id})">&times;</button>
        `;
        list.appendChild(li);
    });
}

async function addTask() {
    const input = document.getElementById('task-input');
    const title = input.value.trim();
    if (!title) return;

    await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    input.value = '';
    await loadTasks();
}

async function toggleTask(id, completed) {
    await fetch('/api/tasks/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: completed ? 1 : 0 }),
    });
    await loadTasks();
}

async function deleteTask(id) {
    if (state.currentTaskId === id) {
        state.currentTaskId = null;
        state.currentTaskName = '无';
        document.getElementById('current-task-name').textContent = '无';
    }
    await fetch('/api/tasks/' + id, { method: 'DELETE' });
    await loadTasks();
}

function selectTask(id, name) {
    state.currentTaskId = id;
    state.currentTaskName = name;
    document.getElementById('current-task-name').textContent = name;
    loadTasks(); // refresh to update active state
}

// ── 统计 ──────────────────────────────────────────────
async function loadStats() {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('stat-today').textContent = data.today_count;
    document.getElementById('stat-total-min').textContent = data.total_minutes;

    // 周趋势图
    const chart = document.getElementById('week-chart');
    chart.innerHTML = '';
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const weekMap = {};
    data.week_data.forEach(d => { weekMap[d.date] = d.count; });

    const today = new Date();
    const maxCount = Math.max(1, ...data.week_data.map(d => d.count));

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const count = weekMap[key] || 0;
        const height = (count / maxCount) * 80 + 4;

        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = height + 'px';
        bar.title = key + ': ' + count + ' 个番茄';

        const label = document.createElement('div');
        label.className = 'chart-bar-label';
        label.textContent = days[d.getDay()];

        bar.appendChild(label);
        chart.appendChild(bar);
    }
}

// ── 标签页切换 ────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
    document.querySelector(`.tab:nth-child(${name === 'tasks' ? 1 : name === 'stats' ? 2 : 3})`).classList.add('active');
    document.getElementById('panel-' + name).style.display = 'block';

    if (name === 'stats') loadStats();
}

// ── 工具 ──────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── 启动 ──────────────────────────────────────────────
init();

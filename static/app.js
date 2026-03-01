/* =====================================================
   ARIA — Personal AI Assistant  |  app.js  Part 1/3
   Storage · State · Init · Onboarding · Nav · Chat
   ===================================================== */

// ===== STORAGE KEYS =====
const K = {
  USER: 'aria_user',
  DEADLINES: 'aria_deadlines',
  NOTES: 'aria_notes',
  QUIZ: 'aria_quiz',
  GYM: 'aria_gym',
  PERIOD: 'aria_period',
  PROGRESS: 'aria_progress',
  TOPICS: 'aria_topics',
  CHAT: 'aria_chat',
  NOTIFIED: 'aria_notified',
  EMAILED: 'aria_emailed',
  FINANCE: 'aria_finance', // { balance: 0, transactions: [], splitwise: [] }
};

// ===== STORAGE HELPERS =====
const get = (k, fallback = []) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const getObj = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ===== GLOBAL STATE =====
let currentView = 'chat';
let calendarDate = new Date();
let calendarMode = 'month';
let quizSession = null;        // {questions, currentIndex, score, total, type, subject}
let pendingDeadline = null;    // Partial deadline waiting for start date
let isSending = false;

// ===== UTILITY =====
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().split('T')[0];
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const fmtTime = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ===== DEADLINE STATUS =====
function deadlineStatus(d) {
  if (d.status === 'done') return 'done';
  const todayStr = today();
  const due = d.dueDate;
  const start = d.startDate;
  if (!due) return 'fine';
  if (due < todayStr) return 'overdue';
  const daysUntilDue = daysBetween(todayStr, due);
  if (daysUntilDue <= 2) return 'urgent';
  if (start && start <= todayStr && daysUntilDue <= 7) return 'soon';
  if (!start || start > todayStr) return 'fine';
  return 'fine';
}

function deadlineColor(d) {
  const s = deadlineStatus(d);
  if (s === 'done') return 'green';
  if (s === 'overdue' || s === 'urgent') return 'red';
  if (s === 'soon') return 'yellow';
  return 'green';
}

// ===== GYM STREAK CALC =====
function calcGymStats() {
  const log = get(K.GYM, []).sort((a, b) => a.date > b.date ? -1 : 1);
  let current = 0, best = 0, streak = 0;
  const todayStr = today();
  // Current streak (consecutive days going to gym from most recent)
  let checkDate = new Date(todayStr);
  for (let i = 0; i < 60; i++) {
    const ds = checkDate.toISOString().split('T')[0];
    const entry = log.find(e => e.date === ds);
    if (entry && entry.didGo) { streak++; }
    else if (entry && !entry.didGo) { break; }
    else if (ds < log[0]?.date || !log.length) { break; }
    else { /* no entry = didn't go */ if (ds <= todayStr) break; }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  current = streak;
  // Best streak
  let bs = 0, cs = 0;
  const sorted = [...log].sort((a, b) => a.date < b.date ? -1 : 1);
  sorted.forEach(e => { if (e.didGo) { cs++; bs = Math.max(bs, cs); } else { cs = 0; } });
  best = bs;
  // This week count
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const thisWeek = log.filter(e => e.didGo && e.date >= weekStart.toISOString().split('T')[0]).length;
  return { currentStreak: current, bestStreak: best, thisWeek };
}

// ===== PERIOD / CYCLE =====
function calcPeriodContext() {
  const log = get(K.PERIOD, []).sort((a, b) => a.startDate > b.startDate ? -1 : 1);
  if (!log.length) return {};
  const lastStart = log[0].startDate;
  // Average cycle from last 3
  let avgCycle = 28;
  if (log.length >= 2) {
    const diffs = [];
    for (let i = 0; i < Math.min(log.length - 1, 3); i++) {
      const diff = daysBetween(log[i + 1].startDate, log[i].startDate);
      if (diff > 10 && diff < 60) diffs.push(diff);
    }
    if (diffs.length) avgCycle = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }
  const nextStart = new Date(lastStart + 'T12:00:00');
  nextStart.setDate(nextStart.getDate() + avgCycle);
  const nextStr = nextStart.toISOString().split('T')[0];
  const daysUntil = daysBetween(today(), nextStr);
  const isPMS = daysUntil >= -2 && daysUntil <= 7; // within 7 days before
  return { lastStart, nextPredicted: nextStr, daysUntilNext: daysUntil, avgCycle, isPMS };
}

// ===== BUILD CONTEXT FOR API =====
function buildContext() {
  const user = getObj(K.USER) || {};
  const gym = calcGymStats();
  const periodCtx = calcPeriodContext();
  const finance = getObj(K.FINANCE) || { balance: 0, transactions: [], splitwise: [] };

  return {
    userName: user.name || 'friend',
    subjects: user.subjects || [],
    leetcodeUsername: user.leetcodeUsername || '',
    deadlines: get(K.DEADLINES, []).filter(d => d.status !== 'done').slice(0, 20),
    topics: getObj(K.TOPICS) || {},
    gym,
    periodContext: periodCtx,
    notes: get(K.NOTES, []).slice(0, 15),
    quizHistory: get(K.QUIZ, []).slice(-10),
    isPmsWeek: !!periodCtx.isPMS,
    inQuiz: !!quizSession,
    pendingDeadline: pendingDeadline || null,
    today: today(),
    balance: finance.balance,
    splitwiseReminders: finance.splitwise,
  };
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const user = getObj(K.USER);
  if (!user || !user.name) {
    document.getElementById('onboarding-modal').classList.remove('hidden');
  } else {
    startApp();
  }
});

function startApp() {
  document.getElementById('onboarding-modal').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadChatHistory();
  requestNotifPermission();
  checkEmailReminders();
  // Show welcome back message if no chat history
  const hist = get(K.CHAT, []);
  if (!hist.length) {
    const user = getObj(K.USER) || {};
    addAriaMessage(`Hey ${user.name || 'there'}! 👋 I'm Aria — your personal AI assistant. I'm here to help with your deadlines, study goals, quizzes, and more. What do you need? ✦`);
  }
}

// ===== ONBOARDING =====
const obData = { name: '', leetcode: '', subjects: [] };

function obNext(step) {
  if (step === 1) {
    const name = document.getElementById('ob-name').value.trim();
    if (!name) { document.getElementById('ob-name').focus(); return; }
    obData.name = name;
    document.getElementById('ob-step-1').classList.add('hidden');
    document.getElementById('ob-step-2').classList.remove('hidden');
    setTimeout(() => document.getElementById('ob-leetcode').focus(), 100);
  } else if (step === 2) {
    obData.leetcode = document.getElementById('ob-leetcode').value.trim();
    document.getElementById('ob-step-2').classList.add('hidden');
    document.getElementById('ob-step-3').classList.remove('hidden');
    setTimeout(() => document.getElementById('ob-subject-input').focus(), 100);
  }
}

function obSkip(step) {
  if (step === 2) {
    document.getElementById('ob-step-2').classList.add('hidden');
    document.getElementById('ob-step-3').classList.remove('hidden');
  }
}

function obAddSubject() {
  const inp = document.getElementById('ob-subject-input');
  const val = inp.value.trim();
  if (!val || obData.subjects.includes(val)) { inp.value = ''; return; }
  obData.subjects.push(val);
  inp.value = '';
  renderObChips();
  inp.focus();
}

function renderObChips() {
  const el = document.getElementById('ob-subjects-chips');
  el.innerHTML = obData.subjects.map((s, i) =>
    `<span class="chip">${s}<button class="chip-x" onclick="obRemoveSubject(${i})">×</button></span>`
  ).join('');
}

function obRemoveSubject(i) {
  obData.subjects.splice(i, 1);
  renderObChips();
}

async function obFinish() {
  set(K.USER, { name: obData.name, leetcodeUsername: obData.leetcode, subjects: obData.subjects, emailjs: {} });
  document.getElementById('ob-step-3').classList.add('hidden');
  document.getElementById('ob-step-4').classList.remove('hidden');
  document.getElementById('ob-complete-greeting').textContent = `Getting Aria ready for you, ${obData.name}...`;
  // Get welcome message from Aria
  try {
    const ctx = buildContext();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `I just set up. My name is ${obData.name}, leetcode: ${obData.leetcode || 'none'}, subjects: ${obData.subjects.join(', ') || 'none set'}. Please welcome me warmly and briefly.`,
        context: ctx,
        chatHistory: []
      })
    });
    const data = await res.json();
    saveChat('aria', data.message || `Welcome aboard, ${obData.name}! ✦ I'm so excited to be your assistant!`);
  } catch (e) {
    saveChat('aria', `Hey ${obData.name}! ✦ So great to meet you! I'm Aria — your personal AI sidekick. I'll help you crush your deadlines, ace your courses, and stay on top of everything. Let's get started!`);
  }
  setTimeout(() => {
    document.getElementById('onboarding-modal').classList.add('hidden');
    startApp();
  }, 1800);
}

// ===== NAVIGATION =====
function switchView(view) {
  if (currentView === view) { closeSidebar(); return; }
  document.getElementById(`view-${currentView}`).classList.remove('active');
  document.getElementById(`view-${currentView}`).classList.add('hidden');
  document.getElementById(`nav-${currentView}`).classList.remove('active');

  currentView = view;
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById(`view-${view}`).classList.add('active');
  document.getElementById(`nav-${view}`).classList.add('active');

  closeSidebar();

  // Trigger view render
  if (view === 'calendar') renderCalendar();
  if (view === 'progress') renderProgress();
  if (view === 'leetcode') renderLeetCodeView();
  if (view === 'notes') renderNotes();
  if (view === 'finance') renderFinanceView();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ===== CHAT =====
function loadChatHistory() {
  const hist = get(K.CHAT, []);
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  hist.slice(-40).forEach(m => renderMessageDOM(m.role, m.content, m.ts));
  scrollToBottom();
}

function saveChat(role, content) {
  const hist = get(K.CHAT, []);
  hist.push({ role, content, ts: new Date().toISOString() });
  if (hist.length > 80) hist.splice(0, hist.length - 80);
  set(K.CHAT, hist);
}

function renderMessageDOM(role, content, ts) {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const time = ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  if (role === 'aria') {
    wrap.innerHTML = `
      <div class="msg-avatar">✦</div>
      <div>
        <div class="msg-bubble">${escapeHtml(content)}</div>
        <div class="msg-time">${time}</div>
      </div>`;
  } else {
    wrap.innerHTML = `
      <div>
        <div class="msg-bubble">${escapeHtml(content)}</div>
        <div class="msg-time" style="text-align:right">${time}</div>
      </div>`;
  }
  container.appendChild(wrap);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function addAriaMessage(text) {
  const ts = new Date().toISOString();
  saveChat('aria', text);
  renderMessageDOM('aria', text, ts);
  scrollToBottom();
}

function scrollToBottom() {
  const c = document.getElementById('chat-messages');
  c.scrollTop = c.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.id = 'typing-indicator';
  el.className = 'typing-indicator';
  el.innerHTML = `<div class="msg-avatar">✦</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
  container.appendChild(el);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function quickSend(text) {
  const inp = document.getElementById('chat-input');
  inp.value = text;
  sendMessage();
}

async function sendMessage() {
  if (isSending) return;
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text) return;

  inp.value = '';
  inp.style.height = 'auto';
  inp.disabled = true;
  document.getElementById('send-btn').disabled = true;
  isSending = true;

  // Render user message
  const ts = new Date().toISOString();
  saveChat('user', text);
  renderMessageDOM('user', text, ts);
  scrollToBottom();

  // Update aria status
  document.getElementById('aria-status').textContent = 'Thinking...';
  showTyping();

  try {
    const ctx = buildContext();
    const hist = get(K.CHAT, []).slice(-20);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, context: ctx, chatHistory: hist })
    });
    const data = await res.json();
    hideTyping();
    document.getElementById('aria-status').textContent = 'Online';

    const msg = data.message || 'Sorry, I had a brain glitch. Try again?';
    addAriaMessage(msg);

    if (data.action) handleAction(data.action, text);

  } catch (err) {
    console.error("Chat error:", err);
    hideTyping();
    document.getElementById('aria-status').textContent = 'Online';
    addAriaMessage("Hmm, something went wrong connecting to my brain. Check your internal connection and ensure your Groq API key is set correctly! 🧠");
  } finally {
    inp.disabled = false;
    document.getElementById('send-btn').disabled = false;
    isSending = false;
    inp.focus();
  }
}

function showDeadlinesSummary() {
  quickSend('list all my current deadlines');
}

function showTodayFocus() {
  quickSend('what should I focus on today');
}

/* =====================================================
   ARIA — app.js  Part 2/3
   Action Handlers · Deadline Utils · Calendar
   ===================================================== */

// ===== ACTION HANDLER ROUTER =====
function handleAction(action, userMsg) {
  if (!action || !action.type) return;
  const d = action.data || {};
  switch (action.type) {
    case 'ADD_DEADLINE': handleAddDeadline(d); break;
    case 'UPDATE_DEADLINE': handleUpdateDeadline(d); break;
    case 'COMPLETE_DEADLINE': handleCompleteDeadline(d); break;
    case 'DELETE_DEADLINE': handleDeleteDeadline(d); break;
    case 'ADD_NOTE': handleAddNote(d); break;
    case 'DELETE_NOTE': handleDeleteNote(d); break;
    case 'LOG_GYM': handleLogGym(d); break;
    case 'LOG_PERIOD_START': handlePeriodStart(d); break;
    case 'LOG_PERIOD_END': handlePeriodEnd(d); break;
    case 'ADD_TOPIC': handleAddTopic(d); break;
    case 'COMPLETE_TOPIC': handleCompleteTopic(d); break;
    case 'LOG_DAILY_PROGRESS': handleLogProgress(d); break;
    case 'START_QUIZ': handleStartQuiz(d); break;
    case 'GRADE_QUIZ': handleGradeQuiz(d); break;
    case 'ADD_SUBJECT': handleAddSubject(d); break;
    case 'REMOVE_SUBJECT': handleRemoveSubject(d); break;
    case 'SET_BALANCE': handleSetBalance(d); break;
    case 'ADD_TRANSACTION': handleAddTransaction(d); break;
    case 'ADD_SPLITWISE': handleAddSplitwise(d); break;
    case 'COMPLETE_SPLITWISE': handleCompleteSplitwise(d); break;
  }
}

// ===== DEADLINE ACTIONS =====
function handleAddDeadline(d) {
  if (d.askingForStartDate) {
    pendingDeadline = { ...d };
    return;
  }
  pendingDeadline = null;
  const deadlines = get(K.DEADLINES, []);
  const entry = {
    id: uid(),
    title: d.title || 'Untitled',
    subject: d.subject || '',
    dueDate: d.dueDate || '',
    startDate: d.startDate || '',
    type: d.type || 'assignment',
    status: 'active',
    createdAt: today(),
    midwayChecked: false,
  };
  deadlines.push(entry);
  set(K.DEADLINES, deadlines);
  showToast(`📅 Deadline added: ${entry.title}`, 'success');
  scheduleDeadlineNotifs();
  scheduleEmailReminders();
}

function handleUpdateDeadline(d) {
  const deadlines = get(K.DEADLINES, []);
  const idx = deadlines.findIndex(x => x.id === d.id);
  if (idx !== -1) {
    deadlines[idx] = { ...deadlines[idx], ...(d.updates || {}) };
    set(K.DEADLINES, deadlines);
    showToast('Deadline updated ✓', 'success');
  }
}

function handleCompleteDeadline(d) {
  const deadlines = get(K.DEADLINES, []);
  const idx = deadlines.findIndex(x => x.id === d.id || x.title?.toLowerCase() === d.title?.toLowerCase());
  if (idx !== -1) {
    deadlines[idx].status = 'done';
    deadlines[idx].completedAt = today();
    set(K.DEADLINES, deadlines);
    showToast(`✅ "${deadlines[idx].title}" marked as done!`, 'success');
  }
}

function handleDeleteDeadline(d) {
  let deadlines = get(K.DEADLINES, []);
  deadlines = deadlines.filter(x => x.id !== d.id);
  set(K.DEADLINES, deadlines);
  showToast('Deadline removed', 'info');
}

// ===== NOTE ACTIONS =====
function handleAddNote(d) {
  const notes = get(K.NOTES, []);
  notes.unshift({ id: uid(), text: d.text, createdAt: today() });
  set(K.NOTES, notes);
  showToast('📝 Note saved!', 'success');
  if (currentView === 'notes') renderNotes();
}

function handleDeleteNote(d) {
  let notes = get(K.NOTES, []);
  notes = notes.filter(n => n.id !== d.id);
  set(K.NOTES, notes);
  showToast('Note deleted', 'info');
  if (currentView === 'notes') renderNotes();
}

// ===== GYM ACTIONS =====
function handleLogGym(d) {
  const log = get(K.GYM, []);
  const existing = log.findIndex(e => e.date === d.date);
  if (existing !== -1) log[existing] = d;
  else log.push(d);
  set(K.GYM, log);
  const stats = calcGymStats();
  showToast(d.didGo ? `💪 Gym logged! Streak: ${stats.currentStreak} days` : 'Gym skip logged', d.didGo ? 'success' : 'info');
  if (currentView === 'progress') renderProgress();
}

// ===== PERIOD ACTIONS =====
function handlePeriodStart(d) {
  const log = get(K.PERIOD, []);
  const existing = log.findIndex(e => e.startDate === d.date);
  if (existing !== -1) return;
  log.unshift({ id: uid(), startDate: d.date, endDate: null });
  set(K.PERIOD, log);

  // Also save to Supabase
  const user = getObj(K.USER) || {};
  fetch('/api/period/log-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.name || 'default_user', date: d.date, notes: 'Period started' })
  }).catch(() => { });

  showToast('🌸 Period start logged', 'info');
  if (currentView === 'progress') renderProgress();
}

function handlePeriodEnd(d) {
  const log = get(K.PERIOD, []);
  if (log.length && !log[0].endDate) {
    log[0].endDate = d.endDate || today();

    // Also save to Supabase
    const user = getObj(K.USER) || {};
    fetch('/api/period/log-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.name || 'default_user',
        startDate: log[0].startDate,
        endDate: d.endDate || today()
      })
    }).catch(() => { });

    set(K.PERIOD, log);
  }
  showToast('Period end logged ✓', 'info');
}

// ===== TOPIC ACTIONS =====
function handleAddTopic(d) {
  const topics = getObj(K.TOPICS) || {};
  if (!topics[d.subject]) topics[d.subject] = { topics: [], completed: [] };
  const existing = new Set(topics[d.subject].topics);
  (d.topics || []).forEach(t => existing.add(t));
  topics[d.subject].topics = [...existing];
  set(K.TOPICS, topics);
  showToast(`📚 Topics added for ${d.subject}`, 'success');
  if (currentView === 'progress') renderProgress();
}

function handleCompleteTopic(d) {
  const topics = getObj(K.TOPICS) || {};
  if (!topics[d.subject]) topics[d.subject] = { topics: [], completed: [] };
  const already = topics[d.subject].completed.find(c => c.topic === d.topic);
  if (!already) topics[d.subject].completed.push({ topic: d.topic, date: today() });
  set(K.TOPICS, topics);
  showToast(`✅ "${d.topic}" completed!`, 'success');
  if (currentView === 'progress') renderProgress();
}

// ===== PROGRESS LOG =====
function handleLogProgress(d) {
  const prog = get(K.PROGRESS, []);
  prog.unshift({ id: uid(), summary: d.summary, date: d.date || today() });
  set(K.PROGRESS, prog);
  showToast('Daily progress logged ✓', 'success');
  if (currentView === 'progress') renderProgress();
}

// ===== SUBJECT ACTIONS =====
function handleAddSubject(d) {
  const user = getObj(K.USER) || {};
  if (!user.subjects) user.subjects = [];
  if (!user.subjects.includes(d.subject)) {
    user.subjects.push(d.subject);
    set(K.USER, user);
    showToast(`Subject added: ${d.subject}`, 'success');
  }
}

function handleRemoveSubject(d) {
  const user = getObj(K.USER) || {};
  if (!user.subjects) return;
  user.subjects = user.subjects.filter(s => s.toLowerCase() !== d.subject.toLowerCase());
  set(K.USER, user);
  showToast(`Subject removed: ${d.subject}`, 'info');
}

// ===== FINANCE ACTIONS =====
function getFinance() {
  return getObj(K.FINANCE) || { balance: 0, transactions: [], splitwise: [] };
}

function handleSetBalance(d) {
  const f = getFinance();
  f.balance = typeof d.amount === 'number' ? d.amount : parseFloat(d.amount) || 0;
  set(K.FINANCE, f);
  showToast(`Balance updated to $${f.balance.toFixed(2)}`, 'success');
  if (currentView === 'finance') renderFinanceView();
}

function handleAddTransaction(d) {
  const f = getFinance();
  const amt = typeof d.amount === 'number' ? Math.abs(d.amount) : Math.abs(parseFloat(d.amount) || 0);
  const type = d.type === 'income' ? 'income' : 'expense';

  if (type === 'income') f.balance += amt;
  else f.balance -= amt;

  f.transactions.unshift({
    id: uid(),
    date: today(),
    amount: amt,
    type: type,
    description: d.description || 'Transaction'
  });

  // Keep only last 50 transactions
  if (f.transactions.length > 50) f.transactions.pop();

  set(K.FINANCE, f);
  showToast(`${type === 'income' ? 'Income' : 'Expense'} of $${amt.toFixed(2)} logged!`, 'success');
  if (currentView === 'finance') renderFinanceView();
}

function handleAddSplitwise(d) {
  const f = getFinance();
  const amt = typeof d.amount === 'number' ? d.amount : parseFloat(d.amount) || 0;
  f.splitwise.push({
    id: uid(),
    date: today(),
    amount: amt,
    description: d.description || 'Splitwise Item',
    status: 'pending'
  });
  set(K.FINANCE, f);
  showToast(`Splitwise reminder added: $${amt.toFixed(2)}`, 'success');
  if (currentView === 'finance') renderFinanceView();
}

function handleCompleteSplitwise(d) {
  const f = getFinance();
  let found = false;

  // Try to find by ID first, then fallback to description matching
  let item = f.splitwise.find(s => s.id === d.id && s.status === 'pending');
  if (!item && d.description) {
    item = f.splitwise.find(s => s.status === 'pending' && s.description.toLowerCase().includes(d.description.toLowerCase()));
  }

  if (item) {
    item.status = 'done';
    found = true;
    set(K.FINANCE, f);
    showToast(`Checked off Splitwise: ${item.description}`, 'success');
    if (currentView === 'finance') renderFinanceView();
  }
}

// ===== QUIZ ACTIONS =====
async function handleStartQuiz(d) {
  showToast('Generating quiz questions... 📝', 'info');
  try {
    const ctx = buildContext();
    const res = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizType: d.quizType || 'mixed', count: d.count || 5, subject: d.subject || '', context: ctx })
    });
    const data = await res.json();
    if (data.error) { addAriaMessage(`Couldn't generate quiz: ${data.error}`); return; }
    // Parse questions
    const lines = data.questions.split('\n').filter(l => l.trim());
    const questions = [];
    let cur = '';
    for (const l of lines) {
      if (/^Q\d+\./.test(l.trim())) {
        if (cur) questions.push(cur.trim());
        cur = l;
      } else { cur += '\n' + l; }
    }
    if (cur) questions.push(cur.trim());

    quizSession = { questions, currentIndex: 0, score: 0, total: questions.length, type: d.quizType || 'mixed', subject: d.subject || '', startedAt: Date.now() };
    // Display first question
    if (questions.length) {
      const msg = `🎯 Quiz time! ${questions.length} questions. Let's go!\n\n${questions[0]}`;
      addAriaMessage(msg);
    }
  } catch (e) {
    console.error("Quiz error:", e);
    addAriaMessage("Couldn't fetch quiz questions. Check your connection and Groq API key!");
  }
}

function handleGradeQuiz(d) {
  quizSession = null;
  const quiz = get(K.QUIZ, []);
  quiz.push({ id: uid(), date: today(), score: d.score, total: d.total, subject: d.subject || 'Mixed', pct: d.total ? Math.round((d.score / d.total) * 100) : 0 });
  set(K.QUIZ, quiz);
  showToast(`Quiz done! Score: ${d.score}/${d.total} 🎉`, 'success');
}

// ===== CALENDAR =====
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function renderCalendar() {
  updateCalPeriodLabel();
  calendarMode === 'month' ? renderMonthView() : renderWeekView();
}

function updateCalPeriodLabel() {
  const el = document.getElementById('cal-period-label');
  const toggle = document.getElementById('cal-toggle-btn');
  if (calendarMode === 'month') {
    el.textContent = `${MONTHS[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
    toggle.textContent = 'Week View';
  } else {
    const ws = getWeekStart(calendarDate);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    el.textContent = `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${ws.getMonth() !== we.getMonth() ? MONTHS[we.getMonth()] + ' ' : ''}${we.getDate()}, ${we.getFullYear()}`;
    toggle.textContent = 'Month View';
  }
}

function calPrev() {
  if (calendarMode === 'month') { calendarDate.setMonth(calendarDate.getMonth() - 1); }
  else { calendarDate.setDate(calendarDate.getDate() - 7); }
  calendarDate = new Date(calendarDate);
  renderCalendar();
}

function calNext() {
  if (calendarMode === 'month') { calendarDate.setMonth(calendarDate.getMonth() + 1); }
  else { calendarDate.setDate(calendarDate.getDate() + 7); }
  calendarDate = new Date(calendarDate);
  renderCalendar();
}

function toggleCalendarMode() {
  calendarMode = calendarMode === 'month' ? 'week' : 'month';
  renderCalendar();
}

function getWeekStart(d) {
  const ws = new Date(d);
  ws.setDate(ws.getDate() - ws.getDay());
  return ws;
}

function deadlinesForDate(dateStr) {
  const d = get(K.DEADLINES, []);
  return d.filter(x => x.dueDate === dateStr || x.startDate === dateStr);
}

function renderMonthView() {
  const grid = document.getElementById('calendar-grid');
  const y = calendarDate.getFullYear(), m = calendarDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = today();

  let html = '<div class="cal-month-grid">';
  DAYS.forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    const prevDate = new Date(y, m, -firstDay + i + 1);
    html += `<div class="cal-day other-month"><div class="cal-day-num">${prevDate.getDate()}</div></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const entries = deadlinesForDate(dateStr);
    const dots = entries.map(e => {
      const color = e.dueDate === dateStr ? deadlineColor(e) : 'purple';
      return `<span class="cal-dot ${color}" title="${e.title}"></span>`;
    }).join('');
    html += `<div class="cal-day${isToday ? ' today' : ''}" onclick="showDayDetail('${dateStr}')">
      <div class="cal-day-num">${day}</div>
      <div class="cal-dot-row">${dots}</div>
    </div>`;
  }

  // Trailing cells
  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= trailing; i++) {
    html += `<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;
  }

  html += '</div>';
  grid.innerHTML = html;
}

function renderWeekView() {
  const grid = document.getElementById('calendar-grid');
  const ws = getWeekStart(calendarDate);
  const todayStr = today();

  let html = '<div class="cal-week-grid">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const isToday = dateStr === todayStr;
    const entries = deadlinesForDate(dateStr);
    const items = entries.map(e => {
      const color = e.dueDate === dateStr ? deadlineColor(e) : 'purple';
      return `<div class="cal-deadline-item ${color}" title="${e.subject}">${e.title}</div>`;
    }).join('');
    html += `<div class="cal-week-day${isToday ? ' today' : ''}">
      <div class="cal-week-day-header">${DAYS[d.getDay()]}</div>
      <div class="cal-week-day-num">${d.getDate()}</div>
      ${items || '<div style="font-size:11px;color:var(--text3);margin-top:4px">Free</div>'}
    </div>`;
  }
  html += '</div>';
  grid.innerHTML = html;
}

function showDayDetail(dateStr) {
  const panel = document.getElementById('calendar-day-detail');
  const entries = deadlinesForDate(dateStr);
  if (!entries.length) { panel.classList.add('hidden'); return; }
  let html = `<strong style="color:var(--text2);font-size:13px;">${fmtDate(dateStr)}</strong><br>`;
  entries.forEach(e => {
    const color = e.dueDate === dateStr ? deadlineColor(e) : 'purple';
    const label = e.dueDate === dateStr ? 'DUE' : 'START';
    html += `<span class="cal-deadline-item ${color}" style="display:inline-block;margin:4px 4px 0 0">[${label}] ${e.title}${e.subject ? ' · ' + e.subject : ''}</span>`;
  });
  panel.innerHTML = html;
  panel.classList.remove('hidden');
}

/* =====================================================
   ARIA — app.js  Part 3/3
   Progress · LeetCode · Notes · Settings · Notifications · EmailJS
   ===================================================== */

// ===== PROGRESS VIEW =====
let currentProgressTab = 'daily';

function renderProgress() {
  showProgressTab(currentProgressTab);
}

function showProgressTab(tab) {
  currentProgressTab = tab;
  ['daily', 'topics', 'gym', 'cycle'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`tab-content-${t}`).classList.toggle('hidden', t !== tab);
  });
  if (tab === 'daily') renderDailyLog();
  if (tab === 'topics') renderTopicsTab();
  if (tab === 'gym') renderGymTab();
  if (tab === 'cycle') renderCycleTab();
}

function renderDailyLog() {
  const el = document.getElementById('tab-content-daily');
  const log = get(K.PROGRESS, []);
  if (!log.length) {
    el.innerHTML = `<div class="empty-state"><p>No daily logs yet!</p><p class="empty-sub">Say <em>"daily wrapup"</em> to Aria to log your day 📅</p></div>`;
    return;
  }
  el.innerHTML = log.slice(0, 30).map(e => `
    <div class="log-entry">
      <div class="log-entry-date">${fmtDate(e.date)}</div>
      <div class="log-entry-text">${escapeHtml(e.summary)}</div>
    </div>
  `).join('');
}

function renderTopicsTab() {
  const el = document.getElementById('tab-content-topics');
  const topics = getObj(K.TOPICS) || {};
  const subjects = Object.keys(topics);
  if (!subjects.length) {
    el.innerHTML = `<div class="empty-state"><p>No topics tracked yet!</p><p class="empty-sub">Tell Aria: <em>"I am covering system design this month, topics are: load balancing, caching, databases"</em></p></div>`;
    return;
  }
  el.innerHTML = subjects.map(sub => {
    const data = topics[sub];
    const allTopics = data.topics || [];
    const completed = data.completed || [];
    const completedSet = new Set(completed.map(c => c.topic));
    const pct = allTopics.length ? Math.round((completedSet.size / allTopics.length) * 100) : 0;
    const color = pct >= 70 ? 'bar-green' : pct >= 40 ? 'bar-yellow' : 'bar-purple';
    const topicList = allTopics.map(t => {
      const done = completedSet.has(t);
      const info = done ? completed.find(c => c.topic === t) : null;
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="color:${done ? 'var(--green)' : 'var(--text3)'}">${done ? '✓' : '○'}</span>
        <span style="color:${done ? 'var(--text)' : 'var(--text2)'};">${escapeHtml(t)}</span>
        ${info ? `<span style="color:var(--text3);font-size:11px;margin-left:auto">${fmtDate(info.date)}</span>` : ''}
      </div>`;
    }).join('');
    return `
      <div class="progress-card">
        <div class="progress-card-header">
          <div class="progress-card-title">📚 ${escapeHtml(sub)}</div>
          <span class="stat-badge">${completedSet.size}/${allTopics.length}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-label"><span>Progress</span><span>${pct}%</span></div>
          <div class="progress-bar-track"><div class="progress-bar-fill ${color}" style="width:${pct}%"></div></div>
        </div>
        ${topicList || '<p style="color:var(--text3);font-size:13px;">No topics added yet</p>'}
      </div>`;
  }).join('');
}

function renderGymTab() {
  const el = document.getElementById('tab-content-gym');
  const stats = calcGymStats();
  const log = get(K.GYM, []).sort((a, b) => a.date > b.date ? -1 : 1).slice(0, 20);
  el.innerHTML = `
    <div class="gym-stats-row">
      <div class="gym-stat"><div class="gym-stat-val">${stats.currentStreak}</div><div class="gym-stat-label">Current Streak</div></div>
      <div class="gym-stat"><div class="gym-stat-val">${stats.bestStreak}</div><div class="gym-stat-label">Best Streak</div></div>
      <div class="gym-stat"><div class="gym-stat-val">${stats.thisWeek}</div><div class="gym-stat-label">This Week</div></div>
    </div>
    ${log.map(e => `
      <div class="gym-log-row">
        <span class="gym-log-date">${fmtDate(e.date)}</span>
        <span class="gym-log-status ${e.didGo ? 'went' : 'skipped'}">${e.didGo ? '💪 Went' : '😴 Skipped'}</span>
      </div>`).join('') || '<div class="empty-state"><p>No gym logs yet. Tell Aria "went to gym today"!</p></div>'}`;
}

function renderCycleTab() {
  const el = document.getElementById('tab-content-cycle');
  const ctx = calcPeriodContext();
  const log = get(K.PERIOD, []).sort((a, b) => a.startDate > b.startDate ? -1 : 1);

  const nextPeriodHtml = !log.length || !ctx.lastStart
    ? `<div class="empty-state"><p>No cycle data yet.</p><p class="empty-sub">Tell Aria: <em>"period started on [date]"</em> or use the form below to add past dates.</p></div>`
    : (() => {
      const daysMsg = ctx.daysUntilNext > 0
        ? `in ${ctx.daysUntilNext} days`
        : ctx.daysUntilNext === 0 ? 'today' : `${Math.abs(ctx.daysUntilNext)} days ago (may be overdue)`;
      return `
          <div class="cycle-card">
            <div class="cycle-next">Next predicted period</div>
            <div class="cycle-date">${fmtDate(ctx.nextPredicted)}</div>
            <div class="cycle-days-away">${daysMsg} · avg cycle: ${ctx.avgCycle} days</div>
            ${ctx.isPMS ? '<div style="margin-top:10px;font-size:13px;color:var(--accent-light);">🌸 PMS week ahead — Aria knows to be extra gentle 💜</div>' : ''}
          </div>
          ${log.slice(0, 6).map(e => {
        const isRecent = daysBetween(e.startDate, today()) <= 10;
        return `
            <div class="gym-log-row">
              <span class="gym-log-date">🌸 ${fmtDate(e.startDate)}</span>
              <span style="font-size:12px;color:var(--text3)">${e.endDate ? 'ended ' + fmtDate(e.endDate) : (isRecent ? 'ongoing' : '')}</span>
            </div>`;
      }).join('')}`;
    })();

  el.innerHTML = `
    ${nextPeriodHtml}
    <div class="card-divider"></div>
    <div class="input-section">
      <h3 style="margin-bottom:12px;font-size:14px;color:var(--text);">📝 Add Past Period Dates</h3>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input id="period-date-input" type="date" class="modal-input" style="flex:1;max-width:200px;" />
        <button class="btn-small" onclick="addHistoricalPeriod()">Add Date</button>
      </div>
      <p style="font-size:12px;color:var(--text3);margin-bottom:12px;">Enter your past period start dates one by one. Aria will analyze your cycle pattern.</p>
    </div>
  `;
}

function addHistoricalPeriod() {
  const input = document.getElementById('period-date-input');
  if (!input.value) {
    showToast('Please select a date', 'warning');
    return;
  }

  const log = get(K.PERIOD, []);
  const existing = log.findIndex(e => e.startDate === input.value);
  if (existing !== -1) {
    showToast('This date is already logged', 'info');
    input.value = '';
    return;
  }

  log.push({ id: uid(), startDate: input.value, endDate: null });
  set(K.PERIOD, log);
  input.value = '';

  // Also save to Supabase
  const user = getObj(K.USER) || {};
  fetch('/api/period/log-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.name || 'default_user', date: input.value, notes: 'Historical data' })
  }).catch(() => { });

  showToast('📅 Period date added!', 'success');
  renderProgress();
}

// ===== LEETCODE VIEW =====
let lcCache = null;

async function refreshLeetCode() {
  const user = getObj(K.USER) || {};
  const username = user.leetcodeUsername;
  if (!username) {
    document.getElementById('leetcode-content').innerHTML = `
      <div class="empty-state"><p>No LeetCode username set!</p><p class="empty-sub">Go to ⚙️ Settings to add your username.</p></div>`;
    return;
  }
  document.getElementById('leetcode-content').innerHTML = `<div class="empty-state"><div class="typing-dots"><span></span><span></span><span></span></div><p style="margin-top:12px">Fetching stats for @${username}...</p></div>`;
  try {
    const res = await fetch(`/api/leetcode?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    lcCache = data;
    renderLeetCodeStats(data, username);
  } catch (e) {
    document.getElementById('leetcode-content').innerHTML = `<div class="empty-state"><p>Couldn't load LeetCode stats 😕</p><p class="empty-sub">${e.message}</p></div>`;
  }
}

function renderLeetCodeView() {
  if (lcCache) { renderLeetCodeStats(lcCache, (getObj(K.USER) || {}).leetcodeUsername || ''); return; }
  // Auto-refresh if username exists
  const user = getObj(K.USER) || {};
  if (user.leetcodeUsername) refreshLeetCode();
}

function renderLeetCodeStats(data, username) {
  const el = document.getElementById('leetcode-content');
  const user = data?.data?.matchedUser;
  if (!user) {
    el.innerHTML = `<div class="empty-state"><p>User @${username} not found on LeetCode.</p></div>`;
    return;
  }
  const stats = user.submitStats?.acSubmissionNum || [];
  const allQ = data?.data?.allQuestionsCount || [];

  const getCount = (diff) => (stats.find(s => s.difficulty === diff) || {}).count || 0;
  const getTotal = (diff) => (allQ.find(q => q.difficulty === diff) || {}).count || 0;
  const easy = getCount('Easy'), medium = getCount('Medium'), hard = getCount('Hard');
  const teasy = getTotal('Easy'), tmedium = getTotal('Medium'), thard = getTotal('Hard');
  const total = easy + medium + hard;

  const pctE = teasy ? Math.round((easy / teasy) * 100) : 0;
  const pctM = tmedium ? Math.round((medium / tmedium) * 100) : 0;
  const pctH = thard ? Math.round((hard / thard) * 100) : 0;

  const ranking = user.profile?.ranking ? `Rank #${user.profile.ranking.toLocaleString()}` : '';
  const analysis = getLCAnalysis(easy, medium, hard, teasy, tmedium, thard);

  el.innerHTML = `
    <div class="progress-card">
      <div class="lc-username">@${username}</div>
      <div class="lc-ranking">${ranking}</div>
      <div style="font-size:28px;font-weight:800;color:var(--accent-light);margin:8px 0">${total} <span style="font-size:15px;color:var(--text3)">solved</span></div>
    </div>
    <div class="lc-stats-grid">
      <div class="lc-stat-card easy">
        <div class="lc-stat-count">${easy}</div>
        <div class="lc-stat-label">Easy</div>
        <div class="lc-stat-total">/${teasy}</div>
      </div>
      <div class="lc-stat-card medium">
        <div class="lc-stat-count">${medium}</div>
        <div class="lc-stat-label">Medium</div>
        <div class="lc-stat-total">/${tmedium}</div>
      </div>
      <div class="lc-stat-card hard">
        <div class="lc-stat-count">${hard}</div>
        <div class="lc-stat-label">Hard</div>
        <div class="lc-stat-total">/${thard}</div>
      </div>
    </div>
    <div class="progress-card">
      ${renderLCBar('Easy', pctE, 'bar-green')}
      ${renderLCBar('Medium', pctM, 'bar-yellow')}
      ${renderLCBar('Hard', pctH, 'bar-red')}
    </div>
    <div class="lc-analysis">${analysis}</div>`;
}

function renderLCBar(label, pct, cls) {
  return `<div class="progress-bar-wrap">
    <div class="progress-bar-label"><span>${label}</span><span>${pct}%</span></div>
    <div class="progress-bar-track"><div class="progress-bar-fill ${cls}" style="width:${pct}%"></div></div>
  </div>`;
}

function getLCAnalysis(easy, medium, hard, te, tm, th) {
  const total = easy + medium + hard;
  if (!total) return "No problems solved yet — time to start grinding! Start with the easy ones to build momentum. You've got this! 💪";
  const pctM = tm ? Math.round((medium / tm) * 100) : 0;
  const pctH = th ? Math.round((hard / th) * 100) : 0;
  let msg = `✦ You've solved ${total} problems total. `;
  if (medium < 20) msg += `Focus on building your Medium problem library — it's the bread and butter of interviews. `;
  else if (pctM < 15) msg += `Your Medium completion rate is at ${pctM}% — keep pushing! `;
  if (hard > 10) msg += `Impressive — you're tackling Hard problems! `;
  if (pctH < 5 && total > 30) msg += `Try sprinkling in some Hard problems now — you have the foundation. `;
  return msg + `Keep the consistency going! 🎯`;
}

// ===== NOTES VIEW =====
function renderNotes(query = '') {
  const el = document.getElementById('notes-list');
  let notes = get(K.NOTES, []);
  if (query) notes = notes.filter(n => n.text.toLowerCase().includes(query.toLowerCase()));
  if (!notes.length) {
    el.innerHTML = query
      ? `<div class="empty-state"><p>No notes matching "${query}"</p></div>`
      : `<div class="empty-state"><p>No notes yet. Tell Aria to save one!</p><p class="empty-sub">Try: <em>"add note: email professor tomorrow"</em></p></div>`;
    return;
  }
  el.innerHTML = notes.map(n => `
    <div class="note-card" id="note-${n.id}">
      <div>
        <div class="note-text">${escapeHtml(n.text)}</div>
        <div class="note-date">${fmtDate(n.createdAt)}</div>
      </div>
      <button class="note-delete" onclick="deleteNoteById('${n.id}')" title="Delete note">🗑</button>
    </div>`).join('');
}

function filterNotes() {
  renderNotes(document.getElementById('notes-search').value);
}

function deleteNoteById(id) {
  let notes = get(K.NOTES, []);
  notes = notes.filter(n => n.id !== id);
  set(K.NOTES, notes);
  renderNotes(document.getElementById('notes-search').value);
  showToast('Note deleted', 'info');
}

// ===== FINANCE VIEW =====
function renderFinanceView() {
  const el = document.getElementById('finance-content');
  if (!el) return;
  const f = getFinance();

  const pendingSplitwise = f.splitwise.filter(s => s.status === 'pending');

  // Quick format
  const fmtMoney = (n) => typeof n === 'number' ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';

  el.innerHTML = `
    <!-- Balance Header -->
    <div class="finance-balance-card">
      <div class="finance-balance-label">Total Balance</div>
      <div class="finance-balance-amount ${f.balance < 0 ? 'text-red' : ''}">${fmtMoney(f.balance)}</div>
    </div>

    <!-- Splitwise Reminders section -->
    <div class="finance-section">
      <h3 class="finance-section-title">Splitwise Reminders ${pendingSplitwise.length > 0 ? `<span class="stat-badge">${pendingSplitwise.length}</span>` : ''}</h3>
      ${pendingSplitwise.length === 0 ?
      `<p class="finance-empty">No pending Splitwise items.</p>` :
      `<div class="splitwise-list">
          ${pendingSplitwise.map(s => `
            <div class="splitwise-item" onclick="toggleSplitwiseItem('${s.id}')">
              <div class="splitwise-checkbox"></div>
              <div class="splitwise-details">
                <div class="splitwise-desc">${escapeHtml(s.description)}</div>
                <div class="splitwise-date">${fmtDate(s.date)}</div>
              </div>
              <div class="splitwise-amount">${fmtMoney(s.amount)}</div>
            </div>
          `).join('')}
        </div>`
    }
    </div>

    <!-- Recent Transactions -->
    <div class="finance-section">
      <h3 class="finance-section-title">Recent Transactions</h3>
      ${f.transactions.length === 0 ?
      `<p class="finance-empty">No transactions yet. Tell Aria when you spend or earn money!</p>` :
      `<div class="finance-tx-list">
          ${f.transactions.slice(0, 15).map(tx => `
            <div class="finance-tx-item">
              <div class="finance-tx-icon ${tx.type === 'income' ? 'income' : 'expense'}">
                ${tx.type === 'income' ? '↓' : '↑'}
              </div>
              <div class="finance-tx-details">
                <div class="finance-tx-desc">${escapeHtml(tx.description)}</div>
                <div class="finance-tx-date">${fmtDate(tx.date)}</div>
              </div>
              <div class="finance-tx-amount ${tx.type === 'income' ? 'text-green' : ''}">
                ${tx.type === 'income' ? '+' : '-'}${fmtMoney(tx.amount)}
              </div>
            </div>
          `).join('')}
        </div>`
    }
    </div>
  `;
}

// Called directly from UI click
window.toggleSplitwiseItem = function (id) {
  const f = getFinance();
  const item = f.splitwise.find(s => s.id === id);
  if (item) {
    item.status = 'done';
    set(K.FINANCE, f);
    renderFinanceView();
    showToast(`Checked off: ${item.description}`, 'success');
  }
};

// ===== SETTINGS =====
function openSettings() {
  const user = getObj(K.USER) || {};
  document.getElementById('settings-name').value = user.name || '';
  document.getElementById('settings-leetcode').value = user.leetcodeUsername || '';
  document.getElementById('settings-ejs-pubkey').value = user.emailjs?.pubKey || '';
  document.getElementById('settings-ejs-service').value = user.emailjs?.serviceId || '';
  document.getElementById('settings-ejs-template').value = user.emailjs?.templateId || '';
  document.getElementById('settings-ejs-email').value = user.emailjs?.toEmail || '';
  renderSettingsChips();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function renderSettingsChips() {
  const user = getObj(K.USER) || {};
  const subjects = user.subjects || [];
  document.getElementById('settings-subjects-chips').innerHTML = subjects.map((s, i) =>
    `<span class="chip">${s}<button class="chip-x" onclick="settingsRemoveSubject('${s.replace(/'/g, "\\'")}')">×</button></span>`
  ).join('');
}

function settingsAddSubject() {
  const inp = document.getElementById('settings-subject-input');
  const val = inp.value.trim();
  if (!val) return;
  const user = getObj(K.USER) || {};
  if (!user.subjects) user.subjects = [];
  if (!user.subjects.includes(val)) { user.subjects.push(val); set(K.USER, user); }
  inp.value = '';
  renderSettingsChips();
}

function settingsRemoveSubject(sub) {
  const user = getObj(K.USER) || {};
  user.subjects = (user.subjects || []).filter(s => s !== sub);
  set(K.USER, user);
  renderSettingsChips();
}

function saveSettings() {
  const user = getObj(K.USER) || {};
  user.name = document.getElementById('settings-name').value.trim() || user.name;
  user.leetcodeUsername = document.getElementById('settings-leetcode').value.trim();
  user.emailjs = {
    pubKey: document.getElementById('settings-ejs-pubkey').value.trim(),
    serviceId: document.getElementById('settings-ejs-service').value.trim(),
    templateId: document.getElementById('settings-ejs-template').value.trim(),
    toEmail: document.getElementById('settings-ejs-email').value.trim(),
  };
  set(K.USER, user);
  // Init EmailJS if configured
  if (user.emailjs.pubKey) {
    try { emailjs.init(user.emailjs.pubKey); } catch (e) { }
  }
  lcCache = null; // reset cache so LeetCode reloads with new username
  closeSettings();
  showToast('Settings saved ✓', 'success');
}

function confirmClearData() {
  if (confirm('⚠️ This will delete ALL of Aria\'s data (deadlines, notes, gym logs, everything). Are you sure?')) {
    Object.values(K).forEach(k => localStorage.removeItem(k));
    closeSettings();
    location.reload();
  }
}

// ===== BROWSER NOTIFICATIONS =====
function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Register service worker for push notifications
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js').catch((err) => {
      console.log('Service Worker registration failed:', err);
    });
  }

  // Check for period reminders on load
  schedulePeriodNotifs();
}

function scheduleDeadlineNotifs() {
  if (Notification.permission !== 'granted') return;
  const notified = get(K.NOTIFIED, []);
  const todayStr = today();
  const deadlines = get(K.DEADLINES, []).filter(d => d.status !== 'done');

  deadlines.forEach(d => {
    const daysLeft = daysBetween(todayStr, d.dueDate);
    const notifKey = `${d.id}_due`;
    if (!notified.includes(notifKey) && daysLeft >= 0 && daysLeft <= 2) {
      const msg = daysLeft === 0 ? `"${d.title}" is due TODAY!` : `"${d.title}" is due in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`;
      new Notification('Aria — Deadline Alert', { body: msg, icon: '/static/icon.png' });
      notified.push(notifKey);
      set(K.NOTIFIED, notified);
    }
    // Midway check-in
    if (d.startDate && d.dueDate && !d.midwayChecked) {
      const midway = new Date((new Date(d.startDate).getTime() + new Date(d.dueDate).getTime()) / 2).toISOString().split('T')[0];
      if (todayStr >= midway) {
        const midKey = `${d.id}_mid`;
        if (!notified.includes(midKey)) {
          new Notification('Aria — Midway Check-in', { body: `Did you actually start "${d.title}"?` });
          notified.push(midKey);
          set(K.NOTIFIED, notified);
        }
      }
    }
  });

  // Period reminders
  schedulePeriodNotifs();
}

function schedulePeriodNotifs() {
  if (Notification.permission !== 'granted') return;
  const notified = get(K.NOTIFIED, []);
  const ctx = calcPeriodContext();
  if (!ctx.nextPredicted) return;

  const todayStr = today();
  const daysUntil = daysBetween(todayStr, ctx.nextPredicted);

  // Notify 3 days before, 1 day before, and on the day
  const thresholds = [3, 1, 0];
  thresholds.forEach(threshold => {
    const notifKey = `period_${ctx.nextPredicted}_${threshold}`;
    if (!notified.includes(notifKey) && daysUntil === threshold) {
      let msg = '';
      if (threshold === 3) msg = `🌸 Your period is expected in 3 days. Get ready!`;
      else if (threshold === 1) msg = `🌸 Your period is expected tomorrow. Stay prepared!`;
      else msg = `🌸 Your period might start today or soon. Take it easy!`;

      new Notification('Aria — Period Reminder', { body: msg, icon: '🌸' });
      notified.push(notifKey);
      set(K.NOTIFIED, notified);
    }
  });
}

// ===== EMAILJS =====
function checkEmailReminders() {
  const user = getObj(K.USER);
  if (!user?.emailjs?.pubKey) return;
  try {
    emailjs.init(user.emailjs.pubKey);
    scheduleEmailReminders();
  } catch (e) { }
}

function scheduleEmailReminders() {
  const user = getObj(K.USER) || {};
  const ejs = user.emailjs || {};
  if (!ejs.pubKey || !ejs.serviceId || !ejs.templateId || !ejs.toEmail) return;

  const emailed = get(K.EMAILED, []);
  const todayStr = today();
  const deadlines = get(K.DEADLINES, []).filter(d => d.status !== 'done');

  deadlines.forEach(d => {
    // Email on start date
    if (d.startDate === todayStr) {
      const key = `${d.id}_start_email`;
      if (!emailed.includes(key)) {
        sendEmailReminder(ejs, `⏰ Time to start: ${d.title}`, `Today is the start date for "${d.title}" (due ${fmtDate(d.dueDate)}). Time to get going!`);
        emailed.push(key);
      }
    }
    // Email 2 days before due
    if (daysBetween(todayStr, d.dueDate) === 2) {
      const key = `${d.id}_due2_email`;
      if (!emailed.includes(key)) {
        sendEmailReminder(ejs, `🔴 Due in 2 days: ${d.title}`, `"${d.title}" is due on ${fmtDate(d.dueDate)}. Finish strong!`);
        emailed.push(key);
      }
    }
    // Midway email
    if (d.startDate && d.dueDate) {
      const midway = new Date((new Date(d.startDate).getTime() + new Date(d.dueDate).getTime()) / 2).toISOString().split('T')[0];
      if (todayStr === midway) {
        const key = `${d.id}_mid_email`;
        if (!emailed.includes(key)) {
          sendEmailReminder(ejs, `📍 Midway check-in: ${d.title}`, `You're halfway through your timeline for "${d.title}". Did you actually start? Due: ${fmtDate(d.dueDate)}.`);
          emailed.push(key);
        }
      }
    }
  });
  set(K.EMAILED, emailed);
}

function sendEmailReminder(ejs, subject, body) {
  try {
    emailjs.send(ejs.serviceId, ejs.templateId, {
      to_email: ejs.toEmail,
      subject: subject,
      message: body,
    });
  } catch (e) { console.warn('EmailJS error:', e); }
}

// ===== INIT COMPLETION =====
// Run deadline notifications on load
setTimeout(() => {
  const user = getObj(K.USER);
  if (user?.name) {
    scheduleDeadlineNotifs();
  }
}, 2000);

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://bmiyqwgcbzutrbikbamr.supabase.co';
const SUPABASE_ANON = 'sb_publishable_8pWb8k10Z9IQr4lnyOR_VA_ZeILEVKZ';

const CHALLENGE_START = new Date('2026-04-01');
const CHALLENGE_END   = new Date('2026-05-31');

const AVATAR_COLORS = [
  ['#dbeafe','#1e40af'], ['#dcfce7','#166534'], ['#fef9c3','#854d0e'],
  ['#fce7f3','#9d174d'], ['#ede9fe','#5b21b6'], ['#ffedd5','#9a3412'],
  ['#cffafe','#155e75'], ['#fce7f3','#be185d'],
];

const ACTIVITY_ICONS = {
  'Walking':'🚶','Running':'🏃','Cycling':'🚴','Swimming':'🏊',
  'Yoga':'🧘','Strength training':'💪','Group hike':'🥾','Jump rope':'🪢',
  'Aerobics / cardio class':'🏋️','Basketball':'🏀','Soccer / kickball':'⚽',
};

let sbClient       = null;
let currentUser    = null;
let allEntries     = [];
let displayedCount = 10;
let editingId      = null;

document.addEventListener('DOMContentLoaded', () => {
sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  const dateInput = document.getElementById('date-input');
  dateInput.value = new Date().toISOString().split('T')[0];
  dateInput.max   = new Date().toISOString().split('T')[0];

  document.getElementById('act-select').addEventListener('change', () => {
    const isOther = document.getElementById('act-select').value === 'Other';
    document.getElementById('other-wrap').classList.toggle('hidden', !isOther);
  });

  const saved = sessionStorage.getItem('wc_user');
  if (saved) {
    try { currentUser = JSON.parse(saved); showApp(); }
    catch { showJoin(); }
  } else {
    showJoin();
  }
});

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Mode toggle (login vs register) ──────────────────────────────────────────
function switchMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('login-card').classList.toggle('hidden', !isLogin);
  document.getElementById('register-card').classList.toggle('hidden', isLogin);
  document.getElementById('mode-btn-login').classList.toggle('active', isLogin);
  document.getElementById('mode-btn-register').classList.toggle('active', !isLogin);
  document.getElementById('login-error').classList.remove('visible');
  document.getElementById('join-error').classList.remove('visible');
}

function showJoin() {
  document.getElementById('screen-join').classList.add('active');
  document.getElementById('screen-app').classList.remove('active');
  switchMode('login');
}

// ── Login — finds existing user only ─────────────────────────────────────────
async function handleLogin() {
  const nameRaw = document.getElementById('login-name').value.trim();
  const codeRaw = document.getElementById('login-code').value.trim().toUpperCase();
  const errEl   = document.getElementById('login-error');
  errEl.classList.remove('visible');

  if (!nameRaw || nameRaw.length < 2) return showError(errEl, 'Please enter your name.');
  if (!codeRaw)                       return showError(errEl, 'Please enter the join code.');

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Logging in…';

  try {
    const { data, error } = await sbClient
      .from('participants')
      .select('id, name, color_index')
      .eq('name', nameRaw)
      .eq('join_code', codeRaw)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      showError(errEl, 'No account found with that name and join code. Check your spelling or switch to "First time joining".');
      btn.disabled = false;
      btn.textContent = 'Log in';
      return;
    }

    currentUser = data;
    sessionStorage.setItem('wc_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    console.error(err);
    showError(errEl, 'Something went wrong. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
}

// ── Join — creates new user only, errors if name already exists ───────────────
async function handleJoin() {
  const nameRaw = document.getElementById('join-name').value.trim();
  const codeRaw = document.getElementById('join-code').value.trim().toUpperCase();
  const errEl   = document.getElementById('join-error');
  errEl.classList.remove('visible');

  if (!nameRaw || nameRaw.length < 2) return showError(errEl, 'Please enter your full name (at least 2 characters).');
  if (nameRaw.length > 40)            return showError(errEl, 'Name must be 40 characters or fewer.');
  if (!codeRaw)                       return showError(errEl, 'Please enter the team join code.');

  const btn = document.getElementById('join-btn');
  btn.disabled = true;
  btn.textContent = 'Joining…';

  try {
    // Check if name already exists with this join code
    const { data: existing } = await sbClient
      .from('participants')
      .select('id')
      .eq('name', nameRaw)
      .eq('join_code', codeRaw)
      .maybeSingle();

    if (existing) {
      showError(errEl, 'An account with that name already exists. Switch to "Returning member" to log in instead.');
      btn.disabled = false;
      btn.textContent = 'Join & start logging';
      return;
    }

    // Create new participant
    const { data, error } = await sbClient
      .from('participants')
      .insert({ name: nameRaw, join_code: codeRaw })
      .select('id, name, color_index')
      .single();

    if (error) throw error;

    currentUser = data;
    sessionStorage.setItem('wc_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    console.error(err);
    showError(errEl, 'Invalid join code or server error. Please check the code and try again.');
    btn.disabled = false;
    btn.textContent = 'Join & start logging';
  }
}

function showApp() {
  document.getElementById('screen-join').classList.remove('active');
  document.getElementById('screen-app').classList.add('active');
  document.getElementById('header-username').textContent = sanitize(currentUser.name);
  loadLog();
  renderProgress();
}

function handleSignOut() {
  sessionStorage.removeItem('wc_user');
  currentUser = null;
  allEntries  = [];
  showJoin();
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'board') loadLeaderboard();
  if (tab === 'log')   renderLog();
  if (tab === 'add')   resetAddForm();
}

async function loadLog() {
  try {
    const { data, error } = await sbClient
      .from('entries')
      .select('*')
      .eq('participant_id', currentUser.id)
      .order('workout_date', { ascending: false });
    if (error) throw error;
    allEntries = data || [];
    renderLog();
    renderProgress();
  } catch (err) {
    console.error('Failed to load entries:', err);
    showToast('Could not load your entries. Check your connection.');
  }
}

function renderLog() {
  const total    = allEntries.reduce((s, e) => s + e.duration_mins, 0);
  const sessions = allEntries.length;

  document.getElementById('stat-total-mins').textContent = total.toLocaleString();
  document.getElementById('stat-sessions').textContent   = sessions;

  const breakdown = document.getElementById('activity-breakdown');
  if (!sessions) {
    breakdown.innerHTML = '<p class="empty-state">No workouts logged yet.</p>';
  } else {
    const byAct = {};
    allEntries.forEach(e => { byAct[e.activity] = (byAct[e.activity] || 0) + e.duration_mins; });
    const maxMins = Math.max(...Object.values(byAct));
    breakdown.innerHTML = Object.entries(byAct)
      .sort((a, b) => b[1] - a[1])
      .map(([act, mins]) => `
        <div class="act-row">
          <span class="act-icon">${ACTIVITY_ICONS[act] || '⭐'}</span>
          <span class="act-name">${sanitize(act)}</span>
          <div class="act-bar-wrap">
            <div class="act-bar" style="width:${Math.round((mins / maxMins) * 100)}%"></div>
          </div>
          <span class="act-mins">${mins} min</span>
        </div>`
      ).join('');
  }

  const logList = document.getElementById('log-list');
  if (!sessions) {
    logList.innerHTML = '<p class="empty-state">No workouts yet — log your first one!</p>';
    document.getElementById('load-more-btn').style.display = 'none';
    return;
  }

  logList.innerHTML = allEntries.slice(0, displayedCount).map(entry => entryHTML(entry)).join('');
  document.getElementById('load-more-btn').style.display =
    allEntries.length > displayedCount ? 'block' : 'none';
}

function entryHTML(entry) {
  const icon  = ACTIVITY_ICONS[entry.activity] || '⭐';
  const date  = formatDate(entry.workout_date);
  const notes = entry.notes ? ` · ${sanitize(entry.notes)}` : '';
  return `
    <div class="entry" id="entry-${entry.id}">
      <div class="entry-icon">${icon}</div>
      <div class="entry-body">
        <div class="entry-name">${sanitize(entry.activity)}</div>
        <div class="entry-meta">${date}${notes}</div>
      </div>
      <div class="entry-mins">${entry.duration_mins} min</div>
      <div class="entry-actions">
        <button class="btn-action btn-edit" onclick="openEdit('${entry.id}')" title="Edit" aria-label="Edit workout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-action btn-del" onclick="confirmDelete('${entry.id}')" title="Delete" aria-label="Delete workout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

function loadMoreEntries() {
  displayedCount += 10;
  renderLog();
}

function renderProgress() {
  const now     = new Date();
  const total   = CHALLENGE_END - CHALLENGE_START;
  const elapsed = Math.max(0, Math.min(total, now - CHALLENGE_START));
  const pct     = Math.round((elapsed / total) * 100);
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-pct').textContent  = pct + '%';
}

function resetAddForm(entry = null) {
  editingId = entry ? entry.id : null;
  document.getElementById('form-title').textContent = entry ? 'Edit workout' : 'Log a workout';
  document.getElementById('add-btn').textContent    = entry ? 'Save changes' : 'Save workout';
  document.getElementById('cancel-edit-btn').classList.toggle('hidden', !entry);
  document.getElementById('add-error').classList.remove('visible');
  document.getElementById('act-select').value  = entry ? entry.activity : '';
  document.getElementById('dur-input').value   = entry ? entry.duration_mins : '';
  document.getElementById('notes-input').value = entry ? (entry.notes || '') : '';
  document.getElementById('act-other').value   = '';

  const otherWrap = document.getElementById('other-wrap');
  if (entry && !ACTIVITY_ICONS[entry.activity]) {
    document.getElementById('act-select').value = 'Other';
    document.getElementById('act-other').value  = entry.activity;
    otherWrap.classList.remove('hidden');
  } else {
    otherWrap.classList.add('hidden');
  }

  document.getElementById('date-input').value = entry
    ? entry.workout_date
    : new Date().toISOString().split('T')[0];
}

function openEdit(id) {
  const entry = allEntries.find(e => e.id === id);
  if (!entry) return;
  resetAddForm(entry);
  switchTab('add');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  resetAddForm();
  showToast('Edit cancelled.');
}

async function handleAddWorkout() {
  const actRaw   = document.getElementById('act-select').value;
  const otherRaw = document.getElementById('act-other').value.trim();
  const durRaw   = document.getElementById('dur-input').value;
  const dateRaw  = document.getElementById('date-input').value;
  const notesRaw = document.getElementById('notes-input').value.trim();
  const errEl    = document.getElementById('add-error');
  errEl.classList.remove('visible');

  if (!actRaw)                         return showError(errEl, 'Please select an activity.');
  if (actRaw === 'Other' && !otherRaw) return showError(errEl, 'Please describe your activity.');
  if (otherRaw.length > 60)            return showError(errEl, 'Activity name must be 60 characters or fewer.');

  const dur = parseInt(durRaw, 10);
  if (!durRaw || isNaN(dur) || dur < 1 || dur > 480)
    return showError(errEl, 'Duration must be between 1 and 480 minutes.');

  if (!dateRaw) return showError(errEl, 'Please select a date.');
  if (isNaN(new Date(dateRaw))) return showError(errEl, 'Invalid date.');
  if (notesRaw.length > 120)   return showError(errEl, 'Notes must be 120 characters or fewer.');

  if (!editingId && allEntries.length >= 60)
    return showError(errEl, 'Maximum of 60 workout entries reached.');

  const finalActivity = actRaw === 'Other' ? otherRaw : actRaw;
  const btn = document.getElementById('add-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (editingId) {
      const { data, error } = await sbClient
        .from('entries')
        .update({
          activity:      finalActivity,
          duration_mins: dur,
          workout_date:  dateRaw,
          notes:         notesRaw || null,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', editingId)
        .eq('participant_id', currentUser.id)
        .select()
        .single();
      if (error) throw error;
      const idx = allEntries.findIndex(e => e.id === editingId);
      if (idx !== -1) allEntries[idx] = data;
      showToast('Workout updated!');
    } else {
      const { data, error } = await sbClient
        .from('entries')
        .insert({
          participant_id: currentUser.id,
          activity:       finalActivity,
          duration_mins:  dur,
          workout_date:   dateRaw,
          notes:          notesRaw || null,
        })
        .select()
        .single();
      if (error) throw error;
      allEntries.unshift(data);
      showToast('Workout logged — nice work!');
    }

    allEntries.sort((a, b) => new Date(b.workout_date) - new Date(a.workout_date));
    displayedCount = 10;
    resetAddForm();
    switchTab('log');
  } catch (err) {
    console.error(err);
    showError(errEl, 'Could not save. Please check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Save changes' : 'Save workout';
  }
}

function confirmDelete(id) {
  const entry = allEntries.find(e => e.id === id);
  if (!entry) return;
  const modal = document.getElementById('delete-modal');
  document.getElementById('delete-modal-desc').textContent =
    `Delete "${entry.activity}" on ${formatDate(entry.workout_date)} (${entry.duration_mins} min)?`;
  modal.dataset.pendingId = id;
  modal.classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
}

async function executeDelete() {
  const id = document.getElementById('delete-modal').dataset.pendingId;
  closeDeleteModal();
  if (!id) return;
  try {
    const { error } = await sbClient
      .from('entries')
      .delete()
      .eq('id', id)
      .eq('participant_id', currentUser.id);
    if (error) throw error;
    allEntries = allEntries.filter(e => e.id !== id);
    displayedCount = Math.min(displayedCount, allEntries.length) || 10;
    renderLog();
    renderProgress();
    showToast('Workout deleted.');
  } catch (err) {
    console.error(err);
    showToast('Could not delete. Please try again.');
  }
}

async function loadLeaderboard() {
  document.getElementById('board-list').innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { data, error } = await sbClient
      .from('leaderboard_view')
      .select('name, total_mins, color_index')
      .order('total_mins', { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      document.getElementById('board-list').innerHTML =
        '<p class="empty-state">No entries yet — be the first to log a workout!</p>';
      return;
    }

    const maxMins = data[0].total_mins || 1;
    document.getElementById('board-list').innerHTML = data.map((row, i) => {
      const isYou      = row.name === currentUser.name;
      const ci         = (row.color_index || 0) % AVATAR_COLORS.length;
      const [bg, fg]   = AVATAR_COLORS[ci];
      const initials   = row.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const barW       = Math.round((row.total_mins / maxMins) * 100);
      const medal      = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const rankClass  = i < 3 ? 'board-rank top' : 'board-rank';
      return `
        <div class="board-row${isYou ? ' board-row-you' : ''}">
          <div class="${rankClass}">${medal}</div>
          <div class="board-avatar" style="background:${bg};color:${fg}">${sanitize(initials)}</div>
          <div class="board-name-wrap">
            <div class="board-name">
              ${sanitize(row.name)}
              ${isYou ? '<span class="you-pill">you</span>' : ''}
            </div>
            <div class="board-bar-wrap">
              <div class="board-bar" style="width:${barW}%"></div>
            </div>
          </div>
          <div class="board-mins">${Number(row.total_mins).toLocaleString()} min</div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    document.getElementById('board-list').innerHTML =
      '<p class="empty-state">Could not load leaderboard. Check your connection.</p>';
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('visible');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

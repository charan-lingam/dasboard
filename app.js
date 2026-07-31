/* ═══════════════════════════════════════════════════════════════
   TapeoutX — Task Workspace & Team Dashboard
   Pure JS, Real-Time Supabase Cloud DB + localStorage caching,
   Drag-and-drop Kanban, Multi-Team Assignments, Multi-user Sync.
   ═══════════════════════════════════════════════════════════════ */

// ─── Supabase Configuration ───────────────────────────────────
const SUPABASE_URL = 'https://bdpwcqbsoybxmgjkqdrd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkcHdjcWJzb3lieG1namtxZHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MTUzNTIsImV4cCI6MjEwMTA5MTM1Mn0.rO9amsCJw2xbBASz2NLzoyB5rlzYy8fmWKD2SXOZ82M';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ─── Data Store ───────────────────────────────────────────────
const STORAGE_KEY = 'taskforge_data';

const DEFAULT_DATA = {
  tasks: [],
  projects: [
    { id: 'proj_tapeoutx', name: 'TapeoutX', color: '#6C5CE7' },
  ],
  teams: [
    { id: 'team_vision_ops', name: 'Vision, Leadership & Operations', color: '#6C5CE7' },
    { id: 'team_research_editorial', name: 'Research & Editorial', color: '#00B894' },
    { id: 'team_content_production', name: 'Content Production', color: '#FF7675' },
    { id: 'team_social_outreach', name: 'Social Media & Outreach', color: '#FDCB6E' },
    { id: 'team_community', name: 'Community', color: '#A29BFE' },
  ],
  nextTaskNum: 1,
};

function sanitizeTasks(tasks) {
  return tasks.map(t => {
    let teamIds = t.teamIds || [];
    if (!teamIds.length && t.teamId) teamIds = [t.teamId];
    return { ...t, teamIds };
  });
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      data.tasks = sanitizeTasks(data.tasks || []);
      return data;
    }
  } catch (_) {}
  return structuredClone(DEFAULT_DATA);
}
function saveLocalData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

let store = loadLocalData();

// ─── Supabase Cloud Sync Operations ───────────────────────────
async function fetchCloudData() {
  if (!supabaseClient) return;
  try {
    const [projRes, teamRes, taskRes] = await Promise.all([
      supabaseClient.from('projects').select('*'),
      supabaseClient.from('teams').select('*'),
      supabaseClient.from('tasks').select('*')
    ]);

    if (!projRes.error && projRes.data) {
      if (projRes.data.length > 0) store.projects = projRes.data.map(p => ({ id: p.id, name: p.name, color: p.color }));
    }
    if (!teamRes.error && teamRes.data) {
      if (teamRes.data.length > 0) store.teams = teamRes.data.map(t => ({ id: t.id, name: t.name, color: t.color }));
    }
    if (!taskRes.error && taskRes.data) {
      store.tasks = taskRes.data.map(t => {
        let teamIds = t.team_ids || [];
        if (!teamIds.length && t.team_id) teamIds = [t.team_id];
        return {
          id: t.id,
          num: t.num,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          teamIds: teamIds,
          projectId: t.project_id,
          dueDate: t.due_date,
          tags: t.tags || [],
          subtasks: t.subtasks || [],
          createdAt: t.created_at,
          updatedAt: t.updated_at
        };
      });
      const maxNum = store.tasks.reduce((m, t) => Math.max(m, t.num || 0), 0);
      store.nextTaskNum = Math.max(store.nextTaskNum, maxNum + 1);
    }

    saveLocalData();
    renderAll();
  } catch (err) {
    console.warn('Supabase fetch error, fallback to local storage:', err);
  }
}

async function syncTaskToCloud(task) {
  if (!supabaseClient) return;
  const payload = {
    id: task.id,
    num: task.num,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    team_id: task.teamIds?.[0] || null,
    team_ids: task.teamIds || [],
    project_id: task.projectId,
    due_date: task.dueDate,
    tags: task.tags || [],
    subtasks: task.subtasks || [],
    updated_at: new Date().toISOString()
  };
  await supabaseClient.from('tasks').upsert(payload);
}

async function deleteTaskFromCloud(id) {
  if (!supabaseClient) return;
  await supabaseClient.from('tasks').delete().eq('id', id);
}

async function syncProjectToCloud(proj) {
  if (!supabaseClient) return;
  await supabaseClient.from('projects').upsert({ id: proj.id, name: proj.name, color: proj.color });
}

async function syncTeamToCloud(team) {
  if (!supabaseClient) return;
  await supabaseClient.from('teams').upsert({ id: team.id, name: team.name, color: team.color });
}

async function deleteTeamFromCloud(id) {
  if (!supabaseClient) return;
  await supabaseClient.from('teams').delete().eq('id', id);
}

function setupRealtimeSubscriptions() {
  if (!supabaseClient) return;
  supabaseClient
    .channel('public:tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchCloudData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchCloudData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchCloudData())
    .subscribe();
}

// ─── Helpers ──────────────────────────────────────────────────
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const uid = () => 'id_' + Math.random().toString(36).slice(2, 10);
const fmtDate = (d) => { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const isOverdue = (d) => { if (!d) return false; return new Date(d) < new Date(new Date().toDateString()); };

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
}

// ─── State & Password Protection ────────────────────────────────
let currentView = 'cards';
let currentProject = '';
let editingTaskId = null;
let editingSubtasks = [];
let draggedCard = null;
let editingTeamId = null;
let isUnlocked = false;

function checkPassword() {
  if (isUnlocked || sessionStorage.getItem('taskforge_auth') === 'true') {
    isUnlocked = true;
    updateLockStatusUI();
    return true;
  }
  const pwd = prompt('Enter password to add or edit tasks/teams:');
  if (pwd !== null && pwd.trim().toLowerCase() === 'vlsi') {
    isUnlocked = true;
    sessionStorage.setItem('taskforge_auth', 'true');
    toast('Access granted', 'success');
    updateLockStatusUI();
    return true;
  } else if (pwd !== null) {
    toast('Incorrect password!', 'error');
  }
  return false;
}

function updateLockStatusUI() {
  const lockBtn = $('#auth-lock-btn');
  if (!lockBtn) return;
  const isAuth = isUnlocked || sessionStorage.getItem('taskforge_auth') === 'true';
  if (isAuth) {
    lockBtn.className = 'lock-status-btn unlocked';
    lockBtn.title = 'Session Unlocked (Click to Lock)';
    lockBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg><span>Unlocked</span>`;
  } else {
    lockBtn.className = 'lock-status-btn locked';
    lockBtn.title = 'Protected with password (Click to Unlock)';
    lockBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Locked</span>`;
  }
}

function toggleLock() {
  const isAuth = isUnlocked || sessionStorage.getItem('taskforge_auth') === 'true';
  if (isAuth) {
    isUnlocked = false;
    sessionStorage.removeItem('taskforge_auth');
    updateLockStatusUI();
    toast('Session locked', 'info');
  } else {
    checkPassword();
  }
}

const PRIORITY_MAP = { critical: 4, urgent: 4, high: 3, medium: 2, low: 1 };

function sortTasksByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const pA = PRIORITY_MAP[(a.priority || '').toLowerCase()] || 0;
    const pB = PRIORITY_MAP[(b.priority || '').toLowerCase()] || 0;
    if (pB !== pA) return pB - pA;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (a.num || 0) - (b.num || 0);
  });
}

// ─── DOM Refs & Sidebar Toggle ─────────────────────────────────
const sidebar = $('#sidebar');
const sidebarOverlay = $('#sidebar-overlay');

function toggleSidebar() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const isOpen = sidebar.classList.toggle('open');
    if (sidebarOverlay) sidebarOverlay.hidden = !isOpen;
  } else {
    sidebar.classList.toggle('collapsed');
    if (sidebarOverlay) sidebarOverlay.hidden = true;
  }
}

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.hidden = true;
  }
}

$('#sidebar-toggle').addEventListener('click', toggleSidebar);
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', closeSidebarMobile);
}

// ─── View Switching ───────────────────────────────────────────
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${currentView}`).classList.add('active');
    renderCurrentView();
    closeSidebarMobile();
  });
});

// ─── Filter Logic ─────────────────────────────────────────────
function getFilteredTasks() {
  let tasks = store.tasks;
  if (currentProject) tasks = tasks.filter(t => t.projectId === currentProject);
  const prio = $('#filter-priority').value;
  if (prio) tasks = tasks.filter(t => t.priority === prio);
  const teamFilter = $('#filter-team').value;
  if (teamFilter) tasks = tasks.filter(t => (t.teamIds || []).includes(teamFilter));
  const q = $('#search-input').value.trim().toLowerCase();
  if (q) tasks = tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(q))
  );
  return sortTasksByPriority(tasks);
}

$('#search-input').addEventListener('input', () => renderCurrentView());
$('#filter-priority').addEventListener('change', () => renderCurrentView());
$('#filter-team').addEventListener('change', () => renderCurrentView());

// ─── Render: Sidebar Projects ─────────────────────────────────
function renderProjects() {
  const list = $('#project-list');
  list.innerHTML = `<div class="project-item ${!currentProject ? 'active' : ''}" data-proj="">
    <span class="project-dot" style="background:var(--text-muted)"></span>All Tasks
  </div>` +
  store.projects.map(p => `
    <div class="project-item ${currentProject === p.id ? 'active' : ''}" data-proj="${p.id}">
      <span class="project-dot" style="background:${p.color}"></span>${escHtml(p.name)}
    </div>
  `).join('');

  $$('.project-item', list).forEach(el => {
    el.addEventListener('click', () => {
      currentProject = el.dataset.proj;
      renderProjects();
      renderCurrentView();
      $('#current-project-title').textContent = currentProject
        ? store.projects.find(p => p.id === currentProject)?.name || 'Project'
        : 'All Tasks';
      closeSidebarMobile();
    });
  });

  const sel = $('#task-project');
  const val = sel.value;
  sel.innerHTML = '<option value="">No Project</option>' +
    store.projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  sel.value = val;
}

// ─── Render: Sidebar Teams ────────────────────────────────────
function renderTeams() {
  const list = $('#team-list');

  if (!store.teams.length) {
    list.innerHTML = '<div class="team-empty-hint">No teams yet — add one below</div>';
  } else {
    list.innerHTML = store.teams.map(t => `
      <div class="team-item" data-team="${t.id}">
        <span class="team-dot-sidebar" style="background:${t.color}"></span>
        <span class="team-item-name">${escHtml(t.name)}</span>
        <div class="team-item-actions">
          <button class="team-action-btn edit" data-team="${t.id}" title="Edit team">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="team-action-btn delete" data-team="${t.id}" title="Delete team">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    $$('.team-action-btn.edit', list).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditTeam(btn.dataset.team);
      });
    });

    $$('.team-action-btn.delete', list).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTeam(btn.dataset.team);
      });
    });
  }

  // Filter Team Select Dropdown
  const filterSel = $('#filter-team');
  if (filterSel) {
    const val = filterSel.value;
    filterSel.innerHTML = '<option value="">All Teams</option>' +
      store.teams.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
    filterSel.value = val;
  }
}

function renderTeamCheckboxes(selectedIds = []) {
  const container = $('#task-teams-container');
  if (!container) return;
  if (!store.teams.length) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:.8rem">No teams created yet</span>';
    return;
  }
  container.innerHTML = store.teams.map(t => {
    const isChecked = selectedIds.includes(t.id);
    return `<label class="team-checkbox-item">
      <input type="checkbox" value="${t.id}" ${isChecked ? 'checked' : ''} />
      <span class="team-checkbox-badge" style="background:${t.color}">${escHtml(t.name)}</span>
    </label>`;
  }).join('');
}

function getSelectedTeamIds() {
  const container = $('#task-teams-container');
  if (!container) return [];
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
}

function deleteTeam(teamId) {
  if (!checkPassword()) return;
  const team = store.teams.find(t => t.id === teamId);
  if (!team) return;
  const tasksUsing = store.tasks.filter(t => (t.teamIds || []).includes(teamId)).length;
  const msg = tasksUsing
    ? `Delete "${team.name}"? ${tasksUsing} task(s) will be unassigned from this team.`
    : `Delete "${team.name}"?`;
  if (!confirm(msg)) return;
  store.teams = store.teams.filter(t => t.id !== teamId);
  store.tasks.forEach(t => {
    if (t.teamIds) t.teamIds = t.teamIds.filter(id => id !== teamId);
  });
  saveLocalData();
  deleteTeamFromCloud(teamId);
  renderTeams();
  renderCurrentView();
  toast(`${team.name} deleted`, 'error');
}

// ─── Card Helper & Event Binding ────────────────────────────────
function bindCardEvents(container) {
  $$('.task-card', container).forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-edit-btn')) return;
      openTaskDetails(card.dataset.id);
    });
    const editBtn = card.querySelector('.card-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditTask(editBtn.dataset.id);
      });
    }
  });
}

// ─── Render: Cards View (Priority Grid) ─────────────────────────
function renderCards() {
  const tasks = getFilteredTasks();
  const feed = $('#cards-feed');
  if (!tasks.length) {
    feed.innerHTML = '<div class="cards-feed-empty">No tasks found</div>';
    updateBadge(0);
    return;
  }

  feed.innerHTML = tasks.map(t => cardHtml(t, true)).join('');
  bindCardEvents(feed);
  updateBadge(tasks.length);
}

// ─── Render: Board View ──────────────────────────────────────
function renderBoard() {
  const statuses = ['backlog', 'todo', 'in-progress', 'review', 'done'];
  const tasks = getFilteredTasks();

  statuses.forEach(status => {
    const col = $(`.column-cards[data-status="${status}"]`);
    const statusTasks = tasks.filter(t => t.status === status);
    $(`[data-count="${status}"]`).textContent = statusTasks.length;

    col.innerHTML = statusTasks.map(t => cardHtml(t, false)).join('');

    $$('.task-card', col).forEach(card => {
      card.draggable = true;
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend', onDragEnd);
    });

    bindCardEvents(col);

    col.addEventListener('dragover', onDragOver);
    col.addEventListener('dragleave', onDragLeave);
    col.addEventListener('drop', onDrop);
  });

  updateBadge(tasks.length);
}

function cardHtml(t, isCardsView = false) {
  const teamIds = t.teamIds || [];
  const assignedTeams = teamIds.map(id => store.teams.find(tm => tm.id === id)).filter(Boolean);
  const totalSub = (t.subtasks || []).length;
  const doneSub = (t.subtasks || []).filter(s => s.done).length;
  const pct = totalSub ? Math.round((doneSub / totalSub) * 100) : 0;
  const proj = store.projects.find(p => p.id === t.projectId);

  return `<div class="task-card priority-${t.priority}" data-id="${t.id}" ${isCardsView ? '' : 'draggable="true"'}>
    <div class="card-top-bar">
      <div style="display:flex;align-items:center;gap:6px">
        <span class="priority-badge ${t.priority}">${t.priority}</span>
        <span class="status-pill ${t.status}">${t.status.replace('-', ' ')}</span>
      </div>
      <button class="card-edit-btn" data-id="${t.id}" title="Edit Task">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>
    <div class="task-card-title">${escHtml(t.title)}</div>
    ${t.description ? `<div class="task-card-desc">${escHtml(t.description)}</div>` : ''}
    <div class="task-card-meta">
      ${t.dueDate ? `<span class="task-card-due ${isOverdue(t.dueDate) && t.status !== 'done' ? 'overdue' : ''}">📅 ${fmtDate(t.dueDate)}</span>` : ''}
      ${proj ? `<span class="task-card-project" style="color:${proj.color};font-size:.75rem;font-weight:600">📁 ${escHtml(proj.name)}</span>` : ''}
      ${assignedTeams.length ? `<div class="task-card-teams">${assignedTeams.map(tm => `<span class="task-card-team" style="background:${tm.color}">${escHtml(tm.name)}</span>`).join('')}</div>` : ''}
    </div>
    ${(t.tags || []).length ? `<div class="task-card-tags">${t.tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join('')}</div>` : ''}
    ${totalSub ? `<div class="subtask-progress" title="${doneSub}/${totalSub} completed"><div class="subtask-progress-fill" style="width:${pct}%"></div></div>` : ''}
  </div>`;
}

// ─── Drag and Drop ────────────────────────────────────────────
function onDragStart(e) {
  draggedCard = e.target.closest('.task-card');
  draggedCard.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedCard.dataset.id);
}
function onDragEnd() {
  if (draggedCard) draggedCard.classList.remove('dragging');
  draggedCard = null;
  $$('.column-cards').forEach(c => c.classList.remove('drag-over'));
}
function onDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}
function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');
  const taskId = e.dataTransfer.getData('text/plain');
  const newStatus = col.dataset.status;
  const task = store.tasks.find(t => t.id === taskId);
  if (task && task.status !== newStatus) {
    if (!checkPassword()) return;
    task.status = newStatus;
    saveLocalData();
    syncTaskToCloud(task);
    renderBoard();
    toast(`Moved to ${newStatus.replace('-', ' ')}`, 'info');
  }
}

// ─── Render: List View ────────────────────────────────────────
function renderList() {
  const tasks = getFilteredTasks();
  const tbody = $('#list-tbody');
  tbody.innerHTML = tasks.map(t => {
    const teamIds = t.teamIds || [];
    const assignedTeams = teamIds.map(id => store.teams.find(tm => tm.id === id)).filter(Boolean);
    const proj = store.projects.find(p => p.id === t.projectId);
    return `<tr data-id="${t.id}">
      <td class="col-id">TF-${String(t.num).padStart(3, '0')}</td>
      <td>${escHtml(t.title)}</td>
      <td><span class="status-pill ${t.status}">${t.status.replace('-', ' ')}</span></td>
      <td><span class="priority-badge ${t.priority}">${t.priority}</span></td>
      <td>${assignedTeams.length ? assignedTeams.map(tm => `<span class="team-badge" style="background:${tm.color}">${escHtml(tm.name)}</span>`).join(' ') : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="${isOverdue(t.dueDate) && t.status !== 'done' ? 'overdue' : ''}" style="${isOverdue(t.dueDate) && t.status !== 'done' ? 'color:var(--red)' : 'color:var(--text-muted)'}">${fmtDate(t.dueDate) || '—'}</td>
      <td>${proj ? `<span style="color:${proj.color}">${escHtml(proj.name)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
    </tr>`;
  }).join('');
  $$('tr[data-id]', tbody).forEach(row => {
    row.addEventListener('click', () => openTaskDetails(row.dataset.id));
  });
  updateBadge(tasks.length);
}

// ─── Render: Timeline View ────────────────────────────────────
function renderTimeline() {
  const tasks = getFilteredTasks().filter(t => t.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const container = $('#timeline-container');
  if (!tasks.length) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:40px 0;text-align:center">No tasks with due dates to display.</p>';
    updateBadge(getFilteredTasks().length);
    return;
  }
  container.innerHTML = '<div class="timeline-line"></div>' + tasks.map(t => {
    const teamIds = t.teamIds || [];
    const assignedTeams = teamIds.map(id => store.teams.find(tm => tm.id === id)).filter(Boolean);
    return `<div class="timeline-item" data-id="${t.id}">
      <div class="timeline-dot"></div>
      <div class="timeline-card">
        <div class="timeline-date">${fmtDate(t.dueDate)}${isOverdue(t.dueDate) && t.status !== 'done' ? ' · <span style="color:var(--red)">Overdue</span>' : ''}</div>
        <div class="timeline-card-title">${escHtml(t.title)}</div>
        <div class="timeline-card-meta">
          <span class="priority-badge ${t.priority}">${t.priority}</span>
          <span class="status-pill ${t.status}">${t.status.replace('-', ' ')}</span>
          ${assignedTeams.length ? assignedTeams.map(tm => `<span class="team-badge" style="background:${tm.color}">${escHtml(tm.name)}</span>`).join(' ') : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  $$('.timeline-item', container).forEach(el => {
    el.addEventListener('click', () => openTaskDetails(el.dataset.id));
  });
  updateBadge(getFilteredTasks().length);
}

function renderCurrentView() {
  if (currentView === 'cards') renderCards();
  else if (currentView === 'board') renderBoard();
  else if (currentView === 'list') renderList();
  else if (currentView === 'timeline') renderTimeline();
}

function updateBadge(n) { $('#task-count-badge').textContent = n; }

// ─── Task Details Modal ─────────────────────────────────────────
let activeDetailsTaskId = null;

function openTaskDetails(id) {
  const task = store.tasks.find(t => t.id === id);
  if (!task) return;
  activeDetailsTaskId = id;

  $('#details-num').textContent = `TF-${String(task.num).padStart(3, '0')}`;
  $('#details-title').textContent = task.title;

  const prioEl = $('#details-priority');
  prioEl.className = `priority-badge ${task.priority}`;
  prioEl.textContent = task.priority;

  const statusEl = $('#details-status');
  statusEl.className = `status-pill ${task.status}`;
  statusEl.textContent = task.status.replace('-', ' ');

  const proj = store.projects.find(p => p.id === task.projectId);
  $('#details-project-wrapper').innerHTML = proj
    ? `<span style="color:${proj.color};font-weight:600;font-size:.85rem">📁 ${escHtml(proj.name)}</span>`
    : '';

  const descSec = $('#details-desc-section');
  if (task.description) {
    descSec.hidden = false;
    $('#details-desc').textContent = task.description;
  } else {
    descSec.hidden = true;
  }

  $('#details-due').textContent = task.dueDate ? fmtDate(task.dueDate) : 'No due date';

  const teamIds = task.teamIds || [];
  const assignedTeams = teamIds.map(tId => store.teams.find(tm => tm.id === tId)).filter(Boolean);
  $('#details-teams').innerHTML = assignedTeams.length
    ? assignedTeams.map(tm => `<span class="team-badge" style="background:${tm.color}">${escHtml(tm.name)}</span>`).join(' ')
    : '<span style="color:var(--text-muted)">Unassigned</span>';

  $('#details-tags').innerHTML = (task.tags || []).length
    ? task.tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join(' ')
    : '<span style="color:var(--text-muted)">No tags</span>';

  // Subtasks
  const subSec = $('#details-subtasks-section');
  const subtasks = task.subtasks || [];
  if (subtasks.length) {
    subSec.hidden = false;
    const doneCount = subtasks.filter(s => s.done).length;
    $('#details-subtasks-count').textContent = `${doneCount}/${subtasks.length} Done`;

    const listEl = $('#details-subtasks-list');
    listEl.innerHTML = subtasks.map((s, idx) => `
      <div class="subtask-item">
        <input type="checkbox" ${s.done ? 'checked' : ''} data-idx="${idx}" />
        <span class="${s.done ? 'done' : ''}">${escHtml(s.text)}</span>
      </div>
    `).join('');

    $$('input[type="checkbox"]', listEl).forEach(cb => {
      cb.addEventListener('change', () => {
        if (!checkPassword()) {
          cb.checked = !cb.checked;
          return;
        }
        const idx = +cb.dataset.idx;
        task.subtasks[idx].done = cb.checked;
        saveLocalData();
        syncTaskToCloud(task);
        openTaskDetails(id);
        renderCurrentView();
      });
    });
  } else {
    subSec.hidden = true;
  }

  $('#details-modal').hidden = false;
}

function closeDetailsModal() {
  $('#details-modal').hidden = true;
}

$('#details-close').addEventListener('click', closeDetailsModal);
$('#details-cancel-btn').addEventListener('click', closeDetailsModal);
$('#details-modal').addEventListener('click', (e) => { if (e.target === $('#details-modal')) closeDetailsModal(); });
$('#details-edit-btn').addEventListener('click', () => {
  closeDetailsModal();
  if (activeDetailsTaskId) openEditTask(activeDetailsTaskId);
});

// ─── Task Modal ───────────────────────────────────────────────
function openNewTask() {
  if (!checkPassword()) return;
  editingTaskId = null;
  editingSubtasks = [];
  $('#modal-title').textContent = 'New Task';
  $('#save-task-btn').textContent = 'Create Task';
  $('#delete-task-btn').hidden = true;
  $('#task-form').reset();
  $('#task-status').value = 'todo';
  $('#task-priority').value = 'medium';
  renderTeamCheckboxes([]);
  renderSubtasksInModal();
  $('#task-modal').hidden = false;
}

function openEditTask(id) {
  if (!checkPassword()) return;
  const task = store.tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  editingSubtasks = (task.subtasks || []).map(s => ({ ...s }));
  $('#modal-title').textContent = `TF-${String(task.num).padStart(3, '0')}`;
  $('#save-task-btn').textContent = 'Save';
  $('#delete-task-btn').hidden = false;
  $('#task-title').value = task.title;
  $('#task-desc').value = task.description || '';
  $('#task-status').value = task.status;
  $('#task-priority').value = task.priority;
  renderTeamCheckboxes(task.teamIds || []);
  $('#task-project').value = task.projectId || '';
  $('#task-due').value = task.dueDate || '';
  $('#task-tags').value = (task.tags || []).join(', ');
  renderSubtasksInModal();
  $('#task-modal').hidden = false;
}

function closeTaskModal() { $('#task-modal').hidden = true; }

$('#new-task-btn').addEventListener('click', openNewTask);
$('#modal-close').addEventListener('click', closeTaskModal);
$('#modal-cancel').addEventListener('click', closeTaskModal);
$('#task-modal').addEventListener('click', (e) => { if (e.target === $('#task-modal')) closeTaskModal(); });

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    title: $('#task-title').value.trim(),
    description: $('#task-desc').value.trim(),
    status: $('#task-status').value,
    priority: $('#task-priority').value,
    teamIds: getSelectedTeamIds(),
    projectId: $('#task-project').value || null,
    dueDate: $('#task-due').value || null,
    tags: $('#task-tags').value.split(',').map(s => s.trim()).filter(Boolean),
    subtasks: editingSubtasks,
  };

  let targetTask = null;
  if (editingTaskId) {
    targetTask = store.tasks.find(t => t.id === editingTaskId);
    Object.assign(targetTask, data, { updatedAt: new Date().toISOString() });
    toast('Task updated');
  } else {
    targetTask = {
      id: uid(),
      num: store.nextTaskNum++,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.tasks.push(targetTask);
    toast('Task created');
  }

  saveLocalData();
  syncTaskToCloud(targetTask);
  closeTaskModal();
  renderCurrentView();
});

$('#delete-task-btn').addEventListener('click', () => {
  if (!editingTaskId) return;
  if (!confirm('Delete this task?')) return;
  const idToDelete = editingTaskId;
  store.tasks = store.tasks.filter(t => t.id !== idToDelete);
  saveLocalData();
  deleteTaskFromCloud(idToDelete);
  closeTaskModal();
  renderCurrentView();
  toast('Task deleted', 'error');
});

// ─── Subtasks in modal ───────────────────────────────────────
function renderSubtasksInModal() {
  const list = $('#subtask-list');
  list.innerHTML = editingSubtasks.map((s, i) => `
    <div class="subtask-item">
      <input type="checkbox" ${s.done ? 'checked' : ''} data-idx="${i}" />
      <span class="${s.done ? 'done' : ''}">${escHtml(s.text)}</span>
      <button type="button" class="subtask-remove" data-idx="${i}">&times;</button>
    </div>
  `).join('');
  $$('.subtask-item input[type="checkbox"]', list).forEach(cb => {
    cb.addEventListener('change', () => { editingSubtasks[+cb.dataset.idx].done = cb.checked; renderSubtasksInModal(); });
  });
  $$('.subtask-remove', list).forEach(btn => {
    btn.addEventListener('click', () => { editingSubtasks.splice(+btn.dataset.idx, 1); renderSubtasksInModal(); });
  });
}

$('#add-subtask-btn').addEventListener('click', () => {
  const inp = $('#subtask-input');
  const text = inp.value.trim();
  if (!text) return;
  editingSubtasks.push({ text, done: false });
  inp.value = '';
  renderSubtasksInModal();
});
$('#subtask-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#add-subtask-btn').click(); }
});

// ─── Project Modal ────────────────────────────────────────────
let selectedProjectColor = '#6C5CE7';
$('#add-project-btn').addEventListener('click', () => {
  if (!checkPassword()) return;
  closeSidebarMobile();
  $('#project-name').value = '';
  selectedProjectColor = '#6C5CE7';
  $$('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === selectedProjectColor));
  $('#project-modal').hidden = false;
});
$$('.project-modal-close').forEach(b => b.addEventListener('click', () => { $('#project-modal').hidden = true; }));
$('#project-modal').addEventListener('click', (e) => { if (e.target === $('#project-modal')) $('#project-modal').hidden = true; });

$$('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    selectedProjectColor = sw.dataset.color;
    $$('.color-swatch').forEach(s => s.classList.toggle('active', s === sw));
  });
});

$('#project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#project-name').value.trim();
  if (!name) return;
  const newProj = { id: uid(), name, color: selectedProjectColor };
  store.projects.push(newProj);
  saveLocalData();
  syncProjectToCloud(newProj);
  renderProjects();
  $('#project-modal').hidden = true;
  toast('Project created');
});

// ─── Team Modal (handles BOTH create and edit) ────────────────
let selectedTeamColor = '#6C5CE7';

function openCreateTeam() {
  if (!checkPassword()) return;
  closeSidebarMobile();
  editingTeamId = null;
  $('#team-name').value = '';
  selectedTeamColor = '#6C5CE7';
  $$('.color-swatch-team').forEach(s => s.classList.toggle('active', s.dataset.color === selectedTeamColor));
  $('#team-modal-title').textContent = 'Add Team';
  $('#team-submit-btn').textContent = 'Add Team';
  $('#delete-team-btn').hidden = true;
  $('#team-modal').hidden = false;
}

function openEditTeam(teamId) {
  if (!checkPassword()) return;
  closeSidebarMobile();
  const team = store.teams.find(t => t.id === teamId);
  if (!team) return;
  editingTeamId = teamId;
  $('#team-name').value = team.name;
  selectedTeamColor = team.color;
  $$('.color-swatch-team').forEach(s => s.classList.toggle('active', s.dataset.color === selectedTeamColor));
  $('#team-modal-title').textContent = 'Edit Team';
  $('#team-submit-btn').textContent = 'Save Changes';
  $('#delete-team-btn').hidden = false;
  $('#team-modal').hidden = false;
}

$('#add-team-btn').addEventListener('click', openCreateTeam);
$$('.team-modal-close').forEach(b => b.addEventListener('click', () => { $('#team-modal').hidden = true; }));
$('#team-modal').addEventListener('click', (e) => { if (e.target === $('#team-modal')) $('#team-modal').hidden = true; });

$$('.color-swatch-team').forEach(sw => {
  sw.addEventListener('click', () => {
    selectedTeamColor = sw.dataset.color;
    $$('.color-swatch-team').forEach(s => s.classList.toggle('active', s === sw));
  });
});

$('#team-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#team-name').value.trim();
  if (!name) return;

  let targetTeam = null;
  if (editingTeamId) {
    targetTeam = store.teams.find(t => t.id === editingTeamId);
    if (targetTeam) {
      targetTeam.name = name;
      targetTeam.color = selectedTeamColor;
      toast(`${name} updated`);
    }
  } else {
    targetTeam = { id: uid(), name, color: selectedTeamColor };
    store.teams.push(targetTeam);
    toast(`${name} added`);
  }

  saveLocalData();
  if (targetTeam) syncTeamToCloud(targetTeam);
  renderTeams();
  renderCurrentView();
  $('#team-modal').hidden = true;
});

$('#delete-team-btn').addEventListener('click', () => {
  if (!editingTeamId) return;
  deleteTeam(editingTeamId);
  $('#team-modal').hidden = true;
});

// ─── Export / Import ──────────────────────────────────────────
$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `taskforge_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Data exported');
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!checkPassword()) {
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.tasks && data.projects && data.teams) {
        store = data;
        store.tasks = sanitizeTasks(store.tasks);
        saveLocalData();
        renderAll();
        store.projects.forEach(p => syncProjectToCloud(p));
        store.teams.forEach(t => syncTeamToCloud(t));
        store.tasks.forEach(t => syncTaskToCloud(t));
        toast('Data imported & synced to cloud');
      } else { toast('Invalid file format', 'error'); }
    } catch { toast('Failed to parse file', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ─── Keyboard Shortcuts ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetailsModal();
    closeTaskModal();
    $('#project-modal').hidden = true;
    $('#team-modal').hidden = true;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    $('#search-input').focus();
  }
});

// ─── Initial Render & Real-time Setup ────────────────────────
function renderAll() {
  renderProjects();
  renderTeams();
  renderCurrentView();
  updateLockStatusUI();
}

$('#auth-lock-btn')?.addEventListener('click', toggleLock);

renderAll();
fetchCloudData();
setupRealtimeSubscriptions();

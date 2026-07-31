/* ═══════════════════════════════════════════════════════════════
   TaskForge — Universal Task Dashboard
   Pure JS, localStorage persistence, drag-and-drop Kanban
   Tasks are assigned to TEAMS (not individuals).
   ═══════════════════════════════════════════════════════════════ */

// ─── Data Store ───────────────────────────────────────────────
const STORAGE_KEY = 'taskforge_data';

const DEFAULT_DATA = {
  tasks: [],
  projects: [
    { id: 'proj_1', name: 'TapeoutX', color: '#6C5CE7' },
  ],
  teams: [],
  nextTaskNum: 1,
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration: old data had 'members' → clear and use teams
      if (parsed.members && !parsed.teams) {
        parsed.teams = [];
        (parsed.tasks || []).forEach(t => { t.teamId = null; delete t.assigneeId; });
        delete parsed.members;
      }
      if (!parsed.teams) parsed.teams = [];
      return parsed;
    }
  } catch (_) {}
  return structuredClone(DEFAULT_DATA);
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

let store = loadData();

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

// ─── State ────────────────────────────────────────────────────
let currentView = 'board';
let currentProject = '';
let editingTaskId = null;
let editingSubtasks = [];
let draggedCard = null;
let editingTeamId = null; // null = creating, string = editing

// ─── DOM Refs ─────────────────────────────────────────────────
const sidebar = $('#sidebar');

// ─── Sidebar Toggle ───────────────────────────────────────────
$('#sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// ─── View Switching ───────────────────────────────────────────
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${currentView}`).classList.add('active');
    renderCurrentView();
  });
});

// ─── Filter Logic ─────────────────────────────────────────────
function getFilteredTasks() {
  let tasks = store.tasks;
  if (currentProject) tasks = tasks.filter(t => t.projectId === currentProject);
  const prio = $('#filter-priority').value;
  if (prio) tasks = tasks.filter(t => t.priority === prio);
  const teamFilter = $('#filter-team').value;
  if (teamFilter) tasks = tasks.filter(t => t.teamId === teamFilter);
  const q = $('#search-input').value.trim().toLowerCase();
  if (q) tasks = tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(q))
  );
  return tasks;
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
    });
  });

  const sel = $('#task-project');
  const val = sel.value;
  sel.innerHTML = '<option value="">No Project</option>' +
    store.projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  sel.value = val;
}

// ─── Render: Sidebar Teams (with edit/delete) ─────────────────
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

    // Edit buttons
    $$('.team-action-btn.edit', list).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditTeam(btn.dataset.team);
      });
    });

    // Delete buttons
    $$('.team-action-btn.delete', list).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTeam(btn.dataset.team);
      });
    });
  }

  // Update team selects (task modal + filter)
  const selects = [$('#task-team'), $('#filter-team')];
  selects.forEach(sel => {
    const val = sel.value;
    const isFilter = sel.id === 'filter-team';
    sel.innerHTML = `<option value="">${isFilter ? 'All Teams' : 'No Team'}</option>` +
      store.teams.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
    sel.value = val;
  });
}

function deleteTeam(teamId) {
  const team = store.teams.find(t => t.id === teamId);
  if (!team) return;
  const tasksUsing = store.tasks.filter(t => t.teamId === teamId).length;
  const msg = tasksUsing
    ? `Delete "${team.name}"? ${tasksUsing} task(s) will be unassigned.`
    : `Delete "${team.name}"?`;
  if (!confirm(msg)) return;
  store.teams = store.teams.filter(t => t.id !== teamId);
  store.tasks.forEach(t => { if (t.teamId === teamId) t.teamId = null; });
  saveData();
  renderTeams();
  renderCurrentView();
  toast(`${team.name} deleted`, 'error');
}

// ─── Render: Board View ──────────────────────────────────────
function renderBoard() {
  const statuses = ['backlog', 'todo', 'in-progress', 'review', 'done'];
  const tasks = getFilteredTasks();

  statuses.forEach(status => {
    const col = $(`.column-cards[data-status="${status}"]`);
    const statusTasks = tasks.filter(t => t.status === status);
    $(`[data-count="${status}"]`).textContent = statusTasks.length;

    col.innerHTML = statusTasks.map(t => cardHtml(t)).join('');

    $$('.task-card', col).forEach(card => {
      card.draggable = true;
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend', onDragEnd);
      card.addEventListener('click', () => openEditTask(card.dataset.id));
    });

    col.addEventListener('dragover', onDragOver);
    col.addEventListener('dragleave', onDragLeave);
    col.addEventListener('drop', onDrop);
  });

  updateBadge(tasks.length);
}

function cardHtml(t) {
  const team = store.teams.find(tm => tm.id === t.teamId);
  const totalSub = (t.subtasks || []).length;
  const doneSub = (t.subtasks || []).filter(s => s.done).length;
  const pct = totalSub ? Math.round((doneSub / totalSub) * 100) : 0;

  return `<div class="task-card" data-id="${t.id}" draggable="true">
    <div class="task-card-title">${escHtml(t.title)}</div>
    ${t.description ? `<div class="task-card-desc">${escHtml(t.description)}</div>` : ''}
    <div class="task-card-meta">
      <span class="priority-badge ${t.priority}">${t.priority}</span>
      ${t.dueDate ? `<span class="task-card-due ${isOverdue(t.dueDate) && t.status !== 'done' ? 'overdue' : ''}">📅 ${fmtDate(t.dueDate)}</span>` : ''}
      ${team ? `<span class="task-card-team" style="background:${team.color}">${escHtml(team.name)}</span>` : ''}
    </div>
    ${(t.tags || []).length ? `<div class="task-card-tags">${t.tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join('')}</div>` : ''}
    ${totalSub ? `<div class="subtask-progress"><div class="subtask-progress-fill" style="width:${pct}%"></div></div>` : ''}
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
    task.status = newStatus;
    saveData();
    renderBoard();
    toast(`Moved to ${newStatus.replace('-', ' ')}`, 'info');
  }
}

// ─── Render: List View ────────────────────────────────────────
function renderList() {
  const tasks = getFilteredTasks();
  const tbody = $('#list-tbody');
  tbody.innerHTML = tasks.map(t => {
    const team = store.teams.find(tm => tm.id === t.teamId);
    const proj = store.projects.find(p => p.id === t.projectId);
    return `<tr data-id="${t.id}">
      <td class="col-id">TF-${String(t.num).padStart(3, '0')}</td>
      <td>${escHtml(t.title)}</td>
      <td><span class="status-pill ${t.status}">${t.status.replace('-', ' ')}</span></td>
      <td><span class="priority-badge ${t.priority}">${t.priority}</span></td>
      <td>${team ? `<span class="team-badge" style="background:${team.color}">${escHtml(team.name)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="${isOverdue(t.dueDate) && t.status !== 'done' ? 'overdue' : ''}" style="${isOverdue(t.dueDate) && t.status !== 'done' ? 'color:var(--red)' : 'color:var(--text-muted)'}">${fmtDate(t.dueDate) || '—'}</td>
      <td>${proj ? `<span style="color:${proj.color}">${escHtml(proj.name)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
    </tr>`;
  }).join('');
  $$('tr[data-id]', tbody).forEach(row => {
    row.addEventListener('click', () => openEditTask(row.dataset.id));
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
    const team = store.teams.find(tm => tm.id === t.teamId);
    return `<div class="timeline-item" data-id="${t.id}">
      <div class="timeline-dot"></div>
      <div class="timeline-card">
        <div class="timeline-date">${fmtDate(t.dueDate)}${isOverdue(t.dueDate) && t.status !== 'done' ? ' · <span style="color:var(--red)">Overdue</span>' : ''}</div>
        <div class="timeline-card-title">${escHtml(t.title)}</div>
        <div class="timeline-card-meta">
          <span class="priority-badge ${t.priority}">${t.priority}</span>
          <span class="status-pill ${t.status}">${t.status.replace('-', ' ')}</span>
          ${team ? `<span class="team-badge" style="background:${team.color}">${escHtml(team.name)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  $$('.timeline-item', container).forEach(el => {
    el.addEventListener('click', () => openEditTask(el.dataset.id));
  });
  updateBadge(getFilteredTasks().length);
}

function renderCurrentView() {
  if (currentView === 'board') renderBoard();
  else if (currentView === 'list') renderList();
  else if (currentView === 'timeline') renderTimeline();
}

function updateBadge(n) { $('#task-count-badge').textContent = n; }

// ─── Task Modal ───────────────────────────────────────────────
function openNewTask() {
  editingTaskId = null;
  editingSubtasks = [];
  $('#modal-title').textContent = 'New Task';
  $('#save-task-btn').textContent = 'Create Task';
  $('#delete-task-btn').hidden = true;
  $('#task-form').reset();
  $('#task-status').value = 'todo';
  $('#task-priority').value = 'medium';
  renderSubtasksInModal();
  $('#task-modal').hidden = false;
}

function openEditTask(id) {
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
  $('#task-team').value = task.teamId || '';
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
    teamId: $('#task-team').value || null,
    projectId: $('#task-project').value || null,
    dueDate: $('#task-due').value || null,
    tags: $('#task-tags').value.split(',').map(s => s.trim()).filter(Boolean),
    subtasks: editingSubtasks,
  };

  if (editingTaskId) {
    const task = store.tasks.find(t => t.id === editingTaskId);
    Object.assign(task, data, { updatedAt: new Date().toISOString() });
    toast('Task updated');
  } else {
    store.tasks.push({
      id: uid(),
      num: store.nextTaskNum++,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    toast('Task created');
  }
  saveData();
  closeTaskModal();
  renderCurrentView();
});

$('#delete-task-btn').addEventListener('click', () => {
  if (!editingTaskId) return;
  if (!confirm('Delete this task?')) return;
  store.tasks = store.tasks.filter(t => t.id !== editingTaskId);
  saveData();
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
  store.projects.push({ id: uid(), name, color: selectedProjectColor });
  saveData();
  renderProjects();
  $('#project-modal').hidden = true;
  toast('Project created');
});

// ─── Team Modal (handles BOTH create and edit) ────────────────
let selectedTeamColor = '#6C5CE7';

function openCreateTeam() {
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

  if (editingTeamId) {
    // Update existing team
    const team = store.teams.find(t => t.id === editingTeamId);
    if (team) {
      team.name = name;
      team.color = selectedTeamColor;
      toast(`${name} updated`);
    }
  } else {
    // Create new team
    store.teams.push({ id: uid(), name, color: selectedTeamColor });
    toast(`${name} added`);
  }

  saveData();
  renderTeams();
  renderCurrentView(); // refresh cards/list in case team name/color changed
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
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.tasks && data.projects && data.teams) {
        store = data;
        saveData();
        renderAll();
        toast('Data imported');
      } else { toast('Invalid file format', 'error'); }
    } catch { toast('Failed to parse file', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ─── Keyboard Shortcuts ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeTaskModal();
    $('#project-modal').hidden = true;
    $('#team-modal').hidden = true;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    $('#search-input').focus();
  }
});

// ─── Initial Render ──────────────────────────────────────────
function renderAll() {
  renderProjects();
  renderTeams();
  renderCurrentView();
}

renderAll();

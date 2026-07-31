# 🚀 TaskForge — Product & Architecture Documentation

**TaskForge** is a modern, Jira-style universal task and team management dashboard built for real-time team collaboration, project tracking, and multi-team workflow execution.

---

## 📌 1. Product Overview

TaskForge solves the challenge of team-based task execution by allowing tasks to be assigned to **multiple teams simultaneously** (e.g. Design + Engineering + DevOps). It features real-time cloud synchronization, interactive Kanban drag-and-drop boards, list views, timeline schedules, and full team management capabilities.

### 🌟 Key Capabilities
- **Multi-Team Assignments:** Assign tasks to multiple teams with color-coded badges.
- **Real-Time Cloud Synchronization:** Powered by Supabase PostgreSQL and WebSocket subscriptions so all team members see updates live across devices without reloading.
- **Offline-First Resilience:** Instant optimistic UI updates using browser `localStorage` fallback cache.
- **Multiple Views:**
  - 📋 **Kanban Board:** Drag-and-drop task cards across 5 progress columns (*Backlog, To Do, In Progress, Review, Done*).
  - 📑 **List View:** Table layout with priority badges, status pills, and team indicators.
  - 📅 **Timeline View:** Chronological schedule map sorted by due dates with overdue highlighting.
- **Team & Project Management:** Create, edit, recolor, and delete custom teams and projects directly from the sidebar drawer.
- **Subtasks & Tags:** Progress percentage bars for checklist subtasks and tagged metadata.
- **Responsive Mobile Experience:** Mobile drawer menu with dark backdrop overlays, touch-optimized bottom sheet modals, and horizontal swipeable Kanban columns.
- **Data Export / Import:** Export entire workspace state to `.json` for offline backups and instant environment transfers.

---

## 🏗️ 2. Tech Stack & Architecture

TaskForge is engineered using lightweight, high-performance web standards without heavy frameworks:

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5 + Vanilla CSS3 | Custom design system using CSS variables, glassmorphism, flexbox, grid, and fluid typography. |
| **Logic & State** | Pure ES6+ JavaScript | Event-driven architecture, state management, drag-and-drop API, and DOM rendering. |
| **Cloud Backend** | Supabase (PostgreSQL) | Managed database with Row Level Security (RLS) and RESTful API endpoints. |
| **Realtime Engine** | Supabase WebSockets | Broadcasts PostgreSQL mutations (`INSERT`, `UPDATE`, `DELETE`) live to active browser clients. |
| **Deployment** | Vercel | Production edge-network deployment with static asset serving. |
| **Version Control** | GitHub | Host repository: [`charan-lingam/dasboard`](https://github.com/charan-lingam/dasboard). |

---

## 🗄️ 3. Database Schema

The database model is defined in `schema.sql` and deployed on Supabase:

### `teams` Table
```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `projects` Table
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `tasks` Table
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  num INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  team_ids JSONB DEFAULT '[]'::jsonb,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  due_date TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  subtasks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📁 4. Project Directory Structure

```
D:\AI_OS\dashboard\
├── index.html        # Main DOM structure, modals, topbar & sidebar
├── style.css         # Design tokens, themes, layouts, animations & responsive media queries
├── app.js            # Core application logic, Supabase SDK integration, state & DOM handlers
├── schema.sql        # Supabase PostgreSQL schema & realtime policies
├── .env              # Environment credentials (SUPABASE_URL, SUPABASE_ANON_KEY)
├── .gitignore        # Version control ignore list
└── PRODUCT.md        # Product architecture & usage guide
```

---

## ⚡ 5. How It Works (Internal Mechanics)

1. **State Initialization:**
   On startup, `app.js` loads initial data from `localStorage` for immediate rendering (0ms startup latency), then initiates `fetchCloudData()` via Supabase JS SDK to hydrate latest state.

2. **Real-time Synchronization:**
   `setupRealtimeSubscriptions()` establishes a WebSocket channel listener on Supabase tables. Whenever any teammate creates, edits, moves, or deletes a task, the changes immediately sync to all connected devices.

3. **Multi-Team Data Model:**
   Tasks store assigned team IDs in `teamIds: []`. The UI renders badge swatches for all assigned teams on cards and tables, and allows filtering by any team.

4. **Responsive Menu Drawer:**
   The hamburger menu button toggles `.collapsed` on desktop and `.open` with a dark backdrop overlay (`#sidebar-overlay`) on mobile devices.

---

## 🌐 6. Live Deployment & Environment Setup

- **Live Production Web App:** [https://dashboard-six-sigma-21.vercel.app](https://dashboard-six-sigma-21.vercel.app)
- **GitHub Repository:** [https://github.com/charan-lingam/dasboard](https://github.com/charan-lingam/dasboard)

### Local Development
To serve locally, run any static HTTP server from the root directory:
```bash
npx serve D:\AI_OS\dashboard -l 3456
```

### Production Deployment
To deploy updates to Vercel via CLI:
```bash
npx vercel --prod --yes
```

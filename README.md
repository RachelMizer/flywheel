# FlyWheel

FlyWheel is an internal operations tool that brings together project
planning, sprint/backlog management, Kanban boards, a team knowledge base,
and Docker container monitoring in a single app with role-based access.

## Features

- **Dashboard** — at-a-glance view of Docker container health and recent
  Kanban board activity.
- **Kanban** — drag-and-drop project boards with columns, cards,
  checklists, member assignment, and shareable board links (view/edit
  roles) for link-based collaboration.
- **Project Planning** — projects with descriptions, dates, an icon, and
  attached documents, plus a visual timeline of milestones tied to epics
  and backlog stories.
- **Backlog & Sprints** — epics, numbered sprints, and backlog items/stories
  that can be estimated, assigned to a sprint, and linked one-to-one with a
  Kanban card.
- **Team Resources** — a shared knowledge-base file library (upload,
  browse, archive) available to all authenticated users.
- **Team Overview** — manager-only view of Kanban cards grouped by
  assignee.
- **Docker Manager** — registry/dashboard of Docker container health
  status (healthy / working / down) by cluster.
- **Account** — profile management.

## Tech Stack

**Backend:** Django 5.2, Django REST Framework, django-cors-headers,
token authentication, SQLite (dev), Pillow.

**Frontend:** React 19, Vite, react-router-dom, lucide-react,
react-markdown (with remark-gfm).

## Roles & Permissions

Access to Kanban, Backlog, Projects, and Docker Manager is controlled via
Django Groups (see `api/management/commands/setup_groups.py`):

| Group           | Access                                                    |
|-----------------|------------------------------------------------------------|
| `team-member`   | Add/change/view on Kanban, Backlog, Projects, Docker      |
| `support`       | Full add/change/delete/view                               |
| `support-admin` | Full add/change/delete/view                                |
| `manager`       | Full add/change/delete/view; sees the Team Overview page   |

Team Resources is available to any authenticated user, with archiving
restricted to managers.

## Getting Started

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py setup_groups
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and expects the
backend API at the address configured in the frontend's fetch calls; CORS
is pre-configured for the Vite dev server.

## Project Structure

```
backend/
  api/             Auth endpoints (login, logout, current user)
  kanban/          Boards, columns, cards, checklists, link sharing
  backlog/         Epics, sprints, backlog items
  projects/        Projects, documents, timeline events
  team_resources/  Shared knowledge-base file library
  docker_manager/  Docker container status registry
  flywheel/        Django project settings/urls

frontend/
  src/pages/       One React page per feature area
  src/context/      Auth context (token, current user)
```

# FlyWheel

FlyWheel is an internal operations tool that brings together project
management, IT/support ticketing, team messaging, and Docker container
monitoring in a single app with role-based access.

## Features

- **Dashboard** — at-a-glance view of Docker container health, recent
  Kanban activity, and open tickets.
- **Kanban** — drag-and-drop project boards with columns, cards,
  checklists, and member assignment.
- **Tickets** — self-service ticket filing with screenshot attachments, a
  support triage dashboard, and resolution metrics.
- **Team Overview** — manager view of Kanban cards grouped by assignee.
- **Messages** — direct messaging between users (in progress).
- **Docker Manager** — registry of Docker container status (in progress).
- **Account** — profile management.

## Tech Stack

**Backend:** Django 5.2, Django REST Framework, token authentication,
SQLite (dev), Pillow.

**Frontend:** React 19, Vite, react-router-dom, lucide-react.

## Roles & Permissions

Access is controlled via Django Groups:

| Group           | Access                                                    |
|-----------------|------------------------------------------------------------|
| `team-member`   | Add/change/view on Kanban, Tickets, Messaging, Docker      |
| `support`       | Full add/change/delete/view; sees the Support Dashboard    |
| `support-admin` | Same as `support`; default assignee for new tickets        |
| `manager`       | Full add/change/delete/view; sees the Team Overview page   |

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
  kanban/          Boards, columns, cards, checklists
  tickets/         Support ticket system
  messaging/       Direct messaging
  docker_manager/  Docker container status registry
  flywheel/        Django project settings/urls

frontend/
  src/pages/       One React page per feature area
  src/context/      Auth context (token, current user)
```

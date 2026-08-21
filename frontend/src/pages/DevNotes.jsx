import {
  Layers, FolderTree, Terminal, Package, Database, Server,
  ShieldCheck, Palette, Boxes, Rocket, TriangleAlert,
} from 'lucide-react'
import './DevNotes.css'

const STACK = [
  ['Frontend',   'React 19 + Vite 8'],
  ['Routing',    'react-router-dom 7'],
  ['Backend',    'Django 5.2 + Django REST Framework 3.16'],
  ['Runtime',    'Python 3.13'],
  ['Database',   'SQLite (dev and production)'],
  ['Auth',       'DRF token authentication'],
  ['Serving',    'Gunicorn + WhiteNoise'],
  ['Hosting',    'Render, via a render.yaml Blueprint'],
  ['Linting',    'ESLint 9 (flat config)'],
  ['UI extras',  'lucide-react, react-markdown + remark-gfm'],
]

const SCRIPTS = [
  ['npm run dev', 'frontend/', 'Vite dev server on :5173. Opens the browser and proxies /api and /media to :8000.'],
  ['npm run build', 'frontend/', 'Production bundle into frontend/dist/ — the directory the deploy publishes.'],
  ['npm run lint', 'frontend/', 'ESLint across the frontend using the flat config in eslint.config.js.'],
  ['manage.py runserver', 'backend/', 'Django dev server on :8000.'],
  ['manage.py migrate', 'backend/', 'Applies migrations. Runs automatically on every production boot.'],
  ['manage.py setup_groups', 'backend/', 'Creates the four permission groups and assigns model permissions across the kanban, backlog, projects, and docker_manager apps.'],
  ['manage.py seed_demo', 'backend/', 'Loads the demo dataset from api/fixtures/seed_data.json. Idempotent — no-ops when the data is already there; --force reloads it.'],
  ['manage.py seed_containers', 'backend/', 'Seeds the demo container registry. Called by seed_demo, and runnable alone with --force to reset it.'],
  ['docker-demo/report_agent.py', 'repo root', 'Local reporter that reads the Docker daemon and posts live container status to the API. Standard library only.'],
]

const PACKAGES = [
  ['react / react-dom', 'Frontend', 'UI runtime. Function components and hooks throughout — no class components.'],
  ['vite / @vitejs/plugin-react', 'Frontend', 'Dev server, hot reload, and production bundler. Its dev proxy is what lets the app call relative /api paths locally.'],
  ['react-router-dom', 'Frontend', 'Client-side routing. Every route is declared in App.jsx.'],
  ['lucide-react', 'Frontend', 'Icon set used in the sidebar, page headers, and card actions.'],
  ['react-markdown + remark-gfm', 'Frontend', 'Renders uploaded .md documents in the shared viewer at /documents/view — tables, task lists, strikethrough.'],
  ['eslint + react-hooks plugin', 'Frontend', 'Lint rules, most usefully the hook dependency checks.'],
  ['Django', 'Backend', 'ORM, migrations, auth and groups, and the built-in admin at /admin/.'],
  ['djangorestframework', 'Backend', 'API layer. Token auth and IsAuthenticated are the project-wide defaults in settings.py.'],
  ['django-cors-headers', 'Backend', 'Allows the Vite dev origin. Production needs no CORS — the frontend proxies the API onto its own origin.'],
  ['Pillow', 'Backend', 'Required by ImageField, used for project icons.'],
  ['gunicorn', 'Backend', 'WSGI server in production.'],
  ['whitenoise', 'Backend', 'Serves collected static files, including the admin CSS, straight from the web process.'],
]

const STORAGE = [
  ['Relational data', 'SQLite file — db.sqlite3', 'Everything except uploads: users, boards, cards, epics, sprints, backlog items, projects, timeline events, container records.'],
  ['Uploaded files', 'Django FileSystemStorage under MEDIA_ROOT', 'Project icons, project documents, and Team Resources files, each in its own upload_to folder. post_delete signals remove the file from disk when the row goes away.'],
  ['Static assets', 'collectstatic → backend/staticfiles/', 'Rebuilt on every deploy and deliberately not persisted. Served by WhiteNoise with hashed, compressed filenames.'],
  ['Session state', 'Browser localStorage', 'The auth token lives under the token key and is sent as an Authorization: Token <key> header. The API itself is stateless — no session cookie.'],
  ['Production persistence', 'Mounted disk at /var/data', 'settings.py reads DATA_DIR and puts both the SQLite file and media/ there, so data survives deploys and restarts. Without that variable both fall back to BASE_DIR for local dev.'],
]

const API = [
  ['/api/auth/', 'Login, logout, and current-user detail (GET and PATCH).'],
  ['/api/health/', 'Unauthenticated health check.'],
  ['/api/kanban/', 'Boards, columns, cards, checklists, memberships, share links, and the activity feed.'],
  ['/api/backlog/', 'Epics, sprints, backlog items, and user stories.'],
  ['/api/projects/', 'Projects, attached documents, and timeline events.'],
  ['/api/team-resources/', 'Knowledge-base uploads, plus the archive, restore, and purge lifecycle.'],
  ['/api/docker/', 'Container registry, and the report endpoint the local agent posts to.'],
  ['/admin/', 'Django admin — the fastest way to inspect or repair data by hand.'],
]

function Section({ icon, title, children }) {
  const Icon = icon
  return (
    <section className="dn-section">
      <div className="dn-section-head">
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Table({ headers, rows }) {
  return (
    <div className="dn-table-wrap">
      <table className="dn-table">
        <thead>
          <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row[0]}>
              <td><code>{row[0]}</code></td>
              {row.slice(1).map((cell, i) => <td key={i}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DevNotes() {
  return (
    <div className="page dn-page">
      <div className="dn-header">
        <h1>Developer&rsquo;s Notes</h1>
        <p className="dn-subtitle">
          How FlyWheel is put together and what you need in order to work on it — the
          stack, the scripts, where data actually lives, and the handful of things that
          are easy to get wrong.
        </p>
      </div>

      <Section icon={Layers} title="Stack at a glance">
        <div className="dn-stack-grid">
          {STACK.map(([label, value]) => (
            <div className="dn-stack-item" key={label}>
              <span className="dn-stack-label">{label}</span>
              <span className="dn-stack-value">{value}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={FolderTree} title="Repository layout">
        <pre className="dn-pre">{`backend/
  flywheel/         Django project — settings, root URLs, WSGI entry point
  api/              Auth endpoints, health check, seed_demo and setup_groups
  projects/         Projects, documents, timeline events, scrum roles
  kanban/           Boards, columns, cards, checklists, sharing, activity log
  backlog/          Epics, sprints, backlog items, user stories
  team_resources/   Shared knowledge-base file library
  docker_manager/   Container registry and the reporting endpoint

frontend/
  src/pages/        One component per route, each with a matching .css file
  src/components/   The few pieces shared between pages
  src/context/      AuthContext — current user, token, login and logout
  src/utils/        Small shared helpers
  public/           Favicons and brand assets, copied verbatim into the build

docker-demo/        Local Docker stack plus the reporting agent
dev/                Design docs, wireframes, schema notes — not deployed
render.yaml         Blueprint describing both deployed services`}</pre>
      </Section>

      <Section icon={Terminal} title="Running it locally">
        <p className="dn-text">
          Two processes, two terminals. Start the backend first so the frontend proxy has
          something to talk to.
        </p>
        <pre className="dn-pre">{`cd backend
python -m venv venv
venv\\Scripts\\activate            # source venv/bin/activate on macOS or Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py setup_groups
python manage.py seed_demo        # optional — loads the demo dataset
python manage.py runserver        # http://localhost:8000

cd frontend
npm install
npm run dev                       # http://localhost:5173`}</pre>
        <p className="dn-note">
          There is no API base URL to configure anywhere. The frontend calls relative
          paths like <code>/api/kanban/boards/</code>, which Vite proxies to port 8000 in
          development and the host rewrites to the backend service in production. That one
          decision is why the frontend needs no environment variables and no CORS setup
          once deployed.
        </p>
      </Section>

      <Section icon={Package} title="Scripts and management commands">
        <Table headers={['Command', 'Run from', 'What it does']} rows={SCRIPTS} />
      </Section>

      <Section icon={Boxes} title="Packages, and what each is actually for">
        <Table headers={['Package', 'Side', 'Why it is here']} rows={PACKAGES} />
      </Section>

      <Section icon={Database} title="Where data lives">
        <Table headers={['Kind', 'Stored as', 'Notes']} rows={STORAGE} />
        <p className="dn-note">
          SQLite is a deliberate choice here rather than a placeholder nobody swapped out.
          The app runs as a single instance with light write traffic, and a file on a
          mounted disk keeps the whole deployment down to one service and no managed
          database. The trade-off is that it does not survive horizontal scaling — see the
          caveats at the bottom.
        </p>
      </Section>

      <Section icon={Server} title="API surface">
        <Table headers={['Prefix', 'Covers']} rows={API} />
      </Section>

      <Section icon={ShieldCheck} title="Auth and permissions">
        <ul className="dn-list">
          <li>
            Login posts credentials to <code>/api/auth/login/</code> and gets back a token
            plus the user object. The token goes into <code>localStorage</code>; every
            later request carries it in an <code>Authorization</code> header.
          </li>
          <li>
            REST Framework is configured project-wide with <code>TokenAuthentication</code>{' '}
            and <code>IsAuthenticated</code>, so endpoints are private by default and have
            to opt out rather than opt in.
          </li>
          <li>
            Four Django groups — <code>manager</code>, <code>support</code>,{' '}
            <code>support-admin</code>, and <code>team-member</code> — are created by{' '}
            <code>setup_groups</code>. Managers get delete rights and the Team Overview
            page; team members can add and change, but not delete.
          </li>
          <li>
            Kanban layers something finer on top of groups: per-board membership with a
            view or edit role, plus optional link sharing through a board share token.
            Deleting a board or card is restricted to the board owner or a manager, which
            is deliberately separate from ordinary edit access.
          </li>
          <li>
            The frontend reads group membership off the current user and passes an{' '}
            <code>isManager</code> flag down to pages. That drives what the UI offers; the
            server re-checks the same permissions, so it is convenience, not security.
          </li>
        </ul>
      </Section>

      <Section icon={Palette} title="Frontend conventions">
        <ul className="dn-list">
          <li>
            One page component per route in <code>src/pages/</code>, PascalCase, with a
            stylesheet of the same basename beside it.
          </li>
          <li>
            Page CSS is intentionally self-contained — shared-looking classes are
            duplicated per page rather than centralized, and class names carry a short
            page-scoped prefix (<code>tr-</code>, <code>bl-</code>, <code>pd-</code>,{' '}
            <code>dn-</code>) for exactly that reason.
          </li>
          <li>
            Vite bundles all of that CSS globally with no scoping, so two pages defining
            the same class name with different values collide silently by import order.
            Keep duplicated classes identical, or prefix them.
          </li>
          <li>
            Global design tokens live in <code>index.css</code> as CSS custom properties,
            along with the base button, heading, and input styles every page inherits.
          </li>
          <li>
            Data fetching is plain <code>fetch</code> inside <code>useEffect</code> — no
            data-fetching library. Auth is the only React context.
          </li>
        </ul>
      </Section>

      <Section icon={Boxes} title="The container monitoring demo">
        <p className="dn-text">
          The Container Manager page is backed by real containers when you run the stack in{' '}
          <code>docker-demo/</code>:
        </p>
        <pre className="dn-pre">{`docker compose -f docker-demo/compose.yaml up -d
python docker-demo/report_agent.py        # --once for a single pass`}</pre>
        <p className="dn-text">
          Containers opt in through <code>com.flywheel.*</code> labels that also declare
          their cluster, display name, and the directory whose files get counted. The agent
          polls the Docker daemon, maps each container&rsquo;s state onto a FlyWheel status,
          and posts the batch to the report endpoint — the refreshed timestamp is what makes
          the page read as live. Stop a container and it flips to <em>down</em> within one
          cycle.
        </p>
        <p className="dn-note">
          The hosted deploy has no Docker daemon and nothing local can reach it, so seeded
          demo rows stand in there. The agent is standard library only — nothing to install.
        </p>
      </Section>

      <Section icon={Rocket} title="Deployment">
        <ul className="dn-list">
          <li>
            <code>render.yaml</code> describes both services: a static site built from{' '}
            <code>frontend/</code> and published from <code>dist/</code>, and a Python web
            service running the Django backend.
          </li>
          <li>
            The static site rewrites <code>/api/*</code> and <code>/media/*</code> to the
            backend, and everything else to <code>index.html</code>. The browser therefore
            sees a single origin, which is why production needs no CORS configuration and
            why client-side routes survive a hard refresh.
          </li>
          <li>
            Migrations and demo seeding run in the start command, not the build or
            pre-deploy step. Those two run on an ephemeral filesystem where the persistent
            disk is not mounted, so a migration there looks like it succeeded while leaving
            the real database untouched. Both commands are idempotent, which is what makes
            running them on every boot safe.
          </li>
          <li>
            The persistent disk is what makes SQLite viable at all — it holds the database
            and the uploaded media across deploys.
          </li>
        </ul>
      </Section>

      <Section icon={TriangleAlert} title="Caveats worth knowing before you change things">
        <ul className="dn-list">
          <li>
            <strong>Single instance only.</strong> SQLite has no safe story for concurrent
            migrations. Scaling past one instance means moving <code>migrate</code> into a
            release step or one-off job instead of racing on every boot — and realistically
            moving off SQLite.
          </li>
          <li>
            <strong>CSS has no scoping.</strong> A new class that duplicates an existing
            name on another page is a live collision, not a warning.
          </li>
          <li>
            <strong>Rewrite targets are real hostnames, not service names.</strong> The
            backend&rsquo;s assigned hostname is written into <code>render.yaml</code>;
            pointing it at the bare service name proxies the API to an unrelated service.
            Re-check it after anything that could reassign the hostname.
          </li>
          <li>
            <strong>Static files are disposable, media is not.</strong> Uploads go to the
            mounted disk; <code>staticfiles/</code> is a build artifact regenerated on every
            deploy. Nothing you care about should live in it.
          </li>
          <li>
            <strong>Seeding matches rows by primary key.</strong> Running{' '}
            <code>seed_demo --force</code> restores the demo dataset and discards edits made
            through the live UI. That is the point of it, but it is not undoable.
          </li>
        </ul>
      </Section>
    </div>
  )
}

export default DevNotes

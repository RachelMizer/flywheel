# FlyWheel demo container stack

Local-only tooling that gives FlyWheel real Docker containers to monitor. The
public Render deploy has no Docker daemon and nothing here can reach it, so this
is for **local development**; on the deploy, the seeded demo rows stand in.

## What's here

| File | Purpose |
| --- | --- |
| `compose.yaml` | A few small SCADA/Ignition-themed containers, each with real files inside a labelled directory. |
| `configs/`, `mosquitto/` | Files mounted into the containers (Ignition config exports, broker config). |
| `report_agent.py` | Reads the Docker daemon, counts the files inside each container, and POSTs live status to FlyWheel on a loop. Stdlib only — no `pip install`. |

The containers carry `com.flywheel.*` labels the agent reads: `monitor=true` to
opt in, `cluster`/`name` for how they group in the UI, and `path` for the
directory whose files get counted.

## Run it

1. Start Docker Desktop, then bring the stack up:

   ```sh
   docker compose -f docker-demo/compose.yaml up -d
   ```

2. Start FlyWheel locally (backend on :8000, frontend on :5173):

   ```sh
   cd backend && python manage.py runserver
   cd frontend && npm run dev
   ```

3. Run the reporter (defaults: `http://localhost:8000`, `admin`/`admin`):

   ```sh
   python docker-demo/report_agent.py            # loop every 5s
   python docker-demo/report_agent.py --once      # single pass
   ```

4. Open the **Docker** page in FlyWheel. The containers appear grouped by
   cluster, with live status and a file count that changes as `edge-node`
   writes tags. Stop a container (`docker stop fw-edge-node`) and within one
   reporter cycle it flips to **down**.

## Tear down

```sh
docker compose -f docker-demo/compose.yaml down -v
```

The rows the agent created stay in the FlyWheel database (last_seen just stops
advancing). Remove them from Django admin, or reset the whole demo registry with
`python manage.py seed_containers --force`.

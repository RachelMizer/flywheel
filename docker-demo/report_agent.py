#!/usr/bin/env python3
"""FlyWheel container reporter.

Reads the local Docker daemon for containers labelled com.flywheel.monitor=true,
counts the files inside each one's labelled directory, maps its Docker state to a
FlyWheel status, and POSTs the batch to a locally running FlyWheel at
/api/docker/report/. Loops so last_seen stays fresh — that heartbeat is what makes
the FlyWheel Docker Manager page "live".

This is local tooling. The Render deploy has no Docker daemon and nothing here can
reach it; there the seeded demo rows stand in.

Stdlib only — no pip install needed.

  python docker-demo/report_agent.py            # loop forever, 5s interval
  python docker-demo/report_agent.py --once      # single pass, then exit
  python docker-demo/report_agent.py --interval 10

Env overrides:
  FLYWHEEL_URL   (default http://localhost:8000)
  FLYWHEEL_USER  (default admin)
  FLYWHEEL_PASS  (default admin)
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("FLYWHEEL_URL", "http://localhost:8000").rstrip("/")
USER = os.environ.get("FLYWHEEL_USER", "admin")
PASSWORD = os.environ.get("FLYWHEEL_PASS", "admin")
LABEL = "com.flywheel.monitor=true"


def docker(*args):
    """Run a docker CLI command, returning stdout (raises on non-zero).

    Force UTF-8 decoding: docker emits UTF-8 (labels here contain em dashes),
    but subprocess with text=True would otherwise decode using the platform
    locale (cp1252 on Windows), mojibaking non-ASCII and splitting a cluster
    into two once its name no longer matches the seeded rows.
    """
    return subprocess.run(
        ["docker", *args], capture_output=True, text=True, check=True,
        encoding="utf-8",
    ).stdout


def get_token():
    body = json.dumps({"username": USER, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{URL}/api/auth/login/", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)["token"]
    except urllib.error.HTTPError as e:
        sys.exit(f"login failed ({e.code}) as {USER!r} at {URL} — "
                 f"is FlyWheel running and are the credentials right?")
    except urllib.error.URLError as e:
        sys.exit(f"cannot reach FlyWheel at {URL}: {e.reason}")


def status_for(state):
    """Map a Docker container State object to a FlyWheel status."""
    health = (state.get("Health") or {}).get("Status")  # healthy|unhealthy|starting|None
    running = state.get("Running", False)
    if health == "unhealthy":
        return "down"
    if state.get("Restarting") or health == "starting":
        return "working"
    if running:
        return "healthy"
    return "down"  # exited / created / dead / paused


def count_files(container_id, path):
    """Count regular files under `path` inside the container. 0 if unreachable."""
    if not path:
        return None
    try:
        out = docker("exec", container_id, "sh", "-c",
                     f"find {path} -type f 2>/dev/null | wc -l")
        return int(out.strip() or 0)
    except (subprocess.CalledProcessError, ValueError):
        return None  # not running, no shell, or path missing


def collect():
    ids = docker("ps", "-a", "--filter", f"label={LABEL}",
                 "--format", "{{.ID}}").split()
    if not ids:
        return []
    inspected = json.loads(docker("inspect", *ids))
    reports = []
    for c in inspected:
        labels = (c.get("Config") or {}).get("Labels") or {}
        state = c.get("State") or {}
        cid = c["Id"][:12]
        status = status_for(state)
        fcount = count_files(cid, labels.get("com.flywheel.path")) if state.get("Running") else None

        note_bits = []
        if fcount is not None:
            note_bits.append(f"{fcount} file(s) in {labels.get('com.flywheel.path')}")
        if status == "down":
            note_bits.append(f"container {state.get('Status', 'not running')}")
        reports.append({
            "container_id": cid,
            "name": labels.get("com.flywheel.name") or c.get("Name", "").lstrip("/"),
            "namespace": labels.get("com.flywheel.namespace", ""),
            "cluster": labels.get("com.flywheel.cluster", ""),
            "image": (c.get("Config") or {}).get("Image", ""),
            "status": status,
            "notes": " · ".join(note_bits),
        })
    return reports


def post(token, reports):
    body = json.dumps(reports).encode()
    req = urllib.request.Request(
        f"{URL}/api/docker/report/", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Token {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def one_pass(token):
    reports = collect()
    if not reports:
        print("no containers labelled", LABEL, "— is the demo stack up?")
        return
    result = post(token, reports)
    stamp = time.strftime("%H:%M:%S")
    for rep in reports:
        print(f"[{stamp}] {rep['status']:8} {rep['name']:22} {rep['notes']}")
    if result.get("errors"):
        print("  server rejected:", result["errors"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="single pass then exit")
    ap.add_argument("--interval", type=int, default=5, help="seconds between passes")
    args = ap.parse_args()

    # Fail fast if docker isn't reachable before we bother logging in.
    try:
        docker("version", "--format", "{{.Server.Version}}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        sys.exit("docker daemon not reachable — start Docker Desktop first.")

    token = get_token()
    print(f"reporting to {URL} as {USER}; interval {args.interval}s"
          + (" (once)" if args.once else ""))
    while True:
        try:
            one_pass(token)
        except urllib.error.HTTPError as e:
            print("POST failed:", e.code, e.read().decode()[:200])
        except subprocess.CalledProcessError as e:
            # A transient docker hiccup (daemon busy/restarting) must not kill a
            # long-running monitor — log it and try again next tick.
            print("docker call failed (transient?):", (e.stderr or "").strip()[:200])
            if args.once:
                sys.exit(1)
        except Exception as e:  # keep the loop alive across anything unexpected
            print("pass failed:", type(e).__name__, str(e)[:200])
            if args.once:
                raise
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()

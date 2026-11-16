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
  python docker-demo/report_agent.py --scan        # also CVE-scan images (Trivy)

Each report also carries a security posture block for FlyWheel's Security page:
privileged mode, effective user, host networking, added capabilities, mounts,
published ports, MQTT/Redis authentication, image age, and SHA-256 hashes of the
files under each container's com.flywheel.config_paths (for config drift).
With --scan, images are scanned with Trivy: a local `trivy` binary if one is on
PATH, otherwise the aquasec/trivy image run through Docker. Scans are cached per
image and repeated every --scan-hours.

Env overrides:
  FLYWHEEL_URL   (default http://localhost:8000)
  FLYWHEEL_USER  (default admin)
  FLYWHEEL_PASS  (default admin)
"""
import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("FLYWHEEL_URL", "http://localhost:8000").rstrip("/")
USER = os.environ.get("FLYWHEEL_USER", "admin")
PASSWORD = os.environ.get("FLYWHEEL_PASS", "admin")
LABEL = "com.flywheel.monitor=true"
TRIVY_IMAGE = "aquasec/trivy:0.56.2"
MQTT_DEFAULT_CONF = "/mosquitto/config/mosquitto.conf"
MAX_CONFIG_FILES = 500


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
                     f"find {shlex.quote(path)} -type f 2>/dev/null | wc -l")
        return int(out.strip() or 0)
    except (subprocess.CalledProcessError, ValueError):
        return None  # not running, no shell, or path missing


# ── Security posture ─────────────────────────────────────────────────────────

def exec_out(container_id, script):
    """Run a shell snippet inside a container; None if it can't run."""
    try:
        return docker("exec", container_id, "sh", "-c", script)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def effective_user(container_id, config_user, running):
    """uid of PID 1 (what the workload really runs as), else the configured User.

    Config.User alone misleads: images like mosquitto start as root and drop
    privileges in their entrypoint, so /proc/1/status is the honest answer.
    """
    if running:
        out = exec_out(container_id, "grep '^Uid:' /proc/1/status")
        if out and len(out.split()) > 1:
            uid = out.split()[1]
            name = (exec_out(container_id, f"getent passwd {shlex.quote(uid)} | cut -d: -f1") or "").strip()
            return (f"{uid} ({name})" if name else uid), uid == "0"
    user = (config_user or "").split(":")[0]
    return (user or "root (default)"), user in ("", "0", "root")


def published_ports(network_settings):
    out = []
    for key, bindings in ((network_settings or {}).get("Ports") or {}).items():
        port, _, proto = key.partition("/")
        for b in bindings or []:  # None means exposed but not published
            out.append({"container_port": int(port), "protocol": proto or "tcp",
                        "host_ip": b.get("HostIp") or "0.0.0.0", "host_port": b.get("HostPort")})
    return out


def mounts(raw):
    out = []
    for m in raw or []:
        src = m.get("Source", "") if m.get("Type") == "bind" else f"volume:{m.get('Name', '')}"
        out.append({"source": src, "destination": m.get("Destination", ""), "rw": bool(m.get("RW"))})
    return out


def mqtt_service(container_id, conf_path):
    text = exec_out(container_id, f"cat {shlex.quote(conf_path)} 2>/dev/null")
    if text is None:
        return None
    lines = [ln.split("#", 1)[0].strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    allow = [ln.split()[1].lower() for ln in lines
             if ln.startswith("allow_anonymous ") and len(ln.split()) > 1]
    anonymous = bool(allow) and allow[-1] == "true"  # mosquitto 2 defaults to false
    tls = any(ln.split()[0] in ("certfile", "cafile", "keyfile") for ln in lines)
    has_pw = any(ln.startswith(("password_file", "plugin", "auth_plugin")) for ln in lines)
    detail = "; ".join([
        "allow_anonymous true" if anonymous else "anonymous access disabled",
        "password_file set" if has_pw else "no password_file",
        "TLS configured" if tls else "no TLS listener",
    ]) + "."
    return {"service": "mqtt", "anonymous": anonymous, "tls": tls, "detail": detail}


def redis_service(container_id):
    out = exec_out(container_id, "redis-cli CONFIG GET requirepass 2>/dev/null")
    if out is None:
        return None
    lines = out.splitlines()
    if lines and lines[0].startswith("NOAUTH"):
        return {"service": "redis", "anonymous": False, "tls": None, "detail": "Password required."}
    anonymous = len(lines) < 2 or not lines[1].strip()
    return {"service": "redis", "anonymous": anonymous, "tls": None,
            "detail": "No requirepass set; any client can read and write keys."
                      if anonymous else "requirepass set."}


def config_hashes(container_id, paths):
    quoted = " ".join(shlex.quote(p) for p in paths)
    script = (f"find {quoted} -type f 2>/dev/null | head -n {MAX_CONFIG_FILES} "
              "| while read -r f; do sha256sum \"$f\"; done")
    out = exec_out(container_id, script)
    if out is None:
        return None
    hashes = {}
    for line in out.splitlines():
        digest, _, path = line.partition("  ")
        if digest and path:
            hashes[path.strip()] = digest.strip()
    return hashes


_image_created = {}


def image_created(image_id):
    if image_id not in _image_created:
        try:
            _image_created[image_id] = json.loads(docker("image", "inspect", image_id))[0].get("Created")
        except (subprocess.CalledProcessError, ValueError, IndexError):
            _image_created[image_id] = None
    return _image_created[image_id]


_scan_cache = {}  # image id -> (scanned_at epoch, cve dict)


def trivy_scan(image_ref):
    args = ["image", "--quiet", "--format", "json", "--scanners", "vuln", image_ref]
    if shutil.which("trivy"):
        cmd, scanner = ["trivy", *args], "trivy"
    else:
        cmd = ["docker", "run", "--rm", "-v", "/var/run/docker.sock:/var/run/docker.sock",
               "-v", "flywheel-trivy-cache:/root/.cache/", TRIVY_IMAGE, *args]
        scanner = "trivy (docker)"
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=900)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:200] or f"exit {out.returncode}")
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for result in json.loads(out.stdout or "{}").get("Results") or []:
        for v in result.get("Vulnerabilities") or []:
            sev = (v.get("Severity") or "").lower()
            if sev in counts:
                counts[sev] += 1
    return {"counts": counts, "scanner": scanner,
            "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def cve_for(image_id, image_ref, scan_hours):
    cached = _scan_cache.get(image_id)
    if cached and time.time() - cached[0] < scan_hours * 3600:
        return cached[1]
    print(f"  scanning {image_ref} for CVEs (first scan can take a few minutes)...")
    try:
        result = trivy_scan(image_ref)
    except (RuntimeError, subprocess.TimeoutExpired, FileNotFoundError, ValueError) as e:
        print(f"  scan of {image_ref} failed: {e}")
        return cached[1] if cached else None
    _scan_cache[image_id] = (time.time(), result)
    return result


def collect_security(c, labels, cid, running, scan_hours=None):
    host = c.get("HostConfig") or {}
    config = c.get("Config") or {}
    run_user, is_root = effective_user(cid, config.get("User"), running)
    image = config.get("Image", "")
    sec = {
        "privileged": bool(host.get("Privileged")),
        "run_user": run_user,
        "runs_as_root": is_root,
        "network_mode": host.get("NetworkMode", ""),
        "cap_add": host.get("CapAdd") or [],
        "mounts": mounts(c.get("Mounts")),
        "published_ports": published_ports(c.get("NetworkSettings")),
        "image_created": image_created(c.get("Image", "")),
    }
    # Service and file checks need a shell inside the container; a stopped one
    # just omits them, and the server keeps the last values it had.
    if running:
        services = []
        if "mosquitto" in image:
            services.append(mqtt_service(cid, labels.get("com.flywheel.mqtt_config", MQTT_DEFAULT_CONF)))
        if "redis" in image:
            services.append(redis_service(cid))
        sec["services"] = [s for s in services if s]

        paths = [p.strip() for p in labels.get("com.flywheel.config_paths", "").split(",") if p.strip()]
        if paths:
            hashes = config_hashes(cid, paths)
            if hashes is not None:
                sec["config_hashes"] = hashes
    if scan_hours is not None:
        cve = cve_for(c.get("Image", ""), image, scan_hours)
        if cve:
            sec["cve"] = cve
    return sec


def collect(scan_hours=None):
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
            "security": collect_security(c, labels, cid, bool(state.get("Running")), scan_hours),
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


def one_pass(token, scan_hours=None):
    reports = collect(scan_hours)
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
    ap.add_argument("--scan", action="store_true", help="CVE-scan images with Trivy")
    ap.add_argument("--scan-hours", type=float, default=12,
                    help="rescan each image after this many hours (default 12)")
    args = ap.parse_args()

    # Fail fast if docker isn't reachable before we bother logging in.
    try:
        docker("version", "--format", "{{.Server.Version}}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        sys.exit("docker daemon not reachable — start Docker Desktop first.")

    token = get_token()
    if PASSWORD == "admin":
        print("warning: logging in with the default password; set FLYWHEEL_USER/FLYWHEEL_PASS "
              "(the Security page flags default passwords).")
    print(f"reporting to {URL} as {USER}; interval {args.interval}s"
          + (" (once)" if args.once else ""))
    while True:
        try:
            one_pass(token, args.scan_hours if args.scan else None)
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

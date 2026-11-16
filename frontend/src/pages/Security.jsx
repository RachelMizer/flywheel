import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  OctagonAlert, TriangleAlert, CircleAlert, Info, CircleCheck,
  ShieldCheck, KeyRound, Link2, Boxes, ScrollText, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './Security.css'

const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })

async function api(path, opts = {}) {
  const res = await fetch(`/api/security/${path}`, { ...opts, headers: { ...authH(), ...(opts.headers || {}) } })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const body = await res.json(); msg = body.error || body.detail || msg } catch { /* not JSON */ }
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

function relTime(iso) {
  if (!iso) return '—'
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

const fullTime = iso => (iso ? new Date(iso).toLocaleString() : '')

function fmtSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Severity ──────────────────────────────────────────────────────────────────
// Status hues are reserved and always paired with an icon + label, never color alone.
// Event severities (info/warning/critical) and finding severities
// (info/low/medium/high/critical) share one scale.
const SEV = {
  critical: { label: 'Critical', Icon: OctagonAlert },
  high:     { label: 'High',     Icon: TriangleAlert },
  warning:  { label: 'Warning',  Icon: TriangleAlert },
  medium:   { label: 'Medium',   Icon: CircleAlert },
  low:      { label: 'Low',      Icon: Info },
  info:     { label: 'Info',     Icon: Info },
}
const SEV_RANK = { critical: 0, high: 1, warning: 1, medium: 2, low: 3, info: 4 }

function SevBadge({ severity }) {
  const s = SEV[severity] || SEV.info
  return (
    <span className={`sec-sev sec-sev-${severity}`}>
      <s.Icon size={13} aria-hidden="true" />{s.label}
    </span>
  )
}

const CHECK = {
  pass: { label: 'Pass', Icon: CircleCheck },
  warn: { label: 'Warn', Icon: TriangleAlert },
  fail: { label: 'Fail', Icon: OctagonAlert },
}

function useLoader(fn, deps) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await fn()); setError('') }
    catch (e) { setError(e.message || 'Failed to load.') }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}

function Status({ loading, error, data }) {
  if (error) return <p className="sec-error">{error}</p>
  if (loading && !data) return <p className="sec-muted">Loading…</p>
  return null
}

// ── Overview ──────────────────────────────────────────────────────────────────
function scoreBand(score) {
  if (score >= 80) return 'good'
  if (score >= 50) return 'warning'
  return 'critical'
}

function Tile({ label, value, tone, onClick }) {
  return (
    <button type="button" className={`sec-tile${tone ? ` sec-tile-${tone}` : ''}`} onClick={onClick}>
      <span className="sec-tile-value">{value}</span>
      <span className="sec-tile-label">{label}</span>
    </button>
  )
}

function Overview({ refreshKey, goTo }) {
  const { data, error, loading } = useLoader(() => api('overview/'), [refreshKey])
  if (!data) return <Status {...{ data, error, loading }} />

  const s = data.summary
  const cf = s.container_findings || {}
  const band = scoreBand(data.score)
  const failing = data.checks.filter(c => c.status !== 'pass')
  const passing = data.checks.filter(c => c.status === 'pass')

  return (
    <>
      <div className="sec-overview-top">
        <section className="sec-score" aria-label="Security posture score">
          <span className="sec-score-label">Posture score</span>
          <span className="sec-score-value">{data.score}<small>/100</small></span>
          <div className={`sec-meter sec-meter-${band}`} role="meter" aria-valuemin={0} aria-valuemax={100}
               aria-valuenow={data.score} aria-label="Posture score">
            <div className="sec-meter-fill" style={{ width: `${data.score}%` }} />
          </div>
          <span className="sec-muted">
            {passing.length} of {data.checks.length} checks passing · updated {relTime(data.generated_at)}
          </span>
        </section>

        <div className="sec-tiles">
          <Tile label="Failed logins (24h)" value={s.failed_logins_24h}
                tone={s.brute_force_24h ? 'critical' : s.failed_logins_24h ? 'warning' : null}
                onClick={() => goTo('auth')} />
          <Tile label="Stale API tokens" value={`${s.stale_tokens}/${s.active_tokens}`}
                tone={s.stale_tokens ? 'warning' : null} onClick={() => goTo('auth')} />
          <Tile label="Active share links" value={s.active_share_links}
                tone={s.active_share_links ? 'warning' : null} onClick={() => goTo('exposure')} />
          <Tile label="Flagged uploads" value={s.flagged_uploads}
                tone={s.flagged_uploads ? 'warning' : null} onClick={() => goTo('exposure')} />
          <Tile label="Critical container findings" value={cf.critical || 0}
                tone={cf.critical ? 'critical' : null} onClick={() => goTo('containers')} />
          <Tile label="High container findings" value={cf.high || 0}
                tone={cf.high ? 'serious' : null} onClick={() => goTo('containers')} />
        </div>
      </div>

      <div className="sec-two-col">
        <section className="sec-panel">
          <h2>Posture checks</h2>
          <ul className="sec-checks">
            {[...failing, ...passing].map(c => {
              const k = CHECK[c.status]
              return (
                <li key={c.id} className={`sec-check sec-check-${c.status}`}>
                  <span className="sec-check-status"><k.Icon size={15} aria-hidden="true" />{k.label}</span>
                  <div>
                    <p className="sec-check-title">{c.title}</p>
                    <p className="sec-check-detail">{c.detail}</p>
                    {c.status !== 'pass' && c.fix && <p className="sec-check-fix">{c.fix}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="sec-panel">
          <div className="sec-panel-head">
            <h2>Recent alerts</h2>
            <button className="secondary sec-small" onClick={() => goTo('events')}>Full log</button>
          </div>
          {data.recent_alerts.length === 0
            ? <p className="sec-muted">No warnings or critical events yet.</p>
            : <ul className="sec-feed">{data.recent_alerts.map(e => <EventRow key={e.id} e={e} compact />)}</ul>}
        </section>
      </div>
    </>
  )
}

function EventRow({ e, compact }) {
  return (
    <li className="sec-feed-row">
      <SevBadge severity={e.severity} />
      <div className="sec-feed-body">
        <p>{e.message}</p>
        <p className="sec-muted">
          <span title={fullTime(e.created_at)}>{relTime(e.created_at)}</span>
          {e.actor && <> · by {e.actor.full_name}</>}
          {e.ip && <> · {e.ip}</>}
          {!compact && <> · <code>{e.type}</code></>}
        </p>
      </div>
    </li>
  )
}

// ── Auth & Access ─────────────────────────────────────────────────────────────
function AuthAccess({ refreshKey }) {
  const { user } = useAuth()
  const { data, error, loading, reload } = useLoader(() => api('auth/'), [refreshKey])
  const [revoking, setRevoking] = useState(null)
  const [actionError, setActionError] = useState('')

  async function revoke(t) {
    if (!window.confirm(`Revoke ${t.user.username}'s API token? They will be signed out everywhere.`)) return
    setRevoking(t.user.id)
    setActionError('')
    try { await api(`tokens/${t.user.id}/revoke/`, { method: 'POST' }); await reload() }
    catch (e) { setActionError(e.message) }
    finally { setRevoking(null) }
  }

  if (!data) return <Status {...{ data, error, loading }} />

  return (
    <>
      <section className="sec-panel">
        <h2>Failed logins — last 7 days</h2>
        <p className="sec-muted sec-panel-sub">
          {data.brute_force_threshold}+ failures for one account within 15 minutes raises a brute-force alert.
        </p>
        {data.failed_logins.length === 0 ? <p className="sec-muted">No failed logins.</p> : (
          <div className="sec-table-wrap">
            <table className="sec-table">
              <thead><tr><th>Account</th><th>Failures</th><th>Source IPs</th><th>Last attempt</th><th></th></tr></thead>
              <tbody>
                {data.failed_logins.map(r => (
                  <tr key={r.username}>
                    <td><strong>{r.username || '(blank)'}</strong>{r.unknown_user && <span className="sec-tag">unknown user</span>}</td>
                    <td className="sec-num">{r.count}</td>
                    <td>{r.ips.join(', ') || '—'}</td>
                    <td title={fullTime(r.last)}>{relTime(r.last)}</td>
                    <td>{r.suspected ? <SevBadge severity="critical" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sec-panel">
        <h2>API tokens</h2>
        <p className="sec-muted sec-panel-sub">
          Tokens never expire on their own. Flagged when unused for {data.token_stale_days}+ days
          or older than {data.token_max_age_days} days.
        </p>
        {actionError && <p className="sec-error">{actionError}</p>}
        {data.tokens.length === 0 ? <p className="sec-muted">No active tokens.</p> : (
          <div className="sec-table-wrap">
            <table className="sec-table">
              <thead><tr><th>User</th><th>Roles</th><th>Issued</th><th>Last used</th><th>Last IP</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.tokens.map(t => (
                  <tr key={t.user.id}>
                    <td><strong>{t.user.full_name}</strong> <span className="sec-muted">{t.user.username}</span></td>
                    <td>{[t.is_superuser && 'superuser', ...t.groups].filter(Boolean).join(', ') || '—'}</td>
                    <td title={fullTime(t.created)}>{t.age_days}d ago</td>
                    <td title={fullTime(t.last_used_at)}>{t.last_used_at ? relTime(t.last_used_at) : 'never'}</td>
                    <td>{t.last_ip || '—'}</td>
                    <td>{t.stale ? <span className="sec-sev sec-sev-medium"><CircleAlert size={13} aria-hidden="true" />{t.stale_reasons.join(', ')}</span>
                                 : <span className="sec-ok"><CircleCheck size={13} aria-hidden="true" />Active</span>}</td>
                    <td>
                      {t.user.id === user?.id
                        ? <span className="sec-muted">You</span>
                        : <button className="secondary sec-small" disabled={revoking === t.user.id}
                                  onClick={() => revoke(t)}>{revoking === t.user.id ? 'Revoking…' : 'Revoke'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sec-panel">
        <h2>Role & privilege changes</h2>
        {data.access_changes.length === 0
          ? <p className="sec-muted">No role or privilege changes recorded.</p>
          : <ul className="sec-feed">{data.access_changes.map(e => <EventRow key={e.id} e={e} />)}</ul>}
      </section>
    </>
  )
}

// ── Exposure ──────────────────────────────────────────────────────────────────
function Exposure({ refreshKey }) {
  const { data, error, loading } = useLoader(() => api('exposure/'), [refreshKey])
  const [flaggedOnly, setFlaggedOnly] = useState(true)
  if (!data) return <Status {...{ data, error, loading }} />

  const uploads = flaggedOnly ? data.uploads.filter(u => u.flags.length) : data.uploads

  return (
    <>
      <section className="sec-panel">
        <h2>Kanban share links</h2>
        <p className="sec-muted sec-panel-sub">
          A share link lets any signed-in FlyWheel user open the board, even if they aren&rsquo;t a member.
          Links on for {data.share_link_stale_days}+ days are flagged.
        </p>
        {data.share_links.length === 0 ? <p className="sec-muted">No boards have link sharing on.</p> : (
          <div className="sec-table-wrap">
            <table className="sec-table">
              <thead><tr><th>Board</th><th>Owner</th><th>Visibility</th><th>Members</th><th>Enabled</th><th>Status</th></tr></thead>
              <tbody>
                {data.share_links.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.name}</strong></td>
                    <td>{l.owner?.full_name || '—'}</td>
                    <td>{l.visibility}</td>
                    <td className="sec-num">{l.members} ({l.editors} edit)</td>
                    <td title={fullTime(l.enabled_at)}>
                      {l.enabled_at_known ? relTime(l.enabled_at) : `≤ ${l.age_days}d ago`}
                      {l.enabled_by && <span className="sec-muted"> by {l.enabled_by.full_name}</span>}
                    </td>
                    <td>{l.stale ? <SevBadge severity="medium" /> : <span className="sec-ok"><CircleCheck size={13} aria-hidden="true" />Recent</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sec-panel">
        <div className="sec-panel-head">
          <h2>Knowledge Base uploads</h2>
          <label className="sec-toggle">
            <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} />
            Flagged only
          </label>
        </div>
        <p className="sec-muted sec-panel-sub">
          File contents are inspected beyond the extension allow-list: mismatched file signatures,
          hidden macros, active PDF content, and disguised double extensions.
        </p>
        {uploads.length === 0
          ? <p className="sec-muted">{flaggedOnly ? 'No flagged files.' : 'No uploads.'}</p>
          : (
            <div className="sec-table-wrap">
              <table className="sec-table">
                <thead><tr><th>File</th><th>Size</th><th>Uploaded</th><th>Findings</th></tr></thead>
                <tbody>
                  {uploads.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong>{u.archived && <span className="sec-tag">archived</span>}</td>
                      <td className="sec-num">{fmtSize(u.size)}</td>
                      <td title={fullTime(u.uploaded_at)}>
                        {relTime(u.uploaded_at)}{u.uploaded_by && <span className="sec-muted"> by {u.uploaded_by.full_name}</span>}
                      </td>
                      <td>
                        {u.flags.length === 0
                          ? <span className="sec-ok"><CircleCheck size={13} aria-hidden="true" />Clean</span>
                          : <ul className="sec-flag-list">{u.flags.map((f, i) => (
                              <li key={i}><SevBadge severity={f.severity} /> {f.label}</li>
                            ))}</ul>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </>
  )
}

// ── Containers ────────────────────────────────────────────────────────────────
const CVE_ORDER = ['critical', 'high', 'medium', 'low']
const CVE_TONE = { critical: 'critical', high: 'serious', medium: 'warning', low: 'neutral' }

function CveBar({ counts }) {
  const total = CVE_ORDER.reduce((n, k) => n + (counts[k] || 0), 0)
  const label = CVE_ORDER.map(k => `${counts[k] || 0} ${k}`).join(', ')
  return (
    <div className="sec-cve">
      <div className="sec-cve-bar" role="img" aria-label={`CVEs: ${label}`}>
        {total > 0 && CVE_ORDER.map(k => counts[k] ? (
          <span key={k} className={`sec-cve-seg sec-fill-${CVE_TONE[k]}`}
                style={{ flexGrow: counts[k] }} title={`${counts[k]} ${k}`} />
        ) : null)}
      </div>
      <ul className="sec-cve-legend">
        {CVE_ORDER.map(k => (
          <li key={k}><span className={`sec-swatch sec-fill-${CVE_TONE[k]}`} />{k} <strong>{counts[k] || 0}</strong></li>
        ))}
      </ul>
    </div>
  )
}

function ContainerCard({ c, onAccept, accepting }) {
  const p = c.posture
  const actionable = c.findings.filter(f => f.severity !== 'info')
  const worst = c.findings.reduce((w, f) => (SEV_RANK[f.severity] < SEV_RANK[w] ? f.severity : w), 'info')
  const drift = p?.drift

  return (
    <article className={`sec-ctr sec-ctr-${actionable.length ? worst : 'clean'}`}>
      <header className="sec-ctr-head">
        <div>
          <h3>{c.name}</h3>
          <p className="sec-muted"><code>{c.image}</code> · {c.namespace}</p>
        </div>
        {actionable.length
          ? <SevBadge severity={worst} />
          : <span className="sec-ok"><ShieldCheck size={14} aria-hidden="true" />No issues</span>}
      </header>

      {c.findings.length > 0 && (
        <ul className="sec-findings">
          {c.findings.map((f, i) => (
            <li key={i}>
              <SevBadge severity={f.severity} />
              <div><p className="sec-check-title">{f.title}</p>{f.detail && <p className="sec-check-detail">{f.detail}</p>}</div>
            </li>
          ))}
        </ul>
      )}

      {p && (
        <dl className="sec-facts">
          <dt>User</dt><dd>{p.run_user || '—'}</dd>
          <dt>Network</dt><dd>{p.network_mode || '—'}</dd>
          <dt>Ports</dt>
          <dd>{p.published_ports.length
            ? p.published_ports.map((pt, i) => <code key={i}>{pt.host_ip}:{pt.host_port}→{pt.container_port}</code>)
            : 'none published'}</dd>
          {p.services.length > 0 && <>
            <dt>Services</dt>
            <dd>{p.services.map((s, i) => (
              <span key={i}>{s.service.toUpperCase()}: {s.anonymous ? 'anonymous access' : 'auth required'}
                {s.tls === false && ', no TLS'}{s.tls === true && ', TLS'}</span>
            ))}</dd>
          </>}
          {p.image_created && <><dt>Image built</dt><dd title={fullTime(p.image_created)}>{relTime(p.image_created)}</dd></>}
          <dt>Reported</dt><dd>{relTime(p.updated_at)}</dd>
        </dl>
      )}

      {p?.cve_counts && (
        <div className="sec-ctr-section">
          <p className="sec-ctr-label">Image CVEs <span className="sec-muted">· {p.cve_scanner}, {relTime(p.scanned_at)}</span></p>
          <CveBar counts={p.cve_counts} />
        </div>
      )}

      {p && p.config_files > 0 && (
        <div className="sec-ctr-section">
          <p className="sec-ctr-label">Config integrity <span className="sec-muted">· {p.config_files} file(s) tracked</span></p>
          {drift.drifted ? (
            <>
              <ul className="sec-drift">
                {drift.modified.map(f => <li key={`m${f}`}><span className="sec-drift-kind">modified</span><code>{f}</code></li>)}
                {drift.added.map(f => <li key={`a${f}`}><span className="sec-drift-kind">added</span><code>{f}</code></li>)}
                {drift.removed.map(f => <li key={`r${f}`}><span className="sec-drift-kind">removed</span><code>{f}</code></li>)}
              </ul>
              <button className="sec-small" disabled={accepting} onClick={() => onAccept(c)}>
                {accepting ? 'Saving…' : 'Accept as new baseline'}
              </button>
            </>
          ) : (
            <p className="sec-ok"><CircleCheck size={13} aria-hidden="true" />Matches baseline
              {p.baseline_set_at && <span className="sec-muted">&nbsp;set {relTime(p.baseline_set_at)}{p.baseline_set_by && ` by ${p.baseline_set_by.full_name}`}</span>}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

function Containers({ refreshKey }) {
  const { data, error, loading, reload } = useLoader(() => api('containers/'), [refreshKey])
  const [search, setSearch] = useState('')
  const [minSev, setMinSev] = useState('all')
  const [accepting, setAccepting] = useState(null)
  const [actionError, setActionError] = useState('')

  async function accept(c) {
    if (!window.confirm(`Accept the current config files on ${c.name} as the trusted baseline?`)) return
    setAccepting(c.id)
    setActionError('')
    try { await api(`containers/${c.id}/baseline/`, { method: 'POST' }); await reload() }
    catch (e) { setActionError(e.message) }
    finally { setAccepting(null) }
  }

  if (!data) return <Status {...{ data, error, loading }} />

  const q = search.trim().toLowerCase()
  const shown = data.filter(c => {
    if (q && !`${c.name} ${c.image} ${c.namespace}`.toLowerCase().includes(q)) return false
    if (minSev !== 'all' && !c.findings.some(f => SEV_RANK[f.severity] <= SEV_RANK[minSev])) return false
    return true
  })

  return (
    <>
      <div className="sec-filters">
        <input type="search" placeholder="Search containers…" value={search}
               onChange={e => setSearch(e.target.value)} aria-label="Search containers" />
        <select value={minSev} onChange={e => setMinSev(e.target.value)} aria-label="Minimum severity">
          <option value="all">All containers</option>
          <option value="critical">Has critical</option>
          <option value="high">High or worse</option>
          <option value="medium">Medium or worse</option>
        </select>
        <span className="sec-muted">{shown.length} of {data.length}</span>
      </div>
      {actionError && <p className="sec-error">{actionError}</p>}
      {data.length === 0 && <p className="sec-muted">No containers registered.</p>}
      <div className="sec-ctr-grid">
        {shown.map(c => <ContainerCard key={c.id} c={c} onAccept={accept} accepting={accepting === c.id} />)}
      </div>
    </>
  )
}

// ── Event log ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  ['auth', 'Authentication'], ['access', 'Access control'],
  ['exposure', 'Exposure'], ['container', 'Container'],
]

function EventLog({ refreshKey }) {
  const [cats, setCats] = useState([])
  const [severity, setSeverity] = useState('')
  const [days, setDays] = useState('30')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const params = new URLSearchParams()
  if (cats.length) params.set('category', cats.join(','))
  if (severity) params.set('severity', severity)
  if (days) params.set('days', days)
  if (query) params.set('q', query)
  const qs = params.toString()

  const { data, error, loading } = useLoader(() => api(`events/?${qs}`), [qs, refreshKey])
  const toggle = c => setCats(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]))

  return (
    <section className="sec-panel">
      <div className="sec-filters">
        <div className="sec-chips" role="group" aria-label="Category">
          {CATEGORIES.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={cats.includes(k)}
                    className={`sec-chip${cats.includes(k) ? ' on' : ''}`} onClick={() => toggle(k)}>{label}</button>
          ))}
        </div>
        <select value={severity} onChange={e => setSeverity(e.target.value)} aria-label="Severity">
          <option value="">Any severity</option>
          <option value="critical">Critical</option>
          <option value="warning,critical">Warning or critical</option>
          <option value="info">Info</option>
        </select>
        <select value={days} onChange={e => setDays(e.target.value)} aria-label="Time range">
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="">All time</option>
        </select>
        <input type="search" placeholder="Search user, IP, message…" value={q}
               onChange={e => setQ(e.target.value)} aria-label="Search events" />
      </div>
      <Status {...{ data, error, loading }} />
      {data && (
        <>
          <p className="sec-muted sec-panel-sub">
            {data.count} event{data.count !== 1 ? 's' : ''}{data.count > data.results.length && `, showing latest ${data.results.length}`}
          </p>
          {data.results.length === 0
            ? <p className="sec-muted">No events match.</p>
            : <ul className="sec-feed">{data.results.map(e => <EventRow key={e.id} e={e} />)}</ul>}
        </>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',   label: 'Overview',      Icon: ShieldCheck },
  { id: 'auth',       label: 'Auth & Access', Icon: KeyRound },
  { id: 'exposure',   label: 'Exposure',      Icon: Link2 },
  { id: 'containers', label: 'Containers',    Icon: Boxes },
  { id: 'events',     label: 'Event Log',     Icon: ScrollText },
]

function Security() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'overview'
  const [refreshKey, setRefreshKey] = useState(0)
  const goTo = id => setParams(id === 'overview' ? {} : { tab: id })

  return (
    <div className="page sec-page">
      <div className="sec-head">
        <div>
          <h1>Security</h1>
          <p className="sec-sub">Sign-in activity, access changes, data exposure and container hardening.</p>
        </div>
        <button className="secondary sec-refresh" onClick={() => setRefreshKey(k => k + 1)}>
          <RefreshCw size={14} aria-hidden="true" />Refresh
        </button>
      </div>

      <nav className="sec-tabs" role="tablist" aria-label="Security sections">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
                  className={`sec-tab${tab === t.id ? ' active' : ''}`} onClick={() => goTo(t.id)}>
            <t.Icon size={15} aria-hidden="true" />{t.label}
          </button>
        ))}
      </nav>

      <div className="sec-body" role="tabpanel">
        {tab === 'overview' && <Overview refreshKey={refreshKey} goTo={goTo} />}
        {tab === 'auth' && <AuthAccess refreshKey={refreshKey} />}
        {tab === 'exposure' && <Exposure refreshKey={refreshKey} />}
        {tab === 'containers' && <Containers refreshKey={refreshKey} />}
        {tab === 'events' && <EventLog refreshKey={refreshKey} />}
      </div>
    </div>
  )
}

export default Security

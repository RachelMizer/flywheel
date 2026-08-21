import { useState, useEffect, useRef, useCallback } from 'react'
import { roleFor, ROLE_LABEL, STATUS_LABEL, DeviceIcon } from '../components/containerDevice'
import './DockerManager.css'

const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const POLL_MS = 4000

function relTime(iso) {
  if (!iso) return '—'
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 0) return 'just now'
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function DockerManager() {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastFetch, setLastFetch] = useState(null)
  const [search, setSearch] = useState('')
  const [nsFilter, setNsFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const timer = useRef(null)

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch('/api/docker/', { headers: authH() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setContainers(await res.json())
      setError('')
      setLastFetch(Date.now())
    } catch {
      setError('Could not reach the container registry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
    timer.current = setInterval(fetchContainers, POLL_MS)
    return () => clearInterval(timer.current)
  }, [fetchContainers])

  const nsOf = c => c.namespace || 'default'

  // Distinct namespaces (from the full set) for the filter dropdown.
  const namespaces = [...new Set(containers.map(nsOf))].sort()

  // Apply search + namespace + status filters.
  const q = search.trim().toLowerCase()
  const filtered = containers.filter(c => {
    if (nsFilter !== 'all' && nsOf(c) !== nsFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (q && !`${c.name} ${c.image}`.toLowerCase().includes(q)) return false
    return true
  })

  // Group the filtered set by namespace, preserving the API's order.
  const groups = []
  const byNs = {}
  for (const c of filtered) {
    const key = nsOf(c)
    if (!byNs[key]) { byNs[key] = []; groups.push(key) }
    byNs[key].push(c)
  }

  // Tiles reflect what's currently shown (the filtered set).
  const counts = filtered.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="page docker-page">
      <div className="docker-head">
        <div>
          <h1>Container Manager</h1>
          <p className="docker-sub">
            Live status of monitored containers, grouped by namespace.
          </p>
        </div>
        <div className="docker-meta">
          <span className="docker-live">
            <span className="docker-live-dot" /> Live
          </span>
          <span className="docker-refreshed">
            {lastFetch ? `updated ${relTime(new Date(lastFetch).toISOString())}` : '…'}
          </span>
        </div>
      </div>

      {containers.length > 0 && (
        <>
          <div className="docker-summary">
            <SummaryTile label="Containers" value={filtered.length} tone="neutral" />
            <SummaryTile label="Healthy" value={counts.healthy || 0} tone="healthy" />
            <SummaryTile label="Working" value={counts.working || 0} tone="working" />
            <SummaryTile label="Down" value={counts.down || 0} tone="down" />
          </div>

          <div className="docker-controls">
            <input
              type="search"
              className="docker-search"
              placeholder="Search name or image…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select value={nsFilter} onChange={e => setNsFilter(e.target.value)}>
              <option value="all">All namespaces</option>
              {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="healthy">Healthy</option>
              <option value="working">Working</option>
              <option value="down">Down</option>
            </select>
          </div>
        </>
      )}

      {error && <p className="docker-error">{error}</p>}
      {loading && <p className="docker-empty">Loading containers…</p>}
      {!loading && !error && containers.length === 0 && (
        <p className="docker-empty">
          No containers registered yet. Start the demo stack and run the reporter
          (see <code>docker-demo/README.md</code>), or seed demo rows with{' '}
          <code>python manage.py seed_containers</code>.
        </p>
      )}
      {!loading && !error && containers.length > 0 && filtered.length === 0 && (
        <p className="docker-empty">No containers match your filters.</p>
      )}

      {groups.map(ns => (
        <section key={ns} className="docker-cluster">
          <h2 className="docker-cluster-name">
            <span className="docker-ns-tag">namespace</span> {ns}
            <span className="docker-ns-count">{byNs[ns].length}</span>
          </h2>
          <div className="docker-grid">
            {byNs[ns].map(c => {
              const role = roleFor(c)
              return (
                <article key={c.id} className={`dk-unit status-${c.status}`}>
                  <div className="dk-faceplate">
                    <span className="dk-led" aria-hidden="true" />
                    <span className="dk-name" title={c.name}>{c.name}</span>
                    <span className="dk-tag">{STATUS_LABEL[c.status] || c.status}</span>
                  </div>
                  <div className="dk-body">
                    <div className={`dk-icon role-${role}`}><DeviceIcon role={role} /></div>
                    <div className="dk-content">
                      <div className="dk-image" title={c.image}>{c.image || '—'}</div>
                      {c.notes && <p className="dk-notes">{c.notes}</p>}
                    </div>
                  </div>
                  <div className="dk-rail">
                    <span className="dk-heartbeat" aria-hidden="true" />
                    <span className="dk-lastseen" title={c.last_seen || ''}>
                      last seen {relTime(c.last_seen)}
                    </span>
                    <span className="dk-role">{ROLE_LABEL[role]}</span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function SummaryTile({ label, value, tone }) {
  return (
    <div className={`docker-tile tone-${tone}`}>
      <span className="docker-tile-value">{value}</span>
      <span className="docker-tile-label">{label}</span>
    </div>
  )
}

export default DockerManager

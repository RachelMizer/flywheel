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

  // Group by cluster, preserving the order the API returns them in.
  const clusters = []
  const byCluster = {}
  for (const c of containers) {
    const key = c.cluster || 'Ungrouped'
    if (!byCluster[key]) { byCluster[key] = []; clusters.push(key) }
    byCluster[key].push(c)
  }

  const counts = containers.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="page docker-page">
      <div className="docker-head">
        <div>
          <h1>Container Manager</h1>
          <p className="docker-sub">
            Live status of monitored containers across plant clusters.
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
        <div className="docker-summary">
          <SummaryTile label="Containers" value={containers.length} tone="neutral" />
          <SummaryTile label="Healthy" value={counts.healthy || 0} tone="healthy" />
          <SummaryTile label="Working" value={counts.working || 0} tone="working" />
          <SummaryTile label="Down" value={counts.down || 0} tone="down" />
        </div>
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

      {clusters.map(cluster => (
        <section key={cluster} className="docker-cluster">
          <h2 className="docker-cluster-name">{cluster}</h2>
          <div className="docker-grid">
            {byCluster[cluster].map(c => {
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

import { useState, useEffect } from 'react'
import { roleFor, STATUS_LABEL, DeviceIcon } from '../components/containerDevice'
import './Dashboard.css'

const authHeaders = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })

function fmtDate(d) {
  if (!d) return d
  if (d.includes('T')) {
    const dt = new Date(d)
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${mm}-${dd}-${dt.getFullYear()}`
  }
  const [y, m, day] = d.split('-')
  return `${m}-${day}-${y}`
}

// ── Docker Section ────────────────────────────────────────────────────────────
function DockerSection() {
  const [containers, setContainers] = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/docker/', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setContainers(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="dash-section">
      <h3 className="dash-section-title">Container Manager</h3>
      {loading && <p className="dash-empty">Loading…</p>}
      {!loading && containers.length === 0 && (
        <p className="dash-empty">No containers registered.</p>
      )}
      {!loading && containers.length > 0 && (
        <ul className="cm-mini-list">
          {containers.map(c => {
            const role = roleFor(c)
            return (
              <li key={c.id} className={`cm-mini status-${c.status}`}>
                <span className="cm-mini-chip">
                  <span className="cm-mini-led" aria-hidden="true" />
                  <DeviceIcon role={role} size={16} />
                </span>
                <span className="cm-mini-text">
                  <span className="cm-mini-name" title={c.name}>{c.name}</span>
                  <span className="cm-mini-ns" title={c.namespace || 'default'}>{c.namespace || 'default'}</span>
                </span>
                <span className="cm-mini-status">{STATUS_LABEL[c.status] || c.status}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Kanban Section ────────────────────────────────────────────────────────────
function KanbanSection() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/kanban/activity/', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setActivities(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="dash-section">
      <h3 className="dash-section-title">Kanban</h3>
      {loading && <p className="dash-empty">Loading…</p>}
      {!loading && activities.length === 0 && (
        <p className="dash-empty">No recent board activity.</p>
      )}
      {!loading && activities.length > 0 && (
        <ul className="activity-list">
          {activities.map(a => {
            const ts = new Date(a.timestamp)
            return (
              <li key={a.id} className="activity-item">
                <div className="activity-time">
                  <span className="activity-date">{fmtDate(a.timestamp)}</span>
                  <span className="activity-clock">
                    {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="activity-body">
                  <span className="activity-board">{a.board_name}</span>
                  <span className="activity-card">{a.card_title}</span>
                  <span className="activity-change">{a.change}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const today = fmtDate(new Date().toISOString())

  return (
    <div className="dash-wrap">
      <h1>Dashboard</h1>
      <p className="dash-date">Today is {today}</p>
      <div className="dash-grid">
        <DockerSection />
        <KanbanSection />
      </div>
    </div>
  )
}

export default Dashboard

import { useState, useEffect } from 'react'
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

const STATUS_COLOR = { healthy: '#2ecc71', working: '#f1c40f', down: '#e74c3c' }
const STATUS_LABEL = { healthy: 'Healthy', working: 'Working', down: 'Down' }

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
      <h3 className="dash-section-title">Docker</h3>
      {loading && <p className="dash-empty">Loading…</p>}
      {!loading && containers.length === 0 && (
        <p className="dash-empty">No containers registered.</p>
      )}
      {!loading && containers.length > 0 && (
        <ul className="docker-list">
          {containers.map(c => (
            <li key={c.id} className="docker-item">
              <span
                className="status-dot"
                style={{ background: STATUS_COLOR[c.status] || '#ccc' }}
                title={STATUS_LABEL[c.status] || c.status}
              />
              <span className="docker-name">{c.cluster}</span>
              {c.name !== c.cluster && (
                <span className="docker-node">{c.name}</span>
              )}
              <span className="docker-status" style={{ color: STATUS_COLOR[c.status] }}>
                {STATUS_LABEL[c.status] || c.status}
              </span>
            </li>
          ))}
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

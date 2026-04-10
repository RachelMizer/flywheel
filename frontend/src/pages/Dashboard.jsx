import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

const authHeaders = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })

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
                  <span className="activity-date">{ts.toLocaleDateString()}</span>
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

// ── Tickets Section ───────────────────────────────────────────────────────────
function TicketsSection() {
  const { user }              = useAuth()
  const [ticket, setTicket]   = useState(null)
  const [loading, setLoading] = useState(true)

  const isSupport = user?.groups?.includes('support') || user?.groups?.includes('support-admin') || user?.is_staff

  useEffect(() => {
    const url = isSupport
      ? '/api/tickets/?status=open&limit=1'
      : '/api/tickets/my/?limit=1'

    fetch(url, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setTicket(list[0] || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [isSupport])

  const statusColor = {
    open:        '#856404',
    in_progress: 'var(--color-teal-deep)',
    resolved:    '#666',
    closed:      '#999',
  }

  return (
    <div className="dash-section">
      <h3 className="dash-section-title">Tickets</h3>
      {loading && <p className="dash-empty">Loading…</p>}
      {!loading && !ticket && (
        <p className="dash-empty">No recent tickets.</p>
      )}
      {!loading && ticket && (
        <div className="dash-ticket">
          <div className="dash-ticket-header">
            <span className="dash-ticket-number">{ticket.ticket_number}</span>
            {ticket.has_activity && <span className="badge-new">New</span>}
            <span
              className="dash-ticket-status"
              style={{ color: statusColor[ticket.status] }}
            >
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
          <p className="dash-ticket-title">{ticket.title}</p>
          {ticket.short_description && (
            <p className="dash-ticket-desc">{ticket.short_description}</p>
          )}
          <div className="dash-ticket-meta">
            <span>{ticket.site_section ? ticket.site_section.replace(/_/g, ' ') : '—'}</span>
            <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  return (
    <div className="dash-wrap">
      <h2>Dashboard</h2>
      <div className="dash-grid">
        <DockerSection />
        <KanbanSection />
        <TicketsSection />
      </div>
    </div>
  )
}

export default Dashboard

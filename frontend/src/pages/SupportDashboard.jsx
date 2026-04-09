import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import './SupportDashboard.css'

const API = (path) => `/api/tickets${path}`
const token = () => localStorage.getItem('token')
const authHeaders = () => ({ Authorization: `Token ${token()}` })

const STATUS_COLUMNS = [
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved',    label: 'Resolved' },
]

function statusBadgeClass(s) {
  return { open: 'badge-open', in_progress: 'badge-progress', resolved: 'badge-resolved', closed: 'badge-closed' }[s] || ''
}

// ── Ticket Card ─────────────────────────────────────────────────────────────
function TicketCard({ ticket, onClick }) {
  const created = new Date(ticket.created_at).toLocaleDateString()
  return (
    <div className="ticket-card" onClick={() => onClick(ticket)}>
      <div className="ticket-card-header">
        <span className="ticket-number">{ticket.ticket_number}</span>
        <span className={`badge ${statusBadgeClass(ticket.status)}`}>{ticket.status.replace('_', ' ')}</span>
      </div>
      <p className="ticket-title">{ticket.title}</p>
      {ticket.short_description && <p className="ticket-short-desc">{ticket.short_description}</p>}
      <div className="ticket-meta">
        <span>Assigned: {ticket.assigned_to ? (ticket.assigned_to.first_name || ticket.assigned_to.username) : '—'}</span>
        <span>{ticket.site_section ? ticket.site_section.replace('_', ' ') : created}</span>
      </div>
    </div>
  )
}

// ── New Ticket Form ──────────────────────────────────────────────────────────
function NewTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', site_section: '', short_description: '', detailed_description: '' })
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.detailed_description.trim()) { setError('Detailed description is required.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(API('/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const ticket = await res.json()

      // upload screenshots if any
      if (files.length) {
        const fd = new FormData()
        files.forEach(f => fd.append('images', f))
        await fetch(API(`/${ticket.id}/screenshots/`), { method: 'POST', headers: authHeaders(), body: fd })
      }

      onCreated()
      onClose()
    } catch {
      setError('Failed to create ticket.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Ticket</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="ticket-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={form.title} onChange={e => set('title', e.target.value)} required />
          </label>
          <label>Section <span className="optional">(optional)</span>
            <select value={form.site_section} onChange={e => set('site_section', e.target.value)}>
              <option value="">— Select a section —</option>
              <option value="dashboard">Dashboard</option>
              <option value="docker">Docker Manager</option>
              <option value="kanban">Kanban</option>
              <option value="tickets">Tickets</option>
              <option value="support">Support Dashboard</option>
              <option value="messages">Messages</option>
              <option value="account">Account</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Short description <span className="optional">(optional)</span>
            <input value={form.short_description} onChange={e => set('short_description', e.target.value)} maxLength={500} />
          </label>
          <label>Detailed description <span className="required">*</span>
            <textarea rows={5} value={form.detailed_description} onChange={e => set('detailed_description', e.target.value)} required />
          </label>
          <label>Screenshots <span className="optional">(optional)</span>
            <input type="file" accept="image/*" multiple onChange={e => setFiles([...e.target.files])} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Ticket'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Ticket Detail Modal ──────────────────────────────────────────────────────
function TicketDetailModal({ ticket, onClose, onUpdated }) {
  const [newComment, setNewComment] = useState('')
  const [newStatus, setNewStatus] = useState(ticket.status)
  const [saving, setSaving] = useState(false)

  async function handleStatusChange(e) {
    const s = e.target.value
    setNewStatus(s)
    await fetch(API(`/${ticket.id}/`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status: s }),
    })
    onUpdated()
  }

  async function handleComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSaving(true)
    await fetch(API(`/${ticket.id}/comments/`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ body: newComment }),
    })
    setNewComment('')
    setSaving(false)
    onUpdated()
  }

  const assignedName = ticket.assigned_to
    ? `${ticket.assigned_to.first_name || ''} ${ticket.assigned_to.last_name || ''}`.trim() || ticket.assigned_to.username
    : '—'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="ticket-number">{ticket.ticket_number}</span>
            <h3 style={{ margin: '0.25rem 0 0' }}>{ticket.title}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-body">
          <div className="detail-meta">
            <div><strong>Status</strong>
              <select value={newStatus} onChange={handleStatusChange}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div><strong>Assigned to</strong><span>{assignedName}{ticket.assigned_to?.role ? ` (${ticket.assigned_to.role})` : ''}</span></div>
            <div><strong>Section</strong><span>{ticket.site_section || '—'}</span></div>
            <div><strong>Created by</strong><span>{ticket.created_by?.username || '—'}</span></div>
            <div><strong>Created</strong><span>{new Date(ticket.created_at).toLocaleString()}</span></div>
          </div>

          {ticket.short_description && (
            <div className="detail-section">
              <strong>Summary</strong>
              <p>{ticket.short_description}</p>
            </div>
          )}

          <div className="detail-section">
            <strong>Detailed Description</strong>
            <p className="detail-desc">{ticket.detailed_description}</p>
          </div>

          {ticket.screenshots?.length > 0 && (
            <div className="detail-section">
              <strong>Screenshots</strong>
              <div className="screenshot-grid">
                {ticket.screenshots.map(s => (
                  <a key={s.id} href={s.image} target="_blank" rel="noreferrer">
                    <img src={s.image} alt="screenshot" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="detail-section">
            <strong>Comments</strong>
            {ticket.comments?.length === 0 && <p className="no-comments">No comments yet.</p>}
            {ticket.comments?.map(c => (
              <div key={c.id} className="comment">
                <span className="comment-author">{c.author?.username}</span>
                <span className="comment-date">{new Date(c.created_at).toLocaleString()}</span>
                <p>{c.body}</p>
              </div>
            ))}
            <form onSubmit={handleComment} className="comment-form">
              <textarea
                rows={3}
                placeholder="Add a comment…"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
              />
              <button type="submit" disabled={saving}>Post</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Metrics Bar ──────────────────────────────────────────────────────────────
function MetricsBar({ metrics }) {
  if (!metrics) return null
  return (
    <div className="metrics-bar">
      <div className="metric"><span className="metric-value">{metrics.counts.total}</span><span>Total</span></div>
      <div className="metric"><span className="metric-value">{metrics.counts.open}</span><span>Open</span></div>
      <div className="metric"><span className="metric-value">{metrics.counts.in_progress}</span><span>In Progress</span></div>
      <div className="metric"><span className="metric-value">{metrics.counts.resolved}</span><span>Resolved</span></div>
      <div className="metric"><span className="metric-value">{metrics.created_last_7_days}</span><span>Created (7d)</span></div>
      <div className="metric"><span className="metric-value">{metrics.resolved_last_7_days}</span><span>Resolved (7d)</span></div>
      {metrics.avg_resolution_hours !== null && (
        <div className="metric"><span className="metric-value">{metrics.avg_resolution_hours}h</span><span>Avg Resolution</span></div>
      )}
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
function SupportDashboard() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState({ open: [], in_progress: [], resolved: [] })
  const [metrics, setMetrics] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)

  const isSupport = user?.groups?.includes('support') || user?.groups?.includes('support-admin') || user?.is_staff

  const fetchAll = useCallback(async () => {
    const [open, inProgress, resolved, metricsRes] = await Promise.all([
      fetch(API('/?status=open&limit=30'), { headers: authHeaders() }).then(r => r.json()),
      fetch(API('/?status=in_progress&limit=30'), { headers: authHeaders() }).then(r => r.json()),
      fetch(API('/?status=resolved&limit=30'), { headers: authHeaders() }).then(r => r.json()),
      fetch(API('/metrics/'), { headers: authHeaders() }).then(r => r.json()),
    ])
    setTickets({ open: Array.isArray(open) ? open : [], in_progress: Array.isArray(inProgress) ? inProgress : [], resolved: Array.isArray(resolved) ? resolved : [] })
    setMetrics(metricsRes)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleTicketClick(ticket) {
    // fetch full detail with comments
    const res = await fetch(API(`/${ticket.id}/`), { headers: authHeaders() })
    const full = await res.json()
    setSelectedTicket(full)
  }

  if (!isSupport) {
    return (
      <div className="page">
        <h2>Support Dashboard</h2>
        <p>You don't have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="page support-dashboard">
      <div className="dashboard-header">
        <h2>Support Dashboard</h2>
        <button onClick={() => setShowNewModal(true)}>+ New Ticket</button>
      </div>

      <MetricsBar metrics={metrics} />

      <div className="ticket-columns">
        {STATUS_COLUMNS.map(col => (
          <div key={col.key} className="ticket-column">
            <div className="column-header">
              <span>{col.label}</span>
              <span className="column-count">{tickets[col.key]?.length ?? 0}</span>
            </div>
            <div className="column-body">
              {tickets[col.key]?.length === 0 && <p className="column-empty">No tickets</p>}
              {tickets[col.key]?.map(t => (
                <TicketCard key={t.id} ticket={t} onClick={handleTicketClick} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showNewModal && (
        <NewTicketModal onClose={() => setShowNewModal(false)} onCreated={fetchAll} />
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdated={() => { fetchAll(); handleTicketClick(selectedTicket) }}
        />
      )}
    </div>
  )
}

export default SupportDashboard

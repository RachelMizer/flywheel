import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import './Tickets.css'

const API = (path) => `/api/tickets${path}`
const token = () => localStorage.getItem('token')
const authHeaders = () => ({ Authorization: `Token ${token()}` })

function statusBadgeClass(s) {
  return { open: 'badge-open', in_progress: 'badge-progress', resolved: 'badge-resolved', closed: 'badge-closed' }[s] || ''
}

// ── Ticket Card ──────────────────────────────────────────────────────────────
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
        <span>{ticket.site_section ? ticket.site_section.replace(/_/g, ' ') : '—'}</span>
        <span>{created}</span>
      </div>
    </div>
  )
}

// ── New Ticket Modal ─────────────────────────────────────────────────────────
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

      if (files.length) {
        const fd = new FormData()
        files.forEach(f => fd.append('images', f))
        await fetch(API(`/${ticket.id}/screenshots/`), { method: 'POST', headers: authHeaders(), body: fd })
      }

      onCreated()
      onClose()
    } catch {
      setError('Failed to create ticket. Please try again.')
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

// ── Ticket Detail Modal (read-only status for regular users) ─────────────────
function TicketDetailModal({ ticket, onClose, onUpdated }) {
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)

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
            <div>
              <strong>Status</strong>
              <span className={`badge ${statusBadgeClass(ticket.status)}`} style={{ alignSelf: 'flex-start', marginTop: '0.2rem' }}>
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
            <div><strong>Assigned to</strong><span>{assignedName}</span></div>
            <div><strong>Section</strong><span>{ticket.site_section || '—'}</span></div>
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

// ── Main Page ────────────────────────────────────────────────────────────────
function Tickets() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)

  const isSupport = user?.groups?.includes('support') || user?.groups?.includes('support-admin') || user?.is_staff

  const fetchMyTickets = useCallback(async () => {
    setLoadingTickets(true)
    try {
      const [open, inProgress] = await Promise.all([
        fetch(API('/my/?status=open'), { headers: authHeaders() }).then(r => r.json()),
        fetch(API('/my/?status=in_progress'), { headers: authHeaders() }).then(r => r.json()),
      ])
      setTickets([
        ...(Array.isArray(open) ? open : []),
        ...(Array.isArray(inProgress) ? inProgress : []),
      ])
    } finally {
      setLoadingTickets(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupport) fetchMyTickets()
  }, [isSupport, fetchMyTickets])

  async function handleTicketClick(ticket) {
    const res = await fetch(API(`/${ticket.id}/`), { headers: authHeaders() })
    const full = await res.json()
    setSelectedTicket(full)
  }

  if (isSupport) {
    return (
      <div className="page">
        <h2>Tickets</h2>
        <p>Manage all tickets from the <a href="/support">Support Dashboard</a>.</p>
      </div>
    )
  }

  return (
    <div className="page tickets-page">
      <div className="tickets-header">
        <h2>My Tickets</h2>
        <button onClick={() => setShowNewModal(true)}>+ New Ticket</button>
      </div>

      <section className="tickets-section">
        <h3>Open Tickets</h3>
        {loadingTickets ? (
          <p className="tickets-empty">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="tickets-empty">You have no open tickets. Use the button above to create one.</p>
        ) : (
          <div className="tickets-grid">
            {tickets.map(t => (
              <TicketCard key={t.id} ticket={t} onClick={handleTicketClick} />
            ))}
          </div>
        )}
      </section>

      {showNewModal && (
        <NewTicketModal onClose={() => setShowNewModal(false)} onCreated={fetchMyTickets} />
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdated={() => { fetchMyTickets(); handleTicketClick(selectedTicket) }}
        />
      )}
    </div>
  )
}

export default Tickets

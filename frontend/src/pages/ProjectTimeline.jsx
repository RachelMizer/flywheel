import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Folder } from 'lucide-react'
import './ProjectTimeline.css'

const PROJECTS_API = '/api/projects'
const BACKLOG_API = '/api/backlog'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

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

// ── Project Icon (uploaded icon, or a generic fallback) ─────────────────────
function ProjectIcon({ url, size = 22 }) {
  return url
    ? <img src={url} alt="" className="project-icon" style={{ width: size, height: size }} />
    : <Folder size={size} className="project-icon project-icon-fallback" strokeWidth={1.75} />
}

// ── Event Modal (create + edit) ──────────────────────────────────────────────
function EventModal({ projectId, event, epics, stories, members, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [epicId, setEpicId] = useState(event?.epic?.id ?? '')
  const [storyId, setStoryId] = useState(event?.story?.id ?? '')
  const [ownerId, setOwnerId] = useState(event?.owner?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSaving(true)
    setError('')
    try {
      const body = { title, date, description, epic_id: epicId || null, story_id: storyId || null, owner_id: ownerId || null }
      const url = event ? `${PROJECTS_API}/timeline/${event.id}/` : `${PROJECTS_API}/${projectId}/timeline/`
      const res = await fetch(url, { method: event ? 'PATCH' : 'POST', headers: jsonH(), body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event || !window.confirm(`Delete timeline point "${event.title}"?`)) return
    const res = await fetch(`${PROJECTS_API}/timeline/${event.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) {
      await onDeleted()
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{event ? 'Edit Timeline Point' : 'Add Date'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus required />
          </label>
          <label>Date <span className="required">*</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          <label>Description <span className="optional">(optional)</span>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <label>Epic <span className="optional">(optional)</span>
            <select value={epicId} onChange={e => setEpicId(e.target.value)}>
              <option value="">— No epic —</option>
              {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
            </select>
          </label>
          <label>Story <span className="optional">(optional)</span>
            <select value={storyId} onChange={e => setStoryId(e.target.value)}>
              <option value="">— No story —</option>
              {stories.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          <label>Owner <span className="optional">(optional)</span>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">— No owner —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.username}</option>)}
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !title.trim() || !date}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            {event && (
              <button type="button" className="btn-danger" onClick={handleDelete}>Delete</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Timeline Node ─────────────────────────────────────────────────────────────
function TimelineNode({ event, onClick }) {
  return (
    <button className={`pt-node${event.is_active ? ' pt-node-active' : ''}`} onClick={() => onClick(event)}>
      <span className="pt-node-date">{fmtDate(event.date)}</span>
      <span className="pt-node-dot" />
      <span className="pt-node-title">{event.title}</span>
      {event.is_active && <span className="pt-node-badge">Current</span>}
    </button>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function ProjectTimeline({ isManager }) {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [events, setEvents] = useState([])
  const [epics, setEpics] = useState([])
  const [stories, setStories] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [eventModal, setEventModal] = useState(null)
  const [detailEvent, setDetailEvent] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [projectRes, eventsRes, epicsRes, storiesRes, membersRes] = await Promise.all([
        fetch(`${PROJECTS_API}/${projectId}/`, { headers: authH() }),
        fetch(`${PROJECTS_API}/${projectId}/timeline/`, { headers: authH() }),
        fetch(`${BACKLOG_API}/epics/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${BACKLOG_API}/items/?project_id=${projectId}&sprint_id=all`, { headers: authH() }),
        fetch('/api/kanban/members/', { headers: authH() }),
      ])
      setProject(projectRes.ok ? await projectRes.json() : null)
      setEvents(eventsRes.ok ? await eventsRes.json() : [])
      setEpics(epicsRes.ok ? await epicsRes.json() : [])
      setStories(storiesRes.ok ? await storiesRes.json() : [])
      setMembers(membersRes.ok ? await membersRes.json() : [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return <div className="page pt-page"><p className="pt-empty">Loading…</p></div>

  return (
    <div className="page pt-page">
      <Link className="pt-back-link" to={`/projects/${projectId}`}>← Back to Project</Link>

      <div className="pt-header">
        <h1><ProjectIcon url={project?.icon_url} size={26} /> {project?.title} — Timeline</h1>
        {isManager && (
          <button onClick={() => setEventModal({})}>+ Add Date</button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="pt-empty">No timeline points yet.{isManager ? ' Use "+ Add Date" to create one.' : ''}</p>
      ) : (
        <div className="pt-strip">
          <div className="pt-track">
            {events.map(ev => (
              <TimelineNode key={ev.id} event={ev} onClick={setDetailEvent} />
            ))}
          </div>
        </div>
      )}

      {detailEvent && (
        <div className="modal-overlay" onClick={() => setDetailEvent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{detailEvent.title}{detailEvent.is_active && <span className="pt-node-badge pt-node-badge-inline">Current</span>}</h3>
              <button className="modal-close" onClick={() => setDetailEvent(null)}>✕</button>
            </div>
            <div className="pt-detail-body">
              <p className="pt-detail-date">{fmtDate(detailEvent.date)}</p>
              {detailEvent.description && <p className="pt-detail-desc">{detailEvent.description}</p>}
              {detailEvent.epic && <p><strong>Epic:</strong> {detailEvent.epic.title}</p>}
              {detailEvent.story && <p><strong>Story:</strong> {detailEvent.story.title}</p>}
              {detailEvent.owner && <p><strong>Owner:</strong> {detailEvent.owner.full_name || detailEvent.owner.username}</p>}
              {isManager && (
                <div className="form-actions">
                  <button onClick={() => { setEventModal(detailEvent); setDetailEvent(null) }}>Edit</button>
                  <button className="secondary" onClick={() => setDetailEvent(null)}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {eventModal !== null && (
        <EventModal
          projectId={projectId}
          event={eventModal.id ? eventModal : null}
          epics={epics}
          stories={stories}
          members={members}
          onClose={() => setEventModal(null)}
          onSaved={fetchAll}
          onDeleted={fetchAll}
        />
      )}
    </div>
  )
}

export default ProjectTimeline

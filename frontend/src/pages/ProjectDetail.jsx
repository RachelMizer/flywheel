import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Folder, ListTodo, CalendarRange, Rocket, Gauge, FileText, Layers, BookOpen, Target, Users } from 'lucide-react'
import { isMarkdownFile, markdownViewerPath } from '../utils/markdown'
import './ProjectDetail.css'

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

// ── Edit Project Modal ───────────────────────────────────────────────────────
function EditProjectModal({ project, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(project.title)
  const [startDate, setStartDate] = useState(project.start_date ?? '')
  const [endDate, setEndDate] = useState(project.end_date ?? '')
  const [description, setDescription] = useState(project.description)
  const [icon, setIcon] = useState(null)
  const [iconPreview, setIconPreview] = useState(project.icon_url)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!icon) return
    const url = URL.createObjectURL(icon)
    setIconPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [icon])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('title', title)
      fd.append('description', description)
      fd.append('start_date', startDate)
      fd.append('end_date', endDate)
      if (icon) fd.append('icon', icon)
      const res = await fetch(`${PROJECTS_API}/${project.id}/`, { method: 'PATCH', headers: authH(), body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save project.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save project.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete project "${project.title}"? This also removes its backlog, timeline, and documents.`)) return
    const res = await fetch(`${PROJECTS_API}/${project.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) onDeleted()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Project</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} required />
          </label>
          <label>Start date
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label>Estimated end date
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
          <label>Description
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <label>Icon <span className="optional">(optional — PNG, JPG, GIF, SVG or WebP, up to 5MB)</span>
            <div className="pd-icon-picker">
              <ProjectIcon url={iconPreview} size={36} />
              <input type="file" accept=".png,.jpg,.jpeg,.gif,.svg,.webp" onChange={e => setIcon(e.target.files?.[0] ?? null)} />
            </div>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-danger" onClick={handleDelete}>Delete Project</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── New Sprint Modal ─────────────────────────────────────────────────────────
function NewSprintModal({ projectId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${BACKLOG_API}/sprints/`, {
        method: 'POST', headers: jsonH(),
        body: JSON.stringify({ project_id: projectId, name, goal, start_date: startDate || null, end_date: endDate || null }),
      })
      if (!res.ok) throw new Error()
      onCreated(await res.json())
    } catch {
      setError('Failed to create sprint.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Sprint Planning — Create Sprint</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Name <span className="optional">(optional — appears as "Sprint N: Name")</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Beta Polish" autoFocus />
          </label>
          <label>Goal <span className="optional">(optional)</span>
            <textarea rows={3} value={goal} onChange={e => setGoal(e.target.value)} />
          </label>
          <label>Start date <span className="optional">(optional)</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label>End date <span className="optional">(optional)</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Sprint'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Scrum Team ───────────────────────────────────────────────────────────────
function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic avatar tint per person, so the same user keeps the same color.
const AVATAR_TINTS = ['#1f6f5f', '#3d6ea5', '#8a5c00', '#7a4bab', '#b3506b', '#2a7d6b', '#495b7a']
function tintFor(person) {
  const key = person?.id ?? 0
  return AVATAR_TINTS[key % AVATAR_TINTS.length]
}

function PersonBadge({ person, size = 34 }) {
  if (!person) {
    return (
      <span className="st-person st-person-empty">
        <span className="st-avatar st-avatar-empty" style={{ width: size, height: size }}>—</span>
        <span className="st-person-name st-unassigned">Unassigned</span>
      </span>
    )
  }
  return (
    <span className="st-person" title={person.username}>
      <span className="st-avatar" style={{ width: size, height: size, background: tintFor(person) }}>
        {initials(person.full_name)}
      </span>
      <span className="st-person-name">{person.full_name}</span>
    </span>
  )
}

function ScrumTeamSection({ project, isManager, onEdit }) {
  const devs = project.developers || []
  return (
    <section className="pd-section st-section">
      <div className="st-header">
        <h3><Users size={15} /> Scrum Team</h3>
        {isManager && <button className="secondary" onClick={onEdit}>Assign Roles</button>}
      </div>
      <div className="st-roles">
        <div className="st-role">
          <span className="st-role-label">Scrum Master</span>
          <PersonBadge person={project.scrum_master} />
        </div>
        <div className="st-role">
          <span className="st-role-label">Product Owner</span>
          <PersonBadge person={project.product_owner} />
        </div>
        <div className="st-role st-role-dev">
          <span className="st-role-label">Development Team <span className="st-count">{devs.length}</span></span>
          {devs.length === 0
            ? <span className="st-person-name st-unassigned">No developers assigned</span>
            : <div className="st-dev-list">{devs.map(d => <PersonBadge key={d.id} person={d} size={30} />)}</div>}
        </div>
      </div>
    </section>
  )
}

// ── Assign Scrum Roles Modal (managers) ──────────────────────────────────────
function ScrumTeamModal({ project, onClose, onSaved }) {
  const [members, setMembers] = useState([])
  const [scrumMasterId, setScrumMasterId] = useState(String(project.scrum_master?.id ?? ''))
  const [productOwnerId, setProductOwnerId] = useState(String(project.product_owner?.id ?? ''))
  const [devIds, setDevIds] = useState(new Set((project.developers || []).map(d => d.id)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${PROJECTS_API}/members/`, { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(setMembers)
      .catch(() => setMembers([]))
  }, [])

  function toggleDev(id) {
    setDevIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${PROJECTS_API}/${project.id}/`, {
        method: 'PATCH', headers: jsonH(),
        body: JSON.stringify({
          scrum_master_id: scrumMasterId ? Number(scrumMasterId) : null,
          product_owner_id: productOwnerId ? Number(productOwnerId) : null,
          developer_ids: [...devIds],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save scrum team.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save scrum team.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Assign Scrum Roles</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Scrum Master
            <select value={scrumMasterId} onChange={e => setScrumMasterId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </label>
          <label>Product Owner
            <select value={productOwnerId} onChange={e => setProductOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </label>
          <div className="st-dev-picker">
            <span className="st-picker-label">Development Team</span>
            <div className="st-picker-list">
              {members.map(m => (
                <label key={m.id} className="st-picker-item">
                  <input type="checkbox" checked={devIds.has(m.id)} onChange={() => toggleDev(m.id)} />
                  <span>{m.full_name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Team'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function ProjectDetail({ isManager }) {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [sprints, setSprints] = useState([])
  const [epics, setEpics] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showScrumTeam, setShowScrumTeam] = useState(false)
  const [showNewSprint, setShowNewSprint] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [projectRes, docsRes, eventsRes, sprintsRes, epicsRes, itemsRes] = await Promise.all([
        fetch(`${PROJECTS_API}/${projectId}/`, { headers: authH() }),
        fetch(`${PROJECTS_API}/${projectId}/documents/`, { headers: authH() }),
        fetch(`${PROJECTS_API}/${projectId}/timeline/`, { headers: authH() }),
        fetch(`${BACKLOG_API}/sprints/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${BACKLOG_API}/epics/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${BACKLOG_API}/items/?project_id=${projectId}&sprint_id=all`, { headers: authH() }),
      ])
      setProject(projectRes.ok ? await projectRes.json() : null)
      setDocuments(docsRes.ok ? await docsRes.json() : [])
      setEvents(eventsRes.ok ? await eventsRes.json() : [])
      setSprints(sprintsRes.ok ? await sprintsRes.json() : [])
      setEpics(epicsRes.ok ? await epicsRes.json() : [])
      setItems(itemsRes.ok ? await itemsRes.json() : [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${PROJECTS_API}/${projectId}/documents/`, { method: 'POST', headers: authH(), body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed.')
      }
      await fetchAll()
    } catch (err) {
      setUploadError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteDoc(doc) {
    if (!window.confirm(`Delete "${doc.name}"?`)) return
    const res = await fetch(`${PROJECTS_API}/documents/${doc.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) setDocuments(list => list.filter(d => d.id !== doc.id))
  }

  if (loading) return <div className="page pd-page"><p className="pd-empty">Loading…</p></div>
  if (!project) return <div className="page pd-page"><p className="pd-empty">Project not found.</p></div>

  const activeIdx = events.findIndex(e => e.is_active)
  const startIdx = activeIdx >= 0 ? Math.max(0, activeIdx - 1) : 0
  const timelinePreview = events.slice(startIdx, startIdx + 4)
  const hasBacklog = project.has_backlog
  const hasTimeline = project.has_timeline

  const storyPoints = items.reduce((sum, i) => sum + (i.estimate || 0), 0)
  const storiesByStatus = items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc }, {})
  const activeSprint = sprints.find(s => s.status === 'active')
  const hasAgileData = epics.length > 0 || items.length > 0 || sprints.length > 0

  return (
    <div className="page pd-page">
      <Link className="pd-back-link" to="/projects">← All Projects</Link>

      <div className="pd-header">
        <div>
          <h1><ProjectIcon url={project.icon_url} size={28} /> {project.title}</h1>
          {(project.start_date || project.end_date) && (
            <p className="pd-dates">{fmtDate(project.start_date) || '—'} → {fmtDate(project.end_date) || '—'}</p>
          )}
        </div>
        {isManager && (
          <button className="secondary" onClick={() => setShowEdit(true)}>Edit Project</button>
        )}
      </div>

      {project.description && <p className="pd-description">{project.description}</p>}

      <ScrumTeamSection project={project} isManager={isManager} onEdit={() => setShowScrumTeam(true)} />

      <div className="pd-sections">
        <section className="pd-section">
          <h3><ListTodo size={15} /> Backlog</h3>
          {hasBacklog ? (
            <Link className="pd-section-link" to={`/projects/${projectId}/backlog`}>View Project Backlog →</Link>
          ) : (
            <>
              <p className="pd-empty">This project doesn't have a backlog yet.</p>
              <Link className="pd-section-link" to={`/projects/${projectId}/backlog/project`}>Create a Backlog →</Link>
            </>
          )}
        </section>

        <section className="pd-section">
          <h3><CalendarRange size={15} /> Timeline</h3>
          {hasTimeline ? (
            <>
              <div className="pd-timeline-preview">
                {timelinePreview.map(ev => (
                  <div key={ev.id} className={`pd-timeline-point${ev.is_active ? ' pd-timeline-active' : ''}`}>
                    <span className="pd-timeline-date">{fmtDate(ev.date)}</span>
                    <span className="pd-timeline-title">{ev.title}</span>
                  </div>
                ))}
              </div>
              <Link className="pd-section-link" to={`/projects/${projectId}/timeline`}>View Timeline →</Link>
            </>
          ) : (
            <>
              <p className="pd-empty">This project doesn't have a timeline yet.</p>
              <Link className="pd-section-link" to={`/projects/${projectId}/timeline`}>Create a Timeline →</Link>
            </>
          )}
        </section>
      </div>

      <section className="pd-section pd-sprints-section">
        <div className="pd-docs-header">
          <h3><Rocket size={15} /> Sprints</h3>
          {isManager && (
            <button className="secondary" onClick={() => setShowNewSprint(true)}>Sprint Planning</button>
          )}
        </div>
        {sprints.length === 0 ? (
          <p className="pd-empty">No sprints yet.{isManager ? ' Use "Sprint Planning" to create one.' : ''}</p>
        ) : (
          <div className="pd-sprint-grid">
            {sprints.map(s => (
              <Link key={s.id} className="pd-sprint-tile" to={`/projects/${projectId}/backlog/sprint/${s.id}`}>
                <div className="pd-sprint-tile-header">
                  <span className="pd-sprint-name">{s.display_name}</span>
                  <span className={`pd-sprint-status pd-sprint-status-${s.status}`}>{s.status}</span>
                </div>
                {(s.start_date || s.end_date) && (
                  <p className="pd-sprint-dates">{fmtDate(s.start_date) || '—'} → {fmtDate(s.end_date) || '—'}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="pd-section pd-agile-section">
        <div className="pd-docs-header">
          <h3><Gauge size={15} /> Agile Summary</h3>
          <button className="secondary" onClick={() => navigate(`/projects/${projectId}/agile-dashboard`)}>Agile Dashboard</button>
        </div>
        {!hasAgileData ? (
          <p className="pd-empty">No agile activity yet for this project.</p>
        ) : (
          <>
            <div className="pd-agile-stats">
              <div className="pd-agile-stat">
                <Layers size={18} className="pd-agile-stat-icon" />
                <span className="pd-agile-stat-value">{epics.length}</span>
                <span className="pd-agile-stat-label">Epics</span>
              </div>
              <div className="pd-agile-stat">
                <BookOpen size={18} className="pd-agile-stat-icon" />
                <span className="pd-agile-stat-value">{items.length}</span>
                <span className="pd-agile-stat-label">Stories</span>
              </div>
              <div className="pd-agile-stat">
                <Target size={18} className="pd-agile-stat-icon" />
                <span className="pd-agile-stat-value">{storyPoints}</span>
                <span className="pd-agile-stat-label">Story Points</span>
              </div>
              <div className="pd-agile-stat">
                <Rocket size={18} className="pd-agile-stat-icon" />
                <span className="pd-agile-stat-value">{sprints.length}</span>
                <span className="pd-agile-stat-label">Sprints</span>
              </div>
            </div>
            <p className="pd-agile-breakdown">
              {storiesByStatus.backlog || 0} backlog · {storiesByStatus.planned || 0} planned · {storiesByStatus.started || 0} started
              {' — '}
              {activeSprint ? `active sprint: ${activeSprint.display_name}` : 'no active sprint'}
            </p>
          </>
        )}
      </section>

      <section className="pd-section pd-docs-section">
        <div className="pd-docs-header">
          <h3><FileText size={15} /> High-Level Documentation</h3>
          {isManager && (
            <>
              <button className="secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? 'Uploading…' : '+ Upload Document'}
              </button>
              <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
            </>
          )}
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
        {documents.length === 0 ? (
          <p className="pd-empty">No documents uploaded yet.</p>
        ) : (
          <ul className="pd-doc-list">
            {documents.map(doc => (
              <li key={doc.id} className="pd-doc-row">
                {isMarkdownFile(doc.name) ? (
                  <Link to={markdownViewerPath({ url: doc.url, name: doc.name, back: `/projects/${projectId}`, backLabel: project.title })}>
                    {doc.name}
                  </Link>
                ) : (
                  <a href={doc.url} target="_blank" rel="noreferrer">{doc.name}</a>
                )}
                <span className="pd-doc-meta">
                  {doc.uploaded_by?.full_name || 'Unknown'} · {fmtDate(doc.uploaded_at)}
                </span>
                {isManager && (
                  <button className="icon-btn icon-btn-danger" onClick={() => handleDeleteDoc(doc)}>✕</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {showEdit && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEdit(false)}
          onSaved={fetchAll}
          onDeleted={() => { window.location.href = '/projects' }}
        />
      )}

      {showScrumTeam && (
        <ScrumTeamModal
          project={project}
          onClose={() => setShowScrumTeam(false)}
          onSaved={fetchAll}
        />
      )}

      {showNewSprint && (
        <NewSprintModal
          projectId={projectId}
          onClose={() => setShowNewSprint(false)}
          onCreated={sprint => { setShowNewSprint(false); navigate(`/projects/${projectId}/backlog/sprint/${sprint.id}`) }}
        />
      )}
    </div>
  )
}

export default ProjectDetail

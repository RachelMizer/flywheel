import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Folder } from 'lucide-react'
import './ProjectPlanning.css'

const API = '/api/projects'
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

// ── New Project Modal ────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/`, {
        method: 'POST', headers: jsonH(),
        body: JSON.stringify({ title, start_date: startDate || null, end_date: endDate || null, description }),
      })
      if (!res.ok) throw new Error()
      onCreated(await res.json())
    } catch {
      setError('Failed to create project.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Project</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus required />
          </label>
          <label>Start date <span className="optional">(optional)</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label>Estimated end date <span className="optional">(optional)</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
          <label>Description <span className="optional">(optional)</span>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create Project'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Project Icon (uploaded icon, or a generic fallback) ─────────────────────
function ProjectIcon({ url, size = 22 }) {
  return url
    ? <img src={url} alt="" className="project-icon" style={{ width: size, height: size }} />
    : <Folder size={size} className="project-icon project-icon-fallback" strokeWidth={1.75} />
}

// ── Project Card ─────────────────────────────────────────────────────────────
function ProjectCard({ project }) {
  return (
    <Link className="pp-card" to={`/projects/${project.id}`}>
      <h3 className="pp-card-title"><ProjectIcon url={project.icon_url} /> {project.title}</h3>
      {(project.start_date || project.end_date) && (
        <p className="pp-card-dates">{fmtDate(project.start_date) || '—'} → {fmtDate(project.end_date) || '—'}</p>
      )}
      {project.description && <p className="pp-card-desc">{project.description}</p>}
    </Link>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function ProjectPlanning({ isManager }) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/`, { headers: authH() })
      setProjects(res.ok ? await res.json() : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  return (
    <div className="page pp-page">
      <div className="pp-header">
        <h1>Project Planning</h1>
        {isManager && (
          <button onClick={() => setShowNewProject(true)}>+ New Project</button>
        )}
      </div>

      {loading && <p className="pp-empty">Loading…</p>}
      {!loading && projects.length === 0 && (
        <p className="pp-empty">No projects yet.{isManager ? ' Use "+ New Project" to create one.' : ''}</p>
      )}

      {!loading && projects.length > 0 && (
        <div className="pp-grid">
          {projects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={project => { setShowNewProject(false); navigate(`/projects/${project.id}`) }}
        />
      )}
    </div>
  )
}

export default ProjectPlanning

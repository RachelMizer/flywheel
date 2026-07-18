import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Gauge, Layers, BookOpen, Target, Rocket, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import './AgileDashboard.css'

const PROJECTS_API = '/api/projects'
const BACKLOG_API = '/api/backlog'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

function fmtDate(d) {
  if (!d) return d
  const [y, m, day] = d.split('-')
  return `${m}-${day}-${y}`
}

// ── New Story (open to every role) ──────────────────────────────────────────
function NewStoryModal({ projectId, epics, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [epicId, setEpicId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${BACKLOG_API}/items/`, {
        method: 'POST', headers: jsonH(),
        body: JSON.stringify({ project_id: projectId, title, epic_id: epicId || null }),
      })
      if (!res.ok) throw new Error()
      onCreated(await res.json())
    } catch {
      setError('Failed to create story.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Story</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          </label>
          <label>Epic <span className="optional">(optional)</span>
            <select value={epicId} onChange={e => setEpicId(e.target.value)}>
              <option value="">No epic</option>
              {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Story'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function AgileDashboard() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [epics, setEpics] = useState([])
  const [sprints, setSprints] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewStory, setShowNewStory] = useState(false)
  const [expandedEpics, setExpandedEpics] = useState(new Set())

  function toggleEpic(key) {
    setExpandedEpics(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [projectRes, epicsRes, sprintsRes, itemsRes] = await Promise.all([
        fetch(`${PROJECTS_API}/${projectId}/`, { headers: authH() }),
        fetch(`${BACKLOG_API}/epics/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${BACKLOG_API}/sprints/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${BACKLOG_API}/items/?project_id=${projectId}&sprint_id=all`, { headers: authH() }),
      ])
      setProject(projectRes.ok ? await projectRes.json() : null)
      setEpics(epicsRes.ok ? await epicsRes.json() : [])
      setSprints(sprintsRes.ok ? await sprintsRes.json() : [])
      setItems(itemsRes.ok ? await itemsRes.json() : [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return <div className="page agd-page"><p className="agd-empty">Loading…</p></div>

  const storyPoints = items.reduce((sum, i) => sum + (i.estimate || 0), 0)
  const backlogCount = items.filter(i => i.status === 'backlog').length
  const plannedCount = items.filter(i => i.status === 'planned').length
  const startedCount = items.filter(i => i.status === 'started').length
  const pipelineTotal = backlogCount + plannedCount + startedCount || 1
  const pct = n => `${(n / pipelineTotal) * 100}%`

  function summarize(epicItems) {
    return {
      count:   epicItems.length,
      points:  epicItems.reduce((sum, i) => sum + (i.estimate || 0), 0),
      backlog: epicItems.filter(i => i.status === 'backlog').length,
      planned: epicItems.filter(i => i.status === 'planned').length,
      started: epicItems.filter(i => i.status === 'started').length,
    }
  }

  const epicRows = epics
    .map(ep => {
      const epicItems = items.filter(i => i.epic?.id === ep.id)
      return { key: ep.id, title: ep.title, items: epicItems, ...summarize(epicItems) }
    })
    .concat([(() => {
      const noEpicItems = items.filter(i => !i.epic)
      return { key: 'none', title: 'No Epic', items: noEpicItems, ...summarize(noEpicItems) }
    })()])
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <div className="page agd-page">
      <Link className="agd-back-link" to={`/projects/${projectId}`}>← {project?.title || 'Project'}</Link>

      <div className="agd-header">
        <h1><Gauge size={26} /> Agile Dashboard</h1>
        <button onClick={() => setShowNewStory(true)}><Plus size={15} /> New Story</button>
      </div>

      <div className="agd-stat-grid">
        <div className="agd-stat-card agd-stat-blue">
          <div className="agd-stat-icon-badge"><Layers size={20} /></div>
          <span className="agd-stat-value">{epics.length}</span>
          <span className="agd-stat-label">Epics</span>
        </div>
        <div className="agd-stat-card agd-stat-green">
          <div className="agd-stat-icon-badge"><BookOpen size={20} /></div>
          <span className="agd-stat-value">{items.length}</span>
          <span className="agd-stat-label">Stories</span>
        </div>
        <div className="agd-stat-card agd-stat-magenta">
          <div className="agd-stat-icon-badge"><Target size={20} /></div>
          <span className="agd-stat-value">{storyPoints}</span>
          <span className="agd-stat-label">Story Points</span>
        </div>
        <div className="agd-stat-card agd-stat-yellow">
          <div className="agd-stat-icon-badge"><Rocket size={20} /></div>
          <span className="agd-stat-value">{sprints.length}</span>
          <span className="agd-stat-label">Sprints</span>
        </div>
      </div>

      <section className="agd-panel">
        <h2>Story Pipeline</h2>
        {pipelineTotal <= 1 && backlogCount + plannedCount + startedCount === 0 ? (
          <p className="agd-empty">No stories yet.</p>
        ) : (
          <>
            <div className="agd-pipeline-bar">
              {backlogCount > 0 && <div className="agd-pipeline-seg agd-seg-backlog" style={{ width: pct(backlogCount) }} />}
              {plannedCount > 0 && <div className="agd-pipeline-seg agd-seg-planned" style={{ width: pct(plannedCount) }} />}
              {startedCount > 0 && <div className="agd-pipeline-seg agd-seg-started" style={{ width: pct(startedCount) }} />}
            </div>
            <div className="agd-pipeline-legend">
              <span><i className="agd-dot agd-seg-backlog" /> Backlog · {backlogCount}</span>
              <span><i className="agd-dot agd-seg-planned" /> Planned · {plannedCount}</span>
              <span><i className="agd-dot agd-seg-started" /> Started · {startedCount}</span>
            </div>
          </>
        )}
      </section>

      <section className="agd-panel">
        <h2>Sprints</h2>
        {sprints.length === 0 ? (
          <p className="agd-empty">No sprints yet.</p>
        ) : (
          <div className="agd-sprint-row">
            {sprints.map(s => (
              <Link key={s.id} to={`/projects/${projectId}/backlog/sprint/${s.id}`} className="agd-sprint-card">
                <span className={`pd-sprint-status pd-sprint-status-${s.status}`}>{s.status}</span>
                <span className="agd-sprint-name">{s.display_name}</span>
                {(s.start_date || s.end_date) && (
                  <span className="agd-sprint-dates">{fmtDate(s.start_date) || '—'} → {fmtDate(s.end_date) || '—'}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="agd-panel">
        <h2>Epic Breakdown</h2>
        {epicRows.length === 0 ? (
          <p className="agd-empty">No stories yet.</p>
        ) : (
          <div className="agd-epic-tree">
            <div className="agd-epic-tree-row agd-epic-tree-head">
              <span />
              <span className="agd-epic-name">Epic</span>
              <span className="agd-epic-col-num">Stories</span>
              <span className="agd-epic-col-num">Points</span>
              <span className="agd-epic-col-mix">Status Mix</span>
            </div>
            {epicRows.map(row => {
              const rowTotal = row.count || 1
              const isOpen = expandedEpics.has(row.key)
              return (
                <div key={row.key} className="agd-epic-node">
                  <button
                    type="button"
                    className="agd-epic-tree-row agd-epic-node-header"
                    onClick={() => toggleEpic(row.key)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="agd-epic-name">{row.title}</span>
                    <span className="agd-epic-col-num">{row.count}</span>
                    <span className="agd-epic-col-num">{row.points}</span>
                    <div className="agd-mix-bar">
                      {row.backlog > 0 && <div className="agd-pipeline-seg agd-seg-backlog" style={{ width: `${(row.backlog / rowTotal) * 100}%` }} />}
                      {row.planned > 0 && <div className="agd-pipeline-seg agd-seg-planned" style={{ width: `${(row.planned / rowTotal) * 100}%` }} />}
                      {row.started > 0 && <div className="agd-pipeline-seg agd-seg-started" style={{ width: `${(row.started / rowTotal) * 100}%` }} />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="agd-epic-node-children">
                      {row.items.map(item => (
                        <div key={item.id} className="agd-story-node">
                          <span className="agd-story-connector" aria-hidden="true" />
                          <span className="agd-story-title">{item.title}</span>
                          <span className={`agd-story-status agd-seg-${item.status}`}>{item.status}</span>
                          {item.estimate != null && <span className="agd-story-estimate">{item.estimate} pt</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="agd-epic-tree-row agd-epic-tree-total">
              <span />
              <span className="agd-epic-name">Total</span>
              <span className="agd-epic-col-num">{items.length}</span>
              <span className="agd-epic-col-num">{storyPoints}</span>
              <span className="agd-mix-caption">{backlogCount} · {plannedCount} · {startedCount}</span>
            </div>
          </div>
        )}
      </section>

      <Link className="agd-view-backlog-link" to={`/projects/${projectId}/backlog`}>View Full Backlog →</Link>

      {showNewStory && (
        <NewStoryModal
          projectId={projectId}
          epics={epics}
          onClose={() => setShowNewStory(false)}
          onCreated={() => { setShowNewStory(false); fetchAll() }}
        />
      )}
    </div>
  )
}

export default AgileDashboard

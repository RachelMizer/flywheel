import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import './BacklogDashboard.css'

const API = '/api/backlog'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

// ── New Sprint Modal (only shown when no sprints exist yet) ────────────────────
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
      const res = await fetch(`${API}/sprints/`, {
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
          <h3>New Sprint</h3>
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

// ── Item Preview Row ─────────────────────────────────────────────────────────
function ItemPreviewRow({ item }) {
  return (
    <div className="bl-preview-row">
      <span className="bl-preview-title">{item.title}</span>
      {item.epic && <span className="bl-badge bl-badge-epic">{item.epic.title}</span>}
      {item.estimate != null && <span className="bl-badge bl-badge-estimate">{item.estimate} pt</span>}
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function BacklogDashboard({ isManager }) {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [sprintPanel, setSprintPanel] = useState(null)
  const [sprintPanelLoading, setSprintPanelLoading] = useState(false)
  const [showNewSprint, setShowNewSprint] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/dashboard/?project_id=${projectId}`, { headers: authH() })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setData(d)
      if (d.current_sprint) {
        setSelectedSprintId(String(d.current_sprint.id))
        setSprintPanel(d.current_sprint)
      }
    } catch {
      setError('Failed to load backlog dashboard.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  async function handleSelectSprint(id) {
    setSelectedSprintId(id)
    if (data?.current_sprint && String(data.current_sprint.id) === id) {
      setSprintPanel(data.current_sprint)
      return
    }
    setSprintPanelLoading(true)
    try {
      const res = await fetch(`${API}/sprints/${id}/`, { headers: authH() })
      if (!res.ok) throw new Error()
      const sprint = await res.json()
      setSprintPanel({ ...sprint, preview: sprint.items.slice(0, 5), item_count: sprint.items.length })
    } catch {
      setSprintPanel(null)
    } finally {
      setSprintPanelLoading(false)
    }
  }

  return (
    <div className="page bl-dash-page">
      <div className="bl-dash-header">
        <div>
          <Link className="bl-back-link" to={`/projects/${projectId}`}>← Back to Project</Link>
          <h1>Backlog</h1>
        </div>
      </div>

      {loading && <p className="bl-empty">Loading…</p>}
      {error && <p className="bl-empty">{error}</p>}

      {!loading && data && (
        <div className="bl-dash-grid">
          <section className="bl-panel">
            <div className="bl-panel-header">
              <h3>Project Backlog</h3>
              <span className="bl-count">{data.project_backlog.count}</span>
            </div>
            {data.project_backlog.preview.length === 0 ? (
              <p className="bl-empty">No stories in the project backlog yet.</p>
            ) : (
              <div className="bl-preview-list">
                {data.project_backlog.preview.map(item => <ItemPreviewRow key={item.id} item={item} />)}
              </div>
            )}
            <Link className="bl-panel-link" to={`/projects/${projectId}/backlog/project`}>View Project Backlog →</Link>
          </section>

          <section className="bl-panel">
            <div className="bl-panel-header">
              <h3>Sprint Backlog</h3>
              {data.sprints.length > 0 && (
                <select
                  className="bl-sprint-select"
                  value={selectedSprintId}
                  onChange={e => handleSelectSprint(e.target.value)}
                >
                  {data.sprints.map(s => (
                    <option key={s.id} value={s.id}>{s.display_name} — {s.status}</option>
                  ))}
                </select>
              )}
            </div>

            {data.sprints.length === 0 && (
              <>
                <p className="bl-empty">No sprints yet.</p>
                {isManager && (
                  <button className="secondary" onClick={() => setShowNewSprint(true)}>+ New Sprint</button>
                )}
              </>
            )}

            {sprintPanelLoading && <p className="bl-empty">Loading…</p>}

            {!sprintPanelLoading && sprintPanel && (
              <>
                {sprintPanel.preview.length === 0 ? (
                  <p className="bl-empty">No stories in this sprint yet.</p>
                ) : (
                  <div className="bl-preview-list">
                    {sprintPanel.preview.map(item => <ItemPreviewRow key={item.id} item={item} />)}
                  </div>
                )}
                <Link className="bl-panel-link" to={`/projects/${projectId}/backlog/sprint/${sprintPanel.id}`}>View Sprint Backlog →</Link>
              </>
            )}
          </section>
        </div>
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

export default BacklogDashboard

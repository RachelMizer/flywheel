import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import './BacklogDashboard.css'

const API = '/api/backlog'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

const MOSCOW_LETTERS = [
  ['must', 'M'],
  ['should', 'S'],
  ['could', 'C'],
  ['wont', 'W'],
]

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

// ── New Epic Modal ───────────────────────────────────────────────────────────
function NewEpicModal({ projectId, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/epics/`, {
        method: 'POST', headers: jsonH(), body: JSON.stringify({ project_id: projectId, title, description }),
      })
      if (!res.ok) throw new Error()
      await onSaved()
      onClose()
    } catch {
      setError('Failed to create epic.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Epic</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus required />
          </label>
          <label>Description <span className="optional">(optional)</span>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create Epic'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── New Story Modal ──────────────────────────────────────────────────────────
function NewStoryModal({ projectId, epics, sprints, isManager, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [epicId, setEpicId] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const body = { project_id: projectId, title, epic_id: epicId || null }
      if (isManager) body.sprint_id = sprintId || null
      const res = await fetch(`${API}/items/`, {
        method: 'POST', headers: jsonH(), body: JSON.stringify(body),
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
          <label>Sprint {!isManager && <span className="optional">(managers only)</span>}
            <select value={sprintId} onChange={e => setSprintId(e.target.value)} disabled={!isManager}>
              <option value="">— Project Backlog —</option>
              {sprints.map(s => <option key={s.id} value={s.id}>{s.display_name} — {s.status}</option>)}
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

// ── MoSCoW Row ───────────────────────────────────────────────────────────────
function MoscowRow({ item, sprintName, projectId, onSetMoscow }) {
  const preview = item.user_story
    ? item.user_story.content.length > 120
      ? `${item.user_story.content.slice(0, 120)}…`
      : item.user_story.content
    : null

  return (
    <div className="bl-moscow-row">
      <span className="bl-moscow-title">{item.title}</span>
      <span className="bl-moscow-sprint">{sprintName || 'Backlog'}</span>
      <div className="bl-moscow-toggles">
        {MOSCOW_LETTERS.map(([value, letter]) => (
          <button
            key={value}
            type="button"
            className={`bl-moscow-btn bl-moscow-btn-${value}${item.moscow === value ? ' active' : ''}`}
            onClick={() => onSetMoscow(item, value)}
            aria-pressed={item.moscow === value}
            title={value === 'wont' ? "Won't" : value.charAt(0).toUpperCase() + value.slice(1)}
          >
            {letter}
          </button>
        ))}
      </div>
      {preview ? (
        <Link className="bl-moscow-story" to={`/projects/${projectId}/backlog/stories?highlight=${item.id}`}>
          {preview}
        </Link>
      ) : (
        <span className="bl-moscow-story bl-moscow-story-empty">No story yet</span>
      )}
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function BacklogDashboard({ isManager }) {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [epics, setEpics] = useState([])
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [sprintPanel, setSprintPanel] = useState(null)
  const [sprintPanelLoading, setSprintPanelLoading] = useState(false)
  const [showNewSprint, setShowNewSprint] = useState(false)
  const [showNewEpic, setShowNewEpic] = useState(false)
  const [showNewStory, setShowNewStory] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dashRes, epicsRes, itemsRes] = await Promise.all([
        fetch(`${API}/dashboard/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${API}/epics/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${API}/items/?project_id=${projectId}&sprint_id=all`, { headers: authH() }),
      ])
      if (!dashRes.ok) throw new Error()
      const d = await dashRes.json()
      setData(d)
      setEpics(epicsRes.ok ? await epicsRes.json() : [])
      setAllItems(itemsRes.ok ? await itemsRes.json() : [])
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

  async function handleSetMoscow(item, value) {
    const nextValue = item.moscow === value ? null : value
    setAllItems(list => list.map(i => i.id === item.id ? { ...i, moscow: nextValue } : i))
    await fetch(`${API}/items/${item.id}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ moscow: nextValue }),
    })
  }

  const sprintsById = new Map((data?.sprints ?? []).map(s => [s.id, s.display_name]))

  return (
    <div className="page bl-dash-page">
      <div className="bl-dash-header">
        <div>
          <Link className="bl-back-link" to={`/projects/${projectId}`}>← Back to Project</Link>
          <h1>Backlog</h1>
        </div>
        <div className="bl-header-actions">
          <button onClick={() => setShowNewStory(true)}>+ New Story</button>
          {isManager && (
            <>
              <button className="secondary" onClick={() => setShowNewEpic(true)}>+ New Epic</button>
              <button className="secondary" onClick={() => setShowNewSprint(true)}>+ New Sprint</button>
            </>
          )}
          <Link className="secondary bl-header-link-btn" to={`/projects/${projectId}/backlog/stories`}>Stories</Link>
        </div>
      </div>

      {loading && <p className="bl-empty">Loading…</p>}
      {error && <p className="bl-empty">{error}</p>}

      {!loading && data && (
        <>
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

          <section className="bl-panel bl-moscow-panel">
            <div className="bl-panel-header">
              <h3>MoSCoW Prioritization</h3>
              <span className="bl-count">{allItems.length}</span>
            </div>
            {allItems.length === 0 ? (
              <p className="bl-empty">No stories yet.</p>
            ) : (
              <div className="bl-moscow-table">
                <div className="bl-moscow-row bl-moscow-row-head">
                  <span>Backlog Item</span>
                  <span>Sprint</span>
                  <span>Prioritization</span>
                  <span>User Story</span>
                </div>
                {allItems.map(item => (
                  <MoscowRow
                    key={item.id}
                    item={item}
                    sprintName={sprintsById.get(item.sprint_id)}
                    projectId={projectId}
                    onSetMoscow={handleSetMoscow}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showNewStory && (
        <NewStoryModal
          projectId={projectId}
          epics={epics}
          sprints={data?.sprints ?? []}
          isManager={isManager}
          onClose={() => setShowNewStory(false)}
          onCreated={() => { setShowNewStory(false); fetchDashboard() }}
        />
      )}

      {showNewEpic && (
        <NewEpicModal projectId={projectId} onClose={() => setShowNewEpic(false)} onSaved={fetchDashboard} />
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import './SprintBacklog.css'

const API = '/api/backlog'
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

function reorderIds(ids, draggedId, targetId) {
  const without = ids.filter(id => id !== draggedId)
  const targetIndex = without.indexOf(targetId)
  without.splice(targetIndex, 0, draggedId)
  return without
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

// ── Edit Sprint Modal ────────────────────────────────────────────────────────
function EditSprintModal({ sprint, onClose, onSaved }) {
  const [name, setName] = useState(sprint.name)
  const [goal, setGoal] = useState(sprint.goal)
  const [status, setStatus] = useState(sprint.status)
  const [startDate, setStartDate] = useState(sprint.start_date ?? '')
  const [endDate, setEndDate] = useState(sprint.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/sprints/${sprint.id}/`, {
        method: 'PATCH', headers: jsonH(),
        body: JSON.stringify({ name, goal, status, start_date: startDate || null, end_date: endDate || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save sprint.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save sprint.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Sprint</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Name
            <input value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label>Goal
            <textarea rows={3} value={goal} onChange={e => setGoal(e.target.value)} />
          </label>
          <label>Status
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>Start date
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label>End date
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Story Modal (edit an existing sprint item) ──────────────────────────────
function StoryModal({ item, epics, sprints, isManager, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const [estimate, setEstimate] = useState(item.estimate ?? '')
  const [epicId, setEpicId] = useState(item.epic?.id ?? '')
  const [sprintId, setSprintId] = useState(item.sprint_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const body = { title, description, estimate: estimate === '' ? null : Number(estimate), epic_id: epicId || null }
      if (isManager) body.sprint_id = sprintId || null
      const res = await fetch(`${API}/items/${item.id}/`, {
        method: 'PATCH', headers: jsonH(), body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      await onSaved()
      onClose()
    } catch {
      setError('Failed to save story.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete story "${item.title}"?`)) return
    const res = await fetch(`${API}/items/${item.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) {
      await onDeleted()
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Story</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} required />
          </label>
          <label>Description <span className="optional">(optional)</span>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <label>Estimate <span className="optional">(story points, optional)</span>
            <input type="number" min="0" value={estimate} onChange={e => setEstimate(e.target.value)} />
          </label>
          <label>Epic <span className="optional">(optional)</span>
            <select value={epicId} onChange={e => setEpicId(e.target.value)}>
              <option value="">— No epic —</option>
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
            <button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            {isManager && (
              <button type="button" className="btn-danger" onClick={handleDelete}>Delete</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Pull From Backlog Modal ──────────────────────────────────────────────────
function PullFromBacklogModal({ projectId, sprintId, onClose, onPulled }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/items/?project_id=${projectId}&sprint_id=none`, { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId])

  async function handlePull(item) {
    const res = await fetch(`${API}/items/${item.id}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ sprint_id: sprintId }),
    })
    if (res.ok) {
      setItems(list => list.filter(i => i.id !== item.id))
      onPulled()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pull From Project Backlog</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="bl-pull-list">
          {loading && <p className="bl-empty">Loading…</p>}
          {!loading && items.length === 0 && <p className="bl-empty">Project backlog is empty.</p>}
          {items.map(item => (
            <div key={item.id} className="bl-pull-row">
              <span className="bl-item-title">{item.title}</span>
              {item.estimate != null && <span className="bl-badge bl-badge-estimate">{item.estimate} pt</span>}
              <button className="secondary" onClick={() => handlePull(item)}>+ Add</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Start Modal (pick a column to convert item into a Kanban card) ─────────
function StartModal({ item, onClose, onStarted }) {
  const [boards, setBoards] = useState([])
  const [boardId, setBoardId] = useState('')
  const [board, setBoard] = useState(null)
  const [columnId, setColumnId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/kanban/boards/', { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(list => { setBoards(Array.isArray(list) ? list : []); if (list.length) setBoardId(String(list[0].id)) })
  }, [])

  useEffect(() => {
    if (!boardId) { setBoard(null); return }
    fetch(`/api/kanban/boards/${boardId}/`, { headers: authH() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setBoard(data); setColumnId(data?.columns?.[0] ? String(data.columns[0].id) : '') })
  }, [boardId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!columnId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/items/${item.id}/start/`, {
        method: 'POST', headers: jsonH(), body: JSON.stringify({ column_id: Number(columnId) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to start item.')
      }
      await onStarted()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to start item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Start "{item.title}"</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          {boards.length === 0 ? (
            <p className="bl-empty">No Kanban boards exist yet — create one first.</p>
          ) : (
            <>
              <label>Board
                <select value={boardId} onChange={e => setBoardId(e.target.value)}>
                  {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label>Column
                <select value={columnId} onChange={e => setColumnId(e.target.value)} disabled={!board?.columns?.length}>
                  {board?.columns?.length
                    ? board.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                    : <option value="">No columns on this board</option>}
                </select>
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="submit" disabled={saving || !columnId}>{saving ? 'Starting…' : 'Start'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Sprint Item Row ──────────────────────────────────────────────────────────
function SprintItemRow({ item, draggable, onDragStart, onDragOver, onDrop, dragOver, onEdit, onStart }) {
  return (
    <div
      className={`bl-item-row${dragOver ? ' bl-drag-over' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? () => onDragStart(item.id) : undefined}
      onDragOver={draggable ? e => { e.preventDefault(); onDragOver(item.id) } : undefined}
      onDrop={draggable ? e => { e.preventDefault(); onDrop(item.id) } : undefined}
    >
      {draggable && <span className="bl-drag-handle">⠿</span>}
      <span className="bl-item-title" onClick={() => onEdit(item)}>{item.title}</span>
      {item.epic && <span className="bl-badge bl-badge-epic">{item.epic.title}</span>}
      {item.estimate != null && <span className="bl-badge bl-badge-estimate">{item.estimate} pt</span>}
      {item.status === 'started' ? (
        <Link className="bl-panel-link" to={`/kanban?board=${item.kanban_card.board_id}`}>View on Kanban board →</Link>
      ) : (
        <button className="secondary bl-start-btn" onClick={() => onStart(item)}>Start</button>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function SprintBacklog({ isManager }) {
  const { projectId, sprintId } = useParams()
  const navigate = useNavigate()

  const [sprints, setSprints] = useState([])
  const [sprint, setSprint] = useState(null)
  const [epics, setEpics] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragOverId, setDragOverId] = useState(null)
  const [storyModal, setStoryModal] = useState(null)
  const [showEditSprint, setShowEditSprint] = useState(false)
  const [showNewSprint, setShowNewSprint] = useState(false)
  const [showPull, setShowPull] = useState(false)
  const [startModalItem, setStartModalItem] = useState(null)

  const dragRef = useRef(null)

  const fetchSprint = useCallback(async () => {
    setLoading(true)
    try {
      const [sprintsRes, sprintRes, epicsRes] = await Promise.all([
        fetch(`${API}/sprints/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${API}/sprints/${sprintId}/`, { headers: authH() }),
        fetch(`${API}/epics/?project_id=${projectId}`, { headers: authH() }),
      ])
      setSprints(sprintsRes.ok ? await sprintsRes.json() : [])
      setSprint(sprintRes.ok ? await sprintRes.json() : null)
      setEpics(epicsRes.ok ? await epicsRes.json() : [])
    } finally {
      setLoading(false)
    }
  }, [projectId, sprintId])

  useEffect(() => { fetchSprint() }, [fetchSprint])

  function onDragStart(id) { dragRef.current = id }
  function onDragOver(id) { setDragOverId(id) }

  async function onDrop(targetId) {
    setDragOverId(null)
    const draggedId = dragRef.current
    dragRef.current = null
    if (!draggedId || draggedId === targetId || !sprint) return

    const orderedIds = reorderIds(sprint.items.map(i => i.id), draggedId, targetId)
    setSprint(s => ({ ...s, items: orderedIds.map(id => s.items.find(i => i.id === id)) }))

    await fetch(`${API}/items/reorder/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ project_id: projectId, scope: Number(sprintId), ordered_ids: orderedIds }),
    })
  }

  if (loading) return <div className="page bl-sprint-page"><p className="bl-empty">Loading…</p></div>
  if (!sprint) return <div className="page bl-sprint-page"><p className="bl-empty">Sprint not found.</p></div>

  return (
    <div className="page bl-sprint-page">
      <div className="bl-header">
        <div>
          <Link className="bl-back-link" to={`/projects/${projectId}`}>← Back to Project</Link>
          <h1>{sprint.display_name}</h1>
          {sprint.goal && <p className="bl-sprint-goal">{sprint.goal}</p>}
        </div>
        <div className="bl-header-actions">
          <select className="bl-sprint-select" value={sprintId} onChange={e => navigate(`/projects/${projectId}/backlog/sprint/${e.target.value}`)}>
            {sprints.map(s => <option key={s.id} value={s.id}>{s.display_name} — {s.status}</option>)}
          </select>
          {isManager && (
            <>
              <button className="secondary" onClick={() => setShowEditSprint(true)}>Edit Sprint</button>
              <button className="secondary" onClick={() => setShowPull(true)}>+ Pull from Backlog</button>
              <button onClick={() => setShowNewSprint(true)}>+ New Sprint</button>
            </>
          )}
        </div>
      </div>

      <div className="bl-sprint-meta">
        <span className={`bl-status-badge bl-status-${sprint.status}`}>{sprint.status}</span>
        {sprint.start_date && <span>{fmtDate(sprint.start_date)} → {fmtDate(sprint.end_date) || '—'}</span>}
      </div>

      {sprint.items.length === 0 ? (
        <p className="bl-empty">No stories in this sprint yet.{isManager ? ' Use "Pull from Backlog" to add some.' : ''}</p>
      ) : (
        <div className="bl-item-list">
          {sprint.items.map(item => (
            <SprintItemRow
              key={item.id}
              item={item}
              draggable={isManager}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragOver={dragOverId === item.id}
              onEdit={setStoryModal}
              onStart={setStartModalItem}
            />
          ))}
        </div>
      )}

      {storyModal && (
        <StoryModal
          item={storyModal}
          epics={epics}
          sprints={sprints}
          isManager={isManager}
          onClose={() => setStoryModal(null)}
          onSaved={fetchSprint}
          onDeleted={fetchSprint}
        />
      )}

      {showEditSprint && (
        <EditSprintModal sprint={sprint} onClose={() => setShowEditSprint(false)} onSaved={fetchSprint} />
      )}

      {showNewSprint && (
        <NewSprintModal
          projectId={projectId}
          onClose={() => setShowNewSprint(false)}
          onCreated={s => { setShowNewSprint(false); navigate(`/projects/${projectId}/backlog/sprint/${s.id}`) }}
        />
      )}

      {showPull && (
        <PullFromBacklogModal projectId={projectId} sprintId={sprint.id} onClose={() => setShowPull(false)} onPulled={fetchSprint} />
      )}

      {startModalItem && (
        <StartModal item={startModalItem} onClose={() => setStartModalItem(null)} onStarted={fetchSprint} />
      )}
    </div>
  )
}

export default SprintBacklog

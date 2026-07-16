import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import './ProjectBacklog.css'

const API = '/api/backlog'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

function reorderIds(ids, draggedId, targetId) {
  const without = ids.filter(id => id !== draggedId)
  const targetIndex = without.indexOf(targetId)
  without.splice(targetIndex, 0, draggedId)
  return without
}

// ── New Epic Modal ───────────────────────────────────────────────────────────
function EpicModal({ projectId, onClose, onSaved }) {
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

// ── Story Modal (create + edit) ──────────────────────────────────────────────
function StoryModal({ item, projectId, epics, sprints, isManager, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [estimate, setEstimate] = useState(item?.estimate ?? '')
  const [epicId, setEpicId] = useState(item?.epic?.id ?? '')
  const [sprintId, setSprintId] = useState(item?.sprint_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const body = {
        title,
        description,
        estimate: estimate === '' ? null : Number(estimate),
        epic_id: epicId || null,
      }
      if (!item) body.project_id = projectId
      if (isManager) body.sprint_id = sprintId || null

      const url = item ? `${API}/items/${item.id}/` : `${API}/items/`
      const res = await fetch(url, {
        method: item ? 'PATCH' : 'POST', headers: jsonH(), body: JSON.stringify(body),
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
    if (!item || !window.confirm(`Delete story "${item.title}"?`)) return
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
          <h3>{item ? 'Edit Story' : 'New Story'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          {error && <p className="form-error">{error}</p>}
          <label>Title <span className="required">*</span>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus required />
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
            {item && isManager && (
              <button type="button" className="btn-danger" onClick={handleDelete}>Delete</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Story Row ────────────────────────────────────────────────────────────────
function StoryRow({ item, draggable, onDragStart, onDragOver, onDrop, dragOver, onClick }) {
  return (
    <div
      className={`bl-item-row${dragOver ? ' bl-drag-over' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? () => onDragStart(item.id) : undefined}
      onDragOver={draggable ? e => { e.preventDefault(); onDragOver(item.id) } : undefined}
      onDrop={draggable ? e => { e.preventDefault(); onDrop(item.id) } : undefined}
      onClick={() => onClick(item)}
    >
      {draggable && <span className="bl-drag-handle">⠿</span>}
      <span className="bl-item-title">{item.title}</span>
      {item.epic && <span className="bl-badge bl-badge-epic">{item.epic.title}</span>}
      {item.estimate != null && <span className="bl-badge bl-badge-estimate">{item.estimate} pt</span>}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function ProjectBacklog({ isManager }) {
  const { projectId } = useParams()
  const [items, setItems] = useState([])
  const [epics, setEpics] = useState([])
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [epicFilter, setEpicFilter] = useState('')
  const [storyModal, setStoryModal] = useState(null)
  const [showEpicModal, setShowEpicModal] = useState(false)
  const [dragOverId, setDragOverId] = useState(null)

  const dragRef = useRef(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, epicsRes, sprintsRes] = await Promise.all([
        fetch(`${API}/items/?project_id=${projectId}&sprint_id=none`, { headers: authH() }),
        fetch(`${API}/epics/?project_id=${projectId}`, { headers: authH() }),
        fetch(`${API}/sprints/?project_id=${projectId}`, { headers: authH() }),
      ])
      setItems(itemsRes.ok ? await itemsRes.json() : [])
      setEpics(epicsRes.ok ? await epicsRes.json() : [])
      setSprints(sprintsRes.ok ? await sprintsRes.json() : [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  function onDragStart(id) { dragRef.current = id }
  function onDragOver(id) { setDragOverId(id) }

  async function onDrop(targetId) {
    setDragOverId(null)
    const draggedId = dragRef.current
    dragRef.current = null
    if (!draggedId || draggedId === targetId) return

    const orderedIds = reorderIds(items.map(i => i.id), draggedId, targetId)
    setItems(orderedIds.map(id => items.find(i => i.id === id)))

    await fetch(`${API}/items/reorder/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ project_id: projectId, scope: null, ordered_ids: orderedIds }),
    })
  }

  const visibleItems = epicFilter ? items.filter(i => i.epic?.id === Number(epicFilter)) : items

  return (
    <div className="page bl-project-page">
      <div className="bl-header">
        <div>
          <Link className="bl-back-link" to={`/projects/${projectId}`}>← Back to Project</Link>
          <h1>Project Backlog</h1>
        </div>
        <div className="bl-header-actions">
          <select className="bl-epic-filter" value={epicFilter} onChange={e => setEpicFilter(e.target.value)}>
            <option value="">All epics</option>
            {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
          </select>
          <button onClick={() => setStoryModal({})}>+ New Story</button>
          {isManager && (
            <button className="secondary" onClick={() => setShowEpicModal(true)}>+ New Epic</button>
          )}
        </div>
      </div>

      {loading && <p className="bl-empty">Loading…</p>}
      {!loading && visibleItems.length === 0 && (
        <p className="bl-empty">No stories in the project backlog{epicFilter ? ' for this epic' : ''}.</p>
      )}

      {!loading && visibleItems.length > 0 && (
        <div className="bl-item-list">
          {visibleItems.map(item => (
            <StoryRow
              key={item.id}
              item={item}
              draggable={isManager}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragOver={dragOverId === item.id}
              onClick={setStoryModal}
            />
          ))}
        </div>
      )}

      {storyModal !== null && (
        <StoryModal
          item={storyModal.id ? storyModal : null}
          projectId={projectId}
          epics={epics}
          sprints={sprints}
          isManager={isManager}
          onClose={() => setStoryModal(null)}
          onSaved={fetchAll}
          onDeleted={fetchAll}
        />
      )}

      {showEpicModal && (
        <EpicModal projectId={projectId} onClose={() => setShowEpicModal(false)} onSaved={fetchAll} />
      )}
    </div>
  )
}

export default ProjectBacklog

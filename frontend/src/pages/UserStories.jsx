import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import './UserStories.css'

const API = '/api/backlog'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

// ── Add User Story Modal ────────────────────────────────────────────────────
function AddUserStoryModal({ availableItems, onClose, onSaved }) {
  const [backlogItemId, setBacklogItemId] = useState(availableItems[0]?.id ?? '')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState(availableItems)

  async function save() {
    if (!backlogItemId || !content.trim()) return null
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/stories/`, {
        method: 'POST', headers: jsonH(),
        body: JSON.stringify({ backlog_item_id: backlogItemId, content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save user story.')
      }
      const saved = await res.json()
      return saved
    } catch (err) {
      setError(err.message || 'Failed to save user story.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const saved = await save()
    if (!saved) return
    await onSaved()
    const remaining = items.filter(i => i.id !== Number(backlogItemId))
    setItems(remaining)
    setBacklogItemId(remaining[0]?.id ?? '')
    setContent('')
  }

  async function handleSaveAndClose() {
    const saved = await save()
    if (!saved) return
    await onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add User Story</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="card-form">
          {error && <p className="form-error">{error}</p>}
          {items.length === 0 ? (
            <p className="us-empty">Every backlog item already has a user story.</p>
          ) : (
            <>
              <label>Backlog Item <span className="required">*</span>
                <select value={backlogItemId} onChange={e => setBacklogItemId(e.target.value)} autoFocus>
                  {items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                </select>
              </label>
              <label>User Story <span className="required">*</span>
                <textarea
                  rows={5}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="As a [user], I want [goal] so that [reason]."
                  required
                />
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="button" disabled={saving || !backlogItemId || !content.trim()} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" disabled={saving || !backlogItemId || !content.trim()} onClick={handleSaveAndClose}>
              {saving ? 'Saving…' : 'Save and Close'}
            </button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
function UserStories() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const rowRefs = useRef({})

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/items/?project_id=${projectId}&sprint_id=all`, { headers: authH() })
      setItems(res.ok ? await res.json() : [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchItems() }, [fetchItems])

  useEffect(() => {
    if (highlightId && rowRefs.current[highlightId]) {
      rowRefs.current[highlightId].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightId, items])

  const availableItems = items.filter(i => !i.user_story)

  return (
    <div className="page us-page">
      <div className="us-header">
        <div>
          <Link className="bl-back-link" to={`/projects/${projectId}/backlog`}>← Back to Backlog</Link>
          <h1>User Stories</h1>
        </div>
        <button onClick={() => setShowAdd(true)}>+ Add User Story</button>
      </div>

      {loading && <p className="us-empty">Loading…</p>}
      {!loading && items.length === 0 && <p className="us-empty">No backlog items yet.</p>}

      {!loading && items.length > 0 && (
        <div className="us-list">
          {items.map(item => (
            <div
              key={item.id}
              ref={el => { rowRefs.current[item.id] = el }}
              className={`us-row${String(item.id) === highlightId ? ' us-row-highlight' : ''}`}
            >
              <span className="us-item-title">{item.title}</span>
              <span className="us-item-story">
                {item.user_story ? item.user_story.content : <em className="us-empty-inline">No story yet</em>}
              </span>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddUserStoryModal
          availableItems={availableItems}
          onClose={() => setShowAdd(false)}
          onSaved={fetchItems}
        />
      )}
    </div>
  )
}

export default UserStories

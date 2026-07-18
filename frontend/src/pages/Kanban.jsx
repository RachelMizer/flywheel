import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Kanban.css'

const API = '/api/kanban'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() })

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}


// ── Checklist Item Row ────────────────────────────────────────────────────────
function ItemRow({ item, clId, canEdit, onToggle, onRename, onDelete }) {
  const [text, setText] = useState(item.text)
  const original = useRef(item.text)

  // Sync if parent updates the item (e.g. after re-fetch)
  useEffect(() => { setText(item.text); original.current = item.text }, [item.text])

  function handleBlur() {
    if (!canEdit) return
    const trimmed = text.trim()
    if (!trimmed) { setText(original.current); return }
    if (trimmed !== original.current) {
      original.current = trimmed
      onRename(clId, item.id, trimmed)
    }
  }

  return (
    <div className="cl-item">
      <input
        type="checkbox"
        className="cl-checkbox"
        checked={item.checked}
        disabled={!canEdit}
        onChange={() => canEdit && onToggle(clId, item)}
      />
      <input
        className={`cl-item-text${item.checked ? ' cl-item-checked' : ''}`}
        value={text}
        readOnly={!canEdit}
        onChange={e => canEdit && setText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
      />
      {canEdit && <button className="icon-btn icon-btn-danger cl-delete" onClick={() => onDelete(clId, item.id)}>✕</button>}
    </div>
  )
}


// ── Checklist Block ───────────────────────────────────────────────────────────
function ChecklistBlock({ cl, canEdit, onRename, onDelete, onAddItem, onToggleItem, onRenameItem, onDeleteItem }) {
  const [name, setName] = useState(cl.name)
  const originalName = useRef(cl.name)
  const [newItemText, setNewItemText] = useState('')
  const newItemRef = useRef(null)

  useEffect(() => { setName(cl.name); originalName.current = cl.name }, [cl.name])

  const total = cl.items.length
  const done  = cl.items.filter(i => i.checked).length

  function handleNameBlur() {
    if (!canEdit) return
    const trimmed = name.trim()
    if (!trimmed) { setName(originalName.current); return }
    if (trimmed !== originalName.current) {
      originalName.current = trimmed
      onRename(cl.id, trimmed)
    }
  }

  async function handleAddItem() {
    const trimmed = newItemText.trim()
    if (!trimmed) return
    await onAddItem(cl.id, trimmed)
    setNewItemText('')
    newItemRef.current?.focus()
  }

  return (
    <div className="checklist-block">
      <div className="cl-header">
        <div className="cl-header-left">
          <span className="cl-icon">☰</span>
          <input
            className="cl-name-input"
            value={name}
            readOnly={!canEdit}
            onChange={e => canEdit && setName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
          />
          {total > 0 && (
            <span className={`cl-progress${done === total ? ' complete' : ''}`}>
              {done}/{total}
            </span>
          )}
        </div>
        {canEdit && <button className="icon-btn icon-btn-danger" onClick={() => onDelete(cl.id)}>✕</button>}
      </div>

      {total > 0 && (
        <div className="cl-progress-bar">
          <div className="cl-progress-fill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      )}

      <div className="cl-items">
        {cl.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            clId={cl.id}
            canEdit={canEdit}
            onToggle={onToggleItem}
            onRename={onRenameItem}
            onDelete={onDeleteItem}
          />
        ))}
      </div>

      {canEdit && (
        <div className="cl-add-item">
          <input
            ref={newItemRef}
            className="cl-add-item-input"
            placeholder="Add an item…"
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddItem()}
          />
          <button
            className="secondary cl-add-item-btn"
            onClick={handleAddItem}
            disabled={!newItemText.trim()}
          >Add</button>
        </div>
      )}
    </div>
  )
}


// ── Card Modal (create / edit / view) ─────────────────────────────────────────
function CardModal({ mode, card, columnId, canEdit, onClose, onSaved }) {
  const [title, setTitle]           = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [assignedToId, setAssignedToId] = useState(card?.assigned_to?.id ?? '')
  const [assignedToUser, setAssignedToUser] = useState(card?.assigned_to ?? null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  // Edit-mode extras
  const [checklists, setChecklists] = useState([])
  const [members, setMembers]       = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [addingCL, setAddingCL]     = useState(false)
  const [newCLName, setNewCLName]   = useState('')
  const newCLRef = useRef(null)

  useEffect(() => {
    if (canEdit) {
      fetch(`${API}/members/`, { headers: authH() })
        .then(r => r.json())
        .then(data => setMembers(Array.isArray(data) ? data : []))
        .catch(() => {})
    }
    if (mode === 'edit' && card) {
      setLoadingData(true)
      fetch(`${API}/cards/${card.id}/`, { headers: authH() })
        .then(r => r.json())
        .then(full => {
          setTitle(full.title)
          setDescription(full.description)
          setAssignedToId(String(full.assigned_to?.id ?? ''))
          setAssignedToUser(full.assigned_to ?? null)
          setChecklists(full.checklists ?? [])
          setLoadingData(false)
        })
        .catch(() => setLoadingData(false))
    }
  }, [mode, card, canEdit])

  // ── Card save ──────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!canEdit) return
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError('')
    try {
      const body = { title: title.trim(), description, assigned_to_id: assignedToId || null }

      const res = mode === 'create'
        ? await fetch(`${API}/cards/`, {
            method: 'POST', headers: jsonH(),
            body: JSON.stringify({ column_id: columnId, ...body }),
          })
        : await fetch(`${API}/cards/${card.id}/`, {
            method: 'PATCH', headers: jsonH(),
            body: JSON.stringify(body),
          })
      if (!res.ok) throw new Error()
      onSaved()
      onClose()
    } catch {
      setError('Failed to save card.')
    } finally {
      setSaving(false)
    }
  }

  // ── Checklist actions (immediate saves) ────────────────────────────────────
  async function addChecklist() {
    const trimmed = newCLName.trim()
    if (!trimmed) return
    const res = await fetch(`${API}/cards/${card.id}/checklists/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ name: trimmed }),
    })
    if (!res.ok) return
    const cl = await res.json()
    setChecklists(prev => [...prev, cl])
    setNewCLName('')
    setAddingCL(false)
  }

  async function renameChecklist(clId, name) {
    await fetch(`${API}/checklists/${clId}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ name }),
    })
    setChecklists(prev => prev.map(cl => cl.id === clId ? { ...cl, name } : cl))
  }

  async function deleteChecklist(clId) {
    if (!window.confirm('Delete this checklist and all its items?')) return
    const res = await fetch(`${API}/checklists/${clId}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) setChecklists(prev => prev.filter(cl => cl.id !== clId))
  }

  async function addItem(clId, text) {
    const res = await fetch(`${API}/checklists/${clId}/items/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ text }),
    })
    if (!res.ok) return
    const item = await res.json()
    setChecklists(prev => prev.map(cl =>
      cl.id === clId ? { ...cl, items: [...cl.items, item] } : cl
    ))
  }

  async function toggleItem(clId, item) {
    const res = await fetch(`${API}/items/${item.id}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ checked: !item.checked }),
    })
    if (!res.ok) return
    setChecklists(prev => prev.map(cl =>
      cl.id === clId
        ? { ...cl, items: cl.items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i) }
        : cl
    ))
  }

  async function renameItem(clId, itemId, text) {
    await fetch(`${API}/items/${itemId}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ text }),
    })
    setChecklists(prev => prev.map(cl =>
      cl.id === clId
        ? { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, text } : i) }
        : cl
    ))
  }

  async function deleteItem(clId, itemId) {
    const res = await fetch(`${API}/items/${itemId}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) {
      setChecklists(prev => prev.map(cl =>
        cl.id === clId ? { ...cl, items: cl.items.filter(i => i.id !== itemId) } : cl
      ))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${mode === 'edit' ? ' modal-large' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'Add Card' : canEdit ? 'Edit Card' : 'View Card'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form id="card-edit-form" onSubmit={handleSubmit} className="card-form">
          <label>Title {canEdit && <span className="required">*</span>}
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus={canEdit} required readOnly={!canEdit} />
          </label>

          <label>Description <span className="optional">(optional)</span>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} readOnly={!canEdit} />
          </label>

          {canEdit ? (
            <label>Assigned to <span className="optional">(optional)</span>
              <select
                value={String(assignedToId)}
                onChange={e => setAssignedToId(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {members.map(m => (
                  <option key={m.id} value={String(m.id)}>{m.full_name || m.username}</option>
                ))}
              </select>
            </label>
          ) : (
            assignedToUser && (
              <div className="assigned-readonly">
                <span className="assigned-label">Assigned to</span>
                <span className="assigned-value">{assignedToUser.full_name || assignedToUser.username}</span>
              </div>
            )
          )}
        </form>

        {/* Checklists — edit mode only */}
        {mode === 'edit' && (
          <div className="checklists-section">
            <div className="checklists-header">
              <span className="checklists-title">Checklists</span>
            </div>

            {loadingData && <p className="cl-loading">Loading…</p>}
            {!loadingData && checklists.length === 0 && !canEdit && (
              <p className="cl-loading">No checklists.</p>
            )}

            {checklists.map(cl => (
              <ChecklistBlock
                key={cl.id}
                cl={cl}
                canEdit={canEdit}
                onRename={renameChecklist}
                onDelete={deleteChecklist}
                onAddItem={addItem}
                onToggleItem={toggleItem}
                onRenameItem={renameItem}
                onDeleteItem={deleteItem}
              />
            ))}

            {/* Add checklist */}
            {canEdit && (addingCL ? (
              <div className="add-cl-row">
                <input
                  ref={newCLRef}
                  className="add-cl-input"
                  placeholder="Checklist name…"
                  value={newCLName}
                  onChange={e => setNewCLName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addChecklist(); if (e.key === 'Escape') { setAddingCL(false); setNewCLName('') } }}
                  autoFocus
                />
                <button type="button" onClick={addChecklist} disabled={!newCLName.trim()}>Add</button>
                <button type="button" className="secondary" onClick={() => { setAddingCL(false); setNewCLName('') }}>Cancel</button>
              </div>
            ) : (
              <button
                type="button"
                className="add-cl-btn"
                onClick={() => { setAddingCL(true); setTimeout(() => newCLRef.current?.focus(), 0) }}
              >+ Add Checklist</button>
            ))}
          </div>
        )}

        {/* Footer — always at bottom */}
        <div className="modal-footer">
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            {canEdit && (
              <button type="submit" form="card-edit-form" disabled={saving}>
                {saving ? 'Saving…' : mode === 'create' ? 'Add Card' : 'Save'}
              </button>
            )}
            <button type="button" className="secondary" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Name Modal (rename boards, create/rename columns) ─────────────────────────
function NameModal({ title, label, placeholder, initialValue, onClose, onSaved }) {
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!value.trim()) return
    setSaving(true)
    try { await onSaved(value.trim()) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          <label>{label}
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={placeholder}
              autoFocus
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !value.trim()}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── Board Create Modal (name + pick who can see it) ───────────────────────────
function BoardCreateModal({ currentUserId, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`${API}/members/`, { headers: authH() })
      .then(r => r.json())
      .then(data => setMembers(Array.isArray(data) ? data.filter(m => m.id !== currentUserId) : []))
      .catch(() => {})
  }, [currentUserId])

  function toggleMember(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onSaved(name.trim(), selectedIds) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Board</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          <label>Board name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sprint 1" autoFocus required />
          </label>
          <label>Who can see this board? <span className="optional">(optional — you can also share it later)</span></label>
          <div className="board-member-picker">
            {members.length === 0 && <p className="share-empty">No other team members yet.</p>}
            {members.map(m => (
              <label key={m.id} className="board-member-check-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                />
                {m.full_name || m.username}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create Board'}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── Share Modal (owner-only: visibility, link sharing, member management) ────
function ShareModal({ board, onClose, onUpdated }) {
  const [members, setMembers] = useState(board.members || [])
  const [visibility, setVisibility] = useState(board.visibility)
  const [linkEnabled, setLinkEnabled] = useState(board.link_sharing_enabled)
  const [shareToken, setShareToken] = useState(board.share_token || '')
  const [allUsers, setAllUsers] = useState([])
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`${API}/members/`, { headers: authH() })
      .then(r => r.json())
      .then(data => setAllUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  async function patchBoard(body) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/boards/${board.id}/`, {
        method: 'PATCH', headers: jsonH(), body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setVisibility(updated.visibility)
      setLinkEnabled(updated.link_sharing_enabled)
      setShareToken(updated.share_token || '')
      onUpdated()
    } catch {
      setError('Failed to update sharing settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerateLink() {
    setSaving(true)
    try {
      const res = await fetch(`${API}/boards/${board.id}/regenerate-link/`, { method: 'POST', headers: authH() })
      if (res.ok) {
        const data = await res.json()
        setShareToken(data.share_token)
        onUpdated()
      }
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    const link = `${window.location.origin}/kanban/shared/${shareToken}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function handleAddMember(e) {
    e.preventDefault()
    if (!addUserId) return
    setError('')
    const res = await fetch(`${API}/boards/${board.id}/members/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ user_id: addUserId, role: addRole }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to add member.')
      return
    }
    const membership = await res.json()
    setMembers(m => [...m, membership])
    setAddUserId('')
    setAddRole('view')
    onUpdated()
  }

  async function handleRoleChange(membershipId, role) {
    const res = await fetch(`${API}/boards/members/${membershipId}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setMembers(m => m.map(x => x.id === membershipId ? { ...x, role } : x))
      onUpdated()
    }
  }

  async function handleRemoveMember(membershipId) {
    const res = await fetch(`${API}/boards/members/${membershipId}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) {
      setMembers(m => m.filter(x => x.id !== membershipId))
      onUpdated()
    }
  }

  const addableUsers = allUsers.filter(u => u.id !== board.owner?.id && !members.some(m => m.user.id === u.id))
  const shareLink = shareToken ? `${window.location.origin}/kanban/shared/${shareToken}` : ''

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Share "{board.name}"</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="share-body">
          {error && <p className="form-error">{error}</p>}

          <div className="share-section">
            <label className="share-label">Visibility</label>
            <select value={visibility} onChange={e => patchBoard({ visibility: e.target.value })} disabled={saving}>
              <option value="private">Private</option>
              <option value="public">Public — visible to everyone</option>
            </select>
          </div>

          <div className="share-section">
            <label className="share-toggle-row">
              <input
                type="checkbox"
                checked={linkEnabled}
                disabled={saving}
                onChange={e => patchBoard({ link_sharing_enabled: e.target.checked })}
              />
              Anyone with the link can view
            </label>
            {linkEnabled && shareToken && (
              <div className="share-link-row">
                <input className="share-link-input" value={shareLink} readOnly onClick={e => e.target.select()} />
                <button type="button" className="secondary" onClick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
                <button type="button" className="secondary" onClick={handleRegenerateLink} disabled={saving}>Regenerate</button>
              </div>
            )}
          </div>

          <div className="share-section">
            <label className="share-label">Members</label>
            {members.length === 0 && <p className="share-empty">Not shared with anyone yet.</p>}
            {members.map(m => (
              <div key={m.id} className="share-member-row">
                <span className="share-member-name">{m.user.full_name || m.user.username}</span>
                <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value)}>
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                </select>
                <button className="icon-btn icon-btn-danger" onClick={() => handleRemoveMember(m.id)}>✕</button>
              </div>
            ))}

            <form onSubmit={handleAddMember} className="share-add-row">
              <select value={addUserId} onChange={e => setAddUserId(e.target.value)}>
                <option value="">— Add a person —</option>
                {addableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
              <select value={addRole} onChange={e => setAddRole(e.target.value)}>
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
              <button type="submit" disabled={!addUserId}>Add</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Main Kanban Page ──────────────────────────────────────────────────────────
function Kanban() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const { token } = useParams()
  const boardParam = searchParams.get('board')
  const isSharedView = !!token

  const [boards, setBoards]               = useState([])
  const [activeBoardId, setActiveBoardId] = useState(null)
  const [board, setBoard]                 = useState(null)
  const [loading, setLoading]             = useState(true)

  const [cardModal, setCardModal]     = useState(null)
  const [boardModal, setBoardModal]   = useState(null)
  const [colModal, setColModal]       = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)

  const dragRef    = useRef(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  // Prefer the freshly-fetched full `board` (kept up to date by fetchBoard(), including
  // after Share-modal changes) whenever it matches the active selection; fall back to the
  // board-list summary only during the brief window while switching boards. In shared-link
  // view there's no boards list at all, so the full board detail doubles as both.
  const headerBoard = isSharedView
    ? board
    : (board && board.id === activeBoardId ? board : boards.find(b => b.id === activeBoardId))
  const isOwner = headerBoard?.my_role === 'owner'
  const canEdit = isOwner || headerBoard?.my_role === 'edit'
  // Deleting a board or a card is narrower than editing: the board's owner, or an
  // org-wide manager — a plain editor can edit but not delete.
  const canDelete = isOwner || user?.groups?.includes('manager')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isSharedView) return
    fetch(`${API}/boards/`, { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setBoards(list)
        const requested = list.find(b => b.id === Number(boardParam))
        if (requested) setActiveBoardId(requested.id)
        else if (list.length > 0) setActiveBoardId(list[0].id)
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [boardParam, isSharedView])

  const fetchBoard = useCallback(() => {
    if (isSharedView) {
      setLoading(true)
      fetch(`${API}/boards/shared/${token}/`, { headers: authH() })
        .then(r => r.ok ? r.json() : null)
        .then(data => { setBoard(data); setLoading(false) })
        .catch(() => setLoading(false))
      return
    }
    if (!activeBoardId) return
    setLoading(true)
    fetch(`${API}/boards/${activeBoardId}/`, { headers: authH() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setBoard(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeBoardId, isSharedView, token])

  useEffect(() => { fetchBoard() }, [fetchBoard])

  // ── Board actions ──────────────────────────────────────────────────────────

  async function handleCreateBoard(name, memberIds) {
    const res = await fetch(`${API}/boards/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ name }),
    })
    if (!res.ok) return
    const created = await res.json()

    if (memberIds && memberIds.length > 0) {
      await Promise.all(memberIds.map(userId =>
        fetch(`${API}/boards/${created.id}/members/`, {
          method: 'POST', headers: jsonH(), body: JSON.stringify({ user_id: userId, role: 'view' }),
        })
      ))
    }

    setBoards(b => [...b, created])
    setActiveBoardId(created.id)
    setBoardModal(null)
  }

  async function handleRenameBoard(name) {
    const res = await fetch(`${API}/boards/${headerBoard.id}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ name }),
    })
    if (!res.ok) return
    const updated = await res.json()
    if (!isSharedView) setBoards(b => b.map(x => x.id === headerBoard.id ? updated : x))
    setBoard(bd => ({ ...bd, name: updated.name }))
    setBoardModal(null)
  }

  async function handleDeleteBoard() {
    if (!window.confirm(`Delete board "${headerBoard?.name}" and all its contents? This cannot be undone.`)) return
    const res = await fetch(`${API}/boards/${headerBoard.id}/`, { method: 'DELETE', headers: authH() })
    if (!res.ok) return
    if (isSharedView) {
      setBoard(null)
      return
    }
    const remaining = boards.filter(b => b.id !== headerBoard.id)
    setBoards(remaining)
    setBoard(null)
    setActiveBoardId(remaining.length > 0 ? remaining[0].id : null)
    if (remaining.length === 0) setLoading(false)
  }

  // ── Column actions ─────────────────────────────────────────────────────────

  async function handleCreateColumn(name) {
    const res = await fetch(`${API}/columns/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ board_id: board.id, name }),
    })
    if (!res.ok) return
    const col = await res.json()
    setBoard(bd => ({ ...bd, columns: [...bd.columns, col] }))
    setColModal(null)
  }

  async function handleRenameColumn(name) {
    const col = colModal.col
    const res = await fetch(`${API}/columns/${col.id}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ name }),
    })
    if (!res.ok) return
    setBoard(bd => ({ ...bd, columns: bd.columns.map(c => c.id === col.id ? { ...c, name } : c) }))
    setColModal(null)
  }

  async function handleDeleteColumn(col) {
    if (!window.confirm(`Delete column "${col.name}" and all its cards?`)) return
    const res = await fetch(`${API}/columns/${col.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) setBoard(bd => ({ ...bd, columns: bd.columns.filter(c => c.id !== col.id) }))
  }

  // ── Card actions ───────────────────────────────────────────────────────────

  async function handleDeleteCard(card, colId) {
    if (!window.confirm(`Delete card "${card.title}"?`)) return
    const res = await fetch(`${API}/cards/${card.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) {
      setBoard(bd => ({
        ...bd,
        columns: bd.columns.map(c =>
          c.id === colId ? { ...c, cards: c.cards.filter(x => x.id !== card.id) } : c
        ),
      }))
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  function onDragStart(cardId, sourceColId) {
    dragRef.current = { type: 'card', cardId, sourceColId }
  }

  function onColumnDragStart(columnId) {
    dragRef.current = { type: 'column', columnId }
  }

  async function onDrop(targetColId) {
    setDragOverCol(null)
    const dragged = dragRef.current
    dragRef.current = null
    if (!dragged) return

    if (dragged.type === 'column') {
      await onColumnDrop(dragged.columnId, targetColId)
      return
    }

    const { cardId, sourceColId } = dragged
    if (!cardId || sourceColId === targetColId) return

    const res = await fetch(`${API}/cards/${cardId}/`, {
      method: 'PATCH', headers: jsonH(), body: JSON.stringify({ column_id: targetColId }),
    })
    if (!res.ok) return

    setBoard(bd => {
      const srcCol = bd.columns.find(c => c.id === sourceColId)
      const card = srcCol?.cards.find(c => c.id === cardId)
      if (!card) return bd
      return {
        ...bd,
        columns: bd.columns.map(c => {
          if (c.id === sourceColId) return { ...c, cards: c.cards.filter(x => x.id !== cardId) }
          if (c.id === targetColId) return { ...c, cards: [...c.cards, card] }
          return c
        }),
      }
    })
  }

  async function onColumnDrop(draggedColId, targetColId) {
    if (draggedColId === targetColId) return

    const ids = board.columns.map(c => c.id)
    const without = ids.filter(id => id !== draggedColId)
    const targetIndex = without.indexOf(targetColId)
    without.splice(targetIndex, 0, draggedColId)

    setBoard(bd => ({ ...bd, columns: without.map(id => bd.columns.find(c => c.id === id)) }))

    await fetch(`${API}/columns/reorder/`, {
      method: 'POST', headers: jsonH(), body: JSON.stringify({ board_id: headerBoard.id, ordered_ids: without }),
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page kanban-page">
      <div className="kanban-header">
        <h1>Kanban Dashboard</h1>

        {!isSharedView && (
          <>
            <button className="new-board-btn" onClick={() => setBoardModal({ mode: 'create' })}>+ New Board</button>
            {isOwner && headerBoard && (
              <button className="secondary" onClick={() => setShowShareModal(true)}>Share Board</button>
            )}
          </>
        )}
        {isSharedView && isOwner && headerBoard && (
          <button className="secondary" onClick={() => setShowShareModal(true)}>Share Board</button>
        )}

        {!isSharedView && (
          <div className="board-select-row">
            <span className="board-select-label">Select a board</span>
            <select
              className="board-select"
              value={activeBoardId ?? ''}
              onChange={e => setActiveBoardId(Number(e.target.value))}
              disabled={boards.length === 0}
            >
              {boards.length === 0
                ? <option value="">No boards yet</option>
                : boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
              }
            </select>
          </div>
        )}

        {headerBoard && (
          <div className="board-title-row">
            <h3 className="board-active-name">{headerBoard.name}</h3>
            {canEdit && (
              <button className="secondary" onClick={() => setBoardModal({ mode: 'rename' })}>Rename</button>
            )}
            {canDelete && (
              <button className="kanban-btn-danger" onClick={handleDeleteBoard}>Delete Board</button>
            )}
          </div>
        )}

        {headerBoard && (
          <div className="board-meta-row">
            <p className="board-owner-line">
              Board Owner: {headerBoard.owner?.full_name || headerBoard.owner?.username || 'Unknown'}
            </p>
            <p className="board-shared-line">
              Shared with:{' '}
              {headerBoard.members && headerBoard.members.length > 0 ? (
                <span className="shared-badges">
                  {headerBoard.members.map(m => (
                    <span
                      key={m.id}
                      className="shared-badge"
                      title={m.user.full_name || m.user.username}
                    >
                      {initials(m.user.full_name || m.user.username)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="shared-empty-text">This board isn't shared with anyone</span>
              )}
            </p>
          </div>
        )}
      </div>

      {loading && <p className="kanban-empty">Loading…</p>}
      {!loading && !isSharedView && boards.length === 0 && (
        <p className="kanban-empty">No boards yet. Use "+ New Board" to create one.</p>
      )}
      {!loading && isSharedView && !board && (
        <p className="kanban-empty">This link is invalid or no longer shared.</p>
      )}

      {!loading && board && (
        <div className="kanban-board">
          {board.columns.map(col => (
            <div
              key={col.id}
              className={`kanban-column${dragOverCol === col.id ? ' drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null) }}
              onDrop={e => { e.preventDefault(); canEdit && onDrop(col.id) }}
            >
              <div
                className={`col-header${canEdit ? ' col-header-draggable' : ''}`}
                draggable={canEdit}
                onDragStart={() => canEdit && onColumnDragStart(col.id)}
                onDragEnd={() => { dragRef.current = null; setDragOverCol(null) }}
                title={canEdit ? 'Drag to reorder columns' : undefined}
              >
                {canEdit && <span className="col-drag-handle">⠿</span>}
                <span className="col-name">{col.name}</span>
                {canEdit && (
                  <div className="col-actions">
                    <button className="icon-btn" title="Rename column" onClick={() => setColModal({ mode: 'rename', col })}>✎</button>
                    <button className="icon-btn icon-btn-danger" title="Delete column" onClick={() => handleDeleteColumn(col)}>✕</button>
                  </div>
                )}
              </div>

              <div className="col-cards">
                {col.cards.length === 0 && <p className="col-empty">No cards</p>}
                {col.cards.map(card => (
                  <div
                    key={card.id}
                    className="kanban-card"
                    draggable={canEdit}
                    onDragStart={() => canEdit && onDragStart(card.id, col.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); canEdit && onDrop(col.id) }}
                    onDragEnd={() => { dragRef.current = null; setDragOverCol(null) }}
                  >
                    <div className="card-body">
                      <p className="card-title">{card.title}</p>
                      {card.description && <p className="card-desc">{card.description}</p>}
                      {(card.checklist_total > 0 || card.assigned_to) && (
                        <div className="card-meta">
                          {card.checklist_total > 0 && (
                            <span className={`card-cl-badge${card.checklist_done === card.checklist_total ? ' all-done' : ''}`}>
                              ✓ {card.checklist_done}/{card.checklist_total}
                            </span>
                          )}
                          {card.assigned_to && (
                            <span className="card-assignee" title={card.assigned_to.full_name}>
                              {initials(card.assigned_to.full_name || card.assigned_to.username)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="card-actions">
                      <button className="icon-btn" title={canEdit ? 'Edit card' : 'View card'} onClick={() => setCardModal({ mode: 'edit', card })}>✎</button>
                      {canDelete && (
                        <button className="icon-btn icon-btn-danger" title="Delete card" onClick={() => handleDeleteCard(card, col.id)}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {canEdit && (
                <button className="add-card-btn" onClick={() => setCardModal({ mode: 'create', columnId: col.id })}>
                  + Add Card
                </button>
              )}
            </div>
          ))}

          {canEdit && (
            <div className="kanban-add-col">
              <button className="add-col-btn" onClick={() => setColModal({ mode: 'create' })}>+ Add Column</button>
            </div>
          )}
        </div>
      )}

      {cardModal && (
        <CardModal
          mode={cardModal.mode}
          card={cardModal.card}
          columnId={cardModal.columnId}
          canEdit={canEdit}
          onClose={() => setCardModal(null)}
          onSaved={fetchBoard}
        />
      )}

      {boardModal?.mode === 'create' && (
        <BoardCreateModal currentUserId={user?.id} onClose={() => setBoardModal(null)} onSaved={handleCreateBoard} />
      )}
      {boardModal?.mode === 'rename' && (
        <NameModal title="Rename Board" label="Board name" initialValue={headerBoard?.name}
          onClose={() => setBoardModal(null)} onSaved={handleRenameBoard} />
      )}
      {colModal?.mode === 'create' && (
        <NameModal title="New Column" label="Column name" placeholder="e.g. To Do"
          onClose={() => setColModal(null)} onSaved={handleCreateColumn} />
      )}
      {colModal?.mode === 'rename' && (
        <NameModal title="Rename Column" label="Column name" initialValue={colModal.col?.name}
          onClose={() => setColModal(null)} onSaved={handleRenameColumn} />
      )}

      {showShareModal && headerBoard && (
        <ShareModal board={headerBoard} onClose={() => setShowShareModal(false)} onUpdated={fetchBoard} />
      )}
    </div>
  )
}

export default Kanban

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Check } from 'lucide-react'
import { isMarkdownFile, markdownViewerPath } from '../utils/markdown'
import './TeamResources.css'

const API = '/api/team-resources'
const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })

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

function fileExt(name) {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '—' : name.slice(idx + 1).toUpperCase()
}

function compareValues(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// ── Archive (manager-only — soft-deleted documents, kept 60 days) ──────────────
function ArchiveModal({ onClose, onChanged }) {
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchArchive = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/archive/`, { headers: authH() })
      if (!res.ok) throw new Error()
      setArchived(await res.json())
    } catch {
      setError('Failed to load archive.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchArchive() }, [fetchArchive])

  async function handleRestore(resource) {
    const res = await fetch(`${API}/${resource.id}/restore/`, { method: 'POST', headers: authH() })
    if (res.ok) {
      setArchived(list => list.filter(r => r.id !== resource.id))
      onChanged()
    }
  }

  async function handlePurge(resource) {
    if (!window.confirm(`Permanently delete "${resource.name}"? This cannot be undone.`)) return
    const res = await fetch(`${API}/${resource.id}/purge/`, { method: 'DELETE', headers: authH() })
    if (res.ok) setArchived(list => list.filter(r => r.id !== resource.id))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tr-md-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Archive</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tr-md-body">
          <p className="tr-subtitle">Deleted documents are kept here for 60 days before being permanently removed.</p>

          {loading && <p className="tr-empty">Loading…</p>}
          {error && <p className="form-error">{error}</p>}
          {!loading && !error && archived.length === 0 && (
            <p className="tr-empty">Archive is empty.</p>
          )}
          {!loading && !error && archived.length > 0 && (
            <table className="tr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Uploaded By</th>
                  <th>Archived</th>
                  <th>Purges On</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archived.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.uploaded_by?.full_name || 'Unknown'}</td>
                    <td className="tr-doc-meta">{fmtDate(r.archived_at)}</td>
                    <td className="tr-doc-meta">{fmtDate(r.purge_at)}</td>
                    <td>
                      <div className="tr-archive-actions">
                        <button className="secondary" onClick={() => handleRestore(r)}>Restore</button>
                        <button className="tr-delete-btn" onClick={() => handlePurge(r)}>Delete Permanently</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamResources({ isManager }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [sortKey, setSortKey] = useState('uploaded_at')
  const [sortDir, setSortDir] = useState('desc')
  const fileInputRef = useRef(null)

  const fetchResources = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/`, { headers: authH() })
      setResources(res.ok ? await res.json() : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchResources() }, [fetchResources])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/`, { method: 'POST', headers: authH(), body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed.')
      }
      await fetchResources()
    } catch (err) {
      setUploadError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleArchive(resource) {
    if (!window.confirm(`Move "${resource.name}" to the archive? Managers can restore it within 60 days.`)) return
    const res = await fetch(`${API}/${resource.id}/`, { method: 'DELETE', headers: authH() })
    if (res.ok) setResources(list => list.filter(r => r.id !== resource.id))
  }

  async function handleCopyLink(resource) {
    const url = resource.url.startsWith('http') ? resource.url : `${window.location.origin}${resource.url}`
    try {
      if (!navigator.clipboard) throw new Error('no clipboard api')
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* clipboard unavailable, nothing more we can do */ }
      document.body.removeChild(ta)
    }
    setCopiedId(resource.id)
    setTimeout(() => setCopiedId(id => (id === resource.id ? null : id)), 1500)
  }

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function sortArrow(key) {
    if (key !== sortKey) return null
    return <span className="tr-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const displayedResources = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const filtered = q
      ? resources.filter(r => {
          const uploader = (r.uploaded_by?.full_name || r.uploaded_by?.username || '').toLowerCase()
          return r.name.toLowerCase().includes(q) || uploader.includes(q)
        })
      : resources

    const sortValue = r => {
      switch (sortKey) {
        case 'name':        return r.name.toLowerCase()
        case 'type':        return fileExt(r.name)
        case 'uploaded_by': return (r.uploaded_by?.full_name || r.uploaded_by?.username || '').toLowerCase()
        default:             return r.uploaded_at
      }
    }

    return [...filtered].sort((a, b) => {
      const cmp = compareValues(sortValue(a), sortValue(b))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [resources, filterText, sortKey, sortDir])

  return (
    <div className="page tr-page">
      <div className="tr-header">
        <h1>Team Resources</h1>
        {isManager && (
          <div className="tr-header-actions">
            <button className="secondary" onClick={() => setShowArchive(true)}>Archive</button>
            <button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? 'Uploading…' : '+ Upload Document'}
            </button>
            <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
          </div>
        )}
      </div>

      <p className="tr-subtitle">Guidelines, onboarding material, and other knowledge base documents for the team.</p>

      {uploadError && <p className="form-error">{uploadError}</p>}

      {loading && <p className="tr-empty">Loading…</p>}
      {!loading && resources.length === 0 && (
        <p className="tr-empty">No documents yet.{isManager ? ' Use "+ Upload Document" to add one.' : ''}</p>
      )}

      {!loading && resources.length > 0 && (
        <>
          <input
            className="tr-filter-input"
            type="text"
            placeholder="Filter by name or uploader…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />

          {displayedResources.length === 0 ? (
            <p className="tr-empty">No documents match "{filterText}".</p>
          ) : (
            <table className="tr-table">
              <thead>
                <tr>
                  <th className="tr-th-sortable" onClick={() => handleSort('name')}>Name {sortArrow('name')}</th>
                  <th className="tr-th-sortable" onClick={() => handleSort('type')}>Type {sortArrow('type')}</th>
                  <th className="tr-th-sortable" onClick={() => handleSort('uploaded_by')}>Uploaded By {sortArrow('uploaded_by')}</th>
                  <th className="tr-th-sortable" onClick={() => handleSort('uploaded_at')}>Uploaded {sortArrow('uploaded_at')}</th>
                  <th className="tr-th-actions">Share</th>
                  {isManager && <th className="tr-th-delete"></th>}
                </tr>
              </thead>
              <tbody>
                {displayedResources.map(r => (
                  <tr key={r.id}>
                    <td>
                      {isMarkdownFile(r.name) ? (
                        <Link
                          className="tr-doc-link"
                          to={markdownViewerPath({ url: r.url, name: r.name, back: '/team-resources', backLabel: 'Team Resources' })}
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
                      )}
                    </td>
                    <td><span className="tr-type-badge">{fileExt(r.name)}</span></td>
                    <td>{r.uploaded_by?.full_name || 'Unknown'}</td>
                    <td className="tr-doc-meta">{fmtDate(r.uploaded_at)}</td>
                    <td>
                      <button
                        className={`icon-btn tr-copy-btn${copiedId === r.id ? ' copied' : ''}`}
                        title="Copy link"
                        onClick={() => handleCopyLink(r)}
                      >
                        {copiedId === r.id ? <Check size={14} /> : <Link2 size={14} />}
                      </button>
                    </td>
                    {isManager && (
                      <td>
                        <button className="tr-delete-btn" onClick={() => handleArchive(r)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {showArchive && (
        <ArchiveModal onClose={() => setShowArchive(false)} onChanged={fetchResources} />
      )}
    </div>
  )
}

export default TeamResources

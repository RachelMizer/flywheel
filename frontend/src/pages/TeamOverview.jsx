import { useState, useEffect, useCallback } from 'react'
import './TeamOverview.css'

const authH = () => ({ Authorization: `Token ${localStorage.getItem('token')}` })

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ── Overview Card ─────────────────────────────────────────────────────────────
function OverviewCard({ card }) {
  const hasChecklist = card.checklist_total > 0
  const allDone = hasChecklist && card.checklist_done === card.checklist_total

  return (
    <div className="ov-card">
      <div className="ov-card-context">
        <span className="ov-board">{card.board}</span>
        <span className="ov-sep">›</span>
        <span className="ov-column">{card.column}</span>
      </div>
      <p className="ov-card-title">{card.title}</p>
      {card.description && <p className="ov-card-desc">{card.description}</p>}
      {hasChecklist && (
        <span className={`ov-cl-badge${allDone ? ' all-done' : ''}`}>
          ✓ {card.checklist_done}/{card.checklist_total}
        </span>
      )}
    </div>
  )
}

// ── User Lane ─────────────────────────────────────────────────────────────────
function UserLane({ user, cards }) {
  return (
    <section className="ov-lane">
      <div className="ov-lane-header">
        <div className="ov-avatar">{initials(user.full_name || user.username)}</div>
        <div className="ov-user-info">
          <span className="ov-user-name">{user.full_name || user.username}</span>
          <span className="ov-card-count">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="ov-cards-strip">
        {cards.map(c => <OverviewCard key={c.id} card={c} />)}
      </div>
    </section>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function TeamOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/kanban/overview/', { headers: authH() })
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Failed to load overview.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  const totalAssigned = data?.assigned.reduce((n, lane) => n + lane.cards.length, 0) ?? 0

  return (
    <div className="page ov-page">
      <div className="ov-header">
        <h1>Team Overview</h1>
        <button className="secondary" onClick={fetchOverview}>Refresh</button>
      </div>

      {loading && <p className="ov-empty">Loading…</p>}
      {error  && <p className="ov-empty">{error}</p>}

      {!loading && data && (
        <>
          <div className="ov-summary">
            <div className="ov-summary-stat">
              <span className="ov-stat-value">{data.assigned.length}</span>
              <span className="ov-stat-label">Team members with cards</span>
            </div>
            <div className="ov-summary-stat">
              <span className="ov-stat-value">{totalAssigned}</span>
              <span className="ov-stat-label">Assigned cards</span>
            </div>
            <div className="ov-summary-stat">
              <span className="ov-stat-value">{data.unassigned.length}</span>
              <span className="ov-stat-label">Unassigned cards</span>
            </div>
          </div>

          {data.assigned.length === 0 && data.unassigned.length === 0 && (
            <p className="ov-empty">No cards exist yet across any boards.</p>
          )}

          {data.assigned.map(lane => (
            <UserLane key={lane.user.id} user={lane.user} cards={lane.cards} />
          ))}

          {data.unassigned.length > 0 && (
            <section className="ov-lane ov-lane-unassigned">
              <div className="ov-lane-header">
                <div className="ov-avatar ov-avatar-unassigned">?</div>
                <div className="ov-user-info">
                  <span className="ov-user-name">Unassigned</span>
                  <span className="ov-card-count">{data.unassigned.length} card{data.unassigned.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="ov-cards-strip">
                {data.unassigned.map(c => <OverviewCard key={c.id} card={c} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default TeamOverview

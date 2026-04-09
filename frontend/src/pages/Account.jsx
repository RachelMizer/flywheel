import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './Account.css'

function Account() {
  const { user, updateUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [saved, setSaved] = useState(false)

  function startEdit() {
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
    })
    setEditing(true)
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    await updateUser(form)
    setEditing(false)
    setSaved(true)
  }

  if (!user) return null

  const joined = new Date(user.date_joined).toLocaleDateString()

  return (
    <div className="page account">
      <h2>Account</h2>

      <div className="account-card">
        <div className="account-row">
          <span className="account-label">Username</span>
          <span>{user.username}</span>
        </div>
        <div className="account-row">
          <span className="account-label">Role</span>
          <span className={`role-badge role-${user.role}`}>{user.role}</span>
        </div>
        <div className="account-row">
          <span className="account-label">Member since</span>
          <span>{joined}</span>
        </div>

        {editing ? (
          <form className="account-edit-form" onSubmit={handleSave}>
            <label>
              First name
              <input
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              />
            </label>
            <label>
              Last name
              <input
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </label>
            <div className="account-edit-actions">
              <button type="submit">Save</button>
              <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="account-row">
              <span className="account-label">First name</span>
              <span>{user.first_name || '—'}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Last name</span>
              <span>{user.last_name || '—'}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Email</span>
              <span>{user.email || '—'}</span>
            </div>
            <div className="account-actions">
              {saved && <span className="account-saved">Changes saved.</span>}
              <button onClick={startEdit}>Edit details</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Account

import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetch('/api/auth/me/', {
        headers: { Authorization: `Token ${token}` },
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setUser(data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(username, password) {
    const res = await fetch('/api/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error('Invalid credentials')
    const data = await res.json()
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  async function logout() {
    const token = localStorage.getItem('token')
    await fetch('/api/auth/logout/', {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
    })
    localStorage.removeItem('token')
    setUser(null)
  }

  async function updateUser(fields) {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/auth/me/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error('Update failed')
    const updated = await res.json()
    setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

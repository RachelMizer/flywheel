import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import DockerManager from './pages/DockerManager'
import Kanban from './pages/Kanban'
import Tickets from './pages/Tickets'
import Messages from './pages/Messages'
import Account from './pages/Account'
import SupportDashboard from './pages/SupportDashboard'
import Login from './pages/Login'
import './App.css'

function ProtectedApp() {
  const { user, loading, logout } = useAuth()

  if (loading) return <div className="app-loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />

  const displayName = user.first_name || user.username
  const isSupport = user.groups?.includes('support') || user.groups?.includes('support-admin') || user.is_staff

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">FlyWheel</div>
        <div className="sidebar-greeting">Hello, {displayName}!</div>

        <nav className="sidebar-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/docker">Docker</NavLink>
          <NavLink to="/kanban">Kanban</NavLink>
          <NavLink to="/tickets">Tickets</NavLink>
          {isSupport && <NavLink to="/support">Support</NavLink>}
          <NavLink to="/messages">Messages</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>

        <button className="sidebar-logout" onClick={logout}>Sign Out</button>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/docker" element={<DockerManager />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/support" element={<SupportDashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

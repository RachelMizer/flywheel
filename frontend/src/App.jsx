import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Kanban as KanbanIcon, Code2, Users, BookOpen } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import DockerManager from './pages/DockerManager'
import Kanban from './pages/Kanban'
import ProjectPlanning from './pages/ProjectPlanning'
import ProjectDetail from './pages/ProjectDetail'
import ProjectTimeline from './pages/ProjectTimeline'
import BacklogDashboard from './pages/BacklogDashboard'
import ProjectBacklog from './pages/ProjectBacklog'
import SprintBacklog from './pages/SprintBacklog'
import Account from './pages/Account'
import TeamOverview from './pages/TeamOverview'
import TeamResources from './pages/TeamResources'
import Login from './pages/Login'
import './App.css'


function ProtectedApp() {
  const { user, loading, logout } = useAuth()

  if (loading) return <div className="app-loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />

  const displayName = user.first_name || user.username
  const isManager = user.groups?.includes('manager')

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo_on_drk.png" alt="FlyWheel" className="sidebar-logo-img" />
        </div>
        <div className="sidebar-greeting">Hello, {displayName}!</div>

        <nav className="sidebar-nav">
          <NavLink to="/" end>Dashboard</NavLink>

          <span className="nav-label"><KanbanIcon size={15} />PROJECT MANAGEMENT</span>
          <NavLink to="/kanban">Kanban</NavLink>
          <NavLink to="/projects">Project Planning</NavLink>

          <span className="nav-label"><Code2 size={15} />Development</span>
          <NavLink to="/docker">Docker</NavLink>

          <span className="nav-label"><BookOpen size={15} />Team Resources</span>
          <NavLink to="/team-resources">Knowledge Base</NavLink>

          {isManager && (
            <>
              <span className="nav-label"><Users size={15} />Team Management</span>
              <NavLink to="/team">Team Overview</NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <NavLink to="/account" className={({ isActive }) => `sidebar-account-link${isActive ? ' active' : ''}`}>
            Account Settings
          </NavLink>
          <button className="sidebar-logout" onClick={logout}>Sign Out</button>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/docker" element={<DockerManager />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/kanban/shared/:token" element={<Kanban />} />
          <Route path="/projects" element={<ProjectPlanning isManager={isManager} />} />
          <Route path="/projects/:projectId" element={<ProjectDetail isManager={isManager} />} />
          <Route path="/projects/:projectId/timeline" element={<ProjectTimeline isManager={isManager} />} />
          <Route path="/projects/:projectId/backlog" element={<BacklogDashboard isManager={isManager} />} />
          <Route path="/projects/:projectId/backlog/project" element={<ProjectBacklog isManager={isManager} />} />
          <Route path="/projects/:projectId/backlog/sprint/:sprintId" element={<SprintBacklog isManager={isManager} />} />
          <Route path="/team" element={isManager ? <TeamOverview /> : <Navigate to="/" replace />} />
          <Route path="/team-resources" element={<TeamResources isManager={isManager} />} />
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

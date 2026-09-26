import { Spin } from 'antd'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import OrgLayout from './components/OrgLayout'
import LoginPage from './pages/LoginPage'
import OrganizationsPage from './pages/OrganizationsPage'
import UsersPage from './pages/UsersPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth()
  const location = useLocation()
  if (initializing) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/orgs" element={<RequireAuth><OrganizationsPage /></RequireAuth>} />
      <Route path="/orgs/:orgId" element={<RequireAuth><OrgLayout /></RequireAuth>}>
        <Route index element={<Navigate to="users" replace />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/orgs" replace />} />
    </Routes>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStorage } from '../api/client'
import type { TokenResponse, UserBrief } from '../api/types'

interface AuthState {
  user: UserBrief | null
  isAuthenticated: boolean
  initializing: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<UserBrief | null>(null)
  const [initializing, setInitializing] = useState(() => !!tokenStorage.get())

  const logout = useCallback(() => {
    tokenStorage.set(null)
    setUser(null)
    qc.clear() // данные одной сессии не должны утечь в другую
  }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStorage.get()) return
    api<UserBrief>('/auth/me')
      .then(setUser)
      .catch(() => logout())
      .finally(() => setInitializing(false))
  }, [logout])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<TokenResponse>('/auth/login', { method: 'POST', body: { email, password } })
    tokenStorage.set(res.access_token)
    setUser(res.user)
  }, [])

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, initializing, login, logout }),
    [user, initializing, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

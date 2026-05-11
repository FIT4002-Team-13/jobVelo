import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api.js'
import { clearAuth, readAuth, writeAuth } from './authStore.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readAuth()?.user ?? null)
  const [bootstrapped, setBootstrapped] = useState(false)

  // On boot, if we have a token, verify it's still valid by fetching /me.
  // If the token has expired or the user was deleted, clear everything.
  useEffect(() => {
    const cached = readAuth()
    if (!cached?.token) {
      setBootstrapped(true)
      return
    }
    let cancelled = false
    api.me()
      .then((fresh) => {
        if (cancelled) return
        setUser(fresh)
        writeAuth({ token: cached.token, user: fresh })
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          setUser(null)
        }
      })
      .finally(() => !cancelled && setBootstrapped(true))
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (identifier, password) => {
    const res = await api.login({ identifier, password })
    writeAuth({ token: res.access_token, user: res.user })
    setUser(res.user)
    return res.user
  }, [])

  // Used by flows that already have a token (e.g. /signup-company auto-logs
  // the new admin in). Skips the login round-trip.
  const applySession = useCallback(({ token, user }) => {
    writeAuth({ token, user })
    setUser(user)
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, bootstrapped, login, applySession, logout }),
    [user, bootstrapped, login, applySession, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

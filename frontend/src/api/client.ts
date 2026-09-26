const API_URL = import.meta.env.VITE_API_URL ?? '/api'
const TOKEN_KEY = 'org-users.token'

export const tokenStorage = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* private mode — работаем без сохранения */
    }
  },
}

export interface ApiErrorDetail {
  field?: string
  message?: string
  [key: string]: unknown
}

/** Ошибка API в едином формате backend: { error: { code, message, details } } */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  /** Ошибки валидации полей → { field: message } для подсветки в форме */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {}
    if (Array.isArray(this.details)) {
      for (const d of this.details as ApiErrorDetail[]) {
        if (d.field) result[d.field.split('.')[0]] = d.message ?? this.message
      }
    } else if (this.details && typeof this.details === 'object' && 'field' in this.details) {
      result[String((this.details as ApiErrorDetail).field)] = this.message
    }
    return result
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

type Query = Record<string, string | number | string[] | undefined | null>

function buildQuery(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, v))
    else sp.append(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  const token = tokenStorage.get()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'Сервер недоступен. Проверьте подключение.')
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = data?.error
    if (res.status === 401 && path !== '/auth/login') onUnauthorized?.()
    throw new ApiError(
      res.status,
      err?.code ?? 'unknown_error',
      err?.message ?? `Ошибка сервера (${res.status})`,
      err?.details,
    )
  }
  return data as T
}

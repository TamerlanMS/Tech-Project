import { Alert, Button, Form, Input } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import ThemeSwitch from '../theme/ThemeSwitch'

const DEMO = [
  { email: 'ivan@example.com', hint: 'Администратор · Менеджер · Сотрудник — в трёх компаниях' },
  { email: 'owner.alpha@example.com', hint: 'Владелец «Альфа Трейд»' },
]

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form] = Form.useForm()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/orgs" replace />

  const onFinish = async (v: { email: string; password: string }) => {
    setError(null)
    setLoading(true)
    try {
      await login(v.email, v.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/orgs', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось войти')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <section className="auth__side">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
          <span className="monogram">M</span> Multiorg
        </div>
        <h1 className="auth__claim">
          Одна учётная запись.<br />Несколько компаний.<br /><em>Своя роль в каждой.</em>
        </h1>
        <div className="muted" style={{ fontSize: 13 }}>Модуль «Пользователи организации» · тестовое задание</div>
      </section>

      <section className="auth__form">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}><ThemeSwitch /></div>
          <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Вход</h2>
          <p className="muted" style={{ margin: '0 0 24px' }}>Используйте рабочий email.</p>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Введите email' }]}>
              <Input size="large" autoComplete="username" autoFocus placeholder="name@company.kz" />
            </Form.Item>
            <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>Войти</Button>
          </Form>

          <div className="rail__section" style={{ padding: '32px 0 0' }}>Демо-доступ · пароль password123</div>
          {DEMO.map((d) => (
            <button key={d.email} type="button" className="demo-acc"
              onClick={() => form.setFieldsValue({ email: d.email, password: 'password123' })}>
              <div className="demo-acc__mail">{d.email}</div>
              <div className="demo-acc__hint">{d.hint}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

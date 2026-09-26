import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

const DEMO = [
  { email: 'ivan@example.com', hint: 'Админ в «Альфа», менеджер в «Бета», сотрудник в «Гамма»' },
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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f5f5', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>Вход в платформу</Typography.Title>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Введите email' }]}>
            <Input prefix={<MailOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>Войти</Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 20, marginBottom: 4, fontSize: 13 }}>
          Демо-аккаунты (пароль <Typography.Text code>password123</Typography.Text>):
        </Typography.Paragraph>
        {DEMO.map((d) => (
          <div key={d.email} style={{ fontSize: 13, marginBottom: 4 }}>
            <Typography.Link onClick={() => form.setFieldsValue({ email: d.email, password: 'password123' })}>
              {d.email}
            </Typography.Link>
            <Typography.Text type="secondary"> — {d.hint}</Typography.Text>
          </div>
        ))}
      </Card>
    </div>
  )
}

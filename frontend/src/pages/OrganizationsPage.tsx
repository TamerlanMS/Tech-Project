import { ApartmentOutlined, LogoutOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Result, Skeleton, Typography } from 'antd'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMyOrganizations } from '../api/hooks'
import { useAuth } from '../auth/AuthContext'
import { RoleTag } from '../lib/format'

/** Выбор организации. Показываются только те, в которых пользователь состоит. */
export default function OrganizationsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useMyOrganizations()

  if (data?.length === 1) return <Navigate to={`/orgs/${data[0].id}/users`} replace />

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '48px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography.Title level={3}>Выберите организацию</Typography.Title>
          <Button type="text" icon={<LogoutOutlined />} onClick={logout}>Выйти</Button>
        </div>
        <Typography.Paragraph type="secondary">{user?.full_name}, у вас есть доступ к следующим организациям:</Typography.Paragraph>
        <Card styles={{ body: { padding: 0 } }}>
          {isLoading ? (
            <div style={{ padding: 24 }}><Skeleton active /></div>
          ) : isError ? (
            <Result status="error" title="Не удалось загрузить организации" subTitle={error.message}
              extra={<Button onClick={() => refetch()}>Повторить</Button>} />
          ) : !data?.length ? (
            <Empty style={{ padding: 32 }} description="Вы пока не состоите ни в одной организации" />
          ) : (
            data.map((org, i) => (
              <button
                key={org.id}
                type="button"
                className="org-item"
                style={{ borderTop: i ? '1px solid #f0f0f0' : 'none' }}
                onClick={() => navigate(`/orgs/${org.id}/users`)}
              >
                <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{org.name}</div>
                  <RoleTag role={org.role} />
                </span>
                <RightOutlined style={{ color: '#bfbfbf' }} />
              </button>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}

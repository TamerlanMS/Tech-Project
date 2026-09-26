import { ArrowRightOutlined, LogoutOutlined } from '@ant-design/icons'
import { Button, Empty, Result, Skeleton } from 'antd'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMyOrganizations } from '../api/hooks'
import { useAuth } from '../auth/AuthContext'
import { RoleTag } from '../lib/format'
import ThemeSwitch from '../theme/ThemeSwitch'

/** Выбор организации. Показываются только те, в которых пользователь состоит. */
export default function OrganizationsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useMyOrganizations()

  if (data?.length === 1) return <Navigate to={`/orgs/${data[0].id}/users`} replace />

  return (
    <div style={{ minHeight: '100vh', padding: '64px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <ThemeSwitch />
          <Button type="text" icon={<LogoutOutlined />} onClick={logout}>Выйти</Button>
        </div>
        <div className="crumbs">{user?.full_name}</div>
        <h1 className="page-title" style={{ marginBottom: 8 }}>Где работаем сегодня?</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
          Один аккаунт — несколько организаций. Права действуют в пределах выбранной.
        </p>
        <div className="sheet">
          {isLoading ? (
            <div style={{ padding: 24 }}><Skeleton active /></div>
          ) : isError ? (
            <Result status="error" title="Не удалось загрузить организации" subTitle={error.message}
              extra={<Button onClick={() => refetch()}>Повторить</Button>} />
          ) : !data?.length ? (
            <Empty style={{ padding: 32 }} description="Вы пока не состоите ни в одной организации" />
          ) : (
            data.map((org) => (
              <button key={org.id} type="button" className="org-row" onClick={() => navigate(`/orgs/${org.id}/users`)}>
                <span className="monogram" style={{ width: 40, height: 40, fontSize: 18 }}>{org.name[0]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{org.name}</div>
                  <RoleTag role={org.role} />
                </span>
                <ArrowRightOutlined className="org-row__arrow" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

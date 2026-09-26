import {
  AppstoreOutlined,
  BarChartOutlined,
  DownOutlined,
  InboxOutlined,
  LogoutOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Grid, Layout, Menu, Result, Select, Spin, Typography } from 'antd'
import { createContext, useContext, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useMyOrganizations, useOrganization } from '../api/hooks'
import type { Organization } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { UserAvatar } from '../lib/format'

const OrgContext = createContext<Organization | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentOrg(): Organization {
  const org = useContext(OrgContext)
  if (!org) throw new Error('useCurrentOrg outside OrgLayout')
  return org
}

export default function OrgLayout() {
  const { orgId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const screens = Grid.useBreakpoint()
  const orgQuery = useOrganization(orgId)
  const myOrgs = useMyOrganizations()

  if (orgQuery.isLoading) {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  }
  if (orgQuery.isError) {
    const e = orgQuery.error
    const notFound = e instanceof ApiError && (e.status === 404 || e.status === 403)
    return (
      <Result
        status={notFound ? '404' : 'error'}
        title={notFound ? 'Организация недоступна' : 'Ошибка загрузки'}
        subTitle={e.message}
        extra={[
          <Button key="orgs" type="primary" onClick={() => navigate('/orgs')}>К списку организаций</Button>,
          !notFound && <Button key="retry" onClick={() => orgQuery.refetch()}>Повторить</Button>,
        ]}
      />
    )
  }
  const org = orgQuery.data!
  const enabled = new Set(org.modules)

  // Меню собирается из подключённых модулей организации
  const menuItems = [
    { key: 'users', icon: <TeamOutlined />, label: 'Пользователи' },
    enabled.has('crm') && { key: 'crm', icon: <BarChartOutlined />, label: 'CRM', disabled: true },
    enabled.has('warehouse') && { key: 'warehouse', icon: <InboxOutlined />, label: 'Склад', disabled: true },
  ].filter(Boolean) as { key: string; icon: ReactNode; label: string; disabled?: boolean }[]

  const selected = location.pathname.split('/')[3] ?? 'users'

  return (
    <OrgContext.Provider value={org}>
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Sider breakpoint="lg" collapsedWidth={0} width={220} theme="light"
          zeroWidthTriggerStyle={{ top: 12, borderRadius: '0 8px 8px 0' }}
          style={{ borderRight: '1px solid #f0f0f0' }}>
          <div style={{ padding: '18px 20px', fontWeight: 600, fontSize: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <AppstoreOutlined style={{ color: '#1677ff' }} /> B2B Platform
          </div>
          <Menu mode="inline" selectedKeys={[selected]} items={menuItems}
            onClick={({ key }) => navigate(`/orgs/${org.id}/${key}`)} style={{ borderInlineEnd: 0 }} />
        </Layout.Sider>
        <Layout>
          <Layout.Header style={{
            background: '#fff', borderBottom: '1px solid #f0f0f0', padding: screens.lg ? '0 16px' : '0 16px 0 56px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <Select
              value={org.id}
              style={{ minWidth: 200, maxWidth: 320 }}
              suffixIcon={<SwapOutlined />}
              loading={myOrgs.isLoading}
              options={(myOrgs.data ?? [{ id: org.id, name: org.name }]).map((o) => ({ value: o.id, label: o.name }))}
              onChange={(id) => navigate(`/orgs/${id}/users`)}
              aria-label="Организация"
            />
            <Dropdown menu={{ items: [
              { key: 'orgs', icon: <SwapOutlined />, label: 'Все организации', onClick: () => navigate('/orgs') },
              { type: 'divider' },
              { key: 'logout', icon: <LogoutOutlined />, label: 'Выйти', danger: true, onClick: logout },
            ] }}>
              <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40 }}>
                <UserAvatar name={user?.full_name ?? '?'} size={28} />
                {screens.md && (
                  <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                    <div>{user?.full_name}</div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{org.role.name}</Typography.Text>
                  </span>
                )}
                <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
          </Layout.Header>
          <Layout.Content style={{ padding: screens.md ? 24 : 12 }}>
            <Outlet />
          </Layout.Content>
        </Layout>
      </Layout>
    </OrgContext.Provider>
  )
}

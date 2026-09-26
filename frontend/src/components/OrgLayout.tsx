import {
  BarChartOutlined,
  CheckOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Dropdown, Result, Spin, Tooltip } from 'antd'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useMyOrganizations, useOrganization } from '../api/hooks'
import type { Organization } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { UserAvatar } from '../lib/format'
import ThemeSwitch from '../theme/ThemeSwitch'

const OrgContext = createContext<Organization | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentOrg(): Organization {
  const org = useContext(OrgContext)
  if (!org) throw new Error('useCurrentOrg outside OrgLayout')
  return org
}

interface NavItem {
  key: string
  label: string
  icon: ReactNode
  module: string
  ready: boolean
}

// Пункты меню = модули платформы; показываются только подключённые организацией
const NAV: NavItem[] = [
  { key: 'users', label: 'Пользователи', icon: <TeamOutlined />, module: 'core', ready: true },
  { key: 'crm', label: 'CRM', icon: <BarChartOutlined />, module: 'crm', ready: false },
  { key: 'warehouse', label: 'Склад', icon: <InboxOutlined />, module: 'warehouse', ready: false },
]

function Rail({ org, onNavigate }: { org: Organization; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const myOrgs = useMyOrganizations()
  const current = location.pathname.split('/')[3] ?? 'users'
  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  const orgMenu = [
    ...(myOrgs.data ?? []).map((o) => ({
      key: o.id,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
          <span className="monogram" style={{ width: 24, height: 24, fontSize: 12 }}>{o.name[0]}</span>
          <span style={{ flex: 1 }}>
            <div>{o.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{o.role.name}</div>
          </span>
          {o.id === org.id && <CheckOutlined />}
        </div>
      ),
      onClick: () => go(`/orgs/${o.id}/users`),
    })),
    { type: 'divider' as const },
    { key: 'all', icon: <SwapOutlined />, label: 'Все организации', onClick: () => go('/orgs') },
  ]

  return (
    <>
      <Dropdown menu={{ items: orgMenu }} trigger={['click']}>
        <button type="button" className="rail__org" aria-label="Сменить организацию">
          <span className="monogram">{org.name[0]}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{org.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>Организация</div>
          </span>
          <SwapOutlined className="muted" />
        </button>
      </Dropdown>

      <div className="rail__section">Модули</div>
      <nav>
        {NAV.filter((n) => org.modules.includes(n.module)).map((n) => (
          <button
            key={n.key}
            type="button"
            className="nav-item"
            aria-current={current === n.key ? 'page' : undefined}
            aria-disabled={!n.ready}
            onClick={() => n.ready && go(`/orgs/${org.id}/${n.key}`)}
          >
            {n.icon}
            {n.label}
            {!n.ready && <span className="nav-item__soon">скоро</span>}
          </button>
        ))}
      </nav>

      <div className="rail__footer">
        <ThemeSwitch block />
        <div className="me">
          <UserAvatar name={user?.full_name ?? '?'} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="me__name">{user?.full_name}</div>
            <div className="me__role">{org.role.name}</div>
          </div>
          <Tooltip title="Выйти">
            <Button type="text" size="small" icon={<LogoutOutlined />} onClick={logout} aria-label="Выйти" />
          </Tooltip>
        </div>
      </div>
    </>
  )
}

export default function OrgLayout() {
  const { orgId = '' } = useParams()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const orgQuery = useOrganization(orgId)

  if (orgQuery.isLoading) {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  }
  if (orgQuery.isError) {
    const e = orgQuery.error
    const notFound = e instanceof ApiError && (e.status === 404 || e.status === 403)
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Result
          status={notFound ? '404' : 'error'}
          title={notFound ? 'Организация недоступна' : 'Ошибка загрузки'}
          subTitle={e.message}
          extra={[
            <Button key="orgs" type="primary" onClick={() => navigate('/orgs')}>К списку организаций</Button>,
            !notFound && <Button key="retry" onClick={() => orgQuery.refetch()}>Повторить</Button>,
          ]}
        />
      </div>
    )
  }
  const org = orgQuery.data!

  return (
    <OrgContext.Provider value={org}>
      <div className="shell">
        <header className="topbar">
          <Button type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label="Меню" />
          <span className="monogram" style={{ width: 26, height: 26, fontSize: 13 }}>{org.name[0]}</span>
          <strong style={{ fontWeight: 600 }}>{org.name}</strong>
        </header>
        <aside className="rail"><Rail org={org} /></aside>
        <Drawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          placement="left"
          size={272}
          closable={false}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' } }}
        >
          <Rail org={org} onNavigate={() => setMenuOpen(false)} />
        </Drawer>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </OrgContext.Provider>
  )
}

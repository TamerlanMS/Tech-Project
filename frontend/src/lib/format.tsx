import { Avatar, Badge, Tag, Tooltip } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import type { MembershipStatus, RoleBrief } from '../api/types'

dayjs.locale('ru')

export const STATUS_META: Record<MembershipStatus, { label: string; badge: 'success' | 'processing' | 'error'; hint: string }> = {
  active: { label: 'Активен', badge: 'success', hint: 'Работает в организации' },
  invited: { label: 'Приглашён', badge: 'processing', hint: 'Аккаунт ещё не активирован' },
  suspended: { label: 'Заблокирован', badge: 'error', hint: 'Доступ к организации приостановлен' },
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'gold',
  admin: 'volcano',
  manager: 'blue',
  employee: 'default',
}

export function StatusBadge({ status }: { status: MembershipStatus }) {
  const m = STATUS_META[status]
  return (
    <Tooltip title={m.hint}>
      <Badge status={m.badge} text={m.label} />
    </Tooltip>
  )
}

export function RoleTag({ role }: { role: RoleBrief }) {
  return <Tag color={ROLE_COLORS[role.key] ?? 'purple'} variant="filled">{role.name}</Tag>
}

const AVATAR_COLORS = ['#1677ff', '#13a8a8', '#722ed1', '#eb2f96', '#fa8c16', '#52c41a', '#2f54eb']

export function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return (
    <Avatar size={size} style={{ background: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length], flexShrink: 0 }}>
      {initials}
    </Avatar>
  )
}

export const formatDate = (iso: string) => dayjs(iso).format('D MMM YYYY')
export const formatDateTime = (iso: string) => dayjs(iso).format('D MMM YYYY, HH:mm')

export const PERMISSION_LABELS: Record<string, string> = {
  'users.read': 'Просмотр пользователей',
  'users.manage': 'Управление пользователями',
  'branches.read': 'Просмотр филиалов',
  'roles.read': 'Просмотр ролей',
  'crm.read': 'CRM: просмотр',
  'crm.manage': 'CRM: управление',
  'warehouse.read': 'Склад: просмотр',
  'warehouse.manage': 'Склад: управление',
}

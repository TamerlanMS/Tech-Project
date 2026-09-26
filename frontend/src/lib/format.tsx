import { Tooltip } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import type { CSSProperties } from 'react'
import type { MembershipStatus, RoleBrief } from '../api/types'

dayjs.locale('ru')

export const STATUS_META: Record<MembershipStatus, { label: string; plural: string; hint: string }> = {
  active: { label: 'Активен', plural: 'Активные', hint: 'Работает в организации' },
  invited: { label: 'Приглашён', plural: 'Приглашённые', hint: 'Аккаунт ещё не активирован' },
  suspended: { label: 'Заблокирован', plural: 'Заблокированные', hint: 'Доступ к организации приостановлен' },
}

export function StatusBadge({ status }: { status: MembershipStatus }) {
  const m = STATUS_META[status]
  return (
    <Tooltip title={m.hint}>
      <span className={`status status--${status}`}><span>{m.label}</span></span>
    </Tooltip>
  )
}

/** Уровень роли 0–100 → 1–4 деления: иерархия считывается без легенды. */
const bars = (level: number) => (level >= 100 ? 4 : level >= 80 ? 3 : level >= 50 ? 2 : 1)

export function RoleTag({ role, position }: { role: RoleBrief; position?: string | null }) {
  const n = bars(role.level)
  return (
    <span>
      <span className={`role role--${role.key}`}>
        <span className="role__bars" aria-hidden>
          {[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? 'on' : undefined} />)}
        </span>
        {role.name}
      </span>
      {position && <span className="role__pos" title={position}>{position}</span>}
    </span>
  )
}

function hue(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h) % 360
}

export function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  const style = { '--h': hue(name), width: size, height: size, fontSize: Math.round(size * 0.38) } as CSSProperties
  return <span className="avatar" style={style} aria-hidden>{initials}</span>
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

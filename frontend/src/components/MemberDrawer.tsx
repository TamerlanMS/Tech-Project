import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Result, Skeleton, Typography } from 'antd'
import { ApiError } from '../api/client'
import { useMember } from '../api/hooks'
import type { Member } from '../api/types'
import { PERMISSION_LABELS, RoleTag, StatusBadge, UserAvatar, formatDateTime } from '../lib/format'

interface Props {
  orgId: string
  userId: string | null
  onClose: () => void
  onEdit: (m: Member) => void
  onDelete: (m: Member) => void
}

export default function MemberDrawer({ orgId, userId, onClose, onEdit, onDelete }: Props) {
  const { data: m, isLoading, isError, error, refetch } = useMember(orgId, userId)
  const gone = isError && error instanceof ApiError && error.status === 404

  return (
    <Drawer
      open={!!userId}
      onClose={onClose}
      size={460}
      title={<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>Карточка сотрудника</span>}
      footer={m?.can_manage && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => onDelete(m)}>Удалить из организации</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => onEdit(m)}>Изменить</Button>
        </div>
      )}
    >
      {isLoading ? (
        <Skeleton avatar active paragraph={{ rows: 8 }} />
      ) : gone ? (
        <Result status="404" title="Пользователь не найден" subTitle="Возможно, его уже удалили из организации." />
      ) : isError ? (
        <Result status="error" title="Не удалось загрузить" subTitle={error.message}
          extra={<Button onClick={() => refetch()}>Повторить</Button>} />
      ) : m ? (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            <UserAvatar name={m.full_name} size={60} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{m.full_name}</h2>
              <div className="muted">{m.position ?? 'Должность не указана'}</div>
            </div>
          </div>
          {!m.account_activated && (
            <Alert type="warning" showIcon style={{ marginBottom: 16 }}
              title="Приглашение отправлено, но аккаунт ещё не активирован" />
          )}
          <dl className="kv">
            <dt>Email</dt>
            <dd><Typography.Text copyable style={{ color: 'inherit' }}>{m.email}</Typography.Text></dd>
            <dt>Телефон</dt>
            <dd className="num">{m.phone ?? <span className="muted">—</span>}</dd>
            <dt>Роль</dt>
            <dd><RoleTag role={m.role} /></dd>
            <dt>Филиалы</dt>
            <dd style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {m.branches.length ? m.branches.map((b) => <span key={b.id} className="chip">{b.name}</span>) : <span className="muted">Не назначен</span>}
            </dd>
            <dt>Статус</dt>
            <dd><StatusBadge status={m.status} /></dd>
            <dt>В компании с</dt>
            <dd className="num">{formatDateTime(m.joined_at)}</dd>
            <dt>Изменён</dt>
            <dd className="num">{formatDateTime(m.updated_at)}</dd>
            <dt>Пригласил</dt>
            <dd>{m.invited_by?.full_name ?? <span className="muted">—</span>}</dd>
          </dl>

          <div className="rail__section" style={{ padding: '28px 0 10px' }}>Права в этой организации</div>
          {m.permissions.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {m.permissions.map((p) => (
                <span key={p} className={`chip ${p.endsWith('.manage') ? 'chip--accent' : ''}`}>{PERMISSION_LABELS[p] ?? p}</span>
              ))}
            </div>
          ) : (
            <span className="muted">Нет прав</span>
          )}
        </>
      ) : null}
    </Drawer>
  )
}

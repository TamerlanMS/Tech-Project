import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Drawer, Empty, Result, Skeleton, Space, Tag, Typography } from 'antd'
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
      size={480}
      title="Информация о пользователе"
      extra={m?.can_manage && (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => onEdit(m)}>Изменить</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => onDelete(m)} aria-label="Удалить" />
        </Space>
      )}
    >
      {isLoading ? (
        <Skeleton avatar active paragraph={{ rows: 8 }} />
      ) : gone ? (
        <Result status="404" title="Пользователь не найден" subTitle="Возможно, он уже удалён из организации." />
      ) : isError ? (
        <Result status="error" title="Не удалось загрузить" subTitle={error.message}
          extra={<Button onClick={() => refetch()}>Повторить</Button>} />
      ) : m ? (
        <>
          <Space size={16} style={{ marginBottom: 24 }}>
            <UserAvatar name={m.full_name} size={56} />
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>{m.full_name}</Typography.Title>
              <Typography.Text type="secondary">{m.position ?? 'Должность не указана'}</Typography.Text>
            </div>
          </Space>
          {!m.account_activated && (
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message="Пользователь ещё не активировал аккаунт" />
          )}
          <Descriptions column={1} size="small" bordered styles={{ label: { width: 150 } }}>
            <Descriptions.Item label="Email"><Typography.Text copyable>{m.email}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="Телефон">{m.phone ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Роль"><RoleTag role={m.role} /></Descriptions.Item>
            <Descriptions.Item label="Филиалы">
              {m.branches.length ? m.branches.map((b) => <Tag key={b.id}>{b.name}</Tag>) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Статус"><StatusBadge status={m.status} /></Descriptions.Item>
            <Descriptions.Item label="В организации с">{formatDateTime(m.joined_at)}</Descriptions.Item>
            <Descriptions.Item label="Изменён">{formatDateTime(m.updated_at)}</Descriptions.Item>
            <Descriptions.Item label="Пригласил">{m.invited_by?.full_name ?? '—'}</Descriptions.Item>
          </Descriptions>
          <Typography.Title level={5} style={{ marginTop: 24 }}>Права в организации</Typography.Title>
          {m.permissions.length ? (
            <Space size={[4, 8]} wrap>
              {m.permissions.map((p) => <Tag key={p} color="blue" variant="filled">{PERMISSION_LABELS[p] ?? p}</Tag>)}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет прав" />
          )}
        </>
      ) : null}
    </Drawer>
  )
}

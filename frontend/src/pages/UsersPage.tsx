import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { App, Button, Dropdown, Empty, Input, Result, Select, Table, Tooltip } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { SorterResult } from 'antd/es/table/interface'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useBranches, useMembers, useRemoveMember, useRoles } from '../api/hooks'
import type { Member, MemberListParams, MembershipStatus, SortField, SortOrder } from '../api/types'
import MemberDrawer from '../components/MemberDrawer'
import MemberFormModal from '../components/MemberFormModal'
import { useCurrentOrg } from '../components/OrgLayout'
import { RoleTag, STATUS_META, StatusBadge, UserAvatar, formatDate } from '../lib/format'

const STATUSES: MembershipStatus[] = ['active', 'invited', 'suspended']
import { useDebounced } from '../lib/useDebounced'

const PAGE_SIZES = [10, 20, 50, 100]
const SORT_FIELDS: SortField[] = ['full_name', 'email', 'role', 'status', 'joined_at']

/** Состояние таблицы живёт в URL: ссылку с фильтрами можно отправить коллеге, работает «Назад». */
function useListParams(): [MemberListParams, (patch: Partial<MemberListParams>) => void, () => void] {
  const [sp, setSp] = useSearchParams()
  const params = useMemo<MemberListParams>(() => {
    const sortBy = sp.get('sort') as SortField | null
    const size = Number(sp.get('size'))
    return {
      page: Math.max(1, Number(sp.get('page')) || 1),
      page_size: PAGE_SIZES.includes(size) ? size : 20,
      search: sp.get('q') ?? undefined,
      role_id: sp.getAll('role'),
      branch_id: sp.getAll('branch'),
      status: sp.getAll('status') as MembershipStatus[],
      sort_by: sortBy && SORT_FIELDS.includes(sortBy) ? sortBy : 'full_name',
      sort_order: sp.get('order') === 'desc' ? 'desc' : 'asc',
    }
  }, [sp])

  const update = (patch: Partial<MemberListParams>) => {
    const next = { ...params, ...patch }
    // любое изменение фильтров/поиска/сортировки возвращает на первую страницу
    if (!('page' in patch)) next.page = 1
    const out = new URLSearchParams()
    if (next.search) out.set('q', next.search)
    next.role_id?.forEach((v) => out.append('role', v))
    next.branch_id?.forEach((v) => out.append('branch', v))
    next.status?.forEach((v) => out.append('status', v))
    if (next.sort_by !== 'full_name') out.set('sort', next.sort_by!)
    if (next.sort_order === 'desc') out.set('order', 'desc')
    if (next.page > 1) out.set('page', String(next.page))
    if (next.page_size !== 20) out.set('size', String(next.page_size))
    setSp(out, { replace: 'search' in patch }) // ввод в поиск не засоряет историю
  }
  const reset = () => setSp(new URLSearchParams())
  return [params, update, reset]
}

export default function UsersPage() {
  const org = useCurrentOrg()
  const { modal, message } = App.useApp()
  const canRead = org.permissions.includes('users.read')
  const canManage = org.permissions.includes('users.manage')

  const [params, update, reset] = useListParams()
  const [searchText, setSearchText] = useState(params.search ?? '')
  const debouncedSearch = useDebounced(searchText.trim(), 350)
  const [viewId, setViewId] = useState<string | null>(null)
  const [formState, setFormState] = useState<{ open: boolean; member?: Member }>({ open: false })

  const members = useMembers(org.id, params, canRead)
  const roles = useRoles(org.id, canRead)
  const branches = useBranches(org.id, canRead)
  const remove = useRemoveMember(org.id)

  useEffect(() => {
    if ((params.search ?? '') !== debouncedSearch) update({ search: debouncedSearch || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  // после удаления последнего элемента на странице — перейти на предыдущую
  const data = members.data
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && params.page > data.pages) {
      update({ page: data.pages })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, params.page])

  const hasFilters = !!(params.search || params.role_id?.length || params.branch_id?.length || params.status?.length)
  const resetAll = () => {
    setSearchText('')
    reset()
  }

  const confirmDelete = (m: Member) =>
    modal.confirm({
      title: `Удалить ${m.full_name} из организации?`,
      content: `Пользователь потеряет доступ к «${org.name}». Его аккаунт и доступ к другим организациям сохранятся.`,
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      icon: null,
      zIndex: 1100,
      onOk: async () => {
        try {
          await remove.mutateAsync(m.user_id)
          message.success(`${m.full_name} удалён из организации`)
          if (viewId === m.user_id) setViewId(null)
        } catch (e) {
          message.error(e instanceof ApiError ? e.message : 'Не удалось удалить пользователя')
        }
      },
    })

  const openEdit = (m: Member) => setFormState({ open: true, member: m })

  const sortOrderFor = (field: SortField) =>
    params.sort_by === field ? (params.sort_order === 'asc' ? 'ascend' : 'descend') : null

  const columns: ColumnsType<Member> = [
    {
      key: 'full_name',
      title: 'Сотрудник',
      sorter: true,
      sortOrder: sortOrderFor('full_name'),
      render: (_, m) => (
        <div className="person">
          <UserAvatar name={m.full_name} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="person__name">
              {m.full_name}
              {!m.account_activated && <span className="chip chip--outline">не активирован</span>}
            </div>
            <div className="person__mail">{m.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      title: 'Роль',
      sorter: true,
      sortOrder: sortOrderFor('role'),
      width: 210,
      render: (_, m) => <RoleTag role={m.role} position={m.position} />,
    },
    {
      key: 'branches',
      title: 'Филиал',
      width: 240,
      responsive: ['md'],
      render: (_, m) => {
        if (!m.branches.length) return <span className="muted">Не назначен</span>
        const [first, ...rest] = m.branches
        return (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{first.name}</span>
            {rest.length > 0 && (
              <Tooltip title={rest.map((b) => b.name).join(', ')}>
                <span className="chip">+{rest.length}</span>
              </Tooltip>
            )}
          </span>
        )
      },
    },
    {
      key: 'status',
      title: 'Статус',
      sorter: true,
      sortOrder: sortOrderFor('status'),
      width: 150,
      render: (_, m) => <StatusBadge status={m.status} />,
    },
    {
      key: 'joined_at',
      title: 'Добавлен',
      sorter: true,
      sortOrder: sortOrderFor('joined_at'),
      width: 140,
      responsive: ['lg'],
      render: (_, m) => <span className="num" style={{ color: 'var(--text-2)' }}>{formatDate(m.joined_at)}</span>,
    },
    {
      key: 'actions',
      width: 52,
      align: 'right',
      render: (_, m) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'view', icon: <EyeOutlined />, label: 'Открыть', onClick: () => setViewId(m.user_id) },
              ...(canManage ? [
                { key: 'edit', icon: <EditOutlined />, label: 'Изменить', disabled: !m.can_manage, onClick: () => openEdit(m) },
                { type: 'divider' as const },
                { key: 'delete', icon: <DeleteOutlined />, label: 'Удалить из организации', danger: true,
                  disabled: !m.can_manage, onClick: () => confirmDelete(m) },
              ] : []),
            ],
            onClick: ({ domEvent }) => domEvent.stopPropagation(),
          }}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Действия" onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ]

  const onTableChange = (p: TablePaginationConfig, _f: unknown, sorter: SorterResult<Member> | SorterResult<Member>[]) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    const sortBy = (s?.order ? s.columnKey : 'full_name') as SortField
    const sortOrder: SortOrder = s?.order === 'descend' ? 'desc' : 'asc'
    if (sortBy !== params.sort_by || sortOrder !== params.sort_order) {
      update({ sort_by: sortBy, sort_order: sortOrder })
    } else if (p.pageSize !== params.page_size) {
      update({ page_size: p.pageSize })
    } else {
      update({ page: p.current ?? 1 })
    }
  }

  const header = (
    <>
      <div className="crumbs">{org.name} <span style={{ margin: '0 6px' }}>/</span> <b>Пользователи</b></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="page-title">Пользователи</h1>
        {canRead && canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true })}>
            Добавить
          </Button>
        )}
      </div>
    </>
  )

  if (!canRead) {
    return (
      <>
        {header}
        <div className="sheet" style={{ marginTop: 24 }}>
          <Result status="403" title="Нет доступа"
            subTitle={`Роль «${org.role.name}» в «${org.name}» не позволяет просматривать пользователей. Обратитесь к администратору организации.`} />
        </div>
      </>
    )
  }

  const counts = data?.status_counts
  const allCount = counts ? counts.active + counts.invited + counts.suspended : undefined
  const activeStatus = params.status?.length === 1 ? params.status[0] : undefined

  const emptyState = hasFilters ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Никого не нашли по этим условиям" style={{ padding: '32px 0' }}>
      <Button onClick={resetAll}>Сбросить фильтры</Button>
    </Empty>
  ) : (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="В организации пока никого нет" style={{ padding: '32px 0' }}>
      {canManage && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true })}>
          Добавить первого сотрудника
        </Button>
      )}
    </Empty>
  )

  return (
    <>
      {header}

      <div className="tabs" role="tablist" aria-label="Статус">
        <button type="button" role="tab" className="tab" aria-selected={!params.status?.length}
          onClick={() => update({ status: [] })}>
          Все <span className="tab__n num">{allCount ?? '·'}</span>
        </button>
        {STATUSES.map((st) => (
          <button key={st} type="button" role="tab" className="tab" aria-selected={activeStatus === st}
            onClick={() => update({ status: [st] })}>
            {STATUS_META[st].plural} <span className="tab__n num">{counts?.[st] ?? '·'}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined className="muted" />}
          placeholder="Имя, email или должность"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ flex: '1 1 260px', maxWidth: 340 }}
          maxLength={100}
        />
        <Select
          mode="multiple" allowClear maxTagCount="responsive" placeholder="Все роли"
          style={{ flex: '1 1 160px', maxWidth: 220 }}
          loading={roles.isLoading}
          value={params.role_id}
          onChange={(v) => update({ role_id: v })}
          options={roles.data?.map((r) => ({ value: r.id, label: r.name }))}
        />
        <Select
          mode="multiple" allowClear maxTagCount="responsive" placeholder="Все филиалы" optionFilterProp="label"
          style={{ flex: '1 1 180px', maxWidth: 260 }}
          loading={branches.isLoading}
          value={params.branch_id}
          onChange={(v) => update({ branch_id: v })}
          options={branches.data?.map((b) => ({ value: b.id, label: b.name }))}
          optionRender={(o) => {
            const b = branches.data?.find((x) => x.id === o.value)
            return <span style={{ display: 'flex', justifyContent: 'space-between' }}>{o.label}<span className="muted num">{b?.members_count}</span></span>
          }}
        />
        {hasFilters && <Button type="text" icon={<CloseOutlined />} onClick={resetAll}>Сбросить</Button>}
      </div>

      <div className="sheet">
        {members.isError && !data ? (
          <Result
            status="error"
            title="Не удалось загрузить пользователей"
            subTitle={members.error.message}
            extra={<Button icon={<ReloadOutlined />} onClick={() => members.refetch()}>Повторить</Button>}
          />
        ) : (
          <Table<Member>
            rowKey="user_id"
            columns={columns}
            dataSource={data?.items}
            loading={members.isFetching}
            onChange={onTableChange}
            showSorterTooltip={false}
            onRow={(m) => ({ onClick: () => setViewId(m.user_id), style: { cursor: 'pointer' } })}
            locale={{ emptyText: members.isLoading ? ' ' : emptyState }}
            scroll={{ x: 680 }}
            pagination={{
              current: params.page,
              pageSize: params.page_size,
              total: data?.total ?? 0,
              pageSizeOptions: PAGE_SIZES,
              showSizeChanger: true,
              showTotal: (total, [from, to]) => <span className="muted num">{from}–{to} из {total}</span>,
              hideOnSinglePage: false,
            }}
          />
        )}
        {members.isError && data && (
          <div style={{ padding: '0 16px 16px', color: 'var(--bad)' }}>
            Не удалось обновить данные: {members.error.message}.{' '}
            <a onClick={() => members.refetch()}>Повторить</a>
          </div>
        )}
      </div>

      <MemberDrawer
        orgId={org.id}
        userId={viewId}
        onClose={() => setViewId(null)}
        onEdit={openEdit}
        onDelete={confirmDelete}
      />
      <MemberFormModal
        orgId={org.id}
        open={formState.open}
        member={formState.member}
        onClose={() => setFormState({ open: false })}
      />
    </>
  )
}

import { Alert, App, Form, Input, Modal, Select, Space, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import { useAddMember, useBranches, useRoles, useUpdateMember } from '../api/hooks'
import type { Member, MemberCreate, MemberUpdate, MembershipStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { STATUS_META, UserAvatar } from '../lib/format'

interface Props {
  orgId: string
  open: boolean
  /** undefined — режим добавления, иначе редактирование */
  member?: Member
  onClose: () => void
}

interface FormValues {
  email: string
  full_name?: string
  phone?: string
  position?: string
  role_id: string
  branch_ids: string[]
  status?: MembershipStatus
}

/** Какое поле формы подсветить для бизнес-ошибок backend */
const CODE_TO_FIELD: Record<string, keyof FormValues> = {
  already_member: 'email',
  user_blocked: 'email',
  full_name_required: 'full_name',
  role_not_found: 'role_id',
  role_assignment_forbidden: 'role_id',
  branch_not_found: 'branch_ids',
  invalid_status_transition: 'status',
}

export default function MemberFormModal({ orgId, open, member, onClose }: Props) {
  const { message } = App.useApp()
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [formError, setFormError] = useState<string | null>(null)
  const roles = useRoles(orgId, open)
  const branches = useBranches(orgId, open)
  const add = useAddMember(orgId)
  const update = useUpdateMember(orgId)
  const isEdit = !!member
  const isSelf = member?.user_id === user?.id
  const saving = add.isPending || update.isPending

  useEffect(() => {
    if (!open) return
    setFormError(null)
    form.resetFields()
    if (member) {
      form.setFieldsValue({
        role_id: member.role.id,
        branch_ids: member.branches.map((b) => b.id),
        position: member.position ?? undefined,
        status: member.status,
      })
    }
  }, [open, member, form])

  // роль по умолчанию для нового пользователя — когда роли загрузились и поле ещё пустое
  useEffect(() => {
    if (!open || member || form.getFieldValue('role_id')) return
    const employee = roles.data?.find((r) => r.key === 'employee' && r.assignable)
    if (employee) form.setFieldValue('role_id', employee.id)
  }, [open, member, form, roles.data])

  const roleOptions = useMemo(
    () =>
      (roles.data ?? []).map((r) => ({
        value: r.id,
        label: r.name,
        // текущую роль участника показываем, даже если назначить её сейчас нельзя
        disabled: !r.assignable && r.id !== member?.role.id,
        title: r.assignable ? undefined : 'Нельзя назначить роль равную или выше вашей',
      })),
    [roles.data, member],
  )

  const submit = async () => {
    const v = await form.validateFields()
    setFormError(null)
    try {
      if (isEdit && member) {
        // PATCH — отправляем только изменённые поля
        const patch: MemberUpdate = {}
        if (v.role_id !== member.role.id) patch.role_id = v.role_id
        const oldBranches = member.branches.map((b) => b.id).sort().join()
        if ([...v.branch_ids].sort().join() !== oldBranches) patch.branch_ids = v.branch_ids
        if ((v.position ?? '') !== (member.position ?? '')) patch.position = v.position || null
        if (v.status && v.status !== member.status) patch.status = v.status
        if (Object.keys(patch).length === 0) return onClose()
        await update.mutateAsync({ userId: member.user_id, data: patch })
        message.success('Изменения сохранены')
      } else {
        const payload: MemberCreate = {
          email: v.email.trim(),
          full_name: v.full_name?.trim() || undefined,
          phone: v.phone?.trim() || undefined,
          position: v.position?.trim() || undefined,
          role_id: v.role_id,
          branch_ids: v.branch_ids ?? [],
        }
        const created = await add.mutateAsync(payload)
        message.success(
          created.status === 'invited'
            ? `${created.full_name} приглашён в организацию`
            : `${created.full_name} добавлен в организацию`,
        )
      }
      onClose()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      const fieldErrs = e.fieldErrors()
      const byCode = CODE_TO_FIELD[e.code]
      if (byCode) fieldErrs[byCode] = e.message
      const fields = Object.entries(fieldErrs).filter(([name]) => name in form.getFieldsValue(true) || name === byCode)
      if (fields.length) form.setFields(fields.map(([name, err]) => ({ name: name as keyof FormValues, errors: [err] })))
      else setFormError(e.message)
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Редактирование пользователя' : 'Добавить пользователя'}
      okText={isEdit ? 'Сохранить' : 'Добавить'}
      cancelText="Отмена"
      onOk={submit}
      onCancel={onClose}
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      {formError && <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} />}
      {(roles.isError || branches.isError) && (
        <Alert type="warning" showIcon message="Не удалось загрузить роли или филиалы" style={{ marginBottom: 16 }} />
      )}
      {isEdit && member && (
        <Space style={{ marginBottom: 16 }}>
          <UserAvatar name={member.full_name} size={40} />
          <div>
            <div style={{ fontWeight: 500 }}>{member.full_name}</div>
            <Typography.Text type="secondary">{member.email}</Typography.Text>
          </div>
        </Space>
      )}
      {isSelf && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Это ваш профиль: собственную роль и статус изменить нельзя." />
      )}
      <Form form={form} layout="vertical" requiredMark="optional" onFinish={submit}>
        {!isEdit && (
          <>
            <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Укажите email' }, { type: 'email', message: 'Некорректный email' }]}
              extra="Если аккаунт с таким email уже есть на платформе — он будет добавлен в организацию.">
              <Input placeholder="name@company.kz" autoFocus />
            </Form.Item>
            <Form.Item name="full_name" label="ФИО" rules={[{ max: 200 }]}
              extra="Обязательно для нового аккаунта. У существующего аккаунта профиль не изменяется.">
              <Input placeholder="Иван Петров" />
            </Form.Item>
            <Form.Item name="phone" label="Телефон"
              rules={[{ pattern: /^\+?[0-9 ()-]{5,32}$/, message: 'Некорректный номер' }]}>
              <Input placeholder="+7 777 123 45 67" />
            </Form.Item>
          </>
        )}
        <Form.Item name="position" label="Должность" rules={[{ max: 150 }]}>
          <Input placeholder="Менеджер по продажам" />
        </Form.Item>
        <Form.Item name="role_id" label="Роль" rules={[{ required: true, message: 'Выберите роль' }]}>
          <Select options={roleOptions} loading={roles.isLoading} disabled={isSelf} placeholder="Выберите роль" />
        </Form.Item>
        <Form.Item name="branch_ids" label="Филиалы" initialValue={[]}>
          <Select
            mode="multiple"
            allowClear
            loading={branches.isLoading}
            placeholder="Без филиала"
            optionFilterProp="label"
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
        </Form.Item>
        {isEdit && member && (
          <Form.Item name="status" label="Статус" tooltip="«Приглашён» снимается автоматически, когда пользователь активирует аккаунт">
            <Select
              disabled={isSelf || member.status === 'invited'}
              options={(['active', 'suspended', 'invited'] as MembershipStatus[]).map((s) => ({
                value: s, label: STATUS_META[s].label, disabled: s === 'invited',
              }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

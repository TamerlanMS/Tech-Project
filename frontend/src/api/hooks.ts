import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  Branch,
  MemberCreate,
  MemberDetail,
  MemberListParams,
  MemberPage,
  MemberUpdate,
  MyOrganization,
  Organization,
  Role,
} from './types'

export const qk = {
  myOrgs: ['me', 'organizations'] as const,
  org: (orgId: string) => ['org', orgId] as const,
  roles: (orgId: string) => ['org', orgId, 'roles'] as const,
  branches: (orgId: string) => ['org', orgId, 'branches'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  memberList: (orgId: string, p: MemberListParams) => ['org', orgId, 'members', 'list', p] as const,
  member: (orgId: string, userId: string) => ['org', orgId, 'members', 'detail', userId] as const,
}

export const useMyOrganizations = (enabled = true) =>
  useQuery({ queryKey: qk.myOrgs, queryFn: () => api<MyOrganization[]>('/me/organizations'), enabled })

export const useOrganization = (orgId: string) =>
  useQuery({ queryKey: qk.org(orgId), queryFn: () => api<Organization>(`/organizations/${orgId}`) })

export const useRoles = (orgId: string, enabled = true) =>
  useQuery({
    queryKey: qk.roles(orgId),
    queryFn: () => api<Role[]>(`/organizations/${orgId}/roles`),
    enabled,
    staleTime: 60_000,
  })

export const useBranches = (orgId: string, enabled = true) =>
  useQuery({
    queryKey: qk.branches(orgId),
    queryFn: () => api<Branch[]>(`/organizations/${orgId}/branches`),
    enabled,
    staleTime: 60_000,
  })

export const useMembers = (orgId: string, params: MemberListParams, enabled = true) =>
  useQuery({
    queryKey: qk.memberList(orgId, params),
    queryFn: ({ signal }) =>
      api<MemberPage>(`/organizations/${orgId}/users`, { query: { ...params }, signal }),
    placeholderData: keepPreviousData, // таблица не «мигает» при смене страницы/фильтра
    enabled,
  })

export const useMember = (orgId: string, userId: string | null) =>
  useQuery({
    queryKey: qk.member(orgId, userId ?? ''),
    queryFn: () => api<MemberDetail>(`/organizations/${orgId}/users/${userId}`),
    enabled: !!userId,
  })

function useInvalidateMembers(orgId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: qk.members(orgId) })
    qc.invalidateQueries({ queryKey: qk.branches(orgId) }) // счётчики участников филиалов
  }
}

export function useAddMember(orgId: string) {
  const invalidate = useInvalidateMembers(orgId)
  return useMutation({
    mutationFn: (data: MemberCreate) =>
      api<MemberDetail>(`/organizations/${orgId}/users`, { method: 'POST', body: data }),
    onSuccess: invalidate,
  })
}

export function useUpdateMember(orgId: string) {
  const invalidate = useInvalidateMembers(orgId)
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: MemberUpdate }) =>
      api<MemberDetail>(`/organizations/${orgId}/users/${userId}`, { method: 'PATCH', body: data }),
    onSuccess: invalidate,
  })
}

export function useRemoveMember(orgId: string) {
  const invalidate = useInvalidateMembers(orgId)
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/organizations/${orgId}/users/${userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export type MembershipStatus = 'active' | 'invited' | 'suspended'
export type SortField = 'full_name' | 'email' | 'role' | 'status' | 'joined_at'
export type SortOrder = 'asc' | 'desc'

export interface UserBrief {
  id: string
  email: string
  full_name: string
}

export interface RoleBrief {
  id: string
  key: string
  name: string
  level: number
}

export interface Role extends RoleBrief {
  is_system: boolean
  permissions: string[]
  assignable: boolean
}

export interface BranchBrief {
  id: string
  name: string
}

export interface Branch extends BranchBrief {
  address: string | null
  members_count: number
}

export interface MyOrganization {
  id: string
  name: string
  slug: string
  role: RoleBrief
  permissions: string[]
}

export interface Organization extends MyOrganization {
  modules: string[]
}

export interface Member {
  user_id: string
  email: string
  full_name: string
  phone: string | null
  position: string | null
  status: MembershipStatus
  role: RoleBrief
  branches: BranchBrief[]
  joined_at: string
  updated_at: string
  account_activated: boolean
  can_manage: boolean
}

export interface MemberDetail extends Member {
  permissions: string[]
  invited_by: UserBrief | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface MemberPage extends Page<Member> {
  status_counts: Record<MembershipStatus, number>
}

export interface MemberListParams {
  page: number
  page_size: number
  search?: string
  role_id?: string[]
  branch_id?: string[]
  status?: MembershipStatus[]
  sort_by?: SortField
  sort_order?: SortOrder
}

export interface MemberCreate {
  email: string
  full_name?: string
  phone?: string
  position?: string
  role_id: string
  branch_ids: string[]
}

export interface MemberUpdate {
  role_id?: string
  branch_ids?: string[]
  status?: MembershipStatus
  position?: string | null
}

export interface TokenResponse {
  access_token: string
  user: UserBrief
}

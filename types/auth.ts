import type { EmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";

/** Dashboard staff roles stored on admin_users.role */
export type AdminRole = EmployeeRole;

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser {
  authUser: any; // Supabase auth user
  adminUser: AdminUser;
}

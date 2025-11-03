export type AdminRole = "super_admin" | "admin" | "moderator" | "support";

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

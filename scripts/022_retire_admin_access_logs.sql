-- Retire legacy request-level admin access table after all application reads have
-- moved to user_activity and audit_log.

begin;

drop table if exists public.admin_access_logs;

commit;
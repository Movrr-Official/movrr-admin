-- Complete the maintenance boundary for old service-role resource/token handlers.
-- No existing inventory or credentials are changed.
BEGIN;
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.fulfilment_resource
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.fulfilment_resource_item
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.fulfilment_resource_allocation
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.fulfilment_token
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.partner_validation
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();
COMMIT;

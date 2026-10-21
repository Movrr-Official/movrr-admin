// Reproducible migration source composition. Historical migrations stay immutable.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(r,p,...rest){return resolve.call(this,r.startsWith('@/')?path.join(root,r.slice(2)):r,p,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const templates=require('../features/organisations/domain/employeeRoleTemplates.ts');
const roles=templates.CANONICAL_EMPLOYEE_ROLES;
const grants=Object.fromEntries(roles.map(r=>[r,templates.capabilitiesForEmployeeRole(r)]));
const capability=`CREATE OR REPLACE FUNCTION public.ops_employee_capabilities(p_role text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $cap$ SELECT coalesce('${JSON.stringify(grants).replace(/'/g,"''")}'::jsonb->p_role,'[]'::jsonb) $cap$;
REVOKE ALL ON FUNCTION public.ops_employee_capabilities(text) FROM PUBLIC,anon,authenticated,service_role;
`;
const old=fs.readFileSync(path.join(__dirname,'068_employee_provisioning.sql'),'utf8').replace(/\r/g,'');
function definition(name){const a=old.indexOf('CREATE FUNCTION public.'+name+'('),b=old.indexOf('END $$;',a)+7;if(a<0||b<7)throw Error(name);return old.slice(a,b).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');}
let guard=definition('guard_employee_auth_insert')
 .replace("'server_assigned_role','admin','full_name'","'full_name'")
 .replace("'server_assigned_role',product.input->>'role','full_name'","'full_name'")
 .replace("NOT IN ('rider','advertiser') THEN\n      -- Explicit", "<>'rider' THEN\n      -- Explicit")
 .replace(/      -- Explicit invalid[\s\S]*?      RAISE EXCEPTION/,'      RAISE EXCEPTION');
let provision=definition('provision_employee').replace("  IF p_phase NOT IN", "  IF p_phase IS NULL OR p_phase NOT IN")
 .replace('  SELECT a.role INTO actor_role', '  PERFORM pg_advisory_xact_lock(70001,1);\n  SELECT a.role INTO actor_role')
 .replace("    INSERT INTO public.admin_users(user_id,email,role,created_by) VALUES(r.user_id,r.email,requested,p_actor);","    PERFORM public.assign_employee_role(p_actor,r.user_id,requested);")
 .replace("    WHERE a.user_id=p_actor AND u.status='active';", "    JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());")
 .replace("  -- Canonical roles are the generated template contract; do not accept aliases\n  -- for new employees, or put owner/manager/staff/viewer in this role domain.\n",'')
 .replace("requested IN ('admin','moderator','support','compliance_officer','government')\n     OR ",'');
let bootstrap=fs.readFileSync(path.join(__dirname,'fixtures/employee-provisioning/handle_new_user.sql'),'utf8').replace(/\r/g,'');
const a=bootstrap.indexOf('  -- Only trust server-assigned role.'),b=bootstrap.indexOf('  _name :=',a);
bootstrap=bootstrap.slice(0,a)+`  -- Account classification is independent of employee authority. No metadata
  -- enum cast, alias mapping, or catch-all Rider fallback is executable.
  IF EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=new.id) THEN
    _role := 'admin';
  ELSIF EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id AND input->>'role'='advertiser') THEN
    _role := 'advertiser';
  ELSIF coalesce(_meta->>'server_assigned_role','rider')<>'rider' THEN
    RAISE EXCEPTION 'Account kind requires an authorized provisioning reservation';
  END IF;

`+bootstrap.slice(b);
bootstrap=bootstrap.replace(/\b_role\b/g,'_account_type').replace('    role,\n    created_at,','    role,\n    status,\n    created_at,')
 .replace('    _account_type,\n    now(),','    _account_type,\n    CASE WHEN EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=new.id) OR EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id) THEN \'pending\'::public.user_status ELSE \'active\'::public.user_status END,\n    now(),')
 .replace('      user_id,\n      created_at,','      user_id,\n      status,\n      created_at,')
 .replace('      _user_id,\n      now(),','      _user_id,\n      CASE WHEN EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id) THEN \'inactive\'::public.rider_status ELSE \'active\'::public.rider_status END,\n      now(),');
// The former second bootstrap trigger is replaced by the atomic bootstrap above.
const creation=fs.readFileSync(path.join(__dirname,'069_admin_creation_transactions.sql'),'utf8').replace(/\r/g,'');
const invitation=creation.slice(creation.indexOf('CREATE OR REPLACE FUNCTION public.accept_workboard_platform_invitation'))
 .replace("WHERE a.user_id=p_user_id AND u.status='active' AND lower(au.email)=normalized_email", "WHERE a.user_id=p_user_id AND u.status='active' AND lower(au.email)=normalized_email AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())")
 .replace(/COMMIT;\s*$/,'');
const community=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/community/production-contracts.json'),'utf8')).functions
 .find(f=>f.signature==='join_community_ride(uuid,uuid)').definition.replace(/\r/g,'')
 .replace(/\) AND NOT EXISTS \(\n    SELECT 1 FROM public.admin_users au\n    WHERE au.user_id = auth.uid\(\)\n  \) THEN/,`) AND NOT (public.is_dashboard_admin() AND EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.user_id=auth.uid()
      AND public.ops_employee_capabilities(au.role) ? 'community.manage'
  )) THEN`);
if(!community.includes("? 'community.manage'"))throw Error('Community authorization baseline drift');
const operations=fs.readFileSync(path.join(__dirname,'057_alignment_operations.sql'),'utf8').replace(/\r/g,'');
const notification=operations.slice(operations.indexOf('CREATE FUNCTION public.ops_queue_notifications'),operations.indexOf('CREATE FUNCTION public.ops_deliver_notification_batch'))
 .replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
 .replace(" IF p_payload->>'target'='role' AND nullif",` IF p_payload->>'target'='role' AND p_payload->>'role' NOT IN ('rider','advertiser') AND jsonb_array_length(public.ops_employee_capabilities(p_payload->>'role'))=0 THEN
   RAISE EXCEPTION 'Canonical recipient role required' USING ERRCODE='22023'; END IF;
 IF p_payload->>'target'='role' AND nullif`)
 .replace("u.role::text=p_payload->>'role'",`((p_payload->>'role' IN ('rider','advertiser') AND u.role::text=p_payload->>'role') OR EXISTS(SELECT 1 FROM public.admin_users employee WHERE employee.user_id=u.id AND employee.role=p_payload->>'role'))`);
const generated=guard+'\n'+bootstrap.trim().replace(/;?$/,';')+'\n'+provision+`\nDROP TRIGGER zz_mark_employee_profile_pending ON auth.users;
DROP FUNCTION public.mark_employee_profile_pending();
`+invitation+'\n'+community.trim().replace(/;?$/,';')+'\n'+notification;
const file=path.join(__dirname,'070_employee_rbac_authority.sql'),source=fs.readFileSync(file,'utf8').replace(/\r/g,'');
const output=source.replace(/(-- BEGIN GENERATED EMPLOYEE CAPABILITIES\n)[\s\S]*?(-- END GENERATED EMPLOYEE CAPABILITIES)/,'$1'+capability+'$2')
 .replace(/(-- BEGIN GENERATED PROVISIONING AND BOOTSTRAP\n)[\s\S]*?(-- END GENERATED PROVISIONING AND BOOTSTRAP)/,(_,a,b)=>a+generated+b);
if(process.argv.includes('--check')){if(source!==output)throw Error('Regenerate canonical employee migration');console.log('Canonical employee migration source matches');}else fs.writeFileSync(file,output);

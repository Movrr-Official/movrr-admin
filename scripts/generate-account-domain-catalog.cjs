// Single source: TypeScript catalog. SQL is a compiled authorization contract.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(r,p,...rest){return resolve.call(this,r.startsWith('@/')?path.join(root,r.slice(2)):r,p,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const catalog=require('../features/organisations/domain/CapabilityCatalog.ts'),employees=require('../features/organisations/domain/employeeRoleTemplates.ts');
const domains={partner:'reward_partner',advertiser:'advertiser',government:'government'};
const inventory={rider:{rider:catalog.capabilitiesForRider()},staff:Object.fromEntries(employees.CANONICAL_EMPLOYEE_ROLES.map(role=>[role,employees.capabilitiesForEmployeeRole(role)]))};
const sqlGrants={};
for(const [domain,type] of Object.entries(domains)){
  inventory[domain]=Object.fromEntries(['owner','manager','partner_operations_manager','staff','viewer'].map(role=>[role,catalog.capabilitiesForMembership(type,role)]).filter(([,capabilities])=>capabilities.length));
  sqlGrants[type]=inventory[domain];
}
const compiled=`-- BEGIN GENERATED ORGANISATION CAPABILITIES\nCREATE OR REPLACE FUNCTION public.ops_organisation_capabilities(p_type text,p_role text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $cap$ SELECT coalesce('${JSON.stringify(sqlGrants).replace(/'/g,"''")}'::jsonb->p_type->p_role,'[]'::jsonb) $cap$;
REVOKE ALL ON FUNCTION public.ops_organisation_capabilities(text,text) FROM PUBLIC,anon,authenticated,service_role;
-- END GENERATED ORGANISATION CAPABILITIES`;
const migration=path.join(root,'scripts/071_external_account_domains.sql');
const original=fs.readFileSync(migration,'utf8').replaceAll('\r\n','\n');
const updated=original.includes('-- BEGIN GENERATED ORGANISATION CAPABILITIES') ? original.replace(/-- BEGIN GENERATED ORGANISATION CAPABILITIES[\s\S]*?-- END GENERATED ORGANISATION CAPABILITIES/,()=>compiled) : original.replace('BEGIN;',()=>`BEGIN;\n${compiled}`);
const json=JSON.stringify(inventory,null,2)+'\n',target=path.join(root,'docs/architecture/account-domain-capabilities.json');
if(process.argv.includes('--check')) {
  if(updated!==original||!fs.existsSync(target)||fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==json) throw Error('Account catalog generated contracts are stale');
  console.log('Account domain catalog and compiled PostgreSQL grants match');
} else { fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(migration,updated);fs.writeFileSync(target,json); }

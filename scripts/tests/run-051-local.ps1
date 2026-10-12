# Disposable local-only verification. Never consumes .env or remote connection strings.
param([ValidateRange(1, 2147483647)][int]$Runs = 2, [string]$Image = 'public.ecr.aws/supabase/postgres:17.6.1.165')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$evidence = [System.Collections.Generic.List[object]]::new()
function Invoke-LocalDocker([string[]]$Arguments, [bool]$ExpectFailure = $false) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & docker --context desktop-linux @Arguments 2>&1; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $previous }
  $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  $evidence.Add([pscustomobject]@{command=('docker --context desktop-linux ' + ($Arguments -join ' '));exitCode=$code;output=$text})
  Write-Host $text
  if (($ExpectFailure -and $code -eq 0) -or (-not $ExpectFailure -and $code -ne 0)) { throw "Unexpected Docker result $code" }
  return $text
}
function Get-Definition([string]$Content,[string]$Pattern) {
  $match = [regex]::Match($Content,$Pattern)
  if (-not $match.Success) { throw "Required repository definition missing: $Pattern" }
  return $match.Value
}
$catalog = [IO.File]::ReadAllText((Join-Path $repo 'scripts/reward-catalog.sql'))
$helper = [IO.File]::ReadAllText((Join-Path $repo 'scripts/033_phase1_security_hardening.sql'))
$schema = [IO.File]::ReadAllText((Join-Path $repo 'scripts/schema_visualizer.sql'))
$bootstrap = @'
\set ON_ERROR_STOP on
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
'@
$bootstrap += "`n" + (Get-Definition $schema 'CREATE TABLE public\.admin_users \([\s\S]*?\r?\n\);')
$bootstrap += "`n" + (Get-Definition $helper 'CREATE OR REPLACE FUNCTION public\.is_dashboard_admin\(\)[\s\S]*?GRANT EXECUTE ON FUNCTION public\.is_dashboard_admin\(\) TO authenticated;')
foreach ($table in @('reward_partner','reward_catalog')) { $bootstrap += "`n" + (Get-Definition $catalog ("create table if not exists public\."+$table+' \([\s\S]*?\r?\n\);')) }
$bootstrap += "`nALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;`nCREATE POLICY `"Public read active rewards`" ON public.reward_catalog FOR SELECT TO PUBLIC USING (status = 'active');`n"
$migration = [IO.File]::ReadAllText((Join-Path $repo 'scripts/051_partner_physical_locations.sql'))
$forced = $migration.Replace('COMMIT;', 'DO $forced$ BEGIN RAISE EXCEPTION ''local-forced-migration-failure''; END $forced$;' + "`nCOMMIT;")
$guard = @'
DO $guard$ BEGIN
 IF to_regclass('public.reward_partner_location') IS NOT NULL OR to_regclass('public.reward_partner_identity_org') IS NOT NULL OR to_regprocedure('public.save_partner_location(uuid,jsonb,uuid,text)') IS NOT NULL THEN RAISE EXCEPTION 'Failed migration left partial schema'; END IF;
END $guard$;
'@
$passed = 0
try {
  [void](Invoke-LocalDocker @('info','--format','{{.ServerVersion}}'))
  [void](Invoke-LocalDocker @('image','inspect',$Image,'--format','{{json .RepoDigests}}'))
  for ($round=1; $round -le $Runs; $round++) {
    $suffix = [guid]::NewGuid().ToString('N').Substring(0,12)
    $container = "movrr-051-db-$suffix"; $network = "movrr-051-net-$suffix"; $volume = "movrr-051-data-$suffix"
    $createdNetwork=$false; $createdVolume=$false; $createdContainer=$false
    $temp = Join-Path ([IO.Path]::GetTempPath()) "movrr-051-$suffix"
    [void][IO.Directory]::CreateDirectory($temp)
    foreach ($file in @{ 'bootstrap.sql'=$bootstrap; 'forced.sql'=$forced; 'guard.sql'=$guard }.GetEnumerator()) { [IO.File]::WriteAllText((Join-Path $temp $file.Key),$file.Value,[Text.UTF8Encoding]::new($false)) }
    try {
      [void](Invoke-LocalDocker @('network','create','--internal','--label','movrr.task=051-local-verification',$network)); $createdNetwork=$true
      [void](Invoke-LocalDocker @('volume','create','--label','movrr.task=051-local-verification',$volume)); $createdVolume=$true
      [void](Invoke-LocalDocker @('run','--pull=never','-d','--name',$container,'--label','movrr.task=051-local-verification','--network',$network,'--mount',"source=$volume,target=/var/lib/postgresql/data",'-e','POSTGRES_PASSWORD=disposable-local-only','-e','POSTGRES_DB=movrr_051_test',$Image)); $createdContainer=$true
      $ready=$false
      for ($attempt=0; $attempt -lt 30; $attempt++) { try { $pidOne = Invoke-LocalDocker @('exec',$container,'cat','/proc/1/comm'); if ($pidOne.Trim() -notin @('postgres','.postgres-wrapp')) { Start-Sleep -Milliseconds 1000; continue }; [void](Invoke-LocalDocker @('exec',$container,'pg_isready','-U','supabase_admin')); $ready=$true; break } catch { Start-Sleep -Milliseconds 1000 } }
      if (-not $ready) { throw 'Local database not ready' }
      [void](Invoke-LocalDocker @('exec',$container,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','movrr_051_test','-c',"SELECT version(),current_database(); SELECT to_regclass('auth.users'),to_regprocedure('auth.uid()'),to_regprocedure('gen_random_uuid()');"))
      # Require actual Supabase image auth primitives; no guessed auth replacement.
      $authCheck="DO `$authcheck`$ BEGIN IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'Supabase baseline missing'; END IF; END `$authcheck`$;"
      [IO.File]::WriteAllText((Join-Path $temp 'authcheck.sql'),$authCheck,[Text.UTF8Encoding]::new($false))
      $files=@{'authcheck.sql'=(Join-Path $temp 'authcheck.sql');'bootstrap.sql'=(Join-Path $temp 'bootstrap.sql');'forced.sql'=(Join-Path $temp 'forced.sql');'guard.sql'=(Join-Path $temp 'guard.sql');'integration.sql'=(Join-Path $repo 'scripts/tests/051_partner_locations.integration.sql');'local.sql'=(Join-Path $repo 'scripts/tests/051_partner_locations.local.sql')}
      foreach($name in @('040_organisations_rbac.sql','041_platform_audit_idempotency.sql','045_reward_partner_organisation_link.sql','046_platform_rate_limit_hit.sql','051_partner_physical_locations.sql')) { $files[$name]=Join-Path $repo "scripts/$name" }
      foreach($file in $files.GetEnumerator()) { [void](Invoke-LocalDocker @('cp',$file.Value,"$($container):/tmp/$($file.Key)")) }
      $psql=@('exec',$container,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','movrr_051_test','-f')
      foreach($file in @('authcheck.sql','bootstrap.sql','040_organisations_rbac.sql','041_platform_audit_idempotency.sql','045_reward_partner_organisation_link.sql')) { [void](Invoke-LocalDocker ($psql+"/tmp/$file")) }
      $missingPrerequisite=Invoke-LocalDocker ($psql+'/tmp/051_partner_physical_locations.sql') $true
      if ($missingPrerequisite -notmatch 'Apply atomic rate limiter migration 046 first') { throw 'Unexpected missing-prerequisite error' }
      [void](Invoke-LocalDocker ($psql+'/tmp/guard.sql'))
      [void](Invoke-LocalDocker ($psql+'/tmp/046_platform_rate_limit_hit.sql'))
      $forcedResult=Invoke-LocalDocker ($psql+'/tmp/forced.sql') $true
      if($forcedResult -notmatch 'local-forced-migration-failure') { throw 'Unexpected forced-failure result' }
      [void](Invoke-LocalDocker ($psql+'/tmp/guard.sql'))
      foreach($file in @('051_partner_physical_locations.sql','integration.sql','local.sql')) { [void](Invoke-LocalDocker ($psql+"/tmp/$file")) }
      $passed++
    } finally {
      if($createdContainer) { [void](Invoke-LocalDocker @('rm','-f',$container)) }
      if($createdVolume) { [void](Invoke-LocalDocker @('volume','rm',$volume)) }
      if($createdNetwork) { [void](Invoke-LocalDocker @('network','rm',$network)) }
    }
  }
} finally {
  $reportPath = Join-Path ([IO.Path]::GetTempPath()) 'movrr-051-local-verification.json'
  [IO.File]::WriteAllText($reportPath,([pscustomobject]@{image=$Image;requestedRuns=$Runs;passedRuns=$passed;commands=$evidence} | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  Write-Host "Evidence: $reportPath; clean runs passed: $passed/$Runs"
}
if($passed -lt 1 -or $passed -ne $Runs) { throw 'Not all clean setups passed' }

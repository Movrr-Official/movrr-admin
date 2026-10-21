param([ValidateSet('candidates','poll','hold','promote','release','final')][Parameter(Mandatory=$true)][string]$Phase)
$ErrorActionPreference = 'Stop'
$root = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '../../..')) '.tmp/enterprise-identity-rollout-20261021'
$scope = 'movrrops-projects'
$projects = @(
 @{Key='admin';Name='movrr-admin';Id='prj_VdWMMAnBPo7u5G9RPmlA6t9hMgCT';Repo=1084919487;Sha='8d7320ea96325bbc9adbc67f7e4b820baba9c5e1';Domain='admin.movrr.nl';Pattern='^/(users|advertisers|partners|government|workboard|notifications|settings)(/.*)?$|^/api/(users|advertisers|v1/(organisations|partners/staff|government|me/memberships))(/.*)?$'},
 @{Key='web';Name='movrr-app';Id='prj_I89dOyt1njax9XYP3aZBHNtprqwF';Repo=1176909032;Sha='5e44a6fdc8a03ab2241b43faef5dd7e1a27cc5b0';Domain='app.movrr.nl';Pattern='^/(dashboard|workspace|workspaces|invitations|invite|auth/accept-organisation-invitation|api/dashboard)(/.*)?$'}
)
function Save($name,$data) { [IO.File]::WriteAllText((Join-Path $root $name),($data | ConvertTo-Json -Depth 100),(New-Object Text.UTF8Encoding $false)) }
function Api($endpoint,$method='GET',$body=$null) {
 $apiArgs=@('api',$endpoint,'--scope',$scope,'--raw')
 if($method -ne 'GET'){$apiArgs+=@('-X',$method)}
 if($null -ne $body){Save 'api-request.json' $body;$apiArgs+=@('--input',(Join-Path $root 'api-request.json'))}
 $raw=& vercel.cmd @apiArgs
 if($LASTEXITCODE -ne 0){throw "Vercel API failed: $method $endpoint"}
 return ($raw -join "`n" | ConvertFrom-Json)
}
foreach($p in $projects){
 $k=$p.Key;$projectQuery="?projectId=$($p.Id)";$candidateFile=Join-Path $root "$k-candidate.json"
 if($Phase -eq 'candidates'){
  if(Test-Path -LiteralPath $candidateFile){throw 'Candidate already recorded; inspect before retry'}
  $project=Api "/v9/projects/$($p.Id)";Save "$k-project-before.json" $project
  if($project.link.repoId -ne $p.Repo){throw 'Repository linkage mismatch'}
  $body=@{name=$p.Name;project=$p.Id;target='production';autoAssignCustomDomains=$false;gitSource=@{type='github';repoId=[string]$p.Repo;ref=$p.Sha;sha=$p.Sha}}
  $d=Api '/v13/deployments' 'POST' $body;Save "$k-candidate.json" $d
  if($d.gitSource.sha -ne $p.Sha -or $d.autoAssignCustomDomains -ne $false){throw 'Candidate source/alias setting mismatch'}
  Write-Output "$k candidate $($d.id): $($d.readyState)"
 }
 if($Phase -in @('poll','promote','final')){
  $candidate=Get-Content -Raw $candidateFile | ConvertFrom-Json
  $d=Api "/v13/deployments/$($candidate.id)";Save "$k-runtime.json" $d
  if($d.gitSource.sha -ne $p.Sha){throw 'Deployment source mismatch'}
  Write-Output "$k $($d.id) $($d.readyState) sha=$($d.gitSource.sha)"
  if($d.readyState -in @('ERROR','CANCELED')){throw 'Candidate build failed'}
  if($Phase -eq 'promote'){
   if($d.readyState -ne 'READY' -or $d.autoAssignCustomDomains -ne $false){throw 'Unready/unexpected candidate'}
   $hold=Api "/v1/security/firewall/config/active$projectQuery"
   if(@($hold.rules | Where-Object {$_.name -eq 'MOVRR enterprise identity approved cutover 2026-10-21'}).Count -ne 1){throw 'Verified cutover hold missing'}
   $promoted=Api "/v10/projects/$($p.Id)/promote/$($d.id)" 'POST' @{};Save "$k-promotion.json" $promoted
   Write-Output "$k promotion requested"
  }
  if($Phase -eq 'final'){
   $project=Api "/v9/projects/$($p.Id)";Save "$k-project-final.json" $project
   $alias=Api "/v4/aliases/$($p.Domain)";Save "$k-alias-final.json" $alias
   if($project.targets.production.id -ne $d.id -or $alias.deployment.id -ne $d.id){throw 'Production alias/target mismatch'}
   $firewall=Api "/v1/security/firewall/config/active$projectQuery";Save "$k-firewall-final.json" $firewall
   if(@($firewall.rules).Count -ne 0 -or $firewall.firewallEnabled -ne $true){throw 'Unexpected final firewall state'}
  }
 }
 if($Phase -in @('hold','release')){
  $before=Api "/v1/security/firewall/config/active$projectQuery";Save "$k-firewall-$Phase-before.json" $before
  if($Phase -eq 'hold'){
   if(@($before.rules).Count -eq 1 -and $before.rules[0].name -eq 'MOVRR enterprise identity approved cutover 2026-10-21' -and $before.rules[0].conditionGroup[0].conditions[0].value -eq $p.Pattern -and $before.rules[0].active -eq $true -and $before.rules[0].action.mitigate.action -eq 'deny'){Save "$k-firewall-hold-active.json" $before;Write-Output "$k existing owned hold verified";continue}; if(@($before.rules).Count -ne 0 -or $before.firewallEnabled -ne $true){throw 'Unexpected active firewall rules'}
   $body=@{action='rules.insert';id=$null;value=@{active=$true;name='MOVRR enterprise identity approved cutover 2026-10-21';description='Temporary scoped identity contract cutover; preserve rider authentication, financial operations and deletion intake';conditionGroup=@(@{conditions=@(@{type='path';op='re';value=$p.Pattern})});action=@{mitigate=@{action='deny'}}}}
  }else{
   $rules=@($before.rules | Where-Object {$_.name -eq 'MOVRR enterprise identity approved cutover 2026-10-21'})
   if($rules.Count -ne 1){throw 'Cannot identify exactly one owned cutover hold'}
   $body=@{action='rules.remove';id=$rules[0].id}
  }
  $draft=Api "/v1/security/firewall/config$projectQuery" 'PATCH' $body;Save "$k-firewall-$Phase-draft.json" $draft
  $active=Api "/v1/security/firewall/config/active$projectQuery";Save "$k-firewall-$Phase-active.json" $active
  $expected=if($Phase -eq 'hold'){1}else{0}
  if(@($active.rules).Count -ne $expected -or $active.firewallEnabled -ne $true){throw 'Firewall activation verification failed'}
  Write-Output "$k $Phase verified at firewall version $($active.version)"
 }
}
if($Phase -eq 'hold'){Save 'holds-verified.json' @{active=$true;recordedAt=[DateTime]::UtcNow.ToString('o');projects=@($projects.Id)}}
if($Phase -eq 'release'){Save 'holds-released.json' @{active=$false;recordedAt=[DateTime]::UtcNow.ToString('o')}}

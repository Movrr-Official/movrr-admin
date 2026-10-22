param([ValidateSet('candidate','poll','promote','final')][Parameter(Mandatory=$true)][string]$Phase)
# Owner-approved release of b9b0c66 + e0bbd5c (Rider status command and Rider-first routes).
# Same procedure as scripts/manual/rider-identity/deploy-production.ps1; migration 081 must be verified first.
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$releaseOut=Join-Path $repoRoot '.tmp/rider-status-rollout-20261022'
[IO.Directory]::CreateDirectory($releaseOut)|Out-Null
$scope='movrrops-projects';$projectId='prj_VdWMMAnBPo7u5G9RPmlA6t9hMgCT';$sha='e0bbd5c';$domain='admin.movrr.nl'
$sha=(& git -C $repoRoot rev-parse "$sha^{commit}").Trim()
function Save($name,$data){[IO.File]::WriteAllText((Join-Path $releaseOut $name),($data|ConvertTo-Json -Depth 100),(New-Object Text.UTF8Encoding $false))}
function Api($endpoint,$method='GET',$body=$null){
 $apiArgs=@('api',$endpoint,'--scope',$scope,'--raw')
 if($method -ne 'GET'){$apiArgs+=@('-X',$method)}
 if($null -ne $body){Save 'api-request.json' $body;$apiArgs+=@('--input',(Join-Path $releaseOut 'api-request.json'))}
 $raw=& vercel.cmd @apiArgs
 if($LASTEXITCODE -ne 0){throw "Vercel API failed: $method $endpoint"}
 return ($raw -join "`n"|ConvertFrom-Json)
}
function Assert-Migration {
 $verified=Get-Content -Raw (Join-Path $repoRoot 'docs/verification/rider-status-081/verified.json')|ConvertFrom-Json
 if($verified.journal.version -ne '20261022150000' -or $verified.journal.checksum -ne $verified.sha256 -or $verified.function[0].authenticated -ne $false -or $verified.function[0].service_role -ne $true){throw 'Migration 081 readback missing or mismatched'}
}
if($Phase -eq 'candidate'){
 if(Test-Path -LiteralPath (Join-Path $releaseOut 'admin-candidate.json')){throw 'Candidate exists; inspect before retry'}
 Assert-Migration
 $project=Api "/v9/projects/$projectId";Save 'admin-project-before.json' $project
 if($project.link.repoId -ne 1084919487){throw 'Repository linkage mismatch'}
 $prior=Api "/v4/aliases/$domain";Save 'admin-alias-before.json' $prior
 $priorRuntime=Api "/v13/deployments/$($prior.deployment.id)";Save 'admin-runtime-before.json' $priorRuntime
 & git -C $repoRoot merge-base --is-ancestor $priorRuntime.gitSource.sha $sha
 if($LASTEXITCODE -ne 0){throw 'Approved deployment omits current production source; abort'}
 Save 'admin-firewall-before.json' (Api "/v1/security/firewall/config/active?projectId=$projectId")
 $d=Api '/v13/deployments' 'POST' @{name='movrr-admin';project=$projectId;target='production';autoAssignCustomDomains=$false;gitSource=@{type='github';repoId='1084919487';ref=$sha;sha=$sha}}
 Save 'admin-candidate.json' $d
 if($d.gitSource.sha -ne $sha -or $d.autoAssignCustomDomains -ne $false){throw 'Candidate source/domain mismatch'}
 Write-Output "candidate $($d.id) $($d.readyState) sha=$($d.gitSource.sha) prior=$($prior.deployment.id) priorSha=$($priorRuntime.gitSource.sha)";exit
}
if(-not (Test-Path -LiteralPath (Join-Path $releaseOut 'admin-candidate.json'))){throw 'Reviewed candidate and baseline required'}
$candidate=Get-Content -Raw (Join-Path $releaseOut 'admin-candidate.json')|ConvertFrom-Json
$d=Api "/v13/deployments/$($candidate.id)";Save 'admin-runtime.json' $d
if($d.gitSource.sha -ne $sha -or $d.readyState -in @('ERROR','CANCELED')){throw 'Candidate source/build failure'}
Write-Output "$($d.id) $($d.readyState) sha=$($d.gitSource.sha)"
if($Phase -eq 'promote'){
 if($d.readyState -ne 'READY' -or $d.autoAssignCustomDomains -ne $false){throw 'Candidate not ready or domain assignment changed'}
 Assert-Migration
 $prior=Get-Content -Raw (Join-Path $releaseOut 'admin-alias-before.json')|ConvertFrom-Json
 if((Api "/v4/aliases/$domain").deployment.id -ne $prior.deployment.id){throw 'Concurrent production deployment; abort promotion'}
 Save 'admin-promotion.json' (Api "/v10/projects/$projectId/promote/$($d.id)" 'POST' @{})
 Write-Output 'Promotion requested'
}
if($Phase -eq 'final'){
 $project=Api "/v9/projects/$projectId";Save 'admin-project-final.json' $project
 $alias=Api "/v4/aliases/$domain";Save 'admin-alias-final.json' $alias
 if($project.targets.production.id -ne $d.id -or $alias.deployment.id -ne $d.id){throw 'Production target/domain mismatch'}
 $firewall=Api "/v1/security/firewall/config/active?projectId=$projectId";Save 'admin-firewall-final.json' $firewall
 $before=Get-Content -Raw (Join-Path $releaseOut 'admin-firewall-before.json')|ConvertFrom-Json
 if($firewall.firewallEnabled -ne $true -or ($firewall.rules|ConvertTo-Json -Depth 100) -ne ($before.rules|ConvertTo-Json -Depth 100)){throw 'Firewall protection changed'}
 Write-Output "Verified production alias, target and firewall: $($d.id)"
}

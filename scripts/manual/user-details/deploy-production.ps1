param([ValidateSet('candidate','poll','promote','final')][Parameter(Mandatory=$true)][string]$Phase)
$ErrorActionPreference='Stop'
$releaseOut=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '../../..')) '.tmp/user-details-deploy-20261021'
$scope='movrrops-projects';$projectId='prj_VdWMMAnBPo7u5G9RPmlA6t9hMgCT';$sha='fec76ef8afce1bdb8bc2197cc54561f8840662aa';$domain='admin.movrr.nl'
function Save($name,$data){[IO.File]::WriteAllText((Join-Path $releaseOut $name),($data|ConvertTo-Json -Depth 100),(New-Object Text.UTF8Encoding $false))}
function Api($endpoint,$method='GET',$body=$null){
 $apiArgs=@('api',$endpoint,'--scope',$scope,'--raw')
 if($method -ne 'GET'){$apiArgs+=@('-X',$method)}
 if($null -ne $body){Save 'api-request.json' $body;$apiArgs+=@('--input',(Join-Path $releaseOut 'api-request.json'))}
 $raw=& vercel.cmd @apiArgs
 if($LASTEXITCODE -ne 0){throw "Vercel API failed: $method $endpoint"}
 return ($raw -join "`n"|ConvertFrom-Json)
}
if($Phase -eq 'candidate'){
 if(Test-Path -LiteralPath (Join-Path $releaseOut 'admin-candidate.json')){throw 'Candidate already exists; inspect before retry'}
 $project=Api "/v9/projects/$projectId";Save 'admin-project-before.json' $project
 if($project.link.repoId -ne 1084919487){throw 'Repository linkage mismatch'}
 Save 'admin-alias-before.json' (Api "/v4/aliases/$domain")
 Save 'admin-firewall-before.json' (Api "/v1/security/firewall/config/active?projectId=$projectId")
 $body=@{name='movrr-admin';project=$projectId;target='production';autoAssignCustomDomains=$false;gitSource=@{type='github';repoId='1084919487';ref=$sha;sha=$sha}}
 $d=Api '/v13/deployments' 'POST' $body;Save 'admin-candidate.json' $d
 if($d.gitSource.sha -ne $sha -or $d.autoAssignCustomDomains -ne $false){throw 'Candidate source/domain assignment mismatch'}
 Write-Output "candidate $($d.id) $($d.readyState) sha=$($d.gitSource.sha)"
 exit
}
$candidate=Get-Content -Raw (Join-Path $releaseOut 'admin-candidate.json')|ConvertFrom-Json
$d=Api "/v13/deployments/$($candidate.id)";Save 'admin-runtime.json' $d
if($d.gitSource.sha -ne $sha){throw 'Deployment source mismatch'}
if($d.readyState -in @('ERROR','CANCELED')){throw 'Candidate build failed'}
Write-Output "$($d.id) $($d.readyState) sha=$($d.gitSource.sha)"
if($Phase -eq 'promote'){
 if($d.readyState -ne 'READY' -or $d.autoAssignCustomDomains -ne $false){throw 'Candidate not ready or unexpected domain assignment'}
 $verified=Get-Content -Raw (Join-Path $releaseOut 'source-preflight.json')|ConvertFrom-Json
 if($verified.revision -ne $sha -or $verified.migrationRequired -ne $false -or $verified.testsPassed -ne 966){throw 'Exact-source preflight missing'}
 $baseline='admin-alias-before.json'
 $prior=Get-Content -Raw (Join-Path $releaseOut $baseline)|ConvertFrom-Json
 $current=Api "/v4/aliases/$domain"
 if($current.deployment.id -ne $prior.deployment.id){throw 'Concurrent production alias change; inspect before promotion'}
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

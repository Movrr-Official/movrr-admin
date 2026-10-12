# Deterministic parameter validation only: no database or Docker resources.
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-051-local.ps1'
$script:dockerInvocations = 0
function docker { $script:dockerInvocations++; throw 'Docker must never execute during invalid-argument tests' }
$passed = 0
foreach ($value in @(0, -1, -99)) {
  $rejected = $false
  try { & $runner -Runs $value } catch { if ($_.FullyQualifiedErrorId -notmatch 'ParameterArgumentValidationError') { throw }; $rejected = $true }
  if (-not $rejected) { throw "Invalid Runs=$value was not rejected by parameter binding" }
  $passed++
}
if ($script:dockerInvocations -ne 0) { throw 'Invalid argument caused Docker activity' }
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($runner, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Runner contains PowerShell syntax errors' }
$runsParameter = $ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq 'Runs' }
$range = $runsParameter.Attributes | Where-Object { $_.TypeName.FullName -eq 'ValidateRange' }
if (-not $range -or $range.PositionalArguments[0].Value -ne 1 -or $range.PositionalArguments[1].Value -ne 2147483647) { throw 'Positive execution count validation missing' }
$argumentOnly = [scriptblock]::Create($ast.ParamBlock.Extent.Text + "`nreturn `$Runs")
foreach ($value in @(1, 2, 2147483647)) { if ((& $argumentOnly -Runs $value) -ne $value) { throw 'Positive execution count rejected' }; $passed++ }
if (-not ([IO.File]::ReadAllText($runner).Contains('if($passed -lt 1 -or $passed -ne $Runs)'))) { throw 'Nonzero successful execution guard missing' }
Write-Host "PASS: $passed argument checks; no Docker invocation; runner syntax and successful-run guard verified"

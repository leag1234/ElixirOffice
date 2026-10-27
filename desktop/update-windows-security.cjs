// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Native Windows qualification remains a release gate. No PowerShell is run
// at import/construction, and paths are environment data, never script source.
const path=require('node:path'),cp=require('node:child_process');
const VERIFY=("$ErrorActionPreference='Stop'; $p=$env:EO_UPDATE_SOURCE; "+
   "if (([IO.File]::GetAttributes($p) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {exit 1}; "+
   "$acl=if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)}; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; "+
   "if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid) {exit 1}; "+
   "$allowed=@($sid,'S-1-5-18','S-1-5-32-544'); "+
   "foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) { "+
   "if($r.AccessControlType -eq 'Allow' -and $allowed -notcontains $r.IdentityReference.Value) {exit 1} }; "+
   "[Console]::Write('OK')");
const MOVE="$ErrorActionPreference='Stop'; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class EOUpdateMove { [DllImport(\"kernel32.dll\", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool MoveFileEx(string a,string b,int flags); }'; "+
 "if(-not [EOUpdateMove]::MoveFileEx($env:EO_UPDATE_SOURCE,$env:EO_UPDATE_DEST,9)) {exit 1}; [Console]::Write('OK')";
// UUID.v5(appId, builder26.15.3 NSIS namespace); no registry enumeration.
const INSTALLED="$ErrorActionPreference='Stop';\n$wanted=[IO.Path]::GetFullPath($env:EO_UPDATE_SOURCE).TrimEnd('\\');\nforeach($hive in @([Microsoft.Win32.Registry]::CurrentUser,[Microsoft.Win32.Registry]::LocalMachine)){\n $installation=$hive.OpenSubKey('Software\\5fa5daf2-a61b-5cb4-8b40-2391c8734adc');\n $entry=$hive.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\5fa5daf2-a61b-5cb4-8b40-2391c8734adc');\n try{\n  if($null -eq $installation -or $null -eq $entry){continue};\n  $location=[string]$installation.GetValue('InstallLocation');\n  $command=[string]$entry.GetValue('UninstallString');\n  $uninstaller='\"'+[IO.Path]::Combine($wanted,'Uninstall ElixirOffice.exe')+'\"';\n  if($entry.GetValue('DisplayName') -ceq 'ElixirOffice' -and $location -and\n   [string]::Equals([IO.Path]::GetFullPath($location).TrimEnd('\\'),$wanted,[StringComparison]::OrdinalIgnoreCase) -and\n   ($command -ceq ($uninstaller+' /currentuser') -or $command -ceq ($uninstaller+' /allusers'))){[Console]::Write('OK');exit 0};\n }finally{if($null -ne $installation){$installation.Dispose()};if($null -ne $entry){$entry.Dispose()}};\n}; exit 1";
function createWindowsSecurity({platform=process.platform,systemRoot=process.env.SystemRoot,execFileSync=cp.execFileSync}={}){
 if(platform!=='win32'||typeof systemRoot!=='string'||!/^[A-Za-z]:\\[A-Za-z0-9 _-]+$/.test(systemRoot))throw Error('Windows update security unavailable');
 const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 function run(script,source,dest=''){
  if(typeof source!=='string'||!path.win32.isAbsolute(source)||source.includes('\0')||typeof dest!=='string'||dest.includes('\0'))return false;
  try{return execFileSync(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
   {shell:false,encoding:'utf8',timeout:15000,maxBuffer:8192,windowsHide:true,stdio:['ignore','pipe','ignore'],
    env:{SystemRoot:systemRoot,WINDIR:systemRoot,EO_UPDATE_SOURCE:source,EO_UPDATE_DEST:dest}}).trim()==='OK';}catch{return false;}
 }
 return Object.freeze({installed:async directory=>run(INSTALLED,directory),verify:async file=>run(VERIFY,file),
  replace:async(from,to)=>path.win32.isAbsolute(to)&&run(VERIFY,from)&&run(MOVE,from,to),
  // Windows directory fsync has no Node equivalent. Every promotion uses
  // MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH); files are fsynced first.
  flush:async directory=>run(VERIFY,directory)});
}
module.exports={createWindowsSecurity};

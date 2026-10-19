// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {execFile}=require('node:child_process'),path=require('node:path');
const program=String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
$eoFiles = New-Object 'System.Collections.Generic.List[string]'
$eoErrors = New-Object 'System.Collections.Generic.HashSet[string]'
$eoChars = 0
foreach ($eoRoot in @([Microsoft.Win32.Registry]::LocalMachine, [Microsoft.Win32.Registry]::CurrentUser)) {
  $eoKey = $null
  try {
    $eoKey = $eoRoot.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', $false)
    if ($null -eq $eoKey) { continue }
    foreach ($eoName in $eoKey.GetValueNames()) {
      try {
        $eoValue = $eoKey.GetValue($eoName, $null)
        if ($eoValue -is [string]) {
          if ($eoValue.Length -gt 4096 -or $eoFiles.Count -ge 5000 -or $eoChars + $eoValue.Length -gt 131072) {
            [void]$eoErrors.Add('EINVAL')
          } else {
            [void]$eoFiles.Add($eoValue)
            $eoChars += $eoValue.Length
          }
        }
      } catch { [void]$eoErrors.Add('EACCES') }
    }
  } catch { [void]$eoErrors.Add('EACCES') }
  finally { if ($null -ne $eoKey) { $eoKey.Dispose() } }
}
@{ files = @($eoFiles.ToArray()); errors = @($eoErrors) } | ConvertTo-Json -Compress -Depth 3
`;
module.exports=async function registryFonts({report=()=>{}}={}){
 if(process.platform!=='win32')return [];
 const reported=new Set();
 const code=async value=>{if(/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(value||'')&&!reported.has(value)){reported.add(value);await report({code:value});}};
 try{
  const systemRoot=process.env.SystemRoot||process.env.WINDIR||'C:/Windows';
  const call=(file,args,timeout,encoding)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,maxBuffer:1024*1024,encoding},(error,stdout)=>error?reject(error):resolve(stdout)));
  let data;
  try{
   const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
   // This fixed read-only program is independent of registry names/path values.
   const output=await call(executable,['-NoProfile','-NonInteractive','-Command',program],1000,'utf8');
   data=JSON.parse(String(output).replace(/^\uFEFF/,''));
   if(!data||!Array.isArray(data.files)||data.files.length>5000||!Array.isArray(data.errors)||data.errors.length>32)throw Object.assign(Error('Invalid registry font result'),{code:'EINVAL'});
  }catch(error){
   await code(error?.killed?'ETIMEDOUT':/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(error?.code||'')?error.code:'EINVAL');
   data={files:[],errors:[]};
   const executable=path.win32.join(systemRoot,'System32','reg.exe'),key='SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';
   for(const hive of ['HKCU','HKLM']){
    try{
     const raw=await call(executable,['query',hive+'\\'+key],700,'buffer');
     const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(String(raw),'utf8');
     const wide=bytes.length>=2&&bytes[0]===255&&bytes[1]===254;
     if(wide&&bytes.length%2)throw Object.assign(Error('Invalid registry encoding'),{code:'EINVAL'});
     const encoding=wide?'utf16le':'latin1',decoder=new(require('node:util').TextDecoder)(wide?'utf-16le':'utf-8',{fatal:true});
     const lines=(wide?bytes.subarray(2):bytes).toString(encoding).split(/\r?\n/,10001);
     for(let row=0;row<lines.length;row++){
      if(row===10000){await code('EINVAL');break;}
      let line;
      try{line=decoder.decode(Buffer.from(lines[row],encoding));}
      catch{await code('EINVAL');continue;}
      const record=/^\s*.*?\s+(REG_SZ|REG_EXPAND_SZ)\s+(.+?)\s*$/.exec(line);
      if(!record)continue;
      if(data.files.length>=5000){await code('EINVAL');break;}
      data.files.push(record[2]);
     }
    }catch(error){await code(error?.code==='ERR_ENCODING_INVALID_ENCODED_DATA'?'EINVAL':error?.killed?'ETIMEDOUT':/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(error?.code||'')?error.code:'EINVAL');}
   }
  }
  for(const error of data.errors)await code(error);
  const env=Object.fromEntries(Object.entries(process.env).map(([name,value])=>[name.toLowerCase(),value])),files=[],seen=new Set();
  const system=path.win32.join(process.env.WINDIR||process.env.SystemRoot||'C:\\Windows','Fonts');
  for(let value of data.files){
   if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f]/.test(value)){await code('EINVAL');continue}
   value=value.replace(/%([^%]+)%/g,(match,name)=>env[name.toLowerCase()]||match);
   if(/%[^%]+%/.test(value)){await code('EINVAL');continue}
   if(!/\.(ttf|otf|ttc)$/i.test(value))continue;
   let filename;
   if(/^[a-z]:[\\/]/i.test(value)&&!value.slice(2).includes(':'))filename=path.win32.normalize(value);
   else if(!/[\\/:]/.test(value)&&value!=='.'&&value!=='..')filename=path.win32.join(system,value);
   else{await code('EINVAL');continue}
   const key=filename.toLowerCase();
   if(!seen.has(key)){seen.add(key);files.push(filename)}
  }
  return files;
 }catch(error){
  await code(error?.killed?'ETIMEDOUT':/^(?:E[A-Z0-9_]+|UNKNOWN)$/.test(error?.code||'')?error.code:'EINVAL');
  return [];
 }
};

'use strict';

function documentPaths(argv, documentPath) {
 const paths=[];
 for (const argument of argv) {
  const resolved=documentPath(argument);
  if(resolved&&!paths.includes(resolved))paths.push(resolved);
 }
 return paths;
}

function createLaunchQueue({max}) {
 const paths=[];
 return {
  push(path) {
   if(paths.includes(path))return 'duplicate';
   if(paths.length>=max)return 'limit';
   paths.push(path);return 'queued';
  },
  drain() {
   return paths.splice(0);
  },
  has(path) {
   return paths.includes(path);
  },
  get size() {
   return paths.length;
  },
  get length() {
   return paths.length;
  }
 };
}

module.exports={documentPaths,createLaunchQueue};

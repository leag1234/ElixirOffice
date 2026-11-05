// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {privateAddress}=require("../../desktop/pasted-image.cjs");
test("pasted pictures are never downloaded from local network addresses",()=>{
 for(const address of ["0.0.0.0","10.0.0.1","127.0.0.1","169.254.1.1","172.16.0.1","172.31.255.255","192.168.1.10","100.64.0.1","224.0.0.1","::","::1","fc00::1","fd12::1","fe80::1","ff02::1","::ffff:10.0.0.1"])
  assert.equal(privateAddress(address),true,address);
 for(const address of ["8.8.8.8","172.32.0.1","1.1.1.1","2606:4700:4700::1111","::ffff:8.8.8.8"])
  assert.equal(privateAddress(address),false,address);
});

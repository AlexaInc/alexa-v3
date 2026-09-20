"use strict";
const SUPPORTED = Object.freeze([
  {code:"en",name:"English"},{code:"si",name:"සිංහල"},{code:"ko",name:"한국어"},
  {code:"ja",name:"日本語"},{code:"fr",name:"Français"},{code:"ru",name:"Русский"},
]);
function normalize(value){ const code=String(value||"en").toLowerCase().split(/[-_]/)[0]; return SUPPORTED.some((item)=>item.code===code)?code:"en"; }
module.exports={SUPPORTED,normalize};

'use strict';
// Optional project-name ordering; assignments remain backwards-compatible strings.
function names(ledger){return [...new Set([...(ledger.meta.projects||[]),...ledger.ideas.map(i=>i.project),...ledger.sources.map(s=>s.project)])];}
function validate(value,fail){if(value===undefined)return;if(!Array.isArray(value)||value.some(n=>typeof n!=='string'||!n.trim())||new Set(value).size!==value.length)fail('meta.projects must contain distinct non-empty project names. Existing assignment names are preserved exactly.');}
module.exports={names,validate};

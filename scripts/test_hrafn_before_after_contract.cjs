'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const runner=fs.readFileSync('scripts/hrafn-before-after.mjs','utf8');
const report=fs.readFileSync('scripts/create_hrafn_ab_report.py','utf8');
for(const token of ['HRAFN_BEFORE_URL','HRAFN_AFTER_URL',"id:'dawn'","id:'noon'","id:'dusk'","id:'midnight'",'captureCanvas()','clock.pause();clock.setTime(hour)']) assert.ok(runner.includes(token),'Missing A/B feature: '+token);
for(const token of ['ImageChops.difference','ANTES','DESPUÉS']) assert.ok(report.includes(token),'Missing report feature: '+token);
console.log('HRAFN BEFORE/AFTER CONTRACT OK');

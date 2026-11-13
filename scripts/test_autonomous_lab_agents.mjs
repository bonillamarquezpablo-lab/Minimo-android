import assert from 'node:assert/strict';
process.env.AUTONOMOUS_AGENTS_TEST = '1';
const { analyzeEvidence } = await import('./autonomous-lab-agents.mjs');

const empty = analyzeEvidence({});
assert.equal(empty.summary.phases, 0);
assert.equal(empty.summary.failed, 0);
assert.ok(empty.summary.evidenceMissing.length >= 1);
assert.equal(empty.agents.find(agent => agent.id === 'npc-performance').status, 'insufficient-data');
assert.equal(empty.autonomy.sourceCodeModification, false);

const report = analyzeEvidence({
  unified: {
    level: 'deep',
    phases: [
      { name: 'Arranque', script: 'startup.mjs', status: 'passed', durationMs: 1000 },
      { name: 'Costas', script: 'coastal.mjs', status: 'failed', error: 'capture timeout' },
      { name: 'Comparación Hrafn', script: 'hrafn.mjs', status: 'skipped' },
      { name: 'Fase nueva', script: 'new-phase.mjs', status: 'not-run' }
    ]
  },
  player: { finalState: { modelReady: true } },
  texture: { readiness: { pendingTextures: ['missing-a.png'] } },
  grounding: { verdict: 'misaligned', summary: { errors: 1 } },
  custom: { captures: [{ id: 'shot-1' }], structures: [{ id: 'hut-1' }] },
  beforeAfter: { builds: { before: { performance: { averageFps: 60 } }, after: { performance: { averageFps: 52, frameTimeP95Ms: 19.5 } } } },
  files: []
});

assert.equal(report.summary.passed, 1);
assert.equal(report.summary.failed, 1);
assert.equal(report.summary.skipped, 1);
assert.equal(report.summary.unknown, 1);
assert.equal(report.agents.find(agent => agent.id === 'npc-validation').status, 'incomplete-evidence');
assert.ok(report.agents.find(agent => agent.id === 'npc-performance').findings.some(finding => finding.metric === 'frameTimeP95' && finding.value === 19.5));
assert.ok(report.tasks.some(task => task.id === 'investigate-coastal-mjs'));
assert.ok(report.tasks.some(task => task.id === 'investigate-fps-regression'));
assert.ok(report.tasks.some(task => task.id === 'inspect-world-grounding'));
assert.equal(report.agents.find(agent => agent.id === 'npc-performance').status, 'evidence-found');
assert.equal(report.agents.find(agent => agent.id === 'npc-world-geometry').status, 'evidence-found');
assert.equal(report.autonomy.deployment, false);

console.log('Autonomous specialist agent contracts: OK');

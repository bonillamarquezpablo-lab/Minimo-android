#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.resolve('artifacts/autonomous-agents');

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
  } catch {
    return null;
  }
}

function countArray(value) {
  return Array.isArray(value) ? value.length : null;
}

function getNumberDeep(source, aliases, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 8) return null;
  for (const [key, value] of Object.entries(source)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aliases.includes(normalized) && typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  for (const value of Object.values(source)) {
    const found = getNumberDeep(value, aliases, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

export function analyzeEvidence(evidence = {}) {
  const unified = evidence.unified || null;
  const results = unified?.results || {};
  const phases = Array.isArray(unified?.phases) ? unified.phases : [];
  const normalizedPhaseStatus = row => String(row?.status || '').toLowerCase();
  const failedPhases = phases.filter(row => ['failed', 'failure', 'error', 'timed_out', 'cancelled'].includes(normalizedPhaseStatus(row)));
  const skippedPhases = phases.filter(row => normalizedPhaseStatus(row) === 'skipped');
  const passedPhases = phases.filter(row => normalizedPhaseStatus(row) === 'passed');
  const unknownPhases = phases.filter(row => !['passed', 'skipped', 'failed', 'failure', 'error', 'timed_out', 'cancelled'].includes(normalizedPhaseStatus(row)));

  const player = evidence.player || null;
  const texture = evidence.texture || null;
  const grounding = evidence.grounding || null;
  const coastal = evidence.coastal || null;
  const custom = evidence.custom || null;
  const beforeAfter = evidence.beforeAfter || null;

  const afterPerformance = beforeAfter?.builds?.after?.performance || null;
  const beforePerformance = beforeAfter?.builds?.before?.performance || null;
  const afterFps = getNumberDeep(afterPerformance, ['averagefps', 'avgfps', 'medianfps', 'fps']);
  const beforeFps = getNumberDeep(beforePerformance, ['averagefps', 'avgfps', 'medianfps', 'fps']);
  const afterP95 = getNumberDeep(afterPerformance, ['p95frametime', 'p95frametimems', 'frametimep95ms', 'p95ms', 'framep95ms']);
  const pendingTextures = countArray(texture?.readiness?.pendingTextures)
    ?? countArray(custom?.readiness?.pendingTextures);
  const captures = countArray(custom?.captures);
  const structureCount = countArray(custom?.structures);
  const groundingVerdict = grounding?.verdict ?? null;
  const contactSheet = evidence.files?.includes('artifacts/custom-scene-captures/contact-sheet.png') || false;

  const agents = [];

  // NPC 01 — Performance specialist.
  const performanceFindings = [];
  if (afterPerformance && afterFps === null) {
    performanceFindings.push({ status: 'unusable-or-unknown', metric: 'afterFps', value: null, evidence: 'Hrafn performance object exists but contains no recognized finite FPS field.' });
  }
  if (afterFps !== null) {
    performanceFindings.push({
      status: 'measured',
      metric: 'afterFps',
      value: afterFps,
      unit: 'fps',
      evidence: 'Hrafn before/after report'
    });
  }
  if (beforeFps !== null && afterFps !== null) {
    const deltaPercent = beforeFps === 0 ? null : Number((((afterFps - beforeFps) / beforeFps) * 100).toFixed(2));
    performanceFindings.push({
      status: 'compared',
      metric: 'fpsDeltaPercent',
      value: deltaPercent,
      unit: '%',
      evidence: 'Same-run before/after comparison'
    });
    if (deltaPercent !== null && deltaPercent <= -5) {
      performanceFindings.push({
        status: 'regression-candidate',
        severity: 'high',
        message: 'The candidate FPS is at least 5% below its baseline; isolate the cause before changing quality or removing features.'
      });
    }
  }
  if (afterP95 !== null) {
    performanceFindings.push({
      status: 'measured',
      metric: 'frameTimeP95',
      value: afterP95,
      unit: 'ms',
      evidence: 'Hrafn performance report'
    });
  }
  agents.push({
    id: 'npc-performance',
    role: 'Especialista de rendimiento',
    scope: ['FPS', 'frame time', 'CPU/JavaScript', 'GPU when available', 'draw calls', 'startup'],
    status: performanceFindings.length ? 'evidence-found' : 'insufficient-data',
    findings: performanceFindings,
    guardrail: 'Never recommend lowering visual quality or removing gameplay systems as a first-line fix.'
  });

  // NPC 02 — Visual quality specialist. Captures are evidence, not an automatic quality verdict.
  const visualFindings = [];
  if (captures !== null) visualFindings.push({ metric: 'sceneCaptures', value: captures, unit: 'captures' });
  if (countArray(coastal?.captures) !== null) {
    visualFindings.push({ metric: 'coastalCaptures', value: countArray(coastal.captures), unit: 'captures' });
  }
  if (contactSheet) visualFindings.push({ metric: 'sceneContactSheet', value: 'available', unit: 'artifact' });
  visualFindings.push({
    status: 'visual-judgement-pending',
    message: 'No visual defect is confirmed from file counts or pixel differences alone. A vision-capable reviewer must inspect synchronized captures.'
  });
  agents.push({
    id: 'npc-visual-quality',
    role: 'Especialista de calidad visual',
    scope: ['water', 'foam', 'lighting', 'shadows', 'materials', 'textures', 'composition', 'visual regressions'],
    status: visualFindings.some(item => item.metric) ? 'evidence-collected-review-pending' : 'insufficient-data',
    findings: visualFindings,
    guardrail: 'Do not change the art direction, materials, resolution or effects based only on a pixel-difference score.'
  });

  // NPC 03 — World geometry specialist.
  const geometryFindings = [];
  if (hasValue(groundingVerdict)) {
    geometryFindings.push({ metric: 'groundingVerdict', value: groundingVerdict, unit: 'verdict' });
  }
  if (structureCount !== null) geometryFindings.push({ metric: 'structuralCandidates', value: structureCount, unit: 'objects' });
  const groundingErrors = grounding?.summary?.errors ?? grounding?.errors ?? null;
  if (typeof groundingErrors === 'number' && groundingErrors > 0) {
    geometryFindings.push({ status: 'issue-candidate', metric: 'groundingErrors', value: groundingErrors, unit: 'errors' });
  }
  if (groundingVerdict && !['grounded', 'pass', 'passed', 'ok'].includes(String(groundingVerdict).toLowerCase())) {
    geometryFindings.push({
      status: 'issue-candidate',
      message: 'The grounding audit did not return a clean verdict. Inspect the exact objects and coordinates before proposing a repair.'
    });
  }
  if (pendingTextures !== null && pendingTextures > 0) {
    geometryFindings.push({ status: 'issue-candidate', metric: 'pendingTextures', value: pendingTextures, unit: 'textures' });
  }
  agents.push({
    id: 'npc-world-geometry',
    role: 'Especialista de mundo y geometría',
    scope: ['13 islands', 'terrain', 'shoreline', 'structures', 'grounding', 'floating/intersecting objects', 'textures readiness'],
    status: geometryFindings.length ? 'evidence-found' : 'insufficient-data',
    findings: geometryFindings,
    guardrail: 'Do not reposition, delete or rebuild world objects without object-level evidence and a regression capture.'
  });

  // NPC 04 — QA and evidence coordinator.
  const qaFindings = failedPhases.map(row => ({
    status: 'failed-phase',
    phase: row.name,
    result: row.status,
    durationMs: row.durationMs ?? null,
    error: row.error ?? null
  }));
  agents.push({
    id: 'npc-validation',
    role: 'Especialista de pruebas y validación',
    scope: ['startup', 'test contracts', 'phase results', 'artifacts', 'regression gates'],
    status: failedPhases.length ? 'issues-found' : (unknownPhases.length ? 'incomplete-evidence' : (phases.length ? 'passed-or-skipped' : 'no-run-data')),
    findings: qaFindings.concat(unknownPhases.map(row => ({ status: 'unknown-phase-status', phase: row.name ?? null, result: row.status ?? null, error: row.error ?? null }))),
    guardrail: 'Skipped phases are not passes. Missing test evidence never counts as a successful validation.'
  });

  const tasks = [];
  for (const row of failedPhases) {
    tasks.push({
      id: 'investigate-' + String(row.script || row.name || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      priority: 'P1',
      owner: 'npc-validation',
      title: 'Investigar fase fallida: ' + row.name,
      evidence: row.error || row.status,
      nextAction: 'Reproducir la fase aislada, revisar sus logs y añadir una prueba de regresión antes de modificar el juego.'
    });
  }
  if (beforeFps !== null && afterFps !== null && beforeFps > 0 && afterFps < beforeFps * 0.95) {
    tasks.push({
      id: 'investigate-fps-regression',
      priority: 'P1',
      owner: 'npc-performance',
      title: 'Investigar regresión de FPS',
      evidence: 'Baseline ' + beforeFps + ' FPS; candidate ' + afterFps + ' FPS.',
      nextAction: 'Aislar la etapa responsable con contadores CPU/GPU y repetir la captura con la misma semilla y perfil.'
    });
  }
  if (groundingVerdict && !['grounded', 'pass', 'passed', 'ok'].includes(String(groundingVerdict).toLowerCase())) {
    tasks.push({
      id: 'inspect-world-grounding',
      priority: 'P2',
      owner: 'npc-world-geometry',
      title: 'Revisar objetos señalados por la auditoría de cimentación',
      evidence: 'grounding.verdict=' + groundingVerdict,
      nextAction: 'Obtener IDs, coordenadas y mallas exactas; no aplicar cambios globales.'
    });
  }
  if (!afterPerformance || afterFps === null) {
    tasks.push({
      id: 'collect-performance-evidence',
      priority: 'P2',
      owner: 'npc-performance',
      title: 'Completar evidencia de rendimiento comparable',
      evidence: 'No se ha localizado una métrica FPS válida en el manifiesto Hrafn.',
      nextAction: 'Comprobar el contrato del perfilador y mantener separados los resultados emulados de los obtenidos en Adreno.'
    });
  }
  if (!evidence.files?.includes('artifacts/custom-scene-captures/contact-sheet.png')) {
    tasks.push({
      id: 'collect-visual-evidence',
      priority: 'P2',
      owner: 'npc-visual-quality',
      title: 'Completar capturas visuales sincronizadas',
      evidence: 'No se ha encontrado la lámina de escena esperada.',
      nextAction: 'Repetir las cámaras y hora de captura; no inferir calidad visual de una ejecución sin imágenes.'
    });
  }

  const missing = [];
  if (!unified) missing.push('artifacts/unified-inspector/manifest.json');
  if (!player) missing.push('artifacts/player-startup/manifest.json');
  if (!texture) missing.push('artifacts/texture-readiness-smoke/manifest.json');
  if (!grounding) missing.push('artifacts/structure-grounding/manifest.json');
  if (!custom) missing.push('artifacts/custom-scene-captures/manifest.json');
  if (!beforeAfter) missing.push('artifacts/hrafn-before-after/manifest.json');

  return {
    schema: 1,
    project: 'EL SIN NOMBRE',
    kind: 'autonomous-specialist-agent-report',
    generatedAt: new Date().toISOString(),
    run: {
      id: process.env.GITHUB_RUN_ID || null,
      url: process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
        ? (process.env.GITHUB_SERVER_URL || 'https://github.com') + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID
        : null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF || null
    },
    summary: {
      inspectionLevel: unified?.level ?? null,
      phases: phases.length,
      passed: passedPhases.length,
      failed: failedPhases.length,
      skipped: skippedPhases.length,
      unknown: unknownPhases.length,
      evidenceMissing: missing
    },
    agents,
    tasks,
    autonomy: {
      evidenceCollection: 'automatic',
      specialistAnalysis: 'deterministic-evidence-rules',
      sourceCodeModification: false,
      deployment: false,
      note: 'This first unattended layer measures, classifies and assigns evidence-backed tasks. It does not write game source or publish unvalidated repairs.'
    },
    limitations: [
      'GitHub Actions Chromium/SwiftShader is a cloud test environment, not the physical Galaxy S26 Ultra Adreno GPU.',
      'No judgement of visual quality is inferred from screenshot counts or pixel differences alone.',
      'Unavailable metrics remain unknown; they are never fabricated as zero.',
      'The specialist rules are not LLM agents. A model-backed external agent requires a separately configured provider credential and an approved usage budget.'
    ]
  };
}

function renderMarkdown(report) {
  const lines = [
    '# EL SIN NOMBRE — Informe de agentes especialistas',
    '',
    '- Ejecución: ' + (report.run.url || report.run.id || 'local'),
    '- Commit: ' + (report.run.commit || 'no disponible'),
    '- Nivel: ' + (report.summary.inspectionLevel || 'no disponible'),
    '- Fases: ' + report.summary.passed + ' correctas · ' + report.summary.failed + ' fallidas · ' + report.summary.skipped + ' omitidas · ' + (report.summary.unknown || 0) + ' sin clasificar',
    '',
    '## Especialistas',
    ''
  ];
  for (const agent of report.agents) {
    lines.push('### ' + agent.role, '', '- Estado: **' + agent.status + '**');
    if (!agent.findings.length) lines.push('- Sin evidencias suficientes para emitir una conclusión.');
    for (const finding of agent.findings) {
      lines.push('- ' + (finding.message || finding.metric || finding.phase || 'Observación') +
        (hasValue(finding.value) ? ': **' + finding.value + (finding.unit ? ' ' + finding.unit : '') + '**' : '') +
        (finding.error ? ' — ' + finding.error : ''));
    }
    lines.push('- Límite: ' + agent.guardrail, '');
  }
  lines.push('## Tareas propuestas', '');
  if (!report.tasks.length) lines.push('No hay tareas justificadas por las evidencias disponibles.', '');
  for (const task of report.tasks) {
    lines.push('- **' + task.priority + ' · ' + task.title + '** (' + task.owner + ')', '  - Evidencia: ' + task.evidence, '  - Siguiente paso: ' + task.nextAction);
  }
  lines.push('', '## Alcance de autonomía', '', report.autonomy.note, '');
  return lines.join('\n');
}

async function publishStatus(report) {
  const token = process.env.INSPECTOR_GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!token || !repository || !runId) return 'not-configured';
  const branch = process.env.INSPECTOR_STATUS_BRANCH || 'inspector-status';
  const relative = 'runs/' + runId + '-agents.json';
  const endpoint = 'https://api.github.com/repos/' + repository + '/contents/' + relative;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
  const existing = await fetch(endpoint + '?ref=' + encodeURIComponent(branch), { headers });
  const payload = {
    message: 'Publish autonomous specialist report for run ' + runId,
    content: Buffer.from(JSON.stringify(report, null, 2) + '\n').toString('base64'),
    branch
  };
  if (existing.ok) {
    const previous = await existing.json();
    if (previous.sha) payload.sha = previous.sha;
  } else if (existing.status !== 404) {
    throw new Error('Could not inspect status branch path: HTTP ' + existing.status);
  }
  const response = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error('Could not publish specialist report: HTTP ' + response.status + ' ' + (await response.text()).slice(0, 500));
  return 'published';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const paths = {
    unified: 'artifacts/unified-inspector/manifest.json',
    player: 'artifacts/player-startup/manifest.json',
    texture: 'artifacts/texture-readiness-smoke/manifest.json',
    grounding: 'artifacts/structure-grounding/manifest.json',
    coastal: 'artifacts/coastal-reference/manifest.json',
    custom: 'artifacts/custom-scene-captures/manifest.json',
    beforeAfter: 'artifacts/hrafn-before-after/manifest.json'
  };
  const evidence = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, readJson(file)]));
  evidence.files = [
    'artifacts/custom-scene-captures/contact-sheet.png',
    'artifacts/coastal-reference/contact-sheet.png',
    'artifacts/hrafn-before-after/report.md'
  ].filter(file => fs.existsSync(path.join(ROOT, file)));
  const report = analyzeEvidence(evidence);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), renderMarkdown(report) + '\n');
  try {
    report.statusBranchPublication = await publishStatus(report);
  } catch (error) {
    report.statusBranchPublication = 'failed';
    report.publicationError = String(error?.message || error);
    console.error('[AUTONOMOUS_AGENT_PUBLISH_FAILED]', report.publicationError);
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), renderMarkdown(report) + '\n');
  console.log('[AUTONOMOUS_SPECIALISTS_RESULT] ' + JSON.stringify({
    agents: report.agents.map(agent => ({ id: agent.id, status: agent.status, findings: agent.findings.length })),
    tasks: report.tasks.length,
    missing: report.summary.evidenceMissing,
    publication: report.statusBranchPublication
  }));
}

if (process.env.AUTONOMOUS_AGENTS_TEST !== '1') {
  main().catch(error => {
    console.error('[AUTONOMOUS_SPECIALISTS_FATAL]', error);
    process.exitCode = 1;
  });
}

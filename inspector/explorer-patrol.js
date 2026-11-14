(() => {
  'use strict';
  const RAW = 'https://raw.githubusercontent.com/bonillamarquezpablo-lab/Minimo-android/inspector-status';
  const REPORT_URL = RAW + '/inspector/data/explorer-patrol/latest.json';
  const WORKFLOW_URL = 'https://github.com/bonillamarquezpablo-lab/Minimo-android/actions/workflows/explorer-patrol.yml';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const fmt = (value, digits = 2, unit = '') => {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return 'No medido';
    return Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits }) + unit;
  };
  const labels = {
    wetSteps: ['Pisadas húmedas', '', 0],
    waterParticlesEmitted: ['Salpicaduras emitidas', '', 0],
    activeSplashParticles: ['Salpicaduras vivas', '', 0],
    maxShoreStepMeters: ['Escalón máximo arena/agua', ' m', 3],
    grassInstances: ['Matas/instancias de hierba', '', 0],
    grassBatches: ['Lotes de hierba', '', 0],
    drawCalls: ['Draw calls', '', 0],
    worldUpdateMs: ['Actualización del mundo', ' ms', 2],
    renderCpuMs: ['Preparación del render', ' ms', 2],
    frameTimeP95Ms: ['Frame time p95', ' ms', 2],
    structuresMeasured: ['Estructuras con medida', '', 0],
    activityCount: ['Actividades registradas', '', 0],
    inventoryCount: ['Objetos de inventario', '', 0],
    movementSupported: ['API de rutas físicas', '', 0]
  };
  function severityLabel(severity) {
    if (severity === 'critical') return 'Fallo detectado';
    if (severity === 'warning') return 'Aviso';
    if (severity === 'ok') return 'Comprobado';
    return 'Datos incompletos';
  }
  function readingsHtml(agent) {
    const rows = Object.entries(agent.readings || {}).filter(([key, value]) =>
      Object.prototype.hasOwnProperty.call(labels, key) && !Array.isArray(value) && value !== undefined
    );
    if (!rows.length) return '<p class="patrol-muted">No hay lecturas numéricas disponibles.</p>';
    return '<dl class="patrol-readings">' + rows.map(([key, value]) => {
      const [label, unit, digits] = labels[key];
      const rendered = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : fmt(value, digits, unit);
      return '<div><dt>' + esc(label) + '</dt><dd>' + esc(rendered) + '</dd></div>';
    }).join('') + '</dl>';
  }
  function renderAgent(agent) {
    const issues = Array.isArray(agent.issues) ? agent.issues : [];
    const missing = Array.isArray(agent.missing) ? agent.missing : [];
    const issueHtml = issues.length
      ? '<ul class="patrol-issues">' + issues.map((issue, index) => {
          const copyText = [agent.name + ' · ' + issue.title, issue.detail, issue.islandIndex == null ? '' : 'Isla: ' + (Number(issue.islandIndex) + 1)].filter(Boolean).join('\n');
          return '<li class="patrol-issue patrol-' + esc(issue.severity || 'warning') + '"><div><strong>' + esc(issue.title) + '</strong><p>' + esc(issue.detail) + '</p></div><button class="patrol-copy" type="button" data-copy="' + esc(copyText) + '">Copiar fallo</button></li>';
        }).join('') + '</ul>'
      : '<p class="patrol-muted">No hay fallos confirmados con los sensores disponibles.</p>';
    const missingHtml = missing.length
      ? '<details class="patrol-pending"><summary>Pendiente de medir (' + missing.length + ')</summary><ul>' + missing.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>'
      : '';
    const state = agent.severity || 'unknown';
    return '<article class="patrol-agent patrol-state-' + esc(state) + '">' +
      '<div class="patrol-agent-head"><div><span class="patrol-agent-name">' + esc(agent.name) + '</span><span class="patrol-agent-role">' + esc(agent.specialization || '') + '</span></div>' +
      '<span class="patrol-severity ' + esc(state) + '">' + esc(severityLabel(state)) + '</span></div>' +
      '<p class="patrol-agent-summary">' + esc(agent.summary || '') + '</p>' +
      readingsHtml(agent) + issueHtml + missingHtml + '</article>';
  }
  function render(report) {
    const status = report.verdict || 'unknown';
    const names = { passed: 'Patrulla completada', partial: 'Patrulla parcial', 'issues-found': 'Incidencias detectadas', failed: 'Ejecución fallida', 'not-run': 'Pendiente' };
    $('patrolState').textContent = names[status] || 'Estado desconocido';
    $('patrolState').className = 'patrol-overall-state ' + (status === 'issues-found' || status === 'failed' ? 'critical' : status === 'passed' ? 'ok' : 'warning');
    $('patrolMeta').textContent = 'Informe: ' + (report.finishedAt ? new Date(report.finishedAt).toLocaleString('es-ES') : 'sin finalizar') +
      ' · ' + (report.world?.visitedIslands ?? 0) + '/' + (report.world?.expectedIslands ?? 13) + ' islas recorridas' +
      (report.build ? ' · versión ' + report.build : '');
    $('patrolRenderer').textContent = report.renderer || 'Entorno no declarado';
    $('patrolCaveat').textContent = (report.limitations || []).join(' ');
    $('patrolAgents').innerHTML = (report.agents || []).map(renderAgent).join('') ||
      '<div class="patrol-empty">La ejecución todavía no ha publicado agentes.</div>';
    $('patrolReportJson').textContent = JSON.stringify(report, null, 2);
    $('patrolUpdated').textContent = 'Última lectura: ' + new Date().toLocaleTimeString('es-ES');
    $('patrolAgents').querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      const text = button.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const area = document.createElement('textarea');
        area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select();
        try { document.execCommand('copy'); } catch (_) {}
        area.remove();
      }
      const previous = button.textContent;
      button.textContent = 'Copiado';
      setTimeout(() => { button.textContent = previous; }, 1300);
    }));
  }
  let busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    $('patrolRefresh').disabled = true;
    try {
      const response = await fetch(REPORT_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Todavía no hay informe publicado (HTTP ' + response.status + ').');
      const report = await response.json();
      render(report);
    } catch (error) {
      $('patrolState').textContent = 'Sin informe disponible';
      $('patrolState').className = 'patrol-overall-state warning';
      $('patrolMeta').textContent = error.message;
      $('patrolAgents').innerHTML = '<div class="patrol-empty">La primera patrulla aparecerá aquí cuando termine una ejecución de GitHub Actions.</div>';
    } finally {
      busy = false;
      $('patrolRefresh').disabled = false;
    }
  }
  $('patrolRefresh').addEventListener('click', load);
  $('patrolRunWorkflow').addEventListener('click', () => window.open(WORKFLOW_URL, '_blank', 'noopener'));
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
})();

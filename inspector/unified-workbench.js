(() => {
  "use strict";
  const DB_NAME = "elsn-game-session-reports";
  const DB_VERSION = 1;
  const STORE = "sessions";
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const finite = value => value !== null && value !== undefined && value !== "" &&
    typeof value !== "boolean" && Number.isFinite(Number(value)) ? Number(value) : null;
  const fmt = (value, digits = 1) => finite(value) === null ? "—" :
    Number(value).toLocaleString("es-ES", { maximumFractionDigits: digits });
  const fmtMs = value => finite(value) === null ? "Sin medir" : fmt(value, 1) + " ms";
  const median = values => {
    const sorted = values.map(finite).filter(value => value !== null).sort((a,b) => a-b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
  };
  const valuesAt = (samples, path) => samples.map(sample => {
    let value = sample;
    for (const key of path.split(".")) value = value && value[key];
    return finite(value);
  }).filter(value => value !== null);
  const niceDate = value => value ? new Date(value).toLocaleString("es-ES", {
    dateStyle:"medium", timeStyle:"short"
  }) : "Fecha no disponible";
  const groups = [
    { id:"performance", label:"Rendimiento", hint:"FPS, fluidez y memoria",
      sections:[["diagnostico-en-vivo","Medición en directo"],["telemetria","Gráficas e historial"]] },
    { id:"world", label:"Mundo 3D", hint:"Mallas, terreno y colisiones",
      sections:[["mundo","Inspección del mundo"],["radar","Mapa y estructuras"]] },
    { id:"evidence", label:"Comparación", hint:"Antes y después",
      sections:[["comparativa","Comparador visual"]] },
    { id:"intelligence", label:"Especialistas", hint:"Patrulla, NPC y memoria",
      sections:[["patrulla-exploradores","Patrulla de exploradores"],["inteligencia-npc","Especialistas y memoria"]] },
    { id:"tests", label:"Pruebas", hint:"Auditorías y ejecuciones",
      sections:[["control","Operaciones y auditorías"]] }
  ];
  let activePage = 0;
  let latestReport = null;
  let deck = null;
  let tabButtons = [];

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function reportPage() {
    const page = node("section","workbench-page workbench-report-page");
    page.id = "workbench-report";
    page.setAttribute("aria-labelledby","wbReportTitle");
    page.innerHTML = `
      <div class="workbench-page-heading">
        <div><div class="workbench-kicker">INFORME INTELIGENTE · PARTIDA</div>
          <h2 id="wbReportTitle">Informe de la última partida</h2>
          <p id="wbReportMeta">Uniendo rendimiento, escenas, calidad de datos y recomendaciones en una sola lectura.</p>
        </div>
        <div class="workbench-report-actions">
          <button class="wb-button" id="wbReportRefresh" type="button">Actualizar</button>
          <button class="wb-button" id="wbReportExport" type="button" disabled>Exportar</button>
          <label class="wb-button wb-file-button" for="wbReportImport">Abrir informe JSON</label>
          <input id="wbReportImport" type="file" accept=".json,application/json" hidden>
        </div>
      </div>
      <div class="wb-report-state" id="wbReportState" role="status" aria-live="polite">Buscando informes guardados en este navegador…</div>
      <div class="wb-report-metrics" id="wbReportMetrics">
        <article class="wb-stat"><span>FPS medios</span><strong>—</strong><small>Esperando informe</small></article>
        <article class="wb-stat"><span>FPS mínimos</span><strong>—</strong><small>Esperando informe</small></article>
        <article class="wb-stat"><span>Estabilidad p95</span><strong>—</strong><small>Esperando informe</small></article>
        <article class="wb-stat"><span>Mallas de escena</span><strong>—</strong><small>Esperando informe</small></article>
        <article class="wb-stat"><span>Memoria JS</span><strong>—</strong><small>Esperando informe</small></article>
      </div>
      <div class="wb-report-grid">
        <article class="wb-report-card wb-report-primary" id="wbReportVerdict">
          <div class="wb-card-eyebrow">LECTURA PRINCIPAL</div><h3>Esperando datos</h3>
          <p>El informe aparecerá aquí con una explicación en lenguaje normal.</p>
        </article>
        <article class="wb-report-card" id="wbReportDevice">
          <div class="wb-card-eyebrow">DISPOSITIVO Y MOTOR</div><h3>Entorno de ejecución</h3>
          <p>La GPU y el backend se mostrarán cuando estén disponibles.</p>
        </article>
        <article class="wb-report-card" id="wbReportIntegrity">
          <div class="wb-card-eyebrow">CALIDAD DEL INFORME</div><h3>Comprobando cobertura</h3>
          <p>Se distinguirán las mediciones ausentes de los valores cero.</p>
        </article>
      </div>
      <section class="wb-report-card wb-report-specialists" id="wbReportSpecialists">
        <div class="wb-card-eyebrow">INTELIGENCIA AUTÓNOMA · CUATRO ESPECIALISTAS</div>
        <h3>Lo que han descubierto nuestros especialistas</h3>
        <p>Revisan la partida, reúnen pruebas y recuerdan los resultados para comparar futuras sesiones. No cambian el mundo ni reducen la calidad gráfica por su cuenta.</p>
        <div id="wbSpecialistSummary" class="wb-specialist-summary">Preparando análisis…</div>
        <div id="wbSpecialistCards" class="wb-specialist-grid"><p>Esperando los datos de la partida.</p></div>
      </section>
            <section class="wb-report-card">
        <div class="wb-card-eyebrow">ANÁLISIS CRUZADO</div><h3>Relaciones entre posibles causas</h3>
        <div id="wbReportCorrelations" class="wb-action-list"><p>Esperando mediciones.</p></div>
      </section>
      <div class="wb-report-columns">
        <section class="wb-report-card" id="wbReportWorld">
          <div class="wb-card-eyebrow">EVIDENCIA DEL MUNDO 3D</div><h3>Geometría, físicas y objetos</h3>
          <p>El inventario de la escena se incorporará al informe final cuando la partida termine normalmente.</p>
        </section>
        <section class="wb-report-card" id="wbReportComparison">
          <div class="wb-card-eyebrow">EVOLUCIÓN ENTRE PARTIDAS</div><h3>Comparación con la sesión anterior</h3>
          <p>Se necesitan dos informes completos del mismo navegador para comparar.</p>
        </section>
      </div>
      <div class="wb-report-columns">
        <section class="wb-report-card">
          <div class="wb-card-eyebrow">PLAN DE REPARACIÓN</div><h3>Qué debemos revisar primero</h3>
          <div id="wbReportActions" class="wb-action-list"><p>Esperando informe.</p></div>
        </section>
        <section class="wb-report-card">
          <div class="wb-card-eyebrow">PISTAS TÉCNICAS EXPLICADAS</div><h3>Qué puede estar ocurriendo</h3>
          <div id="wbReportFindings" class="wb-action-list"><p>Esperando informe.</p></div>
        </section>
      </div>
      <details class="wb-technical-details">
        <summary>Ver datos originales y mediciones avanzadas</summary>
        <p>Esta vista conserva el JSON completo. Los valores no disponibles permanecen como «sin medir»; no se convierten en ceros.</p>
        <pre id="wbReportJson">Todavía no hay un informe cargado.</pre>
      </details>`;
    return page;
  }

  function buildWorkbench(main) {
    const sections = new Map(Array.from(main.querySelectorAll(":scope > section.section"))
      .map(section => [section.id, section]));
    const top = $("lastGoodNotice") || $("overview") || main.querySelector(".hero");
    const shell = node("section","workbench-shell");
    shell.id = "inspector-workbench";
    const tabs = node("nav","workbench-tabs");
    tabs.setAttribute("aria-label","Herramientas del Inspector Center");
    tabs.setAttribute("role","tablist");
    tabs.id = "workbenchTabs";
    deck = node("div","workbench-deck");
    deck.id = "workbenchDeck";
    deck.setAttribute("aria-label","Paneles del Inspector Center");
    const pages = [{id:"report",label:"Informe",hint:"Diagnóstico y prioridades",page:reportPage()}];
    for (const group of groups) {
      const page = node("section","workbench-page");
      page.id = "workbench-page-" + group.id;
      page.setAttribute("aria-label",group.label);
      const pageHead = node("div","workbench-page-heading");
      const copy = node("div","");
      copy.append(node("div","workbench-kicker","HERRAMIENTA INTEGRADA"),
        node("h2","",group.label),node("p","",group.hint));
      pageHead.append(copy);
      const subnav = node("nav","workbench-subtabs");
      subnav.setAttribute("aria-label","Apartados de " + group.label);
      subnav.hidden = group.sections.length < 2;
      const body = node("div","workbench-page-body");
      group.sections.forEach((entry,index) => {
        const [id,label] = entry;
        const section = sections.get(id);
        if (!section) return;
        const view = node("div","workbench-subview");
        view.dataset.subview = id;
        view.hidden = index !== 0;
        view.append(section);
        body.append(view);
        if (group.sections.length > 1) {
          const button = node("button","workbench-subtab",label);
          button.type = "button";
          button.dataset.subtab = id;
          button.setAttribute("aria-pressed",String(index===0));
          button.addEventListener("click",()=>selectSubview(page,id));
          subnav.append(button);
        }
      });
      page.append(pageHead,subnav,body);
      pages.push({id:group.id,label:group.label,hint:group.hint,page});
    }
    pages.forEach((entry,index) => {
      const button = node("button","workbench-tab",entry.label);
      button.type = "button";
      button.id = "workbench-tab-" + entry.id;
      button.setAttribute("role","tab");
      button.setAttribute("aria-controls",entry.page.id);
      button.setAttribute("aria-selected",String(index===0));
      button.tabIndex = index===0 ? 0 : -1;
      button.addEventListener("click",()=>goToPage(index));
      tabs.append(button);
      entry.page.setAttribute("role","tabpanel");
      entry.page.setAttribute("aria-labelledby",button.id);
      entry.page.dataset.pageIndex = String(index);
      deck.append(entry.page);
    });
    shell.append(tabs,deck);
    if (top) top.after(shell);
    else main.prepend(shell);
    tabButtons = Array.from(tabs.querySelectorAll(".workbench-tab"));
    setActiveTab(0);
    const oldNav = document.querySelector(".topbar .nav");
    if (oldNav) {
      oldNav.querySelectorAll("a[href^='#']").forEach(anchor => {
        anchor.addEventListener("click",event => {
          const targetId = anchor.getAttribute("href").slice(1);
          const groupIndex = groups.findIndex(group => group.sections.some(entry => entry[0]===targetId));
          if (groupIndex < 0) return;
          event.preventDefault();
          const pageIndex = groupIndex + 1;
          goToPage(pageIndex);
          const group = groups[groupIndex];
          if (group.sections.length > 1) selectSubview($("workbench-page-"+group.id),targetId);
        });
      });
    }
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting)
          .sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number(visible.target.dataset.pageIndex);
        if (Number.isInteger(index)) setActiveTab(index);
      },{root:deck,threshold:[.45,.65,.85]});
      pages.forEach(entry=>observer.observe(entry.page));
    }
    deck.addEventListener("keydown",event=>{
      if (!["ArrowLeft","ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      goToPage(activePage + (event.key==="ArrowRight"?1:-1));
      tabButtons[activePage]?.focus();
    });
    window.addEventListener("resize",()=>goToPage(activePage,false),{passive:true});
  }

  function setActiveTab(index) {
    activePage = Math.max(0,Math.min(tabButtons.length-1,index));
    tabButtons.forEach((button,i)=>{
      button.setAttribute("aria-selected",String(i===activePage));
      button.tabIndex = i===activePage ? 0 : -1;
    });
    Array.from(deck.children).forEach((page,i)=>{
      const inactive = i!==activePage;
      page.setAttribute("aria-hidden",String(inactive));
      page.inert = inactive;
    });
  }

  function goToPage(index, smooth=true) {
    if (!deck) return;
    const next = Math.max(0,Math.min(deck.children.length-1,index));
    setActiveTab(next);
    deck.scrollTo({left:next*deck.clientWidth,behavior:smooth?"smooth":"auto"});
  }

  function selectSubview(page,id) {
    if (!page) return;
    page.querySelectorAll(".workbench-subview").forEach(view=>{
      view.hidden = view.dataset.subview!==id;
    });
    page.querySelectorAll(".workbench-subtab").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.subtab===id));
    });
  }

  function metricCard(label,value,note) {
    return '<article class="wb-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>';
  }

  function sparkline(samples) {
    const series = samples.map(sample=>finite(sample.fps)).filter(value=>value!==null);
    if (series.length < 2) return '<div class="wb-chart-empty">No hay suficientes lecturas para dibujar la evolución.</div>';
    const min = Math.min(...series), max = Math.max(...series), span = Math.max(1,max-min);
    const points = series.map((value,index)=>{
      const x = 5 + index * 390 / (series.length-1);
      const y = 82 - ((value-min)/span)*66;
      return x.toFixed(1)+","+y.toFixed(1);
    }).join(" ");
    return '<div class="wb-sparkline"><div><span>EVOLUCIÓN DE FPS</span><strong>'+fmt(min,0)+'–'+fmt(max,0)+' FPS</strong></div><svg viewBox="0 0 400 92" role="img" aria-label="Evolución de FPS durante la partida"><line x1="5" y1="82" x2="395" y2="82"/><polyline points="'+points+'"/></svg></div>';
  }

  function renderCard(hostId,eyebrow,title,paragraphs,extraClass="") {
    const host = $(hostId);
    if (!host) return;
    host.className = "wb-report-card " + extraClass;
    host.innerHTML = '<div class="wb-card-eyebrow">'+esc(eyebrow)+'</div><h3>'+esc(title)+'</h3>'+
      paragraphs.map(text=>'<p>'+esc(text)+'</p>').join("");
  }

  function reportFinding(severity,title,body) {
    const label = severity==="critical" ? "Prioridad alta" : severity==="warning" ? "Revisar" : "Dato";
    return '<article class="wb-action-item wb-'+severity+'"><span class="wb-action-label">'+label+'</span><div><strong>'+esc(title)+'</strong><p>'+esc(body)+'</p></div></article>';
  }

  function renderWorldEvidence(world) {
    const host = $("wbReportWorld");
    if (!host) return;
    if (!world) {
      host.innerHTML = '<div class="wb-card-eyebrow">EVIDENCIA DEL MUNDO 3D</div><h3>Inspección final no disponible</h3><p>La partida no guardó una captura final del mundo. No se puede concluir que las mallas, objetos o colisiones estén correctos.</p>';
      return;
    }
    if (world.error) {
      host.innerHTML = '<div class="wb-card-eyebrow">EVIDENCIA DEL MUNDO 3D</div><h3>No se pudo capturar la escena</h3><p>'+esc(world.error)+'</p>';
      return;
    }
    const meshes = world.meshes || {};
    const terrain = world.terrainObjects || {};
    const collisions = world.collisions || {};
    const structures = world.structureAudit || {};
    const textures = world.textures || {};
    const buried = finite(terrain.fullyBuriedCount) ?? 0;
    const penetrating = finite(terrain.penetratingCount) ?? 0;
    const invalidTransforms = finite(meshes.invalidTransformCount) ?? 0;
    const invalidColliders = finite(collisions.invalidPositionCount) ?? 0;
    const unsafeVisible = finite(structures.visibleInvalidAfterRepair) ?? finite(structures.unsafeVisibleBeforeRepair);
    const largest = Array.isArray(meshes.largestVisibleMeshes) ? meshes.largestVisibleMeshes.slice(0,5) : [];
    const actorGroups = Object.entries(world.actors || {}).filter(([,group])=>group && typeof group==="object");
    const actorTotal = actorGroups.reduce((sum,[,group])=>sum+(finite(group.count)??(group.returned?.length||0)),0);
    const texturePending = finite(textures.pendingCount);
    const rows = [
      ["Mallas inventariadas",fmt(meshes.count,0)+(meshes.truncated>0?" · inventario parcial":"")],
      ["Objetos enterrados",fmt(buried,0)],
      ["Objetos que penetran el terreno",fmt(penetrating,0)],
      ["Transformaciones inválidas",fmt(invalidTransforms,0)],
      ["Colisionadores con posición inválida",fmt(invalidColliders,0)],
      ["Estructuras inseguras visibles",fmt(unsafeVisible,0)],
      ["Texturas pendientes",texturePending===null?"Sin medir":fmt(texturePending,0)],
      ["Actores registrados",fmt(actorTotal,0)]
    ];
    const rowHtml=rows.map(([label,value])=>'<div class="wb-evidence-row"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join("");
    const largestHtml=largest.length?'<div class="wb-evidence-subtitle">Mallas visibles con más vértices (no implica que estén defectuosas)</div>'+largest.map(item=>'<div class="wb-evidence-row"><span>'+esc(item.name||"Malla sin nombre")+' · '+esc(item.material||"sin material")+'</span><strong>'+esc(fmt(item.vertices,0))+' vértices</strong></div>').join(""):'<p>No hay inventario de mallas detallado en este informe.</p>';
    const caveat = world.dataQuality && world.dataQuality.fullMeshInventory===false
      ? "El inventario de mallas está truncado o incompleto; los recuentos no representan toda la escena."
      : "Lectura de solo inspección: no mueve, oculta ni elimina objetos.";
    host.innerHTML='<div class="wb-card-eyebrow">EVIDENCIA DEL MUNDO 3D · '+esc(world.source||"Babylon.js")+'</div><h3>Geometría, físicas y objetos</h3>'+
      '<div class="wb-evidence-list">'+rowHtml+'</div>'+largestHtml+
      '<p>'+esc(caveat)+'</p>';
  }

  function reportComparison(current, previous) {
    const host=$("wbReportComparison");
    if(!host)return;
    if(!previous){
      host.innerHTML='<div class="wb-card-eyebrow">EVOLUCIÓN ENTRE PARTIDAS</div><h3>Sin sesión anterior</h3><p>Cuando haya dos partidas guardadas, se compararán fluidez, tiempos de fotograma, mallas, memoria y errores. No se mezclan datos de dispositivos o builds distintos sin indicarlo.</p>';
      return;
    }
    const metrics=report=>{
      const samples=Array.isArray(report.samples)?report.samples:[];
      const summary=report.summary||{};
      const fps=summary.fps||{};
      const frame=summary.frameTimeMs||{};
      const fpsValues=valuesAt(samples,"fps");
      return {
        average:finite(fps.average)??(fpsValues.length?fpsValues.reduce((a,b)=>a+b,0)/fpsValues.length:null),
        minimum:finite(fps.minimum)??(fpsValues.length?Math.min(...fpsValues):null),
        p95:finite(frame.p95Median)??median(valuesAt(samples,"frameTiming.p95Ms")),
        meshes:median(valuesAt(samples,"scene.meshCount")),
        heap:finite((summary.memory||{}).jsHeapUsedMedianMB),
        errors:Array.isArray(report.runtimeErrors)?report.runtimeErrors.length:0
      };
    };
    const now=metrics(current),before=metrics(previous);
    const comparable=current.gameBuild===previous.gameBuild;
    const diff=(a,b,invert=false)=>a===null||b===null?"Sin datos":(a===b?"Sin cambio":((invert?(a<b):(a>b))?"Mejora":"Empeora")+" · "+fmt(Math.abs(a-b),1));
    const rows=[
      ["FPS medios",diff(now.average,before.average)],
      ["FPS mínimos",diff(now.minimum,before.minimum)],
      ["Frame time p95",diff(now.p95,before.p95,true)],
      ["Mallas medias",now.meshes===null||before.meshes===null?"Sin datos":(now.meshes===before.meshes?"Sin cambio":"Cambio · "+fmt(now.meshes-before.meshes,0)+" mallas; no implica mejora por sí solo")],
      ["Memoria JavaScript",diff(now.heap,before.heap,true)],
      ["Errores JavaScript",diff(now.errors,before.errors,true)]
    ];
    host.innerHTML='<div class="wb-card-eyebrow">EVOLUCIÓN ENTRE PARTIDAS</div><h3>'+(comparable?"Mismo build":"Builds diferentes")+'</h3>'+
      '<p>Actual: '+esc(current.gameBuild||"desconocido")+' · Anterior: '+esc(previous.gameBuild||"desconocido")+'. '+(comparable?"Comparación orientativa de sesiones guardadas.":"La comparación se muestra con cautela porque cambió la versión del juego.")+'</p>'+
      '<div class="wb-evidence-list">'+rows.map(([label,value])=>'<div class="wb-evidence-row"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join("")+'</div>';
  }

  function renderCorrelations(report, values) {
    const host=$("wbReportCorrelations");
    if(!host)return;
    const {p95,renderCpu,worldCpu,gpuValues,grass,shadows,meshCounts,vertices}=values;
    const items=[];
    const poor=p95!==null&&p95>20;
    if(poor&&renderCpu!==null&&renderCpu>8&&meshCounts.length&&vertices.length)
      items.push(reportFinding("warning","Carga de escena y preparación de render coinciden","Hay tiempos altos de preparación CPU junto con una escena de geometría considerable. Medir selección de mallas, materiales y sombras por separado."));
    if(poor&&worldCpu!==null&&worldCpu>8)
      items.push(reportFinding("warning","La actualización del mundo puede estar contribuyendo","El tiempo de actualización CPU coincide con ventanas de baja fluidez. Revisar IA, físicas, navegación y sistemas de mundo sin desactivarlos."));
    if(poor&&grass.length&&shadows.length)
      items.push(reportFinding("warning","Vegetación y sombras merecen una prueba controlada","Se registran instancias de hierba y emisores de sombra durante la pérdida de fluidez. Comparar el coste de ambos subsistemas en una ruta idéntica; no asumir causalidad."));
    if(poor&&gpuValues.length)
      items.push(reportFinding("warning","Hay tiempo GPU medido durante la pérdida de fluidez","Contrastar el tiempo GPU con CPU y frame time para distinguir saturación de GPU de esperas del pipeline."));
    if(poor&&!gpuValues.length)
      items.push(reportFinding("critical","Falta evidencia para separar CPU y GPU","La sesión muestra inestabilidad, pero no hay tiempo GPU válido. Activar el perfilador opcional en una segunda sesión comparable."));
    if(!items.length)
      items.push(reportFinding("info","Sin correlaciones suficientes","Se necesitan muestras simultáneas y suficientes para relacionar carga gráfica, actualización del mundo y tiempos de fotograma."));
    host.innerHTML=items.join("");
  }

  function specialistStatusLabel(status) {
    const labels = {
      "confirmado": "Repetido en varias partidas",
      "probable": "Posible problema",
      "necesita-revision": "Hay algo que revisar",
      "sin-incidencia-observada": "Sin problema observado",
      "evidencia-recogida": "Datos recogidos",
      "sin-datos-suficientes": "Faltan datos"
    };
    return labels[status] || "Estado no confirmado";
  }

  function specialistSourceLabel(source) {
    return source === "external-agent" ? "Agente conectado" :
      source === "operator" ? "Anotación del Inspector" :
      source === "npc" ? "Observación del especialista" : "Registro";
  }

  function renderSpecialistIntelligence(intelligence) {
    const summaryHost = $("wbSpecialistSummary");
    const cardsHost = $("wbSpecialistCards");
    if (!summaryHost || !cardsHost) return;
    if (!intelligence || !Array.isArray(intelligence.specialists)) {
      summaryHost.textContent = "El análisis de especialistas no está disponible en este navegador.";
      cardsHost.innerHTML = '<p>La partida conserva su informe técnico; no se ha podido cargar el módulo de inteligencia.</p>';
      return;
    }
    const summary = intelligence.summary || {};
    const review = finite(summary.needReview) ?? 0;
    const observations = finite(summary.recordedSpecialistObservations) ?? 0;
    summaryHost.innerHTML =
      '<span class="wb-specialist-count"><strong>'+esc(summary.specialists||0)+'</strong> especialistas</span>'+
      '<span class="wb-specialist-count"><strong>'+esc(review)+'</strong> con puntos por revisar</span>'+
      '<span class="wb-specialist-count"><strong>'+esc(observations)+'</strong> observaciones asociadas</span>'+
      '<span class="wb-specialist-safety">Análisis y memoria activos · Reparaciones automáticas desactivadas</span>';
    cardsHost.innerHTML = intelligence.specialists.map(specialist => {
      const status = String(specialist.status || "sin-datos-suficientes");
      const severity = status === "necesita-revision" || status === "confirmado" ? "warning" :
        status === "probable" ? "warning" : status === "sin-incidencia-observada" ? "good" : "neutral";
      const findingHtml = (Array.isArray(specialist.findings) ? specialist.findings : []).slice(0,8).map(finding => {
        const badge = finding.severity === "critical" ? "Prioridad alta" :
          finding.severity === "warning" ? "Revisar" : "Dato recogido";
        const locations = Array.isArray(finding.locations) && finding.locations.length
          ? '<div class="wb-specialist-location">'+finding.locations.map(item=>'<span>'+esc(item)+'</span>').join("")+'</div>' : "";
        return '<div class="wb-specialist-finding"><span class="wb-specialist-finding-tag">'+badge+'</span><div><strong>'+esc(finding.title||"Hallazgo")+'</strong><p>'+esc(finding.summary||"")+'</p>'+locations+'</div></div>';
      }).join("");
      const observationHtml = (Array.isArray(specialist.observations) ? specialist.observations : []).slice(0,6).map(event =>
        '<div class="wb-specialist-observation"><strong>'+esc(specialistSourceLabel(event.source))+'</strong><p>'+esc(event.summary||"")+'</p></div>'
      ).join("");
      const noFinding = !findingHtml ? '<p class="wb-specialist-empty">'+
        (status === "sin-incidencia-observada" ? "No se han encontrado incidencias en las comprobaciones realizadas." :
          status === "evidencia-recogida" ? "Se han guardado mediciones, pero aún no permiten confirmar un fallo." :
            "Todavía faltan datos para emitir una conclusión fiable.")+'</p>' : "";
      return '<article class="wb-specialist-card wb-specialist-'+severity+'">'+
        '<div class="wb-specialist-card-head"><div><span class="wb-specialist-name">'+esc(specialist.name)+'</span><span class="wb-specialist-role">'+esc(specialist.roleId==="performance"?"Rendimiento":specialist.roleId==="water-coast"?"Agua y costa":specialist.roleId==="terrain-structures"?"Terreno y estructuras":"Materiales e iluminación")+'</span></div>'+
        '<span class="wb-specialist-status">'+esc(specialistStatusLabel(status))+'</span></div>'+
        '<p class="wb-specialist-summary-text">'+esc(specialist.summary||"Sin resumen disponible.")+'</p>'+
        findingHtml+noFinding+
        (observationHtml ? '<div class="wb-specialist-observations"><strong>Observaciones guardadas</strong>'+observationHtml+'</div>' : "")+
        '</article>';
    }).join("");
  }

  async function buildSpecialistIntelligence(report, rememberResults) {
    const core = window.ELSN_NPC_AGENT_CORE;
    if (!core || typeof core.analyzeSessionIntelligence !== "function") return null;
    const api = window.__ELSN_NPC_AGENT_SYSTEM__;
    let memory = [];
    if (api) {
      try {
        if (api.ready) await api.ready;
        if (typeof api.getMemory === "function") memory = await api.getMemory({ limit: 200 });
      } catch (_) {}
    }
    const intelligence = core.analyzeSessionIntelligence(report, memory);
    if (rememberResults && api && typeof api.remember === "function" && report && report.sessionId) {
      const names = { "performance":"Eira", "water-coast":"Sól", "terrain-structures":"Ulf", "materials-lighting":"Týr" };
      for (const specialist of intelligence.specialists) {
        try {
          await api.remember({
            id: "session-intelligence:" + String(report.sessionId).slice(0,100) + ":" + specialist.id + ":v1",
            source: "system",
            npcId: names[specialist.roleId] || specialist.name,
            roleId: specialist.roleId,
            domain: specialist.roleId,
            kind: "diagnosis",
            status: specialist.status,
            confidence: specialist.confidence,
            summary: specialist.summary,
            evidence: {
              sessionId: report.sessionId,
              gameBuild: report.gameBuild || null,
              specialistStatus: specialist.status,
              findings: (specialist.findings || []).slice(0,6).map(finding => ({
                title: finding.title, summary: finding.summary, severity: finding.severity
              })),
              metrics: specialist.evidence || {}
            }
          });
        } catch (_) {}
      }
    }
    return intelligence;
  }

  function renderReport(report,sourceLabel,previousReport=null,intelligence=null) {
    latestReport = Object.assign({}, report, { specialistIntelligence: intelligence || null });
    $("wbReportExport").disabled = false;
    const samples = Array.isArray(report.samples) ? report.samples : [];
    const summary = report.summary || {};
    const fps = summary.fps || {};
    const frame = summary.frameTimeMs || {};
    const coverage = summary.sampleCoverage || {};
    const cpu = summary.cpu || {};
    const memory = summary.memory || {};
    const gpuProfiler = summary.gpuProfilerEnabled === true;
    const p95 = finite(frame.p95Median) ?? median(valuesAt(samples,"frameTiming.p95Ms"));
    const p99 = finite(frame.p99Median) ?? median(valuesAt(samples,"frameTiming.p99Ms"));
    const avgFps = finite(fps.average) ?? (valuesAt(samples,"fps").length ? valuesAt(samples,"fps").reduce((a,b)=>a+b,0)/valuesAt(samples,"fps").length : null);
    const minFps = finite(fps.minimum) ?? (valuesAt(samples,"fps").length ? Math.min(...valuesAt(samples,"fps")) : null);
    const maxFrame = finite(frame.worstFrameMax) ?? Math.max(0,...valuesAt(samples,"frameTiming.maxMs"));
    const meshCounts = valuesAt(samples,"scene.meshCount");
    const vertices = valuesAt(samples,"scene.totalVertices");
    const renderCpu = finite(cpu.renderPreparationMedianMs) ?? median(valuesAt(samples,"cpu.renderCpuMs"));
    const worldCpu = finite(cpu.worldUpdateMedianMs) ?? median(valuesAt(samples,"cpu.worldUpdateMs"));
    const gpuValues = valuesAt(samples,"gpu.frameMs");
    const grass = valuesAt(samples,"subsystems.grassInstances");
    const shadows = valuesAt(samples,"subsystems.activeWorldShadowCasters");
    const water = valuesAt(samples,"subsystems.waterUpdateMs");
    const targetValues = valuesAt(samples,"targetFps");
    const longTasks = Array.isArray(report.longTasks) ? report.longTasks : [];
    const startTime = Date.parse(report.startedAt || "");
    const preStartTasks = longTasks.filter(task=>Number.isFinite(Date.parse(task.capturedAt)) && Number.isFinite(startTime) && Date.parse(task.capturedAt)<startTime);
    const inGameTasks = longTasks.filter(task=>!preStartTasks.includes(task));
    const preStartDuration = preStartTasks.reduce((sum,task)=>sum+(finite(task.durationMs)||0),0);
    const inGameDuration = inGameTasks.reduce((sum,task)=>sum+(finite(task.durationMs)||0),0);
    const preStartMax = Math.max(0,...preStartTasks.map(task=>finite(task.durationMs)||0));
    const drawCallsSemantics = samples.map(sample=>sample.scene&&sample.scene.drawCallsCounterSemantics).filter(Boolean);
    const drawCallsUnverified = !drawCallsSemantics.length || drawCallsSemantics.some(value=>/unclassified|unverified/i.test(String(value)));
    const dynamicReasons = samples.map(sample=>sample.scene&&sample.scene.meshSelectionDynamicReasons).find(Boolean) || {};
    const dynamicMeshCount = median(valuesAt(samples,"scene.meshSelectionDynamicMeshCount"));
    const dynamicFilterMaxMs = Math.max(0,...valuesAt(samples,"scene.meshSelectionDynamicFilterMaxMs"));
    const anomalies = Array.isArray(report.anomalies) ? report.anomalies : [];
    const criticalAnomalies = finite(summary.criticalAnomalyEvents) ?? anomalies.filter(item=>item.severity==="critical").length;
    const runtimeErrors = Array.isArray(report.runtimeErrors) ? report.runtimeErrors.length : 0;
    const gpuRenderer = samples.map(sample=>sample.scene&&sample.scene.gpuRenderer).find(Boolean) || "No identificado";
    const qualityProfile = samples.map(sample=>sample.scene&&sample.scene.graphicsProfile).find(Boolean) || "No informado";
    const gpuName = /Adreno\s*(?:\(TM\)\s*)?\d+/i.exec(gpuRenderer)?.[0] || gpuRenderer;
    const status = report.status==="interrupted" ? "Interrumpida" : report.status==="active" ? "En curso" : "Finalizada";
    const reason = report.endReason==="pagehide" ? "La pestaña o el juego pasó a segundo plano antes de cerrar la sesión normalmente." :
      report.endReason==="game-stopped" ? "La partida terminó con normalidad." : report.endReason ? "Motivo de cierre: "+report.endReason : "No se registró el motivo del cierre.";
    const coverageRate = finite(coverage.coverageRate);
    const duration = finite(summary.durationSeconds) ?? (startTime && Date.parse(report.finishedAt||"") ? (Date.parse(report.finishedAt)-startTime)/1000 : null);
    const grassMin = grass.length ? Math.min(...grass) : null;
    const grassMax = grass.length ? Math.max(...grass) : null;
    const grassGrowth = grassMin && grassMax && grassMax>grassMin ? ((grassMax/grassMin)-1)*100 : null;
    const meshFirst = meshCounts.length ? meshCounts[0] : null;
    const meshLast = meshCounts.length ? meshCounts[meshCounts.length-1] : null;
    const vertexMax = vertices.length ? Math.max(...vertices) : null;
    const shadowMax = shadows.length ? Math.max(...shadows) : null;
    const waterMax = water.length ? Math.max(...water) : null;
    const noWorldSnapshot = !report.finalWorldInspection;
    const noGpu = gpuValues.length===0 || !gpuProfiler;
    const targetMin = targetValues.length ? Math.min(...targetValues) : null;
    const targetMax = targetValues.length ? Math.max(...targetValues) : null;
    const mainVerdict = (minFps!==null&&minFps<40) || (p95!==null&&p95>30) ? "La fluidez necesita atención" :
      p95!==null && p95>20 ? "Hay tirones y pérdida de estabilidad" : "No se detecta una caída grave en este registro";
    const mainBody = [
      "La partida registró "+(avgFps===null?"sin medición":fmt(avgFps,1)+" FPS")+" de media y llegó a "+fmt(minFps,0)+" FPS en su peor lectura.",
      "La mediana del percentil 95 por ventana fue "+(p95===null?"sin medir":fmtMs(p95))+". Para mantener 60 FPS buscamos no superar 16,7 ms.",
      "Esto confirma falta de estabilidad en varios tramos; no identifica por sí solo si la causa final es CPU o GPU."
    ];
    renderCard("wbReportVerdict","RESULTADO DE LA PARTIDA",mainVerdict,mainBody,"wb-report-primary");
    renderCard("wbReportDevice","DISPOSITIVO Y MOTOR",gpuName,[
      "Backend: "+(samples.map(sample=>sample.scene&&sample.scene.engineBackend).find(Boolean)||"no informado")+". Perfil gráfico: "+qualityProfile+".",
      "Objetivo de refresco observado: "+(targetMin!==null&&targetMax!==null?fmt(targetMin,0)+"–"+fmt(targetMax,0)+" FPS":"sin datos")+"; el objetivo cambió durante la sesión.",
      "El identificador Adreno procede del renderizador del navegador; el informe no verifica por sí solo el modelo comercial del teléfono."
    ]);
    renderCard("wbReportIntegrity","FIABILIDAD DE LOS DATOS",status,[
      fmt(samples.length,0)+" muestras en "+fmt(duration,0)+" segundos; cobertura registrada: "+(coverageRate===null?"no calculada":fmt(coverageRate*100,1)+"%")+".",
      report.endReason==="pagehide" ? reason : "Cierre: "+status+".",
      "Anomalías de rendimiento: "+fmt(anomalies.length,0)+"; graves: "+fmt(criticalAnomalies,0)+". Errores JavaScript: "+runtimeErrors+". Cero errores de código no descarta fallos visuales, físicos o de navegación."
    ]);
    $("wbReportMetrics").innerHTML =
      metricCard("FPS medios",fmt(avgFps,1),"Mínimo: "+fmt(minFps,0)+" FPS")+
      metricCard("FPS mínimos",fmt(minFps,0),"Peor lectura de la sesión")+
      metricCard("Estabilidad p95",p95===null?"Sin medir":fmt(p95,1)+" ms","Presupuesto a 60 FPS: 16,7 ms")+
      metricCard("Mallas de escena",meshLast===null?"—":fmt(meshLast,0),vertexMax===null?"Vértices sin medir":"Hasta "+fmt(vertexMax/1e6,2)+" millones de vértices")+
      metricCard("Memoria JavaScript",memory.jsHeapUsedMedianMB===undefined?"—":fmt(memory.jsHeapUsedMedianMB,1)+" MiB","Máximo: "+fmt(memory.jsHeapUsedMaximumMB,1)+" MiB");
    $("wbReportState").innerHTML = '<strong>'+esc(sourceLabel||"Informe local")+'</strong><span>'+esc(niceDate(report.startedAt))+' · '+esc(report.gameBuild||"versión desconocida")+' · '+esc(status)+'</span>';
    $("wbReportMeta").textContent = "Sesión "+String(report.sessionId||"").slice(0,12)+" · "+fmt(samples.length,0)+" lecturas · "+reason;
    $("wbReportActions").innerHTML = [
      noGpu ? reportFinding("critical","Medir la GPU en una ejecución controlada","No hay tiempos GPU en este informe. Repetir una ruta idéntica con el perfilador Babylon activado; no cambiar la calidad gráfica.") : "",
      preStartTasks.length ? reportFinding("critical","Separar el bloqueo de arranque","Antes de empezar a medir hubo "+preStartTasks.length+" tareas largas que suman "+fmt(preStartDuration,0)+" ms; la mayor duró "+fmt(preStartMax,0)+" ms. Auditar carga inicial, texturas, GLB y compilación de shaders.") : "",
      grassGrowth!==null ? reportFinding("warning","Revisar la creación de hierba y vegetación","Las instancias registradas pasaron de "+fmt(grassMin,0)+" a "+fmt(grassMax,0)+" (+"+fmt(grassGrowth,0)+"%). Comprobar generación repetida por zonas y liberación de lotes; el aumento no demuestra por sí solo duplicados.") : "",
      renderCpu!==null||worldCpu!==null ? reportFinding("warning","Perfilar la preparación del fotograma en CPU","Medianas: preparación de render "+fmtMs(renderCpu)+" y actualización del mundo "+fmtMs(worldCpu)+". Separar lógica, selección de mallas, sombras y preparación de render.") : "",
      noWorldSnapshot ? reportFinding("warning","Completar el inventario del mundo 3D","La sesión no guarda una captura final por malla. Ejecutar la inspección del mundo para identificar objetos, materiales, texturas, transformaciones y colisionadores concretos.") : "",
      report.status==="interrupted" ? reportFinding("warning","Repetir una sesión completa","El informe terminó interrumpido y su cobertura es "+(coverageRate===null?"desconocida":fmt(coverageRate*100,1)+"%")+". Para comparar optimizaciones, completar la misma ruta y no cambiar de aplicación.") : ""
    ].filter(Boolean).join("") || '<p>No hay una acción urgente derivada de estos datos.</p>';
    const findings = [
      reportFinding(p95!==null&&p95>20?"critical":"info","Ritmo de fotogramas","p95 mediano: "+fmtMs(p95)+"; p99 mediano: "+fmtMs(p99)+"; peor fotograma: "+fmtMs(maxFrame)+"."),
      reportFinding("warning","Carga de escena","Mallas: "+fmt(meshFirst,0)+" al inicio y "+fmt(meshLast,0)+" al final; vértices máximos: "+fmt(vertexMax===null?null:vertexMax/1e6,2)+" millones; jerarquías y materiales aún requieren inspección detallada."),
      reportFinding("info","Hierba y sombras","Hierba: "+fmt(grassMin,0)+"–"+fmt(grassMax,0)+" instancias; emisores de sombra: hasta "+fmt(shadowMax,0)+". Agua: pico de actualización "+fmtMs(waterMax)+"."),
      reportFinding("info","Selección de mallas dinámicas","El sistema clasifica unas "+fmt(dynamicMeshCount,0)+" mallas como dinámicas. Motivos registrados: "+Object.entries(dynamicReasons).map(([key,value])=>key+" "+fmt(value,0)).slice(0,4).join(" · ")+". Coste máximo del filtro: "+fmtMs(dynamicFilterMaxMs)+"."),
      reportFinding("info","Tareas largas durante el juego","Antes de iniciar: "+fmt(preStartTasks.length,0)+" tareas / "+fmt(preStartDuration,0)+" ms. Durante la sesión: "+fmt(inGameTasks.length,0)+" tareas / "+fmt(inGameDuration,0)+" ms."),
      reportFinding(drawCallsUnverified?"warning":"info","Contador de llamadas de dibujo",drawCallsUnverified?"El campo drawCallsCounterSemantics indica que su significado no está clasificado o verificado. No se usa para decidir qué optimizar hasta calibrar el contador.":"El informe incluye una clasificación del contador; aun así se debe contrastar con el perfilador de Babylon.")
    ].join("");
    $("wbReportFindings").innerHTML = findings;
    renderWorldEvidence(report.finalWorldInspection || null);
    renderSpecialistIntelligence(intelligence);
    reportComparison(report,previousReport);
    renderCorrelations(report,{p95,renderCpu,worldCpu,gpuValues,grass,shadows,meshCounts,vertices});
    $("wbReportJson").textContent = JSON.stringify(report,null,2);
    $("wbReportVerdict").insertAdjacentHTML("beforeend",sparkline(samples));
  }

  function openDb() {
    return new Promise((resolve,reject)=>{
      if (!window.indexedDB) return reject(new Error("IndexedDB no está disponible en este navegador."));
      const request = indexedDB.open(DB_NAME,DB_VERSION);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("No se pudo abrir el historial local."));
      request.onblocked=()=>reject(new Error("El historial está ocupado por otra pestaña."));
      request.onupgradeneeded=()=>{
        const db=request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"sessionId"});
      };
    });
  }

  async function loadReport() {
    const state=$("wbReportState");
    state.textContent="Actualizando el informe local…";
    try {
      const db=await openDb();
      if (!db.objectStoreNames.contains(STORE)) {
        db.close(); state.textContent="Todavía no hay partidas guardadas en este navegador."; return;
      }
      const reports=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,"readonly");
        const request=tx.objectStore(STORE).getAll();
        request.onsuccess=()=>resolve((request.result||[]).sort((a,b)=>Date.parse(b.startedAt||"")-Date.parse(a.startedAt||"")));
        request.onerror=()=>reject(request.error||new Error("No se pudo leer el historial."));
      });
      db.close();
      if (!reports.length) {
        state.textContent="Todavía no hay informes guardados. Juega una partida para que el registrador cree el primero.";
        return;
      }
      const intelligence = await buildSpecialistIntelligence(reports[0], reports[0].status === "completed");
      renderReport(reports[0],"Última partida guardada",reports[1]||null,intelligence);
    } catch(error) {
      state.textContent="No se pudo leer el historial: "+String(error&&error.message||error);
    }
  }

  function bindReportActions() {
    $("wbReportRefresh").addEventListener("click",loadReport);
    $("wbReportExport").addEventListener("click",()=>{
      if(!latestReport)return;
      const blob=new Blob([JSON.stringify(latestReport,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download="el-sin-nombre-informe-"+(latestReport.gameBuild||"partida")+".json";
      document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $("wbReportImport").addEventListener("change",async event=>{
      const file=event.target.files&&event.target.files[0];
      if(!file)return;
      try {
        const parsed=JSON.parse(await file.text());
        const report=Array.isArray(parsed)?parsed[0]:parsed.report||parsed;
        if(!report||!Array.isArray(report.samples))throw new Error("El archivo no contiene una partida con muestras.");
        const intelligence = await buildSpecialistIntelligence(report, false);
        renderReport(report,"Archivo importado",null,intelligence);
      } catch(error) {
        $("wbReportState").textContent="No se pudo abrir el JSON: "+String(error&&error.message||error);
      } finally {event.target.value="";}
    });
  }

  function init() {
    const main=$("inicio");
    if(!main || $("inspector-workbench"))return;
    buildWorkbench(main);
    bindReportActions();
    loadReport();
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")loadReport();});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
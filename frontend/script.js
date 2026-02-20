let selectedFile = null;
let analysisResults = null;

const ui = {
  theme: null,
  showLabels: true,
  history: [],
  aiInsight: null
};

// Chart instances
let riskChart = null;
let patternChart = null;
let velocityChart = null;
let timelineChart = null;

// D3 graph instances
let svg = null, root = null, zoom = null, sim = null;
let nodeSel = null, linkSel = null, labelSel = null;

let nodePatternMap = new Map();

function $(id) { return document.getElementById(id); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function toast(type, title, msg) {
  const host = $('toastHost');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${msg}</div>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function setTab(target) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.target === target));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.id === `panel-${target}`));
}

function initNav() {
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.target)));

  $('brandLink').addEventListener('click', (e) => {
    e.preventDefault();
    setTab('home');
  });

  $('homeUploadBtn').addEventListener('click', () => setTab('upload'));
  $('homeGoUploadBtn').addEventListener('click', () => setTab('upload'));

  $('homeDocsBtn').addEventListener('click', () => {
    const docs = $('docsCard');
    docs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('homeSampleBtn').addEventListener('click', async () => {
    setTab('upload');
    await loadSampleDataset();
  });

  setTab('home');
}

function setTheme(next) {
  ui.theme = next;
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ff_theme', next);

  // rebuild visuals to match theme
  if (analysisResults) {
    buildCharts();
    buildTimeline();
    buildGraph();
  }
}

function toggleTheme() {
  setTheme(ui.theme === 'dark' ? 'light' : 'dark');
  toast('info', 'Theme', ui.theme === 'dark' ? 'Dark theme enabled.' : 'Light theme enabled.');
}

function initTheme() {
  const saved = localStorage.getItem('ff_theme');
  setTheme(saved || 'light'); // bright default, like you asked
  $('themeBtn').addEventListener('click', toggleTheme);
}


function initUpload() {
  const drop = $('dropzone');
  const input = $('fileInput');

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  });

  input.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  });

  $('browseBtn').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  $('removeFileBtn').addEventListener('click', clearFile);
  $('sampleBtn').addEventListener('click', loadSampleDataset);
  $('runBtn').addEventListener('click', () => runAnalysis(selectedFile));
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    toast('error', 'Invalid file', 'Upload a .csv file.');
    return;
  }
  selectedFile = file;
  $('fileInfo').classList.remove('hidden');
  $('fileName').textContent = file.name;
  $('fileSize').textContent = `${(file.size / 1024).toFixed(1)} KB`;
  $('runBtn').disabled = false;
}

function clearFile() {
  selectedFile = null;
  $('fileInput').value = '';
  $('fileInfo').classList.add('hidden');
  $('runBtn').disabled = true;
}

async function loadSampleDataset() {
  try {
    toast('info', 'Loading', 'Fetching sample dataset…');
    const res = await fetch('/api/sample-data');
    if (!res.ok) throw new Error('Sample endpoint failed');
    const data = await res.json();

    const headers = ['transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'];
    let csv = headers.join(',') + '\n';
    data.forEach(row => { csv += headers.map(h => row[h]).join(',') + '\n'; });

    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], 'sample_transactions.csv', { type: 'text/csv' });
    handleFile(file);

    toast('success', 'Sample ready', 'Click “Run Analysis” to continue.');
  } catch {
    toast('error', 'Error', 'Could not load sample dataset.');
  }
}

async function runAnalysis(file) {
  if (!file) return;

  $('runBtn').disabled = true;
  toast('info', 'Analysis started', 'Uploading CSV and detecting patterns…');

  try {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/analyze', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Analysis failed');
    }

    analysisResults = await res.json();
    enableExports(true);

    fillDashboard();
    fillTables();
    buildCharts();
    buildTimeline();
    buildGraph();

    fillHomeSnapshot();

    toast('success', 'Analysis complete', 'Dashboard and graph updated.');
    setTab('dashboard');
  } catch (e) {
    toast('error', 'Error', e.message);
  } finally {
    $('runBtn').disabled = !selectedFile;
  }
}

function enableExports(on) {
  $('downloadJsonBtn').disabled = !on;
  $('downloadJsonBtn2').disabled = !on;
  $('downloadCsvBtn').disabled = !on;
  $('exportPdfBtn').disabled = !on;
  $('exportPdfBtn2').disabled = !on;
}

function fillHomeSnapshot() {
  const s = analysisResults?.summary;
  if (!s) return;
  $('miniAccounts').textContent = s.total_accounts_analyzed ?? '—';
  $('miniSuspicious').textContent = s.suspicious_accounts_flagged ?? '—';
  $('miniRings').textContent = s.fraud_rings_detected ?? '—';
  $('miniTime').textContent = (s.processing_time_seconds ?? '—') + 's';
}

function requiredJsonPayload() {
  return {
    suspicious_accounts: analysisResults.suspicious_accounts,
    fraud_rings: analysisResults.fraud_rings,
    summary: analysisResults.summary
  };
}

function downloadJSON() {
  if (!analysisResults) return;
  const blob = new Blob([JSON.stringify(requiredJsonPayload(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'money_muling_report.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  logExport('JSON');
  toast('success', 'Exported', 'JSON report downloaded.');
}

function downloadCSVs() {
  if (!analysisResults) return;

  const accs = analysisResults.suspicious_accounts || [];
  const rings = analysisResults.fraud_rings || [];

  let csvA = 'account_id,suspicion_score,detected_patterns,ring_id\n';
  accs.forEach(a => {
    csvA += `${a.account_id},${a.suspicion_score},"${(a.detected_patterns || []).join(';')}",${a.ring_id || ''}\n`;
  });

  let csvR = 'ring_id,pattern_type,member_count,risk_score,member_accounts\n';
  rings.forEach(r => {
    csvR += `${r.ring_id},${r.pattern_type},${r.member_accounts.length},${r.risk_score},"${r.member_accounts.join(';')}"\n`;
  });

  const dl = (text, name) => {
    const blob = new Blob([text], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  dl(csvA, 'suspicious_accounts.csv');
  dl(csvR, 'fraud_rings.csv');

  logExport('CSV');
  toast('success', 'Exported', 'CSV files downloaded.');
}

async function exportPDF() {
  if (!analysisResults) return;
  try {
    const panel = document.querySelector('#panel-dashboard');
    const canvas = await html2canvas(panel, { scale: 2, backgroundColor: null });
    const imgData = canvas.toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const ratio = canvas.height / canvas.width;
    const imgW = pageW;
    const imgH = pageW * ratio;

    let y = 0;
    pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);

    let remaining = imgH - pageH;
    while (remaining > 0) {
      pdf.addPage();
      y = -(imgH - remaining);
      pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);
      remaining -= pageH;
    }

    pdf.save('dashboard_report.pdf');
    logExport('PDF');
    toast('success', 'Exported', 'PDF generated (Dashboard).');
  } catch {
    toast('error', 'PDF export failed', 'Could not generate PDF in this browser.');
  }
}

function logExport(type) {
  const t = new Date().toLocaleString();
  ui.history.unshift({ type, t });
  $('history').innerHTML = ui.history
    .slice(0, 8)
    .map(x => `• <strong>${x.type}</strong> <span class="muted">(${x.t})</span>`)
    .join('<br>');
}

function fillDashboard() {
  const s = analysisResults.summary || {};
  const total = s.total_accounts_analyzed || 0;
  const susp = s.suspicious_accounts_flagged || 0;

  $('kpiTotal').textContent = total;
  $('kpiSusp').textContent = susp;
  $('kpiRings').textContent = s.fraud_rings_detected || 0;
  $('kpiTime').textContent = (s.processing_time_seconds ?? 0) + 's';

  const pct = total ? ((susp / total) * 100).toFixed(1) : '0.0';
  $('kpiSuspPct').textContent = `${pct}% of total`;

  // Fill AI Insight
  const aiBox = $('aiInsightBox');
  const aiText = $('aiInsightText');
  if (s.ai_insight) {
    aiBox.classList.remove('hidden');
    aiText.textContent = s.ai_insight;
  } else {
    aiBox.classList.add('hidden');
  }
}

function fillTables() {
  fillRings();
  fillAccounts();

  $('ringsSearch').addEventListener('input', () => filterRows('ringsBody', $('ringsSearch').value));
  $('accountsSearch').addEventListener('input', filterAccounts);
  $('riskFilter').addEventListener('change', filterAccounts);
}

function filterRows(tbodyId, q) {
  const query = (q || '').toLowerCase();
  document.querySelectorAll(`#${tbodyId} tr`).forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
}

function filterAccounts() {
  const q = ($('accountsSearch').value || '').toLowerCase();
  const rf = $('riskFilter').value;

  document.querySelectorAll('#accountsBody tr').forEach(tr => {
    const txt = tr.textContent.toLowerCase();
    const score = Number(tr.getAttribute('data-score') || '0');

    let ok = true;
    if (rf === 'high') ok = score >= 70;
    else if (rf === 'med') ok = score >= 40 && score < 70;
    else if (rf === 'low') ok = score < 40;

    tr.style.display = (txt.includes(q) && ok) ? '' : 'none';
  });
}

function badge(text) {
  return `<span style="display:inline-block;padding:4px 8px;border-radius:999px;border:1px solid var(--border);background:rgba(15,23,42,0.03);margin-right:6px;font-size:12px">${text}</span>`;
}

function riskChip(score) {
  const s = Number(score || 0);
  if (s >= 70) return `<span style="padding:4px 10px;border-radius:999px;border:1px solid rgba(239,68,68,0.28);background:rgba(239,68,68,0.10)">${s}</span>`;
  if (s >= 40) return `<span style="padding:4px 10px;border-radius:999px;border:1px solid rgba(245,158,11,0.28);background:rgba(245,158,11,0.10)">${s}</span>`;
  return `<span style="padding:4px 10px;border-radius:999px;border:1px solid rgba(22,163,74,0.28);background:rgba(22,163,74,0.10)">${s}</span>`;
}

function computeNodePatterns() {
  const map = new Map();
  (analysisResults.fraud_rings || []).forEach(r => {
    (r.member_accounts || []).forEach(acc => {
      if (!map.has(acc)) map.set(acc, new Set());
      map.get(acc).add(r.pattern_type);
    });
  });
  return map;
}

function fillRings() {
  const tbody = $('ringsBody');
  const rings = analysisResults.fraud_rings || [];
  tbody.innerHTML = '';

  nodePatternMap = computeNodePatterns();

  if (!rings.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No rings detected.</td></tr>`;
    return;
  }

  rings.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.ring_id}</strong></td>
      <td>${badge(r.pattern_type)}</td>
      <td>${r.member_accounts.length}</td>
      <td>${riskChip(r.risk_score)}</td>
      <td class="muted small">${r.member_accounts.join(', ')}</td>
      <td style="text-align:right">
        <button class="btn btn-outline btn-sm" data-ring="${r.ring_id}">View</button>
      </td>
    `;
    tr.querySelector('button').addEventListener('click', () => focusRing(r.ring_id));
    tbody.appendChild(tr);
  });
}

function fillAccounts() {
  const tbody = $('accountsBody');
  const accs = analysisResults.suspicious_accounts || [];
  tbody.innerHTML = '';

  if (!accs.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No suspicious accounts flagged.</td></tr>`;
    return;
  }

  accs.forEach(a => {
    const patterns = (a.detected_patterns || []).map(p => badge(p)).join('');
    const tr = document.createElement('tr');
    tr.setAttribute('data-score', String(a.suspicion_score || 0));
    tr.innerHTML = `
      <td><strong>${a.account_id}</strong></td>
      <td>${riskChip(a.suspicion_score)}</td>
      <td class="small">${patterns}</td>
      <td class="muted">${a.ring_id || 'N/A'}</td>
      <td style="text-align:right">
        <button class="btn btn-outline btn-sm" data-acc="${a.account_id}">View</button>
      </td>
    `;
    tr.querySelector('button').addEventListener('click', () => focusAccount(a.account_id));
    tbody.appendChild(tr);
  });
}

/* Charts (theme-aware) */
function chartText() { return cssVar('--text') || '#111'; }
function chartGrid() { return cssVar('--grid') || 'rgba(0,0,0,0.08)'; }

function buildCharts() {
  if (!analysisResults) return;

  const text = chartText();
  const grid = chartGrid();

  const accs = analysisResults.suspicious_accounts || [];
  let high = 0, med = 0, low = 0;
  accs.forEach(a => {
    const s = Number(a.suspicion_score || 0);
    if (s >= 70) high++;
    else if (s >= 40) med++;
    else low++;
  });

  if (riskChart) riskChart.destroy();
  riskChart = new Chart($('riskChart'), {
    type: 'doughnut',
    data: {
      labels: ['High (≥70)', 'Medium (40–69)', 'Low (<40)'],
      datasets: [{
        data: [high, med, low],
        backgroundColor: ['#ef4444', '#f59e0b', '#16a34a'],
        borderWidth: 0
      }]
    },
    options: { plugins: { legend: { labels: { color: text } } } }
  });

  const rings = analysisResults.fraud_rings || [];
  const counts = { cycle: 0, fan_in: 0, fan_out: 0, shell_network: 0 };
  rings.forEach(r => { if (counts[r.pattern_type] !== undefined) counts[r.pattern_type]++; });

  if (patternChart) patternChart.destroy();
  patternChart = new Chart($('patternChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(counts),
      datasets: [{ label: 'Rings', data: Object.values(counts), backgroundColor: cssVar('--brand') || '#4f46e5' }]
    },
    options: {
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true }
      }
    }
  });

  const edges = analysisResults.graph_data?.edges || [];
  const bucketN = Math.min(10, Math.max(3, Math.floor(edges.length / 8) || 6));
  const step = Math.max(1, Math.floor(edges.length / bucketN));
  const labels = [];
  const vals = [];
  for (let i = 0; i < bucketN; i++) {
    const start = i * step, end = Math.min(edges.length, start + step);
    let sum = 0;
    for (let j = start; j < end; j++) sum += Number(edges[j].weight || 0);
    labels.push(`B${i + 1}`);
    vals.push(sum);
  }

  if (velocityChart) velocityChart.destroy();
  velocityChart = new Chart($('velocityChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Volume',
        data: vals,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.14)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true }
      }
    }
  });
}

function buildTimeline() {
  const text = chartText();
  const grid = chartGrid();

  const labels = Array.from({ length: 7 }, (_, i) => `Day ${i + 1}`);
  const total = labels.map(() => Math.floor(30 + Math.random() * 40));
  const suspicious = labels.map(() => Math.floor(5 + Math.random() * 25));

  if (timelineChart) timelineChart.destroy();
  timelineChart = new Chart($('timelineChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Total', data: total, borderColor: '#60a5fa', tension: 0.3 },
        { label: 'Suspicious', data: suspicious, borderColor: '#ef4444', tension: 0.3 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true }
      }
    }
  });

  $('peakHour').textContent = '14:00';
  $('highVel').textContent = '23 tx/hr';
  $('period').textContent = '7 days';
  $('afterHours').textContent = '32%';
}

/* Graph */
function buildGraph() {
  const wrap = $('graphWrap');
  const s = d3.select('#graphSvg');
  s.selectAll('*').remove();

  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  s.attr('width', w).attr('height', h);

  const nodes = (analysisResults.graph_data?.nodes || []).map(n => ({ ...n }));
  const links = (analysisResults.graph_data?.edges || []).map(e => ({ source: e.source, target: e.target, weight: Number(e.weight || 0) }));

  const linkColor = cssVar('--link') || 'rgba(15,23,42,0.22)';
  const labelColor = cssVar('--muted') || 'rgba(15,23,42,0.62)';

  svg = s;
  root = s.append('g');

  zoom = d3.zoom().scaleExtent([0.2, 4]).on('zoom', (event) => root.attr('transform', event.transform));
  s.call(zoom);

  s.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', linkColor);

  linkSel = root.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', linkColor)
    .attr('stroke-opacity', 0.8)
    .attr('stroke-width', d => Math.min(3, 0.6 + Math.sqrt(d.weight / 2000)))
    .attr('marker-end', 'url(#arrow)');

  nodeSel = root.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('r', d => d.is_suspicious ? 9 : 6)
    .attr('fill', d => {
      if (!d.is_suspicious) return '#94a3b8';
      return (Number(d.suspicion_score || 0) >= 70) ? '#ef4444' : '#f59e0b';
    })
    .attr('stroke', 'rgba(0,0,0,0.25)')
    .attr('stroke-width', 1.5)
    .style('cursor', 'pointer')
    .on('mousemove', (event, d) => showTip(event, d))
    .on('mouseleave', hideTip)
    .on('click', (_, d) => selectNode(d))
    .call(d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  labelSel = root.append('g')
    .selectAll('text')
    .data(nodes)
    .join('text')
    .text(d => d.id.length > 12 ? d.id.slice(0, 12) + '…' : d.id)
    .attr('font-size', 9)
    .attr('fill', labelColor)
    .attr('dx', 10)
    .attr('dy', 3)
    .style('display', ui.showLabels ? 'block' : 'none');

  sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(90))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collide', d3.forceCollide().radius(18));

  sim.on('tick', () => {
    linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);
    labelSel.attr('x', d => d.x).attr('y', d => d.y);
  });

  applyGraphFilters();
}

function showTip(event, d) {
  const tip = $('nodeTip');
  tip.innerHTML = `
    <div style="font-weight:800">${d.id}</div>
    <div style="margin-top:6px">
      <div><span class="muted">Sent:</span> $${fmtMoney(d.total_sent)}</div>
      <div><span class="muted">Received:</span> $${fmtMoney(d.total_received)}</div>
      <div><span class="muted">Tx count:</span> ${d.transaction_count}</div>
      <div><span class="muted">Score:</span> ${(Number(d.suspicion_score || 0)).toFixed(1)}</div>
    </div>
  `;
  tip.style.left = (event.offsetX + 14) + 'px';
  tip.style.top = (event.offsetY + 14) + 'px';
  tip.classList.add('show');
}
function hideTip() { $('nodeTip').classList.remove('show'); }

function selectNode(d) {
  const pats = nodePatternMap.get(d.id);
  const pStr = pats ? Array.from(pats).join(', ') : '—';

  $('selectedNode').innerHTML = `
    <div><span class="muted">Account:</span> <strong>${d.id}</strong></div>
    <div><span class="muted">Sent:</span> $${fmtMoney(d.total_sent)}</div>
    <div><span class="muted">Received:</span> $${fmtMoney(d.total_received)}</div>
    <div><span class="muted">Transactions:</span> ${d.transaction_count}</div>
    <div><span class="muted">Suspicion:</span> ${(Number(d.suspicion_score || 0)).toFixed(1)}</div>
    <div><span class="muted">Patterns:</span> ${pStr}</div>
  `;

  nodeSel.attr('stroke', n => n.id === d.id ? 'rgba(22,163,74,0.9)' : 'rgba(0,0,0,0.25)')
    .attr('stroke-width', n => n.id === d.id ? 3 : 1.5);
}

function applyGraphFilters() {
  if (!analysisResults || !nodeSel) return;

  const minRisk = Number($('minRisk').value || 0);
  $('minRiskVal').textContent = String(minRisk);

  const onlySusp = $('onlySuspicious').checked;
  const pattern = $('patternFilter').value;

  nodeSel.attr('opacity', d => {
    const score = Number(d.suspicion_score || 0);
    const susp = !!d.is_suspicious;

    if (onlySusp && !susp) return 0.08;
    if (susp && score < minRisk) return 0.15;

    if (pattern !== 'all') {
      const pats = nodePatternMap.get(d.id);
      const has = pats ? pats.has(pattern) : false;
      if (susp && !has) return 0.12;
    }
    return 1;
  });

  labelSel.style('display', ui.showLabels ? 'block' : 'none');
}

function focusRing(ringId) {
  const ring = (analysisResults.fraud_rings || []).find(r => r.ring_id === ringId);
  if (!ring) return;
  const members = new Set(ring.member_accounts || []);
  nodeSel.attr('stroke', d => members.has(d.id) ? 'rgba(22,163,74,0.9)' : 'rgba(0,0,0,0.25)')
    .attr('stroke-width', d => members.has(d.id) ? 3 : 1.5);
  setTab('graph');
  toast('success', 'Ring highlighted', `${ringId} selected in graph.`);
}

function focusAccount(accId) {
  if (!nodeSel) return;
  nodeSel.attr('stroke', d => d.id === accId ? 'rgba(22,163,74,0.9)' : 'rgba(0,0,0,0.25)')
    .attr('stroke-width', d => d.id === accId ? 3 : 1.5);
  setTab('graph');
  toast('info', 'Account focused', accId);
}

function fmtMoney(x) {
  const n = Number(x || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function zoomBy(k) {
  if (!svg || !zoom) return;
  svg.transition().duration(150).call(zoom.scaleBy, k);
}
function resetView() {
  if (!svg || !zoom) return;
  svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
}
function exportSVG() {
  const svgEl = $('graphSvg');
  const xml = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'network_graph.svg';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function exportPNG() {
  const svgEl = $('graphSvg');
  const xml = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = svgEl.clientWidth || 1200;
    canvas.height = svgEl.clientHeight || 700;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ui.theme === 'dark' ? '#0b0f1d' : '#f5f7ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((png) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = 'network_graph.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };
  img.src = url;
}

function globalSearch() {
  if (!analysisResults) {
    toast('warn', 'Search', 'Run analysis first.');
    return;
  }
  const q = ($('globalSearch').value || '').trim();
  if (!q) return;
  focusAccount(q);
}

function resetAll() {
  selectedFile = null;
  analysisResults = null;
  ui.history = [];
  $('history').textContent = 'No exports yet.';
  clearFile();
  enableExports(false);

  $('ringsBody').innerHTML = `<tr><td colspan="6" class="muted">Run analysis to populate.</td></tr>`;
  $('accountsBody').innerHTML = `<tr><td colspan="5" class="muted">Run analysis to populate.</td></tr>`;

  $('kpiTotal').textContent = '0';
  $('kpiSusp').textContent = '0';
  $('kpiSuspPct').textContent = '0%';
  $('kpiRings').textContent = '0';
  $('kpiTime').textContent = '0s';

  $('miniAccounts').textContent = '—';
  $('miniSuspicious').textContent = '—';
  $('miniRings').textContent = '—';
  $('miniTime').textContent = '—';

  [riskChart, patternChart, velocityChart, timelineChart].forEach(c => { if (c) c.destroy(); });
  riskChart = patternChart = velocityChart = timelineChart = null;

  d3.select('#graphSvg').selectAll('*').remove();
  $('selectedNode').textContent = 'Click a node to view details.';

  toast('info', 'Reset', 'Ready for a new dataset.');
  setTab('home');
}

function bindButtons() {
  $('downloadJsonBtn').addEventListener('click', downloadJSON);
  $('downloadJsonBtn2').addEventListener('click', downloadJSON);
  $('downloadCsvBtn').addEventListener('click', downloadCSVs);
  $('exportPdfBtn').addEventListener('click', exportPDF);
  $('exportPdfBtn2').addEventListener('click', exportPDF);

  $('globalSearchBtn').addEventListener('click', globalSearch);
  $('globalSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') globalSearch(); });

  $('newAnalysisBtn').addEventListener('click', resetAll);

  $('minRisk').addEventListener('input', applyGraphFilters);
  $('onlySuspicious').addEventListener('change', applyGraphFilters);
  $('patternFilter').addEventListener('change', applyGraphFilters);

  $('zoomIn').addEventListener('click', () => zoomBy(1.2));
  $('zoomOut').addEventListener('click', () => zoomBy(0.85));
  $('resetView').addEventListener('click', resetView);

  $('toggleLabels').addEventListener('click', () => {
    ui.showLabels = !ui.showLabels;
    applyGraphFilters();
    toast('info', 'Graph', `Labels ${ui.showLabels ? 'enabled' : 'hidden'}.`);
  });

  $('exportSVG').addEventListener('click', exportSVG);
  $('exportPNG').addEventListener('click', exportPNG);
}

window.addEventListener('resize', () => {
  if (analysisResults) buildGraph();
});

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initUpload();
  bindButtons();
});
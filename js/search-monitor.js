// ── State ──
let searchLogs   = [];
let siteStatuses = {};
let reportUrls   = [];
let worksMeta    = {};

let allSort    = { key:'searchDate',  dir:-1 };
let workSort   = { key:'count',       dir:-1 };
let siteSort   = { key:'count',       dir:-1 };
let reportSort = { key:'reportDate',  dir:-1 };

let editingSite = null;
let trendChart  = null;
let modalChart  = null;

let modalLogs         = [];
let modalStatusFilter = '';
let modalType         = '';
let modalKey          = '';

// 날짜 필터 상태 — 단일 날짜 ('' = 전체)
let allDateFilter   = '';   // 'YYYY-MM-DD' or ''
let modalDateFilter = '';   // 'YYYY-MM-DD' or ''

// ── Load ──
async function loadAll() {
  try {
    const [sd, wd] = await Promise.all([apiGet('getSearchData'), apiGet('getWorks')]);
    searchLogs   = sd.logs       || [];
    siteStatuses = sd.sites      || {};
    reportUrls   = sd.reportUrls || [];
    invalidateUrlCache();
    worksMeta    = {};
    (wd.works || []).forEach(w => { worksMeta[w.titleEn] = { workName:w.title, url:w.url }; });
    showToast('데이터 로드 완료','success');
  } catch(e) { showToast('시트 연결 실패','error'); }
}

// ── URL 상태 ──
// URL 정규화 (대소문자, 후행 슬래시 통일)
const normUrl = u => String(u||'').toLowerCase().replace(/\/$/, '').trim();

// 캐시된 Set — reportUrls 변경 시 invalidate
let _rSetCache = null, _dSetCache = null;
function invalidateUrlCache() { _rSetCache=null; _dSetCache=null; }
const rSet = () => { if (!_rSetCache) _rSetCache=new Set(reportUrls.map(r=>normUrl(r.url))); return _rSetCache; };
const dSet = () => { if (!_dSetCache) _dSetCache=new Set(reportUrls.filter(r=>r.deleted==='삭제').map(r=>normUrl(r.url))); return _dSetCache; };

function getLogStatus(url) {
  const n=normUrl(url);
  if (dSet().has(n)) return 'deleted';
  if (rSet().has(n)) return 'reported';
  return 'active';
}
function logPill(url) {
  const s=getLogStatus(url);
  const label=s==='deleted'?'삭제':s==='reported'?'신고됨':'활성';
  return `<span class="log-pill ${s}">${label}</span>`;
}

// ── Render all ──
function renderAll_fn() {
  updateStats();
  renderTrendChart();
  renderWork();
  renderSite();
  renderAllTab();
  renderReport();
}

function updateStats() {
  const uniqueUrls = new Set(searchLogs.map(l=>l.url)).size;
  const rs=rSet(), ds=dSet();
  // 고유 URL 중 신고된 것
  const uniqueReported = new Set([...rSet()].filter(u=>searchLogs.some(l=>l.url===u))).size;
  document.getElementById('statLogs').textContent     = uniqueUrls.toLocaleString();
  document.getElementById('statReported').textContent = reportUrls.length.toLocaleString();
  document.getElementById('statDeleted').textContent  = reportUrls.filter(r=>r.deleted==='삭제').length.toLocaleString();
}

// ── Chart helpers ──
const CHART_DEFAULTS = {
  responsive:true, maintainAspectRatio:false,
  interaction:{ intersect:false, mode:'index' },
  plugins:{
    legend:{ display:false },
    tooltip:{ backgroundColor:'#1a1e2a', borderColor:'#2e3448', borderWidth:1, titleColor:'#f1f3f9', bodyColor:'#b8c0d4', titleFont:{family:"'JetBrains Mono',monospace",size:10}, bodyFont:{family:"'JetBrains Mono',monospace",size:10} }
  }
};
function chartScales(small) {
  const tick = { color:'#6e788e', font:{family:"'JetBrains Mono',monospace",size:small?9:10} };
  return {
    x:{ grid:{color:'rgba(37,42,56,0.7)'}, ticks:{...tick,maxTicksLimit:small?5:10}, border:{color:'#252a38'} },
    y:{ beginAtZero:true, grid:{color:'rgba(37,42,56,0.7)'}, ticks:{...tick,stepSize:1}, border:{color:'#252a38'} }
  };
}
function makeDatasets(labels, rMap, dMap) {
  return [
    { label:'신고', data:labels.map(d=>rMap[d]||0), borderColor:'#f0894a', backgroundColor:'rgba(240,137,74,0.07)', borderWidth:1.5, pointRadius:2.5, fill:true, tension:0.35 },
    { label:'삭제', data:labels.map(d=>dMap[d]||0), borderColor:'#2ecc8a', backgroundColor:'rgba(46,204,138,0.07)',  borderWidth:1.5, pointRadius:2.5, fill:true, tension:0.35 }
  ];
}

// ── 메인 추이 차트 ──
function renderTrendChart() {
  const rMap={}, dMap={};
  reportUrls.forEach(r => {
    if (r.reportDate) rMap[r.reportDate]=(rMap[r.reportDate]||0)+1;
    if (r.deleted==='삭제'&&r.reportDate) dMap[r.reportDate]=(dMap[r.reportDate]||0)+1;
  });
  const labels=[...new Set([...Object.keys(rMap),...Object.keys(dMap)])].sort().slice(-60);
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('trendChart').getContext('2d'), {
    type:'line', data:{ labels, datasets:makeDatasets(labels,rMap,dMap) },
    options:{ ...CHART_DEFAULTS, scales:chartScales(false) }
  });
}

// ── 탭: 작품별 ──
function renderWork() {
  const q = document.getElementById('searchWork').value.trim().toLowerCase();
  const map={};
  searchLogs.forEach(r => {
    const k=r.workName||'(미확인)';
    if (!map[k]) map[k]={ workName:k, titleEn:r.titleEn||'', urls:new Set(), infringeUrls:new Set(), lastDate:'' };
    map[k].urls.add(r.url);
    if ((siteStatuses[r.siteName]?.status||'신규')==='침해') map[k].infringeUrls.add(r.url);
    if (!map[k].lastDate||r.searchDate>map[k].lastDate) map[k].lastDate=r.searchDate;
  });
  let rows=Object.values(map).map(r=>({ ...r, count:r.urls.size, infringeCount:r.infringeUrls.size }));
  if (q) rows=rows.filter(r=>r.workName.toLowerCase().includes(q)||r.titleEn.toLowerCase().includes(q));
  rows.sort((a,b)=>{ const av=a[workSort.key]??'',bv=b[workSort.key]??''; return (typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'ko'))*workSort.dir; });
  const tbody=document.getElementById('workBody');
  if (!rows.length) { tbody.innerHTML=`<tr class="empty-row"><td colspan="6">데이터 없음</td></tr>`; return; }
  tbody.innerHTML=rows.map(r=>`
    <tr>
      <td style="font-weight:700">${r.workName}</td>
      <td style="color:var(--text2);font-family:var(--mono);font-size:12px">${r.titleEn||'—'}</td>
      <td class="num">${r.count.toLocaleString()}</td>
      <td class="num" style="color:${r.infringeCount>0?'var(--red)':'var(--text)'}">${r.infringeCount}</td>
      <td class="date-cell">${r.lastDate||'—'}</td>
      <td><button class="log-btn" onclick="openLogModal('work','${escQ(r.workName)}')">로그</button></td>
    </tr>`).join('');
}
function sortWork(key) { workSort.key===key?workSort.dir*=-1:(workSort.key=key,workSort.dir=-1); renderWork(); }

// ── 탭: 사이트별 ──
function renderSite() {
  const q=document.getElementById('searchSite').value.trim().toLowerCase();
  const stFilt=document.getElementById('filterStatus').value;
  const rs=rSet(), ds=dSet();
  const map={};
  searchLogs.forEach(r => {
    const s=r.siteName||'(미확인)';
    if (!map[s]) map[s]={ siteName:s, urls:new Set(), lastDate:'' };
    map[s].urls.add(r.url);
    if (!map[s].lastDate||r.searchDate>map[s].lastDate) map[s].lastDate=r.searchDate;
  });
  Object.keys(siteStatuses).forEach(s=>{ if (!map[s]) map[s]={ siteName:s, urls:new Set(), lastDate:'' }; });
  let rows=Object.values(map).map(r=>{
    // 고유 URL 기준으로 상태별 집계
    let active=0, reported=0, deleted=0;
    r.urls.forEach(url=>{
      if (ds.has(normUrl(url)))      deleted++;
      else if (rs.has(normUrl(url))) reported++;
      else                  active++;
    });
    return { ...r, count:r.urls.size, active, reported, deleted, status:siteStatuses[r.siteName]?.status||'신규' };
  });
  if (q) rows=rows.filter(r=>r.siteName.toLowerCase().includes(q));
  if (stFilt) rows=rows.filter(r=>r.status===stFilt);
  rows.sort((a,b)=>{ const av=a[siteSort.key]??'',bv=b[siteSort.key]??''; return (typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'ko'))*siteSort.dir; });
  const tbody=document.getElementById('siteBody');
  if (!rows.length) { tbody.innerHTML=`<tr class="empty-row"><td colspan="6">데이터 없음</td></tr>`; return; }
  tbody.innerHTML=rows.map(r=>{
    const countHtml=`<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
      <span style="font-family:var(--mono);font-size:13px;font-weight:500">${r.count.toLocaleString()}</span>
      <span style="display:flex;gap:3px">
        ${r.active   ?`<span class="log-pill active"   title="활성">${r.active}</span>`:''}
        ${r.reported ?`<span class="log-pill reported" title="신고됨">${r.reported}</span>`:''}
        ${r.deleted  ?`<span class="log-pill deleted"  title="삭제">${r.deleted}</span>`:''}
      </span>
    </div>`;
    return `<tr>
      <td style="font-weight:700">${r.siteName}</td>
      <td><span class="site-badge ss-${r.status}">${r.status}</span></td>
      <td class="r">${countHtml}</td>
      <td class="date-cell">${r.lastDate||'—'}</td>
      <td>
        <select class="status-select" onchange="changeSiteStatus('${escQ(r.siteName)}',this.value)">
          ${['신규','플랫폼','침해','제외'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><button class="log-btn" onclick="openLogModal('site','${escQ(r.siteName)}')">로그</button></td>
    </tr>`;
  }).join('');
}
function sortSite(key) { siteSort.key===key?siteSort.dir*=-1:(siteSort.key=key,siteSort.dir=-1); renderSite(); }

// ── 탭: 전체 로그 ──
function renderAllTab() {
  const q=document.getElementById('searchAll').value.trim().toLowerCase();
  const stFilt=document.getElementById('filterSiteStatus').value;
  let rows=[...searchLogs];
  if (q)           rows=rows.filter(r=>r.workName.toLowerCase().includes(q)||r.siteName.toLowerCase().includes(q)||r.url.toLowerCase().includes(q));
  if (stFilt)      rows=rows.filter(r=>(siteStatuses[r.siteName]?.status||'신규')===stFilt);
  if (allDateFilter) rows=rows.filter(r=>r.searchDate===allDateFilter);
  rows.sort((a,b)=>String(a[allSort.key]||'').localeCompare(String(b[allSort.key]||''),'ko')*allSort.dir);
  const tbody=document.getElementById('allBody');
  if (!rows.length) { tbody.innerHTML=`<tr class="empty-row"><td colspan="6">로그 없음</td></tr>`; return; }
  tbody.innerHTML=rows.map(r=>{
    const st=siteStatuses[r.siteName]?.status||'신규';
    return `<tr>
      <td style="font-weight:700">${r.workName||'—'}</td>
      <td><span class="site-badge ss-${st}" onclick="openSiteModal('${escQ(r.siteName)}')">${r.siteName||'—'}</span></td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${r.title||'—'}</td>
      <td class="url-td">${r.url?`<a href="${r.url}" target="_blank">${r.url}</a>`:'—'}</td>
      <td class="snippet-td" title="${r.snippet||''}">${r.snippet||'—'}</td>
      <td class="date-cell">${r.firstFoundDate||'—'}</td>
    </tr>`;
  }).join('');
}
function sortAll(key) { allSort.key===key?allSort.dir*=-1:(allSort.key=key,allSort.dir=-1); renderAllTab(); }

// ── 날짜 네비 (전체 로그) ──
function shiftDate(delta) {
  const base = allDateFilter || toYMD(new Date());
  const d = new Date(base); d.setDate(d.getDate() + delta);
  allDateFilter = toYMD(d);
  updateDateNavLabel('dateNavLabel', allDateFilter);
  renderAllTab();
}
function clearDateFilter() {
  allDateFilter = '';
  updateDateNavLabel('dateNavLabel', '');
  renderAllTab();
}
function updateDateNavLabel(id, date) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = date || '전체';
  el.classList.toggle('filtered', !!date);
}

// ── 날짜 네비 (모달) ──
function shiftModalDate(delta) {
  const base=modalDateFilter||toYMD(new Date()); const d=new Date(base); d.setDate(d.getDate()+delta);
  modalDateFilter=toYMD(d); modalPage=1;
  updateDateNavLabel('modalDateNavLabel',modalDateFilter); renderModalLogs();
}
function clearModalDateFilter() {
  modalDateFilter=''; modalPage=1;
  updateDateNavLabel('modalDateNavLabel',''); renderModalLogs();
}

// ── 탭: 신고 URL ──
function renderReport() {
  const q=document.getElementById('searchReport').value.trim().toLowerCase();
  const stFilt=document.getElementById('filterReportStatus').value;
  let rows=[...reportUrls];
  if (q) rows=rows.filter(r=>r.url.toLowerCase().includes(q));
  if (stFilt==='active')  rows=rows.filter(r=>!r.deleted);
  if (stFilt==='deleted') rows=rows.filter(r=>r.deleted==='삭제');
  rows.sort((a,b)=>String(a[reportSort.key]||'').localeCompare(String(b[reportSort.key]||''),'ko')*reportSort.dir);
  const tbody=document.getElementById('reportBody');
  if (!rows.length) { tbody.innerHTML=`<tr class="empty-row"><td colspan="3">신고 URL 없음</td></tr>`; return; }
  tbody.innerHTML=rows.map(r=>`
    <tr>
      <td class="url-td"><a href="${r.url}" target="_blank">${r.url}</a></td>
      <td class="date-cell">${r.reportDate||'—'}</td>
      <td>${r.deleted==='삭제'?'<span class="url-deleted">삭제</span>':'<span class="url-active">활성</span>'}</td>
    </tr>`).join('');
}
function sortReport(key) { reportSort.key===key?reportSort.dir*=-1:(reportSort.key=key,reportSort.dir=-1); renderReport(); }

// ── 탭 전환 ──
function switchTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
}

// ── 사이트 상태 ──
async function changeSiteStatus(siteName, status) {
  siteStatuses[siteName]={ ...(siteStatuses[siteName]||{}), status };
  try { await apiPost({ action:'updateSiteStatus', siteName, status }); showToast(`${siteName} → ${status}`,'success'); }
  catch(e) { showToast('저장 실패','error'); }
  renderSite(); renderAllTab();
}
function openSiteModal(siteName) { editingSite=siteName; document.getElementById('siteModalName').textContent=siteName; document.getElementById('siteModal').classList.add('open'); }
function closeSiteModal() { document.getElementById('siteModal').classList.remove('open'); editingSite=null; }
async function applySiteStatus(status) { if (!editingSite) return; await changeSiteStatus(editingSite, status); closeSiteModal(); }

// ── 로그 모달 ──
let modalPage     = 1;
const MODAL_PER_PAGE = 20;

// ── 휠 이벤트 (제거됨 - 페이지네이션으로 대체) ──

function openLogModal(type, key) {
  modalType=type; modalKey=key; modalStatusFilter='';
  modalDateFilter=''; modalPage=1;
  modalLogs = type==='work'
    ? searchLogs.filter(l=>l.workName===key)
    : searchLogs.filter(l=>l.siteName===key);
  document.getElementById('logModalTitle').innerHTML =
    type==='work'
      ? `작품별 로그 — <span>${key}</span>`
      : `사이트별 로그 — <span>${key}</span>`;
  document.getElementById('modalChartTitle').textContent = `"${key}" 신고 / 삭제 추이`;
  document.querySelectorAll('.modal-filter-btn').forEach(b=>b.classList.toggle('active', b.dataset.status===''));
  updateDateNavLabel('modalDateNavLabel', '');
  renderModalChart();
  renderModalLogs();
  document.getElementById('logDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLogModal() {
  const overlay = document.getElementById('logDetailModal');
  overlay.classList.remove('open');
  if (modalChart) { modalChart.destroy(); modalChart=null; }
  document.body.style.overflow = '';
}
function setModalStatusFilter(btn) {
  modalStatusFilter=btn.dataset.status; modalPage=1;
  document.querySelectorAll('.modal-filter-btn').forEach(b=>b.classList.toggle('active', b.dataset.status===modalStatusFilter));
  renderModalLogs();
}
function renderModalChart() {
  const rs=rSet(), ds=dSet(), rMap={}, dMap={};
  modalLogs.forEach(l => {
    const d=l.searchDate; if (!d) return;
    if (rs.has(normUrl(l.url))) rMap[d]=(rMap[d]||0)+1;
    if (ds.has(normUrl(l.url))) dMap[d]=(dMap[d]||0)+1;
  });
  const labels=[...new Set([...Object.keys(rMap),...Object.keys(dMap)])].sort();
  if (modalChart) modalChart.destroy();
  modalChart=new Chart(document.getElementById('modalChart').getContext('2d'), {
    type:'line', data:{ labels, datasets:makeDatasets(labels,rMap,dMap) },
    options:{ ...CHART_DEFAULTS, scales:chartScales(true) }
  });
}
function renderModalLogs() {
  const rs=rSet(), ds=dSet();
  let rows=[...modalLogs];
  if (modalDateFilter) rows=rows.filter(r=>r.searchDate===modalDateFilter);

  if (!modalDateFilter) {
    const urlMap={};
    rows.forEach(r=>{ if (!urlMap[r.url]||r.searchDate>urlMap[r.url].searchDate) urlMap[r.url]=r; });
    rows=Object.values(urlMap);
  }
  if (modalStatusFilter) {
    rows=rows.filter(r=>{ const s=ds.has(normUrl(r.url))?'deleted':rs.has(normUrl(r.url))?'reported':'active'; return s===modalStatusFilter; });
  }
  rows.sort((a,b)=>b.searchDate.localeCompare(a.searchDate));

  const total=rows.length, totalPages=Math.max(1,Math.ceil(total/MODAL_PER_PAGE));
  if (modalPage>totalPages) modalPage=totalPages;
  const start=(modalPage-1)*MODAL_PER_PAGE;
  const pageRows=rows.slice(start, start+MODAL_PER_PAGE);

  const tbody=document.getElementById('modalLogBody');
  if (!rows.length) { tbody.innerHTML=`<tr><td colspan="5" class="empty-msg">로그 없음</td></tr>`; }
  else {
    tbody.innerHTML=pageRows.map(r=>{
      const workUrl=worksMeta[r.titleEn]?.url||'';
      return `<tr>
        <td style="font-weight:700;white-space:nowrap">${r.workName||'—'}</td>
        <td class="url-td">${workUrl?`<a href="${workUrl}" target="_blank">${workUrl}</a>`:'—'}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${r.title||'—'}</td>
        <td class="url-td">${r.url?`<a href="${r.url}" target="_blank">${r.url}</a>`:'—'}</td>
        <td>${logPill(r.url)}</td>
      </tr>`;
    }).join('');
  }

  // 페이지네이션
  const pg=document.getElementById('modalPagination');
  if (totalPages<=1) { pg.innerHTML=`<span class="page-info">${total.toLocaleString()}건</span>`; return; }
  const maxBtn=7;
  let sp=Math.max(1,modalPage-Math.floor(maxBtn/2));
  let ep=Math.min(totalPages,sp+maxBtn-1);
  if (ep-sp<maxBtn-1) sp=Math.max(1,ep-maxBtn+1);
  let html=`<button class="page-btn" onclick="goModalPage(${modalPage-1})" ${modalPage===1?'disabled':''}>‹</button>`;
  if (sp>1) html+=`<button class="page-btn" onclick="goModalPage(1)">1</button>${sp>2?'<span class="page-info">…</span>':''}`;
  for (let i=sp;i<=ep;i++) html+=`<button class="page-btn ${i===modalPage?'active':''}" onclick="goModalPage(${i})">${i}</button>`;
  if (ep<totalPages) html+=`${ep<totalPages-1?'<span class="page-info">…</span>':''}<button class="page-btn" onclick="goModalPage(${totalPages})">${totalPages}</button>`;
  html+=`<button class="page-btn" onclick="goModalPage(${modalPage+1})" ${modalPage===totalPages?'disabled':''}>›</button>`;
  html+=`<span class="page-info">${total.toLocaleString()}건</span>`;
  pg.innerHTML=html;
}

function goModalPage(page) {
  modalPage=page;
  renderModalLogs();
  document.getElementById('logDetailModal').scrollTop=0;
}
// ── 목록 복사 ──
function copyLogList() {
  const rs=rSet(), ds=dSet();
  let rows=[...modalLogs];
  if (modalDateFilter) rows=rows.filter(r=>r.searchDate===modalDateFilter);
  if (modalStatusFilter) rows=rows.filter(r=>{ const s=ds.has(normUrl(r.url))?'deleted':rs.has(normUrl(r.url))?'reported':'active'; return s===modalStatusFilter; });
  if (!rows.length) { showToast('복사할 데이터 없음','error'); return; }
  const header='작품명\t작품URL\t검색제목\t식별URL';
  const lines=rows.map(r=>{ const wu=worksMeta[r.titleEn]?.url||''; return [r.workName,wu,r.title,r.url].join('\t'); });
  const text=[header,...lines].join('\n');
  navigator.clipboard.writeText(text)
    .then(()=>showToast(`${rows.length}건 복사 완료`,'success'))
    .catch(()=>{ const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); showToast(`${rows.length}건 복사 완료`,'success'); });
}

// ── 신고 URL 업로드 ──
function handleReportUpload(event) {
  const file=event.target.files[0]; if (!file) return; event.target.value='';
  const fr=new FileReader(); fr.onload=e=>processReportExcel(e.target.result); fr.readAsArrayBuffer(file);
}
async function processReportExcel(buffer) {
  showProgress('파일 파싱 중...',20);
  let parsed;
  try { parsed=parseExcel(buffer,['url','reportDate']); }
  catch(e) { hideProgress(); showToast('파일 파싱 실패','error'); return; }
  const existingUrls=new Set(reportUrls.map(r=>r.url));
  let added=0,duplicates=0,errors=0; const newUrls=[];
  for (const r of parsed) {
    const url=String(r.url||'').trim();
    if (!url) { errors++; continue; }
    if (existingUrls.has(url)) { duplicates++; continue; }
    const reportDate=r.reportDate||toYMD(new Date());
    existingUrls.add(url); newUrls.push({url,reportDate,deleted:''}); added++;
  }
  reportUrls.push(...newUrls);
  invalidateUrlCache();
  showProgress('DB 갱신 중...',80);
  if (newUrls.length) apiPost({action:'addReportUrls',urls:newUrls}).catch(()=>showToast('시트 동기화 실패','error'));
  hideProgress(); renderAll_fn(); showUploadResult(added,duplicates,errors);
}

// ── 수동 검색 실행 ──
async function runSearchNow() {
  const btn=document.getElementById('runSearchBtn');
  btn.disabled=true; btn.textContent='⏳ 검색 중...';
  showToast('검색 시작. 수 분이 걸릴 수 있어요.','info');
  try { await apiPost({action:'runSearchNow'}); showToast('검색 완료!','success'); await loadAll(); renderAll_fn(); }
  catch(e) { showToast('검색 실행 실패','error'); }
  btn.disabled=false; btn.textContent='▶ 지금 검색 실행';
}

function escQ(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

document.addEventListener('keydown', e=>{ if (e.key==='Escape') { closeSiteModal(); closeLogModal(); } });
loadAll().then(renderAll_fn);

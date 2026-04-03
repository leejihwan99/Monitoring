// ================================================================
// shared.js — 저작권 통합관리 공통 유틸리티
// ================================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxLOumoevYEyeKwXkFuy7WqADWmnlWyPYv5SN4nIhTGIHIp_X365kYwdk5ASzu9G4VS/exec';

// ── Date utils ──────────────────────────────────────────────────
function toYMD(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    if (!isNaN(d)) return _fmt(d);
    return val;
  }
  if (val instanceof Date && !isNaN(val)) return _fmt(val);
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return _fmt(d);
  }
  return String(val);
}

function _fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getQuarter(dateStr) {
  const m = parseInt((dateStr || '').slice(5,7), 10);
  if (m >= 1  && m <= 3)  return 1;
  if (m >= 4  && m <= 6)  return 2;
  if (m >= 7  && m <= 9)  return 3;
  if (m >= 10 && m <= 12) return 4;
  return null;
}

function getYear(dateStr) {
  return parseInt((dateStr || '').slice(0,4), 10) || null;
}

// ── API helpers ─────────────────────────────────────────────────
async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${APPS_SCRIPT_URL}?${qs}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Excel upload helper ─────────────────────────────────────────
// colMap: array of field names matching column order, e.g. ['memberId','views','date']
// Returns parsed rows as array of objects
function parseExcel(buffer, colMap) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false 로 셀 서식 적용된 값 사용, defval:'' 로 빈셀 처리
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const dataRows = raw.slice(1).filter(r => r.some(c => c !== ''));

  return dataRows.map(row => {
    const obj = {};
    colMap.forEach((field, i) => {
      let val = row[i];
      // 날짜 필드는 toYMD로 변환
      if (field === 'date' || field.toLowerCase().includes('date')) {
        // raw:false 이면 날짜가 이미 문자열이므로 toYMD로 정규화
        obj[field] = toYMD(val);
      } else if (typeof val === 'number') {
        obj[field] = val;
      } else {
        // 문자열: 앞뒤 공백 제거, 엑셀이 붙이는 선행 작은따옴표(') 제거
        obj[field] = String(val ?? '').trim().replace(/^'/, '');
      }
    });
    return obj;
  });
}

// ── UI helpers ──────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

function showProgress(msg, pct) {
  document.getElementById('uploadMsg').textContent = msg;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('uploadProgress').classList.add('show');
}

function hideProgress() {
  setTimeout(() => {
    document.getElementById('uploadProgress').classList.remove('show');
    document.getElementById('progressBar').style.width = '0%';
  }, 400);
}

function showUploadResult(added, duplicates, errors) {
  const parts = [`✓ ${added}건 추가`];
  if (duplicates > 0) parts.push(`중복 ${duplicates}건 제외`);
  if (errors > 0) parts.push(`오류 ${errors}건 스킵`);
  showToast(parts.join(' · '), added > 0 ? 'success' : 'info');
}

// expense.js — 지출 "내역 보기" + AI 지출 분석 (입력은 구글 시트에서 직접 합니다)
// categories.js / sheets-api.js / ai-analysis.js가 먼저 로드되어 있어야 해요.

let allEntries = [];
let selectedCategory = 'all';

function formatWon(amount) {
  return Number(amount).toLocaleString('ko-KR') + '원';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function currentYearMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function prevYearMonth() {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function initCategoryTabs() {
  const wrap = document.getElementById('expense-category-tabs');
  if (!wrap) return;

  Object.entries(SECTION_LABELS).forEach(([sectionKey, label]) => {
    const groupLabel = document.createElement('span');
    groupLabel.className = 'category-tab-group-label';
    groupLabel.textContent = label;
    wrap.appendChild(groupLabel);

    EXPENSE_FIELD_MAP.filter((f) => f.section === sectionKey).forEach((field) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-tab';
      btn.dataset.category = field.category;
      btn.textContent = field.category;
      wrap.appendChild(btn);
    });
  });

  wrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.category-tab');
    if (!btn) return;
    wrap.querySelectorAll('.category-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCategory = btn.dataset.category;
    renderFiltered();
  });
}

function getFilteredEntries() {
  const period = document.getElementById('expense-period-select')?.value || 'current';
  let entries = allEntries;

  if (period === 'current') {
    const ym = currentYearMonth();
    entries = entries.filter((e) => typeof e.date === 'string' && e.date.startsWith(ym));
  } else if (period === 'prev') {
    const ym = prevYearMonth();
    entries = entries.filter((e) => typeof e.date === 'string' && e.date.startsWith(ym));
  }

  if (selectedCategory !== 'all') {
    entries = entries.filter((e) => e.category === selectedCategory);
  }

  return entries;
}

function renderFiltered() {
  const filtered = getFilteredEntries();
  const tbody = document.getElementById('expense-table-body');
  const totalEl = document.getElementById('expense-filtered-total');

  const sorted = filtered.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = sorted.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  if (totalEl) totalEl.textContent = `합계 ${formatWon(total)} (${sorted.length}건)`;

  if (!tbody) return;
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">해당하는 내역이 없어요</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((entry) => {
    const autoTag = entry.auto === 'Y' ? ' <span style="color:var(--text-muted);font-size:11px;">(자동)</span>' : '';
    return `
      <tr>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.category)}${autoTag}</td>
        <td class="expense">-${formatWon(entry.amount)}</td>
        <td>${escapeHtml(entry.memo || '')}</td>
      </tr>
    `;
  }).join('');
}

async function refreshEntries() {
  try {
    allEntries = await SheetsAPI.list('Expense');
    renderFiltered();
    renderExpenseAIAnalysis(document.getElementById('expense-ai-analysis'), allEntries);
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCategoryTabs();

  const periodSelect = document.getElementById('expense-period-select');
  if (periodSelect) periodSelect.addEventListener('change', renderFiltered);

  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴
    startPolling(refreshEntries, 15000);
  });
});

// main.js — 홈 화면(index.html) 전용 스크립트
// income.html / expense.html에 저장된 localStorage 내역을 불러와
// 이번 달 요약(총수입/총지출/잔액)과 최근 5건 내역 테이블을 채워줍니다.

const INCOME_STORAGE_KEY = 'gagyebu_income_entries';
const EXPENSE_STORAGE_KEY = 'gagyebu_expense_entries';

// income.html / expense.html과 동일한 초기 시드 데이터
// (해당 페이지를 아직 한 번도 안 열어봤을 때 홈에서도 같은 예시를 보여주기 위함)
const INCOME_SEED = [
  { date: '2024-05-20', category: '급여', amount: 2800000, memo: '5월 급여' },
  { date: '2024-05-15', category: '부수입', amount: 250000, memo: '블로그 수익' },
  { date: '2024-05-10', category: '용돈', amount: 300000, memo: '부모님 용돈' },
  { date: '2024-05-05', category: '이자 수익', amount: 50000, memo: '예금 이자' },
  { date: '2024-05-01', category: '기타 수입', amount: 450000, memo: '외주 프로젝트' },
];

const EXPENSE_SEED = [
  { date: '2024-05-20', category: '식비', amount: 350000, memo: '마트 장보기' },
  { date: '2024-05-18', category: '교통비', amount: 80000, memo: '주유비' },
  { date: '2024-05-15', category: '쇼핑', amount: 200000, memo: '의류 구매' },
  { date: '2024-05-12', category: '통신비', amount: 70000, memo: '핸드폰 요금' },
  { date: '2024-05-10', category: '문화/여가', amount: 120000, memo: '영화 관람' },
];

function loadEntries(storageKey, seed) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return seed.slice();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : seed.slice();
  } catch (e) {
    return seed.slice();
  }
}

function formatWonPlain(amount) {
  return Number(amount).toLocaleString('ko-KR');
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

function sumThisMonth(entries) {
  const ym = currentYearMonth();
  return entries
    .filter((entry) => typeof entry.date === 'string' && entry.date.startsWith(ym))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
}

function renderRecentTable(tbodyId, entries, sign) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const cellClass = sign === '+' ? 'income' : 'expense';

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">아직 등록된 내역이 없어요</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.date)}</td>
      <td>${escapeHtml(entry.category)}</td>
      <td class="${cellClass}">${sign}${formatWonPlain(entry.amount)}원</td>
      <td>${escapeHtml(entry.memo || '')}</td>
    </tr>
  `).join('');
}

function renderSummary(incomeEntries, expenseEntries) {
  const totalIncome = sumThisMonth(incomeEntries);
  const totalExpense = sumThisMonth(expenseEntries);
  const balance = totalIncome - totalExpense;

  const incomeEl = document.getElementById('home-total-income');
  const expenseEl = document.getElementById('home-total-expense');
  const balanceEl = document.getElementById('home-total-balance');

  if (incomeEl) incomeEl.innerHTML = `${formatWonPlain(totalIncome)}<small>원</small>`;
  if (expenseEl) expenseEl.innerHTML = `${formatWonPlain(totalExpense)}<small>원</small>`;
  if (balanceEl) balanceEl.innerHTML = `${formatWonPlain(balance)}<small>원</small>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const incomeEntries = loadEntries(INCOME_STORAGE_KEY, INCOME_SEED);
  const expenseEntries = loadEntries(EXPENSE_STORAGE_KEY, EXPENSE_SEED);

  renderSummary(incomeEntries, expenseEntries);
  renderRecentTable('income-table-body', incomeEntries, '+');
  renderRecentTable('expense-table-body', expenseEntries, '-');
});

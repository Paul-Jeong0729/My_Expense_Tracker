// main.js — 홈 화면(index.html) 전용 스크립트
// Google Sheets의 Income / Expense 탭을 15초 주기로 폴링해서
// 이번 달 요약(총수입/총지출/잔액)과 최근 5건 내역 테이블을 채워줍니다.

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

let latestIncome = [];
let latestExpense = [];

function rerender() {
  renderSummary(latestIncome, latestExpense);
  renderRecentTable('income-table-body', latestIncome, '+');
  renderRecentTable('expense-table-body', latestExpense, '-');
}

async function refreshIncome() {
  try {
    latestIncome = await SheetsAPI.list('Income');
    rerender();
  } catch (err) {
    console.error(err);
  }
}

async function refreshExpense() {
  try {
    latestExpense = await SheetsAPI.list('Expense');
    rerender();
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴 (data-auth-optional 페이지는 예외)

    startPolling(refreshIncome, 15000);
    startPolling(refreshExpense, 15000);
  });
});

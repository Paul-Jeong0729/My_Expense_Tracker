// stats.js — 통계 페이지 전용 스크립트
// income_entries / expense_entries를 실시간 구독해서
// 1) 수입 항목별 막대그래프  2) 지출 항목별 막대그래프
// 3) 월별 카드사용(지출) 금액 막대그래프 (1년, 1~12월)  4) 통장잔액 추이 선그래프
// 를 순서대로 그리고, 적금·연금저축·개인형IRP 누적 합계로 저축 목표 달성률을 계산합니다.

const INCOME_COLLECTION = 'income_entries';
const EXPENSE_COLLECTION = 'expense_entries';
const GOAL_DOC_REF_PATH = ['app_settings', 'savings_goal'];

// 지출 항목 중 "적금·정기예탁·연금(IRP 포함)"으로 취급할 카테고리 판별용 (section 태그가
// 없는 예전 내역도 놓치지 않도록 카테고리 이름으로도 한 번 더 확인해요)
const GOAL_SECTIONS = ['savings', 'deposit', 'pension'];
const SAVINGS_KEYWORD = /적금|연금|정기예탁|irp/i;

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function formatWon(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function currentYear() {
  return new Date().getFullYear();
}

function firstDayOfMonth(monthValue) {
  return `${monthValue}-01`;
}

function lastDayOfMonth(monthValue) {
  const [y, m] = monthValue.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthValue}-${pad2(last)}`;
}

function isGoalEntry(entry) {
  if (entry.section) return GOAL_SECTIONS.includes(entry.section);
  return SAVINGS_KEYWORD.test(entry.category || '');
}

function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ---- 상태 ----
let latestIncome = [];
let latestExpense = [];
let goalTargetAmount = 0;

let incomeChart = null;
let expenseChart = null;
let cardUsageChart = null;
let balanceChart = null;

let periodMode = 'current'; // 'current' | 'month' | 'range' (수입/지출 항목별 차트용)
let selectedYear = currentYear(); // 월별 카드사용 금액 / 통장잔액 추이용

// ---- 기간 필터 (수입/지출 항목별) ----
function getPeriodRange() {
  if (periodMode === 'current') {
    const m = currentMonthValue();
    return { start: firstDayOfMonth(m), end: lastDayOfMonth(m) };
  }
  if (periodMode === 'month') {
    const picker = document.getElementById('month-picker');
    const m = (picker && picker.value) || currentMonthValue();
    return { start: firstDayOfMonth(m), end: lastDayOfMonth(m) };
  }
  const startInput = document.getElementById('range-start');
  const endInput = document.getElementById('range-end');
  const start = (startInput && startInput.value) || firstDayOfMonth(currentMonthValue());
  const end = (endInput && endInput.value) || lastDayOfMonth(currentMonthValue());
  return { start, end };
}

function filterByRange(entries, range) {
  return entries.filter((e) => typeof e.date === 'string' && e.date >= range.start && e.date <= range.end);
}

function aggregateByCategory(entries) {
  const map = new Map();
  entries.forEach((e) => {
    const key = e.category || '기타';
    const prev = map.get(key) || 0;
    map.set(key, prev + (Number(e.amount) || 0));
  });
  return map;
}

function renderBarChart({ chartInstanceKey, canvasId, wrapId, emptyId, rows, color }) {
  const canvas = document.getElementById(canvasId);
  const emptyEl = document.getElementById(emptyId);
  const wrap = document.getElementById(wrapId);
  const existing = { income: incomeChart, expense: expenseChart }[chartInstanceKey];

  if (rows.length === 0) {
    if (canvas) canvas.style.display = 'none';
    if (emptyEl) emptyEl.hidden = false;
    if (existing) { existing.destroy(); if (chartInstanceKey === 'income') incomeChart = null; else expenseChart = null; }
    return;
  }

  if (canvas) canvas.style.display = 'block';
  if (emptyEl) emptyEl.hidden = true;

  const labels = rows.map((r) => r.category);
  const data = rows.map((r) => r.amount);

  if (wrap) wrap.style.height = `${Math.max(240, rows.length * 40 + 40)}px`;

  if (existing) {
    existing.data.labels = labels;
    existing.data.datasets[0].data = data;
    existing.update();
    return;
  }

  if (typeof Chart === 'undefined' || !canvas) return;

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: color,
        borderRadius: 8,
        barThickness: 20,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatWon(ctx.parsed.x) } },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#ECECF1' },
          ticks: {
            callback: (value) => Number(value).toLocaleString('ko-KR'),
            font: { family: 'Pretendard' },
          },
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Pretendard', size: 12 } },
        },
      },
    },
  });

  if (chartInstanceKey === 'income') incomeChart = chart; else expenseChart = chart;
}

function renderIncomeExpenseCharts() {
  const range = getPeriodRange();
  const incomeInRange = filterByRange(latestIncome, range);
  const expenseInRange = filterByRange(latestExpense, range);

  const totalIncome = incomeInRange.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalExpense = expenseInRange.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const incomeEl = document.getElementById('stats-total-income');
  const expenseEl = document.getElementById('stats-total-expense');
  const balanceEl = document.getElementById('stats-total-balance');
  if (incomeEl) incomeEl.textContent = formatWon(totalIncome);
  if (expenseEl) expenseEl.textContent = formatWon(totalExpense);
  if (balanceEl) balanceEl.textContent = formatWon(totalIncome - totalExpense);

  const incomeRows = Array.from(aggregateByCategory(incomeInRange), ([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const expenseRows = Array.from(aggregateByCategory(expenseInRange), ([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  renderBarChart({
    chartInstanceKey: 'income',
    canvasId: 'income-chart',
    wrapId: 'income-chart-wrap',
    emptyId: 'income-chart-empty',
    rows: incomeRows,
    color: cssColor('--income', '#4C7EF3'),
  });

  renderBarChart({
    chartInstanceKey: 'expense',
    canvasId: 'expense-chart',
    wrapId: 'expense-chart-wrap',
    emptyId: 'expense-chart-empty',
    rows: expenseRows,
    color: cssColor('--expense', '#F45B5B'),
  });
}

// ---- 월별 카드사용 금액 (1~12월) ----
function monthlyTotals(entries, year) {
  const totals = new Array(12).fill(0);
  entries.forEach((e) => {
    if (typeof e.date !== 'string') return;
    const [y, m] = e.date.split('-');
    if (Number(y) !== year) return;
    const idx = Number(m) - 1;
    if (idx >= 0 && idx < 12) totals[idx] += Number(e.amount) || 0;
  });
  return totals;
}

function renderCardUsageChart() {
  const canvas = document.getElementById('card-usage-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const monthlyExpense = monthlyTotals(latestExpense, selectedYear);
  const color = cssColor('--brand', '#7C6FF0');

  if (cardUsageChart) {
    cardUsageChart.data.datasets[0].data = monthlyExpense;
    cardUsageChart.update();
    return;
  }

  cardUsageChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        data: monthlyExpense,
        backgroundColor: color,
        borderRadius: 8,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatWon(ctx.parsed.y) } },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#ECECF1' },
          ticks: {
            callback: (value) => Number(value).toLocaleString('ko-KR'),
            font: { family: 'Pretendard' },
          },
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Pretendard', size: 12 } },
        },
      },
    },
  });
}

// ---- 통장잔액 추이 (선그래프, 1~12월 누적) ----
function renderBalanceChart() {
  const canvas = document.getElementById('balance-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const monthlyIncome = monthlyTotals(latestIncome, selectedYear);
  const monthlyExpense = monthlyTotals(latestExpense, selectedYear);

  let running = 0;
  const cumulative = monthlyIncome.map((incomeAmt, idx) => {
    running += incomeAmt - monthlyExpense[idx];
    return running;
  });

  const color = cssColor('--balance', '#3FB88E');

  if (balanceChart) {
    balanceChart.data.datasets[0].data = cumulative;
    balanceChart.update();
    return;
  }

  balanceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        data: cumulative,
        borderColor: color,
        backgroundColor: `${color}26`,
        pointBackgroundColor: color,
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatWon(ctx.parsed.y) } },
      },
      scales: {
        y: {
          grid: { color: '#ECECF1' },
          ticks: {
            callback: (value) => Number(value).toLocaleString('ko-KR'),
            font: { family: 'Pretendard' },
          },
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Pretendard', size: 12 } },
        },
      },
    },
  });
}

function renderYearCharts() {
  renderCardUsageChart();
  renderBalanceChart();
}

// ---- 기간 탭 UI (수입/지출 항목별) ----
function initPeriodControls() {
  const tabs = document.querySelectorAll('.period-tab');
  const monthField = document.getElementById('month-pick-field');
  const rangeFields = document.getElementById('range-fields');
  const monthPicker = document.getElementById('month-picker');
  const rangeStart = document.getElementById('range-start');
  const rangeEnd = document.getElementById('range-end');

  const nowMonth = currentMonthValue();
  if (monthPicker) monthPicker.value = nowMonth;
  if (rangeStart) rangeStart.value = firstDayOfMonth(nowMonth);
  if (rangeEnd) rangeEnd.value = lastDayOfMonth(nowMonth);

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      periodMode = tab.dataset.mode;

      if (monthField) monthField.hidden = periodMode !== 'month';
      if (rangeFields) rangeFields.hidden = periodMode !== 'range';

      renderIncomeExpenseCharts();
    });
  });

  if (monthPicker) monthPicker.addEventListener('change', renderIncomeExpenseCharts);
  if (rangeStart) rangeStart.addEventListener('change', renderIncomeExpenseCharts);
  if (rangeEnd) rangeEnd.addEventListener('change', renderIncomeExpenseCharts);
}

// ---- 연도 선택 UI (월별 카드사용 금액 / 통장잔액 추이) ----
function initYearControl() {
  const yearInput = document.getElementById('year-picker');
  if (!yearInput) return;
  yearInput.value = selectedYear;
  yearInput.addEventListener('change', () => {
    const v = Number(yearInput.value);
    selectedYear = v && v > 1900 ? v : currentYear();
    renderYearCharts();
  });
}

// ---- 저축 목표 달성률 ----
function renderGoal() {
  const allSavingsEntries = latestExpense.filter(isGoalEntry);
  const currentAmount = allSavingsEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const currentEl = document.getElementById('goal-current-amount');
  const targetEl = document.getElementById('goal-target-amount');
  const fillEl = document.getElementById('goal-progress-fill');
  const percentEl = document.getElementById('goal-progress-percent');

  if (currentEl) currentEl.textContent = formatWon(currentAmount);

  if (!goalTargetAmount || goalTargetAmount <= 0) {
    if (targetEl) targetEl.textContent = '아직 설정 안 함';
    if (fillEl) fillEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    return;
  }

  const percent = Math.min(100, Math.round((currentAmount / goalTargetAmount) * 100));
  if (targetEl) targetEl.textContent = formatWon(goalTargetAmount);
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (percentEl) percentEl.textContent = `${percent}%`;
}

function getGoalDocRef() {
  return db.collection(GOAL_DOC_REF_PATH[0]).doc(GOAL_DOC_REF_PATH[1]);
}

function initGoalModal() {
  const editBtn = document.getElementById('goal-edit-btn');
  const modal = document.getElementById('goal-modal');
  const cancelBtn = document.getElementById('goal-modal-cancel');
  const saveBtn = document.getElementById('goal-modal-save');
  const input = document.getElementById('goal-target-input');
  const messageEl = document.getElementById('goal-modal-message');

  if (!editBtn || !modal) return;

  function openModal() {
    if (input) input.value = goalTargetAmount > 0 ? goalTargetAmount : '';
    if (messageEl) messageEl.textContent = '';
    modal.classList.add('is-open');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function closeModal() {
    modal.classList.remove('is-open');
  }

  editBtn.addEventListener('click', openModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const value = Number(input && input.value);
      if (!value || value <= 0) {
        if (messageEl) {
          messageEl.textContent = '목표 금액을 1원 이상으로 입력해주세요.';
          messageEl.classList.add('error');
        }
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      try {
        await getGoalDocRef().set({
          targetAmount: value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.currentUser ? auth.currentUser.email : null,
        }, { merge: true });
        closeModal();
      } catch (err) {
        if (messageEl) {
          messageEl.textContent = '저장 중 오류가 발생했어요: ' + err.message;
          messageEl.classList.add('error');
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장할게요';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initPeriodControls();
  initYearControl();
  initGoalModal();

  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴

    db.collection(INCOME_COLLECTION).onSnapshot((snapshot) => {
      latestIncome = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderIncomeExpenseCharts();
      renderYearCharts();
    });

    db.collection(EXPENSE_COLLECTION).onSnapshot((snapshot) => {
      latestExpense = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderIncomeExpenseCharts();
      renderYearCharts();
      renderGoal();
    });

    getGoalDocRef().onSnapshot((doc) => {
      goalTargetAmount = doc.exists ? Number(doc.data().targetAmount) || 0 : 0;
      renderGoal();
    });
  });
});

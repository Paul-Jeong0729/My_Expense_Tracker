// stats.js — 통계 페이지 전용 스크립트
// income_entries / expense_entries를 실시간 구독해서 항목별 막대그래프를 그리고,
// 적금·연금저축·개인형IRP 누적 합계로 저축 목표 달성률을 계산합니다.

const INCOME_COLLECTION = 'income_entries';
const EXPENSE_COLLECTION = 'expense_entries';
const GOAL_DOC_REF_PATH = ['app_settings', 'savings_goal'];

// 지출 항목 중 "적금·연금·개인IRP"로 취급할 카테고리 판별용 (section 태그가 없는
// 예전 내역도 놓치지 않도록 카테고리 이름으로도 한 번 더 확인해요)
const SAVINGS_KEYWORD = /적금|연금|irp/i;

function formatWon(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function firstDayOfMonth(monthValue) {
  return `${monthValue}-01`;
}

function lastDayOfMonth(monthValue) {
  const [y, m] = monthValue.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthValue}-${pad2(last)}`;
}

function isSavingsEntry(entry) {
  if (entry.section) return entry.section === 'savings';
  return SAVINGS_KEYWORD.test(entry.category || '');
}

// ---- 상태 ----
let latestIncome = [];
let latestExpense = [];
let goalTargetAmount = 0;
let chartInstance = null;

let periodMode = 'current'; // 'current' | 'month' | 'range'

// ---- 기간 필터 ----
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
  // range
  const startInput = document.getElementById('range-start');
  const endInput = document.getElementById('range-end');
  const start = (startInput && startInput.value) || firstDayOfMonth(currentMonthValue());
  const end = (endInput && endInput.value) || lastDayOfMonth(currentMonthValue());
  return { start, end };
}

function filterByRange(entries, range) {
  return entries.filter((e) => typeof e.date === 'string' && e.date >= range.start && e.date <= range.end);
}

// ---- 항목별 집계 + 차트 ----
function aggregateByCategory(entries) {
  const map = new Map();
  entries.forEach((e) => {
    const key = e.category || '기타';
    const prev = map.get(key) || 0;
    map.set(key, prev + (Number(e.amount) || 0));
  });
  return map;
}

function renderChart() {
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

  const incomeByCategory = aggregateByCategory(incomeInRange);
  const expenseByCategory = aggregateByCategory(expenseInRange);

  const rows = [
    ...Array.from(incomeByCategory, ([category, amount]) => ({ category, amount, type: 'income' })),
    ...Array.from(expenseByCategory, ([category, amount]) => ({ category, amount, type: 'expense' })),
  ].sort((a, b) => b.amount - a.amount);

  const canvas = document.getElementById('category-chart');
  const emptyEl = document.getElementById('chart-empty');
  const wrap = canvas ? canvas.closest('.chart-wrap') : null;

  if (rows.length === 0) {
    if (canvas) canvas.style.display = 'none';
    if (emptyEl) emptyEl.hidden = false;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  if (canvas) canvas.style.display = 'block';
  if (emptyEl) emptyEl.hidden = true;

  const incomeColor = getComputedStyle(document.documentElement).getPropertyValue('--income').trim() || '#4C7EF3';
  const expenseColor = getComputedStyle(document.documentElement).getPropertyValue('--expense').trim() || '#F45B5B';

  const labels = rows.map((r) => r.category);
  const data = rows.map((r) => r.amount);
  const colors = rows.map((r) => (r.type === 'income' ? incomeColor : expenseColor));

  if (wrap) wrap.style.height = '360px';

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
    return;
  }

  if (typeof Chart === 'undefined' || !canvas) return;

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 8,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatWon(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Pretendard', size: 12 },
            autoSkip: false,
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#ECECF1' },
          ticks: {
            callback: (value) => Number(value).toLocaleString('ko-KR'),
            font: { family: 'Pretendard' },
          },
        },
      },
    },
  });
}

// ---- 기간 탭 UI ----
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

      renderChart();
    });
  });

  if (monthPicker) monthPicker.addEventListener('change', renderChart);
  if (rangeStart) rangeStart.addEventListener('change', renderChart);
  if (rangeEnd) rangeEnd.addEventListener('change', renderChart);
}

// ---- 저축 목표 달성률 ----
function renderGoal() {
  const allSavingsEntries = latestExpense.filter(isSavingsEntry);
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
  initGoalModal();

  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴

    db.collection(INCOME_COLLECTION).onSnapshot((snapshot) => {
      latestIncome = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderChart();
    });

    db.collection(EXPENSE_COLLECTION).onSnapshot((snapshot) => {
      latestExpense = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderChart();
      renderGoal();
    });

    getGoalDocRef().onSnapshot((doc) => {
      goalTargetAmount = doc.exists ? Number(doc.data().targetAmount) || 0 : 0;
      renderGoal();
    });
  });
});
// savings.js — 적금 페이지 전용 스크립트
// expense_entries 중 적금·정기예탁·연금 항목만 모아서 트리 형태로 보여주고,
// 누적 금액과 목표 달성률을 계산합니다. (stats.html의 "저축 목표 달성률"과 같은
// Firestore 문서를 공유하기 때문에 두 페이지의 % 는 항상 같아요.)

const EXPENSE_COLLECTION = 'expense_entries';
const GOAL_DOC_REF_PATH = ['app_settings', 'savings_goal'];

// expense.js의 FIELD_MAP과 정확히 같은 category 문자열을 사용해야 매칭이 돼요.
const TREE_ITEMS = [
  { key: 'nh-life', category: '농협생명보험 (적금)', hasMonthly: true, group: 'savings-deposit' },
  { key: 'hana-cheongyak', category: '청약통장 (적금)', hasMonthly: true, group: 'savings-deposit' },
  { key: 'hana-sonnimcare', category: '손님캐어 적금', hasMonthly: true, group: 'savings-deposit' },
  { key: 'deposit-nh-1y', category: '정기예탁 1년 (농협)', hasMonthly: false, group: 'savings-deposit' },
  { key: 'pension-kb-songchon', category: '송촌자립 (퇴직연금·국민은행)', hasMonthly: true, group: 'pension' },
  { key: 'pension-kb-irp', category: 'IRP (퇴직연금·국민은행)', hasMonthly: false, group: 'pension' },
  { key: 'pension-hana-dolbom', category: '돌봄센터 (퇴직연금·하나은행)', hasMonthly: true, group: 'pension' },
  { key: 'pension-hana-irp', category: 'IRP (퇴직연금·하나은행)', hasMonthly: false, group: 'pension' },
];

function formatWon(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

let latestExpense = [];
let goalTargetAmount = 0;

function entriesFor(category) {
  return latestExpense.filter((e) => e.category === category);
}

function cumulativeFor(category) {
  return entriesFor(category).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

function latestMonthlyAmountFor(category) {
  const entries = entriesFor(category);
  if (entries.length === 0) return null;
  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  return Number(sorted[0].amount) || 0;
}

function renderTree() {
  let savingsDepositTotal = 0;
  let pensionTotal = 0;

  TREE_ITEMS.forEach((item) => {
    const cumulative = cumulativeFor(item.category);

    const cumulativeEl = document.querySelector(`[data-cumulative="${item.key}"]`);
    if (cumulativeEl) cumulativeEl.textContent = `${formatWon(cumulative)} 누적`;

    if (item.hasMonthly) {
      const monthlyEl = document.querySelector(`[data-monthly="${item.key}"]`);
      const monthly = latestMonthlyAmountFor(item.category);
      if (monthlyEl) monthlyEl.textContent = monthly === null ? '월 -' : `월 ${formatWon(monthly)}`;
    }

    if (item.group === 'savings-deposit') savingsDepositTotal += cumulative;
    if (item.group === 'pension') pensionTotal += cumulative;
  });

  const savingsDepositTotalEl = document.getElementById('savings-deposit-total');
  const pensionTotalEl = document.getElementById('pension-total');
  if (savingsDepositTotalEl) savingsDepositTotalEl.textContent = formatWon(savingsDepositTotal);
  if (pensionTotalEl) pensionTotalEl.textContent = formatWon(pensionTotal);

  renderOverallGoal(savingsDepositTotal + pensionTotal);
}

function renderOverallGoal(currentAmount) {
  const titleAmountEl = document.getElementById('goal-title-amount');
  const titleSubEl = document.getElementById('goal-title-sub');
  const percentEl = document.getElementById('overall-goal-percent');
  const fillEl = document.getElementById('overall-goal-fill');
  const currentEl = document.getElementById('overall-current-amount');
  const targetEl = document.getElementById('overall-target-amount');

  if (currentEl) currentEl.textContent = formatWon(currentAmount);

  if (!goalTargetAmount || goalTargetAmount <= 0) {
    if (titleAmountEl) titleAmountEl.textContent = '설정 전';
    if (titleSubEl) titleSubEl.textContent = '목표를 설정하고 달성률을 확인해보세요';
    if (percentEl) percentEl.textContent = '0%';
    if (fillEl) fillEl.style.width = '0%';
    if (targetEl) targetEl.textContent = '아직 설정 안 함';
    return;
  }

  const percent = Math.min(100, Math.round((currentAmount / goalTargetAmount) * 100));

  if (titleAmountEl) titleAmountEl.textContent = formatWon(goalTargetAmount);
  if (titleSubEl) titleSubEl.textContent = `지금까지 ${formatWon(currentAmount)} 모았어요 (${percent}%)`;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (targetEl) targetEl.textContent = formatWon(goalTargetAmount);
}

function getGoalDocRef() {
  return db.collection(GOAL_DOC_REF_PATH[0]).doc(GOAL_DOC_REF_PATH[1]);
}

// ---- 목표 금액 설정 모달 ----
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

// ---- IRP 등 "추가 입금" 빠른 입력 ----
function initQuickAddButtons() {
  document.querySelectorAll('.tree-add-btn').forEach((btn) => {
    const key = btn.dataset.addKey;
    const item = TREE_ITEMS.find((t) => t.key === key);
    const input = document.querySelector(`.tree-add-input[data-add-key="${key}"]`);
    const messageEl = document.querySelector(`[data-add-message="${key}"]`);
    if (!item || !input) return;

    btn.addEventListener('click', async () => {
      const amount = Number(input.value);
      if (!amount || amount <= 0) {
        if (messageEl) {
          messageEl.textContent = '입금액을 입력해주세요.';
          messageEl.classList.add('error');
        }
        return;
      }

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = '입금 중...';

      try {
        await db.collection(EXPENSE_COLLECTION).doc().set({
          date: new Date().toISOString().slice(0, 10),
          category: item.category,
          section: 'pension',
          amount,
          memo: '추가 입금',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser ? auth.currentUser.email : null,
        });
        input.value = '';
        if (messageEl) {
          messageEl.classList.remove('error');
          messageEl.textContent = `${formatWon(amount)} 입금 완료!`;
          setTimeout(() => { messageEl.textContent = ''; }, 3000);
        }
      } catch (err) {
        if (messageEl) {
          messageEl.classList.add('error');
          messageEl.textContent = '입금 중 오류가 발생했어요: ' + err.message;
        }
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initGoalModal();
  initQuickAddButtons();

  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴

    db.collection(EXPENSE_COLLECTION).onSnapshot((snapshot) => {
      latestExpense = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderTree();
    });

    getGoalDocRef().onSnapshot((doc) => {
      goalTargetAmount = doc.exists ? Number(doc.data().targetAmount) || 0 : 0;
      renderTree();
    });
  });
});

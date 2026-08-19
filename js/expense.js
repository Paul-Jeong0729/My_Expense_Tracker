// expense.js — 지출 입력 폼 + 내역 체크박스 선택/수정/삭제 + 자동이체일 설정
// Firestore(expense_entries 컬렉션)를 실시간으로 구독해서 두 사람 화면이
// 자동으로 동기화됩니다. 자동이체 설정은 auto_debit_settings 컬렉션에 저장되고,
// expense.html이 열려 있는 날 중 설정한 날짜가 되면 자동으로 지출 내역이 추가됩니다.
// (브라우저를 열어야 실행되는 방식이라, 그 날 한 번도 접속하지 않으면
//  다음 접속 시 자동으로 채워집니다.)

const COLLECTION = 'expense_entries';
const AUTO_DEBIT_COLLECTION = 'auto_debit_settings';

// 폼 필드 key → { category(표시명), section(소계 그룹) } 매핑
const FIELD_MAP = [
  // 적금
  { key: 'nh-life', category: '농협생명보험 (적금)', section: 'savings' },
  { key: 'hana-cheongyak', category: '청약통장 (적금)', section: 'savings' },
  { key: 'hana-sonnimcare', category: '손님캐어 적금', section: 'savings' },

  // 연금·개인IRP
  { key: 'pension', category: '연금저축 (적금)', section: 'savings' },
  { key: 'irp', category: '개인형IRP (적금)', section: 'savings' },

  // 고정지출 - 헌금
  { key: 'offer-tithe', category: '십일조 (헌금)', section: 'fixed' },
  { key: 'offer-season', category: '절기헌금', section: 'fixed' },
  { key: 'offer-building', category: '건축헌금', section: 'fixed' },
  { key: 'offer-mission', category: '선교헌금', section: 'fixed' },
  { key: 'offer-region', category: '지역회비', section: 'fixed' },
  { key: 'offer-cheonji', category: '천지일보', section: 'fixed' },

  // 고정지출 - 보험료
  { key: 'ins-hyundai', category: '현대해상 (보험료)', section: 'fixed' },
  { key: 'ins-yebyeol1', category: '예별손1 (보험료)', section: 'fixed' },
  { key: 'ins-yebyeol2', category: '예별손2 (보험료)', section: 'fixed' },
  { key: 'ins-axa', category: 'AXA 운전자보험 (보험료)', section: 'fixed' },
  { key: 'ins-woongjin', category: '웅진프라이드 (보험료)', section: 'fixed' },
  { key: 'ins-hyundai-care', category: '현대해상 간병 (보험료)', section: 'fixed' },

  // 고정지출 - 할부
  { key: 'installment-car', category: '자동차 할부', section: 'fixed' },
  { key: 'installment-car-ins', category: '자동차 보험 (할부)', section: 'fixed' },

  // 고정지출 - 기타
  { key: 'phone-bill', category: '핸드폰요금', section: 'fixed' },
  { key: 'naver-store', category: '네이버스토어', section: 'fixed' },
  { key: 'hwanhee-allowance', category: '환희 용돈', section: 'fixed' },

  // 고정지출 - 공과금
  { key: 'util-tv', category: 'TV (공과금)', section: 'fixed' },
  { key: 'util-electric', category: '전기 (공과금)', section: 'fixed' },
  { key: 'util-gas', category: '가스 (공과금)', section: 'fixed' },

  // 고정지출 - 대출상환
  { key: 'loan-principal', category: '대출 원금', section: 'fixed' },
  { key: 'loan-interest', category: '대출 이자', section: 'fixed' },

  // 필수지출
  { key: 'gas-charge', category: '가스충전', section: 'essential' },
  { key: 'jongho-meal', category: '종호 밥', section: 'essential' },

  // 일반지출
  { key: 'mart', category: '마트', section: 'general' },
  { key: 'cafe', category: '카페', section: 'general' },
  { key: 'online', category: '온라인', section: 'general' },
  { key: 'restaurant', category: '식당', section: 'general' },
  { key: 'etc', category: '기타', section: 'general' },
];

// ---- 선택/편집 상태 ----
const selectedIds = new Set();
let editingId = null;
let currentEntries = [];
let autoDebitSettings = {}; // { [key]: { day, amount, lastRunMonth } }
let activePopoverKey = null;

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

// ---- 내역 테이블 렌더 ----

function renderTable(entries) {
  const tbody = document.getElementById('expense-table-body');
  if (!tbody) return;

  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">아직 등록된 내역이 없어요</td></tr>`;
    updateActionBar();
    return;
  }

  tbody.innerHTML = sorted.map((entry) => {
    if (entry.id === editingId) {
      return `
        <tr data-id="${entry.id}" class="editing-row">
          <td class="col-check"></td>
          <td><input type="date" class="edit-date" value="${escapeHtml(entry.date)}"></td>
          <td><input type="text" class="edit-category" value="${escapeHtml(entry.category)}"></td>
          <td><input type="number" class="edit-amount" min="0" value="${entry.amount}"></td>
          <td>
            <div class="edit-memo-row">
              <input type="text" class="edit-memo" value="${escapeHtml(entry.memo || '')}">
              <button type="button" class="row-save-btn" data-id="${entry.id}">저장</button>
              <button type="button" class="row-cancel-btn" data-id="${entry.id}">취소</button>
            </div>
          </td>
        </tr>
      `;
    }

    const checked = selectedIds.has(entry.id) ? 'checked' : '';
    const autoTag = entry.autoKey ? ' <span style="color:var(--text-muted);font-size:11px;">(자동)</span>' : '';
    return `
      <tr data-id="${entry.id}">
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${entry.id}" ${checked}></td>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.category)}${autoTag}</td>
        <td class="expense">-${formatWon(entry.amount)}</td>
        <td>${escapeHtml(entry.memo || '')}</td>
      </tr>
    `;
  }).join('');

  updateActionBar();
}

function updateActionBar() {
  const countEl = document.getElementById('expense-selected-count');
  const editBtn = document.getElementById('expense-edit-btn');
  const deleteBtn = document.getElementById('expense-delete-btn');
  const selectAll = document.getElementById('expense-select-all');

  const count = selectedIds.size;
  if (countEl) countEl.textContent = `${count}개 선택됨`;

  const isEditing = editingId !== null;
  if (editBtn) editBtn.disabled = isEditing || count !== 1;
  if (deleteBtn) deleteBtn.disabled = isEditing || count === 0;
  if (selectAll) selectAll.disabled = isEditing;
}

// ---- 입력 폼 (상단) ----

function getField(key) {
  return document.querySelector(`[data-key="${key}"]`);
}

function calcSectionSubtotal(section) {
  return FIELD_MAP
    .filter((field) => field.section === section)
    .reduce((sum, field) => {
      const input = getField(field.key);
      const value = input ? Number(input.value) || 0 : 0;
      return sum + value;
    }, 0);
}

function calcTotal() {
  return FIELD_MAP.reduce((sum, field) => {
    const input = getField(field.key);
    const value = input ? Number(input.value) || 0 : 0;
    return sum + value;
  }, 0);
}

function updateTotalDisplay() {
  const totalEl = document.getElementById('expense-total');
  if (totalEl) totalEl.textContent = formatWon(calcTotal());

  document.querySelectorAll('[data-subtotal-for]').forEach((el) => {
    const section = el.dataset.subtotalFor;
    el.textContent = formatWon(calcSectionSubtotal(section));
  });
}

function initForm() {
  const form = document.getElementById('expense-form');
  if (!form) return;

  const dateInput = document.getElementById('expense-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  form.addEventListener('input', updateTotalDisplay);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const date = (dateInput && dateInput.value) || new Date().toISOString().slice(0, 10);

    const newEntries = FIELD_MAP
      .map((field) => {
        const input = getField(field.key);
        const amount = input ? Number(input.value) || 0 : 0;
        const memoInput = getField(`${field.key}-memo`);
        const memo = memoInput ? memoInput.value.trim() : '';
        return { field, amount, memo };
      })
      .filter((row) => row.amount > 0)
      .map((row) => ({
        date,
        category: row.field.category,
        section: row.field.section,
        amount: row.amount,
        memo: row.memo,
      }));

    if (newEntries.length === 0) {
      alert('입력된 금액이 없습니다.');
      return;
    }

    const submitBtn = form.querySelector('.save-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '저장 중...'; }

    try {
      const batch = db.batch();
      newEntries.forEach((entry) => {
        const ref = db.collection(COLLECTION).doc();
        batch.set(ref, {
          ...entry,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser ? auth.currentUser.email : null,
        });
      });
      await batch.commit();

      form.reset();
      dateInput.value = date;
      updateTotalDisplay();
    } catch (err) {
      alert('저장 중 오류가 발생했어요: ' + err.message);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '저장하기'; }
    }
  });

  updateTotalDisplay();
}

// ---- 내역 테이블: 체크박스 선택 / 수정 / 삭제 ----

function initTableInteractions() {
  const tbody = document.getElementById('expense-table-body');
  const selectAll = document.getElementById('expense-select-all');
  const editBtn = document.getElementById('expense-edit-btn');
  const deleteBtn = document.getElementById('expense-delete-btn');

  if (!tbody) return;

  tbody.addEventListener('change', (event) => {
    const target = event.target;
    if (target.classList.contains('row-check')) {
      const id = target.dataset.id;
      if (target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateActionBar();
    }
  });

  tbody.addEventListener('click', async (event) => {
    const saveBtn = event.target.closest('.row-save-btn');
    const cancelBtn = event.target.closest('.row-cancel-btn');

    if (saveBtn) {
      const id = saveBtn.dataset.id;
      const row = saveBtn.closest('tr');
      const date = row.querySelector('.edit-date').value;
      const category = row.querySelector('.edit-category').value.trim();
      const amount = Number(row.querySelector('.edit-amount').value) || 0;
      const memo = row.querySelector('.edit-memo').value.trim();

      if (!date || !category || amount <= 0) {
        alert('날짜, 항목, 금액(0보다 큰 값)을 확인해주세요.');
        return;
      }

      try {
        await db.collection(COLLECTION).doc(id).update({ date, category, amount, memo });
        editingId = null;
        selectedIds.clear();
      } catch (err) {
        alert('수정 중 오류가 발생했어요: ' + err.message);
      }
    }

    if (cancelBtn) {
      editingId = null;
      renderTable(currentEntries);
    }
  });

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checkboxes = tbody.querySelectorAll('.row-check');
      checkboxes.forEach((cb) => {
        cb.checked = selectAll.checked;
        const id = cb.dataset.id;
        if (selectAll.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      });
      updateActionBar();
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (selectedIds.size !== 1) return;
      editingId = [...selectedIds][0];
      selectedIds.clear();
      renderTable(currentEntries);
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      openDeleteModal();
    });
  }
}

// ---- 삭제 확인 모달 ----

async function performDelete() {
  try {
    const batch = db.batch();
    selectedIds.forEach((id) => batch.delete(db.collection(COLLECTION).doc(id)));
    await batch.commit();
    selectedIds.clear();
    editingId = null;
  } catch (err) {
    alert('삭제 중 오류가 발생했어요: ' + err.message);
  }
}

function openDeleteModal() {
  const modal = document.getElementById('expense-delete-modal');
  const message = document.getElementById('expense-delete-modal-message');
  if (!modal) return;
  if (message) {
    message.textContent = `선택한 ${selectedIds.size}개 내역이 삭제돼요. 이 작업은 되돌릴 수 없어요.`;
  }
  modal.classList.add('is-open');
}

function closeDeleteModal() {
  const modal = document.getElementById('expense-delete-modal');
  if (modal) modal.classList.remove('is-open');
}

function initDeleteModal() {
  const modal = document.getElementById('expense-delete-modal');
  const confirmBtn = document.getElementById('expense-delete-modal-confirm');
  const cancelBtn = document.getElementById('expense-delete-modal-cancel');
  if (!modal) return;

  confirmBtn.addEventListener('click', () => {
    performDelete();
    closeDeleteModal();
  });
  cancelBtn.addEventListener('click', closeDeleteModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeDeleteModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeDeleteModal();
    }
  });
}

// ---- 자동이체일 설정 (팝오버) ----

function updateAutoDebitButtonLabel(key) {
  const textEl = document.querySelector(`[data-auto-text="${key}"]`);
  const btn = document.querySelector(`[data-auto-key="${key}"]`);
  const setting = autoDebitSettings[key];

  const label = setting && setting.day ? `매월 ${setting.day}일` : '이체일 설정';
  if (textEl) textEl.textContent = label;
  if (btn) {
    btn.classList.toggle('is-set', !!(setting && setting.day));
    btn.title = label;
  }
}

function renderAllAutoDebitLabels() {
  FIELD_MAP.forEach((field) => updateAutoDebitButtonLabel(field.key));
}

function buildDayGrid(selectedDay) {
  const grid = document.getElementById('auto-debit-popover-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let day = 1; day <= 31; day++) {
    const cell = document.createElement('div');
    cell.className = 'auto-debit-day-cell' + (day === selectedDay ? ' is-selected' : '');
    cell.textContent = day;
    cell.dataset.day = String(day);
    grid.appendChild(cell);
  }
}

function positionPopover(triggerEl) {
  const popover = document.getElementById('auto-debit-popover');
  if (!popover || !triggerEl) return;

  const rect = triggerEl.getBoundingClientRect();
  const popoverWidth = 240;
  let left = rect.left;
  if (left + popoverWidth > window.innerWidth - 16) {
    left = window.innerWidth - popoverWidth - 16;
  }
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${Math.max(16, left)}px`;
}

function openAutoDebitPopover(key, triggerEl) {
  const popover = document.getElementById('auto-debit-popover');
  const title = document.getElementById('auto-debit-popover-title');
  if (!popover) return;

  activePopoverKey = key;
  const field = FIELD_MAP.find((f) => f.key === key);
  if (title && field) title.textContent = `${field.category} · 이체일 선택`;

  const currentDay = autoDebitSettings[key] ? autoDebitSettings[key].day : null;
  buildDayGrid(currentDay);
  positionPopover(triggerEl);
  popover.classList.add('is-open');
}

function closeAutoDebitPopover() {
  const popover = document.getElementById('auto-debit-popover');
  if (popover) popover.classList.remove('is-open');
  activePopoverKey = null;
}

async function saveAutoDebitDay(key, day) {
  const field = FIELD_MAP.find((f) => f.key === key);
  const input = getField(key);
  const amount = input ? Number(input.value) || 0 : 0;

  try {
    await db.collection(AUTO_DEBIT_COLLECTION).doc(key).set({
      key,
      category: field ? field.category : key,
      day,
      amount,
    }, { merge: true });
  } catch (err) {
    alert('자동이체일 저장 중 오류가 발생했어요: ' + err.message);
  }
}

async function clearAutoDebitDay(key) {
  try {
    await db.collection(AUTO_DEBIT_COLLECTION).doc(key).delete();
  } catch (err) {
    alert('자동이체일 해제 중 오류가 발생했어요: ' + err.message);
  }
}

function initAutoDebitPopover() {
  const triggers = document.querySelectorAll('.auto-debit-trigger');
  const popover = document.getElementById('auto-debit-popover');
  const closeBtn = document.getElementById('auto-debit-popover-close');
  const grid = document.getElementById('auto-debit-popover-grid');
  const clearBtn = document.getElementById('auto-debit-popover-clear');

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const key = trigger.dataset.autoKey;
      if (activePopoverKey === key) {
        closeAutoDebitPopover();
      } else {
        openAutoDebitPopover(key, trigger);
      }
    });
  });

  if (grid) {
    grid.addEventListener('click', (event) => {
      const cell = event.target.closest('.auto-debit-day-cell');
      if (!cell || !activePopoverKey) return;
      const day = Number(cell.dataset.day);
      saveAutoDebitDay(activePopoverKey, day);
      closeAutoDebitPopover();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!activePopoverKey) return;
      clearAutoDebitDay(activePopoverKey);
      closeAutoDebitPopover();
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeAutoDebitPopover);

  document.addEventListener('click', (event) => {
    if (popover && popover.classList.contains('is-open') && !popover.contains(event.target)) {
      closeAutoDebitPopover();
    }
  });

  window.addEventListener('resize', () => {
    if (activePopoverKey) closeAutoDebitPopover();
  });
}

// 매달 설정한 날짜가 되면(오늘 = day, 이번 달에 아직 미실행) 자동으로 지출 내역 생성
async function runAutoDebitCheck() {
  const today = new Date();
  const todayDay = today.getDate();
  const ym = currentYearMonth();

  const dueSettings = Object.values(autoDebitSettings).filter((setting) => (
    setting.day === todayDay && setting.lastRunMonth !== ym && Number(setting.amount) > 0
  ));

  if (dueSettings.length === 0) return;

  try {
    const batch = db.batch();
    dueSettings.forEach((setting) => {
      const entryRef = db.collection(COLLECTION).doc();
      const field = FIELD_MAP.find((f) => f.key === setting.key);
      batch.set(entryRef, {
        date: today.toISOString().slice(0, 10),
        category: setting.category,
        section: field ? field.section : null,
        amount: setting.amount,
        memo: '자동이체',
        autoKey: setting.key,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.currentUser ? auth.currentUser.email : null,
      });
      const settingRef = db.collection(AUTO_DEBIT_COLLECTION).doc(setting.key);
      batch.set(settingRef, { lastRunMonth: ym }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('자동이체 처리 중 오류:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initForm();
  initTableInteractions();
  initDeleteModal();
  initAutoDebitPopover();

  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴

    db.collection(COLLECTION).onSnapshot((snapshot) => {
      currentEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderTable(currentEntries);
    }, (err) => {
      console.error(err);
      alert('데이터를 불러오는 중 오류가 발생했어요: ' + err.message);
    });

    db.collection(AUTO_DEBIT_COLLECTION).onSnapshot((snapshot) => {
      autoDebitSettings = {};
      snapshot.docs.forEach((doc) => { autoDebitSettings[doc.id] = doc.data(); });
      renderAllAutoDebitLabels();
      runAutoDebitCheck();
    });
  });
});

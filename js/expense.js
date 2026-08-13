// expense.js — 지출 입력 폼 + 내역 체크박스 선택/수정/삭제 로직 (localStorage 기반)

const STORAGE_KEY = 'gagyebu_expense_entries';
const AUTO_DEBIT_KEY = 'gagyebu_expense_autodebit';

// 기존 index.html 지출 내역과 동일한 초기 데이터 (최초 방문 시 1회만 사용)
const SEED_ENTRIES = [
  { date: '2024-05-20', category: '식비', amount: 350000, memo: '마트 장보기' },
  { date: '2024-05-18', category: '교통비', amount: 80000, memo: '주유비' },
  { date: '2024-05-15', category: '쇼핑', amount: 200000, memo: '의류 구매' },
  { date: '2024-05-12', category: '통신비', amount: 70000, memo: '핸드폰 요금' },
  { date: '2024-05-10', category: '문화/여가', amount: 120000, memo: '영화 관람' },
];

// 폼 필드 key → 내역 테이블 항목명 / 소계 그룹 / 기본 금액 매핑
const FIELD_MAP = [
  // 1. 적금
  { key: 'nh-life', category: '농협생명보험 (적금·농협)', section: 'savings' },
  { key: 'hana-cheongyak', category: '청약통장 (적금·하나)', section: 'savings' },
  { key: 'hana-sonnimcare', category: '손님캐어 적금 (적금·하나)', section: 'savings' },

  // 2. 고정지출 - 헌금
  { key: 'offer-tithe', category: '십일조 (헌금)', section: 'fixed' },
  { key: 'offer-season', category: '절기헌금', section: 'fixed' },
  { key: 'offer-building', category: '건축헌금', section: 'fixed' },
  { key: 'offer-mission', category: '선교헌금', section: 'fixed' },
  { key: 'offer-region', category: '지역회비', section: 'fixed' },
  { key: 'offer-cheonji', category: '천지일보', section: 'fixed' },

  // 2. 고정지출 - 보험료
  { key: 'ins-hyundai', category: '현대해상 (보험료)', section: 'fixed' },
  { key: 'ins-yebyeol1', category: '예별손1 (보험료)', section: 'fixed' },
  { key: 'ins-yebyeol2', category: '예별손2 (보험료)', section: 'fixed' },
  { key: 'ins-axa', category: 'AXA 운전자보험', section: 'fixed' },
  { key: 'ins-woongjin', category: '웅진프라이드 (보험료)', section: 'fixed' },
  { key: 'ins-hyundai-care', category: '현대해상 간병 (보험료)', section: 'fixed' },

  // 2. 고정지출 - 할부
  { key: 'installment-car', category: '자동차 할부', section: 'fixed' },
  { key: 'installment-car-ins', category: '자동차 보험 (할부)', section: 'fixed' },

  // 2. 고정지출 - 기타 고정
  { key: 'phone-bill', category: '핸드폰요금', section: 'fixed' },
  { key: 'naver-store', category: '네이버스토어', section: 'fixed' },
  { key: 'hwanhee-allowance', category: '환희 용돈', section: 'fixed' },

  // 2. 고정지출 - 공과금
  { key: 'util-tv', category: 'TV (공과금)', section: 'fixed' },
  { key: 'util-electric', category: '전기 (공과금)', section: 'fixed' },
  { key: 'util-gas', category: '가스 (공과금)', section: 'fixed' },

  // 2. 고정지출 - 대출상환
  { key: 'loan-principal', category: '원금 (대출상환)', section: 'fixed' },
  { key: 'loan-interest', category: '대출이자 (대출상환)', section: 'fixed' },

  // 3. 필수지출
  { key: 'gas-charge', category: '가스충전', section: 'essential' },
  { key: 'jongho-meal', category: '종호 밥', section: 'essential' },

  // 4. 일반지출
  { key: 'mart', category: '마트', section: 'general' },
  { key: 'cafe', category: '카페', section: 'general' },
  { key: 'online', category: '온라인', section: 'general' },
  { key: 'restaurant', category: '식당', section: 'general' },
  { key: 'etc', category: '기타', section: 'general' },
];

// ---- 선택/편집 상태 (페이지 세션 동안만 유지) ----
const selectedIds = new Set();
let editingId = null;

function genId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let entries;
  if (!raw) {
    entries = SEED_ENTRIES.slice();
  } else {
    try {
      const parsed = JSON.parse(raw);
      entries = Array.isArray(parsed) ? parsed : SEED_ENTRIES.slice();
    } catch (e) {
      entries = SEED_ENTRIES.slice();
    }
  }

  // id가 없는 항목(초기 seed 등)에는 id를 부여하고 즉시 저장해 이후에도 안정적으로 유지
  let needsSave = false;
  entries = entries.map((entry) => {
    if (!entry.id) {
      needsSave = true;
      return { ...entry, id: genId() };
    }
    return entry;
  });
  if (needsSave) saveEntries(entries);

  return entries;
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatWon(amount) {
  return Number(amount).toLocaleString('ko-KR') + '원';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderTable(entries) {
  const tbody = document.getElementById('expense-table-body');
  if (!tbody) return;

  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

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
    return `
      <tr data-id="${entry.id}">
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${entry.id}" ${checked}></td>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.category)}</td>
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
  return document.querySelector(`#expense-form [data-key="${key}"]`);
}

function calcSectionTotal(section) {
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

  ['savings', 'fixed', 'essential', 'general'].forEach((section) => {
    const el = document.querySelector(`[data-subtotal-for="${section}"]`);
    if (el) el.textContent = formatWon(calcSectionTotal(section));
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

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const date = (dateInput && dateInput.value) || new Date().toISOString().slice(0, 10);
    const memoInput = getField('etc-memo');
    const etcMemo = memoInput ? memoInput.value.trim() : '';

    const newEntries = FIELD_MAP
      .map((field) => {
        const input = getField(field.key);
        const amount = input ? Number(input.value) || 0 : 0;
        return { field, amount };
      })
      .filter((row) => row.amount > 0)
      .map((row) => ({
        id: genId(),
        date,
        category: row.field.category,
        amount: row.amount,
        memo: row.field.key === 'etc' ? etcMemo : '',
      }));

    if (newEntries.length === 0) {
      alert('입력된 금액이 없습니다.');
      return;
    }

    const entries = loadEntries().concat(newEntries);
    saveEntries(entries);
    renderTable(entries);

    // 저장 후 폼은 초기화하되, 매번 다시 채우기 번거로운 고정 지출 항목은
    // 기본값(원본 참고 금액)으로 되돌려 다음 입력에 대비합니다.
    form.reset();
    dateInput.value = date;
    updateTotalDisplay();
  });

  updateTotalDisplay();
}

// ---- 자동이체 설정 (적금·고정지출 항목별 이체일) ----

function loadAutoDebitSettings() {
  const raw = localStorage.getItem(AUTO_DEBIT_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveAutoDebitSettings(settings) {
  localStorage.setItem(AUTO_DEBIT_KEY, JSON.stringify(settings));
}

function currentYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// 저장된 자동이체일 값으로 각 트리거 버튼의 라벨/스타일을 갱신
function refreshAutoDebitTriggers() {
  const settings = loadAutoDebitSettings();

  document.querySelectorAll('.auto-debit-trigger').forEach((btn) => {
    const key = btn.dataset.autoKey;
    const textEl = btn.querySelector('.auto-debit-text');
    const saved = settings[key];

    if (saved && saved.day) {
      btn.classList.add('is-set');
      if (textEl) textEl.textContent = `매월 ${saved.day}일`;
    } else {
      btn.classList.remove('is-set');
      if (textEl) textEl.textContent = '이체일 설정';
    }
  });
}

// 팝오버 안에 1~31 날짜 그리드를 한 번만 만들어둠
function buildAutoDebitGrid() {
  const grid = document.getElementById('auto-debit-popover-grid');
  if (!grid || grid.childElementCount > 0) return;

  for (let day = 1; day <= 31; day += 1) {
    const cell = document.createElement('div');
    cell.className = 'auto-debit-day-cell';
    cell.textContent = String(day);
    cell.dataset.day = String(day);
    grid.appendChild(cell);
  }
}

let activeAutoDebitKey = null;

function positionAutoDebitPopover(trigger) {
  const popover = document.getElementById('auto-debit-popover');
  if (!popover || !trigger) return;

  const rect = trigger.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth || 240;
  const margin = 12;

  let left = rect.left;
  if (left + popoverWidth > window.innerWidth - margin) {
    left = window.innerWidth - margin - popoverWidth;
  }
  if (left < margin) left = margin;

  let top = rect.bottom + 8;
  const popoverHeight = popover.offsetHeight || 260;
  if (top + popoverHeight > window.innerHeight - margin) {
    top = rect.top - popoverHeight - 8;
  }

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function openAutoDebitPopover(trigger) {
  const key = trigger.dataset.autoKey;
  const popover = document.getElementById('auto-debit-popover');
  const title = document.getElementById('auto-debit-popover-title');
  if (!popover) return;

  activeAutoDebitKey = key;

  const fieldLabel = trigger.closest('.form-field')?.querySelector('span')?.textContent || '';
  if (title) title.textContent = fieldLabel ? `자동이체일 · ${fieldLabel}` : '자동이체일 선택';

  const settings = loadAutoDebitSettings();
  const savedDay = settings[key] && settings[key].day;

  document.querySelectorAll('.auto-debit-day-cell').forEach((cell) => {
    cell.classList.toggle('is-selected', Number(cell.dataset.day) === savedDay);
  });

  popover.classList.add('is-open');
  positionAutoDebitPopover(trigger);
}

function closeAutoDebitPopover() {
  const popover = document.getElementById('auto-debit-popover');
  if (popover) popover.classList.remove('is-open');
  activeAutoDebitKey = null;
}

function selectAutoDebitDay(day) {
  if (!activeAutoDebitKey) return;
  const settings = loadAutoDebitSettings();
  settings[activeAutoDebitKey] = { ...(settings[activeAutoDebitKey] || {}), day };
  saveAutoDebitSettings(settings);
  refreshAutoDebitTriggers();
  closeAutoDebitPopover();
}

function clearAutoDebitDay() {
  if (!activeAutoDebitKey) return;
  const settings = loadAutoDebitSettings();
  delete settings[activeAutoDebitKey];
  saveAutoDebitSettings(settings);
  refreshAutoDebitTriggers();
  closeAutoDebitPopover();
}

function initAutoDebitUI() {
  buildAutoDebitGrid();
  refreshAutoDebitTriggers();

  document.querySelectorAll('.auto-debit-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      openAutoDebitPopover(trigger);
    });
  });

  const grid = document.getElementById('auto-debit-popover-grid');
  if (grid) {
    grid.addEventListener('click', (event) => {
      const cell = event.target.closest('.auto-debit-day-cell');
      if (cell) selectAutoDebitDay(Number(cell.dataset.day));
    });
  }

  const closeBtn = document.getElementById('auto-debit-popover-close');
  if (closeBtn) closeBtn.addEventListener('click', closeAutoDebitPopover);

  const clearBtn = document.getElementById('auto-debit-popover-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearAutoDebitDay);

  document.addEventListener('click', (event) => {
    const popover = document.getElementById('auto-debit-popover');
    if (!popover || !popover.classList.contains('is-open')) return;
    if (!popover.contains(event.target)) closeAutoDebitPopover();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAutoDebitPopover();
  });

  window.addEventListener('resize', () => {
    const popover = document.getElementById('auto-debit-popover');
    if (popover && popover.classList.contains('is-open') && activeAutoDebitKey) {
      const trigger = document.querySelector(`.auto-debit-trigger[data-auto-key="${activeAutoDebitKey}"]`);
      if (trigger) positionAutoDebitPopover(trigger);
    }
  });
}



// 오늘이 자동이체일이 된 항목을, 이번 달에 아직 처리 안 했다면 지출 내역에 자동 추가
function runAutoDebitCheck() {
  const settings = loadAutoDebitSettings();
  const today = new Date();
  const ym = currentYearMonth(today);
  const todayDay = today.getDate();

  let entries = loadEntries();
  let settingsChanged = false;
  let entriesChanged = false;

  FIELD_MAP.forEach((field) => {
    const cfg = settings[field.key];
    if (!cfg || !cfg.day) return;
    if (cfg.lastAppliedYm === ym) return; // 이번 달엔 이미 처리됨
    if (todayDay < cfg.day) return; // 아직 이체일이 안 됨

    const input = getField(field.key);
    const amount = input ? Number(input.value) || 0 : 0;
    if (amount <= 0) return;

    const dateStr = `${ym}-${String(cfg.day).padStart(2, '0')}`;

    entries = entries.concat([{
      id: genId(),
      date: dateStr,
      category: field.category,
      amount,
      memo: '자동이체',
    }]);

    cfg.lastAppliedYm = ym;
    settingsChanged = true;
    entriesChanged = true;
  });

  if (settingsChanged) saveAutoDebitSettings(settings);
  if (entriesChanged) {
    saveEntries(entries);
    renderTable(entries);
  }
}



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

  tbody.addEventListener('click', (event) => {
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

      const entries = loadEntries().map((entry) =>
        entry.id === id ? { ...entry, date, category, amount, memo } : entry
      );
      saveEntries(entries);
      editingId = null;
      selectedIds.clear();
      renderTable(entries);
    }

    if (cancelBtn) {
      editingId = null;
      renderTable(loadEntries());
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
      renderTable(loadEntries());
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

function performDelete() {
  const entries = loadEntries().filter((entry) => !selectedIds.has(entry.id));
  saveEntries(entries);
  selectedIds.clear();
  if (editingId && !entries.some((e) => e.id === editingId)) editingId = null;
  renderTable(entries);
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

document.addEventListener('DOMContentLoaded', () => {
  renderTable(loadEntries());
  initForm();
  initTableInteractions();
  initDeleteModal();
  initAutoDebitUI();
  runAutoDebitCheck();
});

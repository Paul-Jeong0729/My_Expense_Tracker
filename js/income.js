// income.js — 수입 입력 폼 + 내역 체크박스 선택/수정/삭제 로직
// Firestore(income_entries 컬렉션)를 실시간으로 구독해서 두 사람 화면이
// 자동으로 동기화됩니다.

const COLLECTION = 'income_entries';

// 폼 필드 key → 내역 테이블에 표시될 항목명 매핑
const FIELD_MAP = [
  { key: 'daedeok-base', category: '월급 (대덕자립센터)' },
  { key: 'daedeok-annual', category: '연차 수당 (대덕자립센터)' },
  { key: 'daedeok-holiday', category: '공휴일 수당 (대덕자립센터)' },
  { key: 'dolbom-base', category: '급여 (돌봄센터)' },
  { key: 'rent', category: '월세' },
  { key: 'stairs', category: '계단청소' },
  { key: 'etc', category: '기타수입' },
];

// ---- 선택/편집 상태 (페이지 세션 동안만 유지) ----
const selectedIds = new Set();
let editingId = null;
let currentEntries = [];

function formatWon(amount) {
  return Number(amount).toLocaleString('ko-KR') + '원';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderTable(entries) {
  const tbody = document.getElementById('income-table-body');
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
    return `
      <tr data-id="${entry.id}">
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${entry.id}" ${checked}></td>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.category)}</td>
        <td class="income">+${formatWon(entry.amount)}</td>
        <td>${escapeHtml(entry.memo || '')}</td>
      </tr>
    `;
  }).join('');

  updateActionBar();
}

function updateActionBar() {
  const countEl = document.getElementById('income-selected-count');
  const editBtn = document.getElementById('income-edit-btn');
  const deleteBtn = document.getElementById('income-delete-btn');
  const selectAll = document.getElementById('income-select-all');

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

function calcTotal() {
  return FIELD_MAP.reduce((sum, field) => {
    const input = getField(field.key);
    const value = input ? Number(input.value) || 0 : 0;
    return sum + value;
  }, 0);
}

function updateTotalDisplay() {
  const totalEl = document.getElementById('income-total');
  if (totalEl) totalEl.textContent = formatWon(calcTotal());
}

function initForm() {
  const form = document.getElementById('income-form');
  if (!form) return;

  const dateInput = document.getElementById('income-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  form.addEventListener('input', updateTotalDisplay);

  form.addEventListener('submit', async (event) => {
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
        date,
        category: row.field.category,
        amount: row.amount,
        memo: row.field.key === 'etc' ? etcMemo : '',
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
  const tbody = document.getElementById('income-table-body');
  const selectAll = document.getElementById('income-select-all');
  const editBtn = document.getElementById('income-edit-btn');
  const deleteBtn = document.getElementById('income-delete-btn');

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
  const modal = document.getElementById('delete-modal');
  const message = document.getElementById('delete-modal-message');
  if (!modal) return;
  if (message) {
    message.textContent = `선택한 ${selectedIds.size}개 내역이 삭제돼요. 이 작업은 되돌릴 수 없어요.`;
  }
  modal.classList.add('is-open');
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal');
  if (modal) modal.classList.remove('is-open');
}

function initDeleteModal() {
  const modal = document.getElementById('delete-modal');
  const confirmBtn = document.getElementById('delete-modal-confirm');
  const cancelBtn = document.getElementById('delete-modal-cancel');
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
  initForm();
  initTableInteractions();
  initDeleteModal();

  window.authReady.then((user) => {
    if (!user) return; // auth-guard.js가 로그인 페이지로 이동시킴

    db.collection(COLLECTION).onSnapshot((snapshot) => {
      currentEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderTable(currentEntries);
    }, (err) => {
      console.error(err);
      alert('데이터를 불러오는 중 오류가 발생했어요: ' + err.message);
    });
  });
});

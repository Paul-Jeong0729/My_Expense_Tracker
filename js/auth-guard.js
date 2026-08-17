// auth-guard.js — index.html / income.html / expense.html / settings.html 등
// 로그인이 필요한 모든 페이지에서 firebase-config.js 다음, 나머지 페이지
// 스크립트(main.js, income.js, expense.js, settings.js)보다 먼저 로드해야 합니다.

// data-auth-optional="true"가 붙은 페이지(현재는 index.html)는 로그인하지
// 않아도 화면을 볼 수 있고, 사용자 메뉴 자리에 "로그인" 문구만 보여줍니다.
// 그 외 페이지(income.html, expense.html, settings.html 등)는 기존처럼
// 로그인하지 않으면 곧바로 login.html로 이동시킵니다.
const isAuthOptional = document.body.dataset.authOptional === 'true';

window.authReady.then((user) => {
  const greetingEl = document.querySelector('.user-greeting');
  const userMenu = document.getElementById('user-menu');

  if (!user) {
    if (isAuthOptional) {
      if (greetingEl) greetingEl.textContent = '로그인';
      if (userMenu) userMenu.classList.add('logged-out');
      return;
    }
    window.location.href = 'login.html';
    return;
  }

  // 사용자는 항상 정양균님 한 분(+배우자)뿐이라 인사말은 고정 문구로 표시합니다.
  if (greetingEl) greetingEl.textContent = '사랑해요 양균님';
  if (userMenu) userMenu.classList.remove('logged-out');
});

document.addEventListener('DOMContentLoaded', () => {
  const userMenu = document.getElementById('user-menu');
  const logoutBtn = document.getElementById('logout-btn');
  if (!userMenu) return;

  // 메뉴 트리거 클릭 → 드롭다운 열기/닫기 (드롭다운 안쪽 버튼 클릭은 제외)
  // 로그인 전 상태라면 드롭다운 대신 로그인 페이지로 바로 이동합니다.
  userMenu.addEventListener('click', (event) => {
    if (userMenu.classList.contains('logged-out')) {
      window.location.href = 'login.html';
      return;
    }
    if (event.target.closest('.user-dropdown-item')) return;
    userMenu.classList.toggle('open');
  });

  // 로그아웃 (나중에 다른 메뉴 항목이 추가되어도 이 패턴을 그대로 따르면 됩니다)
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      userMenu.classList.remove('open');
      if (window.confirm('로그아웃 하시겠어요?')) {
        auth.signOut().then(() => {
          window.location.href = 'login.html';
        });
      }
    });
  }

  // 바깥 영역 클릭 시 드롭다운 닫기
  document.addEventListener('click', (event) => {
    if (!userMenu.contains(event.target)) {
      userMenu.classList.remove('open');
    }
  });

  // ESC 키로 닫기
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      userMenu.classList.remove('open');
    }
  });
});

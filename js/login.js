// login.js — 이메일/비밀번호 로그인 처리

function friendlyErrorMessage(error) {
  switch (error.code) {
    case 'auth/invalid-email':
      return '이메일 형식을 확인해주세요.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return '이메일 또는 비밀번호가 올바르지 않아요.';
    case 'auth/too-many-requests':
      return '너무 여러 번 시도했어요. 잠시 후 다시 시도해주세요.';
    default:
      return '로그인에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  // 이미 로그인되어 있으면 홈으로 바로 이동
  window.authReady.then((user) => {
    if (user) window.location.href = 'index.html';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = '로그인 중...';

    auth.signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value)
      .then(() => {
        window.location.href = 'index.html';
      })
      .catch((error) => {
        errorEl.textContent = friendlyErrorMessage(error);
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
      });
  });
});

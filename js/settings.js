// settings.js — 설정 페이지: 비밀번호 수정
// Firebase는 보안상 비밀번호 변경 전 "최근 로그인" 상태를 요구하므로,
// 현재 비밀번호로 재인증(reauthenticate)한 뒤 새 비밀번호로 업데이트합니다.

function passwordFriendlyError(error) {
  switch (error.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '현재 비밀번호가 올바르지 않아요.';
    case 'auth/weak-password':
      return '새 비밀번호는 6자 이상으로 설정해주세요.';
    case 'auth/requires-recent-login':
      return '보안을 위해 다시 로그인한 후 시도해주세요.';
    case 'auth/too-many-requests':
      return '너무 여러 번 시도했어요. 잠시 후 다시 시도해주세요.';
    default:
      return '비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('password-form');
  if (!form) return;

  const currentInput = document.getElementById('current-password');
  const newInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('new-password-confirm');
  const messageEl = document.getElementById('password-message');
  const submitBtn = document.getElementById('password-submit');

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = 'settings-message' + (type ? ' ' + type : '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('', '');

    const currentPassword = currentInput.value;
    const newPassword = newInput.value;
    const confirmPassword = confirmInput.value;

    if (newPassword.length < 6) {
      showMessage('새 비밀번호는 6자 이상이어야 해요.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('새 비밀번호가 서로 일치하지 않아요.', 'error');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showMessage('로그인 정보를 확인할 수 없어요. 다시 로그인해주세요.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '변경 중...';

    try {
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPassword);

      showMessage('비밀번호가 안전하게 변경됐어요.', 'success');
      form.reset();
    } catch (err) {
      showMessage(passwordFriendlyError(err), 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '비밀번호 변경';
    }
  });
});

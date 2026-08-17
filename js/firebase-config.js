// firebase-config.js — Firebase 초기화 (모든 페이지에서 공통으로 사용)
// 이 파일보다 먼저 firebase-app-compat.js, firebase-auth-compat.js,
// firebase-firestore-compat.js 스크립트가 로드되어 있어야 합니다.

const firebaseConfig = {
  apiKey: "AIzaSyCWs6LiPFNtu5auuBthd7X_VYHbZDHdfnA",
  authDomain: "my-expense-tracker-fd2bb.firebaseapp.com",
  projectId: "my-expense-tracker-fd2bb",
  storageBucket: "my-expense-tracker-fd2bb.firebasestorage.app",
  messagingSenderId: "960339558387",
  appId: "1:960339558387:web:810acace3aaf16d2891c86",
  measurementId: "G-1942HLKRV3"
};

firebase.initializeApp(firebaseConfig);

// 다른 스크립트(js/income.js, js/expense.js 등)에서 전역으로 사용
const auth = firebase.auth();
const db = firebase.firestore();

// 로그인 상태가 최초 1회 확정될 때까지 기다려야 하는 경우 사용
// (Firestore 보안 규칙이 로그인 여부를 검사하므로, 로그인 확인 전에
//  데이터를 읽으려 하면 permission-denied 에러가 날 수 있음)
window.authReady = new Promise((resolve) => {
  const unsubscribe = auth.onAuthStateChanged((user) => {
    unsubscribe();
    resolve(user);
  });
});

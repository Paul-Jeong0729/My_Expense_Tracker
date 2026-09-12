// sheets-api.js — Google Apps Script(웹앱)와 통신하는 공통 함수
// income.js / expense.js / main.js가 Firestore 대신 이 함수들로
// 수입/지출 데이터를 읽고 씁니다. sheets-config.js보다 뒤에,
// 각 페이지 스크립트(income.js 등)보다는 앞에 로드해주세요.

const SheetsAPI = (() => {
  function buildUrl(params) {
    const url = new URL(SHEETS_WEB_APP_URL);
    url.searchParams.set('token', SHEETS_TOKEN);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  }

  async function list(sheet) {
    const res = await fetch(buildUrl({ action: 'list', sheet }));
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '데이터를 불러오지 못했어요.');
    return json.data;
  }

  async function getSetting(key) {
    const res = await fetch(buildUrl({ action: 'getSetting', key }));
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '설정을 불러오지 못했어요.');
    return json.data;
  }

  async function post(body) {
    // Content-Type을 text/plain으로 보내야 브라우저가 CORS 프리플라이트(OPTIONS)를
    // 보내지 않아요. Apps Script 웹앱은 OPTIONS 요청을 처리하지 못해서, 다른
    // Content-Type을 쓰면 저장/수정/삭제가 전부 실패합니다.
    const res = await fetch(SHEETS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: SHEETS_TOKEN, ...body }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '요청 처리 중 오류가 발생했어요.');
    return json.data;
  }

  function deepMerge(target, source) {
    const result = { ...(target || {}) };
    Object.keys(source || {}).forEach((key) => {
      const sourceVal = source[key];
      const targetVal = target ? target[key] : undefined;
      if (
        sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
        targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
      ) {
        result[key] = { ...targetVal, ...sourceVal };
      } else {
        result[key] = sourceVal;
      }
    });
    return result;
  }

  async function updateSettingMerge(key, partial) {
    const current = await getSetting(key);
    const merged = deepMerge(current, partial);
    await post({ action: 'setSetting', payload: { key, value: merged } });
    return merged;
  }

  return {
    list,
    getSetting,
    updateSettingMerge,
    addBatch: (sheet, entries) => post({ action: 'addBatch', sheet, payload: entries }),
    update: (sheet, entry) => post({ action: 'update', sheet, payload: entry }),
    deleteBatch: (sheet, ids) => post({ action: 'deleteBatch', sheet, payload: { ids } }),
    setAutoDebit: (payload) => post({ action: 'setAutoDebit', payload }),
    clearAutoDebit: (key) => post({ action: 'clearAutoDebit', payload: { key } }),
    markAutoDebitRun: (key, lastRunMonth) => post({ action: 'markAutoDebitRun', payload: { key, lastRunMonth } }),
    setSetting: (key, value) => post({ action: 'setSetting', payload: { key, value } }),
  };
})();

// 여러 페이지에서 같은 방식으로 "즉시 1번 실행 + N초마다 반복"하기 위한 헬퍼.
// 반환값(interval id)은 이 페이지에서는 딱히 정리할 필요는 없지만, 혹시 필요하면
// clearInterval()에 넘길 수 있게 돌려줍니다.
function startPolling(fn, intervalMs = 15000) {
  fn();
  return setInterval(fn, intervalMs);
}

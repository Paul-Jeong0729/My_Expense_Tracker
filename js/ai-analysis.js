// ai-analysis.js — 규칙 기반 "AI 지출 분석" 엔진
// 실제 AI API를 호출하지 않고, 숫자를 계산해서 전문가 조언 톤의 문장으로
// 조립합니다. categories.js가 먼저 로드되어 있어야 해요.

function pad2(n) { return String(n).padStart(2, '0'); }

function ymFromDate(dateStr) {
  return typeof dateStr === 'string' ? dateStr.slice(0, 7) : '';
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return `${ny}-${pad2(nm)}`;
}

function filterByMonth(entries, ym) {
  return entries.filter((e) => ymFromDate(e.date) === ym);
}

function sumAmount(entries) {
  return entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function aggregateByCategory(entries) {
  const map = new Map();
  entries.forEach((e) => {
    const key = e.category || '기타';
    map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
  });
  return Array.from(map, ([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function formatWon(amount) {
  return `${Math.round(Number(amount) || 0).toLocaleString('ko-KR')}원`;
}

function formatManwon(amount) {
  const man = Math.round((Number(amount) || 0) / 10000);
  return `${man.toLocaleString('ko-KR')}만원`;
}

function pctChange(current, prev) {
  if (!prev) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
}

// ---- 항목별 조언 템플릿 ----
function tipsForCategory(category) {
  if (category.includes('식당') || category.includes('외식')) {
    return [
      '배달·외식 횟수를 주 4회 → 주 2회로 줄여보는 걸 목표해보세요',
      '외식 예산을 월 단위로 미리 정해두고 그 안에서 써보세요',
      '일주일 식단을 미리 짜두면 충동적인 외식을 줄일 수 있어요',
    ];
  }
  if (category.includes('카페')) {
    return [
      '카페 방문 횟수에 주간 상한선을 정해보세요',
      '텀블러 할인·리워드 적립을 적극적으로 활용해보세요',
      '집이나 사무실에서 직접 내려 마시는 날을 늘려보세요',
    ];
  }
  if (category === '마트') {
    return [
      '장보기 전에 살 목록을 미리 적어서 충동구매를 줄여보세요',
      '한 번에 많이 사기보다 필요한 만큼만 자주 사는 방식을 시도해보세요',
      '세일 품목 위주로 장보는 주기를 맞춰보세요',
    ];
  }
  if (category === '온라인') {
    return [
      '장바구니에 담고 24시간 뒤에 다시 결정하는 규칙을 만들어보세요',
      '정기구독 중인 서비스가 실제로 잘 쓰이고 있는지 점검해보세요',
      '이번 달 온라인쇼핑 예산을 미리 정해두고 앱 알림으로 확인해보세요',
    ];
  }
  return [
    '이 항목의 지출을 주 단위로 나눠서 점검해보세요',
    '이번 달 예산을 항목별로 미리 나눠서 관리해보세요',
    '꼭 필요한 지출인지 한 번 더 확인하는 습관을 들여보세요',
  ];
}

// ---- 이번 달 지출 분석 리포트 (expense.html용) ----
function computeMonthlyExpenseReport(expenseEntries, targetYm) {
  const ym = targetYm || ymFromDate(new Date().toISOString().slice(0, 10));
  const prevYm = shiftMonth(ym, -1);

  const current = filterByMonth(expenseEntries, ym);
  const prev = filterByMonth(expenseEntries, prevYm);

  const totalCurrent = sumAmount(current);
  const totalPrev = sumAmount(prev);

  if (totalCurrent === 0) {
    return { empty: true, ym };
  }

  const catCurrent = aggregateByCategory(current);
  const catPrevMap = new Map(aggregateByCategory(prev).map((r) => [r.category, r.amount]));

  const top = catCurrent[0];
  const topPrevAmount = catPrevMap.get(top.category) || 0;
  const topPct = Math.round((top.amount / totalCurrent) * 100);
  const topChangePct = pctChange(top.amount, topPrevAmount);

  const totalChangePct = pctChange(totalCurrent, totalPrev);

  const increase = Math.max(0, top.amount - topPrevAmount);
  const base = increase > 0 ? increase : top.amount * 0.15;
  const saveLow = Math.round((base * 0.5) / 10000) * 10000;
  const saveHigh = Math.round((base * 0.8) / 10000) * 10000;

  return {
    empty: false,
    ym,
    totalCurrent,
    totalPrev,
    totalChangePct,
    top,
    topPct,
    topChangePct,
    saveLow,
    saveHigh,
    tips: tipsForCategory(top.category),
    goalPct: increase > 0 ? '10~15%' : '5~10%',
  };
}

function renderExpenseAIAnalysis(container, expenseEntries) {
  if (!container) return;
  const report = computeMonthlyExpenseReport(expenseEntries);

  if (report.empty) {
    container.innerHTML = `<p class="ai-empty">이번 달에 등록된 지출 내역이 아직 없어요. 데이터가 쌓이면 여기에 분석이 표시돼요.</p>`;
    return;
  }

  const changeText = report.totalChangePct >= 0
    ? `지난달보다 <span class="ai-highlight">${report.totalChangePct}% 증가</span>했습니다.`
    : `지난달보다 <span class="ai-highlight">${Math.abs(report.totalChangePct)}% 감소</span>했습니다.`;

  const topChangeText = report.topChangePct >= 0
    ? `지난달보다 <span class="ai-highlight">${report.topChangePct}%</span> 늘었어요.`
    : `지난달보다 <span class="ai-highlight">${Math.abs(report.topChangePct)}%</span> 줄었어요.`;

  container.innerHTML = `
    <p class="ai-summary-line">
      <span class="ai-highlight">${escapeHtmlSafe(report.top.category)}</span>가 전체 지출의
      <span class="ai-highlight">${report.topPct}%</span>로 가장 높습니다. ${topChangeText}
    </p>
    <p class="ai-summary-line">이번 달 총 지출은 ${changeText}</p>

    <div class="ai-metric-row">
      <div class="ai-metric-chip">
        <span>이번 달 총 지출</span>
        <strong>${formatWon(report.totalCurrent)}</strong>
      </div>
      <div class="ai-metric-chip">
        <span>${escapeHtmlSafe(report.top.category)}</span>
        <strong>${formatWon(report.top.amount)}</strong>
      </div>
      <div class="ai-metric-chip">
        <span>절약 가능 예상액 (월)</span>
        <strong>${formatManwon(report.saveLow)} ~ ${formatManwon(report.saveHigh)}</strong>
      </div>
    </div>

    <div class="ai-tips-box">
      <div class="ai-tips-title">💡 전문가 조언</div>
      <ul class="ai-tips-list">
        ${report.tips.map((tip, i) => `<li><span class="tip-num">${i + 1}</span><span>${escapeHtmlSafe(tip)}</span></li>`).join('')}
      </ul>
    </div>

    <p class="ai-goal-note">다음 달에는 ${escapeHtmlSafe(report.top.category)} 지출을 약 ${report.goalPct} 줄이는 것을 목표로 권장합니다.</p>
  `;
}

// ---- 소비습관 분석 (stats.html용): 신호등 + 가장 먼저 줄여야 할 지출 3가지 ----
function computeHabitAnalysis(expenseEntries, targetYm) {
  const ym = targetYm || ymFromDate(new Date().toISOString().slice(0, 10));
  const m1 = shiftMonth(ym, -1);
  const m2 = shiftMonth(ym, -2);

  const current = filterByMonth(expenseEntries, ym);
  const prev1 = filterByMonth(expenseEntries, m1);
  const prev2 = filterByMonth(expenseEntries, m2);

  const curMap = new Map(aggregateByCategory(current).map((r) => [r.category, r.amount]));
  const p1Map = new Map(aggregateByCategory(prev1).map((r) => [r.category, r.amount]));
  const p2Map = new Map(aggregateByCategory(prev2).map((r) => [r.category, r.amount]));

  const categories = Array.from(curMap.keys()).sort((a, b) => curMap.get(b) - curMap.get(a)).slice(0, 6);

  const badges = categories.map((category) => {
    const cur = curMap.get(category) || 0;
    const p1 = p1Map.get(category) || 0;
    const p2 = p2Map.get(category) || 0;
    const avgPrev = (p1 + p2) / 2;

    if (cur > p1 && p1 > p2 && p2 > 0) {
      return { level: 'red', dot: '🔴', label: '주의', text: `${category}이(가) 3개월 연속 증가하고 있어요.` };
    }
    if (avgPrev > 0 && cur > avgPrev * 1.15) {
      const diffPct = Math.round(((cur - avgPrev) / avgPrev) * 100);
      return { level: 'yellow', dot: '🟡', label: '관찰', text: `${category}이(가) 최근 평균보다 ${diffPct}% 높아요.` };
    }
    if (p1 > 0 && cur < p1 * 0.9) {
      const diffPct = Math.round(((p1 - cur) / p1) * 100);
      return { level: 'green', dot: '🟢', label: '양호', text: `${category}이(가) 지난달보다 ${diffPct}% 감소했어요.` };
    }
    return null;
  }).filter(Boolean);

  const cutCandidates = categories
    .filter((c) => DISCRETIONARY_SECTIONS.includes(sectionForCategory(c)))
    .map((category) => {
      const cur = curMap.get(category) || 0;
      const p1 = p1Map.get(category) || 0;
      const increase = cur - p1;
      const score = increase > 0 ? increase : cur * 0.3;
      const reason = p1 > 0
        ? (increase > 0 ? `지난달보다 ${pctChange(cur, p1)}% 증가했어요` : '지출 비중이 큰 편이에요')
        : '이번 달 새로 늘어난 지출이에요';
      return { category, amount: cur, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { badges, cutCandidates, hasData: current.length > 0 };
}

function escapeHtmlSafe(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderHabitAnalysis(container, expenseEntries) {
  if (!container) return;
  const { badges, cutCandidates, hasData } = computeHabitAnalysis(expenseEntries);

  if (!hasData) {
    container.innerHTML = `<p class="ai-empty">이번 달 지출 내역이 쌓이면 소비습관 분석이 표시돼요.</p>`;
    return;
  }

  const badgeHtml = badges.length
    ? badges.map((b) => `
        <div class="ai-badge-item level-${b.level}">
          <span class="ai-badge-dot">${b.dot}</span>
          <span>${escapeHtmlSafe(b.text)}</span>
        </div>
      `).join('')
    : `<p class="ai-empty">특별히 주의할 만한 변화는 없어요. 잘 관리되고 있어요!</p>`;

  const cutHtml = cutCandidates.length
    ? cutCandidates.map((c, i) => `
        <div class="ai-cut-item">
          <div style="display:flex; align-items:center;">
            <span class="ai-cut-rank">${i + 1}</span>
            <div class="ai-cut-info">
              <span class="ai-cut-category">${escapeHtmlSafe(c.category)}</span>
              <span class="ai-cut-reason">${escapeHtmlSafe(c.reason)}</span>
            </div>
          </div>
          <span class="ai-cut-amount">${formatWon(c.amount)}</span>
        </div>
      `).join('')
    : `<p class="ai-empty">아직 데이터가 부족해요.</p>`;

  container.innerHTML = `
    <p class="ai-summary-line" style="margin-bottom:16px;">「내 소비습관 분석」</p>
    <div class="ai-badge-list">${badgeHtml}</div>
    <div class="ai-tips-title" style="margin-bottom:10px;">🔎 이번 달 가장 먼저 줄여야 할 지출 3가지</div>
    <div class="ai-cut-list">${cutHtml}</div>
  `;
}

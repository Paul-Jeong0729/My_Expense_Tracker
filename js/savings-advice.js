// savings-advice.js — 규칙 기반 "적금·IRP 효율화 AI 조언"
// categories.js / ai-analysis.js(formatWon 등)가 먼저 로드되어 있어야 해요.

const IRP_CATEGORIES = ['IRP (퇴직연금·국민은행)', 'IRP (퇴직연금·하나은행)'];
const IRP_ANNUAL_LIMIT = 9000000; // 연금저축+IRP 합산 세액공제 한도 (일반적으로 알려진 기준, 매년 세법 확인 필요)

function sumThisYear(entries, categories) {
  const year = String(new Date().getFullYear());
  return entries
    .filter((e) => typeof e.date === 'string' && e.date.startsWith(year) && categories.includes(e.category))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function computeSavingsAdvice({ savingsDepositTotal, pensionTotal, goalTargetAmount, expenseEntries }) {
  const currentAmount = savingsDepositTotal + pensionTotal;
  const advice = [];

  // 1. IRP 세액공제 한도
  const irpThisYear = sumThisYear(expenseEntries, IRP_CATEGORIES);
  const irpRemaining = Math.max(0, IRP_ANNUAL_LIMIT - irpThisYear);
  if (irpRemaining > 0) {
    advice.push({
      icon: '💡',
      title: '연금 세액공제 한도 활용',
      body: `올해 IRP에 지금까지 ${formatWon(irpThisYear)}을 납입하셨어요. 연금저축·IRP 합산 세액공제 한도(일반적으로 연 900만원 기준)까지 ${formatWon(irpRemaining)}의 여유가 있어요. 연말 전에 추가 납입하면 세액공제를 더 받을 수 있어요.`,
    });
  } else {
    advice.push({
      icon: '✅',
      title: '연금 세액공제 한도 소진',
      body: `올해 세액공제 한도를 이미 채우셨어요. 추가 납입은 공제 혜택 없이 원금만 늘어나니, 여유 자금은 정기예탁이나 다른 목적자금으로 배분하는 것도 방법이에요.`,
    });
  }

  // 2. 포트폴리오 균형 (적금·예탁 vs 연금)
  if (currentAmount > 0) {
    const depositPct = Math.round((savingsDepositTotal / currentAmount) * 100);
    if (depositPct >= 75) {
      advice.push({
        icon: '⚖️',
        title: '포트폴리오 균형',
        body: `지금은 적금·예탁 비중이 ${depositPct}%로 큰 편이에요. 연금 계좌 비중을 조금 더 늘리면 절세 효과와 장기 복리 효과를 함께 누릴 수 있어요.`,
      });
    } else if (depositPct <= 25) {
      advice.push({
        icon: '⚖️',
        title: '포트폴리오 균형',
        body: `연금 비중이 ${100 - depositPct}%로 큰 편이에요. 연금은 중도 인출이 어려우니, 비상 자금 목적의 유동성 있는 적금·예탁도 일정 비중 유지하는 걸 추천해요.`,
      });
    } else {
      advice.push({
        icon: '⚖️',
        title: '포트폴리오 균형',
        body: `적금·예탁(${depositPct}%)과 연금(${100 - depositPct}%)의 균형이 잘 잡혀 있어요. 지금 비율을 유지하시면 좋아요.`,
      });
    }
  }

  // 3. 목표 달성 페이스
  if (goalTargetAmount > 0) {
    const monthOfYear = new Date().getMonth() + 1;
    const expectedPct = Math.round((monthOfYear / 12) * 100);
    const actualPct = Math.round((currentAmount / goalTargetAmount) * 100);
    const diff = actualPct - expectedPct;

    if (diff < -5) {
      const remainingMonths = Math.max(1, 12 - monthOfYear + 1);
      const shortfall = Math.max(0, goalTargetAmount - currentAmount);
      const suggestedMonthly = Math.round(shortfall / remainingMonths / 10000) * 10000;
      advice.push({
        icon: '📉',
        title: '목표 달성 페이스',
        body: `지금 페이스면 연말 목표 달성이 예상보다 늦어질 수 있어요 (예상 ${expectedPct}% vs 실제 ${actualPct}%). 남은 ${remainingMonths}개월 동안 월 ${formatManwon(suggestedMonthly)} 정도를 추가로 모으면 목표에 맞출 수 있어요.`,
      });
    } else if (diff > 5) {
      advice.push({
        icon: '📈',
        title: '목표 달성 페이스',
        body: `목표보다 빠른 페이스로 잘 모으고 계세요 (예상 ${expectedPct}% vs 실제 ${actualPct}%). 이 페이스를 유지하면 목표를 조기 달성할 수 있어요.`,
      });
    } else {
      advice.push({
        icon: '👍',
        title: '목표 달성 페이스',
        body: `목표 대비 적절한 페이스(${actualPct}%)로 잘 진행되고 있어요.`,
      });
    }
  }

  // 4. 일반 팁
  advice.push({
    icon: '🏦',
    title: '정기예탁 관리 팁',
    body: `정기예탁 만기가 다가오면 자동 연장보다, 그 시점의 최고 금리 상품을 다시 한번 비교해보는 걸 추천해요. 0.5%p 차이도 금액이 커지면 무시할 수 없어요.`,
  });

  return advice;
}

function renderSavingsAdvice(container, params) {
  if (!container) return;
  const advice = computeSavingsAdvice(params);

  container.innerHTML = `
    <div class="ai-advice-list">
      ${advice.map((a) => `
        <div class="ai-advice-item">
          <div class="ai-advice-item-title">${a.icon} ${escapeHtmlSafe(a.title)}</div>
          <div class="ai-advice-item-body">${escapeHtmlSafe(a.body)}</div>
        </div>
      `).join('')}
    </div>
    <p class="ai-disclaimer">※ 세액공제 한도·세율 등은 매년 세법 개정에 따라 달라질 수 있어요. 정확한 기준은 국세청 또는 세무 전문가를 통해 확인해주세요.</p>
  `;
}

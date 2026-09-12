// categories.js — 항목명(카테고리) 정의와 섹션 매핑을 한 곳에서 관리
// income.js / expense.js / stats.js / savings.js / ai-analysis.js / savings-advice.js가
// 전부 이 파일을 참조합니다. 항목을 추가/변경하면 여기만 고치면 돼요.
// (Code.gs의 INCOME_CATEGORIES / EXPENSE_CATEGORIES와 반드시 동일하게 맞춰주세요.
//  이 파일을 고쳤다면 Apps Script의 setupCategoryValidation()도 다시 실행해야
//  시트 드롭다운이 갱신됩니다.)

const INCOME_CATEGORIES = [
  '월급 (대덕자립센터)', '연차 수당 (대덕자립센터)', '공휴일 수당 (대덕자립센터)',
  '급여 (돌봄센터)', '월세', '계단청소', '기타수입',
];

// section: 지출 화면의 탭 구분용 (적금·연금 / 고정지출 / 필수지출 / 일반지출)
const EXPENSE_FIELD_MAP = [
  { category: '농협생명보험 (적금)', section: 'savings' },
  { category: '청약통장 (적금)', section: 'savings' },
  { category: '손님캐어 적금', section: 'savings' },
  { category: '송촌자립 (퇴직연금·국민은행)', section: 'savings' },
  { category: 'IRP (퇴직연금·국민은행)', section: 'savings' },
  { category: '돌봄센터 (퇴직연금·하나은행)', section: 'savings' },
  { category: 'IRP (퇴직연금·하나은행)', section: 'savings' },

  { category: '십일조 (헌금)', section: 'fixed' },
  { category: '절기헌금', section: 'fixed' },
  { category: '건축헌금', section: 'fixed' },
  { category: '선교헌금', section: 'fixed' },
  { category: '지역회비', section: 'fixed' },
  { category: '천지일보', section: 'fixed' },
  { category: '현대해상 (보험료)', section: 'fixed' },
  { category: '예별손1 (보험료)', section: 'fixed' },
  { category: '예별손2 (보험료)', section: 'fixed' },
  { category: 'AXA 운전자보험 (보험료)', section: 'fixed' },
  { category: '웅진프라이드 (보험료)', section: 'fixed' },
  { category: '현대해상 간병 (보험료)', section: 'fixed' },
  { category: '자동차 할부', section: 'fixed' },
  { category: '자동차 보험 (할부)', section: 'fixed' },
  { category: '핸드폰요금', section: 'fixed' },
  { category: '네이버스토어', section: 'fixed' },
  { category: '환희 용돈', section: 'fixed' },
  { category: 'TV (공과금)', section: 'fixed' },
  { category: '전기 (공과금)', section: 'fixed' },
  { category: '가스 (공과금)', section: 'fixed' },
  { category: '대출 원금', section: 'fixed' },
  { category: '대출 이자', section: 'fixed' },

  { category: '가스충전', section: 'essential' },
  { category: '종호 밥', section: 'essential' },

  { category: '마트', section: 'general' },
  { category: '카페', section: 'general' },
  { category: '온라인', section: 'general' },
  { category: '식당', section: 'general' },
  { category: '기타', section: 'general' },
];

const SECTION_LABELS = {
  savings: '적금·연금',
  fixed: '고정지출',
  essential: '필수지출',
  general: '일반지출',
};

const EXPENSE_CATEGORIES = EXPENSE_FIELD_MAP.map((f) => f.category);

function sectionForCategory(category) {
  const found = EXPENSE_FIELD_MAP.find((f) => f.category === category);
  return found ? found.section : 'general';
}

// "줄이기 좋은" 생활성 지출로 취급할 섹션 (적금/고정지출은 임의로 줄이기 어려우므로 제외)
const DISCRETIONARY_SECTIONS = ['essential', 'general'];

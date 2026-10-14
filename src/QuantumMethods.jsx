import React from 'react';
import { Atom, ExternalLink } from 'lucide-react';

const day = value => value?.replaceAll('-', '.');

export function QuantumMethodContent({ data }) {
  return <><div className="detail-label"><Atom size={18} />양자컴퓨터 데이터 안내</div><h2>양자컴퓨터 숫자를 읽는 방법</h2><p className="method-intro">6개 영역·{data.topics.length}개 주제의 제목 동의어로 연구를 관찰해. 저널 문헌을 OpenAlex에서 수집하고 프리프린트는 별도로 보여줘.</p><dl className="method-list">
    <div><dt>관측 기간</dt><dd>{day(data.period.start)}–{day(data.period.end)}<br />비교: {day(data.period.previousStart)}–{day(data.period.previousEnd)}<br />월별 차트는 완료된 12개 달이므로 이동 기간과 경계가 달라.</dd></div>
    <div><dt>수집 시각</dt><dd>{new Date(data.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST. 매일 09:20 KST에 갱신을 시도해. API 한도나 연결 문제로 실패하면 마지막 성공 데이터와 원래 기준일을 유지해.</dd></div>
    <div><dt>논문 수</dt><dd>OpenAlex에서 제목 동의어 검색에 일치하고, 대표 출판처가 journal이며 유형이 article 또는 review인 기록. 두 기간의 전체 페이지를 수집하고 날짜로 집계해. 리뷰·서베이는 포함하고 프리프린트는 제외해. 주제 간 중복은 허용하며 양자컴퓨터 전체 문헌 수가 아니야.</dd></div>
    <div><dt>전년 대비</dt><dd>(최근 12개월 논문 수 ÷ 직전 12개월 논문 수 − 1) × 100. 직전 기간 20편 미만은 표시하지 않아. 색인 지연·분류 변경·표현 차이의 영향을 받으며 연구 활동량을 관측해.</dd></div>
    <div><dt>목록 선정</dt><dd>최신 연구: 최근 30일 저널 연구 최대 20편/주제. 인용 상위: 최근 12개월 저널 연구 최대 10편/주제. 리뷰: 최근 12개월 최대 5편/주제. 리뷰는 출판 유형 또는 제목의 review/survey 표기로 식별하며, 다른 표현의 리뷰는 놓칠 수 있어. 입문 적합도를 평가한 순위는 아니야.</dd></div>
    <div><dt>프리프린트</dt><dd>OpenAlex 유형이 preprint인 최근 30일 기록 최대 20편/주제. 심사 여부를 확인한 논문이 아니며 저널 통계·인용 상위에 합산하지 않아. 같은 연구의 프리프린트와 출판본이 다른 기록으로 남을 수 있어.</dd></div>
    <div><dt>인용·중복</dt><dd>수집 시점의 누적 인용 수이며 분야·발표연도로 보정하지 않아. 목록은 OpenAlex ID로 중복 제거하고 주제별 목록 선정 이력을 유지해. 기존 물리학 목록과 같은 ID를 저장하면 서재에서 합쳐 보여줘.</dd></div>
    <div><dt>성능 지표</dt><dd>논문 수·인용 수는 큐비트 수, 게이트 충실도, 논리 오류율이나 양자 우위의 증거가 아니야. 장치마다 측정 조건이 달라 논문의 실험·가정·고전 기준·자원 비용을 직접 확인해야 해. 이런 성능 수치를 자동 추출하거나 서로 비교하는 점수는 아직 제공하지 않아.</dd></div>
    <div><dt>Nature 계열</dt><dd>저널명 기준으로 필터링해. 편집 추천·표지 선정·다운로드 순위를 뜻하지 않아.</dd></div>
    <div><dt>읽기와 서재</dt><dd>저자 초록, 출판사·공개 원문 링크, 주제별 용어·읽기 질문을 제공해. 초록이 없으면 원문에서 확인할 수 있어. 메모와 서재는 이 브라우저에 저장하고 Markdown으로 내보낼 수 있어.</dd></div>
  </dl><h3 className="query-heading">재현 가능한 검색어 · {data.queryVersion}</h3><div className="query-list">{data.topics.map(topic => <a key={topic.id} href={topic.sourceUrl} target="_blank" rel="noopener noreferrer"><span>{topic.name}</span><code>{topic.query}</code><ExternalLink size={13} /></a>)}</div><div className="method-links"><a href="https://help.openalex.org/api/searching/" target="_blank" rel="noopener noreferrer">OpenAlex 검색 안내<ExternalLink size={14} /></a><a href="https://help.openalex.org/api/authentication/" target="_blank" rel="noopener noreferrer">API 한도·키 안내<ExternalLink size={14} /></a></div></>;
}

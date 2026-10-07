# Research Atlas · 학문 대시보드

[배포 사이트](https://loong-kid.github.io/research-dashboard/)

물리학, 화학·재료, 생명과학·생명공학, 의학의 관심 연구 주제를 관측하고 실제 논문을 읽는 개인 대시보드입니다.

## 첫 버전

- 실제 OpenAlex 검색 결과로 만든 12개 주제의 연구 지도
- 최근 12개월 논문 수, 직전 12개월 대비 변화, 두 기간의 논문 수 비교
- 분야별 탐색, 논문 검색, 공개 원문 및 Nature 계열 필터
- 인용 수·발표일·FWCI 정렬 (수집한 논문 목록 내)
- 저자 초록, DOI·공개 원문 링크, 브라우저 내 서재·읽기 메모
- 서재 Markdown 내보내기, 모바일 메뉴, 키보드 접근, 모달 포커스 관리

한국어 AI 해설, 표지·편집 선정 정보, 임상 검증 단계, 특허·산업 연결은 아직 구현하지 않았습니다. Nature 표시는 저널명 기준의 게재 정보이며 편집 추천이 아닙니다.

## 데이터와 해석

`scripts/refresh_data.py`가 OpenAlex를 조회하고 `public/data/snapshot.json`에 저장합니다. 추적 검색어는 스크립트의 `TOPICS`에 있습니다. 논문 제목에서 영문 구문을 검색하며 `type:article`과 `is_retracted:false` 필터를 적용합니다. 저널 유형 분류나 철회 정보가 완벽함을 뜻하지 않습니다.

각 주제에서 최근 12개월 누적 인용 상위 최대 4편을 수집합니다. 검색·최신순·Nature 필터는 이 유한한 목록에서 동작합니다. 학문 전체 또는 실시간 논문 전체에 대한 순위가 아닙니다. 신규 논문은 인용과 색인 반영이 늦을 수 있습니다.

주제별 통계에는 중복 논문이 포함될 수 있습니다. 논문 목록은 OpenAlex ID로 중복 제거합니다. 성장률은 연구 활동량의 변화이며 학문적 진보·연구 품질·투자 가치를 직접 측정하지 않습니다. 원문 접근은 각 출판사·저장소의 이용 조건과 이용자 구독에 따릅니다. 초록과 서지정보의 누락은 화면에 표시합니다.

데이터 출처: [OpenAlex](https://openalex.org/), [인용 지표 안내](https://help.openalex.org/data/works/citations/). 배포 화면에서 수집 시각·비교 기간·검색어를 확인할 수 있습니다.

## 실행

Node.js 24, Python 3.13 이상을 권장합니다.

```sh
npm ci
npm run dev
npm run build
npm run data:refresh
```

특정 관측 기준일을 재현하려면:

```sh
python scripts/refresh_data.py --as-of 2026-10-08
```

선택적으로 `OPENALEX_API_KEY`를 환경변수 또는 GitHub Actions repository secret에 설정할 수 있습니다. 키는 브라우저 코드·JSON·로그에 저장하지 않습니다. API 인증·한도 정책이 바뀌면 secret을 설정하세요. 데이터 수집이 실패하면 기존 스냅샷과 기준일을 보존합니다.

## 검증

```sh
npx playwright install chromium
npm test
```

연구 지도·분야 필터·논문 연결, 서재·메모 재접속, 원문 링크, 검색·빈 화면과 320/375/414/768/1440px 화면을 검증합니다.

## 배포와 갱신

GitHub Pages를 GitHub Actions 소스로 설정합니다. `main` push와 수동 실행, 매일 한국시간 오전 9시 20분 예약 실행으로 데이터를 새로 수집한 뒤 배포합니다. GitHub 예약 실행은 지연될 수 있습니다. 예약 실행은 원본 저장소의 스냅샷 파일을 커밋하지 않고 배포 산출물의 데이터를 갱신합니다. 장기간 저장소 활동이 없으면 GitHub의 정책에 따라 예약 실행이 중단될 수 있습니다.

서재·메모는 localStorage에만 보관하며 다른 기기와 동기화하지 않습니다. 기기 변경·브라우저 데이터 삭제 전에 내보내기를 사용하세요.

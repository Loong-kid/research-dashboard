import React, { useEffect, useMemo, useState } from 'react';
import { Award, Bookmark, BookOpen, ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import './nobel.css';

const CATEGORIES = [{ id: 'physics', name: '물리학상' }, { id: 'chemistry', name: '화학상' }, { id: 'medicine', name: '생리의학상' }];
const categoryName = id => CATEGORIES.find(item => item.id === id)?.name;
const Link = ({ href, children, className = '' }) => <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={13} /></a>;
const sourceLabel = kind => kind === 'official' ? '노벨상 공식 배경 문헌' : '학술 연구 데이터셋';

function initialSelection(data) {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  return { category: CATEGORIES.some(item => item.id === params.get('category')) ? params.get('category') : 'medicine', year: data.years.includes(Number(params.get('year'))) ? Number(params.get('year')) : data.years[0] };
}

export function NobelWorkspace({ data, error, search, setSearch, savedIds, onSave, onOpen, onMethod }) {
  if (!data) return <div className="empty-state"><Award size={32} /><p>{error ? '노벨상 자료를 불러오지 못했어.' : '수상 기록과 관련 논문을 불러오는 중…'}</p>{error && <button className="secondary-button" onClick={() => location.reload()}>다시 불러오기</button>}</div>;
  return <NobelArchive data={data} search={search} setSearch={setSearch} savedIds={savedIds} onSave={onSave} onOpen={onOpen} onMethod={onMethod} />;
}

function NobelArchive({ data, search, setSearch, savedIds, onSave, onOpen, onMethod }) {
  const [category, setCategory] = useState(() => initialSelection(data).category);
  const [year, setYear] = useState(() => initialSelection(data).year);
  const [laureate, setLaureate] = useState('all');
  const [linkedOnly, setLinkedOnly] = useState(false);
  useEffect(() => {
    const handleHash = () => {
      if (location.hash.split('?')[0] !== '#nobel') return;
      const selection = initialSelection(data);
      setCategory(selection.category); setYear(selection.year); setLaureate('all');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [data]);
  const query = search.trim().toLocaleLowerCase();
  const byPaper = useMemo(() => new Map(data.papers.map(paper => [paper.id, paper])), [data]);
  const records = data.prizes.filter(prize => prize.category === category);
  const filtered = records.filter(prize => (!linkedOnly || prize.paperIds.length) && (!query || [prize.year, prize.motivationKo, ...prize.laureates.flatMap(person => [person.name, person.motivation]), ...prize.paperIds.map(id => byPaper.get(id)?.title)].join(' ').toLocaleLowerCase().includes(query)));
  const selected = filtered.find(prize => prize.year === year) || filtered[0];
  const papers = selected ? selected.paperIds.map(id => byPaper.get(id)).filter(paper => laureate === 'all' || paper.nobelConnections.some(connection => connection.prizeId === selected.id && connection.laureateIds.includes(laureate))) : [];
  useEffect(() => { setLaureate('all'); }, [category, year, query, linkedOnly]);
  function select(nextCategory, nextYear) {
    setCategory(nextCategory); setYear(nextYear); setLaureate('all');
    history.replaceState(null, '', `#nobel?category=${nextCategory}&year=${nextYear}`);
  }
  const index = selected ? data.years.indexOf(selected.year) : -1;
  return <div className="nobel-workspace">
    <div className="nobel-source"><span>NobelPrize.org 공식 수상 기록 · {data.asOf} 확인</span><button onClick={onMethod}>논문 선정 근거와 수집 범위<ExternalLink size={13} /></button></div>
    <div className="nobel-controls"><div className="nobel-categories" role="group" aria-label="노벨상 분야">{CATEGORIES.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => select(item.id, selected?.year || year)}>{item.name}</button>)}</div><div className="nobel-year-control"><button aria-label="이전 연도" disabled={index < 0 || index === data.years.length - 1} onClick={() => select(category, data.years[index + 1])}><ChevronLeft size={17} /></button><label><span className="sr-only">노벨상 수상 연도</span><select value={selected?.year || year} onChange={event => select(category, Number(event.target.value))}>{data.years.map(value => <option key={value} value={value}>{value}년</option>)}</select></label><button aria-label="다음 연도" disabled={index <= 0} onClick={() => select(category, data.years[index - 1])}><ChevronRight size={17} /></button></div></div>
    <p className="nobel-context">노벨상은 발견과 성과에 수여돼. 아래 논문은 그 성과를 읽기 위한 연결이며, 모든 기여 논문이나 공식 ‘수상 논문’ 목록을 뜻하지 않아.</p>
    <div className="nobel-layout"><aside className="nobel-index" aria-label="연도별 수상 목록"><div className="nobel-index-heading"><strong>연도별 기록</strong><span>{filtered.length}개 연도</span></div><label className="nobel-linked-filter"><input type="checkbox" checked={linkedOnly} onChange={event => setLinkedOnly(event.target.checked)} />논문 연결된 연도만</label><div className="nobel-year-list">{filtered.map(prize => <button key={prize.id} className={selected?.id === prize.id ? 'selected' : ''} aria-pressed={selected?.id === prize.id} aria-label={`${prize.year}년 ${categoryName(category)}`} onClick={() => select(category, prize.year)}><strong>{prize.year}</strong><span>{prize.awarded ? prize.laureates.map(person => person.name).join(', ') : '수상 없음'}</span><small>{prize.paperIds.length ? `${prize.paperIds.length}편 연결` : prize.awarded ? '논문 연결 미확인' : '미수여'}</small></button>)}</div></aside>
      {selected ? <section className="nobel-award" aria-label="선택한 노벨상"><header className="nobel-award-header"><div className="nobel-award-year">{selected.year}</div><div><span>노벨 {categoryName(category)}</span><h2>{selected.motivationKo || (selected.awarded ? '발견에서 논문으로.' : '이 해에는 수상자가 없어.')}</h2><Link href={selected.sourceUrl}>공식 수상 기록</Link></div></header>
        {!selected.awarded ? <div className="nobel-no-award"><p>공식 기록에 따르면 이 분야는 해당 연도에 수여되지 않았어.</p><p lang="en">{selected.topMotivation}</p></div> : <>
          <div className="nobel-laureates">{selected.laureates.map(person => <article key={person.id}><div><h3>{person.name}</h3><span>수상 지분 {person.portion}</span></div><p lang="en">{person.motivation}</p><Link href={person.sourceUrl}>수상자 소개</Link></article>)}</div>
          <div className="nobel-papers-heading"><div><h3>수상 성과를 읽는 논문 <span>{papers.length}편</span></h3><p>논문의 발표 연도와 노벨상 수상 연도는 달라.</p></div><label><span className="sr-only">연결된 수상자</span><select aria-label="연결된 수상자" value={laureate} onChange={event => setLaureate(event.target.value)}><option value="all">모든 수상자</option>{selected.laureates.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>
          <div className="nobel-paper-list">{papers.map(paper => {
            const connection = paper.nobelConnections.find(item => item.prizeId === selected.id);
            const kinds = [...new Set(connection.evidence.map(item => item.kind))];
            const linked = selected.laureates.filter(person => connection.laureateIds.includes(person.id));
            return <article className="nobel-paper" key={paper.id}><div className="nobel-paper-meta"><time>{paper.date}년 발표</time><span>{paper.journal || '저널 정보 미확인'}</span>{paper.oaUrl && <span className="open-label">무료 원문 링크</span>}</div><button className="nobel-paper-title" onClick={() => onOpen(paper)}>{paper.title}</button><p className="nobel-linked-laureates">연결된 수상자: {linked.length ? linked.map(person => person.name).join(', ') : '공동연구 성과 · 개별 저자 관계는 원문 확인'}</p><div className="nobel-evidence">{kinds.map(kind => <span key={kind}>{sourceLabel(kind)}</span>)}{paper.role === 'retrospective' && <span>수상자의 후일 해설</span>}</div>{connection.note && <p className="nobel-paper-note">{connection.note}</p>}<div className="nobel-paper-actions">{paper.doi && <Link href={paper.doi}>출판사 원문</Link>}{paper.oaUrl && <Link href={paper.oaUrl}>무료 원문 읽기</Link>}<Link href={`https://scholar.google.com/scholar?q=${encodeURIComponent(paper.doi || paper.title)}`}>다른 버전 찾기</Link><button className={savedIds.has(paper.id) ? 'saved' : ''} aria-label={`${paper.title} ${savedIds.has(paper.id) ? '저장 취소' : '저장'}`} aria-pressed={savedIds.has(paper.id)} onClick={() => onSave(paper)}><Bookmark size={16} fill={savedIds.has(paper.id) ? 'currentColor' : 'none'} />{savedIds.has(paper.id) ? '저장됨' : '서재에 저장'}</button></div><details className="nobel-paper-evidence"><summary>이 논문이 연결된 근거</summary><p>수상자와의 연결은 논문 저자 명단과 항상 같지는 않아. 공동연구·연구 지휘 등의 관계는 근거 자료와 원문에서 확인해.</p>{connection.evidence.map((evidence, i) => <div key={i}><Link href={evidence.url + (evidence.page ? `#page=${evidence.page}` : '')}>{evidence.label}{evidence.page ? ` · PDF ${evidence.page}쪽` : ''}</Link>{evidence.citation && <p lang="en">{evidence.citation}</p>}{evidence.note && <p lang="en">{evidence.note}</p>}</div>)}</details></article>;
          })}</div>
          {!papers.length && <div className="nobel-unlinked"><BookOpen size={23} /><h3>{selected.paperIds.length ? '이 수상자의 개별 논문 연결은 아직 확인하지 못했어.' : '확인된 기여 논문 연결이 아직 없어.'}</h3><p>논문을 추측해서 채우지 않았어. 수상 연도와 수상자 기록은 확인할 수 있어.</p>{selected.backgroundUrl && <Link href={selected.backgroundUrl}>공식 과학적 배경 읽기</Link>}<Link href={selected.sourceUrl}>공식 수상 자료에서 살펴보기</Link></div>}
          <div className="nobel-official-links"><Link href={selected.sourceUrl}>수상 사유·수상자</Link>{selected.backgroundUrl && <Link href={selected.backgroundUrl}>공식 과학적 배경</Link>}</div>
        </>}
      </section> : <section className="empty-state"><Search size={30} /><h2>조건에 맞는 수상 기록이 없어.</h2><p>수상자 이름, 수상 연도, 논문 제목과 영문 수상 사유로 검색할 수 있어.</p><button className="secondary-button" onClick={() => { setSearch(''); setLinkedOnly(false); }}>검색 초기화</button></section>}
    </div><p className="nobel-coverage">{data.years.at(-1)}–{data.years[0]}년 · 3개 분야 · {data.stats.awarded}건의 수상 기록 중 {data.stats.linkedPrizes}건에 논문 연결. 논문 선정 자료 {data.curatedAt} 확인. <button onClick={onMethod}>출처와 미확인 구간 보기</button></p>
  </div>;
}

export function NobelPaperContext({ paper, onNavigate }) {
  return <section className="nobel-detail-context"><h3>이 논문과 연결된 노벨상</h3>{paper.nobelConnections.map(connection => <div key={connection.prizeId}><a href={`#nobel?category=${connection.category}&year=${connection.year}`} onClick={onNavigate}>{connection.year}년 노벨 {categoryName(connection.category)}</a><p>{connection.laureateNames.join(', ') || '공동연구 성과'}</p>{connection.evidence.map((source, i) => <Link key={i} href={source.url + (source.page ? `#page=${source.page}` : '')}>{source.label}{source.page ? ` · PDF ${source.page}쪽` : ''}</Link>)}</div>)}<p>수상은 논문 자체가 아닌 발견과 성과에 수여돼. 위 자료는 논문 연결의 출처야.</p></section>;
}

export function NobelMethodContent({ data }) {
  return <><div className="detail-label"><Award size={18} />노벨상 자료 안내</div><h2>수상에서 원전까지 읽는 방법</h2><p className="method-intro">1901년부터의 물리학·화학·생리의학상 기록과 성과를 읽기 위한 논문 연결이야.</p><dl className="method-list"><div><dt>수상 기록</dt><dd>NobelPrize.org 공식 API의 수상 연도·분야·수상자·지분·영문 수상 사유를 사용해. 수상이 없던 해도 표시해. 시상·발표가 뒤로 미뤄진 경우에도 상의 연도를 기준으로 분류해.</dd></div><div><dt>과거 기여 논문</dt><dd>Li·Yin·Fortunato·Wang의 Harvard Dataverse 공개 데이터셋(2018, CC0)을 출처로 연결해. 1901~2016년 전체를 빠짐없이 포괄하는 목록은 아니며, 공식 노벨상 위원회가 지정한 논문 목록도 아니야. 원자료의 이름 표기 차이를 공식 수상자 ID와 대조했어.</dd></div><div><dt>공식 배경 문헌</dt><dd>최근 수상은 NobelPrize.org의 과학적 배경 자료에 인용된 연구를 추가했어. 개별 논문마다 PDF 페이지 또는 공식 페이지 링크를 표시해. 공식 자료에 인용된 모든 문헌이 같은 정도로 수상에 기여했다는 뜻은 아니야.</dd></div><div><dt>수상자와 저자</dt><dd>연결된 수상자는 논문 전체 저자 명단과 다를 수 있어. 공동연구 성과나 연구 지휘의 기여도 있으며, 수상자의 후일 해설은 별도 표시해. 저자 메타데이터를 확인하지 못한 경우 수상자 이름을 저자로 대신 넣지 않아.</dd></div><div><dt>원문 접근</dt><dd>DOI로 출판사 원문에 연결하고, Europe PMC 등에서 무료 원문 링크를 확인한 경우 별도 표시해. 무료 링크 미확인은 유료 전용 판정이 아니야. 기관 로그인은 원문 제공처에서 이용하고 Google Scholar에서 다른 공개 버전도 찾아볼 수 있어.</dd></div><div><dt>범위와 갱신</dt><dd>{data ? `${data.years.at(-1)}–${data.years[0]}년 수상 기록 ${data.stats.awarded}건, 논문 연결 ${data.stats.linkedPrizes}건, 고유 문헌 ${data.papers.length}편. 공식 기록 확인 ${data.asOf}, 논문 연결 확인 ${data.curatedAt}.` : '데이터를 불러온 뒤 범위가 표시돼.'} 수상 기록은 자동 갱신하고, 기여 논문 선정은 출처가 확인된 목록만 반영해. 미확인 연도는 공식 수상 자료로 안내해.</dd></div><div><dt>한국어 설명</dt><dd>일부 수상의 한국어 제목은 이해를 돕기 위한 편집 요약이야. 영문 공식 수상 사유와 구분해 읽어줘. 논문 전문 번역은 이 화면에 포함되지 않아.</dd></div></dl><div className="method-links"><Link href="https://www.nobelprize.org/organization/developer-zone-2/">NobelPrize.org API</Link><Link href="https://doi.org/10.7910/DVN/6NJ5RN">기여 논문 데이터셋</Link><Link href="https://doi.org/10.1038/s41597-019-0033-6">데이터셋 연구 설명</Link></div></>;
}

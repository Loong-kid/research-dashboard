import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDown, ArrowUpRight, Atom, Bookmark, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Database, Download, ExternalLink, FlaskConical, Globe2, HeartPulse, Layers3, Library, Menu, Microscope, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import './styles.css';

const FIELDS = [
  { id: 'physics', name: '물리학', english: 'Physics', Icon: Atom, color: 'var(--physics)', short: '물리학' },
  { id: 'chemistry', name: '화학·재료', english: 'Chemistry & materials', Icon: FlaskConical, color: 'var(--chemistry)', short: '화학·재료' },
  { id: 'biotech', name: '생명과학·생명공학', english: 'Life sciences', Icon: Microscope, color: 'var(--biotech)', short: '생명공학' },
  { id: 'medicine', name: '의학', english: 'Medicine', Icon: HeartPulse, color: 'var(--medicine)', short: '의학' },
];
const number = value => new Intl.NumberFormat('ko-KR').format(value);
const fieldFor = id => FIELDS.find(field => field.id === id);
const date = value => value?.replaceAll('-', '.') || '날짜 미제공';
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const External = ({ href, children, className = '' }) => safeUrl(href) ? <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer" className={className}>{children}</a> : null;

function readSaved() {
  try { const value = JSON.parse(localStorage.getItem('research-atlas-library') || '[]'); return Array.isArray(value) ? value.filter(item => typeof item?.id === 'string') : []; } catch { return []; }
}

function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><span>A</span><i /></span><span>Research<span className="brand-second">Atlas</span></span></span>;
}

function Sparkline({ history, color }) {
  const maximum = Math.max(...history.map(item => item.count), 1);
  const minimum = Math.min(...history.map(item => item.count), 0);
  const points = history.map((item, i) => `${i * 86 / Math.max(history.length - 1, 1) + 2},${36 - (item.count - minimum) / (maximum - minimum || 1) * 30}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 90 42" aria-label={history.map(item => `${item.label} ${number(item.count)}편`).join(', ')} role="img"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Growth({ value, compact = false }) {
  if (value == null) return <span className="muted">비교 자료 없음</span>;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDown;
  return <span className={`growth ${value >= 0 ? 'positive' : 'negative'} ${compact ? 'compact' : ''}`}><Icon size={compact ? 13 : 16} />{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>;
}

function ResearchMap({ topics, selected, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const usable = topics.filter(topic => topic.growth != null);
  const span = Math.max(20, ...usable.map(topic => topic.growth + 6)) - Math.min(-5, ...usable.map(topic => topic.growth));
  const step = span > 120 ? 50 : span > 60 ? 25 : 10;
  const xMinimum = Math.floor(Math.min(-5, ...usable.map(topic => topic.growth)) / step) * step;
  const xMaximum = Math.ceil(Math.max(20, ...usable.map(topic => topic.growth + 6)) / step) * step;
  const logMin = Math.floor(Math.log10(Math.max(1, Math.min(...usable.map(topic => topic.count))))) - 0.2;
  const logMax = Math.log10(Math.max(10, ...usable.map(topic => topic.count))) + 0.3;
  const scaleX = value => 68 + (value - xMinimum) / (xMaximum - xMinimum) * 636;
  const scaleY = value => 272 - (Math.log10(Math.max(value, 1)) - logMin) / (logMax - logMin) * 222;
  const ticks = Array.from({ length: Math.round((xMaximum - xMinimum) / step) + 1 }, (_, i) => xMinimum + i * step);
  const yTicks = [100, 1000, 10000, 100000].filter(value => Math.log10(value) >= logMin && Math.log10(value) <= logMax);
  const active = topics.find(topic => topic.id === hovered);
  const labels = [];
  const positions = usable.map(topic => ({ topic, x: scaleX(topic.growth), y: scaleY(topic.count), radius: Math.max(8, Math.min(23, Math.sqrt(topic.count) / 7)) }));
  positions.toSorted((a, b) => a.y - b.y).forEach(point => {
    const width = point.topic.name.length * 10.5;
    let x = point.x > 550 ? point.x - width - point.radius - 7 : point.x + point.radius + 7;
    let y = point.y + 4;
    for (let i = 0; i < 10; i++) {
      if (!labels.some(label => x < label.x + label.width + 6 && x + width + 6 > label.x && Math.abs(y - label.y) < 19)) break;
      y += 20;
    }
    labels.push({ id: point.topic.id, x: Math.max(70, Math.min(x, 750 - width)), y: Math.min(285, y), width });
  });
  return <div className="map-container">
    <svg viewBox="0 0 770 335" className="research-map" role="group" aria-label="연구 주제별 논문 수와 전년 대비 증가율. 원을 선택하면 해당 주제를 볼 수 있습니다.">
      <text className="axis-caption" x="20" y="22">논문 수 (로그 척도)</text>
      <rect x={scaleX(0)} y="38" width={704 - scaleX(0)} height="237" className="growth-region" rx="3" />
      {yTicks.map(value => <g key={value}><line x1="68" y1={scaleY(value)} x2="704" y2={scaleY(value)} className="grid-line" /><text x="53" y={scaleY(value) + 4} textAnchor="end" className="axis-label">{number(value)}</text></g>)}
      {ticks.map(value => <g key={value}><line x1={scaleX(value)} y1="38" x2={scaleX(value)} y2="275" className="grid-line vertical" /><text x={scaleX(value)} y="299" textAnchor="middle" className="axis-label">{value > 0 ? '+' : ''}{Math.round(value)}%</text></g>)}
      <line x1={scaleX(0)} y1="38" x2={scaleX(0)} y2="275" className="zero-line" />
      <text x="704" y="327" textAnchor="end" className="axis-caption">전년 대비 논문 수 변화</text>
      {positions.map(({ topic, x, y, radius }) => {
        const isSelected = selected?.id === topic.id;
        return <g key={topic.id} className={`map-point ${isSelected ? 'selected' : ''}`} role="button" tabIndex="0" aria-label={`${topic.name}, ${number(topic.count)}편, 전년 대비 ${topic.growth}%${isSelected ? ', 선택됨' : ''}`} aria-pressed={isSelected} onClick={() => onSelect(topic)} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(topic); } }} onMouseEnter={() => setHovered(topic.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(topic.id)} onBlur={() => setHovered(null)} style={{ '--point-color': fieldFor(topic.field).color }}>
          <circle cx={x} cy={y} r={radius + 5} className="point-halo" />
          <circle cx={x} cy={y} r={radius} className="point-circle" />
          {isSelected && <circle cx={x} cy={y} r="3.5" className="point-center" />}
          <title>{topic.name}: {number(topic.count)}편 / {topic.growth}%</title>
        </g>;
      })}
      {labels.map(label => <text key={label.id} x={label.x} y={label.y} className={`point-label ${selected?.id === label.id ? 'active' : ''}`} pointerEvents="none">{topics.find(topic => topic.id === label.id).name}</text>)}
    </svg>
    {active && <div className="chart-tooltip" role="status"><strong>{active.name}</strong><span>{number(active.count)}편 <Growth value={active.growth} compact /></span></div>}
    <div className="map-mobile-list" aria-label="연구 주제별 모멘텀 목록"><div className="mobile-map-heading"><span>연구 주제 / 최근 12개월 논문</span><span>전년 대비</span></div>{[...topics].sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity)).slice(0, expanded ? topics.length : 6).map(topic => <button key={topic.id} className={`mobile-topic ${selected?.id === topic.id ? 'selected' : ''}`} onClick={() => onSelect(topic)} aria-pressed={selected?.id === topic.id}><span className="field-dot" style={{ background: fieldFor(topic.field).color }} /><span><strong>{topic.name}</strong><small>{number(topic.count)}편</small></span><Growth value={topic.growth} compact /></button>)}{topics.length > 6 && <button className="mobile-map-expand" onClick={() => setExpanded(!expanded)}>{expanded ? '주제 접기' : `주제 ${topics.length}개 모두 보기`}<ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} /></button>}</div>
  </div>;
}

function TopicFocus({ topic, onExplore }) {
  const field = fieldFor(topic.field);
  const comparison = [{ label: '직전 12개월', count: topic.previousCount }, { label: '최근 12개월', count: topic.count }];
  return <section className="topic-focus" aria-label="선택한 연구 주제">
    <div className="focus-top"><span className="focus-label"><span className="field-dot" style={{ background: field.color }} />{field.short}</span><Activity size={19} /></div>
    <div><p className="focus-kicker">선택한 연구 주제</p><h3>{topic.name}</h3><p className="focus-description">{topic.description}</p></div>
    <div className="focus-metrics"><div><span>최근 12개월</span><strong>{number(topic.count)}<small>편</small></strong></div><div><span>전년 대비</span><Growth value={topic.growth} /></div></div>
    <div className="history"><div className="history-title"><span>논문 수 비교</span><span>같은 길이의 두 기간</span></div><div className="history-bars">{comparison.map(item => <div key={item.label} className="history-bar-column"><span className="bar-value">{number(item.count)}</span><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(3, item.count / Math.max(topic.count, topic.previousCount, 1) * 100)}%` }} /></div><span className="bar-year">{item.label}</span></div>)}</div></div>
    <button className="focus-button" onClick={() => onExplore(topic)}>이 주제의 논문 읽기<BookOpen size={16} /></button>
  </section>;
}

function PaperRow({ paper, topics, saved, onSave, onOpen }) {
  const field = fieldFor(paper.fields[0]);
  const topic = topics.find(item => paper.topicIds.includes(item.id));
  const nature = /^Nature(?:\s|$)/i.test(paper.journal);
  return <article className="paper-row">
    <div className="paper-field-marker" style={{ background: field.color }} />
    <div className="paper-copy"><div className="paper-meta"><span className={`journal-name ${nature ? 'nature' : ''}`}>{paper.journal}</span><span className="meta-divider" /><time dateTime={paper.date}>{date(paper.date)}</time>{paper.oa && <span className="open-label">공개 원문</span>}</div><button className="paper-title" onClick={() => onOpen(paper)}>{paper.title}</button><div className="paper-bottom"><span className="topic-tag" style={{ '--field-color': field.color }}>{topic?.name || field.short}</span><span className="paper-author">{paper.authors[0] || '저자 미제공'}{paper.authors.length > 1 ? ' 외' : ''}</span><span className="citation-label">인용 {number(paper.citations)}회</span></div></div>
    <button className={`save-button ${saved ? 'saved' : ''}`} aria-label={`${paper.title} ${saved ? '저장 취소' : '저장'}`} aria-pressed={saved} onClick={() => onSave(paper)}><Bookmark size={19} fill={saved ? 'currentColor' : 'none'} /></button>
  </article>;
}

function Dialog({ children, onClose, label, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const oldFocus = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); oldFocus?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-label={label} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }}><button className="dialog-close" onClick={onClose} aria-label="닫기"><X size={21} /></button>{children}</dialog>;
}

function PaperDialog({ paper, topics, saved, onSave, onClose }) {
  const [note, setNote] = useState(() => { try { return localStorage.getItem(`research-atlas-note-${paper.id}`) || ''; } catch { return ''; } });
  const [noteStatus, setNoteStatus] = useState('');
  const related = topics.filter(topic => paper.topicIds.includes(topic.id));
  return <Dialog onClose={onClose} label="논문 상세" className="paper-dialog">
    <div className="detail-label"><BookOpen size={18} />논문 읽기{paper.oa && <span className="open-label">공개 원문</span>}</div>
    <h2>{paper.title}</h2><p className="detail-authors">{paper.authors.join(', ')}{paper.authors.length === 5 ? ' 외' : ''}</p>
    <div className="detail-publication"><strong>{paper.journal}</strong><time>{date(paper.date)}</time><span>인용 {number(paper.citations)}회</span>{paper.fwci != null && <span>FWCI {paper.fwci.toFixed(2)}</span>}</div>
    <div className="detail-actions"><External href={paper.doi || paper.sourceUrl} className="primary-button">출판사 원문<ExternalLink size={16} /></External>{paper.oaUrl && <External href={paper.oaUrl} className="secondary-button">공개 원문 열기<ExternalLink size={16} /></External>}<button className={`secondary-button ${saved ? 'is-saved' : ''}`} onClick={() => onSave(paper)}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? '서재에 저장됨' : '내 서재에 저장'}</button></div>
    {related.map(topic => <div className="detail-context" key={topic.id}><span className="topic-tag" style={{ '--field-color': fieldFor(topic.field).color }}>{topic.name}</span><p>{topic.description}</p></div>)}
    <section className="abstract-section"><div className="section-heading"><h3>초록</h3><span>저자 제공 원문</span></div>{paper.abstract ? <p lang="en">{paper.abstract}</p> : <div className="abstract-empty"><BookOpen size={22} /><p>데이터 제공처에 초록이 없어. 출판사 원문에서 내용을 확인할 수 있어.</p></div>}</section>
    <p className="reading-note">초록은 연구의 개요야. 실험 조건과 한계는 본문에서 확인해줘. 한국어 본문 해설은 아직 제공하지 않아.</p>
    <label className="note-label" htmlFor="reading-note">나의 읽기 메모<span>이 브라우저에 저장</span></label><textarea id="reading-note" value={note} onChange={event => { const value = event.target.value; setNote(value); try { localStorage.setItem(`research-atlas-note-${paper.id}`, value); setNoteStatus('저장됨'); } catch { setNoteStatus('저장 공간을 사용할 수 없어'); } }} placeholder="궁금한 점, 핵심 결과, 더 찾아볼 내용을 적어봐." rows="3" /><span className="note-status" role="status">{noteStatus}</span>
    <External href={paper.sourceUrl} className="metadata-link">OpenAlex에서 서지정보 확인<ExternalLink size={13} /></External>
  </Dialog>;
}

function Methodology({ data, onClose }) {
  return <Dialog label="데이터와 해석 방법" onClose={onClose} className="method-dialog"><div className="detail-label"><Database size={18} />데이터 안내</div><h2>숫자를 읽는 방법</h2><p className="method-intro">이 대시보드는 OpenAlex의 실제 검색 결과를 저장해 보여줘. 전체 학문 순위가 아닌, 선택한 12개 연구 주제의 관측 창이야.</p>
    <dl className="method-list"><div><dt>관측 기간</dt><dd>{date(data.period.start)}–{date(data.period.end)}<br />비교: {date(data.period.previousStart)}–{date(data.period.previousEnd)}</dd></div><div><dt>수집 시각</dt><dd>{new Date(data.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</dd></div><div><dt>논문 수</dt><dd>논문 제목에서 영문 검색어를 구문 검색한 결과 중 article 유형. 철회 표시가 있는 논문은 제외해. 다른 표현을 사용한 관련 연구는 누락될 수 있어.</dd></div><div><dt>성장률</dt><dd>(최근 12개월 논문 수 ÷ 직전 12개월 논문 수 − 1) × 100. 최근 논문은 색인 지연으로 누락될 수 있어.</dd></div><div><dt>논문 선정</dt><dd>주제마다 관측 기간 내 누적 인용 수가 높은 논문 최대 4편. 최신순 정렬도 이 수집 목록 안에서만 작동해. 전체 논문의 인기 순위는 아니야.</dd></div><div><dt>합계와 중복</dt><dd>한 논문이 여러 주제에 포함될 수 있어. 논문 수 합계는 중복을 포함하고, 논문 목록은 OpenAlex ID 기준으로 중복을 제거해.</dd></div><div><dt>인용과 FWCI</dt><dd>인용 수는 수집 시점의 값이야. FWCI는 분야·발표연도·유형을 보정한 지표지만, 연구의 진실성이나 임상 효과를 보장하지 않아.</dd></div><div><dt>Nature 표시</dt><dd>저널명 기준의 게재 정보야. 표지 선정·편집 추천·다운로드 순위는 수집하지 않았어.</dd></div><div><dt>내 서재</dt><dd>저장한 논문과 메모는 이 브라우저에만 보관해. 브라우저 데이터를 지우면 사라지고 다른 기기와 동기화되지 않아.</dd></div></dl>
    <h3 className="query-heading">추적 중인 검색어</h3><div className="query-list">{data.topics.map(topic => <External href={topic.sourceUrl} key={topic.id}><span>{topic.name}</span><code>“{topic.query}”</code><ExternalLink size={13} /></External>)}</div><div className="method-links"><External href="https://help.openalex.org/data/works/">OpenAlex 데이터 안내<ExternalLink size={14} /></External><External href="https://help.openalex.org/data/works/citations/">인용 지표 설명<ExternalLink size={14} /></External></div>
  </Dialog>;
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [field, setField] = useState('all');
  const [view, setView] = useState('map');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState(null);
  const [topicFilter, setTopicFilter] = useState(null);
  const [saved, setSaved] = useState(readSaved);
  const [paper, setPaper] = useState(null);
  const [methodology, setMethodology] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sort, setSort] = useState('citations');
  const [oaOnly, setOaOnly] = useState(false);
  const [natureOnly, setNatureOnly] = useState(false);
  const [toast, setToast] = useState('');
  const [limit, setLimit] = useState(12);
  const searchRef = useRef(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/snapshot.json`).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(value => { if (!Array.isArray(value.topics) || !Array.isArray(value.papers)) throw new Error(); setData(value); setSelection([...value.topics].sort((a, b) => (b.growth || 0) - (a.growth || 0))[0]?.id); }).catch(() => setError(true));
    const handler = event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); searchRef.current?.focus(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setLimit(12); }, [field, view, search, topicFilter, sort, oaOnly, natureOnly]);

  const topics = useMemo(() => data?.topics.filter(topic => field === 'all' || topic.field === field) || [], [data, field]);
  const selectedTopic = topics.find(topic => topic.id === selection) || [...topics].sort((a, b) => (b.growth || 0) - (a.growth || 0))[0];
  const savedIds = new Set(saved.map(item => item.id));
  const papers = useMemo(() => {
    if (!data) return [];
    let list = view === 'library' ? saved.map(item => data.papers.find(current => current.id === item.id) || item) : data.papers;
    list = list.filter(item => (field === 'all' || item.fields.includes(field)) && (!topicFilter || item.topicIds.includes(topicFilter)) && (!oaOnly || item.oa) && (!natureOnly || /^Nature(?:\s|$)/i.test(item.journal)));
    if (search.trim()) {
      const query = search.toLocaleLowerCase().trim();
      list = list.filter(item => [item.title, item.journal, ...item.authors, ...data.topics.filter(topic => item.topicIds.includes(topic.id)).flatMap(topic => [topic.name, topic.query])].join(' ').toLocaleLowerCase().includes(query));
    }
    return [...list].sort((a, b) => sort === 'date' ? b.date.localeCompare(a.date) : sort === 'fwci' ? (b.fwci ?? -1) - (a.fwci ?? -1) : b.citations - a.citations);
  }, [data, saved, view, field, topicFilter, oaOnly, natureOnly, search, sort]);

  function savePaper(item) {
    const isSaved = savedIds.has(item.id);
    const next = isSaved ? saved.filter(entry => entry.id !== item.id) : [...saved, item];
    try { localStorage.setItem('research-atlas-library', JSON.stringify(next)); setSaved(next); setToast(isSaved ? '서재에서 삭제했어.' : '내 서재에 저장했어.'); } catch { setToast('브라우저 저장 공간을 사용할 수 없어.'); }
  }
  function changeField(id) { setField(id); setTopicFilter(null); setMobileMenu(false); }
  function exploreTopic(topic) { setTopicFilter(topic.id); setView('papers'); setSearch(''); }
  function navigate(next) { setView(next); setTopicFilter(null); setSearch(''); setMobileMenu(false); }
  function resetFilters() { setSearch(''); setField('all'); setTopicFilter(null); setOaOnly(false); setNatureOnly(false); }
  function exportLibrary() {
    const content = '# Research Atlas · 내 서재\n\n' + saved.map(item => {
      let note = ''; try { note = localStorage.getItem(`research-atlas-note-${item.id}`) || ''; } catch { /* no notes */ }
      return `## ${item.title}\n\n${item.journal} | ${item.date}\n\n${safeUrl(item.doi || item.sourceUrl) || ''}\n\n${note ? `메모: ${note}\n\n` : ''}`;
    }).join('');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'research-atlas-library.md'; anchor.click(); URL.revokeObjectURL(url);
  }

  if (error) return <div className="boot-state"><Database size={36} /><h1>연구 데이터를 불러오지 못했어.</h1><p>연결을 확인하고 다시 시도해줘.</p><button className="primary-button" onClick={() => location.reload()}>다시 불러오기</button></div>;
  if (!data) return <div className="boot-state"><Brand /><p>연구 지도를 불러오는 중…</p></div>;

  const count = topics.reduce((total, topic) => total + topic.count, 0);
  const fieldPapers = data.papers.filter(item => field === 'all' || item.fields.includes(field));
  const openCount = fieldPapers.filter(item => item.oa).length;
  const activeField = fieldFor(field);
  const visiblePapers = view === 'map' ? papers.slice(0, 5) : papers.slice(0, limit);

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-scrim" aria-label="메뉴 닫기" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`} aria-label="분야 탐색">
      <button className="brand-button" onClick={() => { changeField('all'); navigate('map'); }} aria-label="Research Atlas 홈"><Brand /></button>
      <div className="workspace-label"><span className="workspace-icon"><Globe2 size={16} /></span><span>나의 리서치 워크스페이스</span></div>
      <nav className="sidebar-nav"><p className="nav-label">탐색</p><button className={`nav-item ${field === 'all' && view !== 'library' ? 'active' : ''}`} onClick={() => { changeField('all'); navigate('map'); }}><Layers3 size={19} /><span>전체 분야</span><span className="nav-count">12</span></button><div className="field-navigation">{FIELDS.map(item => <button key={item.id} className={`nav-item ${field === item.id ? 'active' : ''}`} onClick={() => { changeField(item.id); if (view === 'library') setView('map'); }}><item.Icon size={19} style={{ color: item.color }} /><span>{item.short}</span><span className="field-nav-dot" style={{ background: item.color }} /></button>)}</div><p className="nav-label personal-label">나의 연구</p><button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => { setField('all'); navigate('library'); }}><Library size={19} /><span>내 서재</span><span className="nav-count">{saved.length}</span></button></nav>
      <div className="sidebar-bottom"><div className="source-status"><span className="source-icon"><Database size={18} /></span><div><strong>OpenAlex 스냅샷</strong><span>{date(data.asOf)} 기준</span></div></div><button className="sidebar-help" onClick={() => setMethodology(true)}><CircleHelp size={16} />데이터와 해석 방법<ChevronRight size={15} /></button><div className="sidebar-footnote">질문에서 발견으로.</div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><button className="mobile-toggle" onClick={() => setMobileMenu(true)} aria-label="분야 메뉴 열기"><Menu size={23} /></button><div className="breadcrumb"><span>워크스페이스</span><ChevronRight size={14} /><strong>{activeField?.short || '전체 분야'}</strong></div><div className="global-search"><Search size={17} /><input ref={searchRef} value={search} onChange={event => { setSearch(event.target.value); if (event.target.value && view === 'map') { setView('papers'); setTopicFilter(null); } }} placeholder="논문·연구 주제 검색" aria-label="논문·연구 주제 검색" /><kbd>/</kbd>{search && <button onClick={() => setSearch('')} aria-label="검색어 지우기"><X size={14} /></button>}</div><button className="top-date" onClick={() => setMethodology(true)}><span className="snapshot-dot" />{date(data.asOf)}<ChevronDown size={14} /></button><span className="avatar" title="개인 워크스페이스"><Atom size={21} /></span></header>
    <main id="main-content">
      <div className="page-heading"><div><div className="page-context"><span className="context-dot" />Research overview</div><h1>{view === 'library' ? '읽고 싶은 연구를, 한곳에.' : activeField ? `${activeField.name}의 연구 흐름` : '지금, 학문은 어디로 향할까.'}</h1><p>{view === 'library' ? '관심을 두었던 논문과 나만의 읽기 기록.' : '연구의 움직임을 살피고, 다음에 읽을 논문을 발견해봐.'}</p></div><button className="heading-library" onClick={() => { setField('all'); navigate('library'); }}><Bookmark size={17} />내 서재<span>{saved.length}</span></button></div>
      <div className="view-tabs" role="tablist" aria-label="대시보드 보기">{[{ id: 'map', name: '리서치 맵', Icon: Globe2 }, { id: 'papers', name: '논문 탐색', Icon: BookOpen }, { id: 'library', name: '내 서재', Icon: Bookmark }].map(tab => <button key={tab.id} role="tab" aria-selected={view === tab.id} aria-controls="view-panel" id={`tab-${tab.id}`} className={view === tab.id ? 'active' : ''} onClick={() => navigate(tab.id)}><tab.Icon size={17} />{tab.name}{tab.id === 'library' && saved.length > 0 && <span className="tab-count">{saved.length}</span>}</button>)}<span className="tabs-period">최근 12개월 <span>{date(data.period.start)}–{date(data.period.end)}</span></span></div>
      <div id="view-panel" role="tabpanel" aria-labelledby={`tab-${view}`}>
      {view === 'map' && <>
        <section className="summary-strip" aria-label="연구 현황 요약"><div className="summary-item"><span>관측 중인 연구 주제<Layers3 size={15} /></span><strong>{topics.length}<small>개</small></strong><p>{activeField ? `${activeField.short} 관심 주제` : '4개 학문 분야'}</p></div><div className="summary-item"><span>최근 12개월 논문<BookOpen size={15} /></span><strong>{number(count)}<small>편</small></strong><p>추적 주제별 합계 · 중복 포함</p></div><div className="summary-item"><span>성장 중인 주제<Activity size={15} /></span><strong>{topics.filter(topic => topic.growth > 0).length}<small>/{topics.length}</small></strong><p>직전 12개월보다 논문 수 증가</p></div><div className="summary-item"><span>읽을 수 있는 공개 원문<ExternalLink size={15} /></span><strong>{openCount}<small>/{fieldPapers.length}편</small></strong><p>수집한 논문 목록 기준</p></div></section>
        <div className="research-workspace"><section className="map-panel"><div className="panel-heading"><div><h2>연구 모멘텀<Sparkles size={17} /></h2><p>어떤 주제가 커지고 있을까?</p></div><button className="icon-button" aria-label="연구 모멘텀 해석 방법" onClick={() => setMethodology(true)}><CircleHelp size={18} /></button></div><div className="map-legend">{FIELDS.filter(item => field === 'all' || field === item.id).map(item => <button key={item.id} onClick={() => changeField(field === item.id ? 'all' : item.id)}><span className="field-dot" style={{ background: item.color }} />{item.short}</button>)}<span className="bubble-key"><i />원 크기 = 논문 수</span></div><ResearchMap topics={topics} selected={selectedTopic} onSelect={topic => setSelection(topic.id)} /><div className="map-footnote"><span>주제를 선택해 자세히 살펴봐.</span><button onClick={() => setMethodology(true)}>연구 활동을 측정하며 발전 속도를 뜻하지 않아<CircleHelp size={12} /></button></div></section>{selectedTopic && <TopicFocus topic={selectedTopic} onExplore={exploreTopic} />}</div>
        <section className="topic-overview"><div className="section-heading"><h2>분야별 연구 흐름</h2><span>직전 12개월과 최근 12개월 비교</span></div><div className={`field-overview-grid ${field !== 'all' ? 'single-field' : ''}`}>{FIELDS.filter(item => field === 'all' || field === item.id).map(item => { const group = topics.filter(topic => topic.field === item.id); const fastest = [...group].sort((a, b) => (b.growth || 0) - (a.growth || 0))[0]; const history = [{ label: '직전 12개월', count: group.reduce((sum, topic) => sum + topic.previousCount, 0) }, { label: '최근 12개월', count: group.reduce((sum, topic) => sum + topic.count, 0) }]; return <button className="field-overview" key={item.id} onClick={() => changeField(item.id)}><div className="field-overview-title"><span className="field-symbol" style={{ '--field-color': item.color }}><item.Icon size={20} /></span><span><strong>{item.short}</strong><small>{group.length}개 연구 주제</small></span><ChevronRight size={15} /></div><div className="field-overview-data"><div><span className="fastest-name">{fastest.name}</span><Growth value={fastest.growth} compact /></div><Sparkline history={history} color={item.color} /></div></button>; })}</div></section>
      </>}
      <section className={`papers-section ${view !== 'map' ? 'expanded' : ''}`} aria-label={view === 'library' ? '저장한 논문' : '논문 목록'}><div className="section-heading papers-heading"><div><h2>{view === 'library' ? '나의 읽기 목록' : view === 'papers' ? '논문 탐색' : '관심을 이어갈 논문'}{view !== 'map' && <span className="result-count">{papers.length}</span>}</h2><p>{view === 'library' ? '저장한 논문은 이 브라우저에서 다시 읽을 수 있어.' : '주제별 인용 상위 논문에서 다음 읽을거리를 찾아봐.'}</p></div>{view === 'map' ? <button className="text-button" onClick={() => navigate('papers')}>논문 전체 보기<ChevronRight size={16} /></button> : view === 'library' && saved.length > 0 ? <button className="secondary-button" onClick={exportLibrary}><Download size={16} />서재 내보내기</button> : null}</div>
        {view !== 'map' && <div className="paper-toolbar"><div className="filter-controls"><SlidersHorizontal size={17} /><label><span className="sr-only">논문 분야</span><select value={field} onChange={event => changeField(event.target.value)}><option value="all">전체 분야</option>{FIELDS.map(item => <option key={item.id} value={item.id}>{item.short}</option>)}</select></label><label className={`filter-check ${oaOnly ? 'checked' : ''}`}><input type="checkbox" checked={oaOnly} onChange={event => setOaOnly(event.target.checked)} />공개 원문</label><label className={`filter-check ${natureOnly ? 'checked' : ''}`}><input type="checkbox" checked={natureOnly} onChange={event => setNatureOnly(event.target.checked)} />Nature 계열</label></div><label className="sort-control"><span className="sr-only">논문 정렬</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="citations">인용 많은 순</option><option value="date">최신순</option><option value="fwci">FWCI 높은 순</option></select><ChevronDown size={14} /></label></div>}
        {topicFilter && <div className="active-filter"><span>{data.topics.find(topic => topic.id === topicFilter)?.name}</span><button onClick={() => setTopicFilter(null)} aria-label="주제 필터 지우기"><X size={14} /></button></div>}
        <div className="paper-list">{visiblePapers.map(item => <PaperRow key={item.id} paper={item} topics={data.topics} saved={savedIds.has(item.id)} onSave={savePaper} onOpen={setPaper} />)}{papers.length === 0 && <div className="empty-state">{view === 'library' && saved.length === 0 ? <><Bookmark size={30} /><h3>궁금한 논문부터 한 편.</h3><p>논문 옆 책갈피를 누르면 여기에 모아둘게.</p><button className="primary-button" onClick={() => { resetFilters(); navigate('papers'); }}>논문 둘러보기</button></> : <><Search size={30} /><h3>조건에 맞는 논문이 없어.</h3><p>검색어나 필터를 바꾸면 다른 연구를 찾을 수 있어.</p><button className="secondary-button" onClick={resetFilters}>필터 초기화</button></>}</div>}</div>
        {view !== 'map' && papers.length > limit && <button className="load-more" onClick={() => setLimit(limit + 12)}>논문 더 보기<span>{Math.min(limit, papers.length)} / {papers.length}</span><ChevronDown size={16} /></button>}
      </section>
      </div>
      <footer className="page-footer"><span>Research Atlas <span className="footer-separator">/</span> 작은 질문에서 시작하는 큰 발견</span><button onClick={() => setMethodology(true)}>출처: OpenAlex · 데이터 안내<ExternalLink size={12} /></button></footer>
    </main></div>
    {paper && <PaperDialog paper={paper} topics={data.topics} saved={savedIds.has(paper.id)} onSave={savePaper} onClose={() => setPaper(null)} />}
    {methodology && <Methodology data={data} onClose={() => setMethodology(false)} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

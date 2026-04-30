// Host (live) view + Admin (creator) view — both desktop, presented in browser-window chrome.

const { useState: useStateH, useEffect: useEffectH } = React;

function HostSurface({ brand, qIdx, autoTick = true }) {
  const q = window.BSY_QUIZ.questions[qIdx];
  const [timeLeft, setTimeLeft] = useStateH(q ? q.time : 25);
  const [counts, setCounts] = useStateH([0, 0, 0, 0]);
  const [respondCount, setRespondCount] = useStateH(0);

  useEffectH(() => {
    if (!q) return;
    setTimeLeft(q.time);
    setCounts(q.options.map(() => 0));
    setRespondCount(0);
  }, [qIdx]);

  useEffectH(() => {
    if (!autoTick) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => {
      setTimeLeft(s => Math.max(0, s - 1));
      // simulate answers trickling in
      setCounts(prev => {
        const next = [...prev];
        const total = next.reduce((a, b) => a + b, 0);
        if (total < 22 && Math.random() > 0.25) {
          // bias towards correct answer
          const correctIdx = q.options.findIndex(o => q.correct.includes(o.id));
          const idx = Math.random() < 0.55 ? correctIdx : Math.floor(Math.random() * q.options.length);
          if (idx >= 0) next[idx] = (next[idx] || 0) + 1;
        }
        return next;
      });
      setRespondCount(c => Math.min(24, c + (Math.random() > 0.4 ? 1 : 0)));
    }, 700);
    return () => clearTimeout(t);
  }, [timeLeft, autoTick, qIdx]);

  if (!q) return null;
  const totalPlayers = 24;
  const totalAnswers = counts.reduce((a, b) => a + b, 0);
  const optionLetter = (i) => ['א', 'ב', 'ג', 'ד'][i];
  const isWarn = timeLeft <= 5;
  const timePct = (timeLeft / q.time) * 100;
  const correctIdx = q.options.findIndex(o => q.correct.includes(o.id));

  return (
    <div className="host-frame">
      <div className="winchrome">
        <span className="dot r"></span><span className="dot y"></span><span className="dot g"></span>
        <div className="url">live.bishvil-yehuda.app/host/{window.BSY_QUIZ.pin.replace('·', '-')}</div>
      </div>
      <div className="host-screen">
        <div className="host-top">
          <div className="host-brand">
            <img src={brand.logo} alt={brand.name} />
            <span className="pin">{window.BSY_QUIZ.pin}</span>
          </div>
          <div className="host-counter">
            <span><span className="c">{respondCount}</span>/ {totalPlayers} ענו</span>
            <span><span className="c">{qIdx + 1}</span>/ {window.BSY_QUIZ.questions.length} תחנות</span>
          </div>
        </div>
        <div className="host-stage">
          <div className="host-q-area">
            <div className="host-q-card">
              <div className="host-q-meta">
                <span>{q.typeLabel}</span>
                <span>תחנה {qIdx + 1}</span>
              </div>
              <h3 className="host-q-prompt">{q.prompt}</h3>
            </div>
            <div className="host-bars" style={{ gridTemplateColumns: q.options.length === 2 ? '1fr 1fr' : '1fr 1fr' }}>
              {q.options.map((o, i) => {
                const c = counts[i] || 0;
                const pct = totalAnswers ? Math.round((c / totalAnswers) * 100) : 0;
                const fillH = totalAnswers ? Math.min(100, (c / Math.max(...counts, 1)) * 100) : 0;
                return (
                  <div key={o.id} className={`host-bar ${i === correctIdx ? 'correct' : ''}`}>
                    <div className="fill" style={{ height: `${fillH}%` }} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="h-marker">{optionLetter(i)}</span>
                      <span className="h-label">{o.text}</span>
                    </div>
                    <div className="h-stats">
                      <span className="pct">{pct}%</span>
                      <span className="ct">{c} משיבים</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="host-side">
            <div className="host-timer-wrap">
              <div className={`host-timer-num ${isWarn ? 'warn' : ''}`}>{String(Math.max(0, timeLeft)).padStart(2, '0')}</div>
              <div className="host-timer-bar"><div className={isWarn ? 'warn' : ''} style={{ width: `${Math.max(0, timePct)}%` }} /></div>
              <div className="host-respond"><b>{respondCount}</b> מתוך {totalPlayers} השיבו</div>
            </div>
            <h4>משתתפים</h4>
            <div className="host-players">
              {window.BSY_PLAYERS.map(p => (
                <div key={p.id} className="host-player">
                  <span className="pav">{p.av}</span>
                  <span className="pn">{p.name}</span>
                  <span className="ps">{p.score.toLocaleString('he-IL')}</span>
                  <span className={`pdot ${p.answered ? 'answered' : 'waiting'}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="host-controls">
          <div className="left">
            <button className="host-control-btn">⏸ השהה</button>
            <button className="host-control-btn">דלג</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--bsy-stone-400)' }}>
            לחיצה על "חשיפה" תציג את התשובה הנכונה לכל המשתתפים
          </div>
          <button className="host-control-btn primary">חשיפת התשובה ←</button>
        </div>
      </div>
    </div>
  );
}

function AdminSurface({ brand }) {
  const [activeQ, setActiveQ] = useStateH(0);
  const [questions, setQuestions] = useStateH(window.BSY_QUIZ.questions);
  const q = questions[activeQ];

  function updateQ(patch) {
    setQuestions(qs => qs.map((x, i) => i === activeQ ? { ...x, ...patch } : x));
  }
  function toggleCorrect(optId) {
    const isMulti = q.type === 'multi';
    let next;
    if (isMulti) {
      next = q.correct.includes(optId) ? q.correct.filter(x => x !== optId) : [...q.correct, optId];
    } else {
      next = [optId];
    }
    updateQ({ correct: next });
  }

  const types = [
    { id: 'single', label: 'רב־ברירה' },
    { id: 'multi', label: 'בחירה מרובה' },
    { id: 'truefalse', label: 'נכון/לא' },
    { id: 'image', label: 'תמונה' },
    { id: 'map', label: 'מפה' },
  ];

  return (
    <div className="admin-frame">
      <div className="winchrome">
        <span className="dot r"></span><span className="dot y"></span><span className="dot g"></span>
        <div className="url">app.bishvil-yehuda.app/admin/quizzes/חברון-טירונות</div>
      </div>
      <div className="admin-screen">
        <aside className="admin-side">
          <div className="brand">
            <img src={brand.logo} alt={brand.name} />
            <div>
              <div className="b-t">{brand.name}</div>
              <div className="b-s">״{brand.sub}״</div>
            </div>
          </div>
          <button className="admin-nav active">
            <span className="ic">◇</span> החידונים שלי
          </button>
          <button className="admin-nav">
            <span className="ic">◊</span> משחקים פעילים
          </button>
          <button className="admin-nav">
            <span className="ic">◯</span> תוצאות וניתוח
          </button>
          <button className="admin-nav">
            <span className="ic">◍</span> משתתפים
          </button>
          <div className="group-h">הגדרות</div>
          <button className="admin-nav">
            <span className="ic">◐</span> מותג ותצוגה
          </button>
          <button className="admin-nav">
            <span className="ic">◒</span> צוות
          </button>
        </aside>
        <main className="admin-main">
          <div className="admin-toolbar">
            <div className="admin-crumbs">
              החידונים שלי / <b>{window.BSY_QUIZ.title}</b>
            </div>
            <div className="admin-tools">
              <span className="admin-status"><span className="sdot" /> נשמר אוטומטית</span>
              <button className="host-control-btn">תצוגה מקדימה</button>
              <button className="host-control-btn primary">הפעלת חידון ←</button>
            </div>
          </div>
          <div className="admin-body">
            <div className="admin-questions">
              <div className="admin-quiz-meta">
                <div className="field">
                  <label className="field-label">שם החידון</label>
                  <input className="field-input" defaultValue={window.BSY_QUIZ.title} />
                </div>
                <div className="admin-meta-grid">
                  <div className="field">
                    <label className="field-label">מצב משחק</label>
                    <select className="field-input" defaultValue="sync">
                      <option value="sync">סינכרוני (מודרך)</option>
                      <option value="async">אסינכרוני (חופשי)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">קוד הצטרפות</label>
                    <input className="field-input" value={window.BSY_QUIZ.pin} readOnly style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }} />
                  </div>
                </div>

                {/* Custom branding for this specific event */}
                <div className="admin-branding-card">
                  <div className="abc-head">
                    <span className="abc-eyebrow">מיתוג ייעודי לחידון</span>
                    <label className="abc-toggle">
                      <input type="checkbox" defaultChecked={!!window.BSY_QUIZ.customLogo} />
                      <span>פעיל</span>
                    </label>
                  </div>
                  <div className="abc-body">
                    <div className="abc-logo-preview">
                      <img src={window.BSY_QUIZ.customLogo || brand.logo} alt="" />
                    </div>
                    <div className="abc-controls">
                      <div className="field">
                        <label className="field-label">שם האירוע (יוצג ליד הלוגו)</label>
                        <input className="field-input" defaultValue={window.BSY_QUIZ.customLogoLabel || 'גדוד 890 · מסע מפקדים'} />
                      </div>
                      <div className="abc-actions">
                        <button className="host-control-btn">⤒ העלאת לוגו ייעודי</button>
                        <button className="host-control-btn ghost">↺ חזרה ללוגו המותג</button>
                      </div>
                      <div className="field-help">
                        כשפעיל — הלוגו הייעודי מופיע במסך ההצטרפות, בלוח החי ובלוח התוצאות.
                        מותג הבסיס ({brand.name}) נשמר במייל, בכותרות ובדפי הניהול.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {questions.map((qq, i) => (
                <div key={qq.id} className={`admin-q ${i === activeQ ? 'active' : ''}`} onClick={() => setActiveQ(i)}>
                  <div className="admin-q-head">
                    <span className="admin-q-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="admin-q-title">{qq.prompt}</span>
                    <span className="admin-q-type">{qq.typeLabel}</span>
                  </div>
                  <div className="admin-q-foot">
                    {qq.options ? (
                      <>
                        <span>{qq.options.length} תשובות</span>
                        <span>· {qq.time} שניות</span>
                        <span>· {qq.correct.length} {qq.correct.length === 1 ? 'נכונה' : 'נכונות'}</span>
                      </>
                    ) : (
                      <>
                        <span>נקודה על מפה</span>
                        <span>· {qq.time} שניות</span>
                        <span>· סובלנות {qq.tolerance}%</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <button className="admin-add">+ הוספת תחנה</button>
            </div>
            <aside className="admin-editor">
              <h3>עריכת תחנה {activeQ + 1}</h3>
              <div className="field">
                <label className="field-label">סוג שאלה</label>
                <div className="admin-type-pills">
                  {types.map(t => (
                    <button
                      key={t.id}
                      className={`admin-type-pill ${q.type === t.id ? 'active' : ''}`}
                      onClick={() => updateQ({ type: t.id, typeLabel: t.label })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="field-label">ניסוח השאלה</label>
                <textarea
                  className="field-input"
                  rows={2}
                  value={q.prompt}
                  onChange={e => updateQ({ prompt: e.target.value })}
                />
              </div>
              {(q.type === 'image') && (
                <div className="field">
                  <label className="field-label">מדיה (תמונה / סרטון)</label>
                  <div className="media-uploader">
                    <div className="media-thumb" style={{ backgroundImage: `url(${q.media || ''})` }}>
                      {!q.media && <span>אין תמונה</span>}
                    </div>
                    <div className="media-actions">
                      <button className="host-control-btn">⤒ העלאת קובץ</button>
                      <button className="host-control-btn">⌗ מספריית המותג</button>
                      <div className="field-help">PNG · JPG · MP4 · עד 12MB</div>
                    </div>
                  </div>
                </div>
              )}
              {(q.type === 'map') && (
                <div className="field">
                  <label className="field-label">מפה ויעד</label>
                  <div className="media-uploader">
                    <div className="media-thumb map" />
                    <div className="media-actions">
                      <div className="map-target-readout">
                        יעד: <b>{q.targetLabel || '—'}</b>
                        <div>קואורדינטות: {q.target?.x}% · {q.target?.y}%</div>
                      </div>
                      <button className="host-control-btn">⊕ הגדרת נקודת יעד</button>
                      <button className="host-control-btn">⤒ החלפת מפה</button>
                    </div>
                  </div>
                </div>
              )}
              {q.options && (
              <div className="field">
                <label className="field-label">תשובות</label>
                <div className="opts">
                  {q.options.map((o) => (
                    <div key={o.id} className="opt">
                      <button
                        className={`check ${q.correct.includes(o.id) ? 'on' : ''}`}
                        onClick={() => toggleCorrect(o.id)}
                        title="סמנו כנכונה"
                      >{q.correct.includes(o.id) ? '✓' : ''}</button>
                      <input
                        className="field-input"
                        value={o.text}
                        onChange={e => {
                          const newOpts = q.options.map(x => x.id === o.id ? { ...x, text: e.target.value } : x);
                          updateQ({ options: newOpts });
                        }}
                      />
                      <button className="x" title="מחיקה">✕</button>
                    </div>
                  ))}
                </div>
              </div>
              )}
              <div className="admin-meta-grid" style={{ marginTop: 4 }}>
                <div className="field">
                  <label className="field-label">זמן (שניות)</label>
                  <input className="field-input" type="number" value={q.time} onChange={e => updateQ({ time: +e.target.value || 0 })} />
                </div>
                <div className="field">
                  <label className="field-label">נקודות</label>
                  <input className="field-input" defaultValue="1500" />
                </div>
              </div>
              <div className="field">
                <label className="field-label">פידבק לאחר תשובה</label>
                <textarea className="field-input" rows={3} value={q.explanation} onChange={e => updateQ({ explanation: e.target.value })} />
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

window.HostSurface = HostSurface;
window.AdminSurface = AdminSurface;

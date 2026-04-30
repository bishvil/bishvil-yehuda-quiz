// Admin mobile — quick-edit on the go.

const { useState: useStateAM } = React;

function AdminMobileSurface({ brand }) {
  const [activeQ, setActiveQ] = useStateAM(0);
  const [view, setView] = useStateAM('list'); // 'list' or 'edit'
  const [questions, setQuestions] = useStateAM(window.BSY_QUIZ.questions);
  const q = questions[activeQ];

  function updateQ(patch) {
    setQuestions(qs => qs.map((x, i) => i === activeQ ? { ...x, ...patch } : x));
  }
  function toggleCorrect(optId) {
    const isMulti = q.type === 'multi';
    const next = isMulti
      ? (q.correct.includes(optId) ? q.correct.filter(x => x !== optId) : [...q.correct, optId])
      : [optId];
    updateQ({ correct: next });
  }

  return (
    <window.IOSFrame>
      <div className="bsy-mobile">
        <div style={{
          padding: '54px 18px 12px',
          background: 'var(--bsy-paper-warm)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}>
          {view === 'edit' ? (
            <button onClick={() => setView('list')} style={{
              border: 0, background: 'transparent', color: 'var(--bsy-green-forest)',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>→ חזרה</button>
          ) : (
            <img src={brand.logo} alt={brand.name} style={{ height: 28 }} />
          )}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--bsy-brown)', lineHeight: 1.1 }}>
              {view === 'edit' ? `תחנה ${activeQ + 1}` : 'עריכת חידון'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--bsy-stone-400)', marginTop: 2 }}>
              {view === 'edit' ? q.typeLabel : window.BSY_QUIZ.title}
            </div>
          </div>
          <span style={{
            fontSize: 10, color: 'var(--bsy-green-forest)', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bsy-green-bright)' }} />
            נשמר
          </span>
        </div>

        <div className="bsy-mobile-body" style={{ padding: '14px 16px 24px' }}>
          {view === 'list' ? (
            <>
              <div style={{
                background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: '14px 16px', marginBottom: 14,
              }}>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label className="field-label">שם החידון</label>
                  <input className="field-input" defaultValue={window.BSY_QUIZ.title} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">מצב</label>
                    <select className="field-input" defaultValue="sync">
                      <option value="sync">סינכרוני</option>
                      <option value="async">אסינכרוני</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">קוד</label>
                    <input className="field-input" value={window.BSY_QUIZ.pin} readOnly
                      style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }} />
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bsy-stone-400)',
                letterSpacing: '0.12em', textTransform: 'uppercase', margin: '4px 4px 8px' }}>
                {questions.length} תחנות
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions.map((qq, i) => (
                  <button key={qq.id} className="admin-q" style={{ textAlign: 'start', cursor: 'pointer', width: '100%' }}
                    onClick={() => { setActiveQ(i); setView('edit'); }}>
                    <div className="admin-q-head">
                      <span className="admin-q-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="admin-q-title">{qq.prompt}</span>
                    </div>
                    <div className="admin-q-foot">
                      <span className="admin-q-type" style={{ marginInlineEnd: 6 }}>{qq.typeLabel}</span>
                      <span>{qq.time} שניות</span>
                      <span>· {qq.correct.length} נכונות</span>
                    </div>
                  </button>
                ))}
                <button className="admin-add">+ הוספת תחנה</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#fff', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: 14 }}>
                <label className="field-label">סוג שאלה</label>
                <div className="admin-type-pills" style={{ marginTop: 4 }}>
                  {[
                    { id: 'single', label: 'רב־ברירה' },
                    { id: 'multi', label: 'בחירה מרובה' },
                    { id: 'truefalse', label: 'נכון/לא' },
                    { id: 'image', label: 'תמונה' },
                  ].map(t => (
                    <button key={t.id}
                      className={`admin-type-pill ${q.type === t.id ? 'active' : ''}`}
                      onClick={() => updateQ({ type: t.id, typeLabel: t.label })}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: 14 }}>
                <label className="field-label">ניסוח השאלה</label>
                <textarea className="field-input" rows={3} value={q.prompt}
                  onChange={e => updateQ({ prompt: e.target.value })} />
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: 14 }}>
                <label className="field-label">תשובות</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {q.options.map((o) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => toggleCorrect(o.id)}
                        style={{
                          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                          border: '1.5px solid var(--color-border)',
                          background: q.correct.includes(o.id) ? 'var(--bsy-green-forest)' : '#fff',
                          color: '#fff', cursor: 'pointer', fontSize: 14,
                        }}>{q.correct.includes(o.id) ? '✓' : ''}</button>
                      <input className="field-input" style={{ flex: 1 }} value={o.text}
                        onChange={e => {
                          const newOpts = q.options.map(x => x.id === o.id ? { ...x, text: e.target.value } : x);
                          updateQ({ options: newOpts });
                        }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#fff', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <label className="field-label">זמן (שניות)</label>
                  <input className="field-input" type="number" value={q.time}
                    onChange={e => updateQ({ time: +e.target.value || 0 })} />
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <label className="field-label">נקודות</label>
                  <input className="field-input" defaultValue="1500" />
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: 14 }}>
                <label className="field-label">פידבק לאחר תשובה</label>
                <textarea className="field-input" rows={3} value={q.explanation}
                  onChange={e => updateQ({ explanation: e.target.value })} />
              </div>

              <button className="btn btn-primary btn-block" onClick={() => setView('list')}>
                שמירה וחזרה לחידון
              </button>
            </div>
          )}
        </div>
      </div>
    </window.IOSFrame>
  );
}

window.AdminMobileSurface = AdminMobileSurface;

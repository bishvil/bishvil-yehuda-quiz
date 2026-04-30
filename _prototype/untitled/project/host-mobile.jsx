// Host mobile surface — מדריך view on a phone in the field.
// Identical data + behavior to the desktop HostSurface, condensed for a phone.

const { useState: useStateHM, useEffect: useEffectHM } = React;

function HostMobileSurface({ brand, qIdx, autoTick = true }) {
  const q = window.BSY_QUIZ.questions[qIdx];
  const [timeLeft, setTimeLeft] = useStateHM(q ? q.time : 25);
  const [counts, setCounts] = useStateHM([0, 0, 0, 0]);
  const [respondCount, setRespondCount] = useStateHM(0);
  const [tab, setTab] = useStateHM('live');

  useEffectHM(() => {
    if (!q) return;
    setTimeLeft(q.time);
    setCounts((q.options || []).map(() => 0));
    setRespondCount(0);
  }, [qIdx]);

  useEffectHM(() => {
    if (!autoTick) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => {
      setTimeLeft(s => Math.max(0, s - 1));
      setCounts(prev => {
        const next = [...prev];
        const total = next.reduce((a, b) => a + b, 0);
        if (total < 22 && Math.random() > 0.25 && q.options) {
          const correctIdx = q.options.findIndex(o => q.correct?.includes(o.id));
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
  const isWarn = timeLeft <= 5;
  const timePct = (timeLeft / q.time) * 100;
  const correctIdx = q.options ? q.options.findIndex(o => q.correct?.includes(o.id)) : -1;
  const optionLetter = (i) => ['א', 'ב', 'ג', 'ד'][i];
  const activeLogo = window.BSY_QUIZ.customLogo || brand.logo;

  return (
    <window.IOSFrame statusBarColor="dark" homeBar={true}>
      <div className="bsy-mobile-screen host-mobile">
        <div className="hm-top">
          <div className="hm-brand">
            <img src={activeLogo} alt="" />
            <div className="hm-brand-text">
              <div className="t">תצוגת מדריך</div>
              <div className="s">קוד {window.BSY_QUIZ.pin}</div>
            </div>
          </div>
          <button className="hm-icon-btn" title="הגדרות">⋯</button>
        </div>

        <div className="hm-tabs">
          <button className={`hm-tab ${tab === 'live' ? 'on' : ''}`} onClick={() => setTab('live')}>החידון</button>
          <button className={`hm-tab ${tab === 'players' ? 'on' : ''}`} onClick={() => setTab('players')}>
            משתתפים <span className="hm-tab-c">{totalPlayers}</span>
          </button>
        </div>

        {tab === 'live' && (
          <div className="hm-body">
            <div className="hm-progress">
              <span>תחנה <b>{qIdx + 1}</b> / {window.BSY_QUIZ.questions.length}</span>
              <span><b>{respondCount}</b> / {totalPlayers} ענו</span>
            </div>

            <div className="hm-q-card">
              <div className="hm-q-type">{q.typeLabel}</div>
              <h3 className="hm-q-prompt">{q.prompt}</h3>
            </div>

            <div className={`hm-timer ${isWarn ? 'warn' : ''}`}>
              <div className="hm-timer-num">{String(Math.max(0, timeLeft)).padStart(2, '0')}</div>
              <div className="hm-timer-meta">
                <div className="hm-timer-bar"><div style={{ width: `${Math.max(0, timePct)}%` }} /></div>
                <div className="hm-timer-label">שניות נותרו</div>
              </div>
            </div>

            {q.options ? (
              <div className="hm-bars">
                {q.options.map((o, i) => {
                  const c = counts[i] || 0;
                  const pct = totalAnswers ? Math.round((c / totalAnswers) * 100) : 0;
                  const fillW = totalAnswers ? Math.min(100, (c / Math.max(...counts, 1)) * 100) : 0;
                  return (
                    <div key={o.id} className={`hm-bar ${i === correctIdx ? 'correct' : ''}`}>
                      <div className="hm-bar-row">
                        <span className="hm-bar-letter">{optionLetter(i)}</span>
                        <span className="hm-bar-text">{o.text}</span>
                        <span className="hm-bar-pct">{pct}%</span>
                      </div>
                      <div className="hm-bar-track"><div className="hm-bar-fill" style={{ width: `${fillW}%` }} /></div>
                      <div className="hm-bar-count">{c} משיבים</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="hm-map-summary">
                <div className="hm-map-summary-head">סוג שאלה: דקירה על מפה</div>
                <div className="hm-map-summary-body">
                  יעד: <b>{q.targetLabel}</b><br />
                  סובלנות: ±{q.tolerance}%<br />
                  תוצאות מצטברות יוצגו במסך החי לאחר חשיפה.
                </div>
              </div>
            )}

            <div className="hm-actions">
              <button className="hm-act ghost">⏸</button>
              <button className="hm-act ghost">דלג</button>
              <button className="hm-act primary">חשיפת התשובה ←</button>
            </div>

            <div className="hm-hint">
              חידון פעיל בכיתה — תוצאות מתעדכנות בזמן אמת. אפשר לעבור בין משתתפים בלשונית.
            </div>
          </div>
        )}

        {tab === 'players' && (
          <div className="hm-body hm-players-body">
            <div className="hm-players-summary">
              <div>
                <div className="hm-ps-num">{respondCount}</div>
                <div className="hm-ps-l">ענו על תחנה {qIdx + 1}</div>
              </div>
              <div>
                <div className="hm-ps-num">{totalPlayers - respondCount}</div>
                <div className="hm-ps-l">עדיין חושבים</div>
              </div>
            </div>
            <div className="hm-players-list">
              {window.BSY_PLAYERS.map(p => (
                <div key={p.id} className="hm-player">
                  <span className="pav">{p.av}</span>
                  <div className="hm-player-main">
                    <div className="hm-player-name">{p.name}</div>
                    <div className="hm-player-meta">{p.score.toLocaleString('he-IL')} נק׳ · מקום {p.id}</div>
                  </div>
                  <span className={`hm-pdot ${p.answered ? 'answered' : 'waiting'}`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </window.IOSFrame>
  );
}

window.HostMobileSurface = HostMobileSurface;

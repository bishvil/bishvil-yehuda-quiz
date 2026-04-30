// Participant mobile experience — Join → Lobby → Quiz → Result
// Wraps screens in iOS frame.

const { useState, useEffect, useRef, useMemo } = React;

function ParticipantSurface({ brand, gameMode, initialScreen = 'join', onSwitchScreen }) {
  const [screen, setScreen] = useState(initialScreen);
  const [code, setCode] = useState(['4', '8', '2', '', '', '']);
  const [profile, setProfile] = useState({ phone: '', name: '', unit: '', team: '' });
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState([]);
  const [mapPin, setMapPin] = useState(null); // {x, y} % of map
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [streak, setStreak] = useState(0);

  // Active logo: quiz custom logo if set, else brand logo
  const activeLogo = window.BSY_QUIZ.customLogo || brand.logo;
  const activeLogoLabel = window.BSY_QUIZ.customLogo ? window.BSY_QUIZ.customLogoLabel : brand.name;

  useEffect(() => { setScreen(initialScreen); }, [initialScreen]);

  // Reset selection on question change
  useEffect(() => {
    setSelected([]);
    setMapPin(null);
    setRevealed(false);
    const q = window.BSY_QUIZ.questions[qIdx];
    setTimeLeft(q ? q.time : 25);
  }, [qIdx]);

  // Timer (only on quiz screen, not revealed)
  useEffect(() => {
    if (screen !== 'quiz' || revealed) return;
    if (timeLeft <= 0) { handleReveal(); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [screen, revealed, timeLeft]);

  const q = window.BSY_QUIZ.questions[qIdx];

  function handleSelectOption(optId) {
    if (revealed) return;
    if (q.type === 'multi') {
      setSelected(s => s.includes(optId) ? s.filter(x => x !== optId) : [...s, optId]);
    } else {
      setSelected([optId]);
    }
  }

  function handleSubmit() {
    if (q.type === 'map') {
      if (!mapPin) return;
    } else if (selected.length === 0) return;
    handleReveal();
  }

  function handleReveal() {
    setRevealed(true);
    let isCorrect = false;
    if (q.type === 'map') {
      if (mapPin) {
        const dx = mapPin.x - q.target.x;
        const dy = mapPin.y - q.target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        isCorrect = dist <= q.tolerance;
      }
    } else {
      const correctSet = new Set(q.correct);
      const selSet = new Set(selected);
      isCorrect = correctSet.size === selSet.size && [...correctSet].every(x => selSet.has(x));
    }
    if (isCorrect) {
      const timeBonus = Math.max(0, Math.round((timeLeft / q.time) * 500));
      setScore(s => s + 1000 + timeBonus);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
  }

  function handleNext() {
    if (qIdx + 1 >= window.BSY_QUIZ.questions.length) {
      setScreen('result');
    } else {
      setQIdx(qIdx + 1);
    }
  }

  function handleJoin() {
    setScreen('lobby');
  }

  function startQuiz() {
    setQIdx(0);
    setScreen('quiz');
  }

  return (
    <window.IOSFrame statusBarColor="dark" homeBar={true} hideKeyboard={true}>
      <div className="bsy-mobile">
        <div className="bsy-mobile-body">
          {screen === 'join' && (
            <JoinScreen
              brand={brand}
              activeLogo={activeLogo}
              activeLogoLabel={activeLogoLabel}
              code={code}
              setCode={setCode}
              profile={profile}
              setProfile={setProfile}
              onJoin={handleJoin}
            />
          )}
          {screen === 'lobby' && (
            <LobbyScreen
              brand={brand}
              activeLogo={activeLogo}
              activeLogoLabel={activeLogoLabel}
              name={profile.name || 'נועה ל.'}
              gameMode={gameMode}
              onStart={startQuiz}
            />
          )}
          {screen === 'quiz' && q && (
            <QuizScreen
              q={q}
              qIdx={qIdx}
              total={window.BSY_QUIZ.questions.length}
              timeLeft={timeLeft}
              selected={selected}
              mapPin={mapPin}
              setMapPin={setMapPin}
              revealed={revealed}
              onSelect={handleSelectOption}
              onSubmit={handleSubmit}
              onNext={handleNext}
            />
          )}
          {screen === 'result' && (
            <ResultScreen
              brand={brand}
              score={score}
              streak={streak}
              total={window.BSY_QUIZ.questions.length}
              name={profile.name || 'נועה ל.'}
              onRestart={() => { setScore(0); setQIdx(0); setStreak(0); setScreen('join'); }}
            />
          )}
        </div>
      </div>
    </window.IOSFrame>
  );
}

function JoinScreen({ brand, activeLogo, activeLogoLabel, code, setCode, profile, setProfile, onJoin }) {
  const inputs = useRef([]);
  const allFilled = code.every(c => c !== '');
  const fields = window.BSY_QUIZ.joinFields || [];
  const requiredFilled = fields.every(f => !f.required || (profile[f.id] && profile[f.id].length > 0));

  function handleCellChange(i, v) {
    const ch = v.replace(/\D/g, '').slice(-1);
    if (ch === '' && code[i] === '') return;
    const next = [...code];
    next[i] = ch;
    setCode(next);
    if (ch && i < 5) inputs.current[i + 1]?.focus();
  }

  function handleKey(e, i) {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  function setField(id, v) { setProfile({ ...profile, [id]: v }); }

  return (
    <div className="join-screen">
      <div className="brand-block">
        <div className="brand-mark">
          <img src={activeLogo} alt={activeLogoLabel} />
        </div>
        <div className="tagline-mini">{window.BSY_QUIZ.customLogo
          ? `על שם: ${activeLogoLabel}`
          : `״${brand.sub}״`}</div>
      </div>
      <div className="join-card">
        <h2>הצטרפות לחידון</h2>
        <p>הזינו את קוד החידון ומלאו פרטים קצרים</p>
        <div className="code-input">
          {code.map((c, i) => (
            <input
              key={i}
              ref={el => inputs.current[i] = el}
              className={`code-cell ${c ? 'filled' : ''}`}
              value={c}
              onChange={(e) => handleCellChange(i, e.target.value)}
              onKeyDown={(e) => handleKey(e, i)}
              maxLength={1}
              inputMode="numeric"
              aria-label={`ספרה ${i + 1}`}
            />
          ))}
        </div>

        {fields.map(f => (
          <div className="field" key={f.id}>
            <label className="field-label" htmlFor={`fld-${f.id}`}>
              {f.label}
              {f.required && <span className="req">*</span>}
            </label>
            {f.type === 'select' ? (
              <select
                id={`fld-${f.id}`}
                className="field-input"
                value={profile[f.id] || ''}
                onChange={e => setField(f.id, e.target.value)}
              >
                <option value="" disabled>בחרו…</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                id={`fld-${f.id}`}
                className="field-input"
                type={f.type === 'tel' ? 'tel' : 'text'}
                inputMode={f.type === 'tel' ? 'tel' : 'text'}
                placeholder={f.placeholder}
                value={profile[f.id] || ''}
                onChange={e => setField(f.id, e.target.value)}
              />
            )}
            {f.help && <div className="field-help">{f.help}</div>}
          </div>
        ))}

        <button
          className="btn btn-primary btn-block"
          onClick={onJoin}
          disabled={!allFilled || !requiredFilled}
          style={{ marginTop: 8 }}
        >
          הצטרפות לחידון
          <span className="arrow">←</span>
        </button>
        <div className="divider-or">או</div>
        <div className="qr-row">
          <div className="qr-mark">
            <window.Illustrations.QrMark size={48} />
          </div>
          <div className="qr-text">
            <div className="t">סריקת קוד QR</div>
            <div className="s">המדריך מציג את הקוד על המסך</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LobbyScreen({ brand, activeLogo, activeLogoLabel, name, gameMode, onStart }) {
  const initial = (name || 'נ').trim().charAt(0);
  return (
    <div className="lobby">
      <div className="brand-mark" style={{ height: 48 }}>
        <img src={activeLogo} alt={activeLogoLabel} />
      </div>
      <div className="lobby-eyebrow">{gameMode === 'sync' ? 'ממתינים למדריך' : 'מוכנים להתחיל'}</div>
      <h2>שלום {name || 'נועה'}</h2>
      <div className="lobby-sub">{window.BSY_QUIZ.title}</div>
      <div className="lobby-avatar">{initial}</div>
      <div className="lobby-name">{name || 'נועה ל.'}</div>
      <div className="lobby-status">
        {gameMode === 'sync' ? (
          <>
            ממתינים שהמדריך יתחיל
            <span className="dots"><span /><span /><span /></span>
          </>
        ) : 'בקצב שלכם — אפשר להתחיל מתי שמוכנים'}
      </div>
      {gameMode === 'async' && (
        <button className="btn btn-primary btn-block" onClick={onStart} style={{ marginTop: 16 }}>
          להתחלת המסלול <span className="arrow">←</span>
        </button>
      )}
      {gameMode === 'sync' && (
        <button className="btn btn-ghost btn-block" onClick={onStart} style={{ marginTop: 8 }}>
          הדגמה — דלגו לשאלה ראשונה
        </button>
      )}
      <div className="lobby-meta">
        <div className="row">
          <span className="k">תחנות</span>
          <span className="v">{window.BSY_QUIZ.questions.length}</span>
        </div>
        <div className="row">
          <span className="k">זמן משוער</span>
          <span className="v">8 דק׳</span>
        </div>
      </div>
    </div>
  );
}

function QuizScreen({ q, qIdx, total, timeLeft, selected, mapPin, setMapPin, revealed, onSelect, onSubmit, onNext }) {
  const correctSet = new Set(q.correct);
  let isCorrectAnswer;
  if (q.type === 'map') {
    if (mapPin) {
      const dx = mapPin.x - q.target.x;
      const dy = mapPin.y - q.target.y;
      isCorrectAnswer = revealed && Math.sqrt(dx*dx + dy*dy) <= q.tolerance;
    } else {
      isCorrectAnswer = false;
    }
  } else {
    isCorrectAnswer = revealed && correctSet.size === selected.length && selected.every(s => correctSet.has(s));
  }
  const progress = ((qIdx + 1) / total) * 100;
  const isWarn = timeLeft <= 5;

  const optionLetter = (i) => ['א', 'ב', 'ג', 'ד', 'ה'][i];

  function handleMapTap(e) {
    if (revealed) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setMapPin({ x, y });
  }

  return (
    <div className="quiz">
      <div className="quiz-top">
        <div className="quiz-top-row">
          <div className="q-counter">תחנה <b>{qIdx + 1}</b> מתוך {total}</div>
          <div className={`q-timer ${isWarn ? 'warn' : ''}`}>
            {isWarn && <span className="pulse" />}
            {String(Math.max(0, timeLeft)).padStart(2, '0')}
          </div>
        </div>
        <div className="q-progress"><div style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="quiz-body">
        <div className="q-prompt-card">
          <div className="q-eyebrow">
            {q.typeLabel}
            {q.type === 'multi' && ' · ניתן לסמן יותר מאחת'}
            {q.type === 'map' && ' · הקישו על המפה כדי לסמן'}
          </div>
          {q.image && (
            <div className="q-image">
              <window.Illustrations.MachpelaImg />
            </div>
          )}
          <h3 className="q-prompt">{q.prompt}</h3>
        </div>

        {q.type === 'map' ? (
          <div className="q-map-wrap">
            <div className={`q-map ${revealed ? 'revealed' : ''}`} onClick={handleMapTap}>
              <window.Illustrations.JudeaMap />
              {/* user pin */}
              {mapPin && (
                <span
                  className={`pin pin-mine ${revealed ? (isCorrectAnswer ? 'good' : 'bad') : ''}`}
                  style={{ left: `${mapPin.x}%`, top: `${mapPin.y}%` }}
                  aria-label="הסימון שלך"
                />
              )}
              {/* correct target — only show after reveal */}
              {revealed && (
                <>
                  <span
                    className="target-ring"
                    style={{
                      left: `${q.target.x}%`,
                      top: `${q.target.y}%`,
                      width: `${q.tolerance * 2}%`,
                      paddingBottom: `${q.tolerance * 2}%`,
                    }}
                  />
                  <span
                    className="pin pin-correct"
                    style={{ left: `${q.target.x}%`, top: `${q.target.y}%` }}
                    aria-label={q.label}
                  >
                    <span className="lbl">{q.label}</span>
                  </span>
                </>
              )}
            </div>
            <div className="q-map-help">
              {!revealed
                ? mapPin
                  ? 'אפשר עוד להזיז — הקישו על מקום אחר.'
                  : 'הקישו על המפה במקום שאתם חושבים שמיקום היעד.'
                : (isCorrectAnswer ? 'בול בפנים!' : `המרחק מהיעד: ~${Math.round(Math.sqrt((mapPin.x - q.target.x)**2 + (mapPin.y - q.target.y)**2) * 4)} ק״מ`)}
            </div>
          </div>
        ) : (
          <div className="q-options">
            {q.options.map((o, i) => {
              const isSel = selected.includes(o.id);
              const isCorrect = correctSet.has(o.id);
              let cls = 'q-option';
              if (revealed) {
                if (isCorrect) cls += ' correct';
                else if (isSel) cls += ' wrong';
                else cls += ' dim';
              } else if (isSel) cls += ' selected';
              return (
                <button key={o.id} className={cls} onClick={() => onSelect(o.id)}>
                  <span className="marker">{optionLetter(i)}</span>
                  <span className="label">{o.text}</span>
                  {revealed && isCorrect && <span className="check">✓</span>}
                  {revealed && isSel && !isCorrect && <span className="check">✕</span>}
                </button>
              );
            })}
          </div>
        )}

        {revealed && (
          <div className={`q-feedback ${isCorrectAnswer ? 'correct' : 'wrong'}`}>
            <span className="ico">{isCorrectAnswer ? '✓' : '✕'}</span>
            <div>
              <div className="t">{isCorrectAnswer ? 'מצוין!' : 'לא מדויק'}</div>
              <p>{q.explanation}</p>
            </div>
          </div>
        )}
      </div>
      <div className="quiz-footer">
        {!revealed ? (
          <button
            className="btn btn-primary btn-block"
            onClick={onSubmit}
            disabled={q.type === 'map' ? !mapPin : selected.length === 0}
          >
            שליחת תשובה
          </button>
        ) : (
          <button className="btn btn-accent btn-block" onClick={onNext}>
            {qIdx + 1 === total ? 'סיום וצפייה בתוצאה' : 'לתחנה הבאה'} <span className="arrow">←</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ResultScreen({ brand, score, streak, total, name, onRestart }) {
  const max = total * 1500;
  const pct = Math.min(100, Math.round((score / max) * 100));
  const C = 2 * Math.PI * 70;
  const dash = (pct / 100) * C;
  const me = name || 'נועה ל.';

  // dynamic leaderboard with player slotted in
  const myScore = score;
  const others = window.BSY_PLAYERS.filter(p => p.name !== me).slice(0, 7);
  const board = [...others, { id: 99, name: me, score: myScore, av: me.charAt(0) }]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const myRank = [...others, { id: 99, name: me, score: myScore, av: me.charAt(0) }]
    .sort((a, b) => b.score - a.score)
    .findIndex(p => p.id === 99) + 1;

  return (
    <div className="result">
      <div style={{ marginBottom: 4 }}><window.Illustrations.Spark /></div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bsy-green-forest)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        סיימתם את המסלול
      </div>
      <h2>כל הכבוד</h2>
      <div className="result-sub">צידה לדרך — סיכום המסע שלכם</div>
      <div className="score-circle">
        <svg viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="70" stroke="#E5DFD2" strokeWidth="10" fill="none" />
          <circle cx="80" cy="80" r="70" stroke="#A0C040" strokeWidth="10" fill="none"
            strokeDasharray={`${dash} ${C}`} strokeLinecap="round" />
        </svg>
        <div className="score-center">
          <div className="num">{score.toLocaleString('he-IL')}</div>
          <div className="of">נקודות מתוך {max.toLocaleString('he-IL')}</div>
        </div>
      </div>
      <div className="result-stats">
        <div className="result-stat">
          <div className="v">#{myRank}</div>
          <div className="k">דירוג</div>
        </div>
        <div className="result-stat">
          <div className="v">{streak}</div>
          <div className="k">רצף</div>
        </div>
        <div className="result-stat">
          <div className="v">{pct}%</div>
          <div className="k">דיוק</div>
        </div>
      </div>
      <div className="leaderboard">
        <h3>לוח תוצאות</h3>
        {board.map((p, i) => (
          <div key={p.id} className={`row ${p.id === 99 ? 'me' : ''}`}>
            <div className="rank">{i + 1}</div>
            <div className="av">{p.av}</div>
            <div className="nm">{p.name}{p.id === 99 ? ' (אתם)' : ''}</div>
            <div className="pts">{p.score.toLocaleString('he-IL')}</div>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-block" onClick={onRestart}>
        חידון נוסף
      </button>
    </div>
  );
}

window.ParticipantSurface = ParticipantSurface;

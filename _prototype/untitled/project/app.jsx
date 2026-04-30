// Main app — composes the workbench with all 3 surfaces.

const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "brand": "yehuda",
  "gameMode": "sync",
  "participantScreen": "quiz",
  "hostQuestion": 0,
  "hostView": "desktop",
  "adminView": "desktop",
  "customLogoOn": false
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  const brand = window.BSY_BRANDS[tweaks.brand] || window.BSY_BRANDS.yehuda;

  // apply primary color to root
  useEffectApp(() => {
    document.documentElement.style.setProperty('--bsy-active-primary', brand.primary);
  }, [brand]);

  // Apply custom-logo override on the live quiz object so all surfaces see it.
  useEffectApp(() => {
    if (tweaks.customLogoOn) {
      window.BSY_QUIZ.customLogo = 'assets/logos/logo_haganat.png';
    } else {
      window.BSY_QUIZ.customLogo = null;
    }
  }, [tweaks.customLogoOn]);

  const screenLabels = {
    join: 'הצטרפות',
    lobby: 'חדר המתנה',
    quiz: 'מהלך החידון',
    result: 'תוצאות',
  };

  return (
    <div className="stage" data-screen-label={`Quiz Platform — ${brand.name}`}>
      <div className="stage-header">
        <span className="eyebrow">Quiz Platform · MVP Prototype</span>
        <h1>{brand.name}</h1>
        <p>פלטפורמת חידונים White-label למדריכים ולחיילים — שלוש משטחי שימוש בתצוגה אחת</p>
      </div>

      <div className="stage-grid">
        {/* Surface 1 — participant mobile */}
        <div className="surface s-phone" data-screen-label="01 Participant Mobile">
          <div className="surface-label">
            <span className="num">1</span>
            <span className="role">חוויית משתתף</span>
            <span className="who">חייל / חניך · מובייל</span>
          </div>
          <window.ParticipantSurface
            brand={brand}
            gameMode={tweaks.gameMode}
            initialScreen={tweaks.participantScreen}
          />
          <div className="surface-mini-meta">
            כרגע מוצג: <b style={{ color: 'rgba(250,247,240,0.85)' }}>{screenLabels[tweaks.participantScreen]}</b>
            <br />
            ניתן להתקדם בלוח עצמו — או לדלג דרך פאנל ה־Tweaks.
          </div>
        </div>

        {/* Surface 2 — host live view */}
        <div className="surface s-host" data-screen-label="02 Host Live View">
          <div className="surface-label">
            <span className="num">2</span>
            <span className="role">תצוגת מדריך</span>
            <span className="who">פרויקטור · {tweaks.hostView === 'mobile' ? 'מובייל' : 'חידון חי'}</span>
          </div>
          {tweaks.hostView === 'mobile'
            ? <window.HostMobileSurface brand={brand} qIdx={tweaks.hostQuestion} />
            : <window.HostSurface brand={brand} qIdx={tweaks.hostQuestion} />}
          <div className="surface-mini-meta">
            {tweaks.hostView === 'mobile'
              ? 'מדריך בשטח — משתמש בטלפון ללא מסך מקרן. טוב למלא העדרים במסלול.'
              : 'מסך מקרן בכיתה — סטטיסטיקה חיה, טיימר וניהול קצב.'}
          </div>
        </div>

        {/* Surface 3 — admin */}
        <div className="surface s-admin" data-screen-label="03 Admin / Creator">
          <div className="surface-label">
            <span className="num">3</span>
            <span className="role">ממשק ניהול</span>
            <span className="who">פרויקטור · {tweaks.adminView === 'mobile' ? 'מובייל' : 'דסקטופ'}</span>
          </div>
          {tweaks.adminView === 'mobile'
            ? <window.AdminMobileSurface brand={brand} />
            : <window.AdminSurface brand={brand} />}
          <div className="surface-mini-meta">
            עורך תחנות, סוגי שאלות, וזמנים. שמירה אוטומטית. עובד גם מהמובייל בשטח.
          </div>
        </div>
      </div>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="מותג (White-label)">
          <window.TweakRadio
            label="הצגת מותג"
            value={tweaks.brand}
            options={[
              { value: 'yehuda', label: 'יהודה' },
              { value: 'haari', label: 'הארי' },
              { value: 'tzafon', label: 'הצפון' },
              { value: 'etzion', label: 'עציון' },
            ]}
            onChange={v => setTweak('brand', v)}
          />
          <window.TweakToggle
            label="לוגו ייעודי לחידון"
            value={tweaks.customLogoOn}
            onChange={v => setTweak('customLogoOn', v)}
          />
        </window.TweakSection>

        <window.TweakSection label="הניווט במסך המשתתף">
          <window.TweakSelect
            label="מסך מוצג"
            value={tweaks.participantScreen}
            options={[
              { value: 'join', label: '1 · הצטרפות בקוד' },
              { value: 'lobby', label: '2 · חדר המתנה' },
              { value: 'quiz', label: '3 · מהלך החידון' },
              { value: 'result', label: '4 · תוצאות' },
            ]}
            onChange={v => setTweak('participantScreen', v)}
          />
          <window.TweakRadio
            label="מצב משחק"
            value={tweaks.gameMode}
            options={[
              { value: 'sync', label: 'סינכרוני' },
              { value: 'async', label: 'אסינכרוני' },
            ]}
            onChange={v => setTweak('gameMode', v)}
          />
        </window.TweakSection>

        <window.TweakSection label="תצוגת מדריך — חי">
          <window.TweakRadio
            label="פלטפורמה"
            value={tweaks.hostView}
            options={[
              { value: 'desktop', label: 'מסך מקרן' },
              { value: 'mobile', label: 'מובייל' },
            ]}
            onChange={v => setTweak('hostView', v)}
          />
          <window.TweakSelect
            label="שאלה נוכחית"
            value={String(tweaks.hostQuestion)}
            options={window.BSY_QUIZ.questions.map((q, i) => ({
              value: String(i),
              label: `${i + 1} · ${q.prompt.slice(0, 36)}${q.prompt.length > 36 ? '…' : ''}`
            }))}
            onChange={v => setTweak('hostQuestion', +v)}
          />
        </window.TweakSection>

        <window.TweakSection label="ממשק הניהול">
          <window.TweakRadio
            label="פלטפורמה"
            value={tweaks.adminView}
            options={[
              { value: 'desktop', label: 'דסקטופ' },
              { value: 'mobile', label: 'מובייל' },
            ]}
            onChange={v => setTweak('adminView', v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

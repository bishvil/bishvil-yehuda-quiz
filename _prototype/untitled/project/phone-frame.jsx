// Simple device frame wrapper — fixed size, content fills the screen area.
// We don't use the full IOSDevice from ios-frame.jsx because we need full-bleed mobile content.

function IOSFrame({ children, width = 390, height = 800, dark = false, statusBarColor = 'dark', homeBar = true }) {
  const isDark = dark || statusBarColor === 'light';
  return (
    <div style={{
      width, height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: '#000',
      boxShadow: '0 40px 90px rgba(0,0,0,0.5), 0 0 0 12px #1a1612, 0 0 0 13px #2a2620',
      fontFamily: '-apple-system, system-ui, sans-serif',
    }}>
      {/* dynamic island */}
      <div style={{
        position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
        width: 116, height: 34, borderRadius: 22, background: '#000', zIndex: 50,
      }} />
      {/* status bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
        height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px 0',
        color: isDark ? '#000' : '#fff',
        fontFamily: '-apple-system, "SF Pro", system-ui',
        fontWeight: 600,
        fontSize: 15,
        pointerEvents: 'none',
      }}>
        <span>9:41</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <svg width="16" height="11" viewBox="0 0 19 12">
            <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill="currentColor"/>
            <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill="currentColor"/>
            <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill="currentColor"/>
            <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill="currentColor"/>
          </svg>
          <svg width="14" height="10" viewBox="0 0 17 12">
            <path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill="currentColor"/>
            <path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill="currentColor"/>
            <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor"/>
          </svg>
          <svg width="22" height="11" viewBox="0 0 27 13">
            <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" strokeOpacity="0.4" fill="none"/>
            <rect x="2" y="2" width="18" height="9" rx="2" fill="currentColor"/>
          </svg>
        </span>
      </div>
      {/* screen content */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {children}
      </div>
      {/* home indicator */}
      {homeBar && (
        <div style={{
          position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)',
          width: 130, height: 5, borderRadius: 99,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 60,
        }} />
      )}
    </div>
  );
}

window.IOSFrame = IOSFrame;

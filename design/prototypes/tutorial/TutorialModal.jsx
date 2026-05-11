// TutorialModal.jsx
//
// Full-screen carousel modal for the Orbit tutorial.
// Renders inside IOSDevice (position: absolute, inset: 0) so it covers the
// device frame exactly. Background is opaque so the device content is hidden.
//
// Props:
//   open      — bool
//   onClose   — fn
//   mode      — 'first-run' | 'replay'
//   tone      — 'playful' | 'crisp'
//   density   — 'cozy' | 'compact'

const TutorialModal = ({ open, onClose, mode = 'first-run', tone = 'playful', density = 'cozy' }) => {
  const c = window.orbitColors;
  const steps = window.TUTORIAL_STEPS;
  const total = steps.length;

  const [idx, setIdx] = React.useState(0);
  const [drag, setDrag] = React.useState(0);
  const dragStart = React.useRef(null);

  React.useEffect(() => { if (open) { setIdx(0); setDrag(0); } }, [open]);

  const isLast = idx === total - 1;
  const step = steps[idx];

  const advance = React.useCallback(() => {
    if (isLast) onClose();
    else setIdx(i => i + 1);
  }, [isLast, onClose]);

  const back = () => setIdx(i => Math.max(0, i - 1));

  // Swipe-down-to-dismiss on the grabber strip only
  const grabHandlers = {
    onPointerDown: (e) => {
      dragStart.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      if (dragStart.current == null) return;
      const dy = e.clientY - dragStart.current;
      if (dy > 0) setDrag(dy);
    },
    onPointerUp: (e) => {
      if (drag > 100) onClose();
      setDrag(0);
      dragStart.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    },
  };

  const padX    = density === 'compact' ? 22 : 26;
  const gapY    = density === 'compact' ? 14 : 20;
  const titleSz = density === 'compact' ? 26 : 29;
  const bodySz  = density === 'compact' ? 13 : 14;

  const title = tone === 'playful' ? step.titlePlayful : step.titleCrisp;
  const body  = tone === 'playful' ? step.bodyPlayful  : step.bodyCrisp;

  const ctaLabel = isLast
    ? (mode === 'first-run' ? (tone === 'playful' ? 'Form your first orbit' : 'Create your first group') : 'Done')
    : (idx === 0 ? "Let's go" : 'Next');

  if (!open) return null;

  const opacity = Math.max(0, 1 - drag / 350);

  return (
    <>
      <style>{`
        @keyframes orbit-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(107,95,212,0.55); }
          50%       { box-shadow: 0 0 0 10px rgba(107,95,212,0); }
        }
        @keyframes orbit-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: `rgba(0,0,0,${0.45 * opacity})`,
        pointerEvents: 'none',
      }} />

      {/* Sheet */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 101,
        background: c.bg,
        display: 'flex', flexDirection: 'column',
        transform: `translateY(${drag}px)`,
        transition: dragStart.current == null ? 'transform 0.22s ease' : 'none',
        fontFamily: 'Roboto, sans-serif', color: c.text,
      }}>

        {/* ── Grabber + header ─────────────────────────────────────────────── */}
        <div
          {...grabHandlers}
          style={{
            paddingTop: 50, paddingLeft: padX, paddingRight: padX, paddingBottom: 6,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            touchAction: 'none', cursor: 'grab', position: 'relative',
          }}
        >
          {/* Drag handle */}
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            width: 34, height: 4, borderRadius: 2,
            background: 'rgba(230,221,200,0.2)',
          }} />
          <div style={{
            fontFamily: 'Roboto Mono, monospace', fontSize: 11, fontWeight: 500,
            color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {step.num != null ? `0${step.num} / 08` : 'intro'}
          </div>
          <div
            onClick={onClose}
            style={{
              fontFamily: 'Roboto Mono, monospace', fontSize: 13, fontWeight: 600,
              color: c.textSecondary, cursor: 'pointer',
              padding: '6px 10px', margin: '-6px -10px',
            }}
          >Skip</div>
        </div>

        {/* ── Step content ─────────────────────────────────────────────────── */}
        <div
          key={step.id}
          style={{
            flex: 1, padding: `${gapY}px ${padX}px 0`,
            display: 'flex', flexDirection: 'column',
            animation: 'orbit-fade-up 0.28s ease both',
            overflow: 'hidden',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14, marginBottom: gapY,
            background: 'rgba(107,95,212,0.16)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ion-icon name={step.icon} style={{ color: c.primary, fontSize: 26 }} />
          </div>

          <h1 style={{
            fontSize: titleSz, lineHeight: 1.1, fontWeight: 700,
            color: c.text, letterSpacing: '-0.5px',
            margin: 0, marginBottom: 10,
          }}>{title}</h1>

          <p style={{
            fontSize: bodySz, lineHeight: 1.55,
            color: c.textSecondary,
            margin: 0, marginBottom: gapY,
          }}>{body}</p>

          {/* Demo zone */}
          <div style={{
            marginTop: 'auto', marginBottom: gapY,
            display: 'flex', justifyContent: 'center',
            minHeight: 150,
          }}>
            <div style={{ width: '100%', maxWidth: 300 }}>
              <window.TutorialDemo kind={step.demo} onTap={advance} />
            </div>
          </div>
        </div>

        {/* ── Footer: dots + buttons ───────────────────────────────────────── */}
        <div style={{
          padding: `10px ${padX}px ${density === 'compact' ? 26 : 34}px`,
          borderTop: `0.5px solid ${c.borderLight}`,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Dot indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            {steps.map((_, i) => (
              <div
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  width: i === idx ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === idx ? c.primary : 'rgba(230,221,200,0.2)',
                  transition: 'width 0.2s ease, background 0.2s ease',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          {/* Back / Next */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={back}
              style={{
                padding: '11px 14px', borderRadius: 999,
                fontFamily: 'Roboto Mono, monospace', fontSize: 13, fontWeight: 600,
                color: idx === 0 ? 'rgba(230,221,200,0.2)' : c.textSecondary,
                cursor: idx === 0 ? 'default' : 'pointer',
                userSelect: 'none',
              }}
            >← Back</div>
            <div style={{ flex: 1 }} />
            <div
              onClick={advance}
              style={{
                background: c.primary, color: '#fff',
                padding: isLast && mode === 'first-run' ? '13px 20px' : '13px 28px',
                borderRadius: 999, fontSize: 14, fontWeight: 700,
                boxShadow: '0 6px 18px rgba(107,95,212,0.4)',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              {ctaLabel}
              {isLast && mode === 'first-run' && (
                <ion-icon name="arrow-forward" style={{ color: '#fff', fontSize: 14 }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

window.TutorialModal = TutorialModal;

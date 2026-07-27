// TutorialDemos.jsx
//
// Faithful mini-mocks of the actual Orbit app screens, one per tutorial step.
// Each demo has one pulsing affordance that calls onTap() to advance the step.
//
// Layout mirrors the real app exactly:
//   - HomeScreen: filter pills (All / Daily / Weekly / Invited) + masonry bento grid + FAB
//   - CreateGroupScreen: Group Name card + Frequency segment + Duration picker + Create button
//   - GroupDetailScreen: header card + Start Call Now button + Members section
//
// Colors/palettes come from window.orbitColors and window.CARD_PALETTES (tokens.jsx).
// The orbit-pulse keyframe is injected by TutorialModal.jsx.

const TutorialDemo = ({ kind, onTap }) => {
  const c = window.orbitColors;
  const palettes = window.CARD_PALETTES;

  // Shared pulse ring animation (orbit-pulse defined in TutorialModal style tag)
  const pulse = {
    animation: 'orbit-pulse 1.6s ease-in-out infinite',
    cursor: 'pointer',
  };

  // ── Sub-components (close over c / palettes / onTap) ──────────────────────

  // Filter pill — matches HomeScreen filterPill / filterPillActive styles
  const FilterPill = ({ label, active, badge, onClick }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 11px', borderRadius: 999,
        background: active ? c.text : c.bg,
        fontFamily: 'Roboto, sans-serif', fontSize: 12, fontWeight: 600,
        color: active ? c.bg : c.textSecondary,
        userSelect: 'none',
        ...(onClick ? pulse : {}),
      }}
    >
      {label}
      {badge && (
        <div style={{
          background: active ? 'rgba(255,255,255,0.25)' : c.primary,
          color: '#fff', borderRadius: 999,
          minWidth: 14, height: 14, padding: '0 3px',
          fontSize: 8, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</div>
      )}
    </div>
  );

  // Bento card — matches HomeScreen BentoCard
  const BentoCard = ({ name, cadence, palette, height, tappable }) => (
    <div
      onClick={tappable ? onTap : undefined}
      style={{
        background: palette.bg, color: palette.text,
        borderRadius: 12, padding: '8px 10px', height,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        fontFamily: 'Roboto, sans-serif',
        ...(tappable ? pulse : {}),
      }}
    >
      <div style={{
        alignSelf: 'flex-start',
        background: 'rgba(0,0,0,0.10)',
        padding: '2px 7px', borderRadius: 999,
        fontSize: 9, fontWeight: 600,
      }}>{cadence}</div>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: '15px' }}>{name}</div>
    </div>
  );

  // Filter row — used in both 'create' and 'home' demos
  const FilterRow = ({ activeTab }) => (
    <div style={{
      display: 'flex', gap: 5, padding: '8px 8px 7px',
      background: c.surface, borderBottom: `0.5px solid ${c.border}`,
    }}>
      {['All', 'Daily', 'Weekly', 'Invited'].map(tab => (
        <FilterPill key={tab} label={tab} active={activeTab === tab} />
      ))}
    </div>
  );

  // Member row — matches GroupDetailScreen memberRow
  const MemberRow = ({ username, isOwner, isLast, pulseBadge }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
      borderBottom: isLast ? 'none' : `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: isOwner ? c.primary : c.primaryLight,
        color: isOwner ? '#fff' : c.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, fontFamily: 'Roboto, sans-serif',
      }}>
        {username.charAt(0).toUpperCase()}
      </div>
      <div style={{
        flex: 1, fontSize: 12, fontWeight: 500,
        color: c.text, fontFamily: 'Roboto, sans-serif',
      }}>{username}</div>
      {isOwner && (
        <div
          onClick={pulseBadge ? onTap : undefined}
          style={{
            background: c.primaryLighter, color: c.primary,
            padding: '2px 8px', borderRadius: 999,
            fontSize: 9, fontWeight: 600, fontFamily: 'Roboto, sans-serif',
            ...(pulseBadge ? pulse : {}),
          }}
        >Owner</div>
      )}
    </div>
  );

  // ── Demos ─────────────────────────────────────────────────────────────────

  // Welcome — orbit wordmark + concentric rings
  if (kind === 'welcome') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '4px 0 8px',
      }}>
        <div style={{
          fontFamily: 'Chango, cursive', fontSize: 52, color: c.text, lineHeight: 1,
        }}>orbit</div>
        <div style={{ position: 'relative', width: 130, height: 90 }}>
          {[125, 80, 40].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              width: s, height: s, borderRadius: '50%',
              border: `1.5px solid ${i === 2 ? c.primary : 'rgba(230,221,200,0.12)'}`,
              background: i === 2 ? 'rgba(107,95,212,0.10)' : 'transparent',
            }} />
          ))}
          {/* Orbiting dot on outer ring */}
          <div style={{
            position: 'absolute',
            top: 'calc(50% - 48px)', left: '50%',
            transform: 'translateX(-50%)',
            width: 9, height: 9, borderRadius: '50%',
            background: c.primary,
            boxShadow: `0 0 10px ${c.primary}`,
          }} />
          {/* Centre dot */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: c.primary,
          }} />
        </div>
        <div style={{
          fontFamily: 'Roboto Mono, monospace', fontSize: 10, fontWeight: 500,
          color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6,
        }}>video calls that just happen</div>
      </div>
    );
  }

  // Create (step 1) — HomeScreen empty state with pulsing FAB
  if (kind === 'create') {
    return (
      <div style={{
        background: c.bg, borderRadius: 14, overflow: 'hidden',
        height: 205, position: 'relative', display: 'flex', flexDirection: 'column',
      }}>
        <FilterRow activeTab="All" />
        {/* Empty state */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <ion-icon name="ellipse-outline" style={{ color: c.textTertiary, fontSize: 32 }} />
          <div style={{
            fontSize: 13, fontWeight: 700, color: c.textSecondary,
            fontFamily: 'Roboto, sans-serif',
          }}>No groups yet</div>
          <div style={{
            fontSize: 11, color: c.textTertiary, fontFamily: 'Roboto, sans-serif',
          }}>Tap + to create your first group</div>
        </div>
        {/* FAB — mirrors HomeScreen fab */}
        <div
          onClick={onTap}
          style={{
            position: 'absolute', bottom: 14, right: 12,
            width: 46, height: 46, borderRadius: 999,
            background: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(107,95,212,0.5)',
            ...pulse,
          }}
        >
          <ion-icon name="add" style={{ color: '#fff', fontSize: 24 }} />
        </div>
      </div>
    );
  }

  // Configure (step 2) — CreateGroupScreen form
  if (kind === 'configure') {
    const card = {
      background: c.surface, borderRadius: 12, padding: '10px 12px',
      boxSizing: 'border-box',
    };
    const fieldLabel = {
      fontSize: 9, fontFamily: 'Roboto Mono, monospace', fontWeight: 600,
      color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 6,
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Group Name */}
        <div style={card}>
          <div style={fieldLabel}>Group Name</div>
          <div style={{
            background: c.bg, borderRadius: 8, padding: '7px 10px',
            fontSize: 12, color: c.text, fontFamily: 'Roboto, sans-serif',
          }}>Saturday Crew</div>
        </div>
        {/* Call Frequency */}
        <div style={card}>
          <div style={fieldLabel}>Call Frequency</div>
          <div style={{ display: 'flex', background: c.bg, borderRadius: 8, padding: 2 }}>
            {['Daily', 'Weekly'].map((opt, i) => (
              <div key={opt} style={{
                flex: 1, padding: '6px 0', textAlign: 'center', borderRadius: 7,
                fontSize: 11, fontWeight: 600, fontFamily: 'Roboto, sans-serif',
                background: i === 0 ? c.surface : 'transparent',
                color: i === 0 ? c.primary : c.textSecondary,
              }}>{opt}</div>
            ))}
          </div>
        </div>
        {/* Call Duration — mirrors NumberPicker */}
        <div style={card}>
          <div style={fieldLabel}>Call Duration</div>
          <div style={{
            display: 'flex', background: c.bg, borderRadius: 8,
            padding: '7px 12px', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: c.textSecondary, fontSize: 18, fontFamily: 'Roboto, sans-serif' }}>−</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: 'Roboto Mono, monospace' }}>30 min</span>
            <span style={{ color: c.primary, fontSize: 18, fontFamily: 'Roboto, sans-serif' }}>+</span>
          </div>
        </div>
        {/* Create Group button (pulsing) */}
        <div
          onClick={onTap}
          style={{
            background: c.primary, borderRadius: 999, padding: '11px 0',
            textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fff',
            fontFamily: 'Roboto, sans-serif',
            boxShadow: '0 8px 20px rgba(107,95,212,0.4)',
            ...pulse,
          }}
        >Create Group</div>
      </div>
    );
  }

  // Home (step 3) — HomeScreen with group cards, tap a card to advance
  if (kind === 'home') {
    const cards = [
      { name: 'Saturday Crew',    cadence: 'Daily',   p: palettes[0], h: 72, tappable: true },
      { name: 'Mom + Dad',        cadence: 'Daily',   p: palettes[2], h: 58 },
      { name: 'College Friends',  cadence: '3×/wk',  p: palettes[1], h: 78 },
      { name: 'Book Club',        cadence: 'Weekly',  p: palettes[3], h: 65 },
    ];
    const left  = [cards[0], cards[2]];
    const right = [cards[1], cards[3]];
    return (
      <div style={{ background: c.bg, borderRadius: 14, overflow: 'hidden' }}>
        <FilterRow activeTab="All" />
        <div style={{ display: 'flex', gap: 6, padding: 8 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {left.map((card, i) => (
              <BentoCard key={i} {...card} palette={card.p} height={card.h} />
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {right.map((card, i) => (
              <BentoCard key={i} {...card} palette={card.p} height={card.h} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Invite (step 4) — GroupDetail Members section with pulsing "+ Invite" button
  if (kind === 'invite') {
    return (
      <div style={{
        background: c.surface, borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', borderBottom: `0.5px solid ${c.border}`,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: c.text, fontFamily: 'Roboto, sans-serif',
          }}>
            Members<span style={{ color: c.textTertiary }}> 3</span>
          </div>
          <div
            onClick={onTap}
            style={{
              background: c.primaryLight, color: c.primary,
              padding: '3px 10px', borderRadius: 999,
              fontSize: 11, fontWeight: 700, fontFamily: 'Roboto, sans-serif',
              ...pulse,
            }}
          >+ Invite</div>
        </div>
        <MemberRow username="myles_h" isOwner={true}  isLast={false} />
        <MemberRow username="jordan"  isOwner={false} isLast={false} />
        <MemberRow username="ava_lee" isOwner={false} isLast={true}  />
      </div>
    );
  }

  // Invited (step 5) — HomeScreen with pulsing Invited tab + pending card
  if (kind === 'invited') {
    const inv = palettes[3]; // slate blue — for Book Club
    return (
      <div>
        {/* Filter row with Invited pulsing */}
        <div style={{
          display: 'flex', gap: 5, padding: '0 0 10px',
          background: c.bg,
        }}>
          <FilterPill label="All" />
          <FilterPill label="Daily" />
          <FilterPill label="Weekly" />
          <FilterPill label="Invited" badge="1" onClick={onTap} />
        </div>
        {/* Pending card — matches HomeScreen PendingCard */}
        <div style={{
          background: inv.bg + 'AA',
          border: `1.5px dashed ${inv.text}55`,
          borderRadius: 12, padding: '10px 12px',
          color: inv.text, fontFamily: 'Roboto, sans-serif',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10,
          }}>
            <span style={{ background: 'rgba(0,0,0,0.08)', padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 600 }}>Weekly</span>
            <span style={{ background: 'rgba(0,0,0,0.08)', padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 600, opacity: 0.8 }}>Pending</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Book Club</div>
          <div style={{ fontSize: 10, color: inv.text, opacity: 0.6, marginBottom: 10 }}>3 members</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{
              flex: 1, background: inv.text, color: '#fff',
              padding: '6px 0', textAlign: 'center', borderRadius: 999,
              fontSize: 11, fontWeight: 700,
            }}>Accept</div>
            <div style={{
              padding: '6px 14px', borderRadius: 999,
              fontSize: 11, fontWeight: 700,
              border: `1px solid ${inv.text}44`,
            }}>Decline</div>
          </div>
        </div>
      </div>
    );
  }

  // Random call (step 6) — iOS-style push notification banner
  if (kind === 'random') {
    return (
      <div
        onClick={onTap}
        style={{
          background: 'rgba(20,20,42,0.96)',
          backdropFilter: 'blur(20px)',
          border: `0.5px solid ${c.border}`,
          borderRadius: 16, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          ...pulse,
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: c.primary, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ion-icon name="call" style={{ color: '#fff', fontSize: 18 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: c.text,
            fontFamily: 'Roboto, sans-serif', marginBottom: 2,
          }}>orbit</div>
          <div style={{
            fontSize: 11, color: c.textSecondary,
            fontFamily: 'Roboto, sans-serif',
          }}>Saturday Crew is calling — drop in?</div>
        </div>
        <div style={{
          fontSize: 9, color: c.textTertiary,
          fontFamily: 'Roboto Mono, monospace', flexShrink: 0,
        }}>now</div>
      </div>
    );
  }

  // Spontaneous (step 7) — GroupDetail with pulsing Start Call Now button
  if (kind === 'spontaneous') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Mini group header — mirrors GroupDetailScreen headerCard */}
        <div style={{
          background: c.surface, borderRadius: 12, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'Roboto, sans-serif',
          }}>S</div>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: c.text,
              fontFamily: 'Roboto, sans-serif', marginBottom: 4,
            }}>Saturday Crew</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {['Daily', '30 min'].map(label => (
                <div key={label} style={{
                  background: c.primaryLighter, color: c.primary,
                  padding: '1px 7px', borderRadius: 999,
                  fontSize: 9, fontWeight: 600, fontFamily: 'Roboto, sans-serif',
                }}>{label}</div>
              ))}
            </div>
          </div>
        </div>
        {/* Start Call Now — mirrors GroupDetailScreen startCallButton */}
        <div
          onClick={onTap}
          style={{
            background: c.primary, borderRadius: 12,
            padding: '14px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 14, fontWeight: 700, color: '#fff',
            fontFamily: 'Roboto, sans-serif',
            boxShadow: '0 8px 20px rgba(107,95,212,0.45)',
            ...pulse,
          }}
        >
          <ion-icon name="call" style={{ color: '#fff', fontSize: 16 }} />
          Start Call Now
        </div>
      </div>
    );
  }

  // Owner (step 8) — GroupDetail Members section with pulsing Owner badge
  if (kind === 'owner') {
    return (
      <div style={{ background: c.surface, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 11, fontFamily: 'Roboto Mono, monospace', fontWeight: 600,
          color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5,
          borderBottom: `0.5px solid ${c.border}`,
        }}>Members</div>
        <MemberRow username="myles_h" isOwner={true}  pulseBadge isLast={false} />
        <MemberRow username="jordan"  isOwner={false} isLast={false} />
        <MemberRow username="ava_lee" isOwner={false} isLast={true}  />
      </div>
    );
  }

  return null;
};

window.TutorialDemo = TutorialDemo;

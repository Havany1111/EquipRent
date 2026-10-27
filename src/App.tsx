import { useMemo, useState, type ReactNode } from 'react'

type IconName =
  | 'box'
  | 'calendar'
  | 'clock'
  | 'grid'
  | 'heart'
  | 'home'
  | 'search'
  | 'settings'
  | 'sliders'
  | 'star'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    box: <><path d="m21 8-9 5-9-5 9-5 9 5Z" /><path d="m3 8 9 5v9l-9-5V8ZM21 8l-9 5v9l9-5V8Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
    star: <path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.7l6.2-.9L12 3Z" />,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const equipment = [
  { id: 1, name: 'CAT 320 Excavator', category: 'Heavy machinery', rate: 485, rating: 4.9, available: true, image: 'https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&w=900&q=85' },
  { id: 2, name: 'Compact Track Loader', category: 'Earthmoving', rate: 295, rating: 4.8, available: true, image: 'https://images.unsplash.com/photo-1583024011792-b165975b52f5?auto=format&fit=crop&w=900&q=85' },
  { id: 3, name: 'Kubota Mini Excavator', category: 'Heavy machinery', rate: 340, rating: 4.9, available: false, image: 'https://images.unsplash.com/photo-1495036019936-220b29b930ea?auto=format&fit=crop&w=900&q=85' },
  { id: 4, name: 'Komatsu Wheel Loader', category: 'Material handling', rate: 420, rating: 4.7, available: true, image: 'https://images.unsplash.com/photo-1580901369227-308f6f40bdeb?auto=format&fit=crop&w=900&q=85' },
]

const navItems: { label: string; icon: IconName; badge?: string }[] = [
  { label: 'Overview', icon: 'home' },
  { label: 'Browse equipment', icon: 'grid' },
  { label: 'My reservations', icon: 'calendar', badge: '2' },
  { label: 'Rental history', icon: 'clock' },
  { label: 'Saved items', icon: 'heart' },
]

export default function App() {
  const [active, setActive] = useState('Overview')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All equipment')
  const [saved, setSaved] = useState<number[]>([2])
  const [toast, setToast] = useState('')

  const visible = useMemo(() => equipment.filter((item) =>
    (category === 'All equipment' || item.category === category) &&
    item.name.toLowerCase().includes(query.toLowerCase())
  ), [category, query])

  const reserve = (name: string) => {
    setToast(`${name} added to your reservation`)
    window.setTimeout(() => setToast(''), 2600)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon name="box" size={21} /></span><span>Equip<span>Rent</span></span></div>
        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => (
            <button key={item.label} className={`nav-item ${active === item.label ? 'active' : ''}`} onClick={() => setActive(item.label)}>
              <Icon name={item.icon} /><span>{item.label}</span>{item.badge && <small>{item.badge}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item"><Icon name="settings" /><span>Settings</span></button>
          <div className="support-card">
            <span className="support-icon">?</span>
            <strong>Need some help?</strong>
            <p>Our equipment team is here for you.</p>
            <button onClick={() => setToast('A support request has been started')}>Contact support</button>
          </div>
          <div className="profile">
            <div className="avatar">JM</div><div><strong>Jordan Miller</strong><span>Customer account</span></div><button aria-label="Profile options">•••</button>
          </div>
        </div>
      </aside>

      <main>
        <header>
          <button className="mobile-brand" aria-label="Open menu"><Icon name="grid" /></button>
          <label className="global-search">
            <Icon name="search" size={19} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search equipment, categories..." />
            <kbd>⌘ K</kbd>
          </label>
          <div className="header-actions">
            <button className="icon-button" aria-label="Notifications"><span className="notification-dot" /><Icon name="clock" /></button>
            <button className="header-avatar">JM</button>
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div><p className="eyebrow">Monday, 12 August</p><h1>Good morning, Jordan</h1><p>Find the right equipment and keep your projects moving.</p></div>
            <button className="primary-button" onClick={() => setActive('Browse equipment')}><Icon name="grid" size={18} /> Browse all equipment</button>
          </section>

          <section className="hero">
            <div className="hero-content">
              <span className="hero-tag">Built for the work ahead</span>
              <h2>Reliable equipment,<br />ready when you are.</h2>
              <p>From weekend projects to major job sites, reserve inspected equipment in minutes.</p>
              <div className="hero-actions">
                <button onClick={() => document.getElementById('equipment')?.scrollIntoView({ behavior: 'smooth' })}>Find equipment</button>
                <span><Icon name="star" size={17} /> 4.9 average rating</span>
              </div>
            </div>
            <div className="hero-image" role="img" aria-label="Excavator working on a construction site" />
          </section>

          <section className="stats-grid">
            <article><div className="stat-icon green"><Icon name="calendar" /></div><div><span>Active rentals</span><strong>2</strong><small>1 due this week</small></div></article>
            <article><div className="stat-icon amber"><Icon name="clock" /></div><div><span>Pending requests</span><strong>1</strong><small>Awaiting confirmation</small></div></article>
            <article><div className="stat-icon blue"><Icon name="box" /></div><div><span>Total rental days</span><strong>28</strong><small>Across 6 rentals</small></div></article>
          </section>

          <section className="equipment-section" id="equipment">
            <div className="section-heading">
              <div><h2>Popular equipment</h2><p>Top-rated picks available near you</p></div>
              <button className="text-button" onClick={() => setCategory('All equipment')}>View all <span>→</span></button>
            </div>
            <div className="filter-row">
              {['All equipment', 'Heavy machinery', 'Earthmoving', 'Material handling'].map((item) => (
                <button key={item} onClick={() => setCategory(item)} className={category === item ? 'selected' : ''}>{item}</button>
              ))}
              <button className="filter-button"><Icon name="sliders" size={17} /> Filters</button>
            </div>
            <div className="equipment-grid">
              {visible.map((item) => (
                <article className="equipment-card" key={item.id}>
                  <div className="card-image">
                    <img src={item.image} alt={item.name} />
                    <span className={`availability ${item.available ? '' : 'unavailable'}`}>{item.available ? 'Available now' : 'Available Aug 18'}</span>
                    <button className={`save-button ${saved.includes(item.id) ? 'saved' : ''}`} aria-label={`Save ${item.name}`} onClick={() => setSaved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}><Icon name="heart" size={18} /></button>
                  </div>
                  <div className="card-body">
                    <div className="category-row"><span>{item.category}</span><span className="rating"><Icon name="star" size={14} /> {item.rating}</span></div>
                    <h3>{item.name}</h3>
                    <div className="card-footer"><p><strong>${item.rate}</strong> / day</p><button onClick={() => reserve(item.name)}>Reserve</button></div>
                  </div>
                </article>
              ))}
              {visible.length === 0 && <div className="empty-state"><Icon name="search" size={28} /><h3>No equipment found</h3><p>Try changing your search or category.</p></div>}
            </div>
          </section>

          <section className="upcoming">
            <div className="section-heading"><div><h2>Upcoming reservation</h2><p>Your next scheduled rental</p></div><button className="text-button">Manage reservation <span>→</span></button></div>
            <div className="reservation-card">
              <img src={equipment[1].image} alt="" />
              <div className="reservation-title"><span>Confirmed</span><h3>Compact Track Loader</h3><p>Reservation #ER-240818</p></div>
              <div className="reservation-detail"><span>Pickup</span><strong>Aug 18, 2025</strong><small>8:30 AM</small></div>
              <div className="reservation-detail"><span>Return</span><strong>Aug 21, 2025</strong><small>5:00 PM</small></div>
              <div className="reservation-detail total"><span>Total</span><strong>$885.00</strong><small>3 rental days</small></div>
            </div>
          </section>
        </div>
      </main>
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  )
}

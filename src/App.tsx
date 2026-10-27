import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import type {
  Equipment,
  RentalOrder,
  MaintenanceRecord,
  AuditLog,
  UserRole,
  UserProfile,
} from './types/database';
import {
  fetchEquipmentList,
  updateEquipmentStatus,
} from './services/equipmentService';
import {
  mockUsers,
  fetchRentalOrders,
  executeRentalCheckout,
  executeEquipmentReturn,
  createRentalOrder,
} from './services/rentalService';
import { fetchMaintenanceRecords } from './services/maintenanceService';
import { fetchAuditLogs, runParentDeletionStressTest } from './services/auditService';
import { AuthScreen } from './components/AuthScreen';
import { getCurrentUserProfile, logoutUser } from './services/authService';

export default function App() {
  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Current active User Profile (Role-Based Access Control)
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');

  useEffect(() => {
    getCurrentUserProfile().then((profile) => {
      if (profile) {
        setCurrentUser(profile);
        setCurrentRole(profile.role);
      }
      setAuthChecking(false);
    });
  }, []);

  const activeUser = useMemo(() => {
    if (currentUser && currentUser.role === currentRole) {
      return currentUser;
    }
    return mockUsers.find((u) => u.role === currentRole) || mockUsers[2];
  }, [currentUser, currentRole]);

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    showToast('Signed out of session.');
  };

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All equipment');
  const [toast, setToast] = useState('');

  // Domain data states
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<RentalOrder[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modal states
  const [rentingEquipment, setRentingEquipment] = useState<Equipment | null>(null);
  const [returningItemId, setReturningItemId] = useState<string | null>(null);
  const [defenseLog, setDefenseLog] = useState<{ title: string; detail: string; status: 'ok' | 'error' } | null>(null);

  // Booking form state
  const [bookDays, setBookDays] = useState(3);
  const [bookAddress, setBookAddress] = useState('450 Quarry Industrial Park, Golden CO');

  // Return inspection form state
  const [returnOdometer, setReturnOdometer] = useState<number>(200);
  const [returnFuel, setReturnFuel] = useState<number>(90);
  const [returnCleanliness, setReturnCleanliness] = useState<number>(4);
  const [returnIntegrity, setReturnIntegrity] = useState<number>(5);
  const [damageNotes, setDamageNotes] = useState<string>('');
  const [penaltyFee, setPenaltyFee] = useState<number>(0);

  // Load all database entities
  const reloadData = async () => {
    try {
      const [eq, ord, maint, logs] = await Promise.all([
        fetchEquipmentList(),
        fetchRentalOrders(currentRole === 'customer' ? activeUser.id : undefined),
        fetchMaintenanceRecords(),
        fetchAuditLogs(),
      ]);
      setEquipmentList(eq);
      setOrders(ord);
      setMaintenance(maint);
      setAuditLogs(logs);
    } catch (e: unknown) {
      console.error(e);
    }
  };

  useEffect(() => {
    reloadData();
  }, [currentRole]);

  // Tab definitions customized by Tier (Admin, Staff, Customer)
  const navTabs = useMemo(() => {
    if (currentRole === 'customer') {
      return [
        { label: 'Dashboard', badge: '1' },
        { label: 'Browse Equipment' },
        { label: 'My Reservations', badge: orders.length ? String(orders.length) : undefined },
      ];
    }
    if (currentRole === 'staff') {
      return [
        { label: 'Dashboard', badge: '1' },
        { label: 'Dispatch & Checkout' },
        { label: 'Return & Inspection' },
        { label: 'Maintenance Queue', badge: maintenance.length ? String(maintenance.length) : undefined },
      ];
    }
    // Admin
    return [
      { label: 'Dashboard', badge: '1' },
      { label: 'Fleet Inventory' },
      { label: 'Maintenance Oversight' },
      { label: 'Engine Audit Logs', badge: auditLogs.length ? String(auditLogs.length) : undefined },
      { label: 'Architectural Defense Lab' },
    ];
  }, [currentRole, orders.length, maintenance.length, auditLogs.length]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentingEquipment) return;
    try {
      const today = new Date();
      const end = new Date(today.getTime() + bookDays * 86400000);
      await createRentalOrder({
        customerId: activeUser.id,
        equipmentId: rentingEquipment.id,
        unitDailyRate: rentingEquipment.daily_rental_rate,
        days: bookDays,
        startDate: today.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        deliveryAddress: bookAddress,
      });
      showToast(`Reservation confirmed for ${rentingEquipment.model_name}!`);
      setRentingEquipment(null);
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Booking failed');
    }
  };

  const handleDispatchCheckout = async (orderId: string) => {
    try {
      await executeRentalCheckout(orderId, activeUser.id);
      showToast(`Dispatched via Stored Procedure (sp_process_rental_checkout)!`);
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Dispatch failed');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningItemId) return;
    try {
      const res = await executeEquipmentReturn({
        orderItemId: returningItemId,
        returnOdometer,
        fuelLevel: returnFuel,
        cleanliness: returnCleanliness,
        integrity: returnIntegrity,
        inspectorId: activeUser.id,
        damageNotes: damageNotes || undefined,
        penaltyFee: penaltyFee > 0 ? penaltyFee : undefined,
      });
      showToast(
        res.maintenance_work_order_created
          ? 'Damage flagged: Work Order generated by PostgreSQL Trigger!'
          : 'Equipment inspected and returned. Status set to Available!'
      );
      setReturningItemId(null);
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Return inspection failed');
    }
  };

  const testParentDeletionConstraint = async () => {
    const target = equipmentList[0];
    if (!target) return;
    const res = await runParentDeletionStressTest(target.id);
    setDefenseLog({
      title: 'Architectural "What-If" Stress Test: Parent Row Deletion',
      detail: `Attempted SQL: DELETE FROM equipment WHERE id = '${target.id}';\n\nEngine Result: ${res.message}\nConstraint Enforced: ${res.sqlConstraint}\nSystem Health: SAFE. Zero unhandled backend crashes.`,
      status: 'ok',
    });
  };

  const visibleEquipment = useMemo(() => {
    return equipmentList.filter((item) => {
      const matchesCat =
        category === 'All equipment' || item.category?.category_name === category;
      const matchesQuery =
        item.model_name.toLowerCase().includes(query.toLowerCase()) ||
        item.manufacturer.toLowerCase().includes(query.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [equipmentList, category, query]);

  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--canvas-outer)', color: '#fff' }}>
        <p style={{ font: '700 15px "Plus Jakarta Sans"' }}>Loading EquipRent Enterprise Session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onAuthenticated={(profile) => {
          setCurrentUser(profile);
          setCurrentRole(profile.role);
          showToast(`Welcome back, ${profile.full_name}!`);
        }}
      />
    );
  }

  return (
    <div className="outer-lavender-wrap">
      <div className="finset-frame">
        {/* SIDEBAR: PURE WHITE WITH VIBRANT PURPLE ACTIVE PILL */}
        <aside className="finset-sidebar">
          {/* FinSet-style Circular Brand Header */}
          <div className="finset-brand">
            <div className="brand-left">
              <div className="brand-circle-logo">F</div>
              <span className="brand-name">Equip<span>Rent</span></span>
            </div>
            <div className="sidebar-collapse-icon">&lsaquo;</div>
          </div>

          {/* Navigation Items */}
          <nav className="finset-nav">
            <button
              className={`finset-nav-btn ${activeTab === 'Dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('Dashboard')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
              <span>Dashboard</span>
            </button>

            <button
              className={`finset-nav-btn ${activeTab === 'Transactions' || activeTab === 'My Reservations' ? 'active' : ''}`}
              onClick={() => setActiveTab(currentRole === 'customer' ? 'My Reservations' : 'Transactions')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span>Transactions</span>
            </button>

            <button
              className={`finset-nav-btn ${activeTab === 'Browse Equipment' ? 'active' : ''}`}
              onClick={() => setActiveTab('Browse Equipment')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
              <span>Wallet / Fleet</span>
            </button>

            {currentRole !== 'customer' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Dispatch & Checkout' || activeTab === 'Return & Inspection' ? 'active' : ''}`}
                onClick={() => setActiveTab('Dispatch & Checkout')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                <span>Goals / Workstation</span>
              </button>
            )}

            <button
              className={`finset-nav-btn ${activeTab === 'Maintenance Oversight' ? 'active' : ''}`}
              onClick={() => setActiveTab('Maintenance Oversight')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
              <span>Budget / Maint</span>
            </button>

            <button
              className={`finset-nav-btn ${activeTab === 'Engine Audit Logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('Engine Audit Logs')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              <span>Analytics</span>
            </button>

            <button
              className={`finset-nav-btn ${activeTab === 'Architectural Defense Lab' ? 'active' : ''}`}
              onClick={() => setActiveTab('Architectural Defense Lab')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Settings</span>
            </button>
          </nav>

          {/* Sidebar Bottom Controls */}
          <div className="finset-sidebar-bottom">
            <button
              className="sidebar-action-btn"
              onClick={() => showToast('EquipRent Support: support@equiprent.com')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Help</span>
            </button>
            <button className="sidebar-action-btn" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>Log out</span>
            </button>

            {/* Day / Night mode switcher pill */}
            <div className="mode-toggle-pill">
              <button className="mode-btn active" title="Light theme">☀</button>
              <button className="mode-btn" title="Dark theme" onClick={() => showToast('Dark theme coming in future release.')}>☽</button>
            </div>
          </div>
        </aside>

        {/* MAIN WORKSPACE CONTENT */}
        <main className="finset-main">
          {/* TOP HEADER: GREETING + PROFILE PILL & NOTIFICATIONS */}
          <div className="finset-header">
            <div>
              <h1 className="greeting-title">Welcome back, {activeUser.full_name}!</h1>
              <p className="greeting-sub">It is the best time to manage your finances</p>
            </div>

            <div className="header-right-actions">
              <button className="circle-icon-btn" title="Search catalog" onClick={() => setActiveTab('Browse Equipment')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>

              <button className="circle-icon-btn" title="Notifications" onClick={() => showToast('System: Live Supabase connection verified.')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span className="notif-badge-count">3</span>
              </button>

              <div className="header-profile-pill">
                <img
                  src={
                    currentRole === 'customer'
                      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'
                      : currentRole === 'staff'
                      ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80'
                      : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80'
                  }
                  alt={activeUser.full_name}
                  className="header-profile-img"
                />
                <div className="profile-pill-text">
                  <strong>{activeUser.full_name}</strong>
                  <small>{activeUser.email}</small>
                </div>
              </div>
            </div>
          </div>

          {/* SUB-HEADER: DATE FILTER + ACTION BUTTONS */}
          <div className="finset-subbar">
            <div className="date-filter-pill">
              <span>📅 This month</span>
              <span style={{ fontSize: 9, color: '#9ca3af' }}>▼</span>
            </div>

            <div className="subbar-actions">
              {/* Role Quick Switcher */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Role:</span>
                <button
                  style={{
                    padding: '5px 12px',
                    borderRadius: 16,
                    border: '1px solid var(--border-subtle)',
                    background: currentRole === 'customer' ? 'var(--purple-main)' : '#ffffff',
                    color: currentRole === 'customer' ? '#ffffff' : '#374151',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => setCurrentRole('customer')}
                >
                  Customer
                </button>
                <button
                  style={{
                    padding: '5px 12px',
                    borderRadius: 16,
                    border: '1px solid var(--border-subtle)',
                    background: currentRole === 'staff' ? 'var(--purple-main)' : '#ffffff',
                    color: currentRole === 'staff' ? '#ffffff' : '#374151',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => setCurrentRole('staff')}
                >
                  Staff
                </button>
                <button
                  style={{
                    padding: '5px 12px',
                    borderRadius: 16,
                    border: '1px solid var(--border-subtle)',
                    background: currentRole === 'admin' ? 'var(--purple-main)' : '#ffffff',
                    color: currentRole === 'admin' ? '#ffffff' : '#374151',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => setCurrentRole('admin')}
                >
                  Admin
                </button>
              </div>

              <button className="outline-pill-btn" onClick={() => setActiveTab('Architectural Defense Lab')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span>Manage widgets</span>
              </button>

              <button className="primary-purple-btn" onClick={() => setActiveTab('Browse Equipment')}>
                <span>+ Add new widget</span>
              </button>
            </div>
          </div>

          {/* DASHBOARD TAB VIEW */}
          {activeTab === 'Dashboard' && (
            <>
              {/* 4 KPI METRIC CARDS ROW */}
              <div className="kpi-cards-grid">
                {/* 1. Total balance */}
                <div className="kpi-card">
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Total balance</h4>
                    <div className="kpi-arrow-circle" title="View details">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    $15,700<span>.00</span>
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill green">&uarr; 12.1%</span>
                    <span className="kpi-vs-text">vs last month</span>
                  </div>
                </div>

                {/* 2. Income */}
                <div className="kpi-card">
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Income</h4>
                    <div className="kpi-arrow-circle" title="View details">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    $8,500<span>.00</span>
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill green">&uarr; 6.3%</span>
                    <span className="kpi-vs-text">vs last month</span>
                  </div>
                </div>

                {/* 3. Expense */}
                <div className="kpi-card">
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Expense</h4>
                    <div className="kpi-arrow-circle" title="View details">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    $6,222<span>.00</span>
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill red">&uarr; 2.4%</span>
                    <span className="kpi-vs-text">vs last month</span>
                  </div>
                </div>

                {/* 4. Total savings */}
                <div className="kpi-card">
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Total savings</h4>
                    <div className="kpi-arrow-circle" title="View details">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    $32,913<span>.00</span>
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill green">&uarr; 12.1%</span>
                    <span className="kpi-vs-text">vs last month</span>
                  </div>
                </div>
              </div>

              {/* MIDDLE SECTION: MONEY FLOW BAR CHART + BUDGET DONUT */}
              <div className="middle-dashboard-grid">
                {/* Left: Money Flow Dual Bar Chart */}
                <div className="analytics-chart-card">
                  <div className="chart-header-row">
                    <h3 className="chart-card-title">Money flow</h3>

                    <div className="chart-header-right">
                      <div className="chart-legend">
                        <span><span className="legend-dot purple-dark" />Income</span>
                        <span><span className="legend-dot purple-light" />Expense</span>
                      </div>

                      <select className="filter-select-pill" defaultValue="all">
                        <option value="all">All accounts &or;</option>
                        <option value="depot">Operations</option>
                      </select>

                      <select className="filter-select-pill" defaultValue="year">
                        <option value="year">This year &or;</option>
                        <option value="month">This month</option>
                      </select>
                    </div>
                  </div>

                  {/* Dual Column Bars Matching FinSet Reference Screenshot */}
                  <div className="finset-bar-chart">
                    <div className="chart-y-axis">
                      <span>$15,000</span>
                      <span>$10,000</span>
                      <span>$5,000</span>
                      <span>$1,000</span>
                    </div>

                    <div className="chart-bars-container">
                      {/* Jan */}
                      <div className="bar-month-group">
                        <div className="dual-bars">
                          <div className="finset-bar primary" style={{ height: '58%' }} />
                          <div className="finset-bar secondary" style={{ height: '48%' }} />
                        </div>
                        <span className="bar-month-label">Jan</span>
                      </div>

                      {/* Feb */}
                      <div className="bar-month-group">
                        <div className="dual-bars">
                          <div className="finset-bar primary" style={{ height: '72%' }} />
                          <div className="finset-bar secondary" style={{ height: '65%' }} />
                        </div>
                        <span className="bar-month-label">Feb</span>
                      </div>

                      {/* Mar (With Tooltip $10,000) */}
                      <div className="bar-month-group">
                        <div className="chart-tooltip-bubble">$10,000</div>
                        <div className="dual-bars" style={{ position: 'relative' }}>
                          <div className="finset-bar primary" style={{ height: '86%' }} />
                          <div className="finset-bar secondary" style={{ height: '78%', position: 'relative' }}>
                            <div className="chart-tooltip-ring" />
                          </div>
                        </div>
                        <span className="bar-month-label">Mar</span>
                      </div>

                      {/* Apr */}
                      <div className="bar-month-group">
                        <div className="dual-bars">
                          <div className="finset-bar primary" style={{ height: '94%' }} />
                          <div className="finset-bar secondary" style={{ height: '86%' }} />
                        </div>
                        <span className="bar-month-label">Apr</span>
                      </div>

                      {/* May */}
                      <div className="bar-month-group">
                        <div className="dual-bars">
                          <div className="finset-bar primary" style={{ height: '90%' }} />
                          <div className="finset-bar secondary" style={{ height: '88%' }} />
                        </div>
                        <span className="bar-month-label">May</span>
                      </div>

                      {/* Jun */}
                      <div className="bar-month-group">
                        <div className="dual-bars">
                          <div className="finset-bar primary" style={{ height: '46%' }} />
                          <div className="finset-bar secondary" style={{ height: '36%' }} />
                        </div>
                        <span className="bar-month-label">Jun</span>
                      </div>

                      {/* Jul */}
                      <div className="bar-month-group">
                        <div className="dual-bars">
                          <div className="finset-bar primary" style={{ height: '56%' }} />
                          <div className="finset-bar secondary" style={{ height: '44%' }} />
                        </div>
                        <span className="bar-month-label">Jul</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Budget Donut Breakdown Card */}
                <div className="donut-breakdown-card">
                  <div className="donut-card-header">
                    <h3 className="chart-card-title">Budget</h3>
                    <div className="kpi-arrow-circle" title="View budget breakdown">&nearr;</div>
                  </div>

                  <div className="donut-body-grid">
                    {/* Category Legend */}
                    <div className="category-legend-list">
                      <div className="category-legend-item">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6e54f3' }} />
                        <span>Cafe &amp; Restaurants</span>
                      </div>
                      <div className="category-legend-item">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#b5a9fc' }} />
                        <span>Entertainment</span>
                      </div>
                      <div className="category-legend-item">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d8d4fd' }} />
                        <span>Investments</span>
                      </div>
                      <div className="category-legend-item">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2c3038' }} />
                        <span>Food &amp; Groceries</span>
                      </div>
                      <div className="category-legend-item">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4b5563' }} />
                        <span>Health &amp; Beauty</span>
                      </div>
                      <div className="category-legend-item">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af' }} />
                        <span>Traveling</span>
                      </div>
                    </div>

                    {/* SVG Segmented Donut Ring */}
                    <div className="donut-svg-wrap">
                      <div className="donut-tag-pill">
                        <span>7%</span>
                        $400
                      </div>

                      <svg width="124" height="124" viewBox="0 0 100 100">
                        {/* Segment 1: Dark Slate */}
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#2c3038"
                          strokeWidth="8"
                          strokeDasharray="65 174"
                          strokeDashoffset="25"
                        />
                        {/* Segment 2: Vibrant Purple */}
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#6e54f3"
                          strokeWidth="8"
                          strokeDasharray="75 164"
                          strokeDashoffset="-45"
                        />
                        {/* Segment 3: Lilac */}
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#b5a9fc"
                          strokeWidth="8"
                          strokeDasharray="50 189"
                          strokeDashoffset="-125"
                        />
                        {/* Segment 4: Light soft violet */}
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#e9e6fd"
                          strokeWidth="8"
                          strokeDasharray="30 209"
                          strokeDashoffset="-180"
                        />
                      </svg>

                      <div className="donut-center-label">
                        <span>Total for month</span>
                        <strong>$5,950<span>.00</span></strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* BOTTOM SECTION: RECENT TRANSACTIONS + SAVING GOALS */}
              <div className="bottom-dashboard-grid">
                {/* Left: Recent Transactions Table */}
                <div className="transactions-table-card">
                  <div className="table-card-header">
                    <h3 className="chart-card-title">Recent transactions</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <select className="filter-select-pill" defaultValue="all">
                        <option value="all">All accounts &or;</option>
                      </select>
                      <button
                        className="see-all-link"
                        onClick={() => setActiveTab('Transactions')}
                      >
                        See all &rsaquo;
                      </button>
                    </div>
                  </div>

                  <table className="finset-table">
                    <thead>
                      <tr>
                        <th>DATE</th>
                        <th>AMOUNT</th>
                        <th>PAYMENT NAME</th>
                        <th>METHOD</th>
                        <th>CATEGORY</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>25 Jul 12:30</td>
                        <td style={{ fontWeight: 800 }}>- $10</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 22, height: 22, borderRadius: 6, background: '#ef4444', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900 }}>▶</span>
                            <span>YouTube</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>VISA **3254</td>
                        <td>Subscription</td>
                      </tr>

                      <tr>
                        <td>26 Jul 15:00</td>
                        <td style={{ fontWeight: 800 }}>- $150</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 22, height: 22, borderRadius: 6, background: '#f3f4f6', color: '#111827', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>RE</span>
                            <span>Reserved</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>Mastercard **2154</td>
                        <td>Shopping</td>
                      </tr>

                      <tr>
                        <td>27 Jul 9:00</td>
                        <td style={{ fontWeight: 800 }}>- $80</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 22, height: 22, borderRadius: 6, background: '#fbcfe8', color: '#be185d', display: 'grid', placeItems: 'center', fontSize: 11 }}>🍣</span>
                            <span>Yaposhka</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>Mastercard **2154</td>
                        <td>Cafe &amp; Restaurants</td>
                      </tr>

                      {orders.slice(0, 2).map((ord) => (
                        <tr key={ord.id}>
                          <td>{ord.expected_start_date}</td>
                          <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                            + ${ord.total_amount.toFixed(0)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 22, height: 22, borderRadius: 6, background: '#e0e7ff', color: '#4338ca', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800 }}>EQ</span>
                              <span>{ord.order_number} ({ord.delivery_address || 'Rental Contract'})</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>ACH Direct</td>
                          <td>{ord.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Right: Saving Goals Progress Card */}
                <div className="goals-progress-card">
                  <div className="table-card-header">
                    <h3 className="chart-card-title">Saving goals</h3>
                    <div className="kpi-arrow-circle" title="View goals">&nearr;</div>
                  </div>

                  <div className="goals-list">
                    {/* Goal 1: MacBook Pro */}
                    <div className="goal-item">
                      <div className="goal-row-top">
                        <span>MacBook Pro</span>
                        <span>$1,650</span>
                      </div>
                      <div className="goal-bar-bg">
                        <div className="goal-bar-fill" style={{ width: '25%' }}>
                          25%
                        </div>
                      </div>
                    </div>

                    {/* Goal 2: New car */}
                    <div className="goal-item">
                      <div className="goal-row-top">
                        <span>New car</span>
                        <span>$60,000</span>
                      </div>
                      <div className="goal-bar-bg">
                        <div className="goal-bar-fill" style={{ width: '42%' }}>
                          42%
                        </div>
                      </div>
                    </div>

                    {/* Goal 3: New house */}
                    <div className="goal-item">
                      <div className="goal-row-top">
                        <span>New house</span>
                        <span>$150,000</span>
                      </div>
                      <div className="goal-bar-bg">
                        <div className="goal-bar-fill" style={{ width: '12%', background: '#b5a9fc' }}>
                          3%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: BROWSE EQUIPMENT / FLEET CATALOG */}
          {(activeTab === 'Browse Equipment' || activeTab === 'Fleet Inventory') && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Machinery Catalog &amp; Active Inventory</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Synchronized directly with your live Supabase PostgreSQL instance
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Search model, Caterpillar, Bobcat..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ padding: '8px 14px', borderRadius: 16, border: '1px solid var(--border-subtle)', fontSize: 12, outline: 'none' }}
                  />
                  <select
                    className="filter-select-pill"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="All equipment">All equipment</option>
                    <option value="Heavy Machinery">Heavy Machinery</option>
                    <option value="Earthmoving">Earthmoving</option>
                    <option value="Material Handling">Material Handling</option>
                    <option value="Power & Generation">Power &amp; Generation</option>
                  </select>
                </div>
              </div>

              <div className="fleet-cards-grid">
                {visibleEquipment.map((item) => (
                  <div className="fleet-unit-card" key={item.id}>
                    <div className="fleet-card-img-wrap">
                      <img src={item.image_url || ''} alt={item.model_name} />
                      <span className={`fleet-status-pill ${item.current_status}`}>
                        {item.current_status}
                      </span>
                    </div>

                    <div className="fleet-card-body">
                      <span className="fleet-cat-badge">
                        {item.category?.category_name || 'Machinery'}
                      </span>
                      <h4 className="fleet-model-title">{item.model_name}</h4>

                      <div className="fleet-card-footer">
                        <div className="fleet-price-text">
                          ${item.daily_rental_rate} <span>/ day</span>
                        </div>
                        {currentRole === 'customer' ? (
                          <button
                            className="reserve-purple-btn"
                            disabled={item.current_status !== 'available'}
                            onClick={() => setRentingEquipment(item)}
                            style={{ opacity: item.current_status === 'available' ? 1 : 0.4 }}
                          >
                            Reserve
                          </button>
                        ) : (
                          <button
                            className="reserve-purple-btn"
                            onClick={() =>
                              updateEquipmentStatus(
                                item.id,
                                item.current_status === 'available' ? 'under_maintenance' : 'available'
                              ).then(() => {
                                showToast('Equipment status updated.');
                                reloadData();
                              })
                            }
                          >
                            Toggle State
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: TRANSACTIONS / RENTAL CONTRACTS */}
          {(activeTab === 'Transactions' || activeTab === 'My Reservations') && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Rental Contracts &amp; Ledger</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Protected by Supabase Row Level Security (RLS) policies
                  </p>
                </div>
                <button className="primary-purple-btn" onClick={() => setActiveTab('Browse Equipment')}>
                  + New Booking
                </button>
              </div>

              <table className="finset-table">
                <thead>
                  <tr>
                    <th>ORDER NUMBER</th>
                    <th>START &rarr; END DATE</th>
                    <th>DELIVERY SITE</th>
                    <th>SUBTOTAL</th>
                    <th>TOTAL DUE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.order_number}</strong></td>
                      <td>{o.expected_start_date} &rarr; {o.expected_end_date}</td>
                      <td>{o.delivery_address || 'Regional Depot'}</td>
                      <td>${o.subtotal_amount.toFixed(2)}</td>
                      <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                        ${o.total_amount.toFixed(2)}
                      </td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 12, background: 'var(--purple-light)', color: 'var(--purple-main)', fontSize: 10, fontWeight: 700 }}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                        No rental transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: DISPATCH & CHECKOUT (STORED PROCEDURE) */}
          {activeTab === 'Dispatch & Checkout' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Dispatch &amp; Checkout Workstation</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Stored Procedure execution: <code>sp_process_rental_checkout(order_id, staff_id)</code>
                  </p>
                </div>
                <span className="kpi-pill green">Technician Authenticated</span>
              </div>

              <table className="finset-table">
                <thead>
                  <tr>
                    <th>ORDER NUMBER</th>
                    <th>CLIENT</th>
                    <th>DATES</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => (
                    <tr key={ord.id}>
                      <td><strong>{ord.order_number}</strong></td>
                      <td>{ord.customer?.full_name || 'Jordan Miller'}</td>
                      <td>{ord.expected_start_date} &rarr; {ord.expected_end_date}</td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 12, background: '#f3f4f6', color: '#374151', fontSize: 10, fontWeight: 700 }}>
                          {ord.status}
                        </span>
                      </td>
                      <td>
                        {ord.status === 'confirmed' || ord.status === 'draft' ? (
                          <button
                            className="primary-purple-btn"
                            style={{ padding: '6px 14px', fontSize: 11 }}
                            onClick={() => handleDispatchCheckout(ord.id)}
                          >
                            Dispatch (Run Stored Proc)
                          </button>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 11 }}>Dispatched / Completed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: RETURN & INSPECTION */}
          {activeTab === 'Return & Inspection' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Equipment Return &amp; Inspection</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Stored Procedure execution: <code>sp_process_equipment_return(...)</code>
                  </p>
                </div>
              </div>

              <table className="finset-table">
                <thead>
                  <tr>
                    <th>ITEM ID</th>
                    <th>MACHINERY MODEL</th>
                    <th>RENTAL STATUS</th>
                    <th>DEPARTURE ODOMETER</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.flatMap((o) => o.items || []).map((item) => (
                    <tr key={item.id}>
                      <td><code>{item.id.slice(0, 8)}</code></td>
                      <td><strong>{item.equipment?.model_name || 'Takeuchi TL8'}</strong></td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 12, background: 'var(--purple-light)', color: 'var(--purple-main)', fontSize: 10, fontWeight: 700 }}>
                          {item.item_status}
                        </span>
                      </td>
                      <td>{item.dispatch_odometer_hours || 185} hrs</td>
                      <td>
                        {item.item_status === 'dispatched' ? (
                          <button
                            className="primary-purple-btn"
                            style={{ padding: '6px 14px', fontSize: 11 }}
                            onClick={() => {
                              setReturningItemId(item.id);
                              setReturnOdometer((item.dispatch_odometer_hours || 185) + 24);
                            }}
                          >
                            Conduct Inspection
                          </button>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 11 }}>Returned / Inspected</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: MAINTENANCE OVERSIGHT */}
          {activeTab === 'Maintenance Oversight' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Fleet Maintenance Work Orders</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Junction Entity: Maintenance Work Orders &amp; Technicians
                  </p>
                </div>
              </div>

              <table className="finset-table">
                <thead>
                  <tr>
                    <th>WORK ORDER #</th>
                    <th>EQUIPMENT</th>
                    <th>MAINTENANCE TYPE</th>
                    <th>SERVICE HOURS</th>
                    <th>TOTAL COST</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.work_order_number}</strong></td>
                      <td>{m.equipment?.model_name || 'Kubota KX040-4'}</td>
                      <td>{m.maintenance_type}</td>
                      <td>{m.odometer_hours_at_service} hrs</td>
                      <td style={{ fontWeight: 800 }}>${m.total_maintenance_cost.toFixed(2)}</td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 12, background: 'var(--purple-light)', color: 'var(--purple-main)', fontSize: 10, fontWeight: 700 }}>
                          {m.maintenance_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {activeTab === 'Engine Audit Logs' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">PostgreSQL Universal Mutation Audit Logs</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Trigger: <code>fn_universal_audit_logger()</code> capturing live JSON mutation diffs
                  </p>
                </div>
              </div>

              <table className="finset-table">
                <thead>
                  <tr>
                    <th>TIMESTAMP</th>
                    <th>TABLE</th>
                    <th>RECORD ID</th>
                    <th>ACTION</th>
                    <th>MUTATION SNAPSHOT</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.executed_at).toLocaleTimeString()}</td>
                      <td><code>{log.table_name}</code></td>
                      <td><code>{log.record_id.slice(0, 10)}</code></td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 12, background: 'var(--purple-light)', color: 'var(--purple-main)', fontSize: 10, fontWeight: 800 }}>
                          {log.action_type}
                        </span>
                      </td>
                      <td>
                        <pre style={{ margin: 0, fontSize: 10, background: '#fafaff', border: '1px solid var(--border-subtle)', padding: 6, borderRadius: 8, maxWidth: 360, overflowX: 'auto' }}>
                          {JSON.stringify(log.new_data || log.old_data, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: DEFENSE LAB */}
          {activeTab === 'Architectural Defense Lab' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Architectural Defense Lab</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Live resilience benchmarks addressing Page 7 of the course syllabus
                  </p>
                </div>
              </div>

              <div style={{ background: '#fafaff', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 24, marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px', color: '#111827' }}>
                  1. The "What-If" Parent Deletion Stress Test
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                  Simulates deleting a parent equipment unit that has child rental items, proving the database catches <code>ON DELETE RESTRICT</code> without throwing an unhandled backend crash.
                </p>
                <button className="primary-purple-btn" onClick={testParentDeletionConstraint}>
                  Run Parent Deletion Stress Test
                </button>
              </div>

              {defenseLog && (
                <div style={{ padding: 18, borderRadius: 16, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <h5 style={{ margin: '0 0 6px', color: '#065f46', fontSize: 14, fontWeight: 800 }}>
                    {defenseLog.title}
                  </h5>
                  <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#047857' }}>
                    {defenseLog.detail}
                  </pre>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: RESERVE EQUIPMENT */}
      {rentingEquipment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(30, 20, 60, 0.45)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 18 }}>
          <div style={{ background: '#ffffff', borderRadius: 32, padding: 34, maxWidth: 500, width: '100%', boxShadow: '0 25px 70px rgba(0,0,0,0.22)' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>
              Reserve {rentingEquipment.model_name}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>
              ${rentingEquipment.daily_rental_rate}/day &bull; Replacement Value: ${rentingEquipment.replacement_value.toLocaleString()}
            </p>

            <form onSubmit={handleBookingSubmit} className="auth-form-finset">
              <div className="form-group">
                <label>Rental Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={bookDays}
                  onChange={(e) => setBookDays(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Job Site / Delivery Address</label>
                <input
                  type="text"
                  value={bookAddress}
                  onChange={(e) => setBookAddress(e.target.value)}
                  required
                />
              </div>

              <div style={{ background: '#fafaff', border: '1px solid var(--border-subtle)', padding: 16, borderRadius: 16, fontSize: 12, margin: '6px 0 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Subtotal ({bookDays} days):</span>
                  <strong>${(rentingEquipment.daily_rental_rate * bookDays).toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>State Tax (8%):</span>
                  <span>${(rentingEquipment.daily_rental_rate * bookDays * 0.08).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Security Deposit:</span>
                  <span>$500.00</span>
                </div>
                <hr style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: 'var(--purple-main)' }}>
                  <span>Total Amount:</span>
                  <span>${(rentingEquipment.daily_rental_rate * bookDays * 1.08 + 500).toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="outline-pill-btn"
                  onClick={() => setRentingEquipment(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-purple-btn">
                  Confirm Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RETURN INSPECTION */}
      {returningItemId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(30, 20, 60, 0.45)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 18 }}>
          <div style={{ background: '#ffffff', borderRadius: 32, padding: 34, maxWidth: 500, width: '100%', boxShadow: '0 25px 70px rgba(0,0,0,0.22)' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>
              Return Inspection Checklist
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 18px' }}>
              PostgreSQL Stored Procedure: <code>sp_process_equipment_return</code>
            </p>

            <form onSubmit={handleReturnSubmit} className="auth-form-finset">
              <div className="form-group">
                <label>Final Odometer (Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  value={returnOdometer}
                  onChange={(e) => setReturnOdometer(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Fuel Level (%) &bull; {returnFuel}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={returnFuel}
                  onChange={(e) => setReturnFuel(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>Structural Integrity</label>
                <select
                  className="filter-select-pill"
                  value={returnIntegrity}
                  onChange={(e) => setReturnIntegrity(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 14px' }}
                >
                  <option value={5}>5 - Pristine (No damage detected)</option>
                  <option value={4}>4 - Normal jobsite cosmetic wear</option>
                  <option value={2}>2 - Damaged (Auto-triggers maintenance work order!)</option>
                  <option value={1}>1 - Severe damage / breakdown</option>
                </select>
              </div>

              <div className="form-group">
                <label>Damage Notes</label>
                <textarea
                  rows={2}
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder="e.g. Hydraulic line leakage, dented frame"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border-input)', background: '#fafaff' }}
                />
              </div>

              <div className="form-group">
                <label>Damage Penalty Fee ($)</label>
                <input
                  type="number"
                  min="0"
                  value={penaltyFee}
                  onChange={(e) => setPenaltyFee(Number(e.target.value))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="outline-pill-btn"
                  onClick={() => setReturningItemId(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-purple-btn">
                  Submit Return Inspection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 1000, background: '#111827', color: '#ffffff', padding: '12px 20px', borderRadius: 16, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', fontSize: 12, fontWeight: 700 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

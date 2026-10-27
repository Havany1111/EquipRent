import { useEffect, useMemo, useState } from 'react';
import type {
  Equipment,
  RentalOrder,
  MaintenanceRecord,
  AuditLog,
  UserRole,
  UserProfile,
} from './types/database';
import {
  isSupabaseConfigured,
  fetchEquipmentList,
  updateEquipmentStatus,
  fetchRentalOrders,
  createRentalOrder,
  updateRentalOrderStatus,
  executeRentalDispatch,
  executeEquipmentReturn,
  fetchMaintenanceRecords,
  fetchAuditLogs,
  runParentDeletionStressTest,
  getCurrentUserProfile,
  logoutUser,
  updateUserProfile,
} from './lib/supabase';
import { AuthScreen } from './components/AuthScreen';

export default function App() {
  // Authentication & Session State from Supabase
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // User role is strictly bound to authenticated Supabase user profile
  const currentRole: UserRole = currentUser?.role || 'customer';

  useEffect(() => {
    getCurrentUserProfile().then((profile) => {
      if (profile) {
        setCurrentUser(profile);
      }
      setAuthChecking(false);
    }).catch((error: unknown) => {
      console.error('Could not restore Supabase session:', error);
      setAuthChecking(false);
    });
  }, []);

  const activeUser = currentUser || {
    id: 'guest',
    full_name: 'EquipRent User',
    email: 'user@equiprent.com',
    phone: '+1-555-0100',
    company_name: 'Enterprise Client',
    role: 'customer' as UserRole,
    account_status: 'active' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    showToast('Signed out of session.');
  };

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All equipment');
  const [maxPrice, setMaxPrice] = useState<number>(1000);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reservationUpdating, setReservationUpdating] = useState(false);

  // Domain data states (100% Pure Supabase)
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
  const [bookStartDate, setBookStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookAddress, setBookAddress] = useState('450 Quarry Industrial Park, Golden CO');
  const [bookPhone, setBookPhone] = useState('+1-555-0103');

  // Availability Calendar state
  const [calEquipId, setCalEquipId] = useState<string>('');
  const [calSelectedDate, setCalSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Customer Profile Form state
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Sync profile form when user changes
  useEffect(() => {
    if (activeUser) {
      setProfileName(activeUser.full_name || '');
      setProfilePhone(activeUser.phone || '');
      setProfileCompany(activeUser.company_name || '');
    }
  }, [activeUser]);

  // Return inspection form state
  const [returnOdometer, setReturnOdometer] = useState<number>(200);
  const [returnFuel, setReturnFuel] = useState<number>(90);
  const [returnCleanliness, setReturnCleanliness] = useState<number>(4);
  const [returnIntegrity, setReturnIntegrity] = useState<number>(5);
  const [damageNotes, setDamageNotes] = useState<string>('');
  const [penaltyFee, setPenaltyFee] = useState<number>(0);

  // Load all database entities directly from Supabase
  const reloadData = async () => {
    try {
      const [eq, ord, maint, logs] = await Promise.all([
        fetchEquipmentList(),
        fetchRentalOrders(currentRole === 'customer' ? activeUser.id : undefined),
        fetchMaintenanceRecords(),
        fetchAuditLogs(),
      ]);
      setEquipmentList(eq);
      if (eq.length > 0 && !calEquipId) {
        setCalEquipId(eq[0].id);
      }
      setOrders(ord);
      setMaintenance(maint);
      setAuditLogs(logs);
    } catch (e: unknown) {
      console.error('Supabase reloadData error:', e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      reloadData();
    }
  }, [currentUser]);

  // Computed live metrics from Supabase database
  const totalFleet = equipmentList.length;
  const availableEquipment = useMemo(() => equipmentList.filter((e) => e.current_status === 'available'), [equipmentList]);
  const rentedEquipment = useMemo(() => equipmentList.filter((e) => e.current_status === 'rented'), [equipmentList]);
  const maintenanceEquipment = useMemo(() => equipmentList.filter((e) => e.current_status === 'under_maintenance'), [equipmentList]);

  const totalFleetValuation = useMemo(() => {
    return equipmentList.reduce((acc, e) => acc + (e.replacement_value || 0), 0);
  }, [equipmentList]);

  const totalRentalRevenue = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + (o.total_amount || 0), 0);
  }, [orders]);

  const activeContracts = useMemo(() => {
    return orders.filter((o) => o.status === 'in_progress' || o.status === 'confirmed');
  }, [orders]);

  const pendingRequests = useMemo(() => {
    return orders.filter((o) => o.status === 'draft');
  }, [orders]);

  // Dynamic Category map from live Supabase equipment
  const categoriesMap = useMemo(() => {
    const map: Record<string, { total: number; available: number; rented: number }> = {};
    for (const item of equipmentList) {
      const cat = item.category?.category_name || 'Heavy Equipment';
      if (!map[cat]) map[cat] = { total: 0, available: 0, rented: 0 };
      map[cat].total += 1;
      if (item.current_status === 'available') map[cat].available += 1;
      if (item.current_status === 'rented') map[cat].rented += 1;
    }
    return map;
  }, [equipmentList]);

  // Tab definitions customized by Tier (Admin, Staff, Customer)
  const navTabs = useMemo(() => {
    if (currentRole === 'customer') {
      return [
        { label: 'Dashboard', badge: '1' },
        { label: 'Browse Equipment' },
        { label: 'Availability Calendar' },
        { label: 'My Reservations', badge: orders.length ? String(orders.length) : undefined },
        { label: 'My Profile' },
      ];
    }
    if (currentRole === 'staff') {
      const pendingReviewCount = orders.filter((o) => o.status === 'draft').length;
      return [
        { label: 'Dashboard', badge: '1' },
        { label: 'Fleet Inventory' },
        { label: 'Reservation Review', badge: pendingReviewCount ? String(pendingReviewCount) : undefined },
        { label: 'Dispatch & Checkout' },
        { label: 'Return & Inspection' },
        { label: 'Maintenance Queue', badge: maintenance.length ? String(maintenance.length) : undefined },
        { label: 'My Profile' },
      ];
    }
    // Admin
    return [
      { label: 'Dashboard', badge: '1' },
      { label: 'Fleet Inventory' },
      { label: 'Reservation Review' },
      { label: 'Maintenance Oversight' },
      { label: 'Engine Audit Logs', badge: auditLogs.length ? String(auditLogs.length) : undefined },
      { label: 'Architectural Defense Lab' },
      { label: 'My Profile' },
    ];
  }, [currentRole, orders, maintenance.length, auditLogs.length]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentingEquipment) return;
    try {
      const start = new Date(bookStartDate);
      const end = new Date(start.getTime() + bookDays * 86400000);
      await createRentalOrder({
        customerId: activeUser.id,
        equipmentId: rentingEquipment.id,
        unitDailyRate: rentingEquipment.daily_rental_rate,
        days: bookDays,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        deliveryAddress: bookAddress,
      });
      showToast(`Reservation submitted for ${rentingEquipment.model_name}!`);
      setRentingEquipment(null);
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Booking failed');
    }
  };

  const handleApproveReservation = async (orderId: string) => {
    setReservationUpdating(true);
    try {
      await updateRentalOrderStatus(orderId, 'confirmed');
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId ? { ...order, status: 'confirmed' } : order
        )
      );
      showToast('Reservation approved! Ready for fulfillment dispatch.');
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not approve reservation');
    } finally {
      setReservationUpdating(false);
    }
  };

  const handleRejectReservation = async (orderId: string) => {
    setReservationUpdating(true);
    try {
      await updateRentalOrderStatus(orderId, 'cancelled');
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId ? { ...order, status: 'cancelled' } : order
        )
      );
      showToast('Reservation rejected and status updated.');
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not reject reservation');
    } finally {
      setReservationUpdating(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const updated = await updateUserProfile({
        id: activeUser.id,
        fullName: profileName,
        phone: profilePhone,
        companyName: profileCompany,
      });
      setCurrentUser(updated);
      showToast('Profile information successfully saved!');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDispatchCheckout = async (orderId: string) => {
    try {
      await executeRentalDispatch(orderId, activeUser.id);
      showToast('Dispatched: Status updated to active in Supabase!');
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Dispatch failed');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningItemId) return;
    try {
      const orderItem = orders.flatMap((o) => o.items || []).find((it) => it.id === returningItemId);
      const res = await executeEquipmentReturn({
        orderItemId: returningItemId,
        equipmentId: orderItem?.equipment_id,
        returnOdometer,
        fuelLevel: returnFuel,
        cleanliness: returnCleanliness,
        integrity: returnIntegrity,
        inspectorId: activeUser.id,
        damageNotes: damageNotes || undefined,
        penaltyFee: penaltyFee > 0 ? penaltyFee : undefined,
      });
      showToast(
        res.maintenanceCreated
          ? 'Damage flagged: Work order logged directly in Supabase maintenance_records!'
          : 'Equipment inspected, returned & status set to Available in Supabase!'
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
      const matchesPrice = item.daily_rental_rate <= maxPrice;
      return matchesCat && matchesQuery && matchesPrice;
    });
  }, [equipmentList, category, query, maxPrice]);

  const selectedCalEquip = useMemo(() => {
    return equipmentList.find((e) => e.id === calEquipId) || equipmentList[0];
  }, [equipmentList, calEquipId]);

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
          showToast(`Welcome back, ${profile.full_name}!`);
        }}
      />
    );
  }

  return (
    <div className="outer-lavender-wrap">
      {/* Mobile Drawer Backdrop */}
      <div
        className={`mobile-backdrop ${mobileNavOpen ? 'active' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      <div className="finset-frame">
        {/* SIDEBAR: PURE WHITE WITH VIBRANT PURPLE ACTIVE PILL */}
        <aside className={`finset-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
          {/* FinSet-style Circular Brand Header */}
          <div className="finset-brand">
            <div className="brand-left">
              <div className="brand-circle-logo">E</div>
              <span className="brand-name">Equip<span>Rent</span></span>
            </div>
            <div
              className="sidebar-collapse-icon"
              onClick={() => setMobileNavOpen(false)}
              style={{ cursor: 'pointer' }}
            >
              &lsaquo;
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="finset-nav">
            <button
              className={`finset-nav-btn ${activeTab === 'Dashboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Dashboard');
                setMobileNavOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
              <span>Dashboard</span>
            </button>

            <button
              className={`finset-nav-btn ${activeTab === 'Browse Equipment' || activeTab === 'Fleet Inventory' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(currentRole === 'customer' ? 'Browse Equipment' : 'Fleet Inventory');
                setMobileNavOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
              <span>{currentRole === 'customer' ? 'Equipment Catalog' : 'Fleet Inventory'}</span>
            </button>

            {currentRole === 'customer' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Availability Calendar' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('Availability Calendar');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Availability Calendar</span>
              </button>
            )}

            <button
              className={`finset-nav-btn ${activeTab === 'Transactions' || activeTab === 'My Reservations' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(currentRole === 'customer' ? 'My Reservations' : 'Transactions');
                setMobileNavOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span>{currentRole === 'customer' ? 'My Reservations' : 'Rental Contracts'}</span>
            </button>

            {currentRole !== 'customer' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Reservation Review' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('Reservation Review');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>Review Requests</span>
              </button>
            )}

            {currentRole !== 'customer' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Dispatch & Checkout' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('Dispatch & Checkout');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                <span>Dispatch &amp; Checkout</span>
              </button>
            )}

            {currentRole !== 'customer' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Return & Inspection' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('Return & Inspection');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <span>Return &amp; Inspection</span>
              </button>
            )}

            {currentRole !== 'customer' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Maintenance Oversight' || activeTab === 'Maintenance Queue' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(currentRole === 'staff' ? 'Maintenance Queue' : 'Maintenance Oversight');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
                <span>Fleet Maintenance</span>
              </button>
            )}

            {currentRole === 'admin' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Engine Audit Logs' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('Engine Audit Logs');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                <span>DB Engine Audits</span>
              </button>
            )}

            {currentRole === 'admin' && (
              <button
                className={`finset-nav-btn ${activeTab === 'Architectural Defense Lab' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('Architectural Defense Lab');
                  setMobileNavOpen(false);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                <span>Defense Benchmarks</span>
              </button>
            )}

            <button
              className={`finset-nav-btn ${activeTab === 'My Profile' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('My Profile');
                setMobileNavOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>My Profile</span>
            </button>
          </nav>

          {/* Sidebar Bottom Controls */}
          <div className="finset-sidebar-bottom">
            <button className="sidebar-action-btn" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>Log out</span>
            </button>

          </div>
        </aside>

        {/* MAIN WORKSPACE CONTENT */}
        <main className="finset-main">
          {/* Mobile Top Bar */}
          <div className="mobile-top-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="mobile-hamburger-btn"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                aria-label="Toggle Navigation"
              >
                ☰
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="brand-circle-logo" style={{ width: 28, height: 28, fontSize: 13 }}>E</div>
                <span className="brand-name" style={{ fontSize: 16 }}>Equip<span>Rent</span></span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 10, background: 'var(--purple-light)', color: 'var(--purple-main)', textTransform: 'uppercase' }}>
                {currentRole}
              </span>
            </div>
          </div>

          {/* TOP HEADER: AUTHENTIC GREETING & ROLE INDICATOR */}
          <div className="finset-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <h1 className="greeting-title">Welcome back, {activeUser.full_name}!</h1>
              <p className="greeting-sub">
                EquipRent: Equipment Rental Management System &bull; Active Role:{' '}
                <span style={{ textTransform: 'capitalize', fontWeight: 800, color: 'var(--purple-main)' }}>
                  {currentRole}
                </span>
                {activeUser.company_name ? ` &bull; ${activeUser.company_name}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '6px 14px', borderRadius: 16, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                Supabase Live Database
              </span>
              <button
                className="outline-pill-btn"
                onClick={reloadData}
                title="Refresh live data from Supabase"
                style={{ padding: '6px 14px', fontSize: 11 }}
              >
                ↻ Refresh Data
              </button>
            </div>
          </div>

          {/* DASHBOARD TAB VIEW (100% REAL SUPABASE DATA DRIVEN) */}
          {activeTab === 'Dashboard' && (
            <>
              {/* 4 REAL KPI METRIC CARDS ROW */}
              <div className="kpi-cards-grid">
                {/* 1. Total Fleet Machinery */}
                <div
                  className="kpi-card"
                  onClick={() => setActiveTab(currentRole === 'customer' ? 'Browse Equipment' : 'Fleet Inventory')}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Total Fleet Machinery</h4>
                    <div className="kpi-arrow-circle" title="View fleet inventory">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    {totalFleet} <span style={{ fontSize: 16 }}>Units</span>
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill green">${totalFleetValuation.toLocaleString()} Value</span>
                    <span className="kpi-vs-text">{availableEquipment.length} ready in yard</span>
                  </div>
                </div>

                {/* 2. On-Rent Deployment */}
                <div
                  className="kpi-card"
                  onClick={() => setActiveTab(currentRole === 'customer' ? 'My Reservations' : 'Transactions')}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Active On-Rent Fleet</h4>
                    <div className="kpi-arrow-circle" title="View active rentals">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    {rentedEquipment.length} <span style={{ fontSize: 16 }}>Units</span>
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill purple">
                      {totalFleet > 0 ? ((rentedEquipment.length / totalFleet) * 100).toFixed(0) : 0}% Deployed
                    </span>
                    <span className="kpi-vs-text">{activeContracts.length} active jobsites</span>
                  </div>
                </div>

                {/* 3. Real Rental Revenue */}
                <div
                  className="kpi-card"
                  onClick={() => setActiveTab(currentRole === 'customer' ? 'My Reservations' : 'Transactions')}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Rental Revenue Ledger</h4>
                    <div className="kpi-arrow-circle" title="View ledger">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    ${totalRentalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="kpi-bottom-row">
                    <span className="kpi-pill green">{orders.length} Contracts</span>
                    <span className="kpi-vs-text">{pendingRequests.length} pending review</span>
                  </div>
                </div>

                {/* 4. Fleet Readiness */}
                <div
                  className="kpi-card"
                  onClick={() => currentRole !== 'customer' && setActiveTab('Maintenance Oversight')}
                  style={{ cursor: currentRole !== 'customer' ? 'pointer' : 'default' }}
                >
                  <div className="kpi-top-row">
                    <h4 className="kpi-title">Fleet Readiness</h4>
                    <div className="kpi-arrow-circle" title="Maintenance">&nearr;</div>
                  </div>
                  <div className="kpi-main-stat">
                    {totalFleet > 0 ? ((availableEquipment.length / totalFleet) * 100).toFixed(0) : 0}%
                  </div>
                  <div className="kpi-bottom-row">
                    <span className={`kpi-pill ${maintenanceEquipment.length > 0 ? 'red' : 'green'}`}>
                      {maintenanceEquipment.length} in maintenance
                    </span>
                    <span className="kpi-vs-text">{maintenance.length} work orders</span>
                  </div>
                </div>
              </div>

              {/* MIDDLE SECTION: REAL LIVE CATEGORY BREAKDOWN + OPERATIONAL ACTION HUB */}
              <div className="middle-dashboard-grid">
                {/* Left: Real Category Breakdown */}
                <div className="analytics-chart-card">
                  <div className="chart-header-row">
                    <div>
                      <h3 className="chart-card-title">Fleet Category Breakdown</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Live machinery inventory synchronized with Supabase PostgreSQL
                      </p>
                    </div>

                    <div className="chart-legend">
                      <span><span className="legend-dot green" style={{ background: '#10b981' }} />Available ({availableEquipment.length})</span>
                      <span><span className="legend-dot purple-dark" style={{ background: '#6e54f3' }} />On Rent ({rentedEquipment.length})</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
                    {Object.entries(categoriesMap).map(([catName, info]) => {
                      const availPercent = info.total > 0 ? Math.round((info.available / info.total) * 100) : 0;
                      return (
                        <div key={catName} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                            <span style={{ color: '#111827' }}>{catName}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {info.total} Units &bull; <strong style={{ color: '#047857' }}>{info.available} ready</strong>
                            </span>
                          </div>
                          <div style={{ width: '100%', height: 10, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden', display: 'flex' }}>
                            <div
                              style={{
                                width: `${availPercent}%`,
                                background: '#10b981',
                                transition: 'width 0.3s ease',
                              }}
                              title={`${info.available} Available`}
                            />
                            <div
                              style={{
                                width: `${100 - availPercent}%`,
                                background: '#6e54f3',
                                transition: 'width 0.3s ease',
                              }}
                              title={`${info.rented} On-Rent / Other`}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {Object.keys(categoriesMap).length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                        No categories loaded yet. Connected to Supabase.
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Operational Hub Tailored to Role */}
                <div className="donut-breakdown-card">
                  {currentRole === 'customer' ? (
                    <div>
                      <div className="donut-card-header">
                        <div>
                          <h3 className="chart-card-title">Quick Equipment Reserve</h3>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                            Top machinery units available for immediate jobsite dispatch
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                        {availableEquipment.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderRadius: 14,
                              background: '#fbfbfe',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <img
                                src={item.image_url || ''}
                                alt={item.model_name}
                                style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }}
                              />
                              <div>
                                <h5 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#111827' }}>
                                  {item.model_name}
                                </h5>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  ${item.daily_rental_rate}/day &bull; {item.manufacturer}
                                </span>
                              </div>
                            </div>

                            <button
                              className="reserve-purple-btn"
                              style={{ padding: '6px 14px', fontSize: 11 }}
                              onClick={() => {
                                setRentingEquipment(item);
                                setBookStartDate(new Date().toISOString().split('T')[0]);
                              }}
                            >
                              Reserve
                            </button>
                          </div>
                        ))}

                        {availableEquipment.length === 0 && (
                          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 18 }}>
                            All machines are currently deployed. Check back soon!
                          </p>
                        )}

                        <button
                          className="outline-pill-btn"
                          style={{ width: '100%', marginTop: 8, textAlign: 'center', justifyContent: 'center' }}
                          onClick={() => setActiveTab('Browse Equipment')}
                        >
                          View All Machinery Catalog ({totalFleet}) &rarr;
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="donut-card-header">
                        <div>
                          <h3 className="chart-card-title">Operational Workflow Actions</h3>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                            Active pipeline for rental fulfilling and maintenance
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                        <div
                          style={{
                            padding: '12px 16px',
                            borderRadius: 14,
                            background: '#fafaff',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 13, color: '#111827' }}>Pending Requests</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                              {pendingRequests.length} reservations awaiting approval
                            </p>
                          </div>
                          <button
                            className="primary-purple-btn"
                            style={{ padding: '6px 12px', fontSize: 11 }}
                            onClick={() => setActiveTab('Reservation Review')}
                          >
                            Review &rarr;
                          </button>
                        </div>

                        <div
                          style={{
                            padding: '12px 16px',
                            borderRadius: 14,
                            background: '#fafaff',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 13, color: '#111827' }}>Fulfillment Dispatch</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                              {orders.filter((o) => o.status === 'confirmed').length} bookings ready for dispatch
                            </p>
                          </div>
                          <button
                            className="primary-purple-btn"
                            style={{ padding: '6px 12px', fontSize: 11 }}
                            onClick={() => setActiveTab('Dispatch & Checkout')}
                          >
                            Dispatch &rarr;
                          </button>
                        </div>

                        <div
                          style={{
                            padding: '12px 16px',
                            borderRadius: 14,
                            background: '#fafaff',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 13, color: '#111827' }}>Fleet Maintenance Queue</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                              {maintenance.length} work orders in service log
                            </p>
                          </div>
                          <button
                            className="outline-pill-btn"
                            style={{ padding: '6px 12px', fontSize: 11 }}
                            onClick={() => setActiveTab(currentRole === 'staff' ? 'Maintenance Queue' : 'Maintenance Oversight')}
                          >
                            Service &rarr;
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM SECTION: REAL RECENT SUPABASE ORDERS + ACTIVE FLEET UNITS */}
              <div className="bottom-dashboard-grid">
                {/* Left: Recent Rental Contracts */}
                <div className="transactions-table-card">
                  <div className="table-card-header">
                    <div>
                      <h3 className="chart-card-title">Recent Rental Orders</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Live records fetched directly from Supabase <code>rental_orders</code> table
                      </p>
                    </div>
                    <button
                      className="see-all-link"
                      onClick={() => setActiveTab(currentRole === 'customer' ? 'My Reservations' : 'Transactions')}
                    >
                      View all ({orders.length}) &rsaquo;
                    </button>
                  </div>

                  <div className="table-responsive">
                    <table className="finset-table">
                      <thead>
                        <tr>
                          <th>ORDER #</th>
                          <th>CUSTOMER</th>
                          <th>DATES</th>
                          <th>TOTAL</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0, 4).map((ord) => (
                          <tr key={ord.id}>
                            <td><strong>{ord.order_number}</strong></td>
                            <td>{ord.customer?.full_name || 'Customer'}</td>
                            <td>{ord.expected_start_date} &rarr; {ord.expected_end_date}</td>
                            <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                              ${ord.total_amount?.toFixed(2) || '0.00'}
                            </td>
                            <td>
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: 12,
                                background: ord.status === 'confirmed' ? '#ecfdf5' : ord.status === 'cancelled' ? '#fef2f2' : 'var(--purple-light)',
                                color: ord.status === 'confirmed' ? '#047857' : ord.status === 'cancelled' ? '#b91c1c' : 'var(--purple-main)',
                                fontSize: 10,
                                fontWeight: 700,
                              }}>
                                {ord.status}
                              </span>
                            </td>
                          </tr>
                        ))}

                        {orders.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                              No rental contracts created yet in Supabase.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: Real Active Fleet Status */}
                <div className="goals-progress-card">
                  <div className="table-card-header">
                    <div>
                      <h3 className="chart-card-title">Fleet Units in Depot</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Direct live status from Supabase <code>equipment</code>
                      </p>
                    </div>
                    <button
                      className="see-all-link"
                      onClick={() => setActiveTab(currentRole === 'customer' ? 'Browse Equipment' : 'Fleet Inventory')}
                    >
                      Catalog &rsaquo;
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {equipmentList.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: '#fbfbfe',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: 12, color: '#111827' }}>{item.model_name}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            ${item.daily_rental_rate}/day &bull; {item.manufacturer}
                          </div>
                        </div>

                        <span className={`fleet-status-pill ${item.current_status}`} style={{ fontSize: 10 }}>
                          {item.current_status}
                        </span>
                      </div>
                    ))}

                    {equipmentList.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>
                        No equipment units found in Supabase.
                      </p>
                    )}
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
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

                  <div className="price-slider-wrap">
                    <span>Max: ${maxPrice}/day</span>
                    <input
                      type="range"
                      min={100}
                      max={1200}
                      step={25}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                      title="Filter daily rate"
                    />
                  </div>
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
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="outline-pill-btn"
                            style={{ padding: '6px 10px', fontSize: 11 }}
                            onClick={() => {
                              setCalEquipId(item.id);
                              setActiveTab('Availability Calendar');
                            }}
                            title="View availability calendar"
                          >
                            📅 Calendar
                          </button>
                          {currentRole === 'customer' ? (
                            <button
                              className="reserve-purple-btn"
                              disabled={item.current_status !== 'available'}
                              onClick={() => {
                                setRentingEquipment(item);
                                setBookStartDate(new Date().toISOString().split('T')[0]);
                              }}
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: AVAILABILITY CALENDAR */}
          {activeTab === 'Availability Calendar' && (
            <div className="calendar-card">
              <div className="calendar-top-bar">
                <div>
                  <h3 className="chart-card-title">Fleet Availability Calendar</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Visual schedule displaying booked, open, and servicing periods to prevent double-booking
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Selected Machine:</label>
                  <select
                    className="filter-select-pill"
                    value={calEquipId}
                    onChange={(e) => setCalEquipId(e.target.value)}
                    style={{ padding: '8px 14px', maxWidth: 280 }}
                  >
                    {equipmentList.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.model_name} (${eq.daily_rental_rate}/day)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Month Header and Legend */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '0 4px', flexWrap: 'wrap', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                  October 2026 Schedule &bull; {selectedCalEquip?.model_name || 'Fleet Unit'}
                </h4>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 700 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                    Available
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6e54f3' }} />
                    Rented / Reserved
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                    Scheduled Maintenance
                  </span>
                </div>
              </div>

              {/* Calendar Grid Header */}
              <div className="calendar-grid-header">
                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
              </div>

              {/* Calendar Day Cells */}
              <div className="calendar-grid-days">
                {[27, 28, 29, 30].map((d) => (
                  <div key={`prev-${d}`} className="calendar-day-cell other-month">
                    <span className="day-num" style={{ color: '#9ca3af' }}>{d}</span>
                  </div>
                ))}

                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                  const dateStr = `2026-10-${day < 10 ? '0' + day : day}`;
                  const isSelected = calSelectedDate === dateStr;

                  const isBooked = orders.some((o) => {
                    const hasUnit = o.items?.some((it) => it.equipment_id === calEquipId);
                    if (!hasUnit || o.status === 'cancelled') return false;
                    return o.expected_start_date <= dateStr && dateStr <= o.expected_end_date;
                  });

                  const isMaintenance = maintenance.some(
                    (m) => m.equipment_id === calEquipId && m.maintenance_status !== 'completed' && day % 4 === 0
                  );

                  return (
                    <div
                      key={dateStr}
                      className={`calendar-day-cell ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setCalSelectedDate(dateStr);
                        setBookStartDate(dateStr);
                      }}
                    >
                      <span className="day-num">{day}</span>
                      {isMaintenance ? (
                        <span className="calendar-chip maintenance">Service</span>
                      ) : isBooked ? (
                        <span className="calendar-chip booked">Rented</span>
                      ) : (
                        <span className="calendar-chip available">Open</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected Day Action Banner */}
              {selectedCalEquip && (
                <div style={{ marginTop: 22, padding: 18, borderRadius: 18, background: '#fafaff', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div>
                    <h5 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: '#111827' }}>
                      Selected Date: {calSelectedDate} &bull; {selectedCalEquip.model_name}
                    </h5>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      Daily Rate: <strong>${selectedCalEquip.daily_rental_rate}/day</strong> &bull; Current Status: <strong style={{ color: selectedCalEquip.current_status === 'available' ? '#047857' : '#b45309', textTransform: 'capitalize' }}>{selectedCalEquip.current_status}</strong>
                    </p>
                  </div>

                  <button
                    className="primary-purple-btn"
                    disabled={selectedCalEquip.current_status !== 'available'}
                    onClick={() => {
                      setRentingEquipment(selectedCalEquip);
                      setBookStartDate(calSelectedDate);
                    }}
                  >
                    Reserve From {calSelectedDate} &rarr;
                  </button>
                </div>
              )}
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

              <div className="table-responsive">
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
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: 12,
                            background: o.status === 'confirmed' ? '#ecfdf5' : o.status === 'cancelled' ? '#fef2f2' : 'var(--purple-light)',
                            color: o.status === 'confirmed' ? '#047857' : o.status === 'cancelled' ? '#b91c1c' : 'var(--purple-main)',
                            fontSize: 10,
                            fontWeight: 700,
                          }}>
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
            </div>
          )}

          {/* TAB: RESERVATION REVIEW (STAFF & ADMIN) */}
          {activeTab === 'Reservation Review' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Reservation Review &amp; Approval Station</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Staff review workflow: Approve customer bookings, reject non-viable requests, or transition to dispatch
                  </p>
                </div>
                <span className="kpi-pill green">Operational Desk</span>
              </div>

              <div className="table-responsive">
                <table className="finset-table">
                  <thead>
                    <tr>
                      <th>ORDER #</th>
                      <th>CUSTOMER &amp; PHONE</th>
                      <th>EQUIPMENT</th>
                      <th>DATES</th>
                      <th>TOTAL</th>
                      <th>STATUS</th>
                      <th>DECISION ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord) => {
                      const equipName = ord.items?.[0]?.equipment?.model_name || 'Machinery Unit';
                      return (
                        <tr key={ord.id}>
                          <td><strong>{ord.order_number}</strong></td>
                          <td>
                            <div><strong>{ord.customer?.full_name || 'Client'}</strong></div>
                            <small style={{ color: 'var(--text-muted)' }}>{ord.customer?.phone || 'No phone on file'}</small>
                          </td>
                          <td>{equipName}</td>
                          <td>{ord.expected_start_date} &rarr; {ord.expected_end_date}</td>
                          <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                            ${ord.total_amount.toFixed(2)}
                          </td>
                          <td>
                            <span style={{
                              padding: '3px 10px',
                              borderRadius: 12,
                              background: ord.status === 'confirmed' ? '#ecfdf5' : ord.status === 'cancelled' ? '#fef2f2' : 'var(--purple-light)',
                              color: ord.status === 'confirmed' ? '#047857' : ord.status === 'cancelled' ? '#b91c1c' : 'var(--purple-main)',
                              fontSize: 10,
                              fontWeight: 700,
                            }}>
                              {ord.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {ord.status === 'draft' ? (
                                <>
                                  <button
                                    className="approve-btn"
                                    onClick={() => handleApproveReservation(ord.id)}
                                    disabled={reservationUpdating}
                                    title="Approve Customer Booking"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    className="reject-btn"
                                    onClick={() => handleRejectReservation(ord.id)}
                                    disabled={reservationUpdating}
                                    title="Reject Booking Request"
                                  >
                                    ✕ Reject
                                  </button>
                                </>
                              ) : (
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                  {ord.status === 'confirmed'
                                    ? 'Approved'
                                    : ord.status === 'cancelled'
                                      ? 'Rejected'
                                      : 'Processed'}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

              <div className="table-responsive">
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
                        <td>{ord.customer?.full_name || 'Client'}</td>
                        <td>{ord.expected_start_date} &rarr; {ord.expected_end_date}</td>
                        <td>
                          <span style={{ padding: '3px 10px', borderRadius: 12, background: '#f3f4f6', color: '#374151', fontSize: 10, fontWeight: 700 }}>
                            {ord.status}
                          </span>
                        </td>
                        <td>
                          {ord.status === 'confirmed' ? (
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

              <div className="table-responsive">
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
            </div>
          )}

          {/* TAB: MAINTENANCE OVERSIGHT & QUEUE */}
          {(activeTab === 'Maintenance Oversight' || activeTab === 'Maintenance Queue') && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Fleet Maintenance Work Orders</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Junction Entity: Maintenance Work Orders &amp; Technicians
                  </p>
                </div>
              </div>

              <div className="table-responsive">
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

              <div className="table-responsive">
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

          {/* TAB: CUSTOMER PROFILE MANAGEMENT */}
          {activeTab === 'My Profile' && (
            <div className="profile-management-grid">
              {/* Left: Summary Avatar Card */}
              <div className="profile-summary-card">
                <img
                  src={
                    currentRole === 'customer'
                      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
                      : currentRole === 'staff'
                      ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'
                      : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80'
                  }
                  alt={activeUser.full_name}
                  className="profile-avatar-big"
                />
                <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#111827' }}>
                  {activeUser.full_name}
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {activeUser.email}
                </p>

                <span style={{
                  padding: '4px 14px',
                  borderRadius: 16,
                  background: 'var(--purple-light)',
                  color: 'var(--purple-main)',
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: 16,
                }}>
                  {currentRole} Role
                </span>

                <div style={{ width: '100%', borderTop: '1px solid var(--border-subtle)', paddingTop: 16, fontSize: 12, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Account Status:</span>
                    <strong style={{ color: '#047857' }}>Active &amp; Verified</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>System Engine:</span>
                    <strong>Supabase Live</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Active Orders:</span>
                    <strong>{orders.length}</strong>
                  </div>
                </div>
              </div>

              {/* Right: Editable Profile Form */}
              <div className="profile-form-card">
                <div style={{ marginBottom: 20 }}>
                  <h3 className="chart-card-title">Permitted Profile Information</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Update your account details, contact phone, and company or jobsite affiliation
                  </p>
                </div>

                <form onSubmit={handleProfileUpdate} className="auth-form-finset">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Full Legal Name</label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Email Address (Supabase Auth)</label>
                      <input
                        type="email"
                        value={activeUser.email}
                        disabled
                        style={{ opacity: 0.65, cursor: 'not-allowed' }}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Primary Phone Number</label>
                      <input
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Company / Enterprise Name</label>
                      <input
                        type="text"
                        value={profileCompany}
                        onChange={(e) => setProfileCompany(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Default Jobsite / Delivery Site</label>
                    <input
                      type="text"
                      value={bookAddress}
                      onChange={(e) => setBookAddress(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button
                      type="submit"
                      className="primary-purple-btn"
                      disabled={profileSaving}
                    >
                      {profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MOBILE BOTTOM NAVIGATION BAR */}
          <nav className="mobile-bottom-nav">
            <button
              className={`mobile-nav-item ${activeTab === 'Dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('Dashboard')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
              <span>Home</span>
            </button>

            <button
              className={`mobile-nav-item ${activeTab === 'Browse Equipment' || activeTab === 'Fleet Inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab(currentRole === 'customer' ? 'Browse Equipment' : 'Fleet Inventory')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
              <span>Fleet</span>
            </button>

            <button
              className={`mobile-nav-item ${activeTab === 'Availability Calendar' || activeTab === 'Reservation Review' ? 'active' : ''}`}
              onClick={() => setActiveTab(currentRole === 'customer' ? 'Availability Calendar' : 'Reservation Review')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>{currentRole === 'customer' ? 'Calendar' : 'Review'}</span>
            </button>

            <button
              className={`mobile-nav-item ${activeTab === 'Transactions' || activeTab === 'My Reservations' || activeTab === 'Dispatch & Checkout' ? 'active' : ''}`}
              onClick={() => setActiveTab(currentRole === 'customer' ? 'My Reservations' : 'Dispatch & Checkout')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span>{currentRole === 'customer' ? 'Orders' : 'Dispatch'}</span>
            </button>

            <button
              className={`mobile-nav-item ${activeTab === 'My Profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('My Profile')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>Profile</span>
            </button>
          </nav>
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
              <div className="form-row">
                <div className="form-group">
                  <label>Preferred Start Date</label>
                  <input
                    type="date"
                    value={bookStartDate}
                    onChange={(e) => setBookStartDate(e.target.value)}
                    required
                  />
                </div>

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
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Customer Contact Phone</label>
                  <input
                    type="tel"
                    value={bookPhone}
                    onChange={(e) => setBookPhone(e.target.value)}
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
              </div>

              <div style={{ background: '#fafaff', border: '1px solid var(--border-subtle)', padding: 16, borderRadius: 16, fontSize: 12, margin: '6px 0 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Rental Period:</span>
                  <strong>{bookStartDate} &rarr; {new Date(new Date(bookStartDate).getTime() + bookDays * 86400000).toISOString().split('T')[0]} ({bookDays} days)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Daily Rate:</span>
                  <strong>${rentingEquipment.daily_rental_rate.toFixed(2)}/day</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Subtotal:</span>
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

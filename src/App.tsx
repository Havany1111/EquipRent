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
  getCurrentUserProfile,
  logoutUser,
  updateUserProfile,
} from './lib/supabase';
import { AuthScreen } from './components/AuthScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { formatPHP, formatPhilippinePhone } from './lib/formatters';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  // Authentication & Session State from Supabase
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [dashboardDataLoaded, setDashboardDataLoaded] = useState(false);

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

  const handleLogout = async () => {
    try {
      await logoutUser();
      setCurrentUser(null);
      setDashboardDataLoaded(false);
      showToast('Signed out of session.');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All equipment');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reservationUpdating, setReservationUpdating] = useState(false);
  const [dataLoadError, setDataLoadError] = useState('');

  // Domain data states (100% Pure Supabase)
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<RentalOrder[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modal states
  const [rentingEquipment, setRentingEquipment] = useState<Equipment | null>(null);
  const [returningItemId, setReturningItemId] = useState<string | null>(null);

  // Booking form state
  const [bookDays, setBookDays] = useState('');
  const [bookStartDate, setBookStartDate] = useState(toDateInputValue(new Date()));
  const [bookAddress, setBookAddress] = useState('');

  // Availability Calendar state
  const [calEquipId, setCalEquipId] = useState<string>('');
  const [calSelectedDate, setCalSelectedDate] = useState<string>(toDateInputValue(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  // Customer Profile Form state
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Sync profile form when user changes
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.full_name);
      setProfilePhone(currentUser.phone);
      setProfileCompany(currentUser.company_name || '');
    }
  }, [currentUser]);

  // Return inspection form state
  const [returnOdometer, setReturnOdometer] = useState('');
  const [returnFuel, setReturnFuel] = useState('');
  const [returnCleanliness, setReturnCleanliness] = useState('');
  const [returnIntegrity, setReturnIntegrity] = useState('');
  const [damageNotes, setDamageNotes] = useState<string>('');
  const [penaltyFee, setPenaltyFee] = useState('');

  // Load all database entities directly from Supabase
  const reloadData = async () => {
    if (!currentUser) return;
    try {
      const [eq, ord, maint, logs] = await Promise.all([
        fetchEquipmentList(),
        fetchRentalOrders(currentRole === 'customer' ? currentUser.id : undefined),
        currentRole === 'customer' ? Promise.resolve([]) : fetchMaintenanceRecords(),
        currentRole === 'admin' ? fetchAuditLogs() : Promise.resolve([]),
      ]);
      setEquipmentList(eq);
      if (eq.length > 0 && !calEquipId) {
        setCalEquipId(eq[0].id);
      }
      setOrders(ord);
      setMaintenance(maint);
      setAuditLogs(logs);
      setDataLoadError('');
    } catch (e: unknown) {
      console.error('Supabase reloadData error:', e);
      setDataLoadError(
        e instanceof Error ? e.message : 'Could not load data from Supabase.'
      );
    } finally {
      setDashboardDataLoaded(true);
    }
  };

  useEffect(() => {
    if (currentUser) {
      reloadData();
    }
  }, [currentUser]);

  // Computed live metrics from Supabase database
  const totalFleet = equipmentList.length;
  const maximumDailyRate = Math.max(...equipmentList.map((item) => item.daily_rental_rate), 0);
  const availableEquipment = useMemo(() => equipmentList.filter((e) => e.current_status === 'available'), [equipmentList]);
  const rentedEquipment = useMemo(() => equipmentList.filter((e) => e.current_status === 'rented'), [equipmentList]);
  const maintenanceEquipment = useMemo(() => equipmentList.filter((e) => e.current_status === 'under_maintenance'), [equipmentList]);

  const totalFleetValuation = useMemo(() => {
    return equipmentList.reduce((acc, e) => acc + e.replacement_value, 0);
  }, [equipmentList]);

  const totalRentalRevenue = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + o.total_amount, 0);
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
      const cat = item.category?.category_name || 'Uncategorized';
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
        { label: 'Dashboard' },
        { label: 'Browse Equipment' },
        { label: 'Availability Calendar' },
        { label: 'My Reservations', badge: orders.length ? String(orders.length) : undefined },
        { label: 'My Profile' },
      ];
    }
    if (currentRole === 'staff') {
      const pendingReviewCount = orders.filter((o) => o.status === 'draft').length;
      return [
        { label: 'Dashboard' },
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
      { label: 'Dashboard' },
      { label: 'Fleet Inventory' },
      { label: 'Reservation Review' },
      { label: 'Maintenance Oversight' },
      { label: 'Engine Audit Logs', badge: auditLogs.length ? String(auditLogs.length) : undefined },
      { label: 'My Profile' },
    ];
  }, [currentRole, orders, maintenance.length, auditLogs.length]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentingEquipment || !currentUser) return;
    try {
      const parsedDays = Number(bookDays);
      if (bookDays === '' || !Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 30) {
        throw new Error('Rental duration must be between 1 and 30 days.');
      }
      if (!bookAddress.trim()) {
        throw new Error('Enter the job site or delivery address.');
      }
      const start = new Date(`${bookStartDate}T00:00:00`);
      if (Number.isNaN(start.getTime())) {
        throw new Error('Choose a valid rental start date.');
      }
      const end = new Date(start.getTime() + parsedDays * 86400000);
      const dailyInsuranceRate = rentingEquipment.category?.base_daily_insurance_rate;
      if (dailyInsuranceRate === undefined) {
        throw new Error('This equipment has no insurance rate configured in Supabase.');
      }
      await createRentalOrder({
        customerId: currentUser.id,
        equipmentId: rentingEquipment.id,
        unitDailyRate: rentingEquipment.daily_rental_rate,
        dailyInsuranceRate,
        days: parsedDays,
        startDate: toDateInputValue(start),
        endDate: toDateInputValue(end),
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
      if (!currentUser) return;
      const updated = await updateUserProfile({
        id: currentUser.id,
        fullName: profileName,
        phone: formatPhilippinePhone(profilePhone),
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
    if (!currentUser) return;
    try {
      await executeRentalDispatch(orderId, currentUser.id);
      showToast('Dispatched: Status updated to active in Supabase!');
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Dispatch failed');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningItemId || !currentUser) return;
    try {
      if (returnOdometer === '' || returnFuel === '' || returnCleanliness === '' || returnIntegrity === '') {
        throw new Error('Enter the observed odometer, fuel level, cleanliness, and integrity before submitting.');
      }
      const parsedOdometer = Number(returnOdometer);
      const parsedFuel = Number(returnFuel);
      const parsedCleanliness = Number(returnCleanliness);
      const parsedIntegrity = Number(returnIntegrity);
      const parsedPenaltyFee = penaltyFee === '' ? 0 : Number(penaltyFee);
      if (
        !Number.isFinite(parsedOdometer) || parsedOdometer < 0 ||
        !Number.isInteger(parsedFuel) || parsedFuel < 0 || parsedFuel > 100 ||
        !Number.isInteger(parsedCleanliness) || parsedCleanliness < 1 || parsedCleanliness > 5 ||
        !Number.isInteger(parsedIntegrity) || parsedIntegrity < 1 || parsedIntegrity > 5 ||
        !Number.isFinite(parsedPenaltyFee) || parsedPenaltyFee < 0
      ) {
        throw new Error('Enter valid inspection values within the displayed ranges.');
      }
      const res = await executeEquipmentReturn({
        orderItemId: returningItemId,
        returnOdometer: parsedOdometer,
        fuelLevel: parsedFuel,
        cleanliness: parsedCleanliness,
        integrity: parsedIntegrity,
        inspectorId: currentUser.id,
        damageNotes: damageNotes || undefined,
        penaltyFee: parsedPenaltyFee,
      });
      showToast(
        res.maintenanceCreated
          ? 'Damage flagged: Work order logged directly in Supabase maintenance_records!'
          : 'Equipment inspected, returned & status set to Available in Supabase!'
      );
      setReturningItemId(null);
      setReturnOdometer('');
      setReturnFuel('');
      setReturnCleanliness('');
      setReturnIntegrity('');
      setDamageNotes('');
      setPenaltyFee('');
      await reloadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Return inspection failed');
    }
  };

  const visibleEquipment = useMemo(() => {
    return equipmentList.filter((item) => {
        const matchesCat =
        category === 'All equipment' || item.category?.category_name === category;
      const matchesQuery =
        item.model_name.toLowerCase().includes(query.toLowerCase()) ||
        item.manufacturer.toLowerCase().includes(query.toLowerCase());
      const matchesPrice = maxPrice === null || item.daily_rental_rate <= maxPrice;
      return matchesCat && matchesQuery && matchesPrice;
    });
  }, [equipmentList, category, query, maxPrice]);

  const selectedCalEquip = useMemo(() => {
    return equipmentList.find((e) => e.id === calEquipId) || equipmentList[0];
  }, [equipmentList, calEquipId]);
  const isEquipmentBookedOnDate = (equipmentId: string, date: string) =>
    orders.some(
      (order) =>
        order.status !== 'cancelled' &&
        order.status !== 'completed' &&
        order.items?.some((item) => item.equipment_id === equipmentId) &&
        order.expected_start_date <= date &&
        date <= order.expected_end_date
    );
  const hasMaintenanceOnDate = (equipmentId: string, date: string) =>
    maintenance.some(
      (record) =>
        record.equipment_id === equipmentId &&
        record.scheduled_date === date &&
        record.maintenance_status !== 'completed' &&
        record.maintenance_status !== 'cancelled'
    );
  const todayDate = toDateInputValue(new Date());
  const selectedDateBlocked = Boolean(
    selectedCalEquip &&
      (selectedCalEquip.current_status === 'decommissioned' ||
      selectedCalEquip.current_status === 'under_maintenance' ||
      isEquipmentBookedOnDate(selectedCalEquip.id, calSelectedDate) ||
        hasMaintenanceOnDate(selectedCalEquip.id, calSelectedDate) ||
        (calSelectedDate === todayDate && selectedCalEquip.current_status !== 'available'))
  );
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarMonthLabel = calendarMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const calendarDates = Array.from({ length: 42 }, (_, index) =>
    new Date(calendarYear, calendarMonthIndex, index - new Date(calendarYear, calendarMonthIndex, 1).getDay() + 1)
  );
  const bookingInsuranceRate = rentingEquipment?.category?.base_daily_insurance_rate;
  const bookingDays = Number(bookDays) || 0;
  const bookingSubtotal = rentingEquipment ? rentingEquipment.daily_rental_rate * bookingDays : 0;
  const bookingInsurance = (bookingInsuranceRate ?? 0) * bookingDays;
  const bookingTax = Math.round((bookingSubtotal + bookingInsurance) * 0.08 * 100) / 100;

  if (!isSupabaseConfigured) {
    return <AuthScreen onAuthenticated={setCurrentUser} />;
  }

  if (authChecking) {
    return <LoadingScreen message="Restoring your session..." />;
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

  if (!dashboardDataLoaded) {
    return <LoadingScreen message="Loading your dashboard..." />;
  }

  const activeUser = currentUser;

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
          {dataLoadError && (
            <div role="alert" style={{ padding: 12, marginBottom: 16, borderRadius: 12, background: 'var(--red-bg)', color: 'var(--red-kpi)' }}>
              Could not load the latest Supabase data: {dataLoadError}
            </div>
          )}
          {activeUser.requested_role && activeUser.role !== activeUser.requested_role && (
            <div role="status" style={{ padding: 12, marginBottom: 16, borderRadius: 12, background: 'var(--purple-light)', color: 'var(--purple-main)' }}>
              Your request for the {activeUser.requested_role} role is pending administrator approval. Your current access remains Customer.
            </div>
          )}

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
                <span>Data Integrity</span>
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
                    <span className="kpi-pill green">{formatPHP(totalFleetValuation)} Value</span>
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
                    {formatPHP(totalRentalRevenue)}
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
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.model_name}
                                  style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }}
                                />
                              ) : (
                                <div className="fleet-image-placeholder" aria-hidden="true">
                                  {item.model_name.slice(0, 1)}
                                </div>
                              )}
                              <div>
                                <h5 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#111827' }}>
                                  {item.model_name}
                                </h5>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {formatPHP(item.daily_rental_rate)}/day &bull; {item.manufacturer}
                                </span>
                              </div>
                            </div>

                            <button
                              className="reserve-purple-btn"
                              style={{ padding: '6px 14px', fontSize: 11 }}
                              onClick={() => {
                                setRentingEquipment(item);
                                setBookStartDate(toDateInputValue(new Date()));
                              }}
                            >
                              Reserve
                            </button>
                          </div>
                        ))}

                        {availableEquipment.length === 0 && equipmentList.length > 0 && (
                          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 18 }}>
                            No equipment is currently available to rent.
                          </p>
                        )}
                        {equipmentList.length === 0 && (
                          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 18 }}>
                            No equipment is listed in Supabase yet.
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
                            <td>{ord.customer?.full_name || '—'}</td>
                            <td>{ord.expected_start_date} &rarr; {ord.expected_end_date}</td>
                            <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                              {formatPHP(ord.total_amount)}
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
                            {formatPHP(item.daily_rental_rate)}/day &bull; {item.manufacturer}
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
                    placeholder="Search by model or manufacturer..."
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
                    {Object.keys(categoriesMap).sort().map((categoryName) => (
                      <option key={categoryName} value={categoryName}>{categoryName}</option>
                    ))}
                  </select>

                  <div className="price-slider-wrap">
                    <label htmlFor="max-daily-rate">Max price (PHP)/day</label>
                    <input
                      id="max-daily-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={maxPrice ?? ''}
                      placeholder={String(maximumDailyRate)}
                      disabled={equipmentList.length === 0}
                      onChange={(e) =>
                        setMaxPrice(e.target.value === '' ? null : Number(e.target.value))
                      }
                      aria-label="Maximum daily rental price in Philippine pesos"
                    />
                  </div>
                </div>
              </div>

              <div className="fleet-cards-grid">
                {visibleEquipment.map((item) => (
                  <div className="fleet-unit-card" key={item.id}>
                    <div className="fleet-card-img-wrap">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.model_name} />
                      ) : (
                        <div className="fleet-image-placeholder" aria-label="No equipment image available">
                          {item.model_name.slice(0, 1)}
                        </div>
                      )}
                    </div>

                    <div className="fleet-card-body">
                      <span className="fleet-cat-badge">
                        {item.category?.category_name || 'Uncategorized'}
                      </span>
                      <h4 className="fleet-model-title">{item.model_name}</h4>

                      <div className="fleet-card-footer">
                        <div className="fleet-price-text">
                          {formatPHP(item.daily_rental_rate)} <span>/ day</span>
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
                                setBookStartDate(toDateInputValue(new Date()));
                              }}
                              style={{ opacity: item.current_status === 'available' ? 1 : 0.4 }}
                            >
                              Reserve
                            </button>
                          ) : (
                            <button
                              className="reserve-purple-btn"
                              onClick={async () => {
                                try {
                                  await updateEquipmentStatus(
                                    item.id,
                                    item.current_status === 'available' ? 'under_maintenance' : 'available'
                                  );
                                  showToast('Equipment status updated.');
                                  await reloadData();
                                } catch (error: unknown) {
                                  showToast(error instanceof Error ? error.message : 'Could not update equipment status.');
                                }
                              }}
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
                        {eq.model_name} ({formatPHP(eq.daily_rental_rate)}/day)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Month Header and Legend */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '0 4px', flexWrap: 'wrap', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                  {calendarMonthLabel} &bull; {selectedCalEquip?.model_name || 'Select equipment'}
                </h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="outline-pill-btn"
                    aria-label="Previous month"
                    onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="outline-pill-btn"
                    aria-label="Next month"
                    onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1))}
                  >
                    Next
                  </button>
                </div>
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
                {calendarDates.map((date) => {
                  const dateStr = toDateInputValue(date);
                  const isSelected = calSelectedDate === dateStr;
                  const isCurrentMonth = date.getMonth() === calendarMonthIndex;
                  const isBooked = isEquipmentBookedOnDate(calEquipId, dateStr);
                  const isMaintenance = hasMaintenanceOnDate(calEquipId, dateStr);
                  const isUnavailable = Boolean(
                    selectedCalEquip &&
                      (selectedCalEquip.current_status === 'decommissioned' ||
                        selectedCalEquip.current_status === 'under_maintenance' ||
                        (dateStr === todayDate && selectedCalEquip.current_status !== 'available'))
                  );

                  return (
                    <div
                      key={dateStr}
                      className={`calendar-day-cell ${isCurrentMonth ? '' : 'other-month'} ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setCalSelectedDate(dateStr);
                        setBookStartDate(dateStr);
                      }}
                    >
                      <span className="day-num">{date.getDate()}</span>
                      {isMaintenance ? (
                        <span className="calendar-chip maintenance">Service</span>
                      ) : isBooked ? (
                        <span className="calendar-chip booked">Rented</span>
                      ) : isUnavailable ? (
                        <span className="calendar-chip booked">Unavailable</span>
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
                      Daily Rate: <strong>{formatPHP(selectedCalEquip.daily_rental_rate)}/day</strong> &bull; Current Status: <strong style={{ color: selectedCalEquip.current_status === 'available' ? '#047857' : '#b45309', textTransform: 'capitalize' }}>{selectedCalEquip.current_status}</strong>
                    </p>
                  </div>

                  <button
                    className="primary-purple-btn"
                    disabled={selectedDateBlocked}
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
                      <th>INSURANCE</th>
                      <th>TOTAL DUE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.order_number}</strong></td>
                        <td>{o.expected_start_date} &rarr; {o.expected_end_date}</td>
                        <td>{o.delivery_address || '—'}</td>
                        <td>{formatPHP(o.subtotal_amount)}</td>
                        <td>{formatPHP(o.insurance_amount)}</td>
                        <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                          {formatPHP(o.total_amount)}
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
                      const equipName = ord.items?.[0]?.equipment?.model_name || '—';
                      return (
                        <tr key={ord.id}>
                          <td><strong>{ord.order_number}</strong></td>
                          <td>
                            <div><strong>{ord.customer?.full_name || '—'}</strong></div>
                            <small style={{ color: 'var(--text-muted)' }}>
                              {ord.customer?.phone ? formatPhilippinePhone(ord.customer.phone) : 'No phone on file'}
                            </small>
                          </td>
                          <td>{equipName}</td>
                          <td>{ord.expected_start_date} &rarr; {ord.expected_end_date}</td>
                          <td style={{ fontWeight: 800, color: 'var(--purple-main)' }}>
                            {formatPHP(ord.total_amount)}
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
                        <td>{ord.customer?.full_name || '—'}</td>
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
                        <td><strong>{item.equipment?.model_name || '—'}</strong></td>
                        <td>
                          <span style={{ padding: '3px 10px', borderRadius: 12, background: 'var(--purple-light)', color: 'var(--purple-main)', fontSize: 10, fontWeight: 700 }}>
                            {item.item_status}
                          </span>
                        </td>
                        <td>{item.dispatch_odometer_hours ?? '—'}{item.dispatch_odometer_hours == null ? '' : ' hrs'}</td>
                        <td>
                          {item.item_status === 'dispatched' ? (
                            <button
                              className="primary-purple-btn"
                              style={{ padding: '6px 14px', fontSize: 11 }}
                              onClick={() => {
                                setReturningItemId(item.id);
                                setReturnOdometer('');
                                setReturnFuel('');
                                setReturnCleanliness('');
                                setReturnIntegrity('');
                                setDamageNotes('');
                                setPenaltyFee('');
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
                        <td>{m.equipment?.model_name || '—'}</td>
                        <td>{m.maintenance_type}</td>
                        <td>{m.odometer_hours_at_service} hrs</td>
                        <td style={{ fontWeight: 800 }}>{formatPHP(m.total_maintenance_cost)}</td>
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

          {/* TAB: DATA INTEGRITY */}
          {activeTab === 'Architectural Defense Lab' && (
            <div className="transactions-table-card" style={{ marginTop: 6 }}>
              <div className="table-card-header">
                <div>
                  <h3 className="chart-card-title">Database Integrity</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Live records are protected by database constraints.
                  </p>
                </div>
              </div>
              <p style={{ padding: 18, color: 'var(--text-muted)' }}>
                Equipment linked to rental items cannot be deleted while those records exist. No destructive test is run against your Supabase data.
              </p>
            </div>
          )}

          {/* TAB: CUSTOMER PROFILE MANAGEMENT */}
          {activeTab === 'My Profile' && (
            <div className="profile-management-grid">
              {/* Left: Summary Avatar Card */}
              <div className="profile-summary-card">
                <div className="profile-avatar-big" aria-hidden="true">
                  {activeUser.full_name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join('')}
                </div>
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
                    <strong style={{ color: activeUser.account_status === 'active' ? '#047857' : '#b91c1c' }}>
                      {activeUser.account_status}
                    </strong>
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
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={16}
                        placeholder="+63 912 345 6789"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        onBlur={() => setProfilePhone((value) => formatPhilippinePhone(value))}
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
              {formatPHP(rentingEquipment.daily_rental_rate)}/day &bull; Replacement Value: {formatPHP(rentingEquipment.replacement_value)}
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
                    onChange={(e) => setBookDays(e.target.value)}
                    required
                  />
                </div>
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
                  <span>Rental Period:</span>
                  <strong>{bookStartDate} &rarr; {bookStartDate && bookDays ? toDateInputValue(new Date(new Date(`${bookStartDate}T00:00:00`).getTime() + bookingDays * 86400000)) : '—'} ({bookDays || '—'} days)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Daily Rate:</span>
                  <strong>{formatPHP(rentingEquipment.daily_rental_rate)}/day</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Subtotal:</span>
                  <strong>{formatPHP(bookingSubtotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Insurance:</span>
                  <span>{bookingInsuranceRate === undefined ? 'Not configured' : formatPHP(bookingInsurance)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span>Tax (8%):</span>
                  <span>{formatPHP(bookingTax)}</span>
                </div>
                <hr style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: 'var(--purple-main)' }}>
                  <span>Total Amount:</span>
                  <span>{formatPHP(bookingSubtotal + bookingInsurance + bookingTax)}</span>
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
                <button type="submit" className="primary-purple-btn" disabled={bookingInsuranceRate === undefined}>
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
                  min="0"
                  value={returnOdometer}
                  onChange={(e) => setReturnOdometer(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Fuel Level (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={returnFuel}
                  onChange={(e) => setReturnFuel(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Cleanliness Rating</label>
                <select
                  className="filter-select-pill"
                  value={returnCleanliness}
                  onChange={(e) => setReturnCleanliness(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px' }}
                  required
                >
                  <option value="">Select observed condition</option>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>{rating} / 5</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Structural Integrity</label>
                <select
                  className="filter-select-pill"
                  value={returnIntegrity}
                  onChange={(e) => setReturnIntegrity(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px' }}
                  required
                >
                  <option value="">Select observed condition</option>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>{rating} / 5</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Damage Notes</label>
                <textarea
                  rows={2}
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder="Record any damage found during inspection"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border-input)', background: '#fafaff' }}
                />
              </div>

              <div className="form-group">
                <label>Damage Penalty Fee (PHP)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={penaltyFee}
                  onChange={(e) => setPenaltyFee(e.target.value)}
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

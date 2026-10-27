import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Equipment,
  EquipmentCategory,
  RentalOrder,
  MaintenanceRecord,
  AuditLog,
  UserProfile,
  EquipmentStatus,
  RentalOrderStatus,
} from '../types/database';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string) ||
  'https://zzznxdjzjgkxbpmqnkyj.supabase.co';

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string) ||
  'sb_publishable_k8bP82-nNojy6BMtzg9r0w_xx9RHtwq';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

console.info('🚀 EquipRent: Pure Direct Supabase Connection Live at', supabaseUrl);

/* =========================================================================
   EQUIPMENT DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchEquipmentList(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*, category:equipment_categories(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetchEquipmentList error:', error.message);
    throw new Error(error.message);
  }
  return (data as Equipment[]) || [];
}

export async function fetchEquipmentCategories(): Promise<EquipmentCategory[]> {
  const { data, error } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('category_name');

  if (error) {
    console.error('Supabase fetchEquipmentCategories error:', error.message);
    return [];
  }
  return (data as EquipmentCategory[]) || [];
}

export async function updateEquipmentStatus(
  equipmentId: string,
  newStatus: EquipmentStatus
): Promise<void> {
  const { error } = await supabase
    .from('equipment')
    .update({
      current_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', equipmentId);

  if (error) {
    console.error('Supabase updateEquipmentStatus error:', error.message);
    throw new Error(error.message);
  }
}

/* =========================================================================
   RENTAL ORDERS DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchRentalOrders(customerId?: string): Promise<RentalOrder[]> {
  let query = supabase
    .from('rental_orders')
    .select('*, items:rental_order_items(*, equipment(*)), customer:user_profiles!customer_id(*)')
    .order('created_at', { ascending: false });

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Supabase fetchRentalOrders error:', error.message);
    throw new Error(error.message);
  }
  return (data as RentalOrder[]) || [];
}

export async function createRentalOrder(params: {
  customerId: string;
  equipmentId: string;
  unitDailyRate: number;
  days: number;
  startDate: string;
  endDate: string;
  deliveryAddress: string;
}): Promise<RentalOrder> {
  const orderNumber = `ORD-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  const subtotal = params.unitDailyRate * params.days;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const deposit = 500;
  const total = subtotal + tax + deposit;

  // 1. Insert order header
  const { data: orderData, error: orderErr } = await supabase
    .from('rental_orders')
    .insert([
      {
        order_number: orderNumber,
        customer_id: params.customerId,
        status: 'draft',
        expected_start_date: params.startDate,
        expected_end_date: params.endDate,
        subtotal_amount: subtotal,
        tax_amount: tax,
        security_deposit_amount: deposit,
        total_amount: total,
        payment_status: 'paid',
        delivery_address: params.deliveryAddress,
      },
    ])
    .select()
    .single();

  if (orderErr) {
    console.error('Supabase createRentalOrder error:', orderErr.message);
    throw new Error(orderErr.message);
  }

  // 2. Insert order child item
  const { error: itemErr } = await supabase.from('rental_order_items').insert([
    {
      rental_order_id: orderData.id,
      equipment_id: params.equipmentId,
      unit_daily_rate: params.unitDailyRate,
      days_rented: params.days,
      daily_insurance_rate: 35.0,
      item_subtotal: subtotal,
      item_status: 'reserved',
    },
  ]);

  if (itemErr) {
    console.error('Supabase rental_order_items insert error:', itemErr.message);
    throw new Error(itemErr.message);
  }

  return orderData as RentalOrder;
}

export async function updateRentalOrderStatus(
  orderId: string,
  newStatus: RentalOrderStatus
): Promise<void> {
  const { data, error } = await supabase
    .from('rental_orders')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Supabase updateRentalOrderStatus error:', error.message);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      'Reservation was not changed. It may no longer be pending, or your signed-in account does not have staff or admin permission.'
    );
  }
}

export async function executeRentalDispatch(
  orderId: string,
  staffId: string
): Promise<void> {
  // Update order status to in_progress
  const { error: ordErr } = await supabase
    .from('rental_orders')
    .update({
      status: 'in_progress',
      authorized_staff_id: staffId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (ordErr) throw new Error(ordErr.message);

  // Update order items to dispatched
  const { error: itemErr } = await supabase
    .from('rental_order_items')
    .update({
      item_status: 'dispatched',
      dispatched_at: new Date().toISOString(),
    })
    .eq('rental_order_id', orderId);

  if (itemErr) throw new Error(itemErr.message);
}

export async function executeEquipmentReturn(params: {
  orderItemId: string;
  equipmentId?: string;
  returnOdometer: number;
  fuelLevel: number;
  cleanliness: number;
  integrity: number;
  inspectorId: string;
  damageNotes?: string;
  penaltyFee?: number;
}): Promise<{ maintenanceCreated: boolean }> {
  const hasDamage = params.integrity <= 2 || Boolean(params.damageNotes) || (params.penaltyFee || 0) > 0;

  // 1. Update item status
  const { error: itemErr } = await supabase
    .from('rental_order_items')
    .update({
      item_status: hasDamage ? 'damaged' : 'returned',
      return_odometer_hours: params.returnOdometer,
      returned_at: new Date().toISOString(),
    })
    .eq('id', params.orderItemId);

  if (itemErr) throw new Error(itemErr.message);

  // 2. If equipmentId provided, update equipment status
  if (params.equipmentId) {
    await supabase
      .from('equipment')
      .update({
        current_status: hasDamage ? 'under_maintenance' : 'available',
        operational_hours: params.returnOdometer,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.equipmentId);
  }

  // 3. If damaged, create maintenance work order directly in Supabase
  if (hasDamage && params.equipmentId) {
    const workOrderNumber = `WO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    await supabase.from('maintenance_records').insert([
      {
        work_order_number: workOrderNumber,
        equipment_id: params.equipmentId,
        lead_technician_id: params.inspectorId,
        maintenance_type: 'emergency_repair',
        maintenance_status: 'pending',
        odometer_hours_at_service: params.returnOdometer,
        scheduled_date: new Date().toISOString().split('T')[0],
        total_maintenance_cost: params.penaltyFee || 350.0,
        description: params.damageNotes || 'Structural or operational repair flagged during return inspection.',
      },
    ]);
  }

  return { maintenanceCreated: hasDamage };
}

/* =========================================================================
   MAINTENANCE DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select('*, equipment(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetchMaintenanceRecords error:', error.message);
    return [];
  }
  return (data as MaintenanceRecord[]) || [];
}

/* =========================================================================
   AUDIT LOGS DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Supabase fetchAuditLogs error:', error.message);
    return [];
  }
  return (data as AuditLog[]) || [];
}

/* =========================================================================
   AUTHENTICATION & PROFILE DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    localStorage.removeItem('equiprent_active_user');
    return null;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Your authenticated account does not have an EquipRent profile.');
  }

  return data as UserProfile;
}

export async function loginWithEmail(
  email: string,
  pass: string
): Promise<{ profile: UserProfile }> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (authError) {
    throw new Error(authError.message);
  }

  if (!authData.user) {
    throw new Error('Supabase did not return an authenticated user.');
  }

  const { data: profileData, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .or(`auth_user_id.eq.${authData.user.id},email.eq.${authData.user.email}`)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profileData) {
    throw new Error('Authenticated account found, but no EquipRent profile is linked to it.');
  }

  localStorage.setItem('equiprent_active_user', JSON.stringify(profileData));
  return { profile: profileData as UserProfile };
}

export async function signUpWithProfile(params: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  companyName: string;
}): Promise<{ profile: UserProfile; message?: string }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        full_name: params.fullName,
        phone: params.phone,
        company_name: params.companyName,
      },
    },
  });

  if (authError) {
    throw new Error(authError.message);
  }

  if (!authData.user) {
    throw new Error('Supabase did not return a user after registration.');
  }

  if (!authData.session) {
    throw new Error(
      'Confirm your email, then sign in before continuing. Reservation actions require an authenticated Supabase session.'
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error(
      'Your account was created, but its EquipRent profile was not. Run the authentication setup SQL, then sign in again.'
    );
  }

  localStorage.setItem('equiprent_active_user', JSON.stringify(profile));
  return {
    profile: profile as UserProfile,
    message: 'Account successfully registered and saved directly to Supabase!',
  };
}

export async function logoutUser(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  localStorage.removeItem('equiprent_active_user');
}

export async function updateUserProfile(params: {
  id: string;
  fullName: string;
  phone: string;
  companyName: string;
}): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      full_name: params.fullName,
      phone: params.phone,
      company_name: params.companyName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const updated = data as UserProfile;
  localStorage.setItem('equiprent_active_user', JSON.stringify(updated));
  return updated;
}

export async function runParentDeletionStressTest(equipmentId: string): Promise<{
  success: boolean;
  message: string;
  sqlConstraint: string;
}> {
  const { error } = await supabase.from('equipment').delete().eq('id', equipmentId);
  if (error) {
    return {
      success: false,
      message: `Database caught constraint: ${error.message}`,
      sqlConstraint: 'FOREIGN KEY ON DELETE RESTRICT on child table rental_order_items',
    };
  }
  return {
    success: true,
    message: 'Deleted equipment record',
    sqlConstraint: 'RESTRICT constraint not triggered',
  };
}

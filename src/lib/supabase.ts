import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Equipment,
  EquipmentCategory,
  RentalOrder,
  MaintenanceRecord,
  AuditLog,
  UserProfile,
  UserRole,
  EquipmentStatus,
  RentalOrderStatus,
} from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const supabaseClient: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart Vite.'
    );
  }
  return supabaseClient;
}

if (isSupabaseConfigured) {
  console.info('EquipRent connected to the configured Supabase project.');
} else {
  console.error('EquipRent is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

/* =========================================================================
   EQUIPMENT DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchEquipmentList(): Promise<Equipment[]> {
  const { data, error } = await getSupabaseClient()
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
  const { data, error } = await getSupabaseClient()
    .from('equipment_categories')
    .select('*')
    .order('category_name');

  if (error) {
    console.error('Supabase fetchEquipmentCategories error:', error.message);
    throw new Error(error.message);
  }
  return (data as EquipmentCategory[]) || [];
}

export async function updateEquipmentStatus(
  equipmentId: string,
  newStatus: EquipmentStatus
): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('equipment')
    .update({
      current_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', equipmentId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Supabase updateEquipmentStatus error:', error.message);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Equipment status was not changed. Check your account permissions.');
  }
}

/* =========================================================================
   RENTAL ORDERS DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchRentalOrders(customerId?: string): Promise<RentalOrder[]> {
  let query = getSupabaseClient()
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
  dailyInsuranceRate: number;
  days: number;
  startDate: string;
  endDate: string;
  deliveryAddress: string;
}): Promise<RentalOrder> {
  const orderNumber = `ORD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const subtotal = params.unitDailyRate * params.days;

  // 1. Insert order header
  const { data: orderData, error: orderErr } = await getSupabaseClient()
    .from('rental_orders')
    .insert([
      {
        order_number: orderNumber,
        customer_id: params.customerId,
        status: 'draft',
        expected_start_date: params.startDate,
        expected_end_date: params.endDate,
        subtotal_amount: subtotal,
        insurance_amount: params.dailyInsuranceRate * params.days,
        tax_amount: 0,
        security_deposit_amount: 0,
        total_amount: 0,
        payment_status: 'unpaid',
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
  const { error: itemErr } = await getSupabaseClient().from('rental_order_items').insert([
    {
      rental_order_id: orderData.id,
      equipment_id: params.equipmentId,
      unit_daily_rate: params.unitDailyRate,
      days_rented: params.days,
      daily_insurance_rate: params.dailyInsuranceRate,
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
  const { data, error } = await getSupabaseClient()
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
  const { data, error } = await getSupabaseClient().rpc('sp_process_rental_checkout', {
    p_order_id: orderId,
    p_staff_id: staffId,
  });
  if (error) {
    console.error('Supabase rental dispatch error:', error.message);
    throw new Error(error.message);
  }
  if (!data || typeof data !== 'object' || data.success !== true) {
    throw new Error('Supabase did not confirm the equipment dispatch.');
  }
}

export async function executeEquipmentReturn(params: {
  orderItemId: string;
  returnOdometer: number;
  fuelLevel: number;
  cleanliness: number;
  integrity: number;
  inspectorId: string;
  damageNotes?: string;
  penaltyFee?: number;
}): Promise<{ maintenanceCreated: boolean }> {
  const { data, error } = await getSupabaseClient().rpc('sp_process_equipment_return', {
    p_order_item_id: params.orderItemId,
    p_return_odometer: params.returnOdometer,
    p_fuel_level: params.fuelLevel,
    p_cleanliness: params.cleanliness,
    p_integrity: params.integrity,
    p_inspector_id: params.inspectorId,
    p_damage_notes: params.damageNotes ?? null,
    p_penalty_fee: params.penaltyFee ?? 0,
  });
  if (error) {
    console.error('Supabase return inspection error:', error.message);
    throw new Error(error.message);
  }
  if (!data || typeof data !== 'object' || data.success !== true) {
    throw new Error('Supabase did not confirm the return inspection.');
  }

  return { maintenanceCreated: data.maintenance_work_order_created === true };
}

/* =========================================================================
   MAINTENANCE DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from('maintenance_records')
    .select('*, equipment(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetchMaintenanceRecords error:', error.message);
    throw new Error(error.message);
  }
  return (data as MaintenanceRecord[]) || [];
}

/* =========================================================================
   AUDIT LOGS DIRECT SUPABASE QUERIES
   ========================================================================= */

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await getSupabaseClient()
    .from('audit_logs')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Supabase fetchAuditLogs error:', error.message);
    throw new Error(error.message);
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
  } = await getSupabaseClient().auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    return null;
  }

  const { data, error } = await getSupabaseClient()
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
  const { data: authData, error: authError } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password: pass,
  });

  if (authError) {
    throw new Error(authError.message);
  }

  if (!authData.user) {
    throw new Error('Supabase did not return an authenticated user.');
  }

  const { data: profileData, error: profileError } = await getSupabaseClient()
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

  return { profile: profileData as UserProfile };
}

export async function signUpWithProfile(params: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  companyName: string;
  requestedRole: UserRole;
}): Promise<{ profile: UserProfile; message?: string }> {
  const { data: authData, error: authError } = await getSupabaseClient().auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        full_name: params.fullName,
        phone: params.phone,
        company_name: params.companyName,
        requested_role: params.requestedRole,
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

  const { data: profile, error: profileError } = await getSupabaseClient()
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

  return {
    profile: profile as UserProfile,
    message:
      params.requestedRole === 'customer'
        ? 'Account successfully registered as a customer.'
        : `Account created as a customer. Your ${params.requestedRole} role request is awaiting administrator approval.`,
  };
}

export async function logoutUser(): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw new Error(error.message);
  } catch (error: unknown) {
    console.error('Supabase logout error:', error);
    throw error;
  }
}

export async function updateUserProfile(params: {
  id: string;
  fullName: string;
  phone: string;
  companyName: string;
}): Promise<UserProfile> {
  const { data, error } = await getSupabaseClient()
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
  return updated;
}

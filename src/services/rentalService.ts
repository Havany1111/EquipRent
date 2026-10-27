import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { RentalOrder, RentalOrderItem, UserProfile } from '../types/database';
import { initialCategories } from './equipmentService';

export const mockUsers: UserProfile[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    full_name: 'Alex Morgan',
    email: 'admin@equiprent.com',
    phone: '+1-555-0101',
    company_name: 'EquipRent Headquarters',
    role: 'admin',
    account_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    full_name: 'Marcus Vance',
    email: 'marcus.tech@equiprent.com',
    phone: '+1-555-0102',
    company_name: 'EquipRent Operations',
    role: 'staff',
    account_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c0000000-0000-0000-0000-000000000003',
    full_name: 'Jordan Miller',
    email: 'jordan.miller@buildcorp.com',
    phone: '+1-555-0103',
    company_name: 'Apex Construction LLC',
    role: 'customer',
    account_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let localOrders: RentalOrder[] = [
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    order_number: 'ORD-2026-08101',
    customer_id: mockUsers[2].id,
    authorized_staff_id: mockUsers[1].id,
    status: 'in_progress',
    order_date: new Date(Date.now() - 3 * 86400000).toISOString(),
    expected_start_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    expected_end_date: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
    subtotal_amount: 885.0,
    tax_amount: 70.8,
    security_deposit_amount: 500.0,
    total_amount: 1455.8,
    payment_status: 'paid',
    delivery_address: '740 Quarry Site Road, Golden CO',
    customer: mockUsers[2],
    authorized_staff: mockUsers[1],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'roi-1',
        rental_order_id: 'd1000000-0000-0000-0000-000000000001',
        equipment_id: 'e2000000-0000-0000-0000-000000000002',
        unit_daily_rate: 295.0,
        days_rented: 3,
        daily_insurance_rate: 30.0,
        item_subtotal: 885.0,
        item_status: 'dispatched',
        dispatch_odometer_hours: 185.0,
        dispatched_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
        equipment: {
          id: 'e2000000-0000-0000-0000-000000000002',
          serial_number: 'CTL-TL8-9941',
          model_name: 'Takeuchi TL8 Track Loader',
          manufacturer: 'Takeuchi Mfg.',
          model_year: 2022,
          category_id: initialCategories[1].id,
          warehouse_id: 'b1000000-0000-0000-0000-000000000001',
          daily_rental_rate: 295.0,
          replacement_value: 78000.0,
          operational_hours: 185.0,
          current_status: 'rented',
          maintenance_interval_hours: 200.0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    ],
  },
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    order_number: 'ORD-2026-08102',
    customer_id: mockUsers[2].id,
    authorized_staff_id: mockUsers[1].id,
    status: 'confirmed',
    order_date: new Date(Date.now() - 1 * 86400000).toISOString(),
    expected_start_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    expected_end_date: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0],
    subtotal_amount: 1940.0,
    tax_amount: 155.2,
    security_deposit_amount: 800.0,
    total_amount: 2895.2,
    payment_status: 'partially_paid',
    delivery_address: 'Interstate 70 Bridge Expansion Jobsite',
    customer: mockUsers[2],
    authorized_staff: mockUsers[1],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'roi-2',
        rental_order_id: 'd1000000-0000-0000-0000-000000000002',
        equipment_id: 'e2000000-0000-0000-0000-000000000001',
        unit_daily_rate: 485.0,
        days_rented: 4,
        daily_insurance_rate: 45.0,
        item_subtotal: 1940.0,
        item_status: 'reserved',
        created_at: new Date().toISOString(),
        equipment: {
          id: 'e2000000-0000-0000-0000-000000000001',
          serial_number: 'CAT-320-X8910',
          model_name: 'CAT 320 Hydraulic Excavator',
          manufacturer: 'Caterpillar Inc.',
          model_year: 2023,
          category_id: initialCategories[0].id,
          warehouse_id: 'b1000000-0000-0000-0000-000000000001',
          daily_rental_rate: 485.0,
          replacement_value: 240000.0,
          operational_hours: 412.5,
          current_status: 'available',
          maintenance_interval_hours: 250.0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    ],
  },
];

export async function fetchRentalOrders(filterCustomerId?: string): Promise<RentalOrder[]> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase
      .from('rental_orders')
      .select('*, customer:customer_id(*), authorized_staff:authorized_staff_id(*), items:rental_order_items(*, equipment:equipment_id(*))')
      .order('created_at', { ascending: false });

    if (filterCustomerId) {
      query = query.eq('customer_id', filterCustomerId);
    }

    const { data, error } = await query;
    if (!error && data) {
      return data as RentalOrder[];
    }
  }

  if (filterCustomerId) {
    return localOrders.filter((o) => o.customer_id === filterCustomerId);
  }
  return [...localOrders];
}

export async function executeRentalCheckout(orderId: string, staffId: string) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('sp_process_rental_checkout', {
      p_order_id: orderId,
      p_staff_id: staffId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Local simulated stored procedure
  const order = localOrders.find((o) => o.id === orderId);
  if (!order) throw new Error('Entity Not Found: Order does not exist.');
  if (order.status !== 'draft' && order.status !== 'confirmed') {
    throw new Error(`Invalid State Transition: Order is in status "${order.status}".`);
  }

  order.status = 'in_progress';
  order.authorized_staff_id = staffId;
  order.items?.forEach((item) => {
    item.item_status = 'dispatched';
    item.dispatched_at = new Date().toISOString();
  });

  return {
    success: true,
    order_id: orderId,
    new_status: 'in_progress',
    dispatched_by: staffId,
    dispatched_at: new Date().toISOString(),
  };
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
}) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('sp_process_equipment_return', {
      p_order_item_id: params.orderItemId,
      p_return_odometer: params.returnOdometer,
      p_fuel_level: params.fuelLevel,
      p_cleanliness: params.cleanliness,
      p_integrity: params.integrity,
      p_inspector_id: params.inspectorId,
      p_damage_notes: params.damageNotes || null,
      p_penalty_fee: params.penaltyFee || 0.0,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Local simulated stored procedure
  let targetItem: RentalOrderItem | undefined;
  for (const o of localOrders) {
    const found = o.items?.find((i) => i.id === params.orderItemId);
    if (found) {
      targetItem = found;
      break;
    }
  }

  if (!targetItem) throw new Error('Order item not found');
  const hasDamage = params.integrity <= 2 || Boolean(params.damageNotes) || (params.penaltyFee || 0) > 0;
  targetItem.item_status = hasDamage ? 'damaged' : 'returned';
  targetItem.return_odometer_hours = params.returnOdometer;
  targetItem.returned_at = new Date().toISOString();

  return {
    success: true,
    item_id: params.orderItemId,
    item_status: targetItem.item_status,
    damage_flag: hasDamage,
    penalty_fee: params.penaltyFee || 0,
    maintenance_work_order_created: hasDamage,
  };
}

export async function createRentalOrder(newOrder: {
  customerId: string;
  equipmentId: string;
  unitDailyRate: number;
  days: number;
  startDate: string;
  endDate: string;
  deliveryAddress: string;
}) {
  const orderNumber = `ORD-2026-${Math.floor(Math.random() * 89999 + 10000)}`;
  const subtotal = newOrder.unitDailyRate * newOrder.days;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const deposit = 500;
  const total = subtotal + tax + deposit;

  if (isSupabaseConfigured && supabase) {
    const { data: orderData, error: orderErr } = await supabase
      .from('rental_orders')
      .insert([
        {
          order_number: orderNumber,
          customer_id: newOrder.customerId,
          status: 'confirmed',
          expected_start_date: newOrder.startDate,
          expected_end_date: newOrder.endDate,
          subtotal_amount: subtotal,
          tax_amount: tax,
          security_deposit_amount: deposit,
          total_amount: total,
          payment_status: 'paid',
          delivery_address: newOrder.deliveryAddress,
        },
      ])
      .select()
      .single();

    if (orderErr) throw new Error(orderErr.message);

    const { error: itemErr } = await supabase.from('rental_order_items').insert([
      {
        rental_order_id: orderData.id,
        equipment_id: newOrder.equipmentId,
        unit_daily_rate: newOrder.unitDailyRate,
        days_rented: newOrder.days,
        daily_insurance_rate: 35.0,
        item_subtotal: subtotal,
        item_status: 'reserved',
      },
    ]);

    if (itemErr) throw new Error(itemErr.message);
    return orderData;
  }

  // Local fallback
  const createdOrder: RentalOrder = {
    id: `ord-${Date.now()}`,
    order_number: orderNumber,
    customer_id: newOrder.customerId,
    status: 'confirmed',
    order_date: new Date().toISOString(),
    expected_start_date: newOrder.startDate,
    expected_end_date: newOrder.endDate,
    subtotal_amount: subtotal,
    tax_amount: tax,
    security_deposit_amount: deposit,
    total_amount: total,
    payment_status: 'paid',
    delivery_address: newOrder.deliveryAddress,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: mockUsers.find((u) => u.id === newOrder.customerId),
    items: [
      {
        id: `roi-${Date.now()}`,
        rental_order_id: `ord-${Date.now()}`,
        equipment_id: newOrder.equipmentId,
        unit_daily_rate: newOrder.unitDailyRate,
        days_rented: newOrder.days,
        daily_insurance_rate: 35.0,
        item_subtotal: subtotal,
        item_status: 'reserved',
        created_at: new Date().toISOString(),
      },
    ],
  };

  localOrders.unshift(createdOrder);
  return createdOrder;
}

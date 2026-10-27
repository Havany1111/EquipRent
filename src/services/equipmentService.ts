import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Equipment, EquipmentCategory, WarehouseLocation } from '../types/database';

export const initialCategories: EquipmentCategory[] = [
  {
    id: 'e1000000-0000-0000-0000-000000000001',
    category_name: 'Heavy Machinery',
    category_code: 'CAT-HVY',
    description: 'Full-size excavators, bulldozers, and heavy crawler cranes',
    base_daily_insurance_rate: 45.0,
    requires_operator_certification: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'e1000000-0000-0000-0000-000000000002',
    category_name: 'Earthmoving',
    category_code: 'CAT-EAR',
    description: 'Compact track loaders, mini excavators, and trenchers',
    base_daily_insurance_rate: 30.0,
    requires_operator_certification: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'e1000000-0000-0000-0000-000000000003',
    category_name: 'Material Handling',
    category_code: 'CAT-MTH',
    description: 'Wheel loaders, telehandlers, and rough terrain forklifts',
    base_daily_insurance_rate: 35.0,
    requires_operator_certification: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'e1000000-0000-0000-0000-000000000004',
    category_name: 'Power & Generation',
    category_code: 'CAT-PWR',
    description: 'Industrial diesel generators and mobile power substations',
    base_daily_insurance_rate: 20.0,
    requires_operator_certification: false,
    created_at: new Date().toISOString(),
  },
];

export const initialWarehouses: WarehouseLocation[] = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    branch_code: 'DEP-METRO-01',
    branch_name: 'Central Metro Depot',
    address: '4400 Logistics Blvd',
    city: 'Denver',
    region: 'Colorado',
    contact_phone: '+1-303-555-0180',
    max_storage_capacity: 150,
    created_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000002',
    branch_code: 'DEP-NORTH-02',
    branch_name: 'North Valley Storage Yard',
    address: '890 Quarry Way',
    city: 'Boulder',
    region: 'Colorado',
    contact_phone: '+1-303-555-0182',
    max_storage_capacity: 90,
    created_at: new Date().toISOString(),
  },
];

let localEquipmentStore: Equipment[] = [
  {
    id: 'e2000000-0000-0000-0000-000000000001',
    serial_number: 'CAT-320-X8910',
    model_name: 'CAT 320 Hydraulic Excavator',
    manufacturer: 'Caterpillar Inc.',
    model_year: 2023,
    category_id: initialCategories[0].id,
    warehouse_id: initialWarehouses[0].id,
    daily_rental_rate: 485.0,
    replacement_value: 240000.0,
    operational_hours: 412.5,
    current_status: 'available',
    image_url: 'https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&w=900&q=85',
    maintenance_interval_hours: 250.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: initialCategories[0],
    warehouse: initialWarehouses[0],
  },
  {
    id: 'e2000000-0000-0000-0000-000000000002',
    serial_number: 'CTL-TL8-9941',
    model_name: 'Takeuchi TL8 Track Loader',
    manufacturer: 'Takeuchi Mfg.',
    model_year: 2022,
    category_id: initialCategories[1].id,
    warehouse_id: initialWarehouses[0].id,
    daily_rental_rate: 295.0,
    replacement_value: 78000.0,
    operational_hours: 185.0,
    current_status: 'rented',
    image_url: 'https://images.unsplash.com/photo-1583024011792-b165975b52f5?auto=format&fit=crop&w=900&q=85',
    maintenance_interval_hours: 200.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: initialCategories[1],
    warehouse: initialWarehouses[0],
  },
  {
    id: 'e2000000-0000-0000-0000-000000000003',
    serial_number: 'KUB-KX040-4',
    model_name: 'Kubota KX040-4 Mini Excavator',
    manufacturer: 'Kubota Corp.',
    model_year: 2024,
    category_id: initialCategories[0].id,
    warehouse_id: initialWarehouses[1].id,
    daily_rental_rate: 340.0,
    replacement_value: 92000.0,
    operational_hours: 310.0,
    current_status: 'under_maintenance',
    image_url: 'https://images.unsplash.com/photo-1495036019936-220b29b930ea?auto=format&fit=crop&w=900&q=85',
    maintenance_interval_hours: 250.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: initialCategories[0],
    warehouse: initialWarehouses[1],
  },
  {
    id: 'e2000000-0000-0000-0000-000000000004',
    serial_number: 'KOM-WA270-8',
    model_name: 'Komatsu WA270-8 Wheel Loader',
    manufacturer: 'Komatsu Ltd.',
    model_year: 2023,
    category_id: initialCategories[2].id,
    warehouse_id: initialWarehouses[0].id,
    daily_rental_rate: 420.0,
    replacement_value: 185000.0,
    operational_hours: 240.0,
    current_status: 'available',
    image_url: 'https://images.unsplash.com/photo-1580901369227-308f6f40bdeb?auto=format&fit=crop&w=900&q=85',
    maintenance_interval_hours: 300.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: initialCategories[2],
    warehouse: initialWarehouses[0],
  },
  {
    id: 'e2000000-0000-0000-0000-000000000005',
    serial_number: 'CAT-D6-T2901',
    model_name: 'CAT D6T Crawler Dozer',
    manufacturer: 'Caterpillar Inc.',
    model_year: 2022,
    category_id: initialCategories[0].id,
    warehouse_id: initialWarehouses[1].id,
    daily_rental_rate: 650.0,
    replacement_value: 380000.0,
    operational_hours: 720.0,
    current_status: 'available',
    image_url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=900&q=85',
    maintenance_interval_hours: 300.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: initialCategories[0],
    warehouse: initialWarehouses[1],
  },
];

export async function fetchEquipmentList(): Promise<Equipment[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('equipment')
      .select('*, category:equipment_categories(*), warehouse:warehouse_locations(*)')
      .order('model_name', { ascending: true });

    if (!error && data) {
      return data as Equipment[];
    }
  }
  return [...localEquipmentStore];
}

export async function fetchEquipmentCategories(): Promise<EquipmentCategory[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('equipment_categories')
      .select('*')
      .order('category_name');
    if (!error && data) return data as EquipmentCategory[];
  }
  return [...initialCategories];
}

export async function createEquipmentUnit(
  equipmentData: Omit<Equipment, 'id' | 'created_at' | 'updated_at' | 'category' | 'warehouse'>
): Promise<Equipment> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('equipment')
      .insert([equipmentData])
      .select('*, category:equipment_categories(*), warehouse:warehouse_locations(*)')
      .single();

    if (error) throw new Error(`Database Error: ${error.message}`);
    return data as Equipment;
  }

  // Local fallback
  const cat = initialCategories.find((c) => c.id === equipmentData.category_id);
  const wh = initialWarehouses.find((w) => w.id === equipmentData.warehouse_id);
  const newEquip: Equipment = {
    ...equipmentData,
    id: `e2000000-${Math.floor(Math.random() * 899999 + 100000)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: cat,
    warehouse: wh,
  };
  localEquipmentStore.push(newEquip);
  return newEquip;
}

export async function updateEquipmentStatus(
  id: string,
  newStatus: Equipment['current_status']
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('equipment')
      .update({ current_status: newStatus })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  localEquipmentStore = localEquipmentStore.map((e) =>
    e.id === id ? { ...e, current_status: newStatus, updated_at: new Date().toISOString() } : e
  );
}

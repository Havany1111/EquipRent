import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { MaintenanceRecord } from '../types/database';

let localMaintenanceRecords: MaintenanceRecord[] = [
  {
    id: 'f1000000-0000-0000-0000-000000000001',
    work_order_number: 'WO-20260812-001',
    equipment_id: 'e2000000-0000-0000-0000-000000000003',
    maintenance_type: 'scheduled_routine',
    maintenance_status: 'in_progress',
    scheduled_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    odometer_hours_at_service: 310.0,
    parts_cost: 240.0,
    labor_cost: 350.0,
    total_maintenance_cost: 590.0,
    lead_technician_id: 'b0000000-0000-0000-0000-000000000002',
    service_description: '300-hour hydraulic fluid flush, seal replacement, and track tensioning calibration',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tasks: [
      {
        id: 'task-1',
        maintenance_id: 'f1000000-0000-0000-0000-000000000001',
        technician_id: 'b0000000-0000-0000-0000-000000000002',
        task_code: 'TASK-HYD-FLUSH',
        task_name: 'Hydraulic System Purge & Fluid Exchange',
        hours_logged: 3.5,
        hourly_labor_rate: 75.0,
        task_cost: 262.5,
        progress_status: 'completed',
        findings_report: 'Drained 18 gal contaminated hydraulic fluid. Replaced high-pressure line filter.',
        created_at: new Date().toISOString(),
      },
    ],
  },
];

export async function fetchMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('maintenance_records')
      .select('*, equipment:equipment_id(*), lead_technician:lead_technician_id(*), tasks:maintenance_tasks(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as MaintenanceRecord[];
    }
  }

  return [...localMaintenanceRecords];
}

export async function createMaintenanceWorkOrder(workOrder: {
  equipmentId: string;
  maintenanceType: MaintenanceRecord['maintenance_type'];
  scheduledDate: string;
  odometerHours: number;
  leadTechnicianId?: string;
  serviceDescription: string;
}) {
  const workOrderNumber = `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
    Math.random() * 899 + 100
  )}`;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('maintenance_records')
      .insert([
        {
          work_order_number: workOrderNumber,
          equipment_id: workOrder.equipmentId,
          maintenance_type: workOrder.maintenanceType,
          maintenance_status: 'pending',
          scheduled_date: workOrder.scheduledDate,
          odometer_hours_at_service: workOrder.odometerHours,
          lead_technician_id: workOrder.leadTechnicianId || null,
          service_description: workOrder.serviceDescription,
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // Local fallback
  const newRecord: MaintenanceRecord = {
    id: `maint-${Date.now()}`,
    work_order_number: workOrderNumber,
    equipment_id: workOrder.equipmentId,
    maintenance_type: workOrder.maintenanceType,
    maintenance_status: 'pending',
    scheduled_date: workOrder.scheduledDate,
    odometer_hours_at_service: workOrder.odometerHours,
    parts_cost: 0,
    labor_cost: 0,
    total_maintenance_cost: 0,
    lead_technician_id: workOrder.leadTechnicianId,
    service_description: workOrder.serviceDescription,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tasks: [],
  };

  localMaintenanceRecords.unshift(newRecord);
  return newRecord;
}

export type UserRole = 'owner' | 'team' | 'partner'
export type ClientStage = 'inquiry' | 'quotation' | 'bo' | 'scheduled' | 'live' | 'completed' | 'cancelled'
export type BookingStatus = 'upcoming' | 'live' | 'completed' | 'cancelled'
export type PaymentStatus = 'pending_payment' | 'received_pending_profit_share' | 'settled'

export interface Billboard {
  id: string
  name: string
  location: string
  max_slots: number
  description: string | null
  image_url: string | null
  partner_id: string | null
  profit_share_percent: number
  costing: number
  created_at: string
}

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
}

export interface UserBillboardAccess {
  user_id: string
  billboard_id: string
}

export interface Client {
  id: string
  company_name: string
  contact_person: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  stage: ClientStage
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  client_id: string
  billboard_id: string
  slot_number: number
  start_date: string
  end_date: string
  monthly_rate: number
  total_amount: number
  status: BookingStatus
  payment_status: PaymentStatus
  brand_name: string | null
  sales_person: string | null
  notes: string | null
  created_at: string
  // joined
  client?: Client
  billboard?: Billboard
}

export interface ActivityLog {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: string
  details: string | null
  created_at: string
}

// Pipeline stage config
export const STAGE_CONFIG: Record<ClientStage, { label: string; color: string }> = {
  inquiry: { label: 'Inquiry', color: 'bg-blue-100 text-blue-800' },
  quotation: { label: 'Quotation', color: 'bg-purple-100 text-purple-800' },
  bo: { label: 'BO Received', color: 'bg-yellow-100 text-yellow-800' },
  scheduled: { label: 'Scheduled', color: 'bg-orange-100 text-orange-800' },
  live: { label: 'Live', color: 'bg-green-100 text-green-800' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
}

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  pending_payment: { label: 'Pending Payment', color: 'bg-red-100 text-red-800' },
  received_pending_profit_share: { label: 'Received (Pending Profit Share)', color: 'bg-yellow-100 text-yellow-800' },
  settled: { label: 'Settled', color: 'bg-green-100 text-green-800' },
}

export const BOOKING_STATUS_CONFIG: Record<BookingStatus, { label: string; color: string }> = {
  upcoming: { label: 'Upcoming', color: 'bg-yellow-100 text-yellow-800' },
  live: { label: 'Live', color: 'bg-green-100 text-green-800' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
}

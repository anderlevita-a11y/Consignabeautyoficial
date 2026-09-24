export interface Profile {
  id: string;
  nome: string;
  cpf?: string;
  whatsapp?: string;
  email?: string;
  role?: string;
  plan?: string;
  access_key_id?: string;
  access_key_code?: string;
  vencimento?: string;
  status_pagamento?: string;
  is_blocked?: boolean;
  is_archived?: boolean;
  data_pagamento?: string;
  pix_key?: string;
  pix_beneficiary?: string;
  data_nascimento?: string;
  genero?: string;
  cep?: string;
  bairro?: string;
  logradouro?: string;
  numero_complemento?: string;
  latitude?: number;
  longitude?: number;
  documento_url?: string;
  plano_tipo?: string;
  plano_status?: string;
  accepted_terms_version?: number;
  instagram?: string;
  cidade?: string;
  estado?: string;
}

export interface MiscellaneousCharge {
  id: string;
  user_id: string;
  customer_id?: string;
  description: string;
  total_value: number;
  installments_count: number;
  apply_late_fees: boolean;
  original_due_date?: string;
  created_at: string;
  customer?: {
    nome: string;
    cpf?: string;
    whatsapp?: string;
  };
}

export interface MiscellaneousChargeInstallment {
  id: string;
  charge_id: string;
  installment_number: number;
  value: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string;
}

export interface AppLegalSettings {
  id: string;
  privacy_policy: string;
  terms_of_use: string;
  version: number;
  updated_at: string;
}

export interface AccessKey {
  id: string;
  code: string;
  plan: string;
  status: string;
  generated_by: string;
  recipient_name?: string;
  used_by?: string;
  created_at: string;
}

export interface ProductGridItem {
  color: string;
  size: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  label_name?: string;
  ean?: string;
  barcode?: string;
  ean_variations?: string[];
  cost_price: number;
  sale_price: number;
  current_stock: number;
  photo_url?: string;
  image_urls?: string[];
  user_id?: string;
  has_grid?: boolean;
  category?: string;
  is_visible_in_store?: boolean;
  description?: string;
  grid_data?: ProductGridItem[];
}

export interface Customer {
  id: string;
  nome: string;
  cpf?: string;
  birth_date?: string;
  gender?: string;
  nationality?: string;
  naturalness?: string;
  instagram?: string;
  whatsapp?: string;
  document_photo_url?: string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  address_number?: string;
  cidade?: string;
  estado?: string;
  residence_proof_url?: string;
  latitude?: number;
  longitude?: number;
  credit_limit?: number;
  user_id: string;
  status: 'active' | 'inactive';
}

export interface Bag {
  id: string;
  bag_number: string;
  customer_id?: string;
  campaign_id?: string;
  notes?: string;
  status: string;
  total_value: number;
  total_items: number;
  payment_status: string;
  received_amount?: number;
  installments?: number;
  created_at: string;
  closed_at?: string;
  customer?: Customer;
  campaign?: { return_date: string } | { return_date: string }[];
}

export interface BagItem {
  id: string;
  bag_id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
  color?: string;
  size?: string;
}

export interface Sweepstakes {
  id: string;
  user_id: string;
  name: string;
  draw_date: string;
  voucher_value: number;
  prizes_count: number;
  objective: string;
  prizes_list: string;
  rules: string;
  status: 'pending' | 'completed' | 'archived';
  created_at: string;
}

export interface SweepstakesParticipant {
  id: string;
  sweepstakes_id: string;
  name: string;
  contact: string;
  paid_amount: number;
  coupons_count: number;
  status: 'active' | 'winner';
  receipt_url?: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  customer_ids: string[];
  created_at: string;
  updated_at: string;
  discount_pct: number;
  return_date?: string;
  status: string;
}

export interface Route {
  id: string;
  name: string;
  campaign_id?: string;
  user_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  stops?: RouteStop[];
  estimated_service_time?: number;
  lunch_break_duration?: number;
  lunch_break_start_time?: string;
  start_time?: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  customer_id: string;
  order_index: number;
  status: 'pending' | 'visited' | 'skipped';
  user_id?: string;
  customer?: Customer;
}

export interface CommissionSimulation {
  id: string;
  user_id: string;
  description: string;
  total_value: number;
  commission_pct: number;
  commission_value: number;
  liquid_value: number;
  expenses?: { description: string; value: number }[];
  created_at: string;
}

export interface PriceSuggestion {
  id: string;
  central_product_id: string;
  suggested_cost_price: number;
  suggested_sale_price: number;
  created_at: string;
  created_by: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'update' | 'price_change';
  created_at: string;
  created_by: string;
}

export interface StoreSettings {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string;
  primary_color: string;
  welcome_message: string;
  whatsapp_number: string;
  instagram_handle: string;
  logo_url: string;
  banner_url?: string;
  scrolling_text?: string;
  categories?: string[];
  pix_key?: string;
  instagram_post_url?: string;
  instagram_feed?: string[];
  footer_text?: string;
  shipping_text?: string;
  global_discount?: number;
  updated_at?: string;
}

export interface Raffle {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  rules?: string;
  ticket_price: number;
  total_tickets: number;
  prizes: string[];
  status: 'draft' | 'active' | 'finished';
  payment_info?: string;
  created_at: string;
}

export interface RaffleTicket {
  id: string;
  raffle_id: string;
  number: number;
  status: 'reserved' | 'paid';
  buyer_name: string;
  buyer_cpf: string;
  buyer_phone: string;
  receipt_url?: string;
  reserved_at: string;
  paid_at?: string;
}

export interface MysteryBagCampaign {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  bag_price: number;
  status: 'active' | 'finished';
  payment_info?: string;
  rules?: string;
  created_at: string;
}

export interface MysteryBag {
  id: string;
  campaign_id: string;
  display_number: number;
  prize_description: string;
  status: 'available' | 'reserved' | 'paid';
  buyer_name?: string;
  buyer_cpf?: string;
  buyer_phone?: string;
  receipt_url?: string;
  reserved_at?: string;
  paid_at?: string;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  customer_name: string;
  customer_photo_url?: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface LabelElementConfig {
  enabled: boolean;
  x: number;
  y: number;
  fontSize?: number;
  width?: number;
  height?: number;
  textAlign?: 'left' | 'center' | 'right';
}

export interface LabelModel {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  width: number;
  height: number;
  labels_per_row: number;
  rows_per_sheet?: number;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  gap_horizontal: number;
  gap_vertical: number;
  product_name_config: LabelElementConfig;
  barcode_drawing_config: LabelElementConfig;
  barcode_number_config: LabelElementConfig;
  product_size_config: LabelElementConfig;
  product_price_config: LabelElementConfig;
  created_at?: string;
}

export interface GoalCampaign {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  goal_value: number;
  current_value: number;
  reward_description: string;
  status: 'active' | 'finished';
  created_at: string;
  type?: 'participants' | 'value';
  end_date?: string;
}

export interface GoalParticipant {
  id: string;
  campaign_id: string;
  name: string;
  city: string;
  cpf?: string;
  phone?: string;
  contribution_value?: number;
  message?: string;
  created_at: string;
}

export interface DailyInsight {
  id: string;
  content: string;
  order_index: number;
  created_at: string;
}

export interface PaymentReceipt {
  id: string;
  user_id: string;
  user_name: string;
  receipt_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  profile?: Profile;
}

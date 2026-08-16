// =============================================================
// BADEL — shared domain types
// Single source of truth for shapes crossing the API boundary.
// =============================================================

export type ID = string;

// ---- Enums ---------------------------------------------------

export type ItemStatus = 'active' | 'unavailable' | 'traded' | 'deleted';
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';

export type TradeOfferStatus =
  | 'pending'
  | 'accepted'
  | 'meetup'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'disputed';

export type TradeRole = 'from' | 'to';

export type MeetupStatus = 'proposed' | 'confirmed' | 'cancelled';

export type VerificationStatus = 'unverified' | 'pending' | 'verified';
export type MembershipStatus = 'free' | 'verified' | 'premium';
export type UserRole = 'user' | 'admin' | 'suspended';

export type ReportReason =
  | 'scam'
  | 'counterfeit'
  | 'stolen_item'
  | 'inappropriate'
  | 'harassment'
  | 'fake_listing'
  | 'not_as_described';

export type ReportStatus = 'open' | 'reviewing' | 'action_taken' | 'dismissed';

export type NotificationType =
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_cancelled'
  | 'new_message'
  | 'meetup_proposed'
  | 'meetup_confirmed'
  | 'trade_completed'
  | 'exchange_confirm'
  | 'rating_request'
  | 'item_viewed_offer'
  | 'favorite_updated'
  | 'similar_item'
  | 'system';

export type AnalyticsEvent =
  | 'signup'
  | 'login'
  | 'onboarding_complete'
  | 'listing_created'
  | 'item_viewed'
  | 'search_performed'
  | 'offer_sent'
  | 'offer_accepted'
  | 'meetup_confirmed'
  | 'trade_completed'
  | 'message_sent'
  | 'favorite_added'
  | 'user_verified'
  | 'report_submitted'
  | 'listing_photo_uploaded';

// ---- Rows -----------------------------------------------------

export interface Category {
  id: ID;
  slug: string;
  name: string;
  icon: string; // emoji glyph
  sort_order: number;
}

export interface User {
  id: ID;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  rating_count: number;
  completed_trades: number;
  verification_status: VerificationStatus;
  membership_status: MembershipStatus;
  role: UserRole;
  created_at: number; // unix ms
  email?: string; // only exposed to self/admin
}

/** Raw users table row (server-side only — includes credentials). */
export interface UserRow extends User {
  email: string;
  password_hash: string;
  onboarded: 0 | 1;
}

export interface Item {
  id: ID;
  owner_id: ID;
  title: string;
  description: string;
  category_id: ID;
  condition: ItemCondition;
  status: ItemStatus;
  location: string;
  latitude: number | null;
  longitude: number | null;
  value_min: number | null;
  value_max: number | null;
  value_currency: string | null;
  created_at: number;
  updated_at: number;
}

export interface ItemPhoto {
  id: ID;
  item_id: ID;
  storage_path: string;
  thumb_path: string | null;
  sort_order: number;
}

export interface WantedItem {
  id: ID;
  user_id: ID;
  item_id: ID;
  wanted_category_id: ID | null;
  wanted_keywords: string;
  created_at: number;
}

export interface TradeOffer {
  id: ID;
  from_user_id: ID;
  to_user_id: ID;
  offered_item_id: ID;
  requested_item_id: ID;
  message: string;
  status: TradeOfferStatus;
  created_at: number;
  accepted_at: number | null;
  completed_at: number | null;
  // both-party completion confirmation (0|1 in the DB, truthy in JSON)
  from_exchange_confirmed: number;
  to_exchange_confirmed: number;
  cancelled_by: ID | null;
  dispute_reason: string | null;
}

export interface Message {
  id: ID;
  trade_id: ID;
  sender_id: ID;
  body: string;
  created_at: number;
  read: boolean;
}

export interface Meetup {
  id: ID;
  trade_id: ID;
  created_by: ID;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  meet_date: string | null; // YYYY-MM-DD
  meet_time: string | null; // HH:mm
  notes: string;
  status: MeetupStatus;
  from_confirmed: number;
  to_confirmed: number;
  created_at: number;
}

export interface Rating {
  id: ID;
  trade_id: ID;
  rater_id: ID;
  ratee_id: ID;
  reliability: number;
  communication: number;
  item_accuracy: number;
  overall: number;
  comment: string;
  created_at: number;
}

export interface Favorite {
  id: ID;
  user_id: ID;
  item_id: ID;
  created_at: number;
}

export interface Notification {
  id: ID;
  user_id: ID;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: number;
}

export interface Report {
  id: ID;
  reporter_id: ID;
  reported_user_id: ID | null;
  item_id: ID | null;
  trade_id: ID | null;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  admin_notes: string | null;
  created_at: number;
}

export interface Session {
  id: ID;
  user_id: ID;
  created_at: number;
  expires_at: number;
  user_agent: string | null;
}

// ---- Aggregates (API responses) -------------------------------

export interface ItemWithDetails extends Item {
  owner: PublicUser;
  photos: ItemPhoto[];
  wanted: WantedItem[];
  category: Category;
  distance_km: number | null;
  match_score: number | null;
  match_perfect: boolean;
  match_reasons: string[];
  is_favorite: boolean;
  active_offer_count: number;
}

export interface PublicUser extends User {
  successful_trade_pct: number | null;
}

export interface OfferWithDetails extends TradeOffer {
  offered_item: ItemWithDetails | null;
  requested_item: ItemWithDetails | null;
  counterpart: PublicUser;
  unread_message_count: number;
}

export interface TradeDetail extends OfferWithDetails {
  messages: Message[];
  meetup: Meetup | null;
  my_rating: Rating | null;
  their_rating: Rating | null;
  can_rate: boolean;
  my_exchange_confirmed: boolean;
  their_exchange_confirmed: boolean;
}

export interface MatchResult {
  item: ItemWithDetails;
  score: number;
  perfect: boolean;
  reasons: string[];
}

export interface BrowseSection {
  key: string;
  title: string;
  subtitle: string;
  items: ItemWithDetails[];
}

export interface HomeFeed {
  sections: BrowseSection[];
}

export interface UserProfile extends PublicUser {
  listings: ItemWithDetails[];
  ratings_summary: {
    reliability: number | null;
    communication: number | null;
    item_accuracy: number | null;
  };
  recent_ratings: Rating[];
}

export interface NotificationWithMeta extends Notification {}

export interface CategoryCount {
  category: Category;
  count: number;
}

export interface AdminStats {
  users: number;
  items: number;
  active_trades: number;
  completed_trades: number;
  pending_offers: number;
  open_reports: number;
  verified_users: number;
  memberships: Record<MembershipStatus, number>;
  trades_by_status: Record<string, number>;
  items_by_category: CategoryCount[];
  events_last_14d: { day: string; count: number }[];
}

export interface ApiError {
  error: string;
  field?: string;
  code?: string;
}

// ---- Auth / payment -------------------------------------------

export interface AuthSession {
  user: User;
  onboarded: boolean;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  description: string;
  mock: boolean;
  status: 'created';
}

export interface MembershipResult {
  user: User;
  membership: {
    mock: boolean;
    reference: string;
    amount: number;
    currency: string;
    status: 'paid';
    method: 'mock';
  };
}

export interface SearchFilters {
  q?: string;
  category_id?: string;
  conditions?: ItemCondition[];
  max_distance_km?: number;
  sort?: 'newest' | 'closest' | 'recommended';
  min_value?: number;
  max_value?: number;
  status?: ItemStatus;
  page?: number;
  per_page?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

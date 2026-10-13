/**
 * Hand-written subset of the Supabase schema this site touches. Shape follows
 * `supabase gen types typescript`; replace with generated types from the app
 * repo once landing_leads is applied there.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export const LEAD_ROLES = ["retailer", "uncle", "other"] as const;
export type LeadRole = (typeof LEAD_ROLES)[number];

export const LEAD_MARKETS = ["동대문", "남대문", "기타"] as const;
export type LeadMarket = (typeof LEAD_MARKETS)[number];

type LandingLeadRow = {
  id: string;
  created_at: string;
  role: LeadRole | null;
  name: string;
  business_name: string | null;
  contact: string;
  market: LeadMarket | null;
  message: string | null;
  source: string | null;
  utm: Json | null;
  consent: boolean;
  user_agent: string | null;
};

/** Columns anon may insert (column-level grant in the migration). */
type LandingLeadInsert = {
  role?: LeadRole | null;
  name: string;
  business_name?: string | null;
  contact: string;
  market?: LeadMarket | null;
  message?: string | null;
  source?: string | null;
  utm?: Json | null;
  consent: true;
  user_agent?: string | null;
};

export type Database = {
  public: {
    Tables: {
      landing_leads: {
        Row: LandingLeadRow;
        Insert: LandingLeadInsert;
        Update: Partial<LandingLeadInsert>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type LandingLeadInsertRow = LandingLeadInsert;

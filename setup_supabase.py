#!/usr/bin/env python3
"""Initialize Supabase tables for period tracking."""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

print("🔗 Connecting to Supabase...")
try:
    # Test connection
    response = supabase.table("period_logs").select("*").limit(1).execute()
    print("✅ Tables already exist! Supabase is ready.")
except Exception as e:
    if "does not exist" in str(e):
        print("📋 Creating period_logs table...")
        # Note: You'll need to create this in Supabase dashboard manually or via SQL
        # For now, let's provide SQL commands
        print("\n❌ Tables don't exist. Please create them manually in Supabase SQL Editor:")
        print("""
CREATE TABLE period_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, start_date)
);

CREATE TABLE cycle_stats (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  avg_cycle_length FLOAT DEFAULT 28,
  avg_period_length FLOAT DEFAULT 5,
  last_period_start DATE,
  predicted_next_period DATE,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_period_logs_user ON period_logs(user_id);
CREATE INDEX idx_cycle_stats_user ON cycle_stats(user_id);
""")
    else:
        print(f"❌ Error: {str(e)}")
        exit(1)

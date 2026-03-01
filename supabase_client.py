"""Supabase client and period tracking utilities."""

import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY) if SUPABASE_URL and SUPABASE_ANON_KEY else None


def init_supabase():
    """Initialize tables if they don't exist."""
    if not supabase:
        return False
    
    try:
        # Try to query — if tables don't exist, create them
        supabase.table("period_logs").select("*").limit(1).execute()
        return True
    except Exception as e:
        if "does not exist" in str(e):
            print("Creating tables...")
            try:
                # Create via SQL using admin client won't work without auth
                # For now, return False and user needs to run SQL manually
                return False
            except Exception as sql_err:
                print(f"SQL Error: {sql_err}")
                return False
        return False


def log_period_start(user_id: str, date: str, notes: str = None) -> dict:
    """Log period start date."""
    if not supabase:
        return {"error": "Supabase not configured"}
    
    try:
        data = {
            "user_id": user_id,
            "start_date": date,
            "notes": notes or "Period started"
        }
        response = supabase.table("period_logs").insert(data).execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        return {"error": str(e)}


def log_period_end(user_id: str, start_date: str, end_date: str) -> dict:
    """Update period end date."""
    if not supabase:
        return {"error": "Supabase not configured"}
    
    try:
        response = (
            supabase.table("period_logs")
            .update({"end_date": end_date})
            .eq("user_id", user_id)
            .eq("start_date", start_date)
            .execute()
        )
        return {"success": True, "data": response.data}
    except Exception as e:
        return {"error": str(e)}


def get_period_history(user_id: str) -> list:
    """Get all logged periods for a user."""
    if not supabase:
        return []
    
    try:
        response = (
            supabase.table("period_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("start_date", desc=True)
            .execute()
        )
        return response.data or []
    except Exception:
        return []


def calculate_cycle_stats(user_id: str) -> dict:
    """Calculate average cycle length and predict next period."""
    periods = get_period_history(user_id)
    
    if not periods:
        return {
            "avg_cycle_length": 28,
            "avg_period_length": 5,
            "last_period_start": None,
            "predicted_next_period": None
        }
    
    # Convert date strings to datetime objects
    period_dates = []
    for p in periods:
        try:
            start = datetime.strptime(p["start_date"], "%Y-%m-%d")
            period_dates.append(start)
        except:
            pass
    
    if len(period_dates) < 2:
        # Not enough data to calculate cycle
        last_date = period_dates[0] if period_dates else None
        next_period = (last_date + timedelta(days=28)) if last_date else None
        return {
            "avg_cycle_length": 28,
            "avg_period_length": 5,
            "last_period_start": str(last_date.date()) if last_date else None,
            "predicted_next_period": str(next_period.date()) if next_period else None,
            "confidence": "low"
        }
    
    # Sort dates
    period_dates.sort()
    
    # Calculate cycle lengths
    cycle_lengths = []
    for i in range(1, len(period_dates)):
        cycle_length = (period_dates[i] - period_dates[i-1]).days
        if 20 <= cycle_length <= 40:  # Filter outliers
            cycle_lengths.append(cycle_length)
    
    # Calculate average
    avg_cycle_length = sum(cycle_lengths) / len(cycle_lengths) if cycle_lengths else 28
    
    # Calculate period length (using end_date if available)
    period_lengths = []
    for p in periods:
        if p.get("end_date"):
            try:
                start = datetime.strptime(p["start_date"], "%Y-%m-%d")
                end = datetime.strptime(p["end_date"], "%Y-%m-%d")
                length = (end - start).days + 1
                if 2 <= length <= 10:
                    period_lengths.append(length)
            except:
                pass
    
    avg_period_length = sum(period_lengths) / len(period_lengths) if period_lengths else 5
    
    # Predict next period
    last_period_start = period_dates[-1]
    predicted_next = last_period_start + timedelta(days=int(avg_cycle_length))
    
    # Save to cycle_stats table
    try:
        supabase.table("cycle_stats").upsert({
            "user_id": user_id,
            "avg_cycle_length": avg_cycle_length,
            "avg_period_length": avg_period_length,
            "last_period_start": str(last_period_start.date()),
            "predicted_next_period": str(predicted_next.date())
        }).execute()
    except:
        pass
    
    return {
        "avg_cycle_length": round(avg_cycle_length, 1),
        "avg_period_length": round(avg_period_length, 1),
        "last_period_start": str(last_period_start.date()),
        "predicted_next_period": str(predicted_next.date()),
        "confidence": "high" if len(cycle_lengths) >= 3 else "medium"
    }


def predict_cycle_phases(user_id: str, target_date: str = None) -> dict:
    """Predict cycle phases for a given date."""
    target = datetime.strptime(target_date, "%Y-%m-%d") if target_date else datetime.now()
    stats = calculate_cycle_stats(user_id)
    
    if not stats["last_period_start"]:
        return {"error": "No period data available"}
    
    last_start = datetime.strptime(stats["last_period_start"], "%Y-%m-%d")
    cycle_length = int(stats["avg_cycle_length"])
    period_length = int(stats["avg_period_length"])
    
    # Calculate day in current cycle
    days_into_cycle = (target - last_start).days % cycle_length
    
    # Determine phase
    if days_into_cycle < period_length:
        phase = "Menstruation"
        emoji = "🔴"
    elif days_into_cycle < 14:
        phase = "Follicular"
        emoji = "🟡"
    elif days_into_cycle < 16:
        phase = "Ovulation"
        emoji = "🟠"
    elif days_into_cycle < 22:
        phase = "Luteal"
        emoji = "🟣"
    else:
        phase = "PMS Week"
        emoji = "🌙"
    
    return {
        "date": target_date or datetime.now().strftime("%Y-%m-%d"),
        "phase": phase,
        "emoji": emoji,
        "day_in_cycle": days_into_cycle + 1,
        "cycle_length": cycle_length,
        "stats": stats
    }


def save_user_data(sync_key: str, data: dict) -> dict:
    """Save all user data to Supabase."""
    if not supabase:
        return {"error": "Supabase not configured"}
    
    try:
        # data is a dict of { key: value_blob }
        rows = []
        for key, blob in data.items():
            rows.append({
                "user_id": sync_key,
                "data_key": key,
                "data_blob": blob,
                "updated_at": datetime.now().isoformat()
            })
        
        if rows:
            response = supabase.table("user_sync").upsert(rows).execute()
            return {"success": True, "count": len(rows)}
        return {"success": True, "count": 0}
    except Exception as e:
        return {"error": str(e)}


def get_all_user_data(sync_key: str) -> dict:
    """Get all synced data for a user."""
    if not supabase:
        return {"error": "Supabase not configured"}
    
    try:
        response = (
            supabase.table("user_sync")
            .select("data_key, data_blob")
            .eq("user_id", sync_key)
            .execute()
        )
        # Convert list of rows to a dict
        result = {}
        for row in response.data:
            result[row["data_key"]] = row["data_blob"]
        return {"success": True, "data": result}
    except Exception as e:
        return {"error": str(e)}

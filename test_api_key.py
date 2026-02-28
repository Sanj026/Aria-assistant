#!/usr/bin/env python3
"""Quick test to verify Gemini API key is working."""

import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")

if not api_key:
    print("❌ No API key found in .env file!")
    exit(1)

print(f"🔑 Testing API key: {api_key[:20]}...")

try:
    client = genai.Client(api_key=api_key)
    
    print("📝 Sending test request...")
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents="Say 'API works!' in one sentence."
    )
    
    print("✅ SUCCESS! API key is valid and has quota.")
    print(f"📢 Response: {response.text}")
    
except Exception as e:
    error_msg = str(e)
    print(f"❌ ERROR: {error_msg}")
    
    if "401" in error_msg or "invalid" in error_msg.lower():
        print("  → API key is invalid or expired. Create a new one in GCP.")
    elif "429" in error_msg:
        print("  → Quota exceeded. Check billing in GCP Console.")
    elif "not found" in error_msg.lower():
        print("  → Model not found. Check available models.")

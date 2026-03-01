import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GROK_API_KEY")

if not api_key:
    print("❌ No GROK_API_KEY found in .env file!")
    exit(1)

print(f"🔑 Testing Groq API key: {api_key[:10]}...")

try:
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
    )
    
    print("📝 Sending test request...")
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Say 'Groq is fast!' in one sentence."}]
    )
    
    print("✅ SUCCESS!")
    print(f"📢 Response: {response.choices[0].message.content}")
    
except Exception as e:
    print(f"❌ ERROR: {e}")

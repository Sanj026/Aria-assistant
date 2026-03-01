import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GROK_API_KEY")

if not api_key or api_key == "your_xai_api_key_here":
    print("❌ No GROK_API_KEY found in .env file!")
    exit(1)

print(f"🔑 Testing Grok API key: {api_key[:10]}...")

try:
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.x.ai/v1",
    )
    
    print("📝 Sending test request...")
    response = client.chat.completions.create(
        model="grok-2-latest",
        messages=[{"role": "user", "content": "Say 'Grok is alive!' in one sentence."}]
    )
    
    print("✅ SUCCESS!")
    print(f"📢 Response: {response.choices[0].message.content}")
    
except Exception as e:
    print(f"❌ ERROR: {e}")

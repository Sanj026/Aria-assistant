# Aria Assistant — Deployment Guide 🚀

## Push Notifications ✅ (Just Added!)
Your app now sends **push notifications** for:
- 🌸 Period reminders (3 days before, 1 day before, on the day)
- 📋 Deadline alerts (when due)

**When you open the app**, it will ask for notification permission. Click **"Allow"** to get notifications on this device.

---

## Deploy to Render 🌐

### Step 1: Prepare Your Code
Your app is ready! Just push to GitHub:

```bash
cd /Users/sanjana/Desktop/Aria_Assistant_Project
git init
git add .
git commit -m "Initial Aria deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aria-assistant.git
git push -u origin main
```

### Step 2: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect your `aria-assistant` GitHub repo

### Step 3: Configure
- **Name**: `aria-assistant` (or any name)
- **Environment**: `Python 3.11`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn app:app`
- **Plan**: Free tier is fine!

### Step 4: Add Environment Variables
In Render dashboard, go to **Environment** and add:
```
GROK_API_KEY=your_api_key_here
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

### Step 5: Deploy!
Click **"Create Web Service"** — Render will deploy automatically!
Your app will be live at: `https://aria-assistant.onrender.com`

---

## Access from Phone 📱
1. Once deployed, visit: `https://aria-assistant.onrender.com`
2. Open from your phone browser
3. Add to home screen (optional)
4. Allow notifications when prompted ✅

---

##  Note: Free Tier on Render
- Spins down after 15 min of inactivity (opens in 30 sec on next visit)
- Perfect for personal use!
- Upgrade anytime if you need it always-on

---

## Notifications Behavior
- **Browser Notifications**: Show when app is open or in background (if enabled)
- **3-day reminder**: Gets notified 3 days before period
- **1-day reminder**: Gets notified 1 day before
- **Day-of reminder**: When period is expected today

Click any notification to jump back to the app! 🎯

---

**Ready to deploy? Let me know if you hit any issues!** 🚀

# ✦ Aria — Your Personal AI Assistant

Aria is a warm, smart personal AI assistant that manages your college life: deadlines, study progress, quizzes, gym tracking, period tracking, finance tracking, and daily accountability. Built with Python Flask + Groq/Gemini API + Supabase.

---

## 🚀 Setup & Run

### 1. Prerequisites
- Python 3.9+
- A free [Groq API key](https://console.groq.com/keys) or Gemini API key
- A [Supabase](https://supabase.com/) project (for cross-device sync)
- (Optional) [EmailJS account](https://www.emailjs.com/) for email reminders

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Variables

Edit `.env` and configure your keys:

```
GROK_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

### 4. Run the App

```bash
python app.py
```

Open: **http://127.0.0.1:5000**

---

## 🔄 Cross-Device Sync (Supabase)

Aria now supports real-time sync between your devices (Mac, iPhone, Tablet).
1. Go to **Settings (⚙️)** on your primary device.
2. Copy your **Sync Key**.
3. On your second device, click **"Sync existing data from another device"** during onboarding and enter your key.
4. Your deadlines, notes, and progress will sync automatically!

---

## 📅 Universal Calendar Reflection

The calendar is now a single source of truth for your entire life:
- **Deadlines**: [Starts] and [Dues] are clearly marked.
- **Notes/Reminders**: "Remind me to..." notes show up on their respective dates.
- **Wellness**: Gym logs (Green/Red) and Period tracking (Pink) are integrated.
- **Finance**: Transactions and Splitwise reminds appear automatically.
- **Quizzes**: View your quiz scores and subjects on the days you took them.

---

## 📚 Nested Deadlines & Milestones

Manage large projects (like a Dissertation) by breaking them into milestones.
- **Subject Grouping**: Deadlines with the same subject are grouped together in the **Progress -> Topics** tab.
- **Countdown**: View how many days are left for each specific milestone directly in the subject card.

---

## ✦ Features Highlights

| Feature | How to use |
|---------|-----------|
| Add deadline | "add bio report due april 2" |
| Project milestones | "add dissertation milestone: Intro due next Friday" |
| Finance | "spent $15 on lunch" or "remind me to pay Sarah $10" |
| Reminders | "remind me to call the bank tomorrow" |
| Daily wrap-up | "daily wrapup" or "done for today" |
| Quiz | "give me a quiz" or "5 leetcode questions" |
| Period log | "period started today" or "when is my next period?" |
| Gym log | "went to gym today" |

---

## 🗂 File Structure

```
aria/
├── app.py              # Flask backend + LLM Proxy
├── supabase_client.py  # Supabase database & Auth logic
├── templates/
│   └── index.html      # Mobile-responsive frontend
├── static/
│   ├── aria_style.css  # Premium Glassmorphism UI
│   └── aria_core.js    # Core frontend engine & local state
├── requirements.txt
├── .env                # Private API keys
└── README.md
```

---

## ⚠️ Privacy & Architecture

- **Hybrid Storage**: Data is stored in **localStorage** for instant performance and **Supabase** for cross-device sync.
- **Local-First**: Aria works even with poor connection; syncing happens in the background.
- **Secure**: Your sync key ensures only you can access your data across devices.

# ✦ Aria — Your Personal AI Assistant

Aria is a warm, smart personal AI assistant that manages your college life: deadlines, study progress, quizzes, gym tracking, period tracking, and daily accountability. Built with Python Flask + Google Gemini API.

---

## 🚀 Setup & Run

### 1. Prerequisites
- Python 3.9+
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)
- (Optional) [EmailJS account](https://www.emailjs.com/) for email reminders

### 2. Install Dependencies

```bash
cd aria
pip install -r requirements.txt
```

> Or use a virtual environment (recommended):
> ```bash
> python -m venv venv
> source venv/bin/activate  # Mac/Linux
> pip install -r requirements.txt
> ```

### 3. Add Your API Key

Edit `.env` and replace the placeholder:

```
GEMINI_API_KEY=your_actual_key_here
```

Get your free key at: https://aistudio.google.com/app/apikey

### 4. Run the App

```bash
python app.py
```

Open your browser and go to: **http://127.0.0.1:5000**

---

## 📱 Mobile (iPhone Safari)

The app is fully mobile-responsive. To use on iPhone:
1. Run the server on your Mac
2. Find your Mac's local IP (`ifconfig | grep "inet "`)
3. Run the server with: `python app.py --host=0.0.0.0`
4. On iPhone Safari, visit: `http://YOUR_MAC_IP:5000`

---

## 📧 Email Reminders (Optional)

1. Sign up at [EmailJS.com](https://www.emailjs.com/) (free tier is fine)
2. Create a service and an email template
3. In Aria's Settings (⚙️), enter your EmailJS Service ID, Template ID, and Public Key

Aria will send:
- Daily 9am digest of what's due this week
- Email on the start date of each deadline
- Midway check-in reminders

---

## 🔔 Browser Notifications

Aria will ask for notification permission on first load. Allow it to get deadline alerts directly in your browser.

---

## 💾 Data Storage

All your data is stored in your browser's **localStorage** — completely private, no server storage, no accounts. Clearing browser data will reset Aria.

---

## ✦ Features

| Feature | How to use |
|---------|-----------|
| Add deadline | "add bio report due april 2" |
| Check deadlines | "what's due this week" |
| Complete deadline | "mark CS assignment as done" |
| Daily wrap-up | "daily wrapup" or "done for today" |
| Quiz | "give me a quiz" or "5 leetcode questions" |
| LeetCode stats | "how's my leetcode" |
| Track topics | "I finished caching today" |
| Gym log | "went to gym today" or "skipped gym" |
| Period log | "period started today" |
| Quick note | "add note: email professor tomorrow" |
| Add subject | "add subject: system design" |
| Daily focus | "what should I focus on today" |

---

## 🗂 File Structure

```
aria/
├── app.py              # Flask backend + Gemini API proxy
├── templates/
│   └── index.html      # Single-page app
├── static/
│   ├── style.css       # Dark theme, purple accent
│   └── app.js          # All frontend logic + localStorage
├── requirements.txt
├── .env                # Your API keys (never commit!)
├── .gitignore
└── README.md
```

---

## ⚠️ Notes

- Never commit `.env` to git — it's in `.gitignore`
- Gemini `gemini-1.5-flash` model is free tier friendly
- All user data lives in localStorage — it's private and local to your browser

import os
import json
import requests
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from datetime import datetime
from supabase_client import (
    log_period_start, log_period_end, get_period_history,
    calculate_cycle_stats, predict_cycle_phases,
    save_user_data, get_all_user_data
)

load_dotenv()

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION & LOGGING ---
print("\n--- Aria Boot Sequence ---")
grok_key = os.environ.get("GROK_API_KEY")
gemini_key = os.environ.get("GEMINI_API_KEY")

if grok_key:
    print(f"📡 Found GROK_API_KEY (prefix: {grok_key[:6]}...)")
    api_key = grok_key
elif gemini_key:
    print(f"📡 Found GEMINI_API_KEY (prefix: {gemini_key[:6]}...)")
    api_key = gemini_key
else:
    print("❌ CRITICAL: No API key found in Environment Variables!")
    api_key = None

client = None
if api_key:
    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )
        print("✅ OpenAI client initialized for Groq")
    except Exception as e:
        print(f"❌ Failed to initialize OpenAI client: {e}")
else:
    print("⚠️ Client NOT initialized - API key missing")

print("--- End Boot Sequence ---\n")


def build_system_prompt(context):
    user_name = context.get('userName', 'friend')
    subjects = context.get('subjects', [])
    deadlines = context.get('deadlines', [])
    topics = context.get('topics', {})
    gym = context.get('gym', {})
    period_ctx = context.get('periodContext', {})
    notes = context.get('notes', [])
    quiz_history = context.get('quizHistory', [])
    is_pms_week = context.get('isPmsWeek', False)
    in_quiz = context.get('inQuiz', False)
    today = context.get('today', datetime.now().strftime('%Y-%m-%d'))
    pending_deadline = context.get('pendingDeadline', None)
    balance = context.get('balance', 0)
    splitwise = context.get('splitwiseReminders', [])

    pms_instruction = ""
    if is_pms_week:
        pms_instruction = (
            "\n\U0001f338 IMPORTANT: The user is likely in their PMS week. "
            "Be extra gentle, warm, and supportive. Avoid pushy or critical tone."
        )

    pending_instruction = ""
    if pending_deadline:
        pending_instruction = (
            f"\n\u26a1 PENDING DEADLINE: You asked for a start date for: "
            f"{json.dumps(pending_deadline)}. The user's next message likely contains the start date. "
            "Extract the date and return the complete ADD_DEADLINE action with askingForStartDate: false."
        )

    quiz_instruction = ""
    if in_quiz:
        quiz_instruction = (
            "\n\U0001f4dd QUIZ IN PROGRESS: You are mid-quiz. Grade the user's last answer, "
            "give brief feedback, then present the next question. When all questions are answered, "
            "give a friendly score summary and return the GRADE_QUIZ action."
        )

    deadlines_str = json.dumps(deadlines, indent=2) if deadlines else "None"
    topics_str = json.dumps(topics, indent=2) if topics else "None"
    notes_list = '; '.join([n.get('text', '') for n in notes[:10]]) if notes else "None"
    splitwise_str = json.dumps([s for s in splitwise if s.get('status') == 'pending'], indent=2) if splitwise else "None"
    
    # Format period information
    period_str = ""
    if period_ctx:
        period_str = f"""Cycle length: {period_ctx.get('avg_cycle_length', 28)} days
Last period: {period_ctx.get('last_period_start', 'N/A')}
Next predicted period: {period_ctx.get('predicted_next_period', 'N/A')}
Current phase: {period_ctx.get('phase', 'Unknown')}"""
    else:
        period_str = "No cycle data yet"

    return f"""You are Aria, a warm, witty, and smart personal AI assistant. You are talking to {user_name}.

YOUR PERSONALITY:
- Always address the user as "{user_name}" naturally (not in every sentence — just occasionally)
- Warm, friendly, slightly witty — like a brilliant best friend, not a robot
- Encouraging but will gently call out procrastination
- Use emojis occasionally (1-2 per message max)
- Keep responses SHORT and punchy unless detail is needed
- If user asks "what should I focus on today" → give a prioritized, actionable answer based on deadlines{pms_instruction}{pending_instruction}{quiz_instruction}

TODAY'S DATE: {today}

CURRENT USER DATA:
- Name: {user_name}
- Subjects: {', '.join(subjects) if subjects else 'Not set'}
- LeetCode username: {context.get('leetcodeUsername', 'Not set')}
- Deadlines: {deadlines_str}
- Topics: {topics_str}
- Gym: streak={gym.get('currentStreak', 0)} days, best={gym.get('bestStreak', 0)} days, this week={gym.get('thisWeek', 0)} days
- Period & Cycle: {period_str}
- Notes: {notes_list}
- Quiz sessions completed: {len(quiz_history)}
- Current Balance: ${balance}
- Pending Splitwise Items: {splitwise_str}

WHAT YOU CAN DO:
1. DEADLINES — add/update/complete/list deadlines from natural language
2. STUDY TOPICS — track topic plans and completions per subject
3. GYM — log gym visits/skips, analyze streaks
4. PERIOD & CYCLE — log start/end dates, predict next period, track phases (follicular/ovulation/luteal/PMS)
5. DAILY WRAP-UP — ask what they accomplished, then log it
6. QUIZ — generate questions and grade answers conversationally
7. NOTES — save and recall quick notes
8. FINANCES — log balance, track expenses/income, manage splitwise reminders
9. MILESTONES — break down major projects (e.g. Dissertation) into multiple deadlines with the same 'subject'.
10. GENERAL — study advice, focus recommendations, accountability

STRATEGY FOR PROJECTS:
- When a user adds a large project (like a dissertation or thesis), suggest breaking it down into 3-5 milestones or "reports".
- Each milestone should be added as a separate ADD_DEADLINE action with the same 'subject' (e.g., 'Dissertation').
- This ensures they stay grouped together in the user's view.

CRITICAL: YOUR RESPONSE FORMAT
You MUST ALWAYS respond with ONLY valid JSON. No text before or after. No markdown fences.

{{"message": "Your natural language response", "action": null}}

OR with an action:

{{"message": "Your natural language response", "action": {{"type": "ACTION_TYPE", "data": {{}}}}}}

AVAILABLE ACTIONS AND DATA SCHEMAS:

ADD_DEADLINE:
  data: {{ "title": "str", "subject": "str", "dueDate": "YYYY-MM-DD", "startDate": "YYYY-MM-DD or null", "type": "assignment|exam|project|job_application", "askingForStartDate": true/false }}
  RULE: If the user did NOT provide a start date, set startDate to null, askingForStartDate to true, and ASK for it in your message.
  RULE: If they provided both dates, set askingForStartDate to false and save immediately.

UPDATE_DEADLINE:
  data: {{ "id": "str", "updates": {{ ... }} }}

COMPLETE_DEADLINE:
  data: {{ "id": "str", "title": "str" }}

DELETE_DEADLINE:
  data: {{ "id": "str" }}

ADD_NOTE:
  data: { "text": "str", "date": "YYYY-MM-DD or null" }
  RULE: If the user says "remind me on [date]" or "note for [date]", include that date. This helps items reflect on the calendar.

DELETE_NOTE:
  data: { "id": "str" }

LOG_GYM:
  data: { "date": "YYYY-MM-DD", "didGo": true/false }

LOG_PERIOD_START:
  data: { "date": "YYYY-MM-DD" }

LOG_PERIOD_END:
  data: { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }

GET_CYCLE_PREDICTION:
  data: { "action": "predict" }

ADD_TOPIC:
  data: { "subject": "str", "topics": ["topic1", "topic2", ...] }

COMPLETE_TOPIC:
  data: { "subject": "str", "topic": "str" }

LOG_DAILY_PROGRESS:
  data: { "summary": "str", "date": "YYYY-MM-DD" }

START_QUIZ:
  data: { "quizType": "leetcode|subject|mixed", "count": 5, "subject": "optional str" }
  NOTE: Use this ONLY for the initial quiz request. The quiz questions will be fetched separately.

GRADE_QUIZ:
  data: { "score": int, "total": int, "subject": "str" }

ADD_SUBJECT:
  data: { "subject": "str" }

REMOVE_SUBJECT:
  data: { "subject": "str" }

SET_BALANCE:
  data: { "amount": float }
  RULE: Use when user states their current total balance

ADD_TRANSACTION:
  data: { "amount": float, "description": "str", "type": "expense|income", "date": "YYYY-MM-DD or null" }

ADD_SPLITWISE:
  data: { "amount": float, "description": "str", "date": "YYYY-MM-DD or null" }

COMPLETE_SPLITWISE:
  data: { "id": "str", "description": "str" }

RULES:
1. Return ONLY valid JSON — nothing else ever
2. Make "message" warm, natural, conversational
3. Never fabricate deadline data — only use what's in CURRENT USER DATA
4. For "daily wrapup" → first ask what they accomplished (action: null), THEN when they tell you, return LOG_DAILY_PROGRESS
5. Parse natural dates intelligently: "next friday", "in 2 weeks", "april 2nd" → YYYY-MM-DD based on today={today}
6. When listing deadlines, format them nicely in the message text (not raw JSON)
7. If the user marks a deadline complete, find its ID from the deadlines list and use COMPLETE_DEADLINE
8. For Finance: parse implicit money updates, e.g. "I spent $20 on groceries" triggers ADD_TRANSACTION. Include the date if specified.
9. If user says they added something to Splitwise, find it in Pending Splitwise Items and trigger COMPLETE_SPLITWISE
10. For PERIOD TRACKING: When user says "my period started on [date]" → LOG_PERIOD_START with the date
11. For PERIOD TRACKING: When user says "period ended" or "period ended on [date]" → LOG_PERIOD_END with start date and end date
12. For CYCLE PREDICTION: When user asks "when's my next period?" or "what's my cycle?" → offer GET_CYCLE_PREDICTION action
13. CALENDAR REFLECTION: Ensure ALL date-related requests (reminders, deadlines, gym sessions, periods) use the correct date so they show up on the user's calendar.
"""

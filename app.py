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
    calculate_cycle_stats, predict_cycle_phases
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
9. GENERAL — study advice, focus recommendations, accountability

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
  data: {{ "text": "str" }}

DELETE_NOTE:
  data: {{ "id": "str" }}

LOG_GYM:
  data: {{ "date": "YYYY-MM-DD", "didGo": true/false }}

LOG_PERIOD_START:
  data: {{ "date": "YYYY-MM-DD" }}

LOG_PERIOD_END:
  data: {{ "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }}

GET_CYCLE_PREDICTION:
  data: {{ "action": "predict" }}

ADD_TOPIC:
  data: {{ "subject": "str", "topics": ["topic1", "topic2", ...] }}

COMPLETE_TOPIC:
  data: {{ "subject": "str", "topic": "str" }}

LOG_DAILY_PROGRESS:
  data: {{ "summary": "str", "date": "YYYY-MM-DD" }}

START_QUIZ:
  data: {{ "quizType": "leetcode|subject|mixed", "count": 5, "subject": "optional str" }}
  NOTE: Use this ONLY for the initial quiz request. The quiz questions will be fetched separately.

GRADE_QUIZ:
  data: {{ "score": int, "total": int, "subject": "str" }}

ADD_SUBJECT:
  data: {{ "subject": "str" }}

REMOVE_SUBJECT:
  data: {{ "subject": "str" }}

SET_BALANCE:
  data: {{ "amount": float }}
  RULE: Use when user states their current total balance

ADD_TRANSACTION:
  data: {{ "amount": float, "description": "str", "type": "expense|income" }}

ADD_SPLITWISE:
  data: {{ "amount": float, "description": "str" }}

COMPLETE_SPLITWISE:
  data: {{ "id": "str", "description": "str" }}

RULES:
1. Return ONLY valid JSON — nothing else ever
2. Make "message" warm, natural, conversational
3. Never fabricate deadline data — only use what's in CURRENT USER DATA
4. For "daily wrapup" → first ask what they accomplished (action: null), THEN when they tell you, return LOG_DAILY_PROGRESS
5. Parse natural dates intelligently: "next friday", "in 2 weeks", "april 2nd" → YYYY-MM-DD based on today={today}
6. When listing deadlines, format them nicely in the message text (not raw JSON)
7. If the user marks a deadline complete, find its ID from the deadlines list and use COMPLETE_DEADLINE
8. For Finance: parse implicit money updates, e.g. "I spent $20 on groceries" triggers ADD_TRANSACTION
9. If user says they added something to Splitwise, find it in Pending Splitwise Items and trigger COMPLETE_SPLITWISE
10. For PERIOD TRACKING: When user says "my period started on [date]" → LOG_PERIOD_START with the date
11. For PERIOD TRACKING: When user says "period ended" or "period ended on [date]" → LOG_PERIOD_END with start date and end date
12. For CYCLE PREDICTION: When user asks "when's my next period?" or "what's my cycle?" → offer GET_CYCLE_PREDICTION action
"""


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "online",
        "client_ready": client is not None,
        "api_key_set": api_key is not None,
        "server_time": datetime.now().isoformat()
    })


@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        message = data.get('message', '')
        context = data.get('context', {})
        chat_history = data.get('chatHistory', [])

        print(f"📩 Incoming /api/chat request: {len(message)} chars from {context.get('userName', 'unknown')}")
        
        if not client:
            print("❌ Request failed: Client NOT initialized")
            return jsonify({
                "message": "⚠️ I'm missing my API key on Render. Please double check that GROK_API_KEY is added to your Environment Variables in the Render dashboard.",
                "action": None
            })

        # Mock responses for Finance testing
        user_msg = message.lower()
        if "balance" in user_msg and "500" in user_msg:
            return jsonify({
                "message": "Got it! I've set your balance to $500.00.",
                "action": {"type": "SET_BALANCE", "data": {"amount": 500}}
            })
        elif "groceries" in user_msg and "23" in user_msg:
            return jsonify({
                "message": "Ouch, groceries are expensive. I've logged the $23.00 expense for you!",
                "action": {"type": "ADD_TRANSACTION", "data": {"amount": 23, "description": "groceries", "type": "expense"}}
            })
        elif "pizza" in user_msg and "splitwise" in user_msg and "15" in user_msg:
            return jsonify({
                "message": "Yum, pizza! I've added a $15.00 reminder for Splitwise.",
                "action": {"type": "ADD_SPLITWISE", "data": {"amount": 15, "description": "pizza tonight"}}
            })

        system_prompt = build_system_prompt(context)

        # Build conversation history
        history_text = ""
        for msg in chat_history[-20:]:
            role = "User" if msg.get('role') == 'user' else "Aria"
            history_text += f"\n{role}: {msg.get('content', '')}"

        # Create the full prompt with history
        full_prompt = f"{system_prompt}\n\n--- CONVERSATION HISTORY ---{history_text}\n\n--- NEW MESSAGE ---\nUser: {message}"

        print(f"🤖 Calling Groq API (model: llama-3.3-70b-versatile)...")
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ]
        )
        text = response.choices[0].message.content
        print(f"✅ Groq responded successfully ({len(text)} chars)")

        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        try:
            result = json.loads(text)
            if 'message' not in result:
                result['message'] = text
            if 'action' not in result:
                result['action'] = None
        except json.JSONDecodeError:
            result = {"message": text, "action": None}

        return jsonify(result)


    except Exception as e:
        print(f"🔥 UNHANDLED ERROR in /api/chat: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "message": f"Hmm, something went wrong on my end 😅 Try again? (Error: {str(e)[:120]})",
            "action": None
        }), 200


@app.route('/api/leetcode', methods=['GET'])
def leetcode_stats():
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({"error": "Username required"}), 400

    query = """
    query getUserProfile($username: String!) {
        matchedUser(username: $username) {
            username
            submitStats: submitStatsGlobal {
                acSubmissionNum {
                    difficulty
                    count
                    submissions
                }
            }
            profile {
                ranking
                starRating
            }
        }
        allQuestionsCount {
            difficulty
            count
        }
    }
    """

    try:
        resp = requests.post(
            'https://leetcode.com/graphql',
            json={'query': query, 'variables': {'username': username}},
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': f'https://leetcode.com/{username}/',
                'Accept': 'application/json',
                'Origin': 'https://leetcode.com',
                'x-csrftoken': 'na'
            },
            timeout=10
        )
        return jsonify(resp.json())
    except requests.exceptions.Timeout:
        return jsonify({"error": "LeetCode API timed out. Try again!"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/quiz', methods=['POST'])
def generate_quiz():
    try:
        data = request.json
        quiz_type = data.get('quizType', 'mixed')
        count = min(int(data.get('count', 5)), 10)
        subject = data.get('subject', '')
        context = data.get('context', {})
        topics = context.get('topics', {})
        
        if not client:
            return jsonify({"error": "⚠️ Groq API key not configured on Render. Please add GROK_API_KEY to Environment Variables."}), 500

        if quiz_type == 'leetcode':
            prompt = f"""Generate exactly {count} LeetCode-style coding interview questions.
Mix difficulty: some easy, some medium.
For each question:
- Clear problem statement
- Example input and output
- Expected time/space complexity hint

Format strictly as:
Q1. [Title]
[Problem description]
Example: Input: X → Output: Y
Complexity hint: O(?)

Q2. [continue...]

Return ONLY the questions, no answers."""

        elif quiz_type == 'subject' and subject:
            subject_data = topics.get(subject, {})
            completed = [t.get('topic', '') for t in subject_data.get('completed', [])]
            all_topics = subject_data.get('topics', [])
            focus = completed if completed else (all_topics if all_topics else [subject])

            prompt = f"""Generate exactly {count} quiz questions for the subject: {subject}.
Focus on these topics: {', '.join(focus[:5]) if focus else subject}
Mix question types: conceptual understanding, application, analysis.
Make them thought-provoking but fair for a college student.

Format strictly as:
Q1. [Question text]

Q2. [Question text]

Return ONLY the questions, no answers."""

        else:  # mixed
            prompt = f"""Generate exactly {count} mixed study questions for a college CS student.
Cover: data structures, algorithms, system design fundamentals, and CS concepts.
Make them interesting and educational.

Format strictly as:
Q1. [Question text]

Q2. [Question text]

Return ONLY the questions, no answers."""

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}]
        )

        return jsonify({
            "questions": response.choices[0].message.content,
            "count": count,
            "type": quiz_type,
            "subject": subject
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/period/log-start', methods=['POST'])
def api_log_period_start():
    """Log period start date."""
    try:
        data = request.json
        user_id = data.get('userId', 'default_user')
        date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        notes = data.get('notes')
        
        result = log_period_start(user_id, date, notes)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/period/log-end', methods=['POST'])
def api_log_period_end():
    """Log period end date."""
    try:
        data = request.json
        user_id = data.get('userId', 'default_user')
        start_date = data.get('startDate')
        end_date = data.get('endDate', datetime.now().strftime('%Y-%m-%d'))
        
        if not start_date:
            return jsonify({"error": "startDate required"}), 400
        
        result = log_period_end(user_id, start_date, end_date)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/period/history', methods=['GET'])
def api_period_history():
    """Get period history for a user."""
    try:
        user_id = request.args.get('userId', 'default_user')
        history = get_period_history(user_id)
        return jsonify({"success": True, "data": history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/period/predict', methods=['GET'])
def api_predict_period():
    """Get cycle stats and next period prediction."""
    try:
        user_id = request.args.get('userId', 'default_user')
        stats = calculate_cycle_stats(user_id)
        return jsonify({"success": True, "data": stats})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/period/phases', methods=['GET'])
def api_period_phases():
    """Get cycle phases for a date."""
    try:
        user_id = request.args.get('userId', 'default_user')
        target_date = request.args.get('date')
        
        phases = predict_cycle_phases(user_id, target_date)
        return jsonify({"success": True, "data": phases})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/list-models', methods=['GET'])
def list_models():
    """List available Grok models."""
    if not client:
        return jsonify({"status": "error", "message": "No API key configured"}), 400

    try:
        models = client.models.list()
        model_names = [m.id for m in models]
        return jsonify({
            "status": "success",
            "models": model_names
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)[:200]
        }), 500


@app.route('/api/test-key', methods=['GET'])
def test_api_key():
    """Test if the Grok API key is valid."""
    if not client:
        return jsonify({"status": "error", "message": "No API key configured"}), 400

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": "Say 'API key is working!' in exactly one sentence."}]
        )
        return jsonify({
            "status": "success",
            "message": "✅ Groq API key is valid!",
            "response": response.choices[0].message.content
        })
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg:
            return jsonify({
                "status": "error",
                "message": "❌ 429 QUOTA EXCEEDED — Check your xAI billing",
                "error": error_msg[:200]
            }), 429
        elif "401" in error_msg or "invalid" in error_msg.lower():
            return jsonify({
                "status": "error",
                "message": "❌ API Key is invalid or expired",
                "error": error_msg[:200]
            }), 401
        else:
            return jsonify({
                "status": "error",
                "message": f"❌ Error: {error_msg[:120]}",
            }), 500


if __name__ == '__main__':
    app.run(debug=True, port=5001)

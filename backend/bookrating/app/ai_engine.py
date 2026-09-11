import logging
import os

from dotenv import load_dotenv
from groq import Groq, APIStatusError, APIConnectionError, APITimeoutError

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Groq client — API key is server-side only, never sent to the browser.
# ---------------------------------------------------------------------------

_api_key = os.environ.get("GROQ_API_KEY")
if not _api_key:
    raise RuntimeError("GROQ_API_KEY environment variable is not set.")

client = Groq(api_key=_api_key)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

def _load_system_prompt() -> str:
    """Load the persona/system prompt from disk. Falls back to a safe default."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_dir, "system_prompt.txt")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        logger.warning("system_prompt.txt not found — using fallback system prompt.")
        return "You are a helpful assistant for Younes's portfolio."


# Cache the prompt at module load time to avoid repeated disk reads.
_SYSTEM_PROMPT: str = _load_system_prompt()

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_ai_response(user_input: str, history: list, shelf_context: str = "") -> dict:
    """
    Call the Groq API and return a structured result dict.

    Returns:
        {"ok": True,  "content": "<ai reply>"}          on success
        {"ok": False, "error": "<safe error message>"}  on any failure

    Errors are logged server-side; callers receive only safe, user-friendly
    messages — no stack traces, no internal details.
    """
    # Keep only the last 6 history entries (3 pairs) to limit token usage.
    recent_history = history[-6:]

    # Build system message: base prompt + optional shelf context
    system_content = _load_system_prompt()
    if shelf_context:
        system_content += (
            "\n\n## User's Book Shelf Context\n"
            "The following is the user's current book shelf. Use this context to "
            "personalise your recommendations and responses:\n"
            + shelf_context
        )

    messages = [
        {"role": "system", "content": system_content},
        *recent_history,
        {"role": "user", "content": user_input},
    ]

    try:
        response = client.chat.completions.create(
            model="compound-beta-mini",
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
        )
        content = response.choices[0].message.content
        return {"ok": True, "content": content}

    except APITimeoutError:
        logger.error("Groq API timeout for user input length=%d", len(user_input))
        return {"ok": False, "error": "The AI took too long to respond. Please try again."}

    except APIConnectionError as exc:
        logger.error("Groq API connection error: %s", exc)
        return {"ok": False, "error": "Could not reach the AI service. Please check your connection and try again."}

    except APIStatusError as exc:
        # Covers 4xx/5xx from Groq — log the real status but hide it from clients
        logger.error("Groq API status error %s: %s", exc.status_code, exc.message)
        if exc.status_code == 429:
            return {"ok": False, "error": "The AI service is currently rate-limited. Please wait a moment and try again."}
        return {"ok": False, "error": "The AI service returned an error. Please try again shortly."}

    except Exception as exc:  # noqa: BLE001 — catch-all for unexpected errors
        logger.exception("Unexpected error calling Groq API: %s", exc)
        return {"ok": False, "error": "An unexpected error occurred. Please try again."}
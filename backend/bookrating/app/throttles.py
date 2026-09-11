from rest_framework.throttling import AnonRateThrottle


class ChatbotThrottle(AnonRateThrottle):
    """
    Stricter per-IP throttle applied only to the chatbot endpoint.
    Scope must match a key in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].
    Default: 10 requests per minute per anonymous IP.
    """

    scope = "chatbot"
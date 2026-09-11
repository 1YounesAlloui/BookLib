import os
from pathlib import Path
from dotenv import load_dotenv
import dj_database_url

load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if os.getenv("DEBUG", "False").lower() in ("true", "1", "yes"):
        SECRET_KEY = "django-insecure-dev-only-local-key-not-for-production-use"
    else:
        raise ValueError("SECRET_KEY environment variable must be set in production!")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

# Defense-in-depth: Restrict allowed hosts to prevent Host Header Injection
allowed_hosts_env = os.getenv("ALLOWED_HOSTS", "")
if allowed_hosts_env:
    ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_env.split(",") if h.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]", "testserver"]
else:
    ALLOWED_HOSTS = ["bookrating-orpin.vercel.app", ".vercel.app"]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party packages
    'rest_framework',
    'corsheaders',
    
    # Add your local Django apps here (e.g., 'books')
    "app",
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # Must be placed above CommonMiddleware
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'bookrating.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'bookrating.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

# Connect to Neon in production, fallback to SQLite locally
DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL'),
        conn_max_age=600,
        ssl_require=True
    )
}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS Settings: Restrict to authorized origins
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "https://bookrating-orpin.vercel.app",
]
extra_cors = os.getenv("CORS_ALLOWED_ORIGINS", "")
if extra_cors:
    for origin in extra_cors.split(","):
        o = origin.strip()
        if o and o not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(o)

if DEBUG:
    # Allow local network dev origins for Expo mobile testing
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^http://192\.168\.\d+\.\d+:\d+$",
        r"^http://10\.\d+\.\d+\.\d+:\d+$",
        r"^http://localhost:\d+$",
        r"^http://127\.0\.0\.1:\d+$",
    ]

# Defense-in-depth HTTP Security Headers
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000  # 1 year HSTS
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# DRF Throttling & Permissions
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/minute',
    },
}
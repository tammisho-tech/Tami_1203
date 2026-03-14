# פריסה עם Railway CLI — מדריך מלא

## בעיית התחברות? השתמשי בטוקן

אם `railway login` או `railway login --browserless` לא עובדים, אפשר להשתמש ב**טוקן**:

---

### שלב 1: התחברי לאתר (פעם אחת)

1. פתחי **https://railway.app** בדפדפן
2. לחצי **Deploy** או **Log in**
3. בחרי **Continue with GitHub** או **Log in using email**
4. התחברי

> אם גם כאן מופיעה שגיאה — נסי חלון פרטי, דפדפן אחר, או ביטול הרשאות Railway ב-GitHub (Settings → Applications).

---

### שלב 2: צרי טוקן

1. כשאת מחוברת, גלשי ל־**https://railway.app/account/tokens**
2. לחצי **Create Token** (או **New Token**)
3. תני שם (למשל: `TAMI-CLI`)
4. השאירי **Workspace** ריק (לטוקן ברמת חשבון)
5. לחצי **Create**
6. **העתיקי את הטוקן** — הוא יוצג רק פעם אחת

---

### שלב 3: הגדרת הטוקן ב-CLI

**ב-Command Prompt (cmd):**

```cmd
set RAILWAY_API_TOKEN=הטוקן_שהעתקת
```

**או ב-PowerShell:**

```powershell
$env:RAILWAY_API_TOKEN = "הטוקן_שהעתקת"
```

---

### שלב 4: בדיקה

```cmd
railway whoami
```

אם מופיע שמך — ההתחברות הצליחה.

---

### שלב 5: פריסה

```cmd
cd "c:\Users\תמי\שולחן העבודה\גיבויים one drive\OneDrive\שולחן העבודה\TAMI 06_03"
railway init
railway up
```

או לחצי פעמיים על **`railway-cli-setup.bat`**.

---

## משתני סביבה (לפני הפריסה)

הגדירי ב-Railway Dashboard (או עם `railway variable set`):

- `ANTHROPIC_API_KEY` — מפתח Anthropic
- `SECRET_KEY` — מחרוזת אקראית
- `DATABASE_URL` — אם משתמשת ב-PostgreSQL

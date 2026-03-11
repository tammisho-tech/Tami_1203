# פריסת TAMI ל-Railway

## שלבים לפני הפריסה

### 1. העלה את הפרויקט ל-GitHub
אם עדיין לא העלית:
```bash
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### 2. צור חשבון Railway
1. היכנסי ל־[railway.app](https://railway.app)
2. התחברי עם GitHub

---

## פריסה

### 3. צור פרויקט חדש
1. לחצי **"New Project"**
2. בחרי **"Deploy from GitHub repo"**
3. בחרי את הריפו **Tami_1203** (או השם שלך)

### 4. הוסף PostgreSQL
1. לחצי **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway ייצור אוטומטית את משתנה `DATABASE_URL`

### 5. הגדר משתני סביבה
בשירות הראשי (האפליקציה), לחצי **Variables** והוסף:

| משתנה | ערך | חובה |
|-------|-----|------|
| `ANTHROPIC_API_KEY` | המפתח מ-console.anthropic.com | כן |
| `SECRET_KEY` | מחרוזת אקראית (32+ תווים) | כן |
| `DATABASE_URL` | מוגדר אוטומטית מ-PostgreSQL | כן |

**הערה:** `DATABASE_URL` מוזן אוטומטית כשמחברים את שירות PostgreSQL. אם לא — העתיקי מהשירות PostgreSQL.

### 6. צור דומיין
1. לחצי **Settings** → **Networking**
2. לחצי **Generate Domain**
3. Railway ייצור קישור כמו: `tami-xxx.up.railway.app`

---

## בדיקה

1. פתחי את הקישור שנוצר
2. בדקי: `https://your-app.up.railway.app/health` — צפוי: `{"healthy": true}`

---

## בעיות נפוצות

### Build נכשל
- ודאי שהתיקיות `מסמכי תשתית`, `טקסטים לדוגמא`, `שאלות לדוגמא` קיימות ב-repo
- בדקי את הלוגים ב-Railway

### שגיאת 500
- בדקי ש-`ANTHROPIC_API_KEY` מוגדר
- בדקי ש-PostgreSQL מחובר ו-`DATABASE_URL` קיים

### Frontend לא נטען
- ודאי שהבנייה כוללת `npm run build` ב-frontend
- בדקי שהתיקייה `frontend/dist` נוצרת בבנייה

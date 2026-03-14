# פריסת 2 שירותים – Backend + Frontend

## סקירה
- **Backend** – API בלבד (FastAPI)
- **Frontend** – ממשק React בלבד

---

## שלב 1: Push ל-GitHub

הרצת 3 פקודות בטרמינל:
```
git add .
git commit -m "Add 2-service deployment: backend + frontend"
git push
```

חכי ש-GitHub Actions יסיים לבנות (כ־2–3 דקות). בדקי ב-Actions שכל 3 ה-builds הצליחו.

---

## שלב 2: יצירת שירות Backend ב-Railway

1. Railway → הפרויקט **fabulous-strength** → סביבת **production**
2. **+ New** → **Docker Image**
3. הזיני: `ghcr.io/tammisho-tech/tami-1203-backend:latest`
4. לחצי **Add**
5. **Settings** → **Networking** → **Generate Domain** (למשל `tami1203-api-production.up.railway.app`)
6. **Variables** → הוסיפי: `ANTHROPIC_API_KEY`, `SECRET_KEY`
7. שמרי את כתובת ה-Backend – תצטרכי אותה בשלב הבא

---

## שלב 3: הוספת BACKEND_URL ב-GitHub

1. GitHub → הפרויקט **Tami_1203** → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `BACKEND_URL`
4. Value: `https://[כתובת-ה-backend]` (למשל `https://tami1203-api-production.up.railway.app`)
5. לחצי **Add secret**

---

## שלב 4: בניית Frontend מחדש

1. GitHub → **Actions** → **Build and Push to GHCR**
2. **Run workflow** → **Run workflow**
3. חכי שה-build יסתיים (בעיקר `build-frontend`)

---

## שלב 5: יצירת שירות Frontend ב-Railway

1. Railway → הפרויקט **fabulous-strength** → **production**
2. **+ New** → **Docker Image**
3. הזיני: `ghcr.io/tammisho-tech/tami-1203-frontend:latest`
4. לחצי **Add**
5. **Settings** → **Networking** → **Generate Domain** (למשל `tami1203-production.up.railway.app`)
6. Deploy

---

## תוצאה

| שירות   | כתובת לדוגמה                          |
|---------|----------------------------------------|
| Backend | https://tami1203-api-production.up.railway.app |
| Frontend| https://tami1203-production.up.railway.app      |

המשתמשים נכנסים לכתובת ה-**Frontend**.

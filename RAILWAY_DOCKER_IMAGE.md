# פריסה עם Docker Image (עוקף את מגבלת הזיכרון)

הבנייה מתבצעת ב-GitHub (יותר זיכרון) במקום ב-Railway.

## שלב 1: Push – הבנייה תתחיל אוטומטית

אחרי `git push`, GitHub Actions יבנה את ה-Docker image ויעלה ל-GitHub Container Registry.

## שלב 2: הגדרת Railway לשימוש ב-Image

1. היכנסי ל-Railway → הפרויקט **fabulous-strength** → שירות **Tami_1203**
2. **Settings** → **Source**
3. שנה את המקור מ-"GitHub Repo" ל-**"Docker Image"**
4. בשדה Image כתבי: `ghcr.io/tammisho-tech/tami-1203:latest`
5. שמרי

## שלב 3: Deploy

לחצי **Deploy** → **Redeploy** (או Railway ימשוך את ה-image החדש אוטומטית).

## משתני סביבה

ב-Railway → **Variables** הוסיפי:
- `ANTHROPIC_API_KEY` – מפתח ה-API
- `SECRET_KEY` – מפתח אבטחה (מחרוזת אקראית)

# תיקון Build ב-Railway

## הבעיה
יש שני שירותים (BACKEND + FRONTEND) עם Root Directory שונה. ה-Dockerfile נמצא בשורש הפרויקט, אבל כל שירות בונה מתיקייה אחרת.

## הפתרון – שימוש בשירות אחד

### אופציה א': שינוי הגדרות ב-Railway (מומלץ)

1. היכנסי ל-[railway.app](https://railway.app) → הפרויקט TAMI
2. **אם יש שני שירותים (Backend + Frontend):**
   - מחקי את שירות ה-Frontend (או השביתי אותו)
   - השאירי רק שירות אחד
3. **בשירות שנשאר:**
   - Settings → **Root Directory** → השאירי **ריק** או כתבי `.`
   - כך Railway ישתמש בתיקיית השורש וימצא את ה-Dockerfile
4. שמרי והפעילי Deploy מחדש

### אופציה ב': יצירת שירות חדש

1. New → **GitHub Repo** → בחרי `Tami_1203`
2. **Root Directory** – השאירי ריק
3. Railway יזהה את ה-Dockerfile אוטומטית
4. Deploy

---

## איך לראות את לוגי השגיאה

1. ב-Railway: לחצי על ה-Deployment שנכשל
2. לחצי **View Logs** או **Build Logs**
3. תעתיקי את הודעת השגיאה – אפשר לשלוח לי ואעזור לפתור

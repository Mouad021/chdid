# p2p-token-locked (server)
- الحماية بالتوكن: لن ينضم أي متصفح إلا إذا كان `token` ضمن القائمة المسموح بها.
- ضع التوكنات في `.env` عبر `TOKEN_LIST=alpha,beta,...` أو عدّل المصفوفة داخل `server.js` في القسم المعلّم بوضوح.

## تشغيل محلي
```bash
cp .env.example .env
# عدّل TOKEN_LIST داخل .env
npm install
npm start
```

## Docker
```bash
docker build -t p2p-token-locked .
docker run -p 8080:8080 --env-file .env p2p-token-locked
```

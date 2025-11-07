# p2p-browser-sync server

## تشغيل محليًا
```bash
cp .env.example .env
npm install
npm start
```
يفتح على المنفذ 8080 افتراضيًا.

## Docker
```bash
docker build -t p2p-sync-server .
docker run -p 8080:8080 --env-file .env p2p-sync-server
```

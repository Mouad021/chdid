# p2p-token-server
- Token واحد = غرفة واحدة.
- لا نحتفظ بأي معرفات للمتصفحات. فقط العدد.

## تشغيل
npm install
npm start

## Docker
docker build -t p2p-token-server .
docker run -p 8080:8080 --env PORT=8080 p2p-token-server

# Token Sync Server

## Configure allowed token(s):
Edit `.env` or set Render Environment Variable:
TOKEN_LIST=mouad

## Run locally:
cp .env.example .env
npm install
npm start

## Deploy on Render:
- New Web Service
- Root directory = server folder path
- Build: npm install
- Start: npm start
- Add ENV: TOKEN_LIST=mouad

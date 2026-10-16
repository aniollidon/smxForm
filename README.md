# palamForm

Plataforma d'entregues (quizzes) autocorregibles amb integració amb Google Classroom.

## Requisits
Node 18+, un projecte a Google Cloud amb OAuth 2.0 (tipus Web) i l'API de Classroom activada.
URI de redirecció autoritzades:
- Desenvolupament: `http://localhost:5173/auth/google/callback` i `http://localhost:5173/auth/classroom/callback`.
- Producció (un sol port): `https://el-teu-domini/auth/google/callback` i `https://el-teu-domini/auth/classroom/callback`.

## Posada en marxa (desenvolupament)
```
cd server && cp .env.example .env   # omple GOOGLE_CLIENT_ID/SECRET, SESSION_SECRET, SEED_TEACHERS
npm install && npx prisma db push
npm run dev                          # API a :3001
cd ../client && npm install && npm run dev   # web a :5173
```
Producció: `cd client && npm run build` i `NODE_ENV=production npm start` a `server` (serveix `client/dist`).

## Producció amb PM2
El backend serveix el frontend compilat i l'API des del mateix port (`3001`). PM2 executa un únic procés Node.

1. Copia `.env.production.example` a `server/.env` i configura `BASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET`.
2. Instal·la les dependències, genera la base de dades i compila el frontend:
```
npm install --global pm2
cd server && npm ci && npx prisma db push
cd ../client && npm ci && npm run build
cd ..
```
3. Inicia i desa el procés de PM2:
```
pm2 start ecosystem.config.cjs --env production
pm2 startup
pm2 save
```
Executa també la comanda `sudo` que imprimeix `pm2 startup` per habilitar l'inici automàtic després d'un reinici. L'app queda disponible a `http://localhost:3001` (o al domini que apunta al servei). Per desplegar una nova versió, torna a compilar el frontend i executa `pm2 restart smxform --update-env`.

## Professors
Són usuaris a la BD amb `role=TEACHER`: `SEED_TEACHERS` (al `.env`) o `npm run add-teacher -- correu@inspalamos.cat`.
Qui entra amb @inspalamos.cat i no és professor és alumne.

## Classroom
El professor connecta Classroom des de l'editor de l'entrega, tria el curs i es crea una tasca (esborrany) amb el mateix nom i l'enllaç al quiz. Cal publicar-la al Classroom: l'accés a l'enllaç només es permet als alumnes amb la tasca assignada i mentre sigui publicada i dins del termini. «Exporta notes» envia la nota (millor o última) a cada alumne.

## Tests
`cd server && npm test` (motor de correcció).

## Pendent
Correcció amb IA de respostes lliures (es corregeixen manualment de moment).
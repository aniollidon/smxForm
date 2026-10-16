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

## Producció amb un sol port (recomanat)
L'app ja està preparada perquè el backend serveixi el frontend compilat. Amb Docker Compose exposes només `:3001`.

1. Crea l'arxiu d'entorn de producció:
```
cp .env.production.example .env.production
```

2. Omple com a mínim:
- `BASE_URL` amb la URL pública final (mateix host/port que exposes)
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET`

3. Arrenca en mode producció:
```
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

4. Atura el servei:
```
docker compose -f docker-compose.prod.yml down
```

Notes:
- La base de dades SQLite persisteix al volum `smxform_data`.
- Les pujades d'imatges persisteixen al volum `smxform_uploads`.
- Prisma s'inicialitza automàticament amb `prisma db push` en arrencar el contenidor.

## Professors
Són usuaris a la BD amb `role=TEACHER`: `SEED_TEACHERS` (al `.env`) o `npm run add-teacher -- correu@inspalamos.cat`.
Qui entra amb @inspalamos.cat i no és professor és alumne.

## Classroom
El professor connecta Classroom des de l'editor de l'entrega, tria el curs i es crea una tasca (esborrany) amb el mateix nom i l'enllaç al quiz. Cal publicar-la al Classroom: l'accés a l'enllaç només es permet als alumnes amb la tasca assignada i mentre sigui publicada i dins del termini. «Exporta notes» envia la nota (millor o última) a cada alumne.

## Tests
`cd server && npm test` (motor de correcció).

## Pendent
Correcció amb IA de respostes lliures (es corregeixen manualment de moment).
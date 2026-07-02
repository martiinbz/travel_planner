# Travel Planner Privado

Web privada en español para planear un viaje en pareja: mapa, rutas por día,
puntos de interés, reservas, checklist, notas, presupuesto estimado y
export/import de datos.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`. Si no configuras variables de entorno, la
contraseña local por defecto es `viaje2026`.

## Variables de entorno

Copia `.env.example` a `.env.local` y ajusta:

```bash
TRAVEL_PLANNER_PASSWORD=una-password-larga
TRAVEL_PLANNER_AUTH_SECRET=un-secreto-largo-distinto
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu-api-key-de-google
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

Google Maps es opcional para desarrollo. Sin clave, la app muestra un mapa
visual interno y enlaces a Google Maps. Con clave, carga un mapa interactivo
con buscador de Places, pins y ruta diaria caminando.

En Google Cloud activa estas APIs para la misma clave:

- Maps JavaScript API
- Places API
- Directions API
- Maps Embed API

Restringe la clave por dominio cuando esté en Vercel.

## Supabase

La app funciona con `localStorage` sin backend. Para usarla los dos desde el
dominio y sincronizar cambios entre navegadores:

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL editor.
3. Añade `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.

La sincronización pasa por `/api/trip`, que comprueba la cookie privada antes
de leer o escribir. La `service_role_key` no se expone al navegador.

## Deploy en Vercel

1. Conecta el repositorio a Vercel.
2. Añade las variables de entorno anteriores.
3. Despliega.
4. En Nominalia, apunta el dominio a Vercel siguiendo los DNS que te indique
   Vercel para dominio personalizado.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

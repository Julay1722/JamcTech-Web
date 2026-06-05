# Tests + Login (Supabase Auth)

Desde que el dashboard tiene login real, los tests Playwright necesitan
autenticarse antes de cargar datos. Lo hacen con un **usuario de test**
dedicado (separado del tuyo), con credenciales que viven en `.env`
(gitignored — nunca se commitean).

## Setup (una sola vez)

### 1. Crea un usuario de test en Supabase
- Supabase Dashboard → **Authentication → Users → Add user → Create new user**
- Correo: `tests@jamc.local` (o el que quieras, no necesita ser real)
- Contraseña: una que elijas
- ✅ Marca **Auto Confirm User**

> Nota: este usuario tiene acceso completo igual que el tuyo (el RLS deja
> pasar a cualquier `authenticated`). Los tests escriben/borran solo records
> con prefijo `TEST-` y se autolimpian. Aun así, úsalo solo para tests.

### 2. Pon las credenciales en `.env` (raíz del proyecto)
```
TEST_USER_EMAIL=tests@jamc.local
TEST_USER_PASSWORD=tu_clave_de_test
```
`playwright.config.js` carga `.env` automáticamente (vía dotenv).

### 3. Corre los tests
```
npx serve .            # en otra terminal: el dashboard en localhost:3000
npx playwright test
```

## Cómo funciona
`tests/helpers/app-ready.js` → `ensureLogin(page)`:
1. Espera a que `window.AT_CLIENT` esté listo.
2. Si no hay sesión, llama `AT_CLIENT.signIn(email, password)` con las
   credenciales del `.env`.
3. Recién ahí el dashboard corre los loaders y `__AIRTABLE_DATA__` carga.

Si faltan las variables, los tests fallan rápido con un mensaje claro
(no se cuelgan esperando datos que nunca llegan).

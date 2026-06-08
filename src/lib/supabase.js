// ════════════════════════════════════════════════════════════════
// src/lib/supabase.js — Cliente Supabase limpio (singleton) + auth.
//
// La capa de datos (loaders/writers, transacciones atómicas) vive en
// src/lib/db/*. Este módulo solo crea el cliente, expone helpers de auth
// y las constantes de enums que los formularios usan para validar.
//
// La llave publishable/anon puede viajar en el bundle: el RLS está cerrado
// a `authenticated`, así que sin login no devuelve nada. NUNCA poner la
// service_role key aquí.
// ════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://oicxvnnzocwnqlsojhco.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pY3h2bm56b2N3bnFsc29qaGNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTAzMzUsImV4cCI6MjA5NTMyNjMzNX0.rX41-VWKdon-3XuMCrpGhEJG-mXY7Dpl74AdoMWAUYk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Exponer en consola para depurar (igual que el viejo window.SB).
if (typeof window !== 'undefined') window.SB = supabase;

/* ──────────── Auth ──────────── */
export const auth = {
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email: (email || '').trim(), password }),
  signOut: () => supabase.auth.signOut(),
  getSession: () => supabase.auth.getSession(),
  onAuthChange: (cb) => supabase.auth.onAuthStateChange((_e, session) => cb(session)),
};

/* ──────────── IDs reales (verificados 2026-06-07 vs DB) ──────────── */
// Fuente de verdad de los defaults/lookups. NO usar fallback silencioso a
// BHD (CTA-1): los forms exigen cuenta real. Estos sirven para semántica.
export const CUENTAS = {
  BHD_DEBITO: 1, EFECTIVO: 2, SCOTIA_CC_RD: 3, SCOTIA_CC_USD: 4,
  QIK: 5, BHD_LINEA: 6, SCOTIA_DEBITO_USD: 7,
};
export const PRESTAMOS = {
  SCOTIA_CC_RD: 1, SCOTIA_CC_USD: 2, QIK: 3, COOP: 4, BHD_LINEA: 5,
};
export const CONTRAPARTES = {
  BHD: 1, COOPERATIVA: 2, SCOTIABANK: 3, QIK: 4, ALIBABA: 5, TEMU: 6,
  AMAZON: 7, ANDREA: 8, FACEBOOK: 9, CLIENTE_GENERICO: 17,
};

/* ──────────── Constantes de enums (forms validan contra esto) ──────────── */
export const SKU_CATEGORIAS = ['Mouse', 'Teclado', 'Headset', 'Stand', 'Mouse Pad', 'Otro'];

// categoria_sku DB (UPPERCASE) ↔ display
export const CAT_TO_DB = { Mouse: 'MOUSE', Teclado: 'TECLADO', Headset: 'HEADSET', Stand: 'STAND', 'Mouse Pad': 'MOUSEPAD', Otro: 'OTRO' };
export const CAT_FROM_DB = { MOUSE: 'Mouse', TECLADO: 'Teclado', HEADSET: 'Headset', STAND: 'Stand', MOUSEPAD: 'Mouse Pad', OTRO: 'Otro' };

export const STATUS_LOTE = ['PENDIENTE', 'EN_TRANSITO', 'EN_COURIER_USA', 'RECIBIDO', 'CANCELADO'];
export const STATUS_ENTRADA = ['PENDIENTE', 'RECIBIDO', 'PERDIDO'];

export const MOVFIN_TIPOS = [
  'Cuota Préstamo', 'Abono Préstamo',
  'Disposición Línea', 'Pago Línea', 'Cargo Línea',
  'Depósito Inversor', 'Retorno Inversor', 'Otro',
];

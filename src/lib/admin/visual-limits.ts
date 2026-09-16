/**
 * Batas karakter field template visual (subjek & camera angle).
 * Sumber kebenaran tetap DB/server; konstanta ini dipakai bersama oleh
 * validasi server (`visual-actions.ts`) dan counter di client.
 */
export const SUBJECT_EN_MIN = 10;
export const SUBJECT_EN_MAX = 500;

/** Tidak ada batas DB; 100 dipilih sebagai cap client-side (keputusan user). */
export const DISPLAY_NAME_MAX = 100;

/** `slugify()` memotong slug final di 60 karakter. */
export const SLUG_MAX = 60;

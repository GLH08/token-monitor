/**
 * Global UI state (Zustand): time-range preset, currency/token mode,
 * sensitive-data mask, and theme. Persisted to localStorage so user choices
 * survive reloads. Light-first (Aura design system default).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type CurrencyMode } from '../lib/currency';
import { DEFAULT_TIME_PRESET, type TimePreset } from '../lib/time';

export type Theme = 'dark' | 'light';

interface UIState {
    timePreset: TimePreset;
    setTimePreset: (preset: TimePreset) => void;

    currencyMode: CurrencyMode;
    setCurrencyMode: (mode: CurrencyMode) => void;

    masked: boolean;
    toggleMasked: () => void;
    setMasked: (value: boolean) => void;

    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            timePreset: DEFAULT_TIME_PRESET,
            setTimePreset: (preset) => set({ timePreset: preset }),

            currencyMode: 'token',
            setCurrencyMode: (mode) => set({ currencyMode: mode }),

            masked: false,
            toggleMasked: () => set((state) => ({ masked: !state.masked })),
            setMasked: (value) => set({ masked: value }),

            theme: 'light',
            setTheme: (theme) => set({ theme }),
            toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
        }),
        { name: 'tm-ui' },
    ),
);

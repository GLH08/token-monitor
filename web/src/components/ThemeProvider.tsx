import { useEffect, type ReactNode } from 'react';
import { useUIStore } from '../stores/ui';

/**
 * Applies the `dark` class on <html> to match the persisted theme.
 * Light-first: store defaults to 'light' (Aura design system).
 */
const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const theme = useUIStore((state) => state.theme);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    return <>{children}</>;
};

export default ThemeProvider;

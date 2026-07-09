import { useEffect, type ReactNode } from 'react';
import { useUIStore } from '../stores/ui';

/**
 * Applies the `dark` class on <html> to match the persisted theme.
 * Dark-first: the store defaults to 'dark' and index.html ships class="dark".
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

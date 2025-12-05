/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#e0f2fe',
                    100: '#bae6fd',
                    500: '#06b6d4',
                    600: '#0891b2',
                    700: '#0e7490',
                }
            },
            boxShadow: {
                'sm': '0 2px 8px rgba(0, 0, 0, 0.06)',
                'md': '0 8px 24px rgba(0, 0, 0, 0.12)',
                'lg': '0 12px 32px rgba(6, 182, 212, 0.4)',
                'glow': '0 4px 12px rgba(6, 182, 212, 0.3)',
            }
        },
    },
    plugins: [],
}

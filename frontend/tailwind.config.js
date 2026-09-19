/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ink: {
                    950: '#05070d',
                    900: '#0a0e18',
                    850: '#0e1320',
                    800: '#131a2a',
                    700: '#1c2436',
                    600: '#2a3348',
                },
                aurora: {
                    teal: '#5eead4',
                    cyan: '#67e8f9',
                    violet: '#a78bfa',
                },
                signal: '#f472b6',
                provider: {
                    groq: '#f55036',
                    gemini: '#4c8df6',
                    nvidia: '#76b900',
                },
            },
            fontFamily: {
                display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
            },
            keyframes: {
                'fade-up': {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'slide-in-right': {
                    '0%': { opacity: '0', transform: 'translateX(24px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                'pulse-ring': {
                    '0%': { transform: 'scale(1)', opacity: '0.7' },
                    '100%': { transform: 'scale(2.4)', opacity: '0' },
                },
                'travel': {
                    '0%': { left: '0%', opacity: '0' },
                    '15%': { opacity: '1' },
                    '85%': { opacity: '1' },
                    '100%': { left: '100%', opacity: '0' },
                },
                'orbit': {
                    '0%': { transform: 'rotate(0deg) translateX(var(--orbit-r, 28px)) rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg) translateX(var(--orbit-r, 28px)) rotate(-360deg)' },
                },
            },
            animation: {
                'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
                'fade-in': 'fade-in 0.4s ease-out both',
                'slide-in-right': 'slide-in-right 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
                'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
                'travel': 'travel 1.6s ease-in-out infinite',
                'orbit': 'orbit 3.2s linear infinite',
            },
        },
    },
    plugins: [],
}

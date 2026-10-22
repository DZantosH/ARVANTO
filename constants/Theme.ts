export type ThemeMode = 'system' | 'light' | 'dark';

export type AppTheme = {
  colors: {
    background: string; surface: string; navigation: string; text: string; muted: string; border: string;
    primary: string; primaryText: string; primarySoft: string; onPrimary: string; accent: string;
    success: string; successSoft: string; warning: string; warningSoft: string; danger: string; dangerSoft: string;
    dark: string; darkMuted: string; onDark: string;
  };
  radius: { none: number; card: number; control: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  typography: { label: number; body: number; section: number; title: number; amount: number };
};

const shared = {
  radius: { none: 0, card: 4, control: 4 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  typography: { label: 12, body: 14, section: 18, title: 28, amount: 36 },
};

export const lightTheme: AppTheme = {
  ...shared,
  colors: {
    background: '#F4F5F6', surface: '#FFFFFF', navigation: '#FFFFFF', text: '#202020', muted: '#64748B', border: '#E5E7EB',
    primary: '#FF6720', primaryText: '#B8430E', primarySoft: '#FFF0E8', onPrimary: '#202020', accent: '#FF6720',
    success: '#16845B', successSoft: '#E8F5EF', warning: '#D97706', warningSoft: '#FFF4DF', danger: '#DC2626', dangerSoft: '#FEECEC',
    dark: '#202020', darkMuted: '#C4C7CE', onDark: '#FFFFFF',
  },
};

export const darkTheme: AppTheme = {
  ...shared,
  colors: {
    background: '#151719', surface: '#202326', navigation: '#202326', text: '#F2F3F4', muted: '#A3ADB7', border: '#383E43',
    primary: '#FF7536', primaryText: '#FF9B6D', primarySoft: '#3A271F', onPrimary: '#1B1B1B', accent: '#FF7536',
    success: '#54C497', successSoft: '#20382F', warning: '#F5B852', warningSoft: '#3B3020', danger: '#FF7777', dangerSoft: '#3B2425',
    dark: '#111315', darkMuted: '#C3C9CE', onDark: '#FFFFFF',
  },
};

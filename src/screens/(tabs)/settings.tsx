import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, type Href } from '@/src/navigation/navigation';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import type { ThemeMode } from '@/constants/Theme';
import { useAuth } from '@/src/ui/AuthProvider';

const options: { value: ThemeMode; title: string; description: string; icon: string }[] = [
  { value: 'system', title: 'Sistema', description: 'Usa la apariencia del dispositivo', icon: '◐' },
  { value: 'light', title: 'Claro', description: 'Fondo claro durante todo el día', icon: '☀' },
  { value: 'dark', title: 'Oscuro', description: 'Fondo oscuro durante todo el día', icon: '☾' },
];

export default function SettingsScreen() {
  const { theme, mode, setMode } = useAppTheme();
  const { user, logout } = useAuth();
  const styles = useMemo(() => StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingBottom: 36, maxWidth: 760, width: '100%', alignSelf: 'center' },
    eyebrow: { color: theme.colors.primaryText, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
    title: { color: theme.colors.text, fontSize: 29, fontWeight: '900', marginTop: 4 },
    intro: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 25 },
    sectionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 10 },
    option: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, marginBottom: 9, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
    selected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    icon: { width: 38, height: 38, borderRadius: theme.radius.control, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', color: theme.colors.primaryText, fontSize: 20 },
    copy: { flex: 1 },
    optionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '800' },
    description: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
    check: { color: theme.colors.primaryText, fontSize: 20, fontWeight: '900' },
    hint: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 7 },
    account: { color: theme.colors.muted, fontSize: 12, marginTop: 25, marginBottom: 8 },
    accountLink: { minHeight: 49, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    accountLinkText: { color: theme.colors.primaryText, fontSize: 13, fontWeight: '800' },
    logout: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 7, backgroundColor: theme.colors.dangerSoft },
    logoutText: { color: theme.colors.danger, fontSize: 13, fontWeight: '800' },
  }), [theme]);

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>PREFERENCIAS</Text>
    <Text style={styles.title}>Ajustes</Text>
    <Text style={styles.intro}>Personaliza la apariencia de FerrePOS en este dispositivo.</Text>
    <Text style={styles.sectionTitle}>Tema de la aplicación</Text>
    {options.map((option) => {
      const selected = mode === option.value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setMode(option.value)} style={[styles.option, selected && styles.selected]}>
        <Text style={styles.icon}>{option.icon}</Text>
        <View style={styles.copy}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.description}>{option.description}</Text></View>
        {selected ? <Text style={styles.check}>✓</Text> : null}
      </Pressable>;
    })}
    <Text style={styles.hint}>La opción Sistema cambia automáticamente cuando actualizas el tema de tu dispositivo.</Text>
    <Text style={styles.account}>Sesión: {user?.name} · {user?.role === 'admin' ? 'Administrador' : user?.role === 'manager' ? 'Encargado' : 'Cajero'}</Text>
    <Link href={'/change-pin' as Href} asChild><Pressable style={styles.accountLink}><Text style={styles.accountLinkText}>Cambiar mi PIN</Text></Pressable></Link>
    {user?.role === 'admin' ? <Link href={'/users' as Href} asChild><Pressable style={styles.accountLink}><Text style={styles.accountLinkText}>Administrar usuarios y permisos</Text></Pressable></Link> : null}
    <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Cerrar sesión</Text></Pressable>
  </ScrollView>;
}

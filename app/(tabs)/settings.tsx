import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import type { ThemeMode } from '@/constants/Theme';

const options: { value: ThemeMode; title: string; description: string; icon: string }[] = [
  { value: 'system', title: 'Sistema', description: 'Usa la apariencia del dispositivo', icon: '◐' },
  { value: 'light', title: 'Claro', description: 'Fondo claro durante todo el día', icon: '☀' },
  { value: 'dark', title: 'Oscuro', description: 'Fondo oscuro durante todo el día', icon: '☾' },
];

export default function SettingsScreen() {
  const { theme, mode, setMode } = useAppTheme();
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
  </ScrollView>;
}

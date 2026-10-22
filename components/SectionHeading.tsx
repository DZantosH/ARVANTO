import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/ui/ThemeProvider';

export function SectionHeading({ title }: { title: string }) {
  const { styles } = useThemeStyles();
  return <Text style={styles.title}>{title}</Text>;
}

export function StatusPill({ label }: { label: string }) {
  const { styles } = useThemeStyles();
  return (
    <View style={styles.status}>
      <View style={styles.dot} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function useThemeStyles() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 7, height: 7, backgroundColor: theme.colors.success, borderRadius: theme.radius.control, marginRight: 5 },
  label: { color: theme.colors.muted, fontSize: 11, fontWeight: '600' },
}), [theme]);
  return { theme, styles };
}

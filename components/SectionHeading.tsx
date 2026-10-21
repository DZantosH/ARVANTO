import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/Theme';

export function SectionHeading({ title }: { title: string }) {
  return <Text style={styles.title}>{title}</Text>;
}

export function StatusPill({ label }: { label: string }) {
  return (
    <View style={styles.status}>
      <View style={styles.dot} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 7, height: 7, backgroundColor: '#4C9A76', borderRadius: 4, marginRight: 5 },
  label: { color: theme.colors.muted, fontSize: 11, fontWeight: '600' },
});

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect, type Href } from '@/src/navigation/navigation';
import { useSQLiteContext } from '@/src/native/database';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import type { AppUser } from '@/src/database/businessRepository';

export default function UsersScreen() {
  const { theme } = useAppTheme(); const db = useSQLiteContext();
  const [users, setUsers] = useState<(AppUser & { username: string })[]>([]);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    void db.getAllAsync<AppUser & { username: string }>('SELECT id,name,username,role,is_active FROM app_users WHERE remote_id IS NOT NULL ORDER BY name COLLATE NOCASE')
      .then(result => { if (active) setUsers(result); }).catch(() => { if (active) setError('No se pudieron consultar los usuarios.'); });
    return () => { active = false; };
  }, [db]));
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, gap: 12 }, title: { fontSize: 26, fontWeight: '900', color: theme.colors.text }, body: { fontSize: 13, lineHeight: 20, color: theme.colors.muted }, card: { padding: 16, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }, name: { fontSize: 16, fontWeight: '700', color: theme.colors.text }, link: { padding: 16, backgroundColor: theme.colors.primarySoft }, linkText: { color: theme.colors.primaryText, fontWeight: '700' }, error: { color: theme.colors.danger } });
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Usuarios del negocio</Text>
    <Text style={styles.body}>El registro de cuentas, las contraseñas y los permisos se administran desde la web de ARVANTO. Aquí aparecen las cuentas que han iniciado sesión en este dispositivo.</Text>
    <Link href={'/audit' as Href} asChild><Pressable style={styles.link}><Text style={styles.linkText}>Abrir bitácora de actividad</Text></Pressable></Link>
    {users.map(account => <View key={account.id} style={styles.card}><Text style={styles.name}>{account.name}</Text><Text style={styles.body}>{account.username} · {account.role === 'admin' ? 'Administrador' : account.role === 'manager' ? 'Encargado' : 'Cajero'}</Text></View>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

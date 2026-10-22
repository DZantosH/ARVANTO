import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';
import { createUser, getUsers, setUserActive, type AppUser, type UserRole } from '@/src/database/businessRepository';

const roles: { role: UserRole; name: string; permissions: string }[] = [
  { role: 'admin', name: 'Administrador', permissions: 'Todos los módulos y usuarios' },
  { role: 'manager', name: 'Encargado', permissions: 'Productos, inventario, clientes, compras, caja, ventas y reportes' },
  { role: 'cashier', name: 'Cajero', permissions: 'Ventas, catálogo, caja y clientes' },
];
export default function UsersScreen() {
  const { theme } = useAppTheme(); const { user, reloadUsers } = useAuth(); const db = useSQLiteContext();
  const [users, setUsers] = useState<AppUser[]>([]); const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [role, setRole] = useState<UserRole>('cashier'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 18, paddingBottom: 36, maxWidth: 800, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 10, letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4 }, section: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 }, body: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, card: { padding: 13, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, userName: { color: theme.colors.text, fontSize: 13, fontWeight: '800' }, input: { minHeight: 45, marginTop: 8, paddingHorizontal: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }, button: { minHeight: 45, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary }, buttonText: { color: theme.colors.onPrimary, fontWeight: '800' }, choice: { minHeight: 42, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }, chosen: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, roleText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: '800' }, error: { color: theme.colors.danger, marginTop: 8, fontSize: 12 }, deactivate: { color: theme.colors.danger, fontWeight: '800', fontSize: 11 }, active: { color: theme.colors.success, fontWeight: '800', fontSize: 11 } });
  const refresh = useCallback(async () => setUsers(await getUsers(db)), [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const save = async () => { setBusy(true); setError(''); try { await createUser(db, name, pin, role); setName(''); setPin(''); await refresh(); await reloadUsers(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario.'); } finally { setBusy(false); } };
  const toggle = (target: AppUser) => {
    if (target.id === user?.id) { setError('No puedes desactivar la sesión que estás usando.'); return; }
    if (target.role === 'admin' && target.is_active && users.filter((item) => item.role === 'admin' && item.is_active).length <= 1) { setError('Debe quedar al menos un administrador activo.'); return; }
    Alert.alert(target.is_active ? 'Desactivar usuario' : 'Activar usuario', `${target.name} ${target.is_active ? 'no podrá ingresar' : 'podrá volver a ingresar'}.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: () => { void setUserActive(db, target.id, !target.is_active).then(refresh).then(reloadUsers); } }]);
  };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>ACCESO AL NEGOCIO</Text><Text style={styles.title}>Usuarios y permisos</Text>
    <Text style={styles.section}>Perfiles</Text>{roles.map((item) => <View key={item.role} style={styles.card}><Text style={styles.userName}>{item.name}</Text><Text style={styles.body}>{item.permissions}</Text></View>)}
    <Text style={styles.section}>Agregar usuario</Text><TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={theme.colors.muted} style={styles.input} /><TextInput value={pin} onChangeText={setPin} placeholder="PIN (6 a 8 dígitos)" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} />
    <View style={[styles.row, { marginTop: 8 }]}>{roles.map((item) => <Pressable key={item.role} onPress={() => setRole(item.role)} style={[styles.choice, role === item.role && styles.chosen]}><Text style={styles.roleText}>{item.name}</Text></Pressable>)}</View>
    <Pressable disabled={busy} onPress={() => void save()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Crear usuario'}</Text></Pressable>
    <Text style={styles.section}>Usuarios registrados</Text>{users.map((item) => <View key={item.id} style={styles.card}><View style={styles.row}><View><Text style={styles.userName}>{item.name}{item.id === user?.id ? ' · Tú' : ''}</Text><Text style={styles.body}>{roles.find((option) => option.role === item.role)?.name}</Text></View><Pressable disabled={item.id === user?.id} onPress={() => toggle(item)}><Text style={item.is_active ? styles.deactivate : styles.active}>{item.is_active ? 'Desactivar' : 'Activar'}</Text></Pressable></View></View>)}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

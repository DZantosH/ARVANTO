import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useAppTheme } from '@/src/ui/ThemeProvider';

export default function TabLayout() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({ tabBar: { height: 66, paddingTop: 7, paddingBottom: 8, borderTopColor: theme.colors.border, backgroundColor: theme.colors.navigation } }), [theme]);
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.colors.primaryText,
      tabBarInactiveTintColor: theme.colors.muted,
      tabBarStyle: styles.tabBar,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarLabel: 'Inicio', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 21 }}>⌂</Text> }} />
      <Tabs.Screen name="products" options={{ title: 'Productos', tabBarLabel: 'Productos', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>▦</Text> }} />
      <Tabs.Screen name="sale" options={{ title: 'Venta', tabBarLabel: 'Venta', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>＋</Text> }} />
      <Tabs.Screen name="cash" options={{ title: 'Caja', tabBarLabel: 'Caja', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>◷</Text> }} />
      <Tabs.Screen name="backup" options={{ title: 'Respaldos', tabBarLabel: 'Respaldo', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>↥</Text> }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarLabel: 'Ajustes', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>⚙</Text> }} />
    </Tabs>
  );
}

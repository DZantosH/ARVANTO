import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Text } from 'react-native';
import { ThemeProvider, useAppTheme } from './src/ui/ThemeProvider';
import { AuthProvider, useAuth } from './src/ui/AuthProvider';
import { SQLiteProvider } from './src/native/database';
import { migrateDatabase } from './src/database/migrations';
import { navigationRef, type RootRoutes } from './src/navigation/navigation';
import Access from './src/screens/access';
import Dashboard from './src/screens/(tabs)/index';
import Products from './src/screens/(tabs)/products';
import Sale from './src/screens/(tabs)/sale';
import Cash from './src/screens/(tabs)/cash';
import Backup from './src/screens/(tabs)/backup';
import Settings from './src/screens/(tabs)/settings';
import Inventory from './src/screens/inventory';
import InventoryCount from './src/screens/inventory-count';
import Customers from './src/screens/customers';
import Purchases from './src/screens/purchases';
import Reports from './src/screens/reports';
import Users from './src/screens/users';
import Audit from './src/screens/audit';

const Stack = createNativeStackNavigator<RootRoutes>();
const Tabs = createBottomTabNavigator();
const icon = (glyph: string) => function TabIcon({ color }: { color: string }) { return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>; };
function MainTabs() {
  const { theme } = useAppTheme(); const { user } = useAuth();
  return <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.colors.primaryText, tabBarInactiveTintColor: theme.colors.muted, tabBarStyle: { backgroundColor: theme.colors.navigation }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' } }}>
    <Tabs.Screen name="index" component={Dashboard} options={{ title: 'Inicio', tabBarIcon: icon('⌂') }} />
    <Tabs.Screen name="products" component={Products} options={{ title: 'Productos', tabBarIcon: icon('▦') }} />
    <Tabs.Screen name="sale" component={Sale} options={{ title: 'Venta', tabBarIcon: icon('＋') }} />
    <Tabs.Screen name="cash" component={Cash} options={{ title: 'Caja', tabBarIcon: icon('◷') }} />
    {user?.role !== 'cashier' ? <Tabs.Screen name="backup" component={Backup} options={{ title: 'Respaldo', tabBarIcon: icon('↥') }} /> : null}
    <Tabs.Screen name="settings" component={Settings} options={{ title: 'Ajustes', tabBarIcon: icon('⚙') }} />
  </Tabs.Navigator>;
}
function AppNavigation() {
  const { user, ready } = useAuth(); const { theme } = useAppTheme();
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  const navigationTheme = { ...(theme.colors.background === '#151719' ? DarkTheme : DefaultTheme), colors: { ...DefaultTheme.colors, background: theme.colors.background, card: theme.colors.surface, text: theme.colors.text, border: theme.colors.border, primary: theme.colors.primary } };
  return <NavigationContainer ref={navigationRef} theme={navigationTheme}>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? <Stack.Screen name="access" component={Access} /> : <>
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="customers" component={Customers} options={{ headerShown: true, title: 'Clientes' }} />
        {user.role !== 'cashier' ? <>
          <Stack.Screen name="inventory" component={Inventory} options={{ headerShown: true, title: 'Inventario' }} />
          <Stack.Screen name="inventory-count" component={InventoryCount} options={{ headerShown: true, title: 'Conteo físico' }} />
          <Stack.Screen name="purchases" component={Purchases} options={{ headerShown: true, title: 'Compras' }} />
          <Stack.Screen name="reports" component={Reports} options={{ headerShown: true, title: 'Reportes' }} />
        </> : null}
        {user.role === 'admin' ? <>
          <Stack.Screen name="users" component={Users} options={{ headerShown: true, title: 'Usuarios' }} />
          <Stack.Screen name="audit" component={Audit} options={{ headerShown: true, title: 'Bitácora' }} />
        </> : null}
      </>}
    </Stack.Navigator>
  </NavigationContainer>;
}
function AppContent() {
  const { theme } = useAppTheme();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}><SQLiteProvider databaseName="ferrepos.db" onInit={migrateDatabase}><AuthProvider><AppNavigation /></AuthProvider></SQLiteProvider></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><ThemeProvider><AppContent /></ThemeProvider></SafeAreaProvider>; }

import { router, Stack, useSegments, type Href } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { migrateDatabase } from '@/src/database/migrations';
import { ThemeProvider } from '@/src/ui/ThemeProvider';
import { AuthProvider, useAuth } from '@/src/ui/AuthProvider';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SQLiteProvider databaseName="ferrepos.db" onInit={migrateDatabase} useSuspense>
        <AuthProvider>
          <AuthNavigationGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="access" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="inventory" />
            <Stack.Screen name="inventory-count" />
            <Stack.Screen name="customers" />
            <Stack.Screen name="purchases" />
            <Stack.Screen name="reports" />
            <Stack.Screen name="users" />
          </Stack>
        </AuthProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}

function AuthNavigationGuard() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  useEffect(() => {
    if (!ready) return;
    const section = String(segments[0]);
    if (!user && section !== 'access') router.replace('/access' as Href);
    else if (user && section === 'access') router.replace('/(tabs)' as Href);
    else if (user && user.role !== 'admin' && section === 'users') router.replace('/(tabs)/settings' as Href);
    else if (user?.role === 'cashier' && ['purchases', 'reports', 'backup', 'inventory', 'inventory-count'].includes(section)) router.replace('/(tabs)' as Href);
  }, [ready, user, segments]);
  return null;
}

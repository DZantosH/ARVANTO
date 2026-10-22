import { cloneElement, type ReactElement } from 'react';
import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
export { useFocusEffect } from '@react-navigation/native';
export type Href = string;
export type RootRoutes = { Main: { screen?: string } | undefined; access: undefined; inventory: undefined; 'inventory-count': undefined; customers: undefined; purchases: undefined; reports: undefined; users: undefined; audit: undefined; 'change-pin': undefined };
export const navigationRef = createNavigationContainerRef<RootRoutes>();
const tabs = new Set(['index', 'products', 'sale', 'cash', 'backup', 'settings']);
function destination(path: string) {
  const name = path.replace('/(tabs)', '').replace(/^\//, '') || 'index';
  return tabs.has(name) ? { name: 'Main', params: { screen: name } } : { name };
}
export const router = {
  push(path: Href) { if (navigationRef.isReady()) navigationRef.dispatch(CommonActions.navigate(destination(path))); },
  back() { if (navigationRef.canGoBack()) navigationRef.goBack(); },
};
export function Link({ href, children }: { href: Href; asChild?: boolean; children: ReactElement<{ onPress?: () => void }> }) {
  return cloneElement(children, { onPress: () => router.push(href) });
}

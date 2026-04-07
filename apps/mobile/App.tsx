import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { getAppHost } from '@shared/platform/appHost';

/**
 * Minimal shell: proves Metro can bundle a small slice of `packages/shared`.
 * Extend with auth and server list per docs/internal/react-native-bootstrap.md.
 */
export default function App() {
  const host = getAppHost();
  const label = host.isDesktopApp() ? 'desktop host' : 'web-default host';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Haven mobile shell</Text>
      <Text style={styles.subtitle}>AppHost: {label}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1726',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
});

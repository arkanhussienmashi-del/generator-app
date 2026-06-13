import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Linking, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  const [url, setUrl] = useState('http://192.168.28.140:3000');

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.icon}>⚡</Text>
      <Text style={styles.title}>إدارة المولّدات</Text>
      <Text style={styles.desc}>افتح هذا الرابط في متصفح الجوال</Text>
      <TextInput style={styles.input} value={url} onChangeText={setUrl} />
      <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(url)}>
        <Text style={styles.btnText}>فتح التطبيق</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2563eb', marginTop: 8, marginBottom: 16 },
  desc: { fontSize: 14, color: '#666', marginBottom: 12 },
  input: { width: '100%', maxWidth: 300, borderWidth: 2, borderColor: '#2563eb', borderRadius: 10, padding: 12, fontSize: 14, textAlign: 'center', marginBottom: 16, backgroundColor: '#fff' },
  btn: { backgroundColor: '#2563eb', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

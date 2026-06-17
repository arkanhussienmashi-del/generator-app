import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, StyleSheet, FlatList, Platform, Modal, Switch,
  Linking,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

let LocalAuthentication: any = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch {}
let Notifications: any = null;
try { Notifications = require('expo-notifications'); } catch {}

import {
  getDb, Generator, Subscriber, Payment, AmpereHistory, AmperePrice, Expense,
  WorkerCredential, WorkerPendingChange, ChangeDiff, PaymentHistoryEntry,
  OwnerNotification, NotificationChange,
  getAmpereForMonth, setPriceForMonth, getPriceForMonth,
  getExpensesForMonth, setExpensesForMonth,
  generateWorkerCode, generateWorkerPassword, validateWorkerPassword,
  setWorkerCredential, getWorkerCredentialsForGenerator, removeWorkerCredential,
  verifyWorker, getAllWorkerCredentialsAsync, saveWorkerCredentialGlobal,
  getPendingChanges, updateChangeStatus, addPendingChange, computeChangeDiff,
  createOwnerNotification, getOwnerNotifications, getOwnerNotificationById,
  getUnreadNotificationCount, getNotificationChanges, markNotificationAsRead,
  deleteNotification,
  addPartialPayment, getPartialPayments, getPaymentForSubMonth,
  logPaymentHistory, getPaymentHistory,
  isSubscriberVisibleInMonth, getDeletedSubscribersForMonth,
} from './src/db';

type WorkerAction = {
  id?: number;
  subscriberId: number;
  actionType: string;
  actionData: string;
  workerName: string;
  month?: number;
  year?: number;
  createdAt: string;
  approved?: boolean;
  approvedAt?: string;
  rejectedAt?: string;
};

type MonthPrice = { id?: number; month: number; year: number; pricePerAmpere: number; generatorId?: number };

type NotificationRecord = {
  id?: number;
  title: string;
  body: string;
  data?: any;
  read: boolean;
  readAt?: string;
  createdAt: string;
};
import {
  MONTHS, CURRENT_YEAR, CURRENT_MONTH, generateYears, calcTotal,
  formatNumber, formatPaidAt,
} from './src/utils';
import { COLORS, SIZES, SHADOWS } from './src/theme';
import {
  isLoggedIn, logoutUser, registerUser, loginUser,
  getOwnerName, setOwnerName, hasUsers,
  isWorkerLoggedIn, setWorkerSession, getWorkerSession, logoutWorker,
  isBiometricEnabled, setBiometricEnabled,
  getReminderDay, setReminderDay,
  type WorkerSession,
} from './src/auth';

const MONTH_NAMES = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const YEARS = generateYears();

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; error: string}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.toString() || 'Unknown error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={s.centerFlex}>
          <StatusBar style="light" />
          <Text style={{ fontSize: 48 }}>⚠️</Text>
          <Text style={s.errorTitle}>حدث خطأ</Text>
          <Text style={s.errorDetail}>{this.state.error}</Text>
          <TouchableOpacity onPress={() => this.setState({ hasError: false, error: '' })} style={s.retryBtn}>
            <Text style={s.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function LoadingScreen() {
  return (
    <View style={s.centerFlex}>
      <StatusBar style="light" />
      <Text style={{ fontSize: 64, marginBottom: 16 }}>⚡</Text>
      <Text style={s.appTitleText}>إدارة المولّدات</Text>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={s.appSubText}>جاري التحميل...</Text>
    </View>
  );
}

function RoleSelection({ setAuthScreen }: { setAuthScreen: (s: string) => void }) {
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.centerFlex}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>⚡</Text>
        <Text style={s.appTitleText}>إدارة المولّدات</Text>
        <Text style={s.appSubText}>نظام إدارة اشتراكات المولّدات</Text>

        <TouchableOpacity onPress={() => setAuthScreen('login')} style={s.roleOwnerBtn}>
          <Text style={{ fontSize: 36, marginLeft: 16 }}>👤</Text>
          <View style={s.roleBtnTextWrap}>
            <Text style={s.roleBtnTitle}>صاحب مولّد</Text>
            <Text style={s.roleBtnSub}>إدارة المشتركين والدفعات والتقارير</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setAuthScreen('workerLogin')} style={s.roleWorkerBtn}>
          <Text style={{ fontSize: 36, marginLeft: 16 }}>🔧</Text>
          <View style={s.roleBtnTextWrap}>
            <Text style={s.roleBtnTitle}>عامل</Text>
            <Text style={s.roleBtnSub}>تسجيل الدفعات والاشتراكات</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LoginScreen({ setRole, setAuthScreen }: { setRole: (r: any) => void; setAuthScreen: (s: string) => void }) {
  const [hasExistingUsers, setHasExistingUsers] = useState<boolean | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    (async () => {
      const exists = await hasUsers();
      setHasExistingUsers(exists);
      setIsRegisterMode(!exists);
    })();
  }, []);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRegister = async () => {
    if (!ownerNameInput.trim()) return Alert.alert('خطأ', 'أدخل اسم صاحب المولّد');
    if (!email.trim()) return Alert.alert('خطأ', 'أدخل البريد الإلكتروني');
    if (!validateEmail(email.trim())) return Alert.alert('خطأ', 'البريد الإلكتروني غير صحيح');
    if (!password) return Alert.alert('خطأ', 'أدخل كلمة المرور');
    if (password.length < 6) return Alert.alert('خطأ', 'كلمة المرور 6 أحرف على الأقل');
    if (password !== passwordConfirm) return Alert.alert('خطأ', 'كلمتا المرور غير متطابقتين');
    setLoading(true);
    try {
      const ok = await registerUser(email.trim(), password, ownerNameInput.trim());
      if (!ok) { Alert.alert('خطأ', 'البريد الإلكتروني مسجل مسبقاً'); setLoading(false); return; }
      await setOwnerName(ownerNameInput.trim());
      setRole('owner');
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!email.trim()) return Alert.alert('خطأ', 'أدخل البريد الإلكتروني');
    if (!validateEmail(email.trim())) return Alert.alert('خطأ', 'البريد الإلكتروني غير صحيح');
    if (!password) return Alert.alert('خطأ', 'أدخل كلمة المرور');
    setLoading(true);
    try {
      const ok = await loginUser(email.trim(), password);
      if (!ok) { Alert.alert('خطأ', 'البريد الإلكتروني أو كلمة المرور غير صحيحة'); setLoading(false); return; }
      const name = await getOwnerName();
      if (name) await setOwnerName(name);
      setRole('owner');
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); } finally { setLoading(false); }
  };

  if (hasExistingUsers === null) {
    return (
      <View style={s.centerFlex}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.appSubText}>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.padContent}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 8 }}>⚡</Text>
          <Text style={s.authTitle}>{isRegisterMode ? 'تسجيل حساب جديد' : 'تسجيل الدخول'}</Text>
        </View>
        {isRegisterMode && (
          <View style={s.formGroup}>
            <Text style={s.formLabel}>اسم صاحب المولّد</Text>
            <TextInput value={ownerNameInput} onChangeText={setOwnerNameInput} placeholder="الاسم" placeholderTextColor={COLORS.textLight} style={s.formInput} />
          </View>
        )}
        <View style={s.formGroup}>
          <Text style={s.formLabel}>البريد الإلكتروني</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="example@email.com" placeholderTextColor={COLORS.textLight} keyboardType="email-address" autoCapitalize="none" style={s.formInputLtr} />
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>كلمة المرور</Text>
          <View style={{ position: 'relative' }}>
            <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={COLORS.textLight} secureTextEntry={!showPassword} style={s.formInput} />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', left: 12, top: 14 }}>
              <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {isRegisterMode && (
          <View style={s.formGroup}>
            <Text style={s.formLabel}>تأكيد كلمة المرور</Text>
            <TextInput value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="••••••••" placeholderTextColor={COLORS.textLight} secureTextEntry={!showPassword} style={s.formInput} />
          </View>
        )}
        <TouchableOpacity onPress={isRegisterMode ? handleRegister : handleLogin} disabled={loading} style={[s.primaryBtn, loading && { opacity: 0.6 }]}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryBtnText}>{isRegisterMode ? 'تسجيل حساب جديد' : 'تسجيل الدخول'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsRegisterMode(!isRegisterMode)} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={s.linkText}>{isRegisterMode ? 'لديك حساب؟ سجّل دخولك' : 'ليس لديك حساب؟ أنشئ حساباً جديداً'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAuthScreen('roleSelection')} style={{ marginTop: 12, alignItems: 'center' }}>
          <Text style={s.linkText}>العودة</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function WorkerLoginScreen({ setRole, setAuthScreen }: { setRole: (r: any) => void; setAuthScreen: (s: string) => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedPass = password.trim();
    if (!trimmedCode) return Alert.alert('خطأ', 'أدخل كود العامل');
    if (!trimmedPass) return Alert.alert('خطأ', 'أدخل كلمة المرور');
    setLoading(true);
    try {
      const cred = await verifyWorker(trimmedCode, trimmedPass);
      if (!cred) { Alert.alert('خطأ', 'الكود أو كلمة المرور غير صحيحة'); setLoading(false); return; }
      const session: WorkerSession = { code: cred.code, name: cred.generatorName || '', ownerEmail: cred.ownerEmail || '' };
      await setWorkerSession(session);
      await saveWorkerCredentialGlobal(cred);
      setRole('worker');
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); } finally { setLoading(false); }
  };

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.padContent}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 8 }}>🔧</Text>
          <Text style={s.authTitle}>دخول العامل</Text>
          <Text style={s.authSubtext}>احصل على الكود والرمز من صاحب المولّد</Text>
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>كود العامل</Text>
          <TextInput value={code} onChangeText={setCode} placeholder="MOLD-XXXXXXXXXX" placeholderTextColor={COLORS.textLight} autoCapitalize="characters" style={[s.formInputLtr, s.codeFont]} />
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>كلمة المرور</Text>
          <View style={{ position: 'relative' }}>
            <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={COLORS.textLight} secureTextEntry={!showPassword} style={s.formInput} />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', left: 12, top: 14 }}>
              <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogin} disabled={loading} style={[s.primaryBtnWarn, loading && { opacity: 0.6 }]}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryBtnText}>تسجيل الدخول</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAuthScreen('roleSelection')} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={s.linkText}>العودة</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function GeneratorSetup({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('');
  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('خطأ', 'أدخل اسم المولّد');
    try {
      const d = await getDb();
      await d.runAsync('INSERT INTO generators (name) VALUES (?)', [name.trim()]);
      onComplete();
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); }
  };
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.setupContainer}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⚡</Text>
        <Text style={s.setupTitle}>مرحباً بك!</Text>
        <Text style={s.setupSubtitle}>لنبدأ بإضافة أول مولّد</Text>
        <TextInput value={name} onChangeText={setName} placeholder="اسم المولّد (مثل: مولّد الحيّ)" placeholderTextColor={COLORS.textLight} style={s.formInput} />
        <TouchableOpacity onPress={handleSave} style={[s.primaryBtn, { marginTop: 16 }]}>
          <Text style={s.primaryBtnText}>حفظ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MainApp({ setRole }: { setRole: (r: 'none') => void }) {
  const [screen, setScreen] = useState('home');
  const [screenParams, setScreenParams] = useState<any>({});
  const [navStack, setNavStack] = useState<string[]>(['home']);

  const navigate = useCallback((s: string, p?: any) => {
    setNavStack(prev => [...prev, s]);
    setScreenParams(p || {});
    setScreen(s);
  }, []);

  const goBack = useCallback(() => {
    setNavStack(prev => {
      if (prev.length <= 1) return prev;
      const newStack = prev.slice(0, -1);
      setScreen(newStack[newStack.length - 1]);
      return newStack;
    });
  }, []);

  const goHome = useCallback(() => {
    setNavStack(['home']);
    setScreen('home');
    setScreenParams({});
  }, []);

  const logout = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', style: 'destructive', onPress: async () => { await logoutUser(); setRole('none'); } },
    ]);
  };

  const nav = { navigate, goBack, goHome, logout, params: screenParams };

  switch (screen) {
    case 'home': return <HomeScreen key="home" nav={nav} />;
    case 'subscribers': return <SubscriberListScreen key="sub" nav={nav} />;
    case 'addEdit': return <AddEditSubscriberScreen key="ae" nav={nav} />;
    case 'reports': return <ReportsScreen key="rpt" nav={nav} />;
    case 'subYearReport': return <SubscriberYearReportScreen key="syr" nav={nav} />;
    case 'generators': return <GeneratorsScreen key="gen" nav={nav} />;
    case 'settings': return <SettingsScreen key="set" nav={nav} />;
    case 'pendingChanges': return <PendingChangesScreen key="pc" nav={nav} />;
    case 'notifications': return <NotificationsScreen key="not" nav={nav} />;
    case 'notificationDetail': return <NotificationDetailScreen key="nd" nav={nav} />;
    case 'monthDetail': return <MonthDetailScreen key="md" nav={nav} />;
    case 'printReceipt': return <PrintReceiptScreen key="pr" nav={nav} />;
    default: return <HomeScreen key="home" nav={nav} />;
  }
}

function HomeScreen({ nav }: { nav: any }) {
  const [loading, setLoading] = useState(true);
  const [ownerName, setOwnerNameLocal] = useState('');
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [selectedGenId, setSelectedGenId] = useState<number | null>(null);
  const [newGenName, setNewGenName] = useState('');
  const [showAddGen, setShowAddGen] = useState(false);
  const [price, setPrice] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expenses, setExpenses] = useState({ fuel: '', oil: '', maintenance: '', salaries: '' });
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [genCount, setGenCount] = useState(0);
  const viewMonth = CURRENT_MONTH;
  const viewYear = CURRENT_YEAR;

  const loadAll = useCallback(async () => {
    try {
      const d = await getDb();
      const gens = await d.getAllAsync<Generator>('SELECT * FROM generators ORDER BY id ASC');
      setGenerators(gens);
      setGenCount(gens.length);
      const gid = selectedGenId || (gens.length > 0 ? gens[0].id! : null);
      if (gid && selectedGenId === null) setSelectedGenId(gid);
      if (!gid) return;
      const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE generatorId=?', [gid]);
      setSubscribers(subs);
      const allPayments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE year=? AND generatorId=?', [viewYear, gid]);
      setPayments(allPayments);
      const p = await getPriceForMonth(viewMonth, viewYear, gid);
      setPrice(p > 0 ? p.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '');
      const exp = await getExpensesForMonth(viewMonth, viewYear, gid);
      const fmt = (n: number) => n > 0 ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
      setExpenses({
        fuel: fmt(exp.fuel),
        oil: fmt(exp.oil),
        maintenance: fmt(exp.maintenance),
        salaries: fmt(exp.salaries),
      });
      const name = await getOwnerName();
      setOwnerNameLocal(name);
      const cnt = await getUnreadNotificationCount();
      setUnreadCount(cnt);
    } catch {}
  }, [selectedGenId, viewMonth, viewYear]);

  useEffect(() => { (async () => { setLoading(true); await loadAll(); setLoading(false); })(); }, [loadAll]);

  const visibleSubs = useMemo(() => subscribers.filter(s => isSubscriberVisibleInMonth(s, viewMonth, viewYear)), [subscribers, viewMonth, viewYear]);
  const deletedThisMonth = useMemo(() => subscribers.filter(s => !isSubscriberVisibleInMonth(s, viewMonth, viewYear) && s.deletedMonth === viewMonth && s.deletedYear === viewYear), [subscribers, viewMonth, viewYear]);

  const stats = useMemo(() => {
    const monthPay = payments.filter(p => p.month === viewMonth && p.year === viewYear);
    const paidIds = new Set(monthPay.filter(p => p.paid).map(p => p.subscriberId));
    const paidSubs = visibleSubs.filter(s => paidIds.has(s.id!));
    let totalExpected = 0, totalCollected = 0;
    for (const s of visibleSubs) {
      const amount = calcTotal(s.ampere, Number(parseFormattedNumber(String(price))) || 0);
      totalExpected += amount;
      if (paidIds.has(s.id!)) totalCollected += amount;
    }
    return { totalSubs: visibleSubs.length, deletedCount: deletedThisMonth.length, totalSubsCount: visibleSubs.length + deletedThisMonth.length, paidCount: paidSubs.length, unpaidCount: visibleSubs.length - paidSubs.length, totalExpected, totalCollected, totalUnpaid: totalExpected - totalCollected };
  }, [visibleSubs, payments, viewMonth, viewYear, price, deletedThisMonth]);

  const formatInputNumber = (val: string): string => {
    const digits = val.replace(/[^0-9]/g, '');
    if (!digits) return '';
    const num = Number(digits);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const parseFormattedNumber = (val: string): string => {
    return val.replace(/,/g, '');
  };

  const expVals = useMemo(() => ({
    fuel: Number(parseFormattedNumber(expenses.fuel)) || 0,
    oil: Number(parseFormattedNumber(expenses.oil)) || 0,
    maintenance: Number(parseFormattedNumber(expenses.maintenance)) || 0,
    salaries: Number(parseFormattedNumber(expenses.salaries)) || 0,
  }), [expenses]);
  const totalExpenses = expVals.fuel + expVals.oil + expVals.maintenance + expVals.salaries;
  const netExpected = stats.totalCollected - totalExpenses;

  const handleAddGenerator = async () => {
    const name = newGenName.trim();
    if (!name) return Alert.alert('خطأ', 'أدخل اسم المولّد');
    try {
      const d = await getDb();
      await d.runAsync('INSERT INTO generators (name) VALUES (?)', [name]);
      setNewGenName(''); setShowAddGen(false);
      const gens = await d.getAllAsync<Generator>('SELECT * FROM generators ORDER BY id ASC');
      setGenerators(gens); setGenCount(gens.length);
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); }
  };

  const handlePriceChange = async (val: string) => {
    const raw = parseFormattedNumber(val);
    if (raw && isNaN(Number(raw))) return;
    const formatted = formatInputNumber(raw);
    setPrice(formatted);
    if (!selectedGenId) return;
    setPriceLoading(true);
    try { await setPriceForMonth(viewMonth, viewYear, Number(raw) || 0, selectedGenId); } catch {}
    setPriceLoading(false);
  };

  const handleExpenseChange = async (field: string, val: string) => {
    const raw = parseFormattedNumber(val);
    if (raw && isNaN(Number(raw))) return;
    const formatted = formatInputNumber(raw);
    setExpenses(prev => ({ ...prev, [field]: formatted }));
    if (!selectedGenId) return;
    try {
      const updated = { ...expenses, [field]: formatted };
      await setExpensesForMonth(viewMonth, viewYear, Number(parseFormattedNumber(updated.fuel)) || 0, Number(parseFormattedNumber(updated.oil)) || 0, Number(parseFormattedNumber(updated.maintenance)) || 0, Number(parseFormattedNumber(updated.salaries)) || 0, selectedGenId);
    } catch {}
  };

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={s.appSubText}>جاري التحميل...</Text></View>;

  const selectedGen = generators.find(g => g.id === selectedGenId);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="light" />

      <View style={dash.header}>
        <TouchableOpacity onPress={() => nav.navigate('settings')} style={dash.hamburger}>
          <Text style={{ fontSize: 24, color: COLORS.white }}>☰</Text>
        </TouchableOpacity>
        <Text style={dash.headerTitle}>أركان</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => nav.navigate('notifications')} style={dash.notifBtn}>
            <Text style={dash.notifBtnText}>الإشعارات</Text>
            {unreadCount > 0 && <View style={dash.notifBadge}><Text style={{ color: COLORS.white, fontSize: 10, fontWeight: 'bold' }}>{unreadCount > 9 ? '+9' : unreadCount}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {}} style={dash.switchBtn}>
            <Text style={dash.switchBtnText}>↔ تبديل المولد</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        <View style={dash.topBtnsRow}>
          <TouchableOpacity onPress={() => setShowAddGen(!showAddGen)} style={dash.topBtnOutline}>
            <Text style={dash.topBtnOutlineText}>+ إضافة مولد</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => nav.navigate('reports', { generatorId: selectedGenId })} style={dash.topBtnFilled}>
            <Text style={dash.topBtnFilledText}>بيانات كل شهر</Text>
          </TouchableOpacity>
        </View>

        {showAddGen && (
          <View style={dash.addGenRow}>
            <TextInput value={newGenName} onChangeText={setNewGenName} placeholder="اسم المولّد" placeholderTextColor={COLORS.textLight} style={[dash.input, { flex: 1 }]} />
            <TouchableOpacity onPress={handleAddGenerator} style={dash.saveSmallBtn}><Text style={{ color: COLORS.white, fontWeight: 'bold' }}>حفظ</Text></TouchableOpacity>
          </View>
        )}

        <View style={dash.monthCard}>
          <Text style={dash.monthText}>{viewMonth + 1} / {viewYear}</Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 10 }}>
            <Text style={dash.priceLabel}>سعر الأمبير (د.ع)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
              <TextInput value={price} onChangeText={handlePriceChange} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textLight} style={dash.priceInput} />
              {priceLoading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 6 }} />}
            </View>
          </View>
        </View>

        <View style={dash.statsRow}>
          <View style={[dash.statCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[dash.statNum, { color: '#1565C0' }]}>{formatNumber(stats.totalSubsCount)}</Text>
            <Text style={dash.statLabel}>المجموع</Text>
          </View>
          <View style={[dash.statCard, { backgroundColor: '#FFF9C4' }]}>
            <Text style={[dash.statNum, { color: '#E65100' }]}>{formatNumber(visibleSubs.reduce((s, sub) => s + (sub.ampere || 0), 0))}</Text>
            <Text style={dash.statLabel}>أمبير ⚡</Text>
          </View>
          <View style={[dash.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[dash.statNum, { color: '#2E7D32' }]}>{formatNumber(stats.paidCount)}</Text>
            <Text style={dash.statLabel}>مدفوع</Text>
          </View>
          <View style={[dash.statCard, { backgroundColor: '#FFEBEE' }]}>
            <Text style={[dash.statNum, { color: '#C62828' }]}>{formatNumber(stats.unpaidCount)}</Text>
            <Text style={dash.statLabel}>غير مدفوع</Text>
          </View>
        </View>

        <View style={dash.summaryCard}>
          <View style={dash.summaryRow}>
            <Text style={dash.summaryLabel}>الموقع:</Text>
            <Text style={[dash.summaryValue, { color: '#1565C0' }]}>{formatNumber(stats.totalExpected)} د.ع</Text>
          </View>
          <View style={[dash.summaryRow, { borderBottomWidth: 0 }]}>
            <Text style={dash.summaryLabel}>المحصل:</Text>
            <Text style={[dash.summaryValue, { color: '#2E7D32' }]}>{formatNumber(stats.totalCollected)} د.ع</Text>
          </View>
        </View>

        <View style={dash.expensesCard}>
          <Text style={dash.expensesTitle}>الصرفيات 💸</Text>
          {[
            { key: 'fuel', icon: '🛢️', label: 'كاز' },
            { key: 'oil', icon: '🧴', label: 'دهن' },
            { key: 'maintenance', icon: '🔧', label: 'إصلاحات' },
            { key: 'salaries', icon: '👥', label: 'رواتب' },
          ].map(item => (
            <View key={item.key} style={dash.expRow}>
              <Text style={dash.expIcon}>{item.icon}</Text>
              <Text style={dash.expLabel}>{item.label}</Text>
              <TextInput
                value={(expenses as any)[item.key]}
                onChangeText={v => handleExpenseChange(item.key, v)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={COLORS.textLight}
                style={dash.expInput}
              />
            </View>
          ))}
          <View style={dash.expTotalRow}>
            <Text style={dash.expTotalValue}>{formatNumber(totalExpenses)} د.ع</Text>
            <Text style={dash.expTotalLabel}>الإجمالي</Text>
          </View>
        </View>

        <View style={dash.netCard}>
          <Text style={dash.netLabel}>الصافي المتوقع:</Text>
          <Text style={[dash.netValue, { color: netExpected >= 0 ? '#2E7D32' : '#C62828' }]}>{formatNumber(netExpected)} د.ع</Text>
        </View>

        <View style={dash.bottomBtnsRow}>
          <TouchableOpacity onPress={() => nav.navigate('reports', { generatorId: selectedGenId })} style={dash.bottomBtnOutline}>
            <Text style={dash.bottomBtnOutlineText}>التقارير</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => nav.navigate('subscribers', { generatorId: selectedGenId, generatorName: selectedGen?.name })} style={dash.bottomBtnFilled}>
            <Text style={dash.bottomBtnFilledText}>عرض المشتركين 👥</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SubscriberListScreen({ nav }: { nav: any }) {
  const genId = nav.params?.generatorId ?? null;
  const genName = nav.params?.generatorName ?? '';
  const [loading, setLoading] = useState(true);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [price, setPrice] = useState(0);
  const [viewMonth, setViewMonth] = useState(CURRENT_MONTH);
  const [viewYear, setViewYear] = useState(CURRENT_YEAR);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid' | 'cancelled'>('all');
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [deletedSubs, setDeletedSubs] = useState<Subscriber[]>([]);
  const [selectedDeleted, setSelectedDeleted] = useState<Subscriber | null>(null);
  const [showDeletedDetail, setShowDeletedDetail] = useState(false);
  const [ownerName, setOwnerNameLocal] = useState('');

  useEffect(() => {
    (async () => {
      if (!genId) return;
      try {
        const d = await getDb();
        const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE generatorId=?', [genId]);
        setSubscribers(subs);
        const allPayments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=? AND generatorId=?', [viewMonth, viewYear, genId]);
        setPayments(allPayments);
        const p = await getPriceForMonth(viewMonth, viewYear, genId);
        setPrice(p);
        const name = await getOwnerName();
        setOwnerNameLocal(name);
      } catch {}
      setLoading(false);
    })();
  }, [genId, viewMonth, viewYear]);

  const visibleSubs = useMemo(() => subscribers.filter(s => isSubscriberVisibleInMonth(s, viewMonth, viewYear)), [subscribers, viewMonth, viewYear]);
  const deletedThisMonth = useMemo(() => subscribers.filter(s => s.deletedMonth === viewMonth && s.deletedYear === viewYear && !s.active), [subscribers, viewMonth, viewYear]);
  const paymentMap = useMemo(() => { const m: Record<number, Payment> = {}; for (const p of payments) m[p.subscriberId] = p; return m; }, [payments]);
  const filteredSubs = useMemo(() => {
    let r = visibleSubs;
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(s => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))); }
    if (filter === 'paid') r = r.filter(s => paymentMap[s.id!]?.paid);
    else if (filter === 'unpaid') r = r.filter(s => !paymentMap[s.id!]?.paid);
    else if (filter === 'cancelled') r = [];
    return r;
  }, [visibleSubs, search, filter, paymentMap]);
  const paidCount = useMemo(() => visibleSubs.filter(s => paymentMap[s.id!]?.paid).length, [visibleSubs, paymentMap]);

  const handleTogglePayment = (sub: Subscriber) => {
    if (!genId) return;
    const existing = paymentMap[sub.id!];
    const isPaid = existing?.paid;
    if (isPaid) {
      Alert.alert('إلغاء الدفع', 'هل تريد إلغاء دفع "' + sub.name + '"?', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تأكيد', style: 'destructive', onPress: async () => {
          const d = await getDb(); const now = new Date().toISOString();
          await d.runAsync('UPDATE payments SET paid=0, unpaidAt=? WHERE id=?', [now, existing!.id!]);
          await logPaymentHistory(sub.id!, viewMonth, viewYear, 'unpaid', ownerName);
          const allPayments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=? AND generatorId=?', [viewMonth, viewYear, genId]);
          setPayments(allPayments);
        }},
      ]);
    } else {
      Alert.alert('تأكيد الدفع', 'هل تريد تأكيد دفع "' + sub.name + '"?', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تأكيد', onPress: async () => {
          const d = await getDb(); const now = new Date().toISOString();
          if (existing) await d.runAsync('UPDATE payments SET paid=1, paidAt=?, unpaidAt=NULL WHERE id=?', [now, existing.id!]);
          else await d.runAsync('INSERT INTO payments (subscriberId, month, year, pricePerAmpere, paid, paidAt, generatorId) VALUES (?,?,?,?,1,?,?)', [sub.id!, viewMonth, viewYear, price, now, genId]);
          await logPaymentHistory(sub.id!, viewMonth, viewYear, 'paid', ownerName);
          const allPayments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=? AND generatorId=?', [viewMonth, viewYear, genId]);
          setPayments(allPayments);
        }},
      ]);
    }
  };

  const handleDeleteSubscriber = (sub: Subscriber) => {
    Alert.alert('حذف مشترك', 'هل تريد حذف "' + sub.name + '"?', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        const d = await getDb(); const now = new Date().toISOString();
        await d.runAsync('UPDATE subscribers SET active=0, deletedMonth=?, deletedYear=?, deletedBy=?, deletedAt=? WHERE id=?', [viewMonth, viewYear, ownerName, now, sub.id!]);
        const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE generatorId=?', [genId]);
        setSubscribers(subs);
      }},
    ]);
  };

  const handleRestoreSubscriber = (sub: Subscriber) => {
    Alert.alert('استعادة مشترك', 'هل تريد استعادة "' + sub.name + '"?', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'استعادة', onPress: async () => {
        const d = await getDb();
        await d.runAsync('UPDATE subscribers SET active=1, deletedMonth=NULL, deletedYear=NULL, deletedBy=NULL, deletedAt=NULL WHERE id=?', [sub.id!]);
        const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE generatorId=?', [genId]);
        setSubscribers(subs);
      }},
    ]);
  };

  const handleCardPress = (sub: Subscriber) => {
    const p = paymentMap[sub.id!];
    if (p?.paid) { Alert.alert('تنبيه', 'لا يمكن تعديل المشترك لأنه دفع بالفعل هذا الشهر'); return; }
    nav.navigate('addEdit', { mode: 'edit', subscriberId: sub.id, generatorId: genId });
  };

  const getSubAmount = (sub: Subscriber) => calcTotal(sub.ampere || 0, price);

  const cancelledCount = deletedThisMonth.length;

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color="#2196F3" /><Text style={s.appSubText}>جاري التحميل...</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={sub.header}>
        <TouchableOpacity onPress={nav.goBack} style={sub.backBtn}><Text style={{ fontSize: 22, color: COLORS.white, fontWeight: 'bold' }}>→</Text></TouchableOpacity>
        <Text style={sub.headerTitle}>المشتركين</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={sub.dateRow}>
        <TouchableOpacity onPress={() => setShowMonthPicker(true)} style={sub.dateDropdown}>
          <Text style={sub.dateDropdownText}>{viewMonth + 1} ▼</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowYearPicker(true)} style={sub.dateDropdown}>
          <Text style={sub.dateDropdownText}>{viewYear} ▼</Text>
        </TouchableOpacity>
      </View>

      <View style={sub.infoBar}>
        <Text style={sub.infoBarText}>شهر:{viewMonth + 1} سنة:{viewYear} | مدفوع:{paidCount} | غير:{visibleSubs.length - paidCount} | محذوف:{cancelledCount} | المجموع:{visibleSubs.length}</Text>
      </View>

      <TouchableOpacity onPress={() => nav.navigate('addEdit', { mode: 'add', generatorId: genId })} style={sub.addBtn}>
        <Text style={sub.addBtnText}>+ إضافة مشترك</Text>
      </TouchableOpacity>

      <View style={sub.searchContainer}>
        <TextInput value={search} onChangeText={setSearch} placeholder="اكتب اسم المشترك للبحث..." placeholderTextColor="#999" style={sub.searchInput} />
      </View>

      <View style={sub.filterRow}>
        <TouchableOpacity onPress={() => setFilter('all')} style={[sub.filterTab, filter === 'all' && sub.filterTabActive]}>
          <Text style={[sub.filterTabText, filter === 'all' && sub.filterTabTextActive]}>الكل ({visibleSubs.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('paid')} style={[sub.filterTab, filter === 'paid' && sub.filterTabPaid]}>
          <Text style={[sub.filterTabText, filter === 'paid' && sub.filterTabTextActive]}>مدفوع ({paidCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('unpaid')} style={[sub.filterTab, filter === 'unpaid' && sub.filterTabUnpaid]}>
          <Text style={[sub.filterTabText, filter === 'unpaid' && sub.filterTabTextActive]}>غير مدفوع ({visibleSubs.length - paidCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('cancelled')} style={[sub.filterTab, filter === 'cancelled' && sub.filterTabCancelled]}>
          <Text style={[sub.filterTabText, filter === 'cancelled' && sub.filterTabTextActive]}>إلغاء اشتراك ({cancelledCount})</Text>
        </TouchableOpacity>
      </View>

      {filter === 'cancelled' ? (
        <FlatList
          data={deletedThisMonth}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { setSelectedDeleted(item); setShowDeletedDetail(true); }} activeOpacity={0.7} style={sub.subCard}>
              <View style={sub.cardRow}>
                <Text style={sub.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={sub.cardAmpere}>{item.ampere} أمبير</Text>
              </View>
              {item.phone ? <Text style={sub.cardPhone}>📞 {item.phone}</Text> : null}
              <View style={sub.deletedTag}><Text style={sub.deletedTagText}>محذوف</Text></View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={sub.emptyState}><Text style={{ fontSize: 56 }}>📬</Text><Text style={sub.emptyText}>لا يوجد مشتركين</Text></View>}
        />
      ) : (
        <FlatList
          data={filteredSubs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 80 }}
          renderItem={({ item }) => {
            const p = paymentMap[item.id!];
            const isPaid = p?.paid;
            const paidAmount = p?.paidAmount || 0;
            const totalAmount = getSubAmount(item);
            const isPartial = !isPaid && paidAmount > 0 && paidAmount < totalAmount;
            return (
              <TouchableOpacity onPress={() => handleCardPress(item)} activeOpacity={0.7} style={sub.subCard}>
                <View style={sub.cardRow}>
                  <Text style={sub.cardName} numberOfLines={1}>{item.name}</Text>
                  <Text style={sub.cardAmpere}>{item.ampere} أمبير</Text>
                </View>
                {item.phone ? <Text style={sub.cardPhone}>📞 {item.phone}</Text> : null}
                {price > 0 && <Text style={[sub.cardAmount, { color: isPaid ? '#4CAF50' : '#F44336' }]}>{formatNumber(totalAmount)} د.ع</Text>}
                {isPartial && <Text style={sub.cardPartial}>دفع جزئي: {formatNumber(paidAmount)} | متبقي: {formatNumber(totalAmount - paidAmount)}</Text>}
                <View style={sub.cardActions}>
                  <TouchableOpacity onPress={() => handleDeleteSubscriber(item)} style={sub.cardActionDelete}><Text style={{ color: COLORS.white, fontSize: 14, fontWeight: 'bold' }}>🗑</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleTogglePayment(item)} style={[sub.cardActionPay, { backgroundColor: isPaid ? '#4CAF50' : '#E0E0E0' }]}>
                    <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: 'bold' }}>{isPaid ? '✓' : '—'}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<View style={sub.emptyState}><Text style={{ fontSize: 56 }}>📬</Text><Text style={sub.emptyText}>لا يوجد مشتركين</Text></View>}
        />
      )}

      <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '60%' }]}>
            <Text style={s.modalTitle}>اختر الشهر</Text>
            {MONTH_NAMES.map((m, idx) => (
              <TouchableOpacity key={idx} onPress={() => { setViewMonth(idx); setShowMonthPicker(false); }} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EEE', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, color: viewMonth === idx ? '#2196F3' : COLORS.text, fontWeight: viewMonth === idx ? 'bold' : 'normal' }}>{m}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowMonthPicker(false)} style={s.closeModalBtn}><Text style={s.closeModalBtnText}>إغلاق</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showYearPicker} transparent animationType="fade" onRequestClose={() => setShowYearPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '60%' }]}>
            <Text style={s.modalTitle}>اختر السنة</Text>
            {YEARS.map(y => (
              <TouchableOpacity key={y} onPress={() => { setViewYear(y); setShowYearPicker(false); }} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EEE', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, color: viewYear === y ? '#2196F3' : COLORS.text, fontWeight: viewYear === y ? 'bold' : 'normal' }}>{y}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowYearPicker(false)} style={s.closeModalBtn}><Text style={s.closeModalBtnText}>إغلاق</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeletedDetail} animationType="fade" transparent onRequestClose={() => setShowDeletedDetail(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>تفاصيل المحذوف</Text>
            {selectedDeleted && (
              <>
                <View style={s.detailRow}><Text style={s.detailLabel}>الاسم</Text><Text style={s.detailValue}>{selectedDeleted.name}</Text></View>
                {selectedDeleted.phone ? <View style={s.detailRow}><Text style={s.detailLabel}>الهاتف</Text><Text style={s.detailValue}>{selectedDeleted.phone}</Text></View> : null}
                <View style={s.detailRow}><Text style={s.detailLabel}>الأمبير</Text><Text style={s.detailValue}>{selectedDeleted.ampere}</Text></View>
                {selectedDeleted.deletedBy ? <View style={s.detailRow}><Text style={s.detailLabel}>بواسطة</Text><Text style={s.detailValue}>{selectedDeleted.deletedBy}</Text></View> : null}
                {selectedDeleted.deletedAt ? <View style={s.detailRow}><Text style={s.detailLabel}>التاريخ</Text><Text style={s.detailValue}>{formatPaidAt(selectedDeleted.deletedAt)}</Text></View> : null}
                <TouchableOpacity onPress={() => { handleRestoreSubscriber(selectedDeleted); setShowDeletedDetail(false); }} style={s.restoreBtn}><Text style={s.restoreBtnText}>استعادة المشترك</Text></TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => setShowDeletedDetail(false)} style={s.closeModalBtn}><Text style={s.closeModalBtnText}>إغلاق</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AddEditSubscriberScreen({ nav }: { nav: any }) {
  const mode = nav.params?.mode || 'add';
  const subscriberId = nav.params?.subscriberId || null;
  const generatorId = nav.params?.generatorId || null;
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ampere, setAmpere] = useState('');
  const [dupWarning, setDupWarning] = useState('');
  const [existingSub, setExistingSub] = useState<Subscriber | null>(null);
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (isEdit && subscriberId) {
      (async () => {
        try {
          const d = await getDb();
          const sub = await d.getFirstAsync<Subscriber>('SELECT * FROM subscribers WHERE id=?', [subscriberId]);
          if (sub) { setExistingSub(sub); setName(sub.name); setPhone(sub.phone || ''); setAmpere(String(sub.ampere || '')); }
        } catch {}
        setLoading(false);
      })();
    }
  }, [isEdit, subscriberId]);

  const checkDuplicate = useCallback(async (value: string) => {
    if (!value.trim()) { setDupWarning(''); return; }
    try {
      const d = await getDb();
      const existing = await d.getFirstAsync<Subscriber>('SELECT * FROM subscribers WHERE name=? AND generatorId=?', [value.trim(), generatorId]);
      if (existing && (!isEdit || existing.id !== subscriberId)) setDupWarning('اسم المشترك موجود بالفعل!');
      else setDupWarning('');
    } catch {}
  }, [generatorId, isEdit, subscriberId]);

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('خطأ', 'أدخل اسم المشترك');
    if (!ampere || Number(ampere) <= 0) return Alert.alert('خطأ', 'أدخل الأمبير');
    if (dupWarning) return Alert.alert('خطأ', dupWarning);
    setSaving(true);
    try {
      const d = await getDb();
      const ampVal = Number(ampere);
      if (isEdit && existingSub) {
        await d.runAsync('UPDATE subscribers SET name=?, phone=?, ampere=? WHERE id=?', [name.trim(), phone.trim() || null, ampVal, existingSub.id!]);
        const existingRecord = await d.getFirstAsync<AmpereHistory>('SELECT * FROM ampere_history WHERE subscriberId=? AND effectiveMonth=? AND effectiveYear=?', [existingSub.id!, CURRENT_MONTH, CURRENT_YEAR]);
        if (existingRecord) await d.runAsync('UPDATE ampere_history SET ampere=? WHERE id=?', [ampVal, existingRecord.id!]);
        else await d.runAsync('INSERT INTO ampere_history (subscriberId, ampere, effectiveMonth, effectiveYear) VALUES (?,?,?,?)', [existingSub.id!, ampVal, CURRENT_MONTH, CURRENT_YEAR]);
      } else {
        const r = await d.runAsync('INSERT INTO subscribers (name, phone, ampere, generatorId, startMonth, startYear, active) VALUES (?,?,?,?,?,?,1)', [name.trim(), phone.trim() || null, ampVal, generatorId, CURRENT_MONTH, CURRENT_YEAR]);
        await d.runAsync('INSERT INTO ampere_history (subscriberId, ampere, effectiveMonth, effectiveYear) VALUES (?,?,?,?)', [r.lastInsertRowId, ampVal, CURRENT_MONTH, CURRENT_YEAR]);
      }
      nav.goBack();
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ أثناء الحفظ'); } finally { setSaving(false); }
  };

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={s.appSubText}>جاري التحميل...</Text></View>;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity>
        <Text style={s.headerTitle}>{isEdit ? 'تعديل مشترك' : 'مشترك جديد'}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={s.formContent}>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>اسم المشترك</Text>
          <TextInput value={name} onChangeText={v => { setName(v); checkDuplicate(v); }} placeholder="الاسم" placeholderTextColor={COLORS.textLight} style={s.formInput} />
          {dupWarning ? <Text style={s.warningText}>⚠ {dupWarning}</Text> : null}
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>رقم الهاتف (اختياري)</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="رقم الهاتف (اختياري)" placeholderTextColor={COLORS.textLight} keyboardType="phone-pad" style={s.formInput} />
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>الأمبير</Text>
          <TextInput value={ampere} onChangeText={setAmpere} placeholder="0" placeholderTextColor={COLORS.textLight} keyboardType="numeric" style={s.formInput} />
          <View style={s.rowReverse}>
            {[5, 10, 15, 20].map(val => (
              <TouchableOpacity key={val} onPress={() => setAmpere(String(val))} style={[s.quickAmpereBtn, Number(ampere) === val && s.quickAmpereBtnActive]}>
                <Text style={[s.quickAmpereBtnText, Number(ampere) === val && s.quickAmpereBtnTextActive]}>{val}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={s.infoBox}><Text style={s.infoBoxText}>سيظهر المشترك من شهر {CURRENT_MONTH + 1} / {CURRENT_YEAR}</Text></View>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[s.primaryBtn, saving && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryBtnText}>💾 حفظ</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ReportsScreen({ nav }: { nav: any }) {
  const genId = nav.params?.generatorId || null;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalSubs: 0, activeSubs: 0, monthPaid: 0, monthUnpaid: 0, monthTotal: 0, monthCollected: 0 });
  const [genName, setGenName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const gen = genId ? await d.getFirstAsync<Generator>('SELECT * FROM generators WHERE id=?', [genId]) : await d.getFirstAsync<Generator>('SELECT * FROM generators LIMIT 1');
        if (gen) setGenName(gen.name || '');
        const gid = genId || gen?.id || 0;
        const totalSubs = (await d.getFirstAsync<any>('SELECT COUNT(*) as c FROM subscribers WHERE generatorId=?', [gid]))?.c || 0;
        const activeSubs = (await d.getFirstAsync<any>('SELECT COUNT(*) as c FROM subscribers WHERE active=1 AND generatorId=?', [gid]))?.c || 0;
        const paid = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=? AND generatorId=?', [CURRENT_MONTH, CURRENT_YEAR, gid]);
        const amp = await getAmpereForMonth(d, 0, CURRENT_MONTH, CURRENT_YEAR);
        const monthTotal = calcTotal(amp, 100);
        const monthCollected = paid.reduce((s, p) => s + (p.paidAmount || p.pricePerAmpere || 0), 0);
        setStats({ totalSubs, activeSubs, monthPaid: paid.filter(p => p.paid).length, monthUnpaid: paid.filter(p => !p.paid).length, monthTotal, monthCollected });
      } catch {}
      setLoading(false);
    })();
  }, [genId]);

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>التقارير</Text><View style={{ width: 44 }} /></View>
      <ScrollView contentContainerStyle={s.reportsContent}>
        <Text style={s.genNameHeader}>{genName}</Text>
        <View style={s.card}><Text style={s.cardStat}>{stats.totalSubs}</Text><Text style={s.cardLabel}>إجمالي المشتركين</Text></View>
        <View style={s.card}><Text style={s.cardStat}>{stats.activeSubs}</Text><Text style={s.cardLabel}>المشتركين النشطين</Text></View>
        <View style={s.card}><Text style={[s.cardStat, { color: COLORS.success }]}>{stats.monthPaid}</Text><Text style={s.cardLabel}>مدفوع هذا الشهر</Text></View>
        <View style={s.card}><Text style={[s.cardStat, { color: COLORS.danger }]}>{stats.monthUnpaid}</Text><Text style={s.cardLabel}>غير مدفوع هذا الشهر</Text></View>
        <View style={s.card}><Text style={s.cardStat}>{formatNumber(stats.monthCollected)}</Text><Text style={s.cardLabel}>المتحصل هذا الشهر</Text></View>
        <View style={s.card}><Text style={s.cardStat}>{formatNumber(stats.monthTotal)}</Text><Text style={s.cardLabel}>المطلوب هذا الشهر</Text></View>
        <TouchableOpacity onPress={() => nav.navigate('notifications')} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>🔔 الإشعارات</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => nav.navigate('pendingChanges')} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>🔄 التغييرات المعلقة</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => nav.navigate('subscriberList', { generatorId: null })} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>📋 المشتركين</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SubscriberYearReportScreen({ nav }: { nav: any }) {
  const subId = nav.params?.subscriberId;
  const subName = nav.params?.subscriberName || '';
  const genId = nav.params?.generatorId || null;
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [yearStats, setYearStats] = useState({ monthCount: 0, totalDue: 0, totalPaid: 0, remaining: 0, paidMonths: 0 });

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const all: any[] = [];
        let totalPaid = 0, paidMonths = 0;
        for (const year of YEARS) {
          for (let m = 0; m < 12; m++) {
            const p = await d.getFirstAsync<Payment>('SELECT * FROM payments WHERE subscriberId=? AND month=? AND year=?', [subId, m, year]);
            if (p && p.paid) { totalPaid += (p.paidAmount || p.pricePerAmpere || 0); paidMonths++; }
            const amp = await getAmpereForMonth(d, subId, m, year);
            const priceVal = await getPriceForMonth(m, year, genId);
            const due = calcTotal(amp, priceVal);
            all.push({ month: m, year, paid: p?.paid || false, amount: due, paidAmount: p?.paidAmount || 0, paymentDate: p?.paidAt || null });
          }
        }
        const totalDue = all.reduce((s, r) => s + r.amount, 0);
        setRecords(all);
        setYearStats({ monthCount: all.length, totalDue, totalPaid, remaining: totalDue - totalPaid, paidMonths });
      } catch {}
      setLoading(false);
    })();
  }, [subId, genId]);

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle} numberOfLines={1}>{subName}</Text><View style={{ width: 44 }} /></View>
      <ScrollView contentContainerStyle={s.listPad}>
        <View style={s.cardRow}>
          <View style={[s.cardSmall, { flex: 1 }]}><Text style={s.cardStat}>{yearStats.paidMonths}</Text><Text style={s.cardLabel}>مدفوعة</Text></View>
          <View style={[s.cardSmall, { flex: 1 }]}><Text style={s.cardStat}>{yearStats.monthCount - yearStats.paidMonths}</Text><Text style={s.cardLabel}>غير مدفوعة</Text></View>
        </View>
        <View style={s.cardRow}>
          <View style={[s.cardSmall, { flex: 1 }]}><Text style={s.cardStat}>{formatNumber(yearStats.totalPaid)}</Text><Text style={s.cardLabel}>المدفوع</Text></View>
          <View style={[s.cardSmall, { flex: 1 }]}><Text style={s.cardStat}>{formatNumber(yearStats.remaining)}</Text><Text style={s.cardLabel}>المتبقي</Text></View>
        </View>
        {records.filter(r => r.paid || r.amount > 0).map((r, idx) => (
          <TouchableOpacity key={idx} onPress={() => nav.navigate('monthDetail', { subscriberId: subId, subscriberName: subName, month: r.month, year: r.year, generatorId: genId })} style={[s.recordCard, r.paid && s.recordCardPaid]}>
            <View style={s.rowReverse}>
              <Text style={s.boldText}>{MONTH_NAMES[r.month]} {r.year}</Text>
              <View style={{ width: 8 }} />
              {r.paid ? <View style={s.paidBadge}><Text style={s.paidBadgeText}>مدفوع</Text></View> : <View style={s.unpaidBadge}><Text style={s.unpaidBadgeText}>غير مدفوع</Text></View>}
            </View>
            <Text style={s.amountText}>{formatNumber(r.amount)} د.ع</Text>
            {r.paid && r.paymentDate ? <Text style={s.dateSmall}>{formatPaidAt(r.paymentDate)}</Text> : null}
          </TouchableOpacity>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function GeneratorsScreen({ nav }: { nav: any }) {
  const [loading, setLoading] = useState(true);
  const [generators, setGenerators] = useState<Generator[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const gs = await d.getAllAsync<Generator>('SELECT * FROM generators');
        setGenerators(gs);
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>المولدات</Text><TouchableOpacity onPress={() => nav.navigate('addEdit', { mode: 'add' })} style={s.addCircleBtn}><Text style={s.addCircleBtnText}>+</Text></TouchableOpacity></View>
      <FlatList
        data={generators}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={s.listPad}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => nav.navigate('subscriberList', { generatorId: item.id, generatorName: item.name })} style={s.generatorCard}>
            <Text style={s.generatorCardTitle}>{item.name}</Text>
            <Text style={s.generatorCardSub}>اضغط لعرض المشتركين</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={s.emptyBox}><Text style={{ fontSize: 48 }}>⚡</Text><Text style={s.textLight}>لا يوجد مولدات</Text></View>}
      />
    </View>
  );
}

function SettingsScreen({ nav }: { nav: any }) {
  const [priceAmpere, setPriceAmpere] = useState('');
  const [ownerName, setOwnerNameLocal] = useState('');
  const [defaultAmpere, setDefaultAmpere] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const name = await getOwnerName(); setOwnerNameLocal(name);
        const d = await getDb();
        const gen = await d.getFirstAsync<Generator>('SELECT * FROM generators LIMIT 1');
        if (gen) { setDefaultAmpere(String(gen.defaultAmpere || '')); }
        const p = await getPriceForMonth(CURRENT_MONTH, CURRENT_YEAR, 0);
        setPriceAmpere(String(p || ''));
      } catch {}
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const d = await getDb();
      const gen = await d.getFirstAsync<Generator>('SELECT * FROM generators LIMIT 1');
      if (gen) await d.runAsync('UPDATE generators SET defaultAmpere=? WHERE id=?', [Number(defaultAmpere) || null, gen.id!]);
      if (priceAmpere) {
        const existingPrice = await d.getFirstAsync<MonthPrice>('SELECT * FROM ampere_prices WHERE month=? AND year=? AND generatorId=?', [CURRENT_MONTH, CURRENT_YEAR, gen?.id || 0]);
        if (existingPrice) await d.runAsync('UPDATE ampere_prices SET price=? WHERE id=?', [Number(priceAmpere), existingPrice.id!]);
        else await d.runAsync('INSERT INTO ampere_prices (month, year, price, generatorId) VALUES (?,?,?,?)', [CURRENT_MONTH, CURRENT_YEAR, Number(priceAmpere), gen?.id || 0]);
      }
      if (ownerName.trim()) await setOwnerName(ownerName.trim());
      Alert.alert('تم', 'تم حفظ الإعدادات');
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); }
    setSaving(false);
  };

  const handleExportCSV = async () => {
    try {
      const d = await getDb();
      const gen = await d.getFirstAsync<Generator>('SELECT * FROM generators LIMIT 1');
      const gid = gen?.id || 0;
      const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE active=1 AND generatorId=?', [gid]);
      const payments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=? AND generatorId=?', [CURRENT_MONTH, CURRENT_YEAR, gid]);
      const pMap: Record<number, boolean> = {}; for (const pay of payments) if (pay.paid) pMap[pay.subscriberId] = true;
      let csv = '\\uFEFFالاسم,الهاتف,الأمبير,الحالة,المبلغ\\n';
      for (const sub of subs) {
        const total = calcTotal(sub.ampere || 0, Number(priceAmpere) || 0);
        csv += sub.name + ',' + (sub.phone || '') + ',' + sub.ampere + ',' + (pMap[sub.id!] ? 'مدفوع' : 'غير مدفوع') + ',' + total + '\\n';
      }
      const fileName = 'subscribers_export_' + CURRENT_YEAR + '_' + (CURRENT_MONTH + 1) + '.csv';
      const fs = require('expo-file-system');
      const dirUri = fs.documentDirectory || fs.cacheDirectory || '';
      const fileUri = dirUri + fileName;
      await fs.writeAsStringAsync(fileUri, csv);
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    } catch (e: any) { Alert.alert('خطأ', e?.message || 'حدث خطأ'); }
  };

  const handleDeleteAll = () => {
    Alert.alert('حذف الكل', 'هل تريد حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه!', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try {
          const d = await getDb();
          await d.runAsync('DELETE FROM payments'); await d.runAsync('DELETE FROM subscribers');
          await d.runAsync('DELETE FROM generators'); await d.runAsync('DELETE FROM ampere_prices');
          await d.runAsync('DELETE FROM ampere_history'); await d.runAsync('DELETE FROM payment_history');
          await d.runAsync('DELETE FROM worker_actions'); await d.runAsync('DELETE FROM worker_pending_changes');
          await d.runAsync('DELETE FROM owner_notifications'); await d.runAsync('DELETE FROM notification_changes');
          await d.runAsync('DELETE FROM partial_payments'); await d.runAsync('DELETE FROM worker_credentials');
          Alert.alert('تم', 'تم حذف جميع البيانات');
        } catch (e: any) { Alert.alert('خطأ', e?.message); }
      }},
    ]);
  };

  const handleResetApp = () => {
    Alert.alert('إعادة تعيين', 'سيتم حذف جميع البيانات وتسجيل الخروج. هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: async () => {
        const d = await getDb();
        await d.runAsync('DELETE FROM payments'); await d.runAsync('DELETE FROM subscribers');
        await d.runAsync('DELETE FROM generators'); await d.runAsync('DELETE FROM ampere_prices');
        await d.runAsync('DELETE FROM ampere_history'); await d.runAsync('DELETE FROM payment_history');
        await d.runAsync('DELETE FROM worker_actions'); await d.runAsync('DELETE FROM worker_pending_changes');
        await d.runAsync('DELETE FROM owner_notifications'); await d.runAsync('DELETE FROM notification_changes');
        await d.runAsync('DELETE FROM partial_payments'); await d.runAsync('DELETE FROM worker_credentials');
        await logoutUser(); nav.goHome();
      }},
    ]);
  };

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>الإعدادات</Text><View style={{ width: 44 }} /></View>
      <ScrollView contentContainerStyle={s.formContent}>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>اسم المالك</Text>
          <TextInput value={ownerName} onChangeText={setOwnerNameLocal} placeholder="الاسم" placeholderTextColor={COLORS.textLight} style={s.formInput} />
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>سعر الأمبير الافتراضي</Text>
          <TextInput value={priceAmpere} onChangeText={setPriceAmpere} placeholder="0" placeholderTextColor={COLORS.textLight} keyboardType="numeric" style={s.formInput} />
        </View>
        <View style={s.formGroup}>
          <Text style={s.formLabel}>الأمبير الافتراضي</Text>
          <TextInput value={defaultAmpere} onChangeText={setDefaultAmpere} placeholder="0" placeholderTextColor={COLORS.textLight} keyboardType="numeric" style={s.formInput} />
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[s.primaryBtn, saving && { opacity: 0.6 }]}><Text style={s.primaryBtnText}>💾 حفظ الإعدادات</Text></TouchableOpacity>
        <TouchableOpacity onPress={handleExportCSV} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>📤 تصدير CSV</Text></TouchableOpacity>
        <TouchableOpacity onPress={handleDeleteAll} style={[s.secondaryBtn, { backgroundColor: COLORS.danger + '20', borderColor: COLORS.danger }]}><Text style={[s.secondaryBtnText, { color: COLORS.danger }]}>🗑 حذف جميع البيانات</Text></TouchableOpacity>
        <TouchableOpacity onPress={handleResetApp} style={[s.secondaryBtn, { backgroundColor: COLORS.danger + '20', borderColor: COLORS.danger }]}><Text style={[s.secondaryBtnText, { color: COLORS.danger }]}>🔄 إعادة تعيين التطبيق</Text></TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function PendingChangesScreen({ nav }: { nav: any }) {
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<WorkerAction[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const actions = await d.getAllAsync<WorkerAction>('SELECT * FROM worker_actions WHERE approved=0 ORDER BY createdAt DESC');
        setChanges(actions);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleApprove = async (action: WorkerAction) => {
    try {
      const d = await getDb();
      if (action.actionType === 'ampere_change') {
        const data = JSON.parse(action.actionData || '{}');
        await d.runAsync('UPDATE subscribers SET ampere=? WHERE id=?', [data.newAmpere, action.subscriberId]);
        await d.runAsync('INSERT INTO ampere_history (subscriberId, ampere, effectiveMonth, effectiveYear, changedBy) VALUES (?,?,?,?,?)', [action.subscriberId, data.newAmpere, action.month || CURRENT_MONTH, action.year || CURRENT_YEAR, action.workerName]);
      } else if (action.actionType === 'payment') {
        await d.runAsync('UPDATE payments SET paid=1, paidAt=? WHERE subscriberId=? AND month=? AND year=?', [new Date().toISOString(), action.subscriberId, action.month || CURRENT_MONTH, action.year || CURRENT_YEAR]);
      }
      await d.runAsync('UPDATE worker_actions SET approved=1, approvedAt=? WHERE id=?', [new Date().toISOString(), action.id!]);
      setChanges(prev => prev.filter(c => c.id !== action.id));
      Alert.alert('تم', 'تم اعتماد التغيير');
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
  };

  const handleReject = async (action: WorkerAction) => {
    try {
      const d = await getDb();
      await d.runAsync('UPDATE worker_actions SET approved=0, rejectedAt=? WHERE id=?', [new Date().toISOString(), action.id!]);
      setChanges(prev => prev.filter(c => c.id !== action.id));
      Alert.alert('تم', 'تم رفض التغيير');
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
  };

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>التغييرات المعلقة</Text><View style={{ width: 44 }} /></View>
      <FlatList
        data={changes}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={s.listPad}
        renderItem={({ item }) => (
          <View style={s.changeCard}>
            <View style={s.rowReverse}><Text style={s.boldText}>{item.actionType === 'ampere_change' ? 'تغيير أمبير' : item.actionType === 'payment' ? 'دفع' : item.actionType}</Text><Text style={s.textSecondary}>{MONTH_NAMES[item.month || 0]} {item.year}</Text></View>
            <Text style={s.textSecondary}>بواسطة: {item.workerName}</Text>
            <Text style={s.textSecondary}>{item.actionData}</Text>
            <Text style={s.dateSmall}>{formatPaidAt(item.createdAt)}</Text>
            <View style={s.rowReverse}>
              <TouchableOpacity onPress={() => handleApprove(item)} style={[s.approveBtn]}><Text style={s.approveBtnText}>اعتماد</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleReject(item)} style={[s.rejectBtn]}><Text style={s.rejectBtnText}>رفض</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<View style={s.emptyBox}><Text style={{ fontSize: 48 }}>🔄</Text><Text style={s.textLight}>لا توجد تغييرات معلقة</Text></View>}
      />
    </View>
  );
}

function NotificationsScreen({ nav }: { nav: any }) {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const n = await d.getAllAsync<NotificationRecord>('SELECT * FROM notifications ORDER BY createdAt DESC');
        setNotifications(n);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>الإشعارات</Text><Text style={s.badge}>{unreadCount > 0 ? unreadCount : ''}</Text></View>
      <FlatList
        data={notifications}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={s.listPad}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => nav.navigate('notificationDetail', { notificationId: item.id })} style={[s.notifCard, !item.read && s.notifCardUnread]}>
            <View style={s.rowReverse}>
              <View style={{ flex: 1 }}>
                <Text style={[s.boldText, { textAlign: 'right' }]}>{item.title}</Text>
                <Text style={[s.textSecondary, { textAlign: 'right' }]} numberOfLines={2}>{item.body}</Text>
                <Text style={[s.dateSmall, { textAlign: 'right' }]}>{formatPaidAt(item.createdAt)}</Text>
              </View>
              {!item.read && <View style={s.unreadDot} />}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={s.emptyBox}><Text style={{ fontSize: 48 }}>🔔</Text><Text style={s.textLight}>لا توجد إشعارات</Text></View>}
      />
    </View>
  );
}

function NotificationDetailScreen({ nav }: { nav: any }) {
  const notifId = nav.params?.notificationId;
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<NotificationRecord | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const n = await d.getFirstAsync<NotificationRecord>('SELECT * FROM notifications WHERE id=?', [notifId]);
        if (n && !n.read) await d.runAsync('UPDATE notifications SET read=1 WHERE id=?', [n.id!]);
        setNotif(n ? { ...n, read: true } : null);
      } catch {}
      setLoading(false);
    })();
  }, [notifId]);

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!notif) return <View style={s.centerFlex}><Text style={s.textLarge}>الإشعار غير موجود</Text></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>تفاصيل الإشعار</Text><View style={{ width: 44 }} /></View>
      <ScrollView contentContainerStyle={s.formContent}>
        <Text style={[s.boldText, { fontSize: 18, textAlign: 'right', marginBottom: 12 }]}>{notif.title}</Text>
        <Text style={[s.textSecondary, { textAlign: 'right', lineHeight: 28, fontSize: 16 }]}>{notif.body}</Text>
        <Text style={[s.dateSmall, { textAlign: 'right', marginTop: 16 }]}>{formatPaidAt(notif.createdAt)}</Text>
        {notif.createdAt !== notif.readAt && notif.readAt ? <Text style={[s.dateSmall, { textAlign: 'right' }]}>تم القراءة: {formatPaidAt(notif.readAt)}</Text> : null}
      </ScrollView>
    </View>
  );
}

function MonthDetailScreen({ nav }: { nav: any }) {
  const subId = nav.params?.subscriberId;
  const subName = nav.params?.subscriberName || '';
  const month = nav.params?.month;
  const year = nav.params?.year;
  const genId = nav.params?.generatorId || null;
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [amount, setAmount] = useState(0);
  const [history, setHistory] = useState<{ action: string; timestamp: string; by: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const p = await d.getFirstAsync<Payment>('SELECT * FROM payments WHERE subscriberId=? AND month=? AND year=?', [subId, month, year]);
        setPayment(p);
        const amp = await getAmpereForMonth(d, subId, month, year);
        const priceVal = await getPriceForMonth(month, year, genId);
        setAmount(calcTotal(amp, priceVal));
        const hist = await d.getAllAsync<any>('SELECT * FROM payment_history WHERE subscriberId=? AND month=? AND year=? ORDER BY timestamp DESC', [subId, month, year]);
        setHistory(hist.map((h: any) => ({ action: h.action, timestamp: h.timestamp, by: h.userId || '' })));
      } catch {}
      setLoading(false);
    })();
  }, [subId, month, year, genId]);

  const handlePartialPayment = async () => {
    Alert.prompt?.('دفع جزئي', 'أدخل المبلغ:', async (val: string) => {
      const amt = Number(val);
      if (!amt || amt <= 0) return Alert.alert('خطأ', 'أدخل مبلغ صحيح');
      try {
        const d = await getDb();
        const now = new Date().toISOString();
        if (payment) await d.runAsync('UPDATE payments SET paidAmount=paidAmount+? WHERE id=?', [amt, payment.id!]);
        else {
          const amp = await getAmpereForMonth(d, subId, month, year);
          const priceVal = await getPriceForMonth(month, year, genId);
          await d.runAsync('INSERT INTO payments (subscriberId, month, year, pricePerAmpere, paidAmount, paid, generatorId) VALUES (?,?,?,?,?,0,?)', [subId, month, year, priceVal, amt, genId || 0]);
        }
        const owner = await getOwnerName();
        await logPaymentHistory(subId, month, year, 'partial' as any, owner);
        const p = await d.getFirstAsync<Payment>('SELECT * FROM payments WHERE subscriberId=? AND month=? AND year=?', [subId, month, year]);
        setPayment(p);
      } catch (e: any) { Alert.alert('خطأ', e?.message); }
    });
  };

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle} numberOfLines={1}>{subName}</Text><View style={{ width: 44 }} /></View>
      <ScrollView contentContainerStyle={s.formContent}>
        <View style={s.monthDetailHeader}>
          <Text style={[s.boldText, { fontSize: 20 }]}>{MONTH_NAMES[month]} {year}</Text>
          <Text style={[s.amountText, { fontSize: 28, color: payment?.paid ? COLORS.success : COLORS.danger }]}>{formatNumber(amount)} د.ع</Text>
        </View>
        <View style={s.statusRow}>
          {payment?.paid ? <View style={s.paidBadge}><Text style={s.paidBadgeText}>مدفوع</Text></View> : <View style={s.unpaidBadge}><Text style={s.unpaidBadgeText}>غير مدفوع</Text></View>}
        </View>
        {payment && !payment.paid && (payment.paidAmount || 0) > 0 && (
          <View style={s.partialInfo}>
            <Text style={s.partialInfoText}>مدفوع جزئياً: {formatNumber(payment.paidAmount || 0)} د.ع</Text>
            <Text style={s.partialInfoRemain}>متبقي: {formatNumber(amount - (payment.paidAmount || 0))} د.ع</Text>
          </View>
        )}
        <TouchableOpacity onPress={() => nav.navigate('printReceipt', { subscriberId: subId, subscriberName: subName, month, year, amount, generatorId: genId })} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>🧾 طباعة وصل</Text></TouchableOpacity>
        {!payment?.paid && <TouchableOpacity onPress={handlePartialPayment} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>💰 دفع جزئي</Text></TouchableOpacity>}
        <Text style={[s.boldText, { marginTop: 24, marginBottom: 8, textAlign: 'right' }]}>سجل الدفع</Text>
        {history.length === 0 ? <Text style={s.textLight}>لا يوجد سجل</Text> : history.map((h, idx) => (
          <View key={idx} style={s.historyRow}>
            <Text style={[s.textSecondary, { flex: 1 }]}>{h.action === 'paid' ? 'دفع' : h.action === 'unpaid' ? 'إلغاء دفع' : h.action === 'partial_payment' ? 'دفع جزئي' : h.action}</Text>
            <Text style={s.dateSmall}>{h.by} - {formatPaidAt(h.timestamp)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function PrintReceiptScreen({ nav }: { nav: any }) {
  const subId = nav.params?.subscriberId;
  const subName = nav.params?.subscriberName || '';
  const month = nav.params?.month;
  const year = nav.params?.year;
  const amount = nav.params?.amount || 0;
  const genId = nav.params?.generatorId || null;
  const [loading, setLoading] = useState(true);
  const [ownerName, setOwnerNameLocal] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const name = await getOwnerName(); setOwnerNameLocal(name);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const receiptHtml = useMemo(() => {
    const now = new Date();
    const nowStr = now.getFullYear() + '/' + (now.getMonth()+1) + '/' + now.getDate();
    return '<!DOCTYPE html><html dir=\"rtl\"><head><meta charset=\"utf-8\"><style>body{font-family:system-ui,sans-serif;padding:16px;text-align:center}.header{font-size:24px;font-weight:bold;margin-bottom:8px}.sub{font-size:14px;color:#666;margin-bottom:16px}.divider{border-top:1px dashed #333;margin:12px 0}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:16px}.total{font-size:22px;font-weight:bold;color:#2E7D32;margin-top:8px}.note{font-size:12px;color:#999;margin-top:24px}</style></head><body><div class=\"header\">' + ownerName + '</div><div class=\"sub\">إيصال دفع كهرباء مولد</div><div class=\"divider\"></div><div class=\"row\"><span>المشترك</span><span>' + subName + '</span></div><div class=\"row\"><span>الشهر</span><span>' + MONTH_NAMES[month] + ' ' + year + '</span></div><div class=\"row\"><span>المبلغ</span><span>' + formatNumber(amount) + ' د.ع</span></div><div class=\"divider\"></div><div class=\"total\">تم الدفع ✓</div><div class=\"row\" style=\"margin-top:8px\"><span>' + nowStr + '</span></div><div class=\"note\">شكراً لثقتكم</div></body></html>';
  }, [ownerName, subName, month, year, amount]);

  const handlePrint = async () => {
    try {
      const fs = require('expo-file-system');
      const dirUri = fs.documentDirectory || fs.cacheDirectory || '';
      const fileUri = dirUri + 'receipt_' + subId + '_' + month + '_' + year + '.html';
      await fs.writeAsStringAsync(fileUri, receiptHtml);
      await Sharing.shareAsync(fileUri, { mimeType: 'text/html' });
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
  };

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}><TouchableOpacity onPress={nav.goBack} style={s.backBtn}><Text style={s.backBtnText}>→</Text></TouchableOpacity><Text style={s.headerTitle}>وصل الدفع</Text><View style={{ width: 44 }} /></View>
      <ScrollView contentContainerStyle={s.formContent}>
        <View style={s.receiptPreview}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>{ownerName}</Text>
          <Text style={{ textAlign: 'center', color: COLORS.textSecondary, marginBottom: 12 }}>إيصال دفع كهرباء مولد</Text>
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#333', marginVertical: 12 }} />
          <View style={s.rowReverse}><Text style={s.boldText}>المشترك</Text><Text style={s.textSecondary}>{subName}</Text></View>
          <View style={s.rowReverse}><Text style={s.boldText}>الشهر</Text><Text style={s.textSecondary}>{MONTH_NAMES[month]} {year}</Text></View>
          <View style={s.rowReverse}><Text style={s.boldText}>المبلغ</Text><Text style={[s.textSecondary, { color: COLORS.success, fontSize: 18, fontWeight: 'bold' }]}>{formatNumber(amount)} د.ع</Text></View>
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#333', marginVertical: 12 }} />
          <Text style={{ textAlign: 'center', fontSize: 22, fontWeight: 'bold', color: COLORS.success }}>تم الدفع ✓</Text>
          <Text style={{ textAlign: 'center', color: COLORS.textLight, marginTop: 24 }}>شكراً لثقتكم</Text>
        </View>
        <TouchableOpacity onPress={handlePrint} style={s.primaryBtn}><Text style={s.primaryBtnText}>🖨 طباعة</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ---- Worker Screens ----

function WorkerSubscribersScreen({ nav }: { nav: any }) {
  const [loading, setLoading] = useState(true);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [price, setPrice] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [workerName, setWorkerName] = useState('');
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const s = await getWorkerSession();
      sessionRef.current = s;
      setWorkerName(s?.name || '');
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb();
        const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE active=1');
        setSubscribers(subs);
        const allPayments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=?', [CURRENT_MONTH, CURRENT_YEAR]);
        setPayments(allPayments);
        const p = await getPriceForMonth(CURRENT_MONTH, CURRENT_YEAR, 0);
        setPrice(p);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const paymentMap = useMemo(() => { const m: Record<number, Payment> = {}; for (const p of payments) m[p.subscriberId] = p; return m; }, [payments]);
  const filteredSubs = useMemo(() => {
    let r = subscribers;
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(s => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))); }
    if (filter === 'paid') r = r.filter(s => paymentMap[s.id!]?.paid);
    else if (filter === 'unpaid') r = r.filter(s => !paymentMap[s.id!]?.paid);
    return r;
  }, [subscribers, search, filter, paymentMap]);
  const paidCount = useMemo(() => subscribers.filter(s => paymentMap[s.id!]?.paid).length, [subscribers, paymentMap]);

  const handleTogglePayment = (sub: Subscriber) => {
    const existing = paymentMap[sub.id!];
    if (existing?.paid) {
      Alert.alert('عذراً', 'لا يمكن إلغاء الدفع من العامل');
      return;
    }
    Alert.alert('تأكيد الدفع', 'هل تريد تأكيد دفع "' + sub.name + '"?', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        try {
          const d = await getDb(); const now = new Date().toISOString();
          if (existing) await d.runAsync('UPDATE payments SET paid=1, paidAt=? WHERE id=?', [now, existing.id!]);
          else await d.runAsync('INSERT INTO payments (subscriberId, month, year, pricePerAmpere, paid, paidAt, generatorId) VALUES (?,?,?,?,1,?,?)', [sub.id!, CURRENT_MONTH, CURRENT_YEAR, price, now, sub.generatorId || 0]);
          await logPaymentHistory(sub.id!, CURRENT_MONTH, CURRENT_YEAR, 'paid', workerName);
          await d.runAsync('INSERT INTO worker_actions (subscriberId, actionType, actionData, workerName, month, year, createdAt) VALUES (?,?,?,?,?,?,?)', [sub.id!, 'payment', JSON.stringify({ paidAmount: calcTotal(sub.ampere || 0, price) }), workerName, CURRENT_MONTH, CURRENT_YEAR, now]);
          const allPayments = await d.getAllAsync<Payment>('SELECT * FROM payments WHERE month=? AND year=?', [CURRENT_MONTH, CURRENT_YEAR]);
          setPayments(allPayments);
        } catch (e: any) { Alert.alert('خطأ', e?.message); }
      }},
    ]);
  };

  const handleAmpereChange = (sub: Subscriber) => {
    Alert.prompt?.('تغيير الأمبير', 'أدخل قيمة الأمبير الجديدة:', async (val: string) => {
      const amp = Number(val);
      if (!amp || amp <= 0) return Alert.alert('خطأ', 'أدخل قيمة صحيحة');
      try {
        const d = await getDb(); const now = new Date().toISOString();
        await d.runAsync('INSERT INTO worker_actions (subscriberId, actionType, actionData, workerName, month, year, createdAt) VALUES (?,?,?,?,?,?,?)', [sub.id!, 'ampere_change', JSON.stringify({ oldAmpere: sub.ampere, newAmpere: amp }), workerName, CURRENT_MONTH, CURRENT_YEAR, now]);
        await d.runAsync('UPDATE subscribers SET ampere=? WHERE id=?', [amp, sub.id!]);
        await d.runAsync('INSERT INTO ampere_history (subscriberId, ampere, effectiveMonth, effectiveYear, changedBy) VALUES (?,?,?,?,?)', [sub.id!, amp, CURRENT_MONTH, CURRENT_YEAR, workerName]);
        const subs = await d.getAllAsync<Subscriber>('SELECT * FROM subscribers WHERE active=1');
        setSubscribers(subs);
      } catch (e: any) { Alert.alert('خطأ', e?.message); }
    });
  };

  if (loading) return <View style={s.centerFlex}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={nav.logout} style={s.backBtn}><Text style={s.backBtnText}>←</Text></TouchableOpacity>
        <Text style={s.headerTitle}>المشتركين</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={s.searchBar}>
        <TextInput value={search} onChangeText={setSearch} placeholder="ابحث عن مشترك..." placeholderTextColor={COLORS.textLight} style={s.searchInput} />
      </View>
      <View style={s.filterBar}>
        <TouchableOpacity onPress={() => setFilter('all')} style={[s.filterTab, filter === 'all' && s.filterTabActive]}><Text style={[s.filterTabText, filter === 'all' && s.filterTabTextActive]}>الكل ({subscribers.length})</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('paid')} style={[s.filterTab, filter === 'paid' && s.filterTabGreen]}><Text style={[s.filterTabText, filter === 'paid' && s.filterTabTextActive]}>مدفوع ({paidCount})</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('unpaid')} style={[s.filterTab, filter === 'unpaid' && s.filterTabRed]}><Text style={[s.filterTabText, filter === 'unpaid' && s.filterTabTextActive]}>غير مدفوع ({subscribers.length - paidCount})</Text></TouchableOpacity>
      </View>
      <FlatList
        data={filteredSubs}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={s.listPad}
        renderItem={({ item }) => {
          const p = paymentMap[item.id!];
          const isPaid = p?.paid;
          const totalAmount = calcTotal(item.ampere || 0, price);
          return (
            <View style={s.subCard}>
              <View style={s.rowReverse}>
                <View style={s.subCardActions}>
                  <TouchableOpacity onPress={() => handleAmpereChange(item)} style={[s.actionCircle, { backgroundColor: COLORS.primary, marginBottom: 6 }]}><Text style={s.actionCircleText}>⚡</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleTogglePayment(item)} style={[s.actionCircle, { backgroundColor: isPaid ? COLORS.success : COLORS.textLight }]}><Text style={s.actionCircleText}>{isPaid ? '✓' : '—'}</Text></TouchableOpacity>
                </View>
                <View style={s.subCardInfo}>
                  <View style={s.rowReverse}><Text style={[s.boldText, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>{item.name}</Text><Text style={[s.textSecondary, { color: COLORS.primary, fontWeight: 'bold' }]}>{item.ampere} أمبير</Text></View>
                  {item.phone ? <Text style={[s.textSecondary, { textAlign: 'right', marginTop: 2 }]}>📞 {item.phone}</Text> : null}
                  <Text style={[s.amountText, { textAlign: 'right', color: isPaid ? COLORS.success : COLORS.danger, marginTop: 2 }]}>{formatNumber(totalAmount)} د.ع</Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<View style={s.emptyBox}><Text style={{ fontSize: 48 }}>👥</Text><Text style={s.textLight}>لا يوجد مشتركين</Text></View>}
      />
    </View>
  );
}

function WorkerApp({ goHome }: { goHome: () => void }) {
  const [screen, setScreen] = useState('subscribers');
  const [stack, setStack] = useState<string[]>([]);
  const [params, setParams] = useState<any>({});

  const makeNav = () => ({
    navigate: (s: string, p?: any) => { setStack((prev: string[]) => [...prev, screen]); setParams(p || {}); setScreen(s); },
    goBack: () => { if (stack.length > 0) { const prev = stack[stack.length - 1]; setStack((prev2: string[]) => prev2.slice(0, -1)); setScreen(prev); } },
    goHome: () => { setStack([]); setParams({}); setScreen('subscribers'); },
    logout: () => { logoutWorker(); goHome(); },
    params,
    screen,
  });

  const workerNav = makeNav();

  const screens: Record<string, any> = {
    subscribers: <WorkerSubscribersScreen nav={workerNav} />,
  };

  return <View style={s.fullFlex}>{screens[screen] || screens.subscribers}</View>;
}

// ---- Main App ----

function App() {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [authScreen, setAuthScreen] = useState('roleSelection');

  useEffect(() => {
    (async () => {
      try {
        console.log('App: starting getDb');
        await getDb();
        console.log('App: getDb done');
        const w = await isWorkerLoggedIn();
        console.log('App: worker check done', w);
        if (w) { setRole('worker'); setReady(true); return; }
        const l = await isLoggedIn();
        console.log('App: login check done', l);
        if (l) {
          setRole('owner'); setReady(true); return;
        }
      } catch (e) { console.log('App: error', e); }
      setReady(true);
    })();
  }, []);

  if (!ready) return <LoadingScreen />;
  if (role === 'worker') return <WorkerApp goHome={() => setRole(null)} />;
  if (role === 'owner') return <MainApp setRole={(r: 'none') => setRole(r === 'none' ? null : r)} />;

  if (authScreen === 'login' || authScreen === 'workerLogin') {
    const Comp = authScreen === 'login' ? LoginScreen : WorkerLoginScreen;
    return <Comp setRole={setRole} setAuthScreen={setAuthScreen} />;
  }
  if (authScreen === 'setup') return <GeneratorSetup onComplete={() => { setRole('owner'); }} />;
  return <RoleSelection setAuthScreen={setAuthScreen} />;
}

const sub = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#2196F3', paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.white },
  dateRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 12, backgroundColor: COLORS.white },
  dateDropdown: { borderWidth: 1.5, borderColor: '#2196F3', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.white },
  dateDropdownText: { fontSize: 16, fontWeight: 'bold', color: '#2196F3' },
  infoBar: { backgroundColor: '#FFF3E0', paddingVertical: 8, paddingHorizontal: 16 },
  infoBarText: { fontSize: 13, color: '#E65100', fontWeight: '600', textAlign: 'center' },
  addBtn: { backgroundColor: '#2196F3', marginHorizontal: 14, marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addBtnText: { color: COLORS.white, fontSize: 17, fontWeight: 'bold' },
  searchContainer: { paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, backgroundColor: COLORS.white, textAlign: 'right' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 6, marginBottom: 8 },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#E0E0E0' },
  filterTabActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  filterTabPaid: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  filterTabUnpaid: { backgroundColor: '#FFEBEE', borderColor: '#F44336' },
  filterTabCancelled: { backgroundColor: '#E0E0E0', borderColor: '#BDBDBD' },
  filterTabText: { fontSize: 12, fontWeight: '600', color: '#555' },
  filterTabTextActive: { color: COLORS.white },
  subCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  cardRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, flex: 1, textAlign: 'right' },
  cardAmpere: { fontSize: 14, fontWeight: 'bold', color: '#2196F3' },
  cardPhone: { fontSize: 13, color: '#777', marginTop: 4, textAlign: 'right' },
  cardAmount: { fontSize: 15, fontWeight: 'bold', marginTop: 4, textAlign: 'right' },
  cardPartial: { fontSize: 12, color: '#FF9800', fontWeight: '600', marginTop: 2, textAlign: 'right' },
  cardActions: { flexDirection: 'row', marginTop: 8, gap: 8 },
  cardActionDelete: { backgroundColor: '#F44336', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  cardActionPay: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  deletedTag: { backgroundColor: '#FFCDD2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-end', marginTop: 6 },
  deletedTagText: { color: '#C62828', fontSize: 12, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12 },
});

const dash = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#2196F3', paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16 },
  hamburger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.white, textAlign: 'center' },
  switchBtn: { backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  switchBtnText: { fontSize: 13, fontWeight: 'bold', color: '#2196F3' },
  notifBtn: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  notifBtnText: { fontSize: 13, fontWeight: 'bold', color: COLORS.white },
  notifBadge: { backgroundColor: COLORS.danger, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 },
  topBtnsRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  topBtnOutline: { flex: 1, borderWidth: 1.5, borderColor: '#2196F3', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.white },
  topBtnOutlineText: { color: '#2196F3', fontWeight: 'bold', fontSize: 14 },
  topBtnFilled: { flex: 1, backgroundColor: '#2196F3', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  topBtnFilledText: { color: COLORS.white, fontWeight: 'bold', fontSize: 14 },
  addGenRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
  saveSmallBtn: { backgroundColor: '#4CAF50', borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  monthCard: { backgroundColor: '#E3F2FD', borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center' },
  monthText: { fontSize: 26, fontWeight: 'bold', color: '#1565C0' },
  priceLabel: { fontSize: 14, color: '#555', fontWeight: '600' },
  priceInput: { borderWidth: 1, borderColor: '#BBDEFB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, fontSize: 16, backgroundColor: COLORS.white, textAlign: 'center', width: 90, fontWeight: 'bold', color: '#1565C0' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: '#555', marginTop: 4, fontWeight: '600' },
  summaryCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, marginBottom: 12, ...SHADOWS.small },
  summaryRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  summaryLabel: { fontSize: 16, color: '#555', fontWeight: '600' },
  summaryValue: { fontSize: 18, fontWeight: 'bold' },
  expensesCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, marginBottom: 12, ...SHADOWS.small },
  expensesTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'right', marginBottom: 12 },
  expRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  expIcon: { fontSize: 22, marginRight: 8 },
  expLabel: { fontSize: 16, color: COLORS.text, fontWeight: '600', marginRight: 12 },
  expInput: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, fontSize: 18, backgroundColor: '#FAFAFA', textAlign: 'center', flex: 1, fontWeight: 'bold', color: COLORS.text },
  expTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4 },
  expTotalLabel: { fontSize: 15, fontWeight: 'bold', color: COLORS.text },
  expTotalValue: { fontSize: 16, fontWeight: 'bold', color: COLORS.danger },
  netCard: { borderWidth: 2, borderColor: '#4CAF50', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F1F8E9' },
  netLabel: { fontSize: 16, fontWeight: '600', color: '#555' },
  netValue: { fontSize: 20, fontWeight: 'bold' },
  bottomBtnsRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  bottomBtnOutline: { borderWidth: 1.5, borderColor: '#2196F3', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', backgroundColor: COLORS.white },
  bottomBtnOutlineText: { color: '#2196F3', fontWeight: 'bold', fontSize: 15 },
  bottomBtnFilled: { flex: 1, backgroundColor: '#2196F3', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  bottomBtnFilledText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  fab: { position: 'absolute', left: 16, bottom: 120, backgroundColor: COLORS.white, borderRadius: 28, width: 56, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5 },
  fabTop: { height: 44, alignItems: 'center', justifyContent: 'center' },
  fabDivider: { height: 1, backgroundColor: '#E0E0E0' },
  fabBottom: { height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: COLORS.white, textAlign: 'right' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  fullFlex: { flex: 1 },
  centerFlex: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollContent: { padding: 18, paddingBottom: 60 },
  padContent: { padding: 24, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, ...SHADOWS.small },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', flex: 1 },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 54, paddingBottom: 14, backgroundColor: COLORS.primary },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { alignItems: 'flex-end' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  backBtnText: { fontSize: 22, color: COLORS.primary, fontWeight: 'bold' },
  addCircleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...SHADOWS.small },
  addCircleBtnText: { fontSize: 28, color: COLORS.white, fontWeight: 'bold', lineHeight: 30 },

  // App title / auth
  appTitleText: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  appSubText: { fontSize: 15, color: COLORS.textSecondary, marginTop: 12, textAlign: 'center' },
  authTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  authSubtext: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8 },
  linkText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },

  // Role buttons
  roleOwnerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, padding: 18, width: '90%', marginBottom: 16, ...SHADOWS.medium },
  roleWorkerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, padding: 18, width: '90%', marginBottom: 16, ...SHADOWS.medium },
  roleBtnTextWrap: { flex: 1 },
  roleBtnTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  roleBtnSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  // Forms
  formContent: { padding: 18, paddingBottom: 60 },
  formGroup: { marginBottom: 20 },
  formLabel: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, marginBottom: 6, textAlign: 'right' },
  formInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, backgroundColor: COLORS.white, textAlign: 'right' },
  formInputLtr: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, backgroundColor: COLORS.white, textAlign: 'left' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: COLORS.white },
  codeFont: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 16, letterSpacing: 1 },

  // Quick ampere buttons
  quickAmpereBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, alignItems: 'center', marginHorizontal: 4, marginTop: 8 },
  quickAmpereBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickAmpereBtnText: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  quickAmpereBtnTextActive: { color: COLORS.white },

  // Info / warning
  infoBox: { backgroundColor: COLORS.primary + '12', borderRadius: 12, padding: 12, marginBottom: 16 },
  infoBoxText: { fontSize: 13, color: COLORS.primary, textAlign: 'right' },
  warningText: { fontSize: 13, color: COLORS.danger, marginTop: 4, textAlign: 'right' },

  // Buttons
  primaryBtn: { flexDirection: 'row', backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: 52, ...SHADOWS.small },
  primaryBtnText: { color: COLORS.white, fontSize: 17, fontWeight: 'bold' },
  primaryBtnWarn: { backgroundColor: COLORS.warning, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: 52, ...SHADOWS.small },
  secondaryBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: 52 },
  secondaryBtnText: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  btnSmallGreen: { backgroundColor: COLORS.success, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  btnSmallText: { color: COLORS.white, fontSize: 14, fontWeight: 'bold' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  iconBtnText: { fontSize: 22 },
  approveBtn: { flex: 1, backgroundColor: COLORS.success, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginRight: 6 },
  approveBtnText: { color: COLORS.white, fontSize: 15, fontWeight: 'bold' },
  rejectBtn: { flex: 1, backgroundColor: COLORS.danger, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginLeft: 6 },
  rejectBtnText: { color: COLORS.white, fontSize: 15, fontWeight: 'bold' },
  restoreBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  restoreBtnText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  closeModalBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  closeModalBtnText: { color: COLORS.textSecondary, fontSize: 15 },

  // Generator bar
  genBar: { backgroundColor: COLORS.primary + '15', paddingVertical: 8, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  genBarText: { fontSize: 14, color: COLORS.primary, fontWeight: '600', textAlign: 'right' },

  // Date selectors
  dateSelectors: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4, backgroundColor: COLORS.white },
  dateSelectorBox: { marginBottom: 6 },
  dateSelectorLabel: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'right', marginBottom: 4 },
  chipsScroll: { flexDirection: 'row' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.lightGray, marginRight: 6, marginBottom: 4 },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white, fontWeight: 'bold' },
  chipAdd: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.primary + '20', borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed' },
  chipAddText: { fontSize: 13, color: COLORS.primary, fontWeight: 'bold' },

  // Search
  searchBar: { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: COLORS.white },
  searchInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, backgroundColor: COLORS.white, textAlign: 'right' },

  // Filter
  filterBar: { flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 8, backgroundColor: COLORS.white },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, marginHorizontal: 3, backgroundColor: COLORS.lightGray },
  filterTabActive: { backgroundColor: COLORS.primary },
  filterTabGreen: { backgroundColor: COLORS.success + '25' },
  filterTabRed: { backgroundColor: COLORS.danger + '20' },
  filterTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterTabTextActive: { color: COLORS.white },

  // Deleted bar
  deletedBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFF0F0', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  deletedBarText: { fontSize: 14, color: COLORS.danger, fontWeight: '600' },
  deletedBarArrow: { fontSize: 16, color: COLORS.danger },
  deletedBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: COLORS.danger, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, zIndex: 1 },
  deletedBadgeText: { color: COLORS.white, fontSize: 11, fontWeight: 'bold' },

  // List
  listPad: { padding: 18, paddingBottom: 40 },
  subCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 10, ...SHADOWS.small },
  subCardActions: { alignItems: 'center', marginLeft: 12 },
  subCardInfo: { flex: 1 },
  rowReverse: { flexDirection: 'row-reverse', alignItems: 'center' },
  actionCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  actionCircleText: { fontSize: 18, color: COLORS.white, fontWeight: 'bold' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },

  // Text
  boldText: { fontWeight: 'bold', fontSize: 15, color: COLORS.text },
  textSecondary: { fontSize: 14, color: COLORS.textSecondary },
  amountText: { fontSize: 15, fontWeight: 'bold' },
  textLight: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginTop: 8 },
  textLarge: { fontSize: 18, color: COLORS.textSecondary },
  partialPaid: { fontSize: 12, color: COLORS.warning, fontWeight: '600', marginRight: 4 },
  partialRemain: { fontSize: 12, color: COLORS.danger, fontWeight: '600' },
  dateSmall: { fontSize: 11, color: COLORS.textLight, marginTop: 4 },

  // Badge
  badge: { backgroundColor: COLORS.danger, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, color: COLORS.white, fontWeight: 'bold', textAlign: 'center' },
  paidBadge: { backgroundColor: COLORS.success + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  paidBadgeText: { color: COLORS.success, fontSize: 12, fontWeight: 'bold' },
  unpaidBadge: { backgroundColor: COLORS.danger + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  unpaidBadgeText: { color: COLORS.danger, fontSize: 12, fontWeight: 'bold' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: COLORS.white, borderRadius: 18, padding: 24, width: '85%', maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, color: COLORS.text },
  detailRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  detailLabel: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  detailValue: { fontSize: 14, color: COLORS.text, fontWeight: 'bold' },

  // Error boundary
  errorTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.danger, marginTop: 12, textAlign: 'center' },
  errorDetail: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 20 },
  retryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },

  // Setup
  setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  setupTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  setupSubtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: 24, textAlign: 'center' },

  // Home - greeting
  greetingLabel: { fontSize: 13, color: COLORS.white + 'CC', marginBottom: 2 },
  greetingName: { fontSize: 18, fontWeight: 'bold', color: COLORS.white },

  // Home - current month banner
  currentMonthBanner: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 18, marginBottom: 16, alignItems: 'center', ...SHADOWS.medium },
  currentMonthBannerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, marginBottom: 4 },
  currentMonthBannerLabel: { fontSize: 14, color: COLORS.white + 'CC', marginBottom: 6 },
  currentMonthBannerStat: { fontSize: 14, color: COLORS.white, fontWeight: '600' },

  // Home - cards / stats
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 18, marginBottom: 10, ...SHADOWS.small },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 10, textAlign: 'right' },
  cardStat: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  cardLabel: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  cardRow: { flexDirection: 'row', marginBottom: 10, gap: 10 },
  cardSmall: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, alignItems: 'center', ...SHADOWS.small },
  statsRow: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  statBox: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  statSub: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },

  // Home - revenue
  revenueItem: { flex: 1, alignItems: 'center' },
  revenueDivider: { width: 1, height: 40, backgroundColor: COLORS.border },
  netText: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginVertical: 8 },

  // Home - expenses
  expGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expItem: { width: '48%', marginBottom: 8 },
  expInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: COLORS.white, marginTop: 4, textAlign: 'center' },
  totalExpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8 },

  // Reports
  reportsContent: { padding: 18 },
  genNameHeader: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: COLORS.text, marginBottom: 20 },

  // Generators
  generatorCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 18, marginBottom: 10, ...SHADOWS.small },
  generatorCardTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  generatorCardSub: { fontSize: 13, color: COLORS.textLight, textAlign: 'right', marginTop: 4 },

  // Records
  recordCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 14, marginBottom: 8, ...SHADOWS.small },
  recordCardPaid: { borderLeftWidth: 4, borderLeftColor: COLORS.success },

  // Change cards
  changeCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, marginBottom: 10, ...SHADOWS.small },

  // Notifications
  notifCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, marginBottom: 10, ...SHADOWS.small },
  notifCardUnread: { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary, marginLeft: 8 },

  // Month detail
  monthDetailHeader: { alignItems: 'center', paddingVertical: 20 },
  statusRow: { alignItems: 'center', marginBottom: 16 },
  partialInfo: { backgroundColor: COLORS.warning + '20', borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'center' },
  partialInfoText: { fontSize: 14, color: COLORS.warning, fontWeight: '600' },
  partialInfoRemain: { fontSize: 14, color: COLORS.danger, fontWeight: '600', marginTop: 4 },
  historyRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },

  // Receipt
  receiptPreview: { backgroundColor: COLORS.white, borderRadius: 18, padding: 24, marginBottom: 20, ...SHADOWS.medium },
});

export default App;


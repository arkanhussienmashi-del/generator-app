import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getDb, type Generator, type Subscriber, type Payment, type AmpereHistory, setPriceForMonth, getPriceForMonth, getExpensesForMonth, setExpensesForMonth, getAmpereForMonth, resetDb, verifyWorker, setWorkerCredential, getWorkerCredentialsForGenerator, getPendingChanges, updateChangeStatus, type WorkerPendingChange } from './db';
import { MONTHS, CURRENT_YEAR, CURRENT_MONTH, generateYears, calcTotal } from './utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { isLoggedIn, logoutUser, registerUser, loginUser, getOwnerName, setOwnerName, hasUsers, setWorkerSession, isWorkerLoggedIn, logoutWorker } from './auth';
import WorkerApp from './WorkerApp';
import './App.css';

type Screen = 'home' | 'subscribers' | 'add-subscriber' | 'edit-subscriber' | 'reports' | 'generators' | 'settings' | 'worker-login' | 'pending-changes';

function App() {
  const [role, setRole] = useState<'loading' | 'none' | 'owner' | 'worker'>('loading');
  const [, setRefreshKey] = useState(0);
  const forceRefresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    (async () => {
      if (isWorkerLoggedIn()) { setRole('worker'); return; }
      if (await isLoggedIn()) { setRole('owner'); return; }
      setRole('none');
    })();
  }, []);

  if (role === 'loading') {
    return (
      <div className="screen login-screen">
        <div className="login-card">
          <div className="login-icon">⚡</div>
          <h1>إدارة المولّدات</h1>
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (role === 'none') {
    return <RoleSelection onSelectOwner={() => { setRole('owner'); forceRefresh(); }} onSelectWorker={() => { setRole('worker'); forceRefresh(); }} />;
  }

  if (role === 'worker') {
    if (isWorkerLoggedIn()) {
      return <WorkerApp onLogout={() => { logoutWorker(); setRole('none'); forceRefresh(); }} />;
    }
    return <WorkerLoginScreen onLogin={() => forceRefresh()} onBack={() => { setRole('none'); forceRefresh(); }} />;
  }

  if (role === 'owner') {
    return <OwnerGate onBack={() => { setRole('none'); forceRefresh(); }} forceRefresh={forceRefresh} />;
  }
}

function OwnerGate({ onBack, forceRefresh }: { onBack: () => void; forceRefresh: () => void }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    isLoggedIn().then(setAuthed);
  }, []);

  if (authed === null) {
    return (
      <div className="screen login-screen">
        <div className="login-card">
          <div className="login-icon">⚡</div>
          <h1>إدارة المولّدات</h1>
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onLogin={() => { isLoggedIn().then(v => { setAuthed(v); forceRefresh(); }); }} onBack={onBack} />;
  }

  return <MainApp onAppLogout={async () => { await logoutUser(); setAuthed(false); forceRefresh(); }} />;
}

function RoleSelection({ onSelectOwner, onSelectWorker }: { onSelectOwner: () => void; onSelectWorker: () => void }) {
  return (
    <div className="screen role-selection-screen">
      <div className="role-card">
        <div className="login-icon">⚡</div>
        <h1>إدارة المولّدات</h1>
        <p>اختر نوع حسابك</p>
        <button className="large-btn primary-btn role-btn" onClick={onSelectOwner}>
          <span className="role-icon">🏭</span>
          <span className="role-text">صاحب مولّد</span>
          <span className="role-desc">إدارة كاملة للمولّد والمشتركين</span>
        </button>
        <button className="large-btn secondary-btn role-btn" onClick={onSelectWorker}>
          <span className="role-icon">👷</span>
          <span className="role-text">عامل</span>
          <span className="role-desc">عرض المشتركين وتحصيل الاشتراكات</span>
        </button>
      </div>
    </div>
  );
}

function WorkerLoginScreen({ onLogin, onBack }: { onLogin: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!code.trim()) { setError('يرجى إدخال الكود التعريفي'); return; }
    if (!password) { setError('يرجى إدخال الرمز السري'); return; }
    const cred = await verifyWorker(code.trim().toUpperCase(), password);
    if (!cred) { setError('الكود أو الرمز السري غير صحيح'); setPassword(''); return; }
    setWorkerSession({ code: cred.code, generatorId: cred.generatorId, generatorName: cred.generatorName, ownerEmail: cred.ownerEmail });
    onLogin();
  };

  return (
    <div className="screen login-screen">
      <div className="login-card">
        <div className="login-icon">👷</div>
        <h1>دخول العامل</h1>
        <p>أدخل الكود التعريفي والرمز السري</p>

        {error && <div className="login-error">{error}</div>}

        <input
          className="large-input"
          type="text"
          placeholder="الكود التعريفي (مثال: MOLD-ABC123)"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
          dir="ltr"
          autoFocus
        />
        <input
          className="large-input"
          type="password"
          placeholder="الرمز السري"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          dir="ltr"
        />
        <button
          className="large-btn primary-btn"
          disabled={!code.trim() || !password}
          onClick={handleLogin}
        >
          دخول
        </button>
        <button className="large-btn secondary-btn" onClick={onBack}>العودة</button>
        <p className="login-hint">احصل على الكود والرمز من صاحب المولّد</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, onBack }: { onLogin: () => void; onBack: () => void }) {
  const [step, setStep] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [ownerName, setOwnerNameLocal] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    hasUsers().then(has => { setHasExisting(has); setStep(has ? 'login' : 'register'); setLoading(false); });
  }, []);

  const isValidEmail = (e: string): boolean => {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e);
  };

  const handleRegister = async () => {
    setError('');
    if (!isValidEmail(email)) {
      setError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    if (!ownerName.trim()) {
      setError('يرجى إدخال اسم صاحب المواد');
      return;
    }
    if (password.length < 4) {
      setError('الرمز السري يجب أن يكون 4 أحرف على الأقل');
      return;
    }
    if (password !== passwordConfirm) {
      setError('الرمز السري غير متطابق');
      return;
    }
    const success = await registerUser(email, password, ownerName.trim());
    if (!success) {
      setError('هذا البريد مسجّل بالفعل. سجّل دخولك أو استخدم بريداً آخر');
      return;
    }
    resetDb();
    onLogin();
  };

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!password) {
      setError('يرجى إدخال الرمز السري');
      return;
    }
    const success = await loginUser(email, password);
    if (success) {
      resetDb();
      onLogin();
    } else {
      setError('البريد أو الرمز السري غير صحيح');
      setPassword('');
    }
  };

  if (loading) {
    return (
      <div className="screen login-screen">
        <div className="login-card">
          <div className="login-icon">⚡</div>
          <h1>إدارة المولّدات</h1>
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen login-screen">
      <div className="login-card">
        <div className="login-icon">⚡</div>
        <h1>إدارة المولّدات</h1>

        {error && <div className="login-error">{error}</div>}

        {step === 'register' ? (
          <>
            <p>أنشئ حسابك لأول مرة</p>
            <input
              className="large-input"
              type="text"
              placeholder="اسم صاحب المواد"
              value={ownerName}
              onChange={(e) => { setOwnerNameLocal(e.target.value); setError(''); }}
              dir="rtl"
            />
            <input
              className="large-input"
              type="email"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              dir="ltr"
            />
            <input
              className="large-input"
              type="password"
              placeholder="الرمز السري (4 أحرف أو أكثر)"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              dir="ltr"
            />
            <input
              className="large-input"
              type="password"
              placeholder="تأكيد الرمز السري"
              value={passwordConfirm}
              onChange={(e) => { setPasswordConfirm(e.target.value); setError(''); }}
              dir="ltr"
            />
            <button
              className="large-btn primary-btn"
              disabled={!email.trim() || !password || !passwordConfirm || !ownerName.trim()}
              onClick={handleRegister}
            >
              إنشاء حساب ودخول
            </button>
            {hasExisting && (
              <button
                className="large-btn secondary-btn"
                onClick={() => { setStep('login'); setPassword(''); setPasswordConfirm(''); setError(''); }}
              >
                لدي حساب - تسجيل دخول
              </button>
            )}
          </>
        ) : (
          <>
            <p>سجّل دخولك بحسابك</p>
            <input
              className="large-input"
              type="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              dir="ltr"
              autoFocus
            />
            <input
              className="large-input"
              type="password"
              placeholder="الرمز السري"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              dir="ltr"
            />
            <button
              className="large-btn primary-btn"
              disabled={!email.trim() || !password}
              onClick={handleLogin}
            >
              دخول
            </button>
            <button
              className="large-btn secondary-btn"
              onClick={() => { setStep('register'); setPassword(''); setError(''); }}
            >
              حساب جديد
            </button>
          </>
        )}

        <p className="login-hint">معلوماتك محفوظة على جهازك</p>
        <button className="large-btn secondary-btn" style={{marginTop: 8}} onClick={onBack}>العودة لاختيار الدور</button>
      </div>
    </div>
  );
}

function MainApp({ onAppLogout }: { onAppLogout: () => void }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedGeneratorId, setSelectedGeneratorId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [pricePerAmpere, setPricePerAmpereState] = useState('');

  const generators = useLiveQuery(() => getDb().generators.toArray());
  const pendingChanges = useLiveQuery(() => getPendingChanges());
  const subscribers = useLiveQuery(
    () => selectedGeneratorId !== null
      ? getDb().subscribers.where('generatorId').equals(selectedGeneratorId).toArray()
      : getDb().subscribers.toArray(),
    [selectedGeneratorId]
  );

  const allPaymentsForMonth = useLiveQuery(
    async () => {
      return getDb().payments
        .where('month')
        .equals(selectedMonth)
        .and(p => p.year === selectedYear)
        .toArray();
    },
    [selectedMonth, selectedYear]
  );

  useEffect(() => {
    if (generators && generators.length > 0 && selectedGeneratorId === null) {
      setSelectedGeneratorId(generators[0].id!);
    }
  }, [generators, selectedGeneratorId]);

  useEffect(() => {
    const loadPrice = async () => {
      if (!selectedGeneratorId) return;
      const price = await getPriceForMonth(selectedMonth, selectedYear, selectedGeneratorId);
      setPricePerAmpereState(price > 0 ? price.toString() : '');
    };
    loadPrice();
  }, [selectedMonth, selectedYear, selectedGeneratorId]);

  const setPricePerAmpere = async (value: string) => {
    setPricePerAmpereState(value);
    if (selectedGeneratorId) {
      await setPriceForMonth(selectedMonth, selectedYear, Number(value) || 0, selectedGeneratorId);
    }
  };

  const getPaymentForSubscriber = useCallback(
    (subscriberId: number): Payment | undefined => {
      return allPaymentsForMonth?.find(p => p.subscriberId === subscriberId);
    },
    [allPaymentsForMonth]
  );

  const monthSubscribers = useMemo(() => {
    const now = new Date();
    const currentRealMonth = now.getMonth();
    const currentRealYear = now.getFullYear();
    const seen = new Set<string>();
    return subscribers?.filter(s => {
      const subStart = s.startYear * 12 + (s.startMonth || 0);
      const current = selectedYear * 12 + selectedMonth;
      if (subStart > current) return false;
      const isPastMonth = selectedYear < currentRealYear || (selectedYear === currentRealYear && selectedMonth < currentRealMonth);
      if (!s.active && !isPastMonth) return false;
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    }) || [];
  }, [subscribers, selectedMonth, selectedYear]);

  const filteredSubscribers = useMemo(() => {
    return monthSubscribers.filter(s => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = q === '' || s.name.toLowerCase().includes(q);
      const payment = getPaymentForSubscriber(s.id!);
      const isPaid = payment?.paid ?? false;
      if (filterMode === 'paid' && !isPaid) return false;
      if (filterMode === 'unpaid' && isPaid) return false;
      return matchesSearch;
    });
  }, [monthSubscribers, searchQuery, filterMode, getPaymentForSubscriber]);

  const paidCount = monthSubscribers.filter(s => getPaymentForSubscriber(s.id!)?.paid).length;
  const unpaidCount = monthSubscribers.length - paidCount;

  const [totalExpected, setTotalExpected] = useState(0);
  const [totalCollected, setTotalCollected] = useState(0);
  const [ownerName, setOwnerNameState] = useState('');

  useEffect(() => {
    getOwnerName().then(setOwnerNameState);
  }, [screen]);

  useEffect(() => {
    const calc = async () => {
      const price = Number(pricePerAmpere) || 0;
      let expected = 0;
      let collected = 0;
      for (const s of monthSubscribers) {
        const amp = await getAmpereForMonth(s.id!, selectedMonth, selectedYear);
        const total = amp * price;
        expected += total;
        if (getPaymentForSubscriber(s.id!)?.paid) {
          collected += total;
        }
      }
      setTotalExpected(expected);
      setTotalCollected(collected);
    };
    calc();
  }, [monthSubscribers, pricePerAmpere, selectedMonth, selectedYear, getPaymentForSubscriber]);

  const [expenses, setExpensesState] = useState({ fuel: 0, oil: 0, maintenance: 0 });
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;

  useEffect(() => {
    const loadExpenses = async () => {
      if (!selectedGeneratorId) return;
      const exp = await getExpensesForMonth(selectedMonth, selectedYear, selectedGeneratorId);
      setExpensesState({ fuel: exp.fuel, oil: exp.oil, maintenance: exp.maintenance });
    };
    loadExpenses();
  }, [selectedMonth, selectedYear, selectedGeneratorId]);

  const setExpense = async (field: 'fuel' | 'oil' | 'maintenance', value: string) => {
    const num = Number(value) || 0;
    setExpensesState(prev => {
      const updated = { ...prev, [field]: num };
      if (selectedGeneratorId) {
        setExpensesForMonth(selectedMonth, selectedYear, updated.fuel, updated.oil, updated.maintenance, selectedGeneratorId);
      }
      return updated;
    });
  };

  const totalExpenses = expenses.fuel + expenses.oil + expenses.maintenance;
  const netExpected = totalCollected - totalExpenses;

  const [realMonthAmpere, setRealMonthAmpere] = useState(0);
  const [realMonthCount, setRealMonthCount] = useState(0);

  useEffect(() => {
    const calcRealMonth = async () => {
      const now = new Date();
      const realMonth = now.getMonth();
      const realYear = now.getFullYear();
      let totalAmp = 0;
      let count = 0;
      if (subscribers) {
        for (const s of subscribers) {
          const subStart = s.startYear * 12 + (s.startMonth || 0);
          const current = realYear * 12 + realMonth;
          if (subStart > current) continue;
          if (!s.active) continue;
          const amp = await getAmpereForMonth(s.id!, realMonth, realYear);
          totalAmp += amp;
          count++;
        }
      }
      setRealMonthAmpere(totalAmp);
      setRealMonthCount(count);
    };
    calcRealMonth();
  }, [subscribers]);

  if (generators && generators.length === 0 && screen === 'home') {
    return <GeneratorSetup onComplete={() => setScreen('home')} />;
  }

  return (
    <div className="app" dir="rtl">
      {screen === 'home' && (
        <HomeScreen
          generators={generators || []}
          selectedGeneratorId={selectedGeneratorId}
          onSelectGenerator={setSelectedGeneratorId}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
          pricePerAmpere={pricePerAmpere}
          onPriceChange={setPricePerAmpere}
          paidCount={paidCount}
          unpaidCount={unpaidCount}
          totalCount={monthSubscribers.length}
          totalExpected={totalExpected}
          totalCollected={totalCollected}
          expenses={expenses}
          onExpenseChange={setExpense}
          totalExpenses={totalExpenses}
          netExpected={netExpected}
          ownerName={ownerName}
          realMonthAmpere={realMonthAmpere}
          realMonthCount={realMonthCount}
          pendingChangesCount={pendingChanges?.length || 0}
          onGoSubscribers={() => setScreen('subscribers')}
          onGoReports={() => setScreen('reports')}
          onGoGenerators={() => setScreen('generators')}
          onGoSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'subscribers' && (
        <SubscriberListScreen
          subscribers={filteredSubscribers}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterMode={filterMode}
          onFilterChange={setFilterMode}
          paidCount={paidCount}
          unpaidCount={unpaidCount}
          totalCount={monthSubscribers.length}
          pricePerAmpere={Number(pricePerAmpere) || 0}
          getPayment={getPaymentForSubscriber}
          onBack={() => { setScreen('home'); setSearchQuery(''); }}
          onAdd={() => { setEditingSubscriber(null); setScreen('add-subscriber'); }}
          onEdit={(sub) => { setEditingSubscriber(sub); setScreen('edit-subscriber'); }}
          onDelete={async (sub) => {
            if (confirm(`هل تريد حذف المشترك "${sub.name}"؟`)) {
              await getDb().subscribers.update(sub.id!, { active: false });
            }
          }}
          onTogglePayment={async (subscriberId) => {
            const existing = getPaymentForSubscriber(subscriberId);
            if (existing) {
              await getDb().payments.update(existing.id!, { paid: !existing.paid, paidAt: !existing.paid ? new Date().toISOString() : undefined });
            } else {
              await getDb().payments.add({
                subscriberId,
                month: selectedMonth,
                year: selectedYear,
                pricePerAmpere: Number(pricePerAmpere) || 0,
                paid: true,
                paidAt: new Date().toISOString(),
              });
            }
          }}
        />
      )}
      {(screen === 'add-subscriber' || screen === 'edit-subscriber') && (
        <AddEditSubscriberScreen
          subscriber={editingSubscriber}
          generatorId={selectedGeneratorId!}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          allSubscribers={subscribers || []}
          onSave={async (name, ampere) => {
            if (editingSubscriber) {
              if (editingSubscriber.ampere !== ampere) {
                await getDb().ampereHistory.add({
                  subscriberId: editingSubscriber.id!,
                  ampere: ampere,
                  effectiveMonth: selectedMonth,
                  effectiveYear: selectedYear,
                });
              }
              await getDb().subscribers.update(editingSubscriber.id!, { name, ampere });
            } else {
              const newId = await getDb().subscribers.add({
                name,
                ampere,
                generatorId: selectedGeneratorId!,
                startMonth: selectedMonth,
                startYear: selectedYear,
                active: true,
              });
              await getDb().ampereHistory.add({
                subscriberId: newId,
                ampere: ampere,
                effectiveMonth: selectedMonth,
                effectiveYear: selectedYear,
              });
            }
            setScreen('subscribers');
          }}
          onBack={() => setScreen('subscribers')}
        />
      )}
      {screen === 'reports' && (
        <ReportsScreen
          subscribers={filteredSubscribers}
          allSubscribers={subscribers || []}
          pricePerAmpere={Number(pricePerAmpere) || 0}
          month={selectedMonth}
          year={selectedYear}
          generatorId={selectedGeneratorId!}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'generators' && (
        <GeneratorsScreen
          generators={generators || []}
          selectedGeneratorId={selectedGeneratorId}
          onSelectGenerator={setSelectedGeneratorId}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          onBack={() => setScreen('home')}
          onLogout={() => { logoutUser(); resetDb(); onAppLogout(); }}
          onShowPendingChanges={() => setScreen('pending-changes')}
          pendingChangesCount={pendingChanges?.length || 0}
        />
      )}
      {screen === 'pending-changes' && (
        <PendingChangesScreen
          onBack={() => setScreen('home')}
        />
      )}
    </div>
  );
}

function PendingChangesScreen({ onBack }: { onBack: () => void }) {
  const changes = useLiveQuery(() => getPendingChanges());

  const handleApprove = async (change: WorkerPendingChange) => {
    const data = JSON.parse(change.changes);
    const db = getDb();

    if (data.subscribers) {
      for (const sub of data.subscribers) {
        const existing = await db.subscribers
          .where('generatorId')
          .equals(data.generatorId)
          .and(s => s.name === sub.name)
          .first();
        if (!existing) {
          const newId = await db.subscribers.add({
            name: sub.name,
            ampere: sub.ampere,
            generatorId: data.generatorId,
            startMonth: sub.startMonth,
            startYear: sub.startYear,
            active: sub.active,
          });
          await db.ampereHistory.add({
            subscriberId: newId as number,
            ampere: sub.ampere,
            effectiveMonth: sub.startMonth,
            effectiveYear: sub.startYear,
          });
        } else {
          await db.subscribers.update(existing.id!, {
            ampere: sub.ampere,
            active: sub.active,
          });
        }
      }
    }

    if (data.payments) {
      for (const p of data.payments) {
        const existing = await db.payments
          .where('[subscriberId+month+year]')
          .equals([p.subscriberId, p.month, p.year])
          .first();
        if (existing) {
          await db.payments.update(existing.id!, { paid: p.paid, paidAt: p.paidAt });
        } else {
          await db.payments.add({
            subscriberId: p.subscriberId,
            month: p.month,
            year: p.year,
            pricePerAmpere: p.pricePerAmpere || 0,
            paid: p.paid,
            paidAt: p.paidAt,
          });
        }
      }
    }

    await updateChangeStatus(change.id!, 'approved');
    alert('تم تطبيق التغييرات بنجاح!');
    window.location.reload();
  };

  const handleReject = async (changeId: number) => {
    await updateChangeStatus(changeId, 'rejected');
    alert('تم رفض التغييرات');
    window.location.reload();
  };

  return (
    <div className="screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>تغييرات العمال المعلقة</h1>
        <div style={{ width: 40 }}></div>
      </div>
      <div className="settings-content">
        {!changes || changes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <p>لا توجد تغييرات معلقة</p>
          </div>
        ) : changes.map(c => (
          <div key={c.id} className="pending-change-card">
            <div className="pending-change-header">
              <span className="worker-badge">{c.workerCode}</span>
              <span>{c.generatorName}</span>
            </div>
            <div className="pending-change-date">{new Date(c.createdAt).toLocaleString('ar-EG')}</div>
            <div className="pending-change-actions">
              <button className="large-btn primary-btn" onClick={() => handleApprove(c)}>✔ موافق - تطبيق</button>
              <button className="large-btn danger-btn" onClick={() => handleReject(c.id!)}>✕ رفض</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneratorSetup({ onComplete }: { onComplete: () => void }) {
  const [genName, setGenName] = useState('');
  const [ownerName, setOwnerNameState] = useState('');
  return (
    <div className="screen setup-screen">
      <div className="setup-card">
        <div className="setup-icon">⚡</div>
        <h1>مرحباً بك</h1>
        <p>أدخل بياناتك للبدء</p>
        <input
          className="large-input"
          type="text"
          placeholder="اسمك"
          value={ownerName}
          onChange={(e) => setOwnerNameState(e.target.value)}
          dir="rtl"
        />
        <input
          className="large-input"
          type="text"
          placeholder="اسم المولّد"
          value={genName}
          onChange={(e) => setGenName(e.target.value)}
          dir="rtl"
        />
        <button
          className="large-btn primary-btn"
          disabled={!genName.trim() || !ownerName.trim()}
          onClick={async () => {
            await getDb().generators.add({ name: genName.trim() });
            await setOwnerName(ownerName.trim());
            onComplete();
          }}
        >
          ابدأ الآن
        </button>
      </div>
    </div>
  );
}

interface HomeProps {
  generators: Generator[];
  selectedGeneratorId: number | null;
  onSelectGenerator: (id: number) => void;
  selectedYear: number;
  onSelectYear: (y: number) => void;
  selectedMonth: number;
  onSelectMonth: (m: number) => void;
  pricePerAmpere: string;
  onPriceChange: (v: string) => void;
  paidCount: number;
  unpaidCount: number;
  totalCount: number;
  totalExpected: number;
  totalCollected: number;
  expenses: { fuel: number; oil: number; maintenance: number };
  onExpenseChange: (field: 'fuel' | 'oil' | 'maintenance', value: string) => void;
  totalExpenses: number;
  netExpected: number;
  ownerName: string;
  pendingChangesCount: number;
  realMonthAmpere: number;
  realMonthCount: number;
  onGoSubscribers: () => void;
  onGoReports: () => void;
  onGoGenerators: () => void;
  onGoSettings: () => void;
}

function HomeScreen({
  generators, selectedGeneratorId, onSelectGenerator,
  selectedYear, onSelectYear, selectedMonth, onSelectMonth,
  pricePerAmpere, onPriceChange,
  paidCount, unpaidCount, totalCount, totalExpected, totalCollected,
  expenses, onExpenseChange, totalExpenses, netExpected, ownerName,
  realMonthAmpere, realMonthCount, pendingChangesCount,
  onGoSubscribers, onGoReports, onGoGenerators, onGoSettings
}: HomeProps) {
  const years = generateYears();
  const [showAddGen, setShowAddGen] = useState(false);
  const [newGenName, setNewGenName] = useState('');

  const handleAddGenerator = async () => {
    if (!newGenName.trim()) return;
    const id = await getDb().generators.add({ name: newGenName.trim() });
    onSelectGenerator(id as number);
    setNewGenName('');
    setShowAddGen(false);
  };

  return (
    <div className="screen home-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onGoSettings}>
          ⚙
          {pendingChangesCount > 0 && <span className="notification-badge">{pendingChangesCount}</span>}
        </button>
        <h1>{ownerName || 'مولّدي'}</h1>
        <button className="icon-btn" onClick={onGoGenerators}>⚡</button>
      </div>

      <div className="real-month-bar">
        <span>الشهر الحالي: {MONTHS[CURRENT_MONTH]} / {CURRENT_YEAR}</span>
        <span>{realMonthCount} مشترك</span>
        <span className="real-month-ampere">{realMonthAmpere} أمبير</span>
      </div>

      <div className="generator-selector">
        <select
          className="large-select"
          value={selectedGeneratorId || ''}
          onChange={(e) => onSelectGenerator(Number(e.target.value))}
        >
          {generators.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button className="small-btn add-gen-btn" onClick={() => setShowAddGen(!showAddGen)}>+ مولّد</button>
      </div>

      {showAddGen && (
        <div className="add-gen-inline">
          <input
            className="large-input"
            type="text"
            placeholder="اسم المولّد الجديد"
            value={newGenName}
            onChange={(e) => setNewGenName(e.target.value)}
            dir="rtl"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddGenerator(); }}
            autoFocus
          />
          <button className="large-btn primary-btn" disabled={!newGenName.trim()} onClick={handleAddGenerator}>
            إضافة
          </button>
        </div>
      )}

      <div className="date-selector">
        <div className="selector-group">
          <label>الشهر</label>
          <select
            className="large-select"
            value={selectedMonth}
            onChange={(e) => onSelectMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
        </div>
        <div className="selector-group">
          <label>السنة</label>
          <select
            className="large-select"
            value={selectedYear}
            onChange={(e) => onSelectYear(Number(e.target.value))}
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="price-input">
        <label>سعر الأمبير (د.ع)</label>
        <input
          className="large-input"
          type="number"
          placeholder="مثال: 15000"
          value={pricePerAmpere}
          onChange={(e) => onPriceChange(e.target.value)}
          dir="ltr"
        />
      </div>

      <div className="stats-grid">
        <div className="stat-card total-card">
          <div className="stat-number">{totalCount}</div>
          <div className="stat-label">المجموع</div>
        </div>
        <div className="stat-card paid-card">
          <div className="stat-number">{paidCount}</div>
          <div className="stat-label">مدفوع</div>
        </div>
        <div className="stat-card unpaid-card">
          <div className="stat-number">{unpaidCount}</div>
          <div className="stat-label">غير مدفوع</div>
        </div>
      </div>

      {pricePerAmpere && (
        <div className="revenue-bar">
          <div className="revenue-item">
            <span>المتوقع:</span>
            <span className="revenue-amount">{totalExpected.toLocaleString()} د.ع</span>
          </div>
          <div className="revenue-item">
            <span>المحصّل:</span>
            <span className="revenue-amount collected">{totalCollected.toLocaleString()} د.ع</span>
          </div>
        </div>
      )}

      <div className="expenses-section">
        <div className="expenses-title">الصرفيات</div>
        <div className="expense-row">
          <label>كاز</label>
          <input className="expense-input" type="number" placeholder="0" value={expenses.fuel || ''} onChange={(e) => onExpenseChange('fuel', e.target.value)} dir="ltr" />
        </div>
        <div className="expense-row">
          <label>دهن</label>
          <input className="expense-input" type="number" placeholder="0" value={expenses.oil || ''} onChange={(e) => onExpenseChange('oil', e.target.value)} dir="ltr" />
        </div>
        <div className="expense-row">
          <label>إصلاحات</label>
          <input className="expense-input" type="number" placeholder="0" value={expenses.maintenance || ''} onChange={(e) => onExpenseChange('maintenance', e.target.value)} dir="ltr" />
        </div>
        {totalExpenses > 0 && (
          <div className="expense-total">
            مجموع الصرفيات: <strong>{totalExpenses.toLocaleString()} د.ع</strong>
          </div>
        )}
      </div>

      <div className="net-bar">
        <div className="revenue-item">
          <span>الصافي المتوقع:</span>
          <span className={`revenue-amount ${netExpected >= 0 ? 'collected' : 'negative'}`}>{netExpected.toLocaleString()} د.ع</span>
        </div>
      </div>

      <div className="main-actions">
        <button className="large-btn primary-btn big-action" onClick={onGoSubscribers}>
          عرض المشتركين
        </button>
        <button className="large-btn secondary-btn" onClick={onGoReports}>
          التقارير
        </button>
      </div>
    </div>
  );
}

interface SubListProps {
  subscribers: Subscriber[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterMode: 'all' | 'paid' | 'unpaid';
  onFilterChange: (m: 'all' | 'paid' | 'unpaid') => void;
  paidCount: number;
  unpaidCount: number;
  totalCount: number;
  pricePerAmpere: number;
  getPayment: (id: number) => Payment | undefined;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (sub: Subscriber) => void;
  onDelete: (subscriber: Subscriber) => void;
  onTogglePayment: (subscriberId: number) => void;
}

function SubscriberListScreen({
  subscribers, searchQuery, onSearchChange,
  filterMode, onFilterChange, paidCount, unpaidCount, totalCount,
  pricePerAmpere, getPayment, onBack, onAdd, onEdit, onDelete, onTogglePayment
}: SubListProps) {
  return (
    <div className="screen subscriber-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>المشتركين</h1>
        <button className="icon-btn add-btn" onClick={onAdd}>+</button>
      </div>

      <div className="search-bar">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="اكتب اسم المشترك للبحث..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            dir="rtl"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => onSearchChange('')}>✕</button>
          )}
        </div>
        {searchQuery && (
          <div className="search-result-count">
            نتائج البحث: {subscribers.length}
          </div>
        )}
      </div>

      <div className="filter-tabs">
        <button
          className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          الكل ({totalCount})
        </button>
        <button
          className={`filter-tab paid-tab ${filterMode === 'paid' ? 'active' : ''}`}
          onClick={() => onFilterChange('paid')}
        >
          مدفوع ({paidCount})
        </button>
        <button
          className={`filter-tab unpaid-tab ${filterMode === 'unpaid' ? 'active' : ''}`}
          onClick={() => onFilterChange('unpaid')}
        >
          غير مدفوع ({unpaidCount})
        </button>
      </div>

      <div className="subscriber-list">
        {subscribers.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>{searchQuery ? 'لا توجد نتائج للبحث' : 'لا يوجد مشتركين'}</p>
          </div>
        )}
        {subscribers.map(sub => {
          const payment = getPayment(sub.id!);
          const isPaid = payment?.paid ?? false;
          const total = calcTotal(sub.ampere, pricePerAmpere);
          return (
            <div key={sub.id} className={`subscriber-card ${isPaid ? 'paid' : 'unpaid'}`}>
              <div className="sub-info" onClick={() => onEdit(sub)}>
                <div className="sub-name">{sub.name}</div>
                <div className="sub-details">
                  <span className="ampere-badge">{sub.ampere} أمبير</span>
                  {pricePerAmpere > 0 && (
                    <span className="total-amount">{total.toLocaleString()} د.ع</span>
                  )}
                </div>
              </div>
              <button
                className={`pay-toggle ${isPaid ? 'paid' : 'unpaid'}`}
                onClick={() => onTogglePayment(sub.id!)}
              >
                {isPaid ? '✔' : ''}
              </button>
              <button
                className="delete-btn"
                onClick={() => onDelete(sub)}
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AddEditProps {
  subscriber: Subscriber | null;
  generatorId: number;
  selectedMonth: number;
  selectedYear: number;
  allSubscribers: Subscriber[];
  onSave: (name: string, ampere: number) => void;
  onBack: () => void;
}

function AddEditSubscriberScreen({ subscriber, selectedMonth, selectedYear, allSubscribers, onSave, onBack }: AddEditProps) {
  const [name, setName] = useState(subscriber?.name || '');
  const [ampere, setAmpere] = useState(subscriber?.ampere?.toString() || '');
  const [nameError, setNameError] = useState('');

  const checkNameExists = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) { setNameError(''); return; }
    const exists = allSubscribers.some(s =>
      s.name.toLowerCase() === trimmed.toLowerCase() && (!subscriber || s.id !== subscriber.id)
    );
    setNameError(exists ? '⚠ هذا الاسم موجود بالفعل! يرجى تغييره' : '');
  };

  return (
    <div className="screen form-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>{subscriber ? 'تعديل مشترك' : 'مشترك جديد'}</h1>
        <div style={{width: 40}}></div>
      </div>

      <div className="form-body">
        {!subscriber && (
          <div className="start-month-info">
            سيظهر المشترك من شهر <strong>{MONTHS[selectedMonth]} / {selectedYear}</strong>
          </div>
        )}

        <div className="form-field">
          <label>الاسم</label>
          <input
            className="large-input"
            type="text"
            placeholder="اسم المشترك"
            value={name}
            onChange={(e) => { setName(e.target.value); checkNameExists(e.target.value); }}
            dir="rtl"
            autoFocus
          />
          {nameError && <div className="field-error">{nameError}</div>}
        </div>

        <div className="form-field">
          <label>عدد الأمبير</label>
          <input
            className="large-input"
            type="number"
            placeholder="مثال: 10"
            value={ampere}
            onChange={(e) => setAmpere(e.target.value)}
            dir="ltr"
          />
        </div>

        <div className="quick-ampere">
          {[5, 10, 15, 20].map(a => (
            <button
              key={a}
              className={`quick-btn ${ampere === a.toString() ? 'active' : ''}`}
              onClick={() => setAmpere(a.toString())}
            >
              {a}A
            </button>
          ))}
        </div>

        <button
          className="large-btn primary-btn"
          disabled={!name.trim() || !ampere || !!nameError}
          onClick={() => onSave(name.trim(), Number(ampere))}
        >
          {subscriber ? 'حفظ التعديلات' : 'إضافة'}
        </button>
      </div>
    </div>
  );
}

interface ReportsProps {
  subscribers: Subscriber[];
  allSubscribers: Subscriber[];
  pricePerAmpere: number;
  month: number;
  year: number;
  generatorId: number;
  onBack: () => void;
}

function ReportsScreen({ subscribers, allSubscribers, pricePerAmpere, month, year, generatorId, onBack }: ReportsProps) {
  const reportContentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportMonth, setReportMonth] = useState<number | 'all'>(month);
  const [reportYear, setReportYear] = useState(year);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [ampereHistory, setAmpereHistory] = useState<AmpereHistory[]>([]);
  const [monthlyPrices, setMonthlyPrices] = useState<Map<string, number>>(new Map());

  const years = generateYears();
  const isAllMonths = reportMonth === 'all';

  useEffect(() => {
    const loadPayments = async () => {
      const payments = await getDb().payments
        .where('year').equals(reportYear)
        .toArray();
      setAllPayments(payments);

      const history = await getDb().ampereHistory.toArray();
      setAmpereHistory(history);

      const prices = new Map<string, number>();
      for (let i = 0; i < 12; i++) {
        const price = await getPriceForMonth(i, reportYear, generatorId);
        prices.set(`${i}-${reportYear}`, price);
      }
      setMonthlyPrices(prices);
    };
    loadPayments();
  }, [reportYear]);

  const searchedSub = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim();
    const seen = new Set<string>();
    return allSubscribers.filter(s => {
      if (!s.name.includes(q)) return false;
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
  }, [searchQuery, allSubscribers]);

  const getPayment = (subId: number, m: number, y: number): Payment | undefined => {
    return allPayments.find(p => p.subscriberId === subId && p.month === m && p.year === y);
  };

  const getHistoricalAmpere = (sub: Subscriber, m: number, y: number): number => {
    const subStart = sub.startYear * 12 + (sub.startMonth || 0);
    const queryMonth = y * 12 + m;
    if (queryMonth < subStart) return 0;

    const relevant = ampereHistory
      .filter(h => h.subscriberId === sub.id && (h.effectiveYear < y || (h.effectiveYear === y && h.effectiveMonth <= m)))
      .sort((a, b) => {
        if (b.effectiveYear !== a.effectiveYear) return b.effectiveYear - a.effectiveYear;
        return b.effectiveMonth - a.effectiveMonth;
      });
    return relevant.length > 0 ? relevant[0].ampere : sub.ampere;
  };

  const getMonthlyPrice = (m: number, y: number): number => {
    return monthlyPrices.get(`${m}-${y}`) || 0;
  };

  const handleSelectSubscriber = (sub: Subscriber) => {
    setSelectedSubscriber(sub);
    setSearchQuery(sub.name);
  };

  const handleBackToList = () => {
    setSelectedSubscriber(null);
    setSearchQuery('');
  };

  const showSubReport = selectedSubscriber !== null;

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;
    if (!reportContentRef.current) return;
    const canvas = await html2canvas(reportContentRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    doc.save(`report_${reportYear}.pdf`);
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');

    if (selectedSubscriber) {
      const sub = selectedSubscriber;
      const data = MONTHS.map((m, i) => {
        const amp = getHistoricalAmpere(sub, i, reportYear);
        return {
          'الشهر': m,
          'الأمبير': amp,
          'الحالة': getPayment(sub.id!, i, reportYear)?.paid ? 'مدفوع' : 'غير مدفوع',
          'المبلغ': calcTotal(amp, pricePerAmpere),
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sub.name);
      XLSX.writeFile(wb, `${sub.name}_${reportYear}.xlsx`);
    } else {
      const filtered = isAllMonths ? subscribers : subscribers;
      const data = filtered.map(s => {
        const amp = getHistoricalAmpere(s, reportMonth as number, reportYear);
        return {
          'الاسم': s.name,
          'الأمبير': amp,
          'الحالة': getPayment(s.id!, reportMonth as number, reportYear)?.paid ? 'مدفوع' : 'غير مدفوع',
          'المبلغ': calcTotal(amp, pricePerAmpere),
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `report_${reportYear}.xlsx`);
    }
  };

  return (
    <div className="screen reports-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={showSubReport ? handleBackToList : onBack}>→</button>
        <h1>التقارير</h1>
        <div style={{width: 40}}></div>
      </div>

      <div className="reports-content">
        <div className="report-filters">
          {!showSubReport && (
            <div className="filter-row">
              <select
                className="large-select"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">كل الأشهر</option>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                className="large-select"
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {showSubReport ? (
            <div className="selected-sub-header" onClick={handleBackToList}>
              <span>← العودة للقائمة</span>
              <span>بحث عن مشترك آخر</span>
            </div>
          ) : (
            <div className="search-wrapper">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="text"
                placeholder="اكتب اسم مشترك..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedSubscriber(null); }}
                dir="rtl"
              />
              {searchQuery && (
                <button className="search-clear" onClick={() => { setSearchQuery(''); setSelectedSubscriber(null); }}>✕</button>
              )}
            </div>
          )}

          {searchQuery && !selectedSubscriber && searchedSub.length > 0 && (
            <div className="search-results-list">
              {searchedSub.map(s => (
                <div
                  key={s.id}
                  className="search-result-item"
                  onClick={() => handleSelectSubscriber(s)}
                >
                  <div>
                    <div className="search-result-name">{s.name}</div>
                  </div>
                  <span className="search-result-arrow">←</span>
                </div>
              ))}
            </div>
          )}

          {searchQuery && !selectedSubscriber && searchedSub.length === 0 && (
            <div className="no-results">لا توجد نتائج للبحث</div>
          )}
        </div>

        {showSubReport && selectedSubscriber ? (
          <SubscriberYearReport
            subscriber={selectedSubscriber}
            year={reportYear}
            getPayment={getPayment}
            getHistoricalAmpere={(sub, m, y) => getHistoricalAmpere(sub, m, y)}
            getMonthlyPrice={getMonthlyPrice}
          />
        ) : !showSubReport ? (
          <>
            <div ref={reportContentRef}>
            <div className="report-header-card">
              <h2>
                {isAllMonths
                  ? `كل الأشهر - ${reportYear}`
                  : `${MONTHS[reportMonth as number]} / ${reportYear}`
                }
              </h2>
              <p>{subscribers.length} مشترك</p>
            </div>

            <div className="report-list">
              {subscribers.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <p>لا يوجد مشتركين في هذا الشهر</p>
                </div>
              )}
              {subscribers.map(s => {
                const p = getPayment(s.id!, reportMonth as number, reportYear);
                const isPaid = p?.paid ?? false;
                const historicalAmpere = getHistoricalAmpere(s, reportMonth as number, reportYear);
                return (
                  <div key={s.id} className={`subscriber-card ${isPaid ? 'paid' : 'unpaid'}`}>
                    <div className="sub-info">
                      <div className="sub-name">{s.name}</div>
                      <div className="sub-details">
                        <span className="ampere-badge">{historicalAmpere} أمبير</span>
                        {pricePerAmpere > 0 && (
                          <span className="total-amount">{calcTotal(historicalAmpere, pricePerAmpere).toLocaleString()} د.ع</span>
                        )}
                      </div>
                    </div>
                    <div className={`pay-status-badge ${isPaid ? 'paid' : 'unpaid'}`}>
                      {isPaid ? '✔ مدفوع' : '✕ غير مدفوع'}
                    </div>
                  </div>
                );
              })}
            </div>

            {subscribers.length > 0 && (
              <div className="export-buttons">
                <button className="large-btn secondary-btn" onClick={exportPDF}>تصدير PDF</button>
                <button className="large-btn secondary-btn" onClick={exportExcel}>تصدير Excel</button>
              </div>
            )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SubscriberYearReport({
  subscriber, year, getPayment, getHistoricalAmpere, getMonthlyPrice
}: {
  subscriber: Subscriber;
  year: number;
  getPayment: (subId: number, month: number, year: number) => Payment | undefined;
  getHistoricalAmpere: (sub: Subscriber, month: number, year: number) => number;
  getMonthlyPrice: (month: number, year: number) => number;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [monthsData, setMonthsData] = useState<{month: string; monthIndex: number; paid: boolean; ampere: number; price: number; active: boolean; paidAt?: string}[]>([]);

  useEffect(() => {
    const loadHistory = async () => {
      const subStart = subscriber.startYear * 12 + (subscriber.startMonth || 0);
      const data = MONTHS.map((m, i) => {
        const monthVal = year * 12 + i;
        const isActive = monthVal >= subStart;
        const ampere = isActive ? getHistoricalAmpere(subscriber, i, year) : 0;
        const price = getMonthlyPrice(i, year);
        const p = isActive ? getPayment(subscriber.id!, i, year) : undefined;
        return { month: m, monthIndex: i, paid: p?.paid ?? false, ampere, price, active: isActive, paidAt: p?.paidAt };
      });
      setMonthsData(data);
    };
    loadHistory();
  }, [subscriber.id, year, getPayment, getHistoricalAmpere, getMonthlyPrice]);

  const activeMonths = monthsData.filter(m => m.active);
  const paidMonths = activeMonths.filter(m => m.paid).length;
  const unpaidMonths = activeMonths.length - paidMonths;
  const totalPaid = activeMonths.filter(m => m.paid).reduce((sum, m) => sum + calcTotal(m.ampere, m.price), 0);
  const totalUnpaid = activeMonths.filter(m => !m.paid).reduce((sum, m) => sum + calcTotal(m.ampere, m.price), 0);
  const totalExpected = activeMonths.reduce((sum, m) => sum + calcTotal(m.ampere, m.price), 0);

  return (
    <div className="sub-year-report" ref={reportRef}>
      <div className="sub-year-header">
        <div className="sub-year-name">{subscriber.name}</div>
        <div className="sub-year-info">
          <span>{year}</span>
        </div>
      </div>

      <div className="sub-year-stats">
        <div className="sub-year-stat paid">
          <div className="stat-number">{paidMonths}</div>
          <div className="stat-label">شهر مدفوع</div>
        </div>
        <div className="sub-year-stat unpaid">
          <div className="stat-number">{unpaidMonths}</div>
          <div className="stat-label">شهر غير مدفوع</div>
        </div>
      </div>

      <div className="sub-year-revenue">
        <div className="revenue-row">
          <span>المدفوع:</span>
          <span className="collected">{totalPaid.toLocaleString()} د.ع</span>
        </div>
        <div className="revenue-row">
          <span>غير مدفوع:</span>
          <span className="uncollected">{totalUnpaid.toLocaleString()} د.ع</span>
        </div>
        <div className="revenue-row">
          <span>المتوقع سنوياً:</span>
          <span>{totalExpected.toLocaleString()} د.ع</span>
        </div>
      </div>

      <div className="months-list">
        {monthsData.filter(m => m.active).map((m) => {
          const total = calcTotal(m.ampere, m.price);
          return (
            <div key={m.monthIndex} className={`month-row ${m.paid ? 'paid' : 'unpaid'}`}>
              <div className="month-row-right">
                <span className="month-row-status">{m.paid ? '✔' : '✕'}</span>
                <span className="month-row-name">{m.month}</span>
              </div>
              <div className="month-row-left">
                <span className="month-row-ampere">{m.ampere}A</span>
                <span className="month-row-price">{m.price > 0 ? `${m.price.toLocaleString()}/أ` : '-'}</span>
                <span className="month-row-total">{total > 0 ? `${total.toLocaleString()} د.ع` : '-'}</span>
                <span className={`month-row-label ${m.paid ? 'paid' : 'unpaid'}`}>
                  {m.paid ? 'مدفوع' : 'غير مدفوع'}
                </span>
                {m.paid && m.paidAt && (
                  <span className="month-row-date">
                    {new Date(m.paidAt).toLocaleDateString('ar-EG')}{'  '}{new Date(m.paidAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="export-buttons">
        <button className="large-btn secondary-btn" onClick={async () => {
          const { default: jsPDF } = await import('jspdf');
          const html2canvas = (await import('html2canvas')).default;
          if (!reportRef.current) return;
          const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`${subscriber.name}_${year}.pdf`);
        }}>تصدير PDF</button>

        <button className="large-btn secondary-btn" onClick={async () => {
          const XLSX = await import('xlsx');
          const data = monthsData.map(m => ({
            'الشهر': m.month,
            'الأمبير': m.ampere,
            'سعر الأمبير': m.price,
            'الحالة': m.paid ? 'مدفوع' : 'غير مدفوع',
            'المبلغ': calcTotal(m.ampere, m.price),
            'تاريخ الدفع': m.paidAt ? new Date(m.paidAt).toLocaleDateString('ar-EG') + '  ' + new Date(m.paidAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-',
          }));
          const ws = XLSX.utils.json_to_sheet(data);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, subscriber.name);
          XLSX.writeFile(wb, `${subscriber.name}_${year}.xlsx`);
        }}>تصدير Excel</button>
      </div>
    </div>
  );
}

interface GeneratorsProps {
  generators: Generator[];
  selectedGeneratorId: number | null;
  onSelectGenerator: (id: number) => void;
  onBack: () => void;
}

function GeneratorsScreen({ generators, selectedGeneratorId, onSelectGenerator, onBack }: GeneratorsProps) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Generator | null>(null);

  return (
    <div className="screen generators-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>المولّدات</h1>
        <div style={{width: 40}}></div>
      </div>

      <div className="form-body">
        <div className="form-field">
          <input
            className="large-input"
            type="text"
            placeholder={editing ? 'تعديل اسم المولّد' : 'مولّد جديد'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            dir="rtl"
          />
          <button
            className="large-btn primary-btn"
            disabled={!newName.trim()}
            onClick={async () => {
              if (editing) {
                await getDb().generators.update(editing.id!, { name: newName.trim() });
                setEditing(null);
              } else {
                const id = await getDb().generators.add({ name: newName.trim() });
                onSelectGenerator(id as number);
              }
              setNewName('');
            }}
          >
            {editing ? 'حفظ' : 'إضافة'}
          </button>
        </div>

        <div className="generator-list">
          {generators.map(g => (
            <div key={g.id} className={`generator-item ${selectedGeneratorId === g.id ? 'active-gen' : ''}`} onClick={() => { onSelectGenerator(g.id!); onBack(); }}>
              <span className="gen-icon">⚡</span>
              <span className="gen-name">{g.name}</span>
              {selectedGeneratorId === g.id && <span className="gen-active-badge">الحالي</span>}
              <div className="gen-actions" onClick={(e) => e.stopPropagation()}>
                <button className="small-btn" onClick={() => { setEditing(g); setNewName(g.name); }}>✏</button>
                <button
                  className="small-btn danger"
                  onClick={async () => {
                    if (confirm('هل أنت متأكد من حذف هذا المولّد؟')) {
                      await getDb().generators.delete(g.id!);
                      const subs = await getDb().subscribers.where('generatorId').equals(g.id!).toArray();
                      for (const sub of subs) {
                        await getDb().payments.where('subscriberId').equals(sub.id!).delete();
                        await getDb().subscribers.delete(sub.id!);
                      }
                    }
                  }}
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkerCredDisplay({ generatorId, generatorName }: { generatorId: number; generatorName: string }) {
  const [cred, setCred] = useState<{ code: string; password: string } | null>(null);
  const [newPass, setNewPass] = useState('');
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    getWorkerCredentialsForGenerator(generatorId).then(c => {
      if (c) setCred({ code: c.code, password: c.password });
    });
  }, [generatorId]);

  const handleCreate = async () => {
    if (!newPass.trim()) { alert('أدخل رمز سري للعامل'); return; }
    const c = await setWorkerCredential(generatorId, generatorName, newPass.trim());
    setCred({ code: c.code, password: c.password });
    setNewPass('');
    alert('تم إنشاء كود العامل بنجاح!');
  };

  const handleCopy = () => {
    if (!cred) return;
    navigator.clipboard.writeText(`الكود: ${cred.code}\nالرمز: ${cred.password}\nالمولّد: ${generatorName}`);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  return (
    <div className="worker-cred-card">
      <div className="worker-cred-title">⚡ {generatorName}</div>
      {cred ? (
        <>
          <div className="worker-cred-info">
            <div className="cred-field">
              <span className="cred-label">الكود التعريفي:</span>
              <span className="cred-value" onClick={handleCopy}>{cred.code}</span>
            </div>
            <div className="cred-field">
              <span className="cred-label">الرمز السري:</span>
              <span className="cred-value">{'•'.repeat(cred.password.length)}</span>
            </div>
          </div>
          <button className="small-btn" onClick={handleCopy}>{showCopied ? 'تم النسخ!' : '📋 نسخ'}</button>
          <button className="small-btn" onClick={async () => {
            const p = prompt('الرمز السري الجديد للعامل:');
            if (p && p.trim()) {
              await setWorkerCredential(generatorId, generatorName, p.trim());
              setCred({ code: cred.code, password: p.trim() });
            }
          }}>✏ تعديل الرمز</button>
        </>
      ) : (
        <div className="worker-cred-create">
          <input className="large-input" type="password" placeholder="رمز سري للعامل" value={newPass} onChange={(e) => setNewPass(e.target.value)} dir="ltr" />
          <button className="large-btn primary-btn" disabled={!newPass.trim()} onClick={handleCreate}>إنشاء كود عامل</button>
        </div>
      )}
    </div>
  );
}

interface SettingsProps {
  onBack: () => void;
  onLogout: () => void;
  onShowPendingChanges: () => void;
  pendingChangesCount: number;
}

function SettingsScreen({ onBack, onLogout, onShowPendingChanges, pendingChangesCount }: SettingsProps) {
  const [ownerName, setOwnerNameLocal] = useState('');
  const generators = useLiveQuery(() => getDb().generators.toArray());

  useEffect(() => {
    getOwnerName().then(setOwnerNameLocal);
  }, []);
  const handleBackup = async () => {
    const data = {
      generators: await getDb().generators.toArray(),
      subscribers: await getDb().subscribers.toArray(),
      payments: await getDb().payments.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      await getDb().generators.clear();
      await getDb().subscribers.clear();
      await getDb().payments.clear();
      await getDb().generators.bulkAdd(data.generators);
      await getDb().subscribers.bulkAdd(data.subscribers);
      await getDb().payments.bulkAdd(data.payments);
      alert('تم الاستعادة بنجاح!');
    };
    input.click();
  };

  const handleClearAll = async () => {
    if (confirm('هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه!')) {
      await getDb().generators.clear();
      await getDb().subscribers.clear();
      await getDb().payments.clear();
      await getDb().ampereHistory.clear();
      await getDb().amperePrices.clear();
      await getDb().expenses.clear();
      alert('تم حذف جميع البيانات');
      window.location.reload();
    }
  };

  const handleLoadTestData = async () => {
    if (!confirm('سيتم إضافة 25 مشترك تجريبي. هل تريد المتابعة؟')) return;

    const gens = await getDb().generators.toArray();
    const gen = gens[0];
    if (!gen) { alert('أضف مولّداً أولاً'); return; }
    const genId = gen.id!;

    const names = [
      'عدنان حسين', 'محمد كريم', 'علي جبار', 'حسن منصور', 'فاطمة العلي',
      'عبدالله ناصر', 'حسين محمد', 'مريم خالد', 'أحمد سعيد', 'نور الدين',
      'سلمان رشيد', 'زينب حسين', 'عمر فلاح', 'رنا عادل', 'ياسر محمود',
      'هبة الله كريم', 'مصطفى جعفر', 'عمر حسين', 'سارة حسين', 'بلال ناصر',
      'منى عبدالعزيز', 'ثامر حميد', 'ليلى أحمد', 'كريم صادق', 'دانيال رشيد',
    ];

    const ampereValues = [5, 5, 5, 10, 10, 10, 15, 15, 15, 20, 20, 5, 10, 15, 20, 5, 10, 15, 20, 5, 10, 15, 20, 10, 5];

    const subIds: number[] = [];
    for (let i = 0; i < 25; i++) {
      const id = await getDb().subscribers.add({
        name: names[i],
        ampere: ampereValues[i],
        generatorId: genId,
        startMonth: 0,
        startYear: 2026,
        active: true,
      });
      subIds.push(id as number);
      await getDb().ampereHistory.add({
        subscriberId: id as number,
        ampere: ampereValues[i],
        effectiveMonth: 0,
        effectiveYear: 2026,
      });
    }

    const changeSchedule: { subIndex: number; month: number; newAmpere: number }[] = [
      { subIndex: 0, month: 4, newAmpere: 10 },
      { subIndex: 3, month: 6, newAmpere: 20 },
      { subIndex: 5, month: 3, newAmpere: 25 },
      { subIndex: 7, month: 5, newAmpere: 20 },
      { subIndex: 10, month: 2, newAmpere: 25 },
      { subIndex: 14, month: 7, newAmpere: 30 },
      { subIndex: 20, month: 4, newAmpere: 15 },
    ];

    for (const change of changeSchedule) {
      const subId = subIds[change.subIndex];
      await getDb().ampereHistory.add({
        subscriberId: subId,
        ampere: change.newAmpere,
        effectiveMonth: change.month,
        effectiveYear: 2026,
      });
      await getDb().subscribers.update(subId, { ampere: change.newAmpere });
    }

    for (let m = 0; m < 12; m++) {
      await setPriceForMonth(m, 2026, 15000, genId);
    }

    for (let i = 0; i < 25; i++) {
      for (let m = 0; m < 12; m++) {
        if (Math.random() > 0.35) {
          await getDb().payments.add({
            subscriberId: subIds[i],
            month: m,
            year: 2026,
            pricePerAmpere: 15000,
            paid: true,
          });
        }
      }
    }

    alert('تم تحميل 25 مشترك تجريبي بنجاح!');
    window.location.reload();
  };

  return (
    <div className="screen settings-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>الإعدادات</h1>
        <div style={{width: 40}}></div>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>اسم المالك</h3>
          <input
            className="large-input"
            type="text"
            placeholder="اسمك"
            value={ownerName}
            onChange={(e) => setOwnerNameLocal(e.target.value)}
            dir="rtl"
          />
          <button
            className="large-btn primary-btn"
            disabled={!ownerName.trim()}
            onClick={async () => {
              await setOwnerName(ownerName.trim());
              alert('تم الحفظ');
            }}
          >
            حفظ الاسم
          </button>
        </div>

        <div className="settings-section">
          <h3>البيانات</h3>
          <button className="large-btn secondary-btn" onClick={handleBackup}>
            نسخ احتياطي
          </button>
          <button className="large-btn secondary-btn" onClick={handleRestore}>
            استعادة نسخة
          </button>
          <button className="large-btn danger-btn" onClick={handleClearAll}>
            حذف جميع البيانات
          </button>
        </div>

        <div className="settings-section">
          <h3>👷 إدارة العمال</h3>
          {pendingChangesCount > 0 && (
            <button className="large-btn primary-btn" onClick={onShowPendingChanges}>
              📋 تغييرات معلقة ({pendingChangesCount})
            </button>
          )}
          <button className="large-btn secondary-btn" onClick={async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.type !== 'sync' || !data.subscribers) {
                  alert('ملف غير صالح');
                  return;
                }
                const db = getDb();
                for (const sub of data.subscribers) {
                  const existing = await db.subscribers
                    .where('generatorId')
                    .equals(data.generatorId)
                    .and(s => s.name === sub.name)
                    .first();
                  if (!existing) {
                    const newId = await db.subscribers.add({
                      name: sub.name,
                      ampere: sub.ampere,
                      generatorId: data.generatorId,
                      startMonth: sub.startMonth,
                      startYear: sub.startYear,
                      active: sub.active,
                    });
                    await db.ampereHistory.add({
                      subscriberId: newId as number,
                      ampere: sub.ampere,
                      effectiveMonth: sub.startMonth,
                      effectiveYear: sub.startYear,
                    });
                  }
                }
                if (data.payments) {
                  for (const p of data.payments) {
                    const existing = await db.payments
                      .where('[subscriberId+month+year]')
                      .equals([p.subscriberId, p.month, p.year])
                      .first();
                    if (existing) {
                      await db.payments.update(existing.id!, { paid: p.paid, paidAt: p.paidAt });
                    } else {
                      await db.payments.add(p);
                    }
                  }
                }
                alert('تم استلام تغييرات العامل بنجاح!');
              } catch {
                alert('خطأ في قراءة الملف');
              }
            };
            input.click();
          }}>
            📥 استلام تغييرات من العامل
          </button>
          {generators && generators.map(g => (
            <WorkerCredDisplay key={g.id} generatorId={g.id!} generatorName={g.name} />
          ))}
        </div>

        <div className="settings-section">
          <h3>بيانات تجريبية</h3>
          <button className="large-btn secondary-btn" onClick={handleLoadTestData}>
            تحميل 25 مشترك تجريبي
          </button>
          <button className="large-btn danger-btn" onClick={async () => {
            if (!confirm('هل تريد حذف جميع المشتركين والصرفيات والأسعار؟')) return;
            await getDb().subscribers.clear();
            await getDb().payments.clear();
            await getDb().ampereHistory.clear();
            await getDb().amperePrices.clear();
            await getDb().expenses.clear();
            alert('تم الحذف بنجاح!');
            window.location.reload();
          }}>
            حذف جميع المشتركين والبيانات
          </button>
        </div>

        <div className="settings-section">
          <h3>الحساب</h3>
          <button className="large-btn danger-btn" onClick={() => {
            logoutUser();
            resetDb();
            onLogout();
          }}>
            تسجيل خروج
          </button>
        </div>

        <div className="settings-section">
          <h3>حول التطبيق</h3>
          <p className="app-version">إدارة مولّدات الكهرباء v1.1</p>
        </div>
      </div>
    </div>
  );
}

export default App;

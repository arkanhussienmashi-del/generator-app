import { useState, useCallback, useMemo } from 'react';
import { getWorkerDb, type Subscriber, type Payment } from './db';
import { MONTHS, CURRENT_YEAR, CURRENT_MONTH, generateYears } from './utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { getWorkerSession, logoutWorker } from './auth';
import './App.css';

type WorkerScreen = 'subscribers' | 'add-subscriber' | 'edit-subscriber' | 'report';

export default function WorkerApp({ onLogout }: { onLogout: () => void }) {
  const session = getWorkerSession()!;
  const [screen, setScreen] = useState<WorkerScreen>('subscribers');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [pendingSync, setPendingSync] = useState(false);

  const subscribers = useLiveQuery(
    () => getWorkerDb(session.ownerEmail).subscribers.where('generatorId').equals(session.generatorId).toArray(),
    [session.generatorId]
  );

  const allPaymentsForMonth = useLiveQuery(
    async () => {
      return getWorkerDb(session.ownerEmail).payments
        .where('month')
        .equals(selectedMonth)
        .and(p => p.year === selectedYear)
        .toArray();
    },
    [selectedMonth, selectedYear]
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

  const getPaymentForSubscriber = useCallback(
    (subscriberId: number): Payment | undefined => {
      return allPaymentsForMonth?.find(p => p.subscriberId === subscriberId);
    },
    [allPaymentsForMonth]
  );

  const handleTogglePayment = async (subscriberId: number) => {
    const db = getWorkerDb(session.ownerEmail);
    const existing = getPaymentForSubscriber(subscriberId);
    if (existing) {
      await db.payments.update(existing.id!, {
        paid: !existing.paid,
        paidAt: !existing.paid ? new Date().toISOString() : undefined,
      });
    } else {
      await db.payments.add({
        subscriberId,
        month: selectedMonth,
        year: selectedYear,
        pricePerAmpere: 0,
        paid: true,
        paidAt: new Date().toISOString(),
      });
    }
    setPendingSync(true);
  };

  const handleAddSubscriber = async (name: string, ampere: number) => {
    const db = getWorkerDb(session.ownerEmail);
    const exists = await db.subscribers
      .where('generatorId')
      .equals(session.generatorId)
      .and(s => s.name === name)
      .first();
    if (exists) {
      alert('اسم المشترك مسجل بالفعل');
      return false;
    }
    const id = await db.subscribers.add({
      name,
      ampere,
      generatorId: session.generatorId,
      startMonth: selectedMonth,
      startYear: selectedYear,
      active: true,
    });
    await db.ampereHistory.add({
      subscriberId: id as number,
      ampere,
      effectiveMonth: selectedMonth,
      effectiveYear: selectedYear,
    });
    setPendingSync(true);
    return true;
  };

  const handleDeleteSubscriber = async (subId: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا المشترك؟')) return;
    const db = getWorkerDb(session.ownerEmail);
    await db.subscribers.update(subId, { active: false });
    setPendingSync(true);
  };

  const handleSendChanges = async () => {
    const db = getWorkerDb(session.ownerEmail);
    const subs = await db.subscribers.where('generatorId').equals(session.generatorId).toArray();
    const payments = await db.payments.toArray();
    const subIds = new Set(subs.map(s => s.id));
    const relevantPayments = payments.filter(p => subIds.has(p.subscriberId));

    const changes = {
      type: 'sync',
      generatorId: session.generatorId,
      generatorName: session.generatorName,
      subscribers: subs,
      payments: relevantPayments,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(changes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worker_${session.code}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    await db.workerPendingChanges.add({
      workerCode: session.code,
      generatorName: session.generatorName,
      changes: JSON.stringify(changes),
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
    setPendingSync(false);
    alert('تم إرسال التغييرات بنجاح!');
  };

  const handleLogout = () => {
    logoutWorker();
    onLogout();
  };

  return (
    <div className="app worker-app" dir="rtl">
      <div className="worker-header">
        <div className="worker-header-info">
          <span className="worker-badge">عامل</span>
          <span className="worker-gen-name">{session.generatorName}</span>
        </div>
        <button className="icon-btn" onClick={handleLogout}>🚪</button>
      </div>

      {screen === 'subscribers' && (
        <WorkerSubscribersScreen
          subscribers={monthSubscribers}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onSelectMonth={setSelectedMonth}
          onSelectYear={setSelectedYear}
          getPayment={getPaymentForSubscriber}
          onTogglePayment={handleTogglePayment}
          onDeleteSubscriber={handleDeleteSubscriber}
          onAdd={() => setScreen('add-subscriber')}
          onEdit={(s) => { setEditingSubscriber(s); setScreen('edit-subscriber'); }}
          onReport={() => setScreen('report')}
          onSendChanges={handleSendChanges}
          pendingSync={pendingSync}
        />
      )}
      {screen === 'add-subscriber' && (
        <WorkerAddEditSubscriberScreen
          onSave={async (name, ampere) => {
            const ok = await handleAddSubscriber(name, ampere);
            if (ok) setScreen('subscribers');
          }}
          onBack={() => setScreen('subscribers')}
        />
      )}
      {screen === 'edit-subscriber' && editingSubscriber && (
        <WorkerEditSubscriberScreen
          subscriber={editingSubscriber}
          onSave={async (name, ampere) => {
            const db = getWorkerDb(session.ownerEmail);
            await db.subscribers.update(editingSubscriber.id!, { name, ampere });
            const existingHistory = await db.ampereHistory
              .where('subscriberId')
              .equals(editingSubscriber.id!)
              .and(h => h.effectiveMonth === selectedMonth && h.effectiveYear === selectedYear)
              .first();
            if (existingHistory) {
              await db.ampereHistory.update(existingHistory.id!, { ampere });
            } else {
              await db.ampereHistory.add({
                subscriberId: editingSubscriber.id!,
                ampere,
                effectiveMonth: selectedMonth,
                effectiveYear: selectedYear,
              });
            }
            setPendingSync(true);
            setScreen('subscribers');
          }}
          onBack={() => setScreen('subscribers')}
        />
      )}
      {screen === 'report' && (
        <WorkerReportScreen
          subscribers={monthSubscribers}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          getPayment={getPaymentForSubscriber}
          onBack={() => setScreen('subscribers')}
        />
      )}
    </div>
  );
}

interface WorkerSubsProps {
  subscribers: Subscriber[];
  selectedMonth: number;
  selectedYear: number;
  onSelectMonth: (m: number) => void;
  onSelectYear: (y: number) => void;
  getPayment: (subId: number) => Payment | undefined;
  onTogglePayment: (subId: number) => void;
  onDeleteSubscriber: (subId: number) => void;
  onAdd: () => void;
  onEdit: (s: Subscriber) => void;
  onReport: () => void;
  onSendChanges: () => void;
  pendingSync: boolean;
}

function WorkerSubscribersScreen({
  subscribers, selectedMonth, selectedYear, onSelectMonth, onSelectYear,
  getPayment, onTogglePayment, onDeleteSubscriber,
  onAdd, onEdit, onReport, onSendChanges, pendingSync
}: WorkerSubsProps) {
  const years = generateYears();
  const paidCount = subscribers.filter(s => getPayment(s.id!)?.paid).length;

  return (
    <div className="screen">
      <div className="date-selector">
        <div className="selector-group">
          <label>الشهر</label>
          <select className="large-select" value={selectedMonth} onChange={(e) => onSelectMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (<option key={i} value={i}>{m}</option>))}
          </select>
        </div>
        <div className="selector-group">
          <label>السنة</label>
          <select className="large-select" value={selectedYear} onChange={(e) => onSelectYear(Number(e.target.value))}>
            {years.map(y => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card total-card">
          <div className="stat-number">{subscribers.length}</div>
          <div className="stat-label">المجموع</div>
        </div>
        <div className="stat-card paid-card">
          <div className="stat-number">{paidCount}</div>
          <div className="stat-label">مدفوع</div>
        </div>
        <div className="stat-card unpaid-card">
          <div className="stat-number">{subscribers.length - paidCount}</div>
          <div className="stat-label">غير مدفوع</div>
        </div>
      </div>

      <div className="worker-actions">
        <button className="large-btn primary-btn" onClick={onAdd}>+ مشترك جديد</button>
        <button className="large-btn secondary-btn" onClick={onReport}>التقارير</button>
        {pendingSync && (
          <button className="large-btn primary-btn sync-btn" onClick={onSendChanges}>📤 إرسال التغييرات</button>
        )}
      </div>

      <div className="sub-list">
        {subscribers.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>لا يوجد مشتركين في هذا الشهر</p>
          </div>
        )}
        {subscribers.map(s => {
          const payment = getPayment(s.id!);
          const isPaid = payment?.paid ?? false;
          return (
            <div key={s.id} className={`subscriber-card ${isPaid ? 'paid' : 'unpaid'}`}>
              <div className="sub-info" onClick={() => onEdit(s)}>
                <div className="sub-name">{s.name}</div>
                <div className="sub-details">
                  <span className="ampere-badge">{s.ampere} أمبير</span>
                </div>
              </div>
              <div className="sub-actions">
                <button
                  className={`pay-toggle ${isPaid ? 'paid' : 'unpaid'}`}
                  onClick={() => onTogglePayment(s.id!)}
                >
                  {isPaid ? '✔' : '✕'}
                </button>
                <button className="delete-btn" onClick={() => onDeleteSubscriber(s.id!)}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerAddEditSubscriberScreen({
  onSave, onBack
}: {
  onSave: (name: string, ampere: number) => Promise<boolean | void>;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [ampere, setAmpere] = useState('10');

  return (
    <div className="screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>مشترك جديد</h1>
        <div style={{ width: 40 }}></div>
      </div>
      <div className="form-body">
        <div className="form-field">
          <input className="large-input" type="text" placeholder="اسم المشترك" value={name} onChange={(e) => setName(e.target.value)} dir="rtl" />
        </div>
        <div className="form-field">
          <label>الأمبير</label>
          <div className="quick-ampere">
            {[5, 10, 15, 20].map(a => (
              <button key={a} className={`ampere-btn ${ampere === String(a) ? 'active' : ''}`} onClick={() => setAmpere(String(a))}>{a}A</button>
            ))}
          </div>
          <input className="large-input" type="number" value={ampere} onChange={(e) => setAmpere(e.target.value)} dir="ltr" />
        </div>
        <button className="large-btn primary-btn" disabled={!name.trim()} onClick={async () => { await onSave(name.trim(), Number(ampere) || 10); }}>حفظ</button>
      </div>
    </div>
  );
}

function WorkerEditSubscriberScreen({
  subscriber, onSave, onBack
}: {
  subscriber: Subscriber;
  onSave: (name: string, ampere: number) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState(subscriber.name);
  const [ampere, setAmpere] = useState(String(subscriber.ampere));

  return (
    <div className="screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>تعديل مشترك</h1>
        <div style={{ width: 40 }}></div>
      </div>
      <div className="form-body">
        <div className="form-field">
          <input className="large-input" type="text" placeholder="اسم المشترك" value={name} onChange={(e) => setName(e.target.value)} dir="rtl" />
        </div>
        <div className="form-field">
          <label>الأمبير</label>
          <div className="quick-ampere">
            {[5, 10, 15, 20].map(a => (
              <button key={a} className={`ampere-btn ${ampere === String(a) ? 'active' : ''}`} onClick={() => setAmpere(String(a))}>{a}A</button>
            ))}
          </div>
          <input className="large-input" type="number" value={ampere} onChange={(e) => setAmpere(e.target.value)} dir="ltr" />
        </div>
        <button className="large-btn primary-btn" disabled={!name.trim()} onClick={() => onSave(name.trim(), Number(ampere) || 10)}>حفظ التعديلات</button>
      </div>
    </div>
  );
}

function WorkerReportScreen({
  subscribers, selectedMonth, selectedYear, getPayment, onBack
}: {
  subscribers: Subscriber[]; selectedMonth: number; selectedYear: number;
  getPayment: (subId: number) => Payment | undefined; onBack: () => void;
}) {
  const paidCount = subscribers.filter(s => getPayment(s.id!)?.paid).length;

  return (
    <div className="screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>تقرير {MONTHS[selectedMonth]} / {selectedYear}</h1>
        <div style={{ width: 40 }}></div>
      </div>
      <div className="report-header-card">
        <h2>{MONTHS[selectedMonth]} / {selectedYear}</h2>
        <p>{subscribers.length} مشترك | {paidCount} مدفوع | {subscribers.length - paidCount} غير مدفوع</p>
      </div>
      <div className="report-list">
        {subscribers.map(s => {
          const p = getPayment(s.id!);
          const isPaid = p?.paid ?? false;
          return (
            <div key={s.id} className={`subscriber-card ${isPaid ? 'paid' : 'unpaid'}`}>
              <div className="sub-info">
                <div className="sub-name">{s.name}</div>
                <div className="sub-details">
                  <span className="ampere-badge">{s.ampere} أمبير</span>
                </div>
              </div>
              <div className={`pay-status-badge ${isPaid ? 'paid' : 'unpaid'}`}>
                {isPaid ? '✔ مدفوع' : '✕ غير مدفوع'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

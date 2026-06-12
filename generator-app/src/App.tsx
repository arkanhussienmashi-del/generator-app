import { useState, useEffect, useCallback } from 'react';
import { db, type Generator, type Subscriber, type Payment } from './db';
import { MONTHS, CURRENT_YEAR, CURRENT_MONTH, generateYears, calcTotal } from './utils';
import { useLiveQuery } from 'dexie-react-hooks';
import './App.css';

type Screen = 'home' | 'subscribers' | 'add-subscriber' | 'edit-subscriber' | 'reports' | 'generators' | 'settings';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedGeneratorId, setSelectedGeneratorId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [pricePerAmpere, setPricePerAmpere] = useState('');

  const generators = useLiveQuery(() => db.generators.toArray());
  const subscribers = useLiveQuery(
    () => selectedGeneratorId !== null
      ? db.subscribers.where('generatorId').equals(selectedGeneratorId).toArray()
      : db.subscribers.toArray(),
    [selectedGeneratorId]
  );

  const allPaymentsForMonth = useLiveQuery(
    async () => {
      return db.payments
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

  const getPaymentForSubscriber = useCallback(
    (subscriberId: number): Payment | undefined => {
      return allPaymentsForMonth?.find(p => p.subscriberId === subscriberId);
    },
    [allPaymentsForMonth]
  );

  const filteredSubscribers = subscribers?.filter(s => {
    const matchesSearch = s.name.includes(searchQuery) || searchQuery === '';
    const payment = getPaymentForSubscriber(s.id!);
    const isPaid = payment?.paid ?? false;
    if (filterMode === 'paid' && !isPaid) return false;
    if (filterMode === 'unpaid' && isPaid) return false;
    return matchesSearch;
  }) || [];

  const paidCount = subscribers?.filter(s => getPaymentForSubscriber(s.id!)?.paid).length || 0;
  const unpaidCount = (subscribers?.length || 0) - paidCount;
  const totalExpected = subscribers?.reduce((sum, s) => sum + calcTotal(s.ampere, Number(pricePerAmpere) || 0), 0) || 0;
  const totalCollected = subscribers?.filter(s => getPaymentForSubscriber(s.id!)?.paid)
    .reduce((sum, s) => sum + calcTotal(s.ampere, Number(pricePerAmpere) || 0), 0) || 0;

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
          totalCount={subscribers?.length || 0}
          totalExpected={totalExpected}
          totalCollected={totalCollected}
          onGoSubscribers={() => setScreen('subscribers')}
          onGoReports={() => setScreen('reports')}
          onGoGenerators={() => setScreen('generators')}
          onGoSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'subscribers' && (
        <SubscriberListScreen
          subscribers={filteredSubscribers}
          allSubscribers={subscribers || []}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterMode={filterMode}
          onFilterChange={setFilterMode}
          paidCount={paidCount}
          unpaidCount={unpaidCount}
          totalCount={subscribers?.length || 0}
          pricePerAmpere={Number(pricePerAmpere) || 0}
          getPayment={getPaymentForSubscriber}
          month={selectedMonth}
          year={selectedYear}
          onBack={() => setScreen('home')}
          onAdd={() => { setEditingSubscriber(null); setScreen('add-subscriber'); }}
          onEdit={(sub) => { setEditingSubscriber(sub); setScreen('edit-subscriber'); }}
          onTogglePayment={async (subscriberId) => {
            const existing = getPaymentForSubscriber(subscriberId);
            if (existing) {
              await db.payments.update(existing.id!, { paid: !existing.paid });
            } else {
              await db.payments.add({
                subscriberId,
                month: selectedMonth,
                year: selectedYear,
                pricePerAmpere: Number(pricePerAmpere) || 0,
                paid: true,
              });
            }
          }}
        />
      )}
      {(screen === 'add-subscriber' || screen === 'edit-subscriber') && (
        <AddEditSubscriberScreen
          subscriber={editingSubscriber}
          generatorId={selectedGeneratorId!}
          onSave={async (name, ampere) => {
            if (editingSubscriber) {
              await db.subscribers.update(editingSubscriber.id!, { name, ampere });
            } else {
              await db.subscribers.add({ name, ampere, generatorId: selectedGeneratorId! });
            }
            setScreen('subscribers');
          }}
          onBack={() => setScreen('subscribers')}
        />
      )}
      {screen === 'reports' && (
        <ReportsScreen
          subscribers={subscribers || []}
          pricePerAmpere={Number(pricePerAmpere) || 0}
          getPayment={getPaymentForSubscriber}
          month={selectedMonth}
          year={selectedYear}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'generators' && (
        <GeneratorsScreen
          generators={generators || []}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen onBack={() => setScreen('home')} />
      )}
    </div>
  );
}

function GeneratorSetup({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="screen setup-screen">
      <div className="setup-card">
        <div className="setup-icon">⚡</div>
        <h1>مرحباً بك</h1>
        <p>أدخل اسم مولّدك للبدء</p>
        <input
          className="large-input"
          type="text"
          placeholder="اسم المولّد"
          value={name}
          onChange={(e) => setName(e.target.value)}
          dir="rtl"
        />
        <button
          className="large-btn primary-btn"
          disabled={!name.trim()}
          onClick={async () => {
            await db.generators.add({ name: name.trim() });
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
  onGoSubscribers, onGoReports, onGoGenerators, onGoSettings
}: HomeProps) {
  const years = generateYears();

  return (
    <div className="screen home-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onGoSettings}>⚙</button>
        <h1>مولّدي</h1>
        <button className="icon-btn" onClick={onGoGenerators}>⚡</button>
      </div>

      {generators.length > 1 && (
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
          <div className="stat-label">مدفوع ✔</div>
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
  allSubscribers: Subscriber[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterMode: 'all' | 'paid' | 'unpaid';
  onFilterChange: (m: 'all' | 'paid' | 'unpaid') => void;
  paidCount: number;
  unpaidCount: number;
  totalCount: number;
  pricePerAmpere: number;
  getPayment: (id: number) => Payment | undefined;
  month: number;
  year: number;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (sub: Subscriber) => void;
  onTogglePayment: (subscriberId: number) => void;
}

function SubscriberListScreen({
  subscribers, searchQuery, onSearchChange,
  filterMode, onFilterChange, paidCount, unpaidCount, totalCount,
  pricePerAmpere, getPayment, onBack, onAdd, onEdit, onTogglePayment
}: SubListProps) {
  return (
    <div className="screen subscriber-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>المشتركين</h1>
        <button className="icon-btn add-btn" onClick={onAdd}>+</button>
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="بحث بالاسم..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          dir="rtl"
        />
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
            <p>لا يوجد مشتركين</p>
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
  onSave: (name: string, ampere: number) => void;
  onBack: () => void;
}

function AddEditSubscriberScreen({ subscriber, onSave, onBack }: AddEditProps) {
  const [name, setName] = useState(subscriber?.name || '');
  const [ampere, setAmpere] = useState(subscriber?.ampere?.toString() || '');

  return (
    <div className="screen form-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>{subscriber ? 'تعديل مشترك' : 'مشترك جديد'}</h1>
        <div style={{width: 40}}></div>
      </div>

      <div className="form-body">
        <div className="form-field">
          <label>الاسم</label>
          <input
            className="large-input"
            type="text"
            placeholder="اسم المشترك"
            value={name}
            onChange={(e) => setName(e.target.value)}
            dir="rtl"
            autoFocus
          />
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
          disabled={!name.trim() || !ampere}
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
  pricePerAmpere: number;
  getPayment: (id: number) => Payment | undefined;
  month: number;
  year: number;
  onBack: () => void;
}

function ReportsScreen({ subscribers, pricePerAmpere, getPayment, month, year, onBack }: ReportsProps) {
  const totalSubscribers = subscribers.length;
  const paidSubscribers = subscribers.filter(s => getPayment(s.id!)?.paid).length;
  const unpaidSubscribers = totalSubscribers - paidSubscribers;
  const totalAmpere = subscribers.reduce((sum, s) => sum + s.ampere, 0);
  const paidAmpere = subscribers.filter(s => getPayment(s.id!)?.paid).reduce((sum, s) => sum + s.ampere, 0);
  const totalExpected = totalAmpere * pricePerAmpere;
  const totalCollected = paidAmpere * pricePerAmpere;
  const collectionRate = totalSubscribers > 0 ? Math.round((paidSubscribers / totalSubscribers) * 100) : 0;

  const unpaidList = subscribers.filter(s => !getPayment(s.id!)?.paid);

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.setFontSize(16);
    doc.text(`Generator Report - ${MONTHS[month]} ${year}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Total: ${totalSubscribers} | Paid: ${paidSubscribers} | Unpaid: ${unpaidSubscribers}`, 14, 30);
    doc.text(`Expected: ${totalExpected.toLocaleString()} IQD | Collected: ${totalCollected.toLocaleString()} IQD`, 14, 38);

    autoTable(doc, {
      startY: 45,
      head: [['Name', 'Ampere', 'Status', 'Amount']],
      body: subscribers.map(s => [
        s.name,
        `${s.ampere}A`,
        getPayment(s.id!)?.paid ? 'Paid' : 'Unpaid',
        `${calcTotal(s.ampere, pricePerAmpere).toLocaleString()} IQD`
      ]),
    });
    doc.save(`report_${MONTHS[month]}_${year}.pdf`);
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = subscribers.map(s => ({
      'الاسم': s.name,
      'الأمبير': s.ampere,
      'الحالة': getPayment(s.id!)?.paid ? 'مدفوع' : 'غير مدفوع',
      'المبلغ': calcTotal(s.ampere, pricePerAmpere),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${MONTHS[month]}_${year}.xlsx`);
  };

  return (
    <div className="screen reports-screen">
      <div className="header-bar">
        <button className="icon-btn" onClick={onBack}>→</button>
        <h1>التقارير</h1>
        <div style={{width: 40}}></div>
      </div>

      <div className="reports-content">
        <div className="report-header-card">
          <h2>{MONTHS[month]} {year}</h2>
        </div>

        <div className="report-stats">
          <div className="report-stat">
            <div className="report-stat-value">{totalSubscribers}</div>
            <div className="report-stat-label">مشترك</div>
          </div>
          <div className="report-stat">
            <div className="report-stat-value">{paidSubscribers}</div>
            <div className="report-stat-label">مدفوع</div>
          </div>
          <div className="report-stat">
            <div className="report-stat-value">{unpaidSubscribers}</div>
            <div className="report-stat-label">غير مدفوع</div>
          </div>
        </div>

        {pricePerAmpere > 0 && (
          <div className="report-revenue">
            <div className="revenue-row">
              <span>إجمالي الأمبير:</span>
              <span>{totalAmpere} أمبير</span>
            </div>
            <div className="revenue-row">
              <span>المتوقع:</span>
              <span>{totalExpected.toLocaleString()} د.ع</span>
            </div>
            <div className="revenue-row highlight">
              <span>المحصّل:</span>
              <span>{totalCollected.toLocaleString()} د.ع</span>
            </div>
            <div className="revenue-row">
              <span>نسبة التحصيل:</span>
              <span className={collectionRate >= 80 ? 'good' : 'bad'}>{collectionRate}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${collectionRate}%` }}></div>
            </div>
          </div>
        )}

        {unpaidList.length > 0 && (
          <div className="unpaid-list-section">
            <h3>المشتركين غير المدفوعين ({unpaidList.length})</h3>
            {unpaidList.map(s => (
              <div key={s.id} className="unpaid-item">
                <span>{s.name}</span>
                <span>{s.ampere} أمبير - {calcTotal(s.ampere, pricePerAmpere).toLocaleString()} د.ع</span>
              </div>
            ))}
          </div>
        )}

        <div className="export-buttons">
          <button className="large-btn secondary-btn" onClick={exportPDF}>
            تصدير PDF
          </button>
          <button className="large-btn secondary-btn" onClick={exportExcel}>
            تصدير Excel
          </button>
        </div>
      </div>
    </div>
  );
}

interface GeneratorsProps {
  generators: Generator[];
  onBack: () => void;
}

function GeneratorsScreen({ generators, onBack }: GeneratorsProps) {
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
            value={editing ? newName : newName}
            onChange={(e) => setNewName(e.target.value)}
            dir="rtl"
          />
          <button
            className="large-btn primary-btn"
            disabled={!newName.trim()}
            onClick={async () => {
              if (editing) {
                await db.generators.update(editing.id!, { name: newName.trim() });
                setEditing(null);
              } else {
                await db.generators.add({ name: newName.trim() });
              }
              setNewName('');
            }}
          >
            {editing ? 'حفظ' : 'إضافة'}
          </button>
        </div>

        <div className="generator-list">
          {generators.map(g => (
            <div key={g.id} className="generator-item">
              <span className="gen-icon">⚡</span>
              <span className="gen-name">{g.name}</span>
              <div className="gen-actions">
                <button className="small-btn" onClick={() => { setEditing(g); setNewName(g.name); }}>✏</button>
                <button
                  className="small-btn danger"
                  onClick={async () => {
                    if (confirm('هل أنت متأكد من حذف هذا المولّد؟')) {
                      await db.generators.delete(g.id!);
                      const subs = await db.subscribers.where('generatorId').equals(g.id!).toArray();
                      for (const sub of subs) {
                        await db.payments.where('subscriberId').equals(sub.id!).delete();
                        await db.subscribers.delete(sub.id!);
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

function SettingsScreen({ onBack }: { onBack: () => void }) {
  const handleBackup = async () => {
    const data = {
      generators: await db.generators.toArray(),
      subscribers: await db.subscribers.toArray(),
      payments: await db.payments.toArray(),
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
      await db.generators.clear();
      await db.subscribers.clear();
      await db.payments.clear();
      await db.generators.bulkAdd(data.generators);
      await db.subscribers.bulkAdd(data.subscribers);
      await db.payments.bulkAdd(data.payments);
      alert('تم الاستعادة بنجاح!');
    };
    input.click();
  };

  const handleClearAll = async () => {
    if (confirm('هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه!')) {
      await db.generators.clear();
      await db.subscribers.clear();
      await db.payments.clear();
      alert('تم حذف جميع البيانات');
      window.location.reload();
    }
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
          <h3>حول التطبيق</h3>
          <p className="app-version">إدارة مولّدات الكهرباء v1.0</p>
        </div>
      </div>
    </div>
  );
}

export default App;

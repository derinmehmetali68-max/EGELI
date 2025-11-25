import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { getBranchPreference, preferenceToQuery } from '../utils/branch';
import { useNavigate } from 'react-router-dom';
import HeatMap from '../components/charts/HeatMap';
import TimeSeriesChart from '../components/charts/TimeSeriesChart';
import CorrelationMatrix from '../components/charts/CorrelationMatrix';
import ShelfMap from '../components/charts/ShelfMap';

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const numberFormatter = new Intl.NumberFormat('tr-TR');
const decimalFormatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const monthLabelFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short' });

const STATUS_STYLES = {
  active: 'bg-sky-100 text-sky-700 border-sky-200',
  overdue: 'bg-rose-100 text-rose-700 border-rose-200',
  returned: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'returned-late': 'bg-amber-100 text-amber-700 border-amber-200',
};

const STATUS_LABELS = {
  active: 'Aktif Ödünç',
  overdue: 'Gecikmiş',
  returned: 'İade',
  'returned-late': 'Gecikmeli İade',
};

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }
  if (typeof value === 'string') {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const direct = new Date(normalized);
    if (!Number.isNaN(direct.getTime())) return direct;
    const fallback = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return null;
}

function getMonthKey(value) {
  const date = parseDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getLastMonths(count) {
  const result = [];
  const base = new Date();
  base.setDate(1);
  base.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const current = new Date(base.getFullYear(), base.getMonth() - i, 1);
    result.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function formatMonthLabel(key) {
  if (typeof key !== 'string') return key;
  const [y, m] = key.split('-').map(part => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
  const d = new Date(y, m - 1, 1);
  const label = monthLabelFormatter.format(d);
  return `${label} ${y}`;
}

function formatInteger(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatPercent(value) {
  return `${decimalFormatter.format(Number.isFinite(value) ? value : 0)}%`;
}

function formatDays(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${decimalFormatter.format(value)} gün`;
}

function percentOf(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

const CHART_COLOR_SEQUENCE = ['#6366F1', '#22C55E', '#0EA5E9', '#F97316', '#8B5CF6', '#14B8A6', '#F472B6', '#F59E0B'];

function DonutChart({ segments, size = 220, thickness = 56, children, highlightedIndex = null, onSegmentHover }) {
  const radius = Math.max((size - thickness) / 2, 0);
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const { normalizedSegments, total } = useMemo(() => {
    const sanitized = segments
      .map(segment => ({
        ...segment,
        value: Number.isFinite(segment.value) ? Math.max(segment.value, 0) : 0,
      }))
      .filter(segment => segment.value > 0);

    if (!sanitized.length) {
      return { normalizedSegments: [], total: 0 };
    }

    const totalValue = sanitized.reduce((sum, segment) => sum + segment.value, 0);
    let offset = 0;

    const mapped = sanitized.map(segment => {
      const ratio = totalValue ? segment.value / totalValue : 0;
      const dasharray = `${ratio * circumference} ${circumference}`;
      const dashoffset = -offset;
      offset += ratio * circumference;
      return { ...segment, ratio, dasharray, dashoffset };
    });

    return { normalizedSegments: mapped, total: totalValue };
  }, [circumference, segments]);

  const handleHover = (index) => {
    if (onSegmentHover) onSegmentHover(index);
  };

  const activeIndex = highlightedIndex !== null && highlightedIndex >= 0 && highlightedIndex < normalizedSegments.length
    ? highlightedIndex
    : null;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <circle
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={Math.max(thickness - 8, 2)}
          stroke="#E2E8F0"
          fill="transparent"
          transform={`rotate(-90 ${center} ${center})`}
        />
        {normalizedSegments.map((segment, index) => (
          <circle
            key={segment.label}
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={segment.color}
            strokeWidth={activeIndex === index ? thickness + 8 : thickness}
            strokeDasharray={segment.dasharray}
            strokeDashoffset={segment.dashoffset}
            strokeLinecap="round"
            className="transition-all duration-300 ease-out cursor-pointer"
            style={{ opacity: activeIndex === null || activeIndex === index ? 1 : 0.35 }}
            onMouseEnter={() => handleHover(index)}
            onMouseLeave={() => handleHover(null)}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </svg>
      <div
        className="absolute rounded-full bg-white border border-slate-100 flex flex-col items-center justify-center px-4 text-center shadow-sm"
        style={{
          width: Math.max(size - thickness * 1.4, 0),
          height: Math.max(size - thickness * 1.4, 0),
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {children || (
          <>
            <span className="text-xs uppercase text-slate-400 font-semibold tracking-wide">Toplam</span>
            <span className="text-2xl font-semibold text-slate-900 mt-1">{formatInteger(total)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function ChartLegend({ segments, total, activeIndex = null, onHover }) {
  const safeTotal = Number.isFinite(total) ? Math.max(total, 0) : segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);

  return (
    <div className="w-full space-y-3">
      {segments.map((segment, index) => (
        <div
          key={segment.label}
          className={`rounded-lg px-3 py-2 transition-colors ${activeIndex === index ? 'bg-indigo-50/70' : 'hover:bg-slate-50/60'}`}
          onMouseEnter={() => onHover?.(index)}
          onMouseLeave={() => onHover?.(null)}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-flex w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="font-medium text-slate-700">{segment.label}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">{formatInteger(segment.value)}</div>
              {safeTotal > 0 && (
                <div className="text-xs text-slate-500">{formatPercent(percentOf(segment.value, safeTotal))}</div>
              )}
            </div>
          </div>
          {safeTotal > 0 && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${percentOf(segment.value, safeTotal)}%`,
                  backgroundColor: segment.color,
                  opacity: activeIndex === index || activeIndex === null ? 0.8 : 0.35,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LoanTrendChart({ data }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const gradientId = useMemo(() => `trendGradient-${Math.random().toString(36).slice(2, 10)}`, []);
  const maxValue = data.reduce((max, item) => Math.max(max, item.loans, item.returns), 0);

  if (maxValue <= 0) {
    return <div className="text-slate-400 py-4 text-sm">Henüz veri yok</div>;
  }

  const chartWidth = Math.max(data.length * 96, 420);
  const chartHeight = 260;
  const padding = { top: 24, right: 24, bottom: 36, left: 48 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const yScale = value => padding.top + innerHeight - (value / maxValue) * innerHeight;

  const loanPoints = data.map((item, index) => `${padding.left + index * step},${yScale(item.loans)}`).join(' ');
  const returnPoints = data.map((item, index) => `${padding.left + index * step},${yScale(item.returns)}`).join(' ');

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = (maxValue / 4) * index;
    return {
      value,
      y: yScale(value),
    };
  });

  const activePointIndex = hoverIndex ?? data.length - 1;
  const activePoint = data[activePointIndex];
  const activeDelta = activePoint ? activePoint.loans - activePoint.returns : 0;

  const handleMouseMove = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - padding.left;
    if (x < 0) {
      setHoverIndex(0);
      return;
    }
    if (x > innerWidth) {
      setHoverIndex(data.length - 1);
      return;
    }
    const index = Math.round(x / (step === 0 ? innerWidth || 1 : step));
    setHoverIndex(Math.min(Math.max(index, 0), data.length - 1));
  };

  const handleMouseLeave = () => setHoverIndex(null);

  return (
    <div className="space-y-4">
      <div className="relative min-w-max" style={{ width: chartWidth }}>
        <svg
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <rect
            x={padding.left}
            y={padding.top}
            width={innerWidth}
            height={innerHeight}
            fill={`url(#${gradientId})`}
            rx={16}
          />
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#EEF2FF" />
              <stop offset="100%" stopColor="#F8FAFC" />
            </linearGradient>
          </defs>
          {gridLines.map(line => (
            <g key={line.value}>
              <line
                x1={padding.left}
                x2={padding.left + innerWidth}
                y1={line.y}
                y2={line.y}
                stroke="#E2E8F0"
                strokeDasharray="4 6"
              />
              <text x={padding.left - 12} y={line.y + 4} className="fill-slate-400 text-xs" textAnchor="end">
                {formatInteger(line.value)}
              </text>
            </g>
          ))}
          <polyline
            points={loanPoints}
            fill="none"
            stroke="#0EA5E9"
            strokeWidth={3}
            strokeLinecap="round"
            className="drop-shadow-sm"
          />
          <polyline
            points={returnPoints}
            fill="none"
            stroke="#22C55E"
            strokeWidth={3}
            strokeLinecap="round"
            className="drop-shadow-sm"
          />
          {data.map((item, index) => {
            const x = padding.left + index * step;
            const isActive = index === activePointIndex;
            return (
              <g key={item.key}>
                <circle
                  cx={x}
                  cy={yScale(item.loans)}
                  r={isActive ? 6 : 4}
                  fill="#0EA5E9"
                  className="transition-all duration-200"
                />
                <circle
                  cx={x}
                  cy={yScale(item.returns)}
                  r={isActive ? 6 : 4}
                  fill="#22C55E"
                  className="transition-all duration-200"
                />
                <line
                  x1={x}
                  x2={x}
                  y1={padding.top}
                  y2={padding.top + innerHeight}
                  stroke={isActive ? '#64748B' : 'transparent'}
                  strokeDasharray="4 6"
                />
                <text
                  x={x}
                  y={padding.top + innerHeight + 20}
                  className="text-xs fill-slate-500"
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {activePoint && (
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <div className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 font-medium">
            {activePoint.label}
          </div>
          <div className="flex items-center gap-2 text-sky-600 font-semibold">
            <span className="inline-flex w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span>Ödünç: {formatInteger(activePoint.loans)}</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-600 font-semibold">
            <span className="inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>İade: {formatInteger(activePoint.returns)}</span>
          </div>
          <div className={`text-xs font-medium ${activeDelta >= 0 ? 'text-sky-600' : 'text-rose-500'}`}>
            Net değişim: {(activeDelta > 0 ? '+' : '') + formatInteger(activeDelta)}
          </div>
        </div>
      )}
    </div>
  );
}

function getTabPanelClasses(isActive) {
  const base = 'w-full space-y-6 transition-all duration-500 ease-out transform';
  return isActive
    ? `${base} opacity-100 translate-y-0 relative z-10`
    : `${base} opacity-0 -translate-y-4 pointer-events-none absolute inset-x-0 top-0 z-0`;
}

export default function Statistics() {
  const navigate = useNavigate();
  const [popular, setPopular] = useState([]);
  const [branchPref, setBranchPref] = useState(() => getBranchPreference());
  const [stats, setStats] = useState({ books: 0, members: 0, activeLoans: 0, overdue: 0, totalLoans: 0, returnedLoans: 0 });
  const [booksData, setBooksData] = useState([]);
  const [membersData, setMembersData] = useState([]);
  const [loansData, setLoansData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [loanSegmentHighlight, setLoanSegmentHighlight] = useState(null);
  const [inventorySegmentHighlight, setInventorySegmentHighlight] = useState(null);
  const [memberSegmentHighlight, setMemberSegmentHighlight] = useState(null);
  const [categorySegmentHighlight, setCategorySegmentHighlight] = useState(null);

  useEffect(() => {
    const handler = (ev) => setBranchPref(ev.detail ?? getBranchPreference());
    window.addEventListener('branch-change', handler);
    return () => window.removeEventListener('branch-change', handler);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') {
      setLoanSegmentHighlight(null);
      setInventorySegmentHighlight(null);
      setMemberSegmentHighlight(null);
      setCategorySegmentHighlight(null);
    }
  }, [activeTab]);

  useEffect(() => {
    const params = {};
    const branchParam = preferenceToQuery(branchPref);
    if (branchParam !== undefined) params.branch_id = branchParam;

    Promise.all([
      api.get('/reports/popular', { params }),
      api.get('/books', { params }),
      api.get('/members', { params }),
      api.get('/loans', { params })
    ]).then(([popularRes, booksRes, membersRes, loansRes]) => {
      setPopular(Array.isArray(popularRes.data) ? popularRes.data : []);
      const booksArray = Array.isArray(booksRes.data?.items)
        ? booksRes.data.items
        : Array.isArray(booksRes.data)
          ? booksRes.data
          : [];
      const membersArray = Array.isArray(membersRes.data?.items)
        ? membersRes.data.items
        : Array.isArray(membersRes.data)
          ? membersRes.data
          : [];
      const loansArray = Array.isArray(loansRes.data?.items)
        ? loansRes.data.items
        : Array.isArray(loansRes.data)
          ? loansRes.data
          : [];
      setBooksData(booksArray);
      setMembersData(membersArray);
      setLoansData(loansArray);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeLoans = loansArray.filter(l => !l.return_date).length;
      const overdueLoans = loansArray.filter(l => {
        if (l.return_date) return false;
        const dueDate = parseDate(l.due_date);
        return !!dueDate && dueDate < today;
      }).length;
      setStats({
        books: booksArray.length,
        members: membersArray.length,
        activeLoans,
        overdue: overdueLoans,
        totalLoans: loansArray.length,
        returnedLoans: loansArray.filter(l => l.return_date).length
      });
      setLoading(false);
    }).catch(() => {
      setBooksData([]);
      setMembersData([]);
      setLoansData([]);
      setPopular([]);
      setStats({ books: 0, members: 0, activeLoans: 0, overdue: 0, totalLoans: 0, returnedLoans: 0 });
      setLoading(false);
    });
  }, [branchPref]);

  const inventoryStats = useMemo(() => {
    if (!booksData.length) {
      return {
        totalCopies: 0,
        availableCopies: 0,
        loanedCopies: 0,
        uniqueCategories: 0,
        uniqueAuthors: 0,
        distinctLanguages: 0,
        availabilityRate: 0,
      };
    }
    let totalCopies = 0;
    let availableCopies = 0;
    const categories = new Set();
    const authors = new Set();
    const languages = new Set();
    booksData.forEach(book => {
      const copies = Number(book.copies);
      if (Number.isFinite(copies)) totalCopies += copies;
      const available = Number(book.available);
      if (Number.isFinite(available)) availableCopies += available;
      if (book.category) {
        String(book.category)
          .split(',')
          .map(part => part.trim())
          .filter(Boolean)
          .forEach(cat => categories.add(cat));
      }
      if (book.author) {
        String(book.author)
          .split(',')
          .map(part => part.trim())
          .filter(Boolean)
          .forEach(author => authors.add(author));
      }
      if (book.language) {
        const lang = String(book.language).trim();
        if (lang) languages.add(lang);
      }
    });
    const loanedCopies = Math.max(totalCopies - availableCopies, 0);
    const availabilityRate = totalCopies ? (availableCopies / totalCopies) * 100 : 0;
    return {
      totalCopies,
      availableCopies,
      loanedCopies,
      uniqueCategories: categories.size,
      uniqueAuthors: authors.size,
      distinctLanguages: languages.size,
      availabilityRate,
    };
  }, [booksData]);

  const categoryStats = useMemo(() => {
    if (!booksData.length) return [];
    const counts = new Map();
    booksData.forEach(book => {
      if (!book.category) return;
      String(book.category)
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(cat => {
          counts.set(cat, (counts.get(cat) || 0) + 1);
        });
    });
    const totalAssignments = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
    return Array.from(counts.entries())
      .map(([category, count]) => ({
        category,
        count,
        percent: totalAssignments ? (count / totalAssignments) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [booksData]);

  const loanTrend = useMemo(() => {
    const months = getLastMonths(6);
    const map = new Map(months.map(key => [key, { loans: 0, returns: 0 }]));
    loansData.forEach(loan => {
      const loanKey = getMonthKey(loan.loan_date);
      if (loanKey) {
        if (!map.has(loanKey)) map.set(loanKey, { loans: 0, returns: 0 });
        map.get(loanKey).loans += 1;
      }
      if (loan.return_date) {
        const returnKey = getMonthKey(loan.return_date);
        if (returnKey) {
          if (!map.has(returnKey)) map.set(returnKey, { loans: 0, returns: 0 });
          map.get(returnKey).returns += 1;
        }
      }
    });
    return months.map(key => {
      const entry = map.get(key) || { loans: 0, returns: 0 };
      return {
        key,
        label: formatMonthLabel(key),
        loans: entry.loans,
        returns: entry.returns,
      };
    });
  }, [loansData]);

  const loanBreakdown = useMemo(() => {
    if (!loansData.length) {
      return {
        total: 0,
        active: 0,
        returned: 0,
        openOverdue: 0,
        closedOverdue: 0,
        overdueTotal: 0,
        returnRate: 0,
        overdueRate: 0,
        avgLoanDuration: 0,
        avgOverdueDuration: 0,
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let returned = 0;
    let active = 0;
    let openOverdue = 0;
    let closedOverdue = 0;
    let durationSum = 0;
    let durationCount = 0;
    let overdueDurationSum = 0;
    let overdueDurationCount = 0;

    loansData.forEach(loan => {
      const loanDate = parseDate(loan.loan_date);
      const returnDate = parseDate(loan.return_date);
      const dueDate = parseDate(loan.due_date);
      if (returnDate) {
        returned += 1;
        if (loanDate) {
          const diff = (returnDate - loanDate) / MS_IN_DAY;
          if (Number.isFinite(diff) && diff >= 0) {
            durationSum += diff;
            durationCount += 1;
          }
        }
        if (dueDate && returnDate > dueDate) {
          closedOverdue += 1;
          const overdueDays = (returnDate - dueDate) / MS_IN_DAY;
          if (Number.isFinite(overdueDays) && overdueDays > 0) {
            overdueDurationSum += overdueDays;
            overdueDurationCount += 1;
          }
        }
      } else {
        active += 1;
        if (dueDate && dueDate < today) {
          openOverdue += 1;
          const overdueDays = (today - dueDate) / MS_IN_DAY;
          if (Number.isFinite(overdueDays) && overdueDays > 0) {
            overdueDurationSum += overdueDays;
            overdueDurationCount += 1;
          }
        }
      }
    });

    const total = loansData.length;
    const overdueTotal = openOverdue + closedOverdue;
    const avgLoanDuration = durationCount ? durationSum / durationCount : 0;
    const avgOverdueDuration = overdueDurationCount ? overdueDurationSum / overdueDurationCount : 0;

    return {
      total,
      active,
      returned,
      openOverdue,
      closedOverdue,
      overdueTotal,
      returnRate: total ? (returned / total) * 100 : 0,
      overdueRate: total ? (overdueTotal / total) * 100 : 0,
      avgLoanDuration,
      avgOverdueDuration,
    };
  }, [loansData]);

  const loanInsights = useMemo(() => {
    if (!loansData.length) {
      return {
        todayLoans: 0,
        weekLoans: 0,
        todayReturns: 0,
        weekReturns: 0,
        dueToday: 0,
        dueSoon: 0,
        activeMembers: 0,
        borrowers: 0,
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfWeek = new Date(today);
    const currentWeekday = startOfWeek.getDay();
    const diff = currentWeekday === 0 ? -6 : 1 - currentWeekday;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const upcomingThreshold = new Date(today);
    upcomingThreshold.setDate(upcomingThreshold.getDate() + 3);

    let todayLoans = 0;
    let weekLoans = 0;
    let todayReturns = 0;
    let weekReturns = 0;
    let dueToday = 0;
    let dueSoon = 0;
    const activeMemberSet = new Set();
    const borrowerSet = new Set();

    loansData.forEach(loan => {
      if (loan.member_id) borrowerSet.add(loan.member_id);
      const loanDate = parseDate(loan.loan_date);
      if (loanDate) {
        if (loanDate >= today && loanDate < tomorrow) todayLoans += 1;
        if (loanDate >= startOfWeek && loanDate < endOfWeek) weekLoans += 1;
      }
      const returnDate = parseDate(loan.return_date);
      if (returnDate) {
        if (returnDate >= today && returnDate < tomorrow) todayReturns += 1;
        if (returnDate >= startOfWeek && returnDate < endOfWeek) weekReturns += 1;
      }
      const dueDate = parseDate(loan.due_date);
      if (!returnDate && dueDate) {
        if (dueDate >= today && dueDate < tomorrow) dueToday += 1;
        if (dueDate >= today && dueDate <= upcomingThreshold) dueSoon += 1;
      }
      if (!returnDate && loan.member_id) {
        activeMemberSet.add(loan.member_id);
      }
    });

    return {
      todayLoans,
      weekLoans,
      todayReturns,
      weekReturns,
      dueToday,
      dueSoon,
      activeMembers: activeMemberSet.size,
      borrowers: borrowerSet.size,
    };
  }, [loansData]);

  const topBorrowers = useMemo(() => {
    if (!loansData.length) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map();
    loansData.forEach(loan => {
      if (!loan.member_id) return;
      const existing = map.get(loan.member_id) || { total: 0, active: 0, overdue: 0, returned: 0, name: loan.member_name || '', student_no: loan.student_no || '' };
      existing.total += 1;
      if (loan.return_date) {
        existing.returned += 1;
      } else {
        existing.active += 1;
        const dueDate = parseDate(loan.due_date);
        if (dueDate && dueDate < today) {
          existing.overdue += 1;
        }
      }
      if (!existing.name && loan.member_name) {
        existing.name = loan.member_name;
      }
      map.set(loan.member_id, existing);
    });
    const memberLookup = new Map(membersData.map(member => [member.id, member]));
    return Array.from(map.entries())
      .map(([memberId, info]) => {
        const member = memberLookup.get(memberId);
        return {
          memberId,
          name: info.name || member?.name || '—',
          grade: member?.grade || '—',
          total: info.total,
          active: info.active,
          overdue: info.overdue,
          returned: info.returned,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [loansData, membersData]);

  const recentLoans = useMemo(() => {
    if (!loansData.length) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [...loansData]
      .sort((a, b) => {
        const aDate = parseDate(a.loan_date);
        const bDate = parseDate(b.loan_date);
        return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
      })
      .slice(0, 6)
      .map(loan => {
        const loanDate = parseDate(loan.loan_date);
        const dueDate = parseDate(loan.due_date);
        const returnDate = parseDate(loan.return_date);
        let status = 'active';
        if (returnDate) {
          status = dueDate && returnDate > dueDate ? 'returned-late' : 'returned';
        } else if (dueDate && dueDate < today) {
          status = 'overdue';
        }
        return {
          id: loan.id,
          title: loan.book_title || '—',
          member: loan.member_name || '—',
          loanDate: loanDate ? loanDate.toLocaleDateString('tr-TR') : '—',
          dueDate: dueDate ? dueDate.toLocaleDateString('tr-TR') : '—',
          status,
        };
      });
  }, [loansData]);

  const totalMembers = membersData.length;
  const generalSummary = useMemo(() => {
    const borrowers = loanInsights.borrowers;
    const activeMembers = loanInsights.activeMembers;
    const averageLoansPerMember = totalMembers ? loanBreakdown.total / totalMembers : 0;
    const averageLoansPerBorrower = borrowers ? loanBreakdown.total / borrowers : 0;
    const activeMemberRate = totalMembers ? (activeMembers / totalMembers) * 100 : 0;
    return [
      {
        label: 'Kitap Stoğu',
        value: formatInteger(stats.books),
        detail: `Toplam kopya ${formatInteger(inventoryStats.totalCopies)} · Mevcut ${formatInteger(inventoryStats.availableCopies)} · Ödünçte ${formatInteger(inventoryStats.loanedCopies)}`,
      },
      {
        label: 'Üye Profili',
        value: formatInteger(totalMembers),
        detail: `Aktif ödünç alan ${formatInteger(activeMembers)} (${formatPercent(activeMemberRate)}) · Toplam işlem yapan ${formatInteger(borrowers)}`,
      },
      {
        label: 'Ödünç İşlemleri',
        value: formatInteger(loanBreakdown.total),
        detail: `İade oranı ${formatPercent(loanBreakdown.returnRate)} · Gecikme oranı ${formatPercent(loanBreakdown.overdueRate)} · Ortalama süre ${formatDays(loanBreakdown.avgLoanDuration)}`,
      },
      {
        label: 'Bugünkü Aktivite',
        value: `${formatInteger(loanInsights.todayLoans)} ödünç`,
        detail: `İade ${formatInteger(loanInsights.todayReturns)} · Bugün vadesi gelen ${formatInteger(loanInsights.dueToday)}`,
      },
      {
        label: 'Haftalık Aktivite',
        value: `${formatInteger(loanInsights.weekLoans)} ödünç`,
        detail: `İade ${formatInteger(loanInsights.weekReturns)} · 3 gün içinde vadesi dolacak ${formatInteger(loanInsights.dueSoon)}`,
      },
      {
        label: 'Ortalama Kullanım',
        value: `${decimalFormatter.format(averageLoansPerMember)} işlem/üye`,
        detail: `Aktif üye başına ${decimalFormatter.format(averageLoansPerBorrower)} işlem`,
      },
    ];
  }, [stats.books, inventoryStats, loanBreakdown, loanInsights, totalMembers]);

  const maxBorrowCount = useMemo(() => topBorrowers.reduce((max, item) => Math.max(max, item.total), 0), [topBorrowers]);
  const hasTrendData = useMemo(() => loanTrend.some(item => item.loans > 0 || item.returns > 0), [loanTrend]);

  const loanStatusSegments = useMemo(() => {
    const onTimeActive = Math.max(loanBreakdown.active - loanBreakdown.openOverdue, 0);
    const overdueActive = Math.max(loanBreakdown.openOverdue, 0);
    const onTimeReturned = Math.max(loanBreakdown.returned - loanBreakdown.closedOverdue, 0);
    const lateReturned = Math.max(loanBreakdown.closedOverdue, 0);

    return [
      { label: 'Aktif', value: onTimeActive, color: '#6366F1' },
      { label: 'Gecikmede', value: overdueActive, color: '#F97316' },
      { label: 'Zamanında İade', value: onTimeReturned, color: '#22C55E' },
      { label: 'Gecikmeli İade', value: lateReturned, color: '#FACC15' },
    ];
  }, [
    loanBreakdown.active,
    loanBreakdown.openOverdue,
    loanBreakdown.returned,
    loanBreakdown.closedOverdue,
  ]);

  const inventoryDistributionSegments = useMemo(() => {
    const available = Math.max(inventoryStats.availableCopies, 0);
    const loaned = Math.max(inventoryStats.loanedCopies, 0);
    const total = Math.max(inventoryStats.totalCopies, 0);
    const remainder = Math.max(total - (available + loaned), 0);

    const segments = [
      { label: 'Mevcut', value: available, color: '#22C55E' },
      { label: 'Ödünçte', value: loaned, color: '#6366F1' },
    ];

    if (remainder > 0) {
      segments.push({ label: 'Diğer', value: remainder, color: '#0EA5E9' });
    }

    return segments;
  }, [
    inventoryStats.availableCopies,
    inventoryStats.loanedCopies,
    inventoryStats.totalCopies,
  ]);

  const memberStatusSegments = useMemo(() => {
    const active = Math.max(loanInsights.activeMembers, 0);
    const borrowers = Math.max(loanInsights.borrowers, 0);
    const total = Math.max(totalMembers, 0);
    const pastBorrowers = Math.max(borrowers - active, 0);
    const inactive = Math.max(total - borrowers, 0);

    return [
      { label: 'Aktif Ödünçlü', value: active, color: '#6366F1' },
      { label: 'İşlem Yapmış', value: pastBorrowers, color: '#8B5CF6' },
      { label: 'Pasif Üye', value: inactive, color: '#CBD5F5' },
    ];
  }, [
    loanInsights.activeMembers,
    loanInsights.borrowers,
    totalMembers,
  ]);

  const categoryChartSegments = useMemo(() => {
    if (!categoryStats.length) return [];
    return categoryStats.map((item, index) => ({
      label: item.category,
      value: item.count,
      color: CHART_COLOR_SEQUENCE[index % CHART_COLOR_SEQUENCE.length],
    }));
  }, [categoryStats]);

  const categoryTotalCount = useMemo(() => categoryChartSegments.reduce((sum, item) => sum + item.value, 0), [categoryChartSegments]);

  const highlightedLoanSegment = loanSegmentHighlight !== null ? (loanStatusSegments[loanSegmentHighlight] ?? null) : null;
  const highlightedInventorySegment = inventorySegmentHighlight !== null ? (inventoryDistributionSegments[inventorySegmentHighlight] ?? null) : null;
  const highlightedMemberSegment = memberSegmentHighlight !== null ? (memberStatusSegments[memberSegmentHighlight] ?? null) : null;
  const highlightedCategorySegment = categorySegmentHighlight !== null ? (categoryChartSegments[categorySegmentHighlight] ?? null) : null;

  useEffect(() => {
    if (activeTab !== 'charts') return;
    const pickDominantIndex = segments => {
      if (!segments.length) return null;
      let bestIndex = 0;
      for (let i = 1; i < segments.length; i += 1) {
        if ((segments[i]?.value ?? 0) > (segments[bestIndex]?.value ?? 0)) {
          bestIndex = i;
        }
      }
      return bestIndex;
    };

    if (loanSegmentHighlight === null) {
      const idx = pickDominantIndex(loanStatusSegments);
      if (idx !== null) setLoanSegmentHighlight(idx);
    }
    if (inventorySegmentHighlight === null) {
      const idx = pickDominantIndex(inventoryDistributionSegments);
      if (idx !== null) setInventorySegmentHighlight(idx);
    }
    if (memberSegmentHighlight === null) {
      const idx = pickDominantIndex(memberStatusSegments);
      if (idx !== null) setMemberSegmentHighlight(idx);
    }
    if (categorySegmentHighlight === null) {
      const idx = pickDominantIndex(categoryChartSegments);
      if (idx !== null) setCategorySegmentHighlight(idx);
    }
  }, [
    activeTab,
    loanStatusSegments,
    loanSegmentHighlight,
    inventoryDistributionSegments,
    inventorySegmentHighlight,
    memberStatusSegments,
    memberSegmentHighlight,
    categoryChartSegments,
    categorySegmentHighlight,
  ]);

  const heatMapData = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    loansData.forEach(loan => {
      const loanDate = parseDate(loan.loan_date);
      if (!loanDate) return;
      const day = (loanDate.getDay() + 6) % 7; // Pazartesi=0
      const hour = loanDate.getHours();
      matrix[day][hour]++;
    });
    return matrix;
  }, [loansData]);

  const timeSeriesData = useMemo(() => {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    const currentYearCounts = new Array(12).fill(0);
    const lastYearCounts = new Array(12).fill(0);

    loansData.forEach(loan => {
      const date = parseDate(loan.loan_date);
      if (!date) return;

      const year = date.getFullYear();
      const month = date.getMonth();

      if (year === currentYear) {
        currentYearCounts[month]++;
      } else if (year === lastYear) {
        lastYearCounts[month]++;
      }
    });

    return {
      labels: months,
      datasets: [
        {
          label: `${currentYear} Ödünç`,
          data: currentYearCounts,
          borderColor: '#0EA5E9', // Sky 500
          backgroundColor: 'rgba(14, 165, 233, 0.1)',
          fill: true,
        },
        {
          label: `${lastYear} Ödünç`,
          data: lastYearCounts,
          borderColor: '#94A3B8', // Slate 400
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          fill: false,
        }
      ]
    };
  }, [loansData]);

  const correlationData = useMemo(() => {
    // 1. Her üyenin ödünç aldığı kitapların kategorilerini topla
    const memberCategories = {};
    loansData.forEach(loan => {
      if (!loan.member_name || !loan.category) return;
      if (!memberCategories[loan.member_name]) {
        memberCategories[loan.member_name] = new Set();
      }
      memberCategories[loan.member_name].add(loan.category);
    });

    // 2. En popüler 8 kategoriyi seç (matris çok büyümesin diye)
    const categoryCounts = {};
    loansData.forEach(loan => {
      if (!loan.category) return;
      categoryCounts[loan.category] = (categoryCounts[loan.category] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(entry => entry[0]);

    // 3. Korelasyonları hesapla (Birlikte görülme sıklığı)
    const correlations = [];

    for (let i = 0; i < topCategories.length; i++) {
      for (let j = i + 1; j < topCategories.length; j++) {
        const cat1 = topCategories[i];
        const cat2 = topCategories[j];

        let intersection = 0;
        let union = 0;

        Object.values(memberCategories).forEach(categories => {
          const hasCat1 = categories.has(cat1);
          const hasCat2 = categories.has(cat2);

          if (hasCat1 || hasCat2) union++;
          if (hasCat1 && hasCat2) intersection++;
        });

        // Jaccard similarity index
        const value = union === 0 ? 0 : intersection / union;

        correlations.push({
          category1: cat1,
          category2: cat2,
          value: value
        });
      }
    }

    return {
      categories: topCategories,
      data: correlations
    };
  }, [loansData]);

  const shelfData = useMemo(() => {
    const shelves = {};

    // Kitap verilerinden raf bilgilerini topla
    // Not: booksData henüz Statistics componentine prop olarak gelmiyor olabilir, 
    // bu yüzden mevcut inventoryStats veya loansData üzerinden çıkarım yapacağız
    // Veya booksData'yı fetch etmemiz gerekebilir.
    // Şimdilik loansData üzerinden ödünç alınan kitapların raf bilgilerini simüle edelim
    // Gerçek uygulamada books tablosundan tüm raf bilgilerini çekmek daha doğru olur.

    // Simülasyon verisi (Gerçek veri yapısına göre güncellenmeli)
    // Eğer booksData varsa onu kullanalım, yoksa mock data

    if (booksData && booksData.length > 0) {
      booksData.forEach(book => {
        if (book.shelf) {
          const shelfId = book.shelf.trim().toUpperCase();
          if (!shelves[shelfId]) {
            shelves[shelfId] = { total: 0, capacity: 50 }; // Varsayılan kapasite
          }
          shelves[shelfId].total += 1;
        }
      });
    } else {
      // Mock data for demonstration if no book data available
      ['A-1', 'A-2', 'A-3', 'B-1', 'B-2', 'C-1', 'C-2', 'D-1'].forEach(id => {
        shelves[id] = {
          shelf: id,
          total: Math.floor(Math.random() * 50),
          capacity: 50
        };
      });
    }

    return Object.entries(shelves).map(([shelf, data]) => ({
      shelf,
      total: data.total,
      capacity: data.capacity
    }));
  }, [booksData]);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-50 via-slate-50 to-white pointer-events-none" />
        <div className="relative">
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">İstatistikler</h1>
          <p className="text-slate-600">Kütüphane istatistikleri ve özet bilgiler</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { id: 'overview', label: 'Tablo Görünümü' },
              { id: 'charts', label: 'Grafik Görünümü' },
              { id: 'heatmap', label: '🔥 Isı Haritası' },
              { id: 'timeseries', label: '📈 Zaman Analizi' },
              { id: 'correlation', label: '🔗 İlişki Matrisi' },
              { id: 'shelfmap', label: '🏢 Raf Haritası' },
            ].map(tab => {
              const baseClasses = 'px-4 py-2 rounded-full text-sm font-semibold transition border';
              const activeClasses = 'bg-indigo-600 border-indigo-600 text-white shadow-sm';
              const inactiveClasses = 'bg-white/80 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`${baseClasses} ${activeTab === tab.id ? activeClasses : inactiveClasses}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="relative">
        <div
          className={getTabPanelClasses(activeTab === 'overview')}
          aria-hidden={activeTab !== 'overview'}
        >
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>📚</span>
              Genel İstatistikler
            </h2>
            {loading ? (
              <div className="text-slate-500 py-4">Yükleniyor...</div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full text-sm">
                  <tbody>
                    {generalSummary.map(row => (
                      <tr key={row.label} className="border-b last:border-0 border-slate-100">
                        <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">{row.label}</th>
                        <td className="py-3 pr-4 text-lg font-semibold text-slate-900 whitespace-nowrap">{row.value}</td>
                        <td className="py-3 text-slate-600">{row.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>⏱️</span>
              Güncel İşlem Durumu
            </h2>
            {loading ? (
              <div className="text-slate-500 py-4">Yükleniyor...</div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">Bugün başlatılan ödünç</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.todayLoans)}</td>
                      <td className="py-3 text-slate-600">
                        Tüm işlemlerin {formatPercent(percentOf(loanInsights.todayLoans, loanBreakdown.total))}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">Bugün tamamlanan iadeler</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.todayReturns)}</td>
                      <td className="py-3 text-slate-600">
                        Tüm iadelerin {formatPercent(percentOf(loanInsights.todayReturns, loanBreakdown.returned))} kadarı bugün tamamlandı
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">Bu hafta başlatılan ödünç</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.weekLoans)}</td>
                      <td className="py-3 text-slate-600">
                        Haftalık toplamın {formatPercent(percentOf(loanInsights.weekLoans, loanBreakdown.total))}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">Bu hafta tamamlanan iadeler</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.weekReturns)}</td>
                      <td className="py-3 text-slate-600">
                        İade edilenlerin {formatPercent(percentOf(loanInsights.weekReturns, loanBreakdown.returned))} kadarı bu hafta
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">Bugün vadesi dolan</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.dueToday)}</td>
                      <td className="py-3 text-slate-600">
                        Aktif işlemlerin {formatPercent(percentOf(loanInsights.dueToday, loanBreakdown.active))} kadarı bugün teslim
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">3 gün içinde vadesi dolacak</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.dueSoon)}</td>
                      <td className="py-3 text-slate-600">
                        Açık işlemlerin {formatPercent(percentOf(loanInsights.dueSoon, loanBreakdown.active))} için hatırlatma gerekebilir
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">Aktif ödünçlü üye</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.activeMembers)}</td>
                      <td className="py-3 text-slate-600">
                        Tüm üyelerin {formatPercent(percentOf(loanInsights.activeMembers, totalMembers))} kadarı şu an kitap tutuyor
                      </td>
                    </tr>
                    <tr>
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-slate-500">İşlem yapmış toplam üye</th>
                      <td className="py-3 pr-4 text-lg font-semibold text-slate-900">{formatInteger(loanInsights.borrowers)}</td>
                      <td className="py-3 text-slate-600">
                        Üye başına ortalama {decimalFormatter.format(loanInsights.borrowers ? loanBreakdown.total / loanInsights.borrowers : 0)} işlem
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>📦</span>
                Envanter Özeti
              </h2>
              {loading ? (
                <div className="text-slate-500 py-2">Yükleniyor...</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="text-xs uppercase text-slate-500 font-semibold">Toplam Kopya</div>
                      <div className="text-2xl font-semibold text-slate-900 mt-1">{formatInteger(inventoryStats.totalCopies)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="text-xs uppercase text-slate-500 font-semibold">Mevcut Kopya</div>
                      <div className="text-2xl font-semibold text-emerald-600 mt-1">{formatInteger(inventoryStats.availableCopies)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="text-xs uppercase text-slate-500 font-semibold">Ödünçte</div>
                      <div className="text-2xl font-semibold text-slate-900 mt-1">{formatInteger(inventoryStats.loanedCopies)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mt-4">
                    <div className="p-4 rounded-xl border border-slate-100">
                      <div className="text-xs uppercase text-slate-500 font-semibold">Kategori Çeşitliliği</div>
                      <div className="text-2xl font-semibold text-slate-900 mt-1">{formatInteger(inventoryStats.uniqueCategories)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100">
                      <div className="text-xs uppercase text-slate-500 font-semibold">Yazar Çeşitliliği</div>
                      <div className="text-2xl font-semibold text-slate-900 mt-1">{formatInteger(inventoryStats.uniqueAuthors)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100">
                      <div className="text-xs uppercase text-slate-500 font-semibold">Dil Çeşitliliği</div>
                      <div className="text-2xl font-semibold text-slate-900 mt-1">{formatInteger(inventoryStats.distinctLanguages)}</div>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs uppercase font-semibold text-slate-500">
                      <span>Mevcut / Stok Oranı</span>
                      <span className="text-slate-900">{formatPercent(inventoryStats.availabilityRate)}</span>
                    </div>
                    <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.max(0, Math.min(100, inventoryStats.availabilityRate || 0))}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>📊</span>
                Ödünç Alma Analizi
              </h2>
              {loading ? (
                <div className="text-slate-500 py-2">Yükleniyor...</div>
              ) : loanBreakdown.total === 0 ? (
                <div className="text-slate-400 py-2">Henüz işlem yok</div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-4 rounded-xl border border-slate-100 bg-indigo-50">
                      <div className="text-xs uppercase text-indigo-600 font-semibold">Aktif</div>
                      <div className="text-xl font-semibold text-slate-900 mt-1">{formatInteger(loanBreakdown.active)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 bg-emerald-50">
                      <div className="text-xs uppercase text-emerald-600 font-semibold">İade</div>
                      <div className="text-xl font-semibold text-slate-900 mt-1">{formatInteger(loanBreakdown.returned)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 bg-rose-50">
                      <div className="text-xs uppercase text-rose-600 font-semibold">Açık Gecikme</div>
                      <div className="text-xl font-semibold text-slate-900 mt-1">{formatInteger(loanBreakdown.openOverdue)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 bg-amber-50">
                      <div className="text-xs uppercase text-amber-600 font-semibold">Gecikmeli İade</div>
                      <div className="text-xl font-semibold text-slate-900 mt-1">{formatInteger(loanBreakdown.closedOverdue)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs uppercase text-slate-500 font-semibold">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div>İade Oranı</div>
                      <div className="text-lg font-semibold text-emerald-600 mt-1">{formatPercent(loanBreakdown.returnRate)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div>Gecikme Oranı</div>
                      <div className="text-lg font-semibold text-rose-600 mt-1">{formatPercent(loanBreakdown.overdueRate)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 col-span-2 sm:col-span-1">
                      <div>Ort. Ödünç Süresi</div>
                      <div className="text-lg font-semibold text-slate-900 mt-1">{formatDays(loanBreakdown.avgLoanDuration)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 col-span-2 sm:col-span-1">
                      <div>Ort. Gecikme</div>
                      <div className="text-lg font-semibold text-slate-900 mt-1">{formatDays(loanBreakdown.avgOverdueDuration)}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Aktif Ödünç', value: loanBreakdown.active, color: 'bg-indigo-500' },
                      { label: 'İade Edilen', value: loanBreakdown.returned, color: 'bg-emerald-500' },
                      { label: 'Açık Gecikme', value: loanBreakdown.openOverdue, color: 'bg-rose-500' },
                      { label: 'Gecikmeli İade', value: loanBreakdown.closedOverdue, color: 'bg-amber-500' },
                    ].map(row => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-xs uppercase text-slate-500 font-semibold">
                          <span>{row.label}</span>
                          <span className="text-slate-900">{formatInteger(row.value)}</span>
                        </div>
                        <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${row.color}`} style={{ width: `${percentOf(row.value, loanBreakdown.total)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>📆</span>
                Aylık Ödünç Trendleri
              </h2>
              {loading ? (
                <div className="text-slate-500 py-2">Yükleniyor...</div>
              ) : !hasTrendData ? (
                <div className="text-slate-400 py-2">Henüz veri yok</div>
              ) : (
                <div className="overflow-x-auto">
                  <LoanTrendChart data={loanTrend} />
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🧑‍🤝‍🧑</span>
                En Aktif Üyeler
              </h2>
              {loading ? (
                <div className="text-slate-500 py-2">Yükleniyor...</div>
              ) : topBorrowers.length === 0 ? (
                <div className="text-slate-400 py-2">Henüz veri yok</div>
              ) : (
                <div className="space-y-3">
                  {topBorrowers.map((member, index) => (
                    <div key={member.memberId} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{index + 1}. {member.name}</div>
                          <div className="text-xs text-slate-500 mt-1">Sınıf: {member.grade}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-slate-900">{formatInteger(member.total)} kez</div>
                          <div className="text-xs text-slate-500">Aktif {formatInteger(member.active)} · Gecikme {formatInteger(member.overdue)}</div>
                        </div>
                      </div>
                      <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${maxBorrowCount ? (member.total / maxBorrowCount) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🗂️</span>
                Kategori Dağılımı
              </h2>
              {loading ? (
                <div className="text-slate-500 py-2">Yükleniyor...</div>
              ) : categoryStats.length === 0 ? (
                <div className="text-slate-400 py-2">Henüz veri yok</div>
              ) : (
                <div className="space-y-3">
                  {categoryStats.map(item => (
                    <div key={item.category}>
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span className="font-medium text-slate-700">{item.category}</span>
                        <span className="text-xs text-slate-500">
                          {formatInteger(item.count)} kitap · {formatPercent(item.percent)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🕘</span>
                Son İşlemler
              </h2>
              {loading ? (
                <div className="text-slate-500 py-2">Yükleniyor...</div>
              ) : recentLoans.length === 0 ? (
                <div className="text-slate-400 py-2">Henüz veri yok</div>
              ) : (
                <div className="space-y-3">
                  {recentLoans.map(loan => (
                    <div key={loan.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-800">{loan.title}</div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_STYLES[loan.status]}`}>
                          {STATUS_LABELS[loan.status]}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Üye: {loan.member}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        Ödünç: {loan.loanDate} · Son Tarih: {loan.dueDate}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>📈</span>
              En Çok Ödünç Alınanlar
            </h2>
            {loading ? (
              <div className="text-slate-500 py-4">Yükleniyor...</div>
            ) : popular.length === 0 ? (
              <div className="text-slate-400 py-4">Henüz veri yok</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {popular.slice(0, 10).map((p, i) => (
                  <div
                    key={`${p.title}-${i}`}
                    className="flex justify-between items-center p-4 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer border border-slate-100"
                    onClick={() => navigate('/app/books', { state: { searchQuery: p.title } })}
                  >
                    <span className="text-base text-slate-700 flex-1 truncate pr-2 font-medium">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-sm font-bold mr-3">
                        {i + 1}
                      </span>
                      {p.title}
                    </span>
                    <span className="text-base font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full whitespace-nowrap">
                      {formatInteger(p.loan_count)} kez
                    </span>
                  </div>
                ))}
              </div>
            )}
            {popular.length > 0 && (
              <button
                onClick={() => navigate('/app/reports')}
                className="mt-6 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Tüm raporları görüntüle →
              </button>
            )}
          </section>
        </div>

        <div
          className={getTabPanelClasses(activeTab === 'charts')}
          aria-hidden={activeTab !== 'charts'}
        >
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <span>📊</span>
              Ödünç İşlemi Dağılımı
            </h2>
            {loading ? (
              <div className="text-slate-500 py-4">Yükleniyor...</div>
            ) : loanBreakdown.total === 0 ? (
              <div className="text-slate-400 py-4 text-sm">Henüz veri yok</div>
            ) : (
              <div className="grid gap-8 md:grid-cols-[auto,1fr] items-center">
                <DonutChart
                  segments={loanStatusSegments}
                  highlightedIndex={loanSegmentHighlight}
                  onSegmentHover={setLoanSegmentHighlight}
                >
                  {highlightedLoanSegment ? (
                    <>
                      <span className="text-xs uppercase font-semibold tracking-wide" style={{ color: highlightedLoanSegment.color }}>
                        {highlightedLoanSegment.label}
                      </span>
                      <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(highlightedLoanSegment.value)}</span>
                      <span className="text-xs text-slate-500 mt-1">
                        {formatPercent(percentOf(highlightedLoanSegment.value, loanBreakdown.total))} pay
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs uppercase font-semibold tracking-wide text-slate-500">Toplam İşlem</span>
                      <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(loanBreakdown.total)}</span>
                      <span className="text-xs text-slate-500 mt-1">İade oranı {formatPercent(loanBreakdown.returnRate)}</span>
                    </>
                  )}
                </DonutChart>
                <div className="space-y-6">
                  <ChartLegend
                    segments={loanStatusSegments}
                    total={loanBreakdown.total}
                    activeIndex={highlightedLoanSegment ? loanSegmentHighlight : null}
                    onHover={setLoanSegmentHighlight}
                  />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-emerald-50">
                      <div className="text-xs uppercase font-semibold text-emerald-700">Zamanında İade</div>
                      <div className="text-lg font-semibold text-emerald-600 mt-1">{formatPercent(loanBreakdown.returnRate)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50">
                      <div className="text-xs uppercase font-semibold text-amber-700">Gecikme Oranı</div>
                      <div className="text-lg font-semibold text-amber-600 mt-1">{formatPercent(loanBreakdown.overdueRate)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <span>📦</span>
                Envanter Durumu
              </h2>
              {loading ? (
                <div className="text-slate-500 py-4">Yükleniyor...</div>
              ) : inventoryStats.totalCopies === 0 ? (
                <div className="text-slate-400 py-4 text-sm">Henüz veri yok</div>
              ) : (
                <div className="grid gap-6 md:grid-cols-[auto,1fr] items-center">
                  <DonutChart
                    segments={inventoryDistributionSegments}
                    highlightedIndex={inventorySegmentHighlight}
                    onSegmentHover={setInventorySegmentHighlight}
                  >
                    {highlightedInventorySegment ? (
                      <>
                        <span className="text-xs uppercase font-semibold tracking-wide" style={{ color: highlightedInventorySegment.color }}>
                          {highlightedInventorySegment.label}
                        </span>
                        <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(highlightedInventorySegment.value)}</span>
                        <span className="text-xs text-slate-500 mt-1">
                          {formatPercent(percentOf(highlightedInventorySegment.value, inventoryStats.totalCopies))} pay
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs uppercase font-semibold text-slate-500">Toplam Kopya</span>
                        <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(inventoryStats.totalCopies)}</span>
                        <span className="text-xs text-emerald-600 mt-1">Ulaşılabilirlik {formatPercent(inventoryStats.availabilityRate)}</span>
                      </>
                    )}
                  </DonutChart>
                  <ChartLegend
                    segments={inventoryDistributionSegments}
                    total={inventoryStats.totalCopies}
                    activeIndex={highlightedInventorySegment ? inventorySegmentHighlight : null}
                    onHover={setInventorySegmentHighlight}
                  />
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <span>🧑‍🤝‍🧑</span>
                Üye Aktivitesi
              </h2>
              {loading ? (
                <div className="text-slate-500 py-4">Yükleniyor...</div>
              ) : totalMembers === 0 ? (
                <div className="text-slate-400 py-4 text-sm">Henüz veri yok</div>
              ) : (
                <div className="grid gap-6 md:grid-cols-[auto,1fr] items-center">
                  <DonutChart
                    segments={memberStatusSegments}
                    size={200}
                    thickness={52}
                    highlightedIndex={memberSegmentHighlight}
                    onSegmentHover={setMemberSegmentHighlight}
                  >
                    {highlightedMemberSegment ? (
                      <>
                        <span className="text-xs uppercase font-semibold tracking-wide" style={{ color: highlightedMemberSegment.color }}>
                          {highlightedMemberSegment.label}
                        </span>
                        <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(highlightedMemberSegment.value)}</span>
                        <span className="text-xs text-slate-500 mt-1">
                          {formatPercent(percentOf(highlightedMemberSegment.value, totalMembers))} pay
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs uppercase font-semibold text-slate-500">Toplam Üye</span>
                        <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(totalMembers)}</span>
                        <span className="text-xs text-indigo-600 mt-1">Aktif {formatPercent(percentOf(loanInsights.activeMembers, totalMembers))}</span>
                      </>
                    )}
                  </DonutChart>
                  <ChartLegend
                    segments={memberStatusSegments}
                    total={totalMembers}
                    activeIndex={highlightedMemberSegment ? memberSegmentHighlight : null}
                    onHover={setMemberSegmentHighlight}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <span>📅</span>
              Aylık Ödünç Grafiği
            </h2>
            {loading ? (
              <div className="text-slate-500 py-4">Yükleniyor...</div>
            ) : !hasTrendData ? (
              <div className="text-slate-400 py-4 text-sm">Henüz veri yok</div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <LoanTrendChart data={loanTrend} />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex w-3 h-3 rounded-full bg-sky-500" />
                    <span>Ödünç</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex w-3 h-3 rounded-full bg-emerald-500" />
                    <span>İade</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <span>🗂️</span>
              Kategori Grafiği
            </h2>
            {loading ? (
              <div className="text-slate-500 py-4">Yükleniyor...</div>
            ) : categoryChartSegments.length === 0 ? (
              <div className="text-slate-400 py-4 text-sm">Henüz veri yok</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-[auto,1fr] items-center">
                <DonutChart
                  segments={categoryChartSegments}
                  size={240}
                  thickness={60}
                  highlightedIndex={categorySegmentHighlight}
                  onSegmentHover={setCategorySegmentHighlight}
                >
                  {highlightedCategorySegment ? (
                    <>
                      <span className="text-xs uppercase font-semibold tracking-wide" style={{ color: highlightedCategorySegment.color }}>
                        {highlightedCategorySegment.label}
                      </span>
                      <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(highlightedCategorySegment.value)}</span>
                      <span className="text-xs text-slate-500 mt-1">
                        {formatPercent(percentOf(highlightedCategorySegment.value, categoryTotalCount))} pay
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs uppercase font-semibold text-slate-500">Toplam Kitap</span>
                      <span className="text-3xl font-semibold text-slate-900 mt-2">{formatInteger(categoryTotalCount)}</span>
                      <span className="text-xs text-slate-500 mt-1">En popüler {categoryChartSegments[0]?.label || '—'}</span>
                    </>
                  )}
                </DonutChart>
                <ChartLegend
                  segments={categoryChartSegments}
                  total={categoryTotalCount}
                  activeIndex={highlightedCategorySegment ? categorySegmentHighlight : null}
                  onHover={setCategorySegmentHighlight}
                />
              </div>
            )}
          </section>
        </div>

        <div
          className={getTabPanelClasses(activeTab === 'heatmap')}
          aria-hidden={activeTab !== 'heatmap'}
        >
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Ödünç Alma Zamanlaması</h2>
              <p className="text-sm text-slate-500">Haftanın hangi gün ve saatlerinde kütüphanenin daha yoğun olduğunu gösterir.</p>
            </div>
            <HeatMap data={heatMapData} />
          </section>
        </div>

        <div
          className={getTabPanelClasses(activeTab === 'timeseries')}
          aria-hidden={activeTab !== 'timeseries'}
        >
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Aylık Ödünç Trendleri</h2>
              <p className="text-sm text-slate-500">Bu yıl ve geçen yılın aylık ödünç alma sayıları karşılaştırması.</p>
            </div>
            <TimeSeriesChart data={timeSeriesData} height={400} />
          </section>
        </div>

        <div
          className={getTabPanelClasses(activeTab === 'correlation')}
          aria-hidden={activeTab !== 'correlation'}
        >
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-x-auto">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Kategori İlişkileri</h2>
              <p className="text-sm text-slate-500">Hangi kitap kategorilerinin aynı üyeler tarafından birlikte okunduğunu gösterir.</p>
            </div>
            {correlationData.categories.length > 1 ? (
              <CorrelationMatrix
                data={correlationData.data}
                categories={correlationData.categories}
              />
            ) : (
              <div className="text-slate-500 py-8 text-center">
                Yeterli veri bulunmuyor. İlişki analizi için daha fazla ödünç işlemi gerekiyor.
              </div>
            )}
          </section>
        </div>


      </div>
    </div>
  );
}


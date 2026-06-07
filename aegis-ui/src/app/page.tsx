'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getDashboardData } from './actions';
import MouseTrail from './components/MouseTrail';

type DashboardStats = {
  agents?: number;
  audits?: number;
  successfulAudits?: number;
  failedAudits?: number;
  successfulVolumeUsdc?: number | string;
  vaultTvlUsdc?: string;
  aegisTvlUsdc?: string;
  synthraTvlUsdc?: string;
  vaultApy?: number;
};

type Theme = 'dark' | 'light';

type StatDetail = {
  left: { label: string; value: string; color?: string };
  right: { label: string; value: string; color?: string };
};

type StatCard = {
  label: string;
  value: string;
  icon: 'agents' | 'transactions' | 'vault' | 'usdc';
  subtitle?: string;
  detail?: StatDetail;
};

const skillUrl = 'https://api.aegisintent.xyz/SKILL.md';
const docsUrl = 'https://docs.aegisintent.xyz';

const displayFont = 'var(--font-display-family), var(--font-plus-jakarta), sans-serif';

const pipeline = [
  {
    step: '01',
    label: 'Connect',
    title: 'Integrate SKILL.md',
    body: 'Provide your AI agent with the public SKILL.md API resource instructions. The agent will parse platform rules, schemas, and action constraints to negotiate transactions natively.',
  },
  {
    step: '02',
    label: 'Authorize',
    title: 'Agent Authorization',
    body: 'Link agent access seamlessly through secure, temporary session tokens. Authorize wallets safely without exposing master private keys.',
  },
  {
    step: '03',
    label: 'Execute',
    title: 'Execute with Guardrails',
    body: 'Run transactions with complete confidence. The Aegis Policy Engine verifies every single action against your active rules, instantly rejecting unauthorized operations.',
  },
];

const capabilities = [
  {
    title: 'x402 payment execution',
    body: 'Agents can discover paid APIs, inspect payment requirements, and pay with USDC through a single guarded action.',
    tag: 'Marketplace',
  },
  {
    title: 'Wealth Sentinel',
    body: 'Background automation monitors limit orders and DCA schedules, then executes matching intents when conditions are met.',
    tag: 'Automation',
  },
  {
    title: 'Multi-yield allocation',
    body: 'Idle USDC can be split between the Aegis aUSDC Vault and Synthra V3 concentrated liquidity positions.',
    tag: 'Yield',
  },
  {
    title: 'Cross-chain liquidity',
    body: 'CCTP support lets agents bridge USDC across supported testnets while keeping policy checks in front of execution.',
    tag: 'CCTP',
  },
];

const policyRows = [
  { field: 'perTxLimitUsdc', limit: '$10,000.00', scope: 'Enforced on every transaction action request.' },
  { field: 'dailyLimitUsdc', limit: '$50,000.00', scope: 'Rolling 24-hour aggregate volume control.' },
  { field: 'weeklyLimitUsdc', limit: '$200,000.00', scope: 'Rolling 7-day aggregate volume control.' },
  { field: 'monthlyLimitUsdc', limit: '$500,000.00', scope: 'Rolling 30-day aggregate volume control.' },
];

const executionRoute = ['Auth', 'Idempotency', 'Policy', 'Circle DCW', 'Audit'];

function formatNumber(value: number | string | undefined) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCurrency(value: number | string | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Icon({
  name,
  className,
}: {
  name:
    | 'sun'
    | 'moon'
    | 'copy'
    | 'external'
    | 'agents'
    | 'transactions'
    | 'vault'
    | 'usdc'
    | 'chevron';
  className?: string;
}) {
  const paths: Record<string, string> = {
    sun: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z',
    moon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
    copy: 'M8 8h10v12H8z M6 16H4V4h12v2',
    external: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
    agents: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    transactions: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    vault: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    usdc: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    chevron: 'M9 5l7 7-7 7',
  };

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={paths[name]} />
    </svg>
  );
}

export default function PublicLandingPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('aegis-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      window.setTimeout(() => setTheme(savedTheme), 0);
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const statsRes = await getDashboardData();
        if (statsRes.success) {
          setStats(statsRes.dashboard);
        }
      } catch (err: unknown) {
        console.error('Failed to load public stats:', err);
        setError('Live connection to Aegis Wealth Engine backend is currently establishing.');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const isDark = theme === 'dark';

  const s = {
    page: isDark
      ? 'min-h-screen bg-[#050507] text-[#FAFBFD] selection:bg-[#00F396] selection:text-[#050507]'
      : 'min-h-screen bg-[#FAFBFD] text-[#1E2026] selection:bg-[#00C278] selection:text-white',
    surface: isDark
      ? 'border-[#1C1D24] bg-[#0D0E12]'
      : 'border-[#E2E4E9] bg-white',
    softSurface: isDark
      ? 'border-[#1C1D24] bg-[#07080A]'
      : 'border-[#E2E4E9] bg-[#F8F9FA]',
    text: isDark ? 'text-[#FAFBFD]' : 'text-[#1E2026]',
    muted: isDark ? 'text-[#8F94A6]' : 'text-[#5C6170]',
    faint: isDark ? 'text-[#606578]' : 'text-[#8A91A3]',
    accent: isDark ? 'text-[#00F396]' : 'text-[#00A360]',
    accentGlow: isDark
      ? 'text-[#00F396] drop-shadow-[0_0_40px_rgba(0,243,150,0.2)]'
      : 'text-[#00A360]',
    accentBg: isDark
      ? 'bg-[#00F396]/10 text-[#00F396]'
      : 'bg-[#00C278]/10 text-[#00A360]',
    neutralBg: isDark
      ? 'bg-[#1C1D24] text-[#FAFBFD]'
      : 'bg-[#E2E4E9] text-[#1E2026]',
    border: isDark ? 'border-[#1C1D24]' : 'border-[#E2E4E9]',
    divider: isDark ? 'bg-[#1C1D24]' : 'bg-[#E2E4E9]',
    dividerHover: isDark
      ? 'group-hover:bg-[#2C2E3B]'
      : 'group-hover:bg-[#C8CDD6]',
    buttonPrimary: isDark
      ? 'bg-[#00F396] text-[#050507] hover:bg-[#4BFFB9]'
      : 'bg-[#00A360] text-white hover:bg-[#00C278]',
    buttonSecondary: isDark
      ? 'border-[#1C1D24] bg-[#0D0E12] text-[#FAFBFD] hover:border-[#2C2E3B]'
      : 'border-[#E2E4E9] bg-white text-[#1E2026] hover:border-[#C8CDD6]',
    navLink: isDark
      ? 'text-[#8F94A6] hover:text-white'
      : 'text-[#5C6170] hover:text-[#0F1115]',
    tableCellBadge: isDark
      ? 'bg-[#0A2A1E] text-[#00F396]'
      : 'bg-[#E6F9F0] text-[#00A360]',
    cardHover: isDark
      ? 'hover:border-[#2C2E3B] hover:-translate-y-1 hover:shadow-2xl'
      : 'hover:border-[#C8CDD6] hover:-translate-y-1 hover:shadow-lg',
    glowBlob: isDark
      ? 'bg-white/[0.02] group-hover:bg-white/[0.04]'
      : 'bg-black/[0.02] group-hover:bg-black/[0.04]',
    statGlowBlob: isDark
      ? 'bg-white/[0.02] group-hover:bg-white/[0.06]'
      : 'bg-black/[0.02] group-hover:bg-black/[0.05]',
    routeDotInactive: isDark ? 'bg-[#2C2E3B]' : 'bg-[#C8CDD6]',
    routeDotActive: isDark ? 'bg-[#00F396]' : 'bg-[#00A360]',
    tagBar: isDark ? 'bg-[#2C2E3B]' : 'bg-[#C8CDD6]',
  };

  const statCards: StatCard[] = [
    {
      label: 'Connected Fleet Agents',
      value: formatNumber(stats?.agents),
      icon: 'agents',
    },
    {
      label: 'Transactions Processed',
      value: formatNumber(stats?.successfulAudits),
      detail: {
        left: { label: 'Total Audits', value: formatNumber(stats?.audits) },
        right: { label: 'Rejected', value: formatNumber(stats?.failedAudits), color: 'text-[#ef4444]' },
      },
      icon: 'transactions',
    },
    {
      label: 'Multi Yield TVL',
      subtitle: stats?.vaultApy !== undefined ? `APY: ${stats.vaultApy.toFixed(2)}%` : undefined,
      value: formatCurrency(stats?.vaultTvlUsdc),
      detail: {
        left: { label: 'Aegis aUSDC', value: formatCurrency(stats?.aegisTvlUsdc) },
        right: { label: 'Synthra V3', value: formatCurrency(stats?.synthraTvlUsdc) },
      },
      icon: 'vault',
    },
    {
      label: 'Processed Volume (USDC)',
      value: formatCurrency(stats?.successfulVolumeUsdc),
      icon: 'usdc',
    },
  ];

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('aegis-theme', nextTheme);
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <main className={`${s.page} overflow-x-hidden transition-colors duration-300 noise-overlay`}>
      <MouseTrail />
      <div
        className={`pointer-events-none fixed inset-0 ${
          isDark
            ? 'bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)]'
            : 'bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)]'
        } bg-size-[48px_48px]`}
      />
      <div
        className={`pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] max-w-[100vw] h-[500px] bg-linear-to-b ${
          isDark ? 'from-white/[0.02]' : 'from-black/[0.01]'
        } to-transparent rounded-full blur-[120px]`}
      />
      <div
        className={`pointer-events-none absolute bottom-0 right-[10%] w-[600px] max-w-[100vw] h-[600px] bg-linear-to-tr ${
          isDark ? 'from-[#3b82f6]/[0.03]' : 'from-[#3b82f6]/[0.02]'
        } to-transparent rounded-full blur-[140px]`}
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 lg:py-16">
        <header className={`flex items-center justify-between border-b ${s.border} pb-6 animate-fade-in`}>
          <Link href="/" aria-label="Aegis home" className="flex items-center">
            <Image
              src="/logo/dark.svg"
              alt="Aegis"
              width={100}
              height={24}
              priority
              className={`h-6 w-auto object-contain transition-all duration-300 ${isDark ? '' : 'invert'}`}
            />
          </Link>

          <nav className="flex items-center gap-5">
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs font-bold font-mono tracking-[0.18em] uppercase transition-colors ${s.navLink}`}
            >
              Docs
            </a>
            <button
              onClick={toggleTheme}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer active:scale-95 ${s.buttonSecondary}`}
              aria-label="Toggle theme"
            >
              <Icon name={isDark ? 'sun' : 'moon'} className="h-4 w-4" />
            </button>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_520px] lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-6 animate-fade-up delay-100">
              <span className={`text-[10px] font-bold font-mono tracking-[0.25em] uppercase ${s.faint}`}>
                Autonomous Financial Operations Center
              </span>
            </div>

            <h1
              className="max-w-4xl text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.04] animate-fade-up delay-200"
              style={{ fontFamily: displayFont }}
            >
              <span className={s.text}>Aegis </span>
              <span className={s.accentGlow}>Wealth Engine</span>
            </h1>

            <p className={`mt-6 max-w-2xl text-sm sm:text-base leading-relaxed font-medium animate-fade-up delay-300 ${s.muted}`}>
              The secure control center for autonomous financial agents. Manage secure
              program wallets, track live audit trails, and enforce spending rules with
              complete administrative oversight.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row animate-fade-up delay-400">
              <button
                onClick={() => handleCopy(`get started on aegis: ${skillUrl}`, 'prompt')}
                className={`btn-glow inline-flex h-12 items-center justify-center gap-2.5 rounded-lg px-6 text-sm font-bold transition cursor-pointer active:scale-[0.97] ${s.buttonPrimary}`}
              >
                <Icon name="copy" className="h-4 w-4" />
                {copied === 'prompt' ? 'Prompt copied!' : 'Copy agent prompt'}
              </button>
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-6 text-sm font-bold transition active:scale-[0.97] ${s.buttonSecondary}`}
              >
                Read docs
                <Icon name="external" className="h-4 w-4" />
              </a>
            </div>

            <div className={`mt-7 rounded-lg border p-4 font-mono text-xs animate-fade-up delay-500 ${s.softSurface}`}>
              <div className={`mb-2 text-[10px] font-bold uppercase tracking-[0.16em] ${s.faint}`}>
                Agent system prompt
              </div>
              <div className={`break-all cursor-blink ${s.text}`}>
                get started on aegis:{' '}
                <span className={`${s.text} font-semibold`}>{skillUrl}</span>
              </div>
            </div>
          </div>

          <aside className={`rounded-2xl border console-border scanlines ${s.surface} shadow-2xl shadow-black/10 overflow-hidden animate-slide-in-right delay-300`}>
            <div className={`flex items-center justify-between border-b ${s.border} px-5 py-4`}>
              <div>
                <div className={`text-[10px] font-bold font-mono uppercase tracking-[0.18em] ${s.faint}`}>
                  Operations console
                </div>
                <h2 className={`mt-1 text-lg font-extrabold ${s.text}`} style={{ fontFamily: displayFont }}>
                  Fleet telemetry
                </h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold font-mono tracking-wider ${s.accentBg}`}>
                {loading ? 'SYNC' : error ? 'PREVIEW' : 'LIVE'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 relative z-10">
              {statCards.map((card, i) => (
                <div
                  key={card.label}
                  className={`stat-card rounded-lg border p-4 relative group overflow-hidden ${s.softSurface}`}
                  style={{ animationDelay: `${400 + i * 100}ms` }}
                >
                  <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl pointer-events-none transition-colors duration-500 ${s.statGlowBlob}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className={`text-[10px] font-bold uppercase tracking-[0.14em] font-mono ${s.faint}`}>
                        {card.label}
                      </span>
                      {card.subtitle && (
                        <span className={`text-[9px] font-bold tracking-wider font-mono ${s.faint}`}>
                          {card.subtitle}
                        </span>
                      )}
                    </div>
                    <Icon name={card.icon} className={`h-5 w-5 ${s.muted} opacity-80`} />
                  </div>
                  <div className={`mt-4 font-mono text-2xl font-black tracking-tight ${s.text}`}>
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-transparent border-t-[#00F396] rounded-full animate-spin" />
                    ) : (
                      card.value
                    )}
                  </div>
                  {card.detail && !loading && (
                    <div className={`flex justify-between text-[10px] font-mono border-t ${s.border} pt-2 mt-2`}>
                      <div className="flex flex-col">
                        <span className={s.faint}>{card.detail.left.label}</span>
                        <span className={`font-bold ${card.detail.left.color || s.text}`}>
                          {card.detail.left.value}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className={s.faint}>{card.detail.right.label}</span>
                        <span className={`font-bold ${card.detail.right.color || s.text}`}>
                          {card.detail.right.value}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className={`border-t ${s.border} p-4 relative z-10`}>
              <div className={`mb-3 text-[10px] font-bold font-mono uppercase tracking-[0.18em] ${s.faint}`}>
                Execution route
              </div>
              <div className="space-y-2">
                {executionRoute.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 group">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-black font-mono transition-all duration-200 group-hover:scale-110 ${s.neutralBg}`}
                    >
                      {index + 1}
                    </span>
                    <span className={`text-sm font-semibold ${s.text}`}>{step}</span>
                    <div className={`ml-auto flex items-center gap-1 text-[10px] font-mono ${index < 4 ? s.faint : s.text}`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${index < 4 ? s.routeDotInactive : s.routeDotActive}`} />
                      {index < 4 ? 'checked' : 'recorded'}
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className={`mt-4 text-xs font-mono ${s.muted}`}>{error}</p>}
            </div>
          </aside>
        </section>

        <section className={`border-y ${s.border} py-14`}>
          <div className="text-center mb-12">
            <span className={`text-[10px] font-bold tracking-[0.25em] font-mono uppercase mb-3 block ${s.text}`}>
              Quick Start Guide
            </span>
            <h2 className={`text-2xl lg:text-4xl font-extrabold ${s.text}`} style={{ fontFamily: displayFont }}>
              Three Steps to Secure Autonomy
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {pipeline.map((step) => (
              <div
                key={step.label}
                className={`group rounded-2xl border p-8 relative overflow-hidden transition-all duration-300 ${s.surface} ${s.cardHover}`}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-colors duration-700 ${s.glowBlob}`} />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-black font-mono ${s.neutralBg}`}>
                      {step.step}
                    </div>
                    <div className={`h-px flex-1 transition-colors duration-300 ${s.divider} ${s.dividerHover}`} />
                    <span className={`text-[9px] font-bold font-mono uppercase tracking-widest ${s.faint}`}>
                      {step.label}
                    </span>
                  </div>
                  <h3 className={`text-lg font-bold mb-3 ${s.text}`}>{step.title}</h3>
                  <p className={`text-xs leading-relaxed font-mono ${s.muted}`}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-10 py-14 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className={`text-[10px] font-bold font-mono tracking-[0.25em] uppercase ${s.text}`}>
              Product surface
            </div>
            <h2
              className={`mt-3 text-3xl lg:text-4xl font-extrabold leading-tight ${s.text}`}
              style={{ fontFamily: displayFont }}
            >
              Built for agents that move money.
            </h2>
            <p className={`mt-4 text-sm leading-7 ${s.muted}`}>
              Aegis is not a generic wallet dashboard. It is the policy, execution, and
              observability layer between an autonomous agent and onchain USDC actions.
            </p>
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-6 inline-flex items-center gap-1.5 text-sm font-bold transition-colors ${s.accent} hover:opacity-80`}
            >
              Explore capabilities
              <Icon name="chevron" className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className={`cap-card rounded-2xl border p-6 transition-all duration-300 ${s.surface} ${s.cardHover}`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className={`inline-block w-1 h-4 rounded-full ${s.tagBar}`} />
                  <span className={`text-[10px] font-bold font-mono uppercase tracking-[0.16em] ${s.faint}`}>
                    {cap.tag}
                  </span>
                </div>
                <h3 className={`text-lg font-extrabold mb-3 ${s.text}`} style={{ fontFamily: displayFont }}>
                  {cap.title}
                </h3>
                <p className={`text-sm leading-6 ${s.muted}`}>{cap.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`rounded-2xl border overflow-hidden shadow-xl mb-4 ${s.surface}`}>
          <div className={`flex flex-col justify-between gap-4 border-b ${s.border} p-6 sm:flex-row sm:items-center`}>
            <div>
              <div className={`text-[10px] font-bold font-mono uppercase tracking-[0.18em] ${s.faint}`}>
                Default policy envelope
              </div>
              <h2 className={`mt-1 text-xl font-extrabold ${s.text}`} style={{ fontFamily: displayFont }}>
                Spending Policy
              </h2>
            </div>
            <a
              href={`${docsUrl}/security/policy-engine`}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold transition active:scale-[0.97] ${s.buttonSecondary}`}
            >
              Policy docs
              <Icon name="external" className="h-4 w-4" />
            </a>
          </div>

          <div className="w-full">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className={`border-b ${s.border} ${s.faint} ${s.softSurface}`}>
                  <th className="px-4 sm:px-6 py-4 sm:py-5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest sm:tracking-[0.14em]">Spending Field</th>
                  <th className="hidden sm:table-cell px-6 py-5 text-[10px] font-black uppercase tracking-[0.14em]">Data Type</th>
                  <th className="px-4 sm:px-6 py-4 sm:py-5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest sm:tracking-[0.14em]">Default Limit (USDC)</th>
                  <th className="hidden lg:table-cell px-6 py-5 text-[10px] font-black uppercase tracking-[0.14em]">Verification Enforcement</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-[#16171F]' : 'divide-[#E2E4E9]'}`}>
                {policyRows.map((row) => (
                  <tr
                    key={row.field}
                    className={`policy-row transition-colors ${isDark ? 'hover:bg-[#12131A]/40' : 'hover:bg-[#F8F9FA]/60'}`}
                  >
                    <td className={`py-4 px-4 sm:py-4.5 sm:px-6 font-bold align-top sm:align-middle ${s.text}`}>
                      <div className="flex flex-col gap-1">
                        <span>{row.field}</span>
                        <span className={`sm:hidden inline-block px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 w-fit text-[9px] ${s.muted}`}>DECIMAL</span>
                        <span className={`lg:hidden mt-1 text-[10px] leading-relaxed font-normal ${s.muted}`}>{row.scope}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-4.5 px-6 align-top sm:align-middle">
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${s.tableCellBadge}`}>DECIMAL</span>
                    </td>
                    <td className={`py-4 px-4 sm:py-4.5 sm:px-6 font-bold whitespace-nowrap align-top sm:align-middle ${s.text}`}>{row.limit}</td>
                    <td className={`hidden lg:table-cell py-4.5 px-6 leading-relaxed align-top sm:align-middle ${s.muted}`}>{row.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-t ${s.border} ${s.softSurface}`}>
            <span className={`text-[10px] font-mono ${s.muted}`}>
              Need to upgrade limits or configure specialized policies?
            </span>
            <a
              href="mailto:support@aegisintent.xyz"
              className={`text-[10px] font-bold font-mono flex items-center gap-1 shrink-0 ${s.accent} hover:opacity-80 transition-opacity`}
            >
              Contact Support
              <Icon name="chevron" className="h-3 w-3" />
            </a>
          </div>
        </section>

        <footer className={`mt-6 flex flex-col justify-between gap-4 border-t ${s.border} py-7 text-xs font-mono sm:flex-row sm:items-center`}>
          <span className={s.muted}>© 2026 Aegis. All Rights Reserved.</span>
          <div className="flex gap-5">
            <a href={skillUrl} className={`transition-colors ${s.navLink}`}>SKILL.md</a>
            <a href={docsUrl} target="_blank" rel="noopener noreferrer" className={`transition-colors ${s.navLink}`}>Documentation</a>
            <a href="mailto:support@aegisintent.xyz" className={`transition-colors ${s.navLink}`}>Support</a>
          </div>
        </footer>
      </div>
    </main>
  );
}

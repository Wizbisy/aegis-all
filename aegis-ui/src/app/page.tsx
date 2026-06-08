'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { getDashboardData } from './actions';
import MouseTrail from './components/MouseTrail';
import { Icon } from './components/Icon';
import {
  pipeline,
  capabilities,
  policyRows,
  executionRoute,
  skillUrl,
  docsUrl,
  displayFont,
} from './constants';

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

function formatNumber(value: number | string | undefined) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCurrency(value: number | string | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const s = {
  page: 'min-h-screen bg-[#FAFBFD] dark:bg-[#050507] text-[#1E2026] dark:text-[#FAFBFD] selection:bg-[#00C278] dark:selection:bg-[#00F396] selection:text-white dark:selection:text-[#050507]',
  surface: 'border-[#E2E4E9] dark:border-[#1C1D24] bg-white dark:bg-[#0D0E12]',
  softSurface: 'border-[#E2E4E9] dark:border-[#1C1D24] bg-[#F8F9FA] dark:bg-[#07080A]',
  text: 'text-[#1E2026] dark:text-[#FAFBFD]',
  muted: 'text-[#5C6170] dark:text-[#8F94A6]',
  faint: 'text-[#8A91A3] dark:text-[#606578]',
  accent: 'text-[#00A360] dark:text-[#00F396]',
  accentGlow: 'text-[#00A360] dark:text-[#00F396] dark:drop-shadow-[0_0_40px_rgba(0,243,150,0.2)]',
  accentBg: 'bg-[#00C278]/10 dark:bg-[#00F396]/10 text-[#00A360] dark:text-[#00F396]',
  neutralBg: 'bg-[#E2E4E9] dark:bg-[#1C1D24] text-[#1E2026] dark:text-[#FAFBFD]',
  border: 'border-[#E2E4E9] dark:border-[#1C1D24]',
  divider: 'bg-[#E2E4E9] dark:bg-[#1C1D24]',
  dividerHover: 'group-hover:bg-[#C8CDD6] dark:group-hover:bg-[#2C2E3B]',
  buttonPrimary: 'bg-[#00A360] dark:bg-[#00F396] text-white dark:text-[#050507] hover:bg-[#00C278] dark:hover:bg-[#4BFFB9]',
  buttonSecondary: 'border-[#E2E4E9] dark:border-[#1C1D24] bg-white dark:bg-[#0D0E12] text-[#1E2026] dark:text-[#FAFBFD] hover:border-[#C8CDD6] dark:hover:border-[#2C2E3B]',
  navLink: 'text-[#5C6170] dark:text-[#8F94A6] hover:text-[#0F1115] dark:hover:text-white',
  tableCellBadge: 'bg-[#E6F9F0] dark:bg-[#0A2A1E] text-[#00A360] dark:text-[#00F396]',
  cardHover: 'hover:border-[#C8CDD6] dark:hover:border-[#2C2E3B] hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-2xl',
  glowBlob: 'bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04]',
  statGlowBlob: 'bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.05] dark:group-hover:bg-white/[0.06]',
  routeDotInactive: 'bg-[#C8CDD6] dark:bg-[#2C2E3B]',
  routeDotActive: 'bg-[#00A360] dark:bg-[#00F396]',
  tagBar: 'bg-[#C8CDD6] dark:bg-[#2C2E3B]',
};

export default function PublicLandingPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        toast.error('Connection failed. Retrying...');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

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

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Agent prompt copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text:', err);
      toast.error('Failed to copy text.');
    }
  };

  return (
    <main className={`${s.page} overflow-x-hidden transition-colors duration-300 noise-overlay`}>
      <Toaster position="bottom-right" theme={theme} />
      <MouseTrail />
      <div
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-size-[48px_48px]"
      />
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] max-w-[100vw] h-[500px] bg-linear-to-b from-black/[0.01] dark:from-white/[0.02] to-transparent rounded-full blur-[120px]"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-[10%] w-[600px] max-w-[100vw] h-[600px] bg-linear-to-tr from-[#3b82f6]/[0.02] dark:from-[#3b82f6]/[0.03] to-transparent rounded-full blur-[140px]"
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
              className="h-6 w-auto object-contain transition-all duration-300 invert dark:invert-0"
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
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
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
                onClick={() => handleCopy(`get started on aegis: ${skillUrl}`)}
                className={`btn-glow inline-flex h-12 items-center justify-center gap-2.5 rounded-lg px-6 text-sm font-bold transition cursor-pointer active:scale-[0.97] ${s.buttonPrimary}`}
              >
                <Icon name="copy" className="h-4 w-4" />
                Copy agent prompt
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

          <aside className={`rounded-2xl border console-border scanlines ${s.surface} shadow-2xl shadow-black/10 dark:shadow-none overflow-hidden animate-slide-in-right delay-300`}>
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
                      <div className="h-8 w-24 rounded animate-pulse bg-black/10 dark:bg-white/10" />
                    ) : (
                      card.value
                    )}
                  </div>
                  {card.detail && (
                    <div className={`flex justify-between text-[10px] font-mono border-t ${s.border} pt-2 mt-2`}>
                      <div className="flex flex-col">
                        <span className={s.faint}>{card.detail.left.label}</span>
                        {loading ? (
                          <div className="h-3 w-16 mt-1 rounded animate-pulse bg-black/10 dark:bg-white/10" />
                        ) : (
                          <span className={`font-bold ${card.detail.left.color || s.text}`}>
                            {card.detail.left.value}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col text-right">
                        <span className={s.faint}>{card.detail.right.label}</span>
                        {loading ? (
                          <div className="h-3 w-16 mt-1 rounded animate-pulse bg-black/10 dark:bg-white/10" />
                        ) : (
                          <span className={`font-bold ${card.detail.right.color || s.text}`}>
                            {card.detail.right.value}
                          </span>
                        )}
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
              <tbody className="divide-y divide-[#E2E4E9] dark:divide-[#16171F]">
                {policyRows.map((row) => (
                  <tr
                    key={row.field}
                    className="policy-row transition-colors hover:bg-[#F8F9FA]/60 dark:hover:bg-[#12131A]/40"
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

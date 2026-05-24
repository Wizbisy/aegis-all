'use client';

import  { useState, useEffect } from 'react';
import Image from 'next/image';
import { getDashboardData } from './actions';
import MouseTrail from './components/MouseTrail';

export default function PublicLandingPage() {
  const [activeTab, setActiveTab] = useState<'skill' | 'docs'>('skill');
  const [stats, setStats] = useState<{
    agents?: number;
    audits?: number;
    successfulAudits?: number;
    failedAudits?: number;
    successfulVolumeUsdc?: number | string;
    vaultTvlUsdc?: string;
    aegisTvlUsdc?: string;
    synthraTvlUsdc?: string;
    vaultApy?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('aegis-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTimeout(() => setTheme(savedTheme), 0);
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('aegis-theme', nextTheme);
  };

  const loadStats = async () => {
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
  };

  useEffect(() => {
    setTimeout(() => {
      loadStats();
    }, 0);
  }, []);

  const skillUrl = 'https://api.aegisintent.xyz/SKILL.md';
  const docsUrl = 'https://docs.aegisintent.xyz';

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const isDark = theme === 'dark';

  const s = {
    container: isDark 
      ? 'min-h-screen bg-[#050507] text-[#FAFBFD] selection:bg-[#00F396] selection:text-[#050507] transition-colors duration-300 overflow-x-hidden' 
      : 'min-h-screen bg-[#FAFBFD] text-[#1E2026] selection:bg-[#00C278] selection:text-white transition-colors duration-300 overflow-x-hidden',
    gridOverlay: isDark
      ? 'bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)]'
      : 'bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)]',
    glowOverlayTop: isDark
      ? 'from-[#00F396]/10'
      : 'from-[#00C278]/5',
    glowOverlayBottom: isDark
      ? 'from-[#3b82f6]/5'
      : 'from-[#3b82f6]/3',
    headerBorder: isDark
      ? 'border-[#1C1D24]'
      : 'border-[#E2E4E9]',
    navLink: isDark
      ? 'text-[#8F94A6] hover:text-white active:scale-95 transition-all'
      : 'text-[#5C6170] hover:text-[#0F1115] active:scale-95 transition-all',
    headingText: isDark
      ? 'text-white'
      : 'text-[#0F1115]',
    accentGlow: isDark
      ? 'text-[#00F396] drop-shadow-[0_0_30px_rgba(0,243,150,0.15)]'
      : 'text-[#00A360]',
    subtitleText: isDark
      ? 'text-[#8F94A6]'
      : 'text-[#5C6170]',
    accentLabel: isDark
      ? 'text-[#00F396]'
      : 'text-[#00A360]',
    cardContainer: isDark
      ? 'bg-[#0D0E12] border-[#1C1D24] hover:border-[#2C2E3B] shadow-2xl transition-all duration-300'
      : 'bg-white border-[#E2E4E9] hover:border-[#C8CDD6] shadow-md transition-all duration-300',
    tabHeader: isDark
      ? 'border-[#1C1D24] bg-[#07080A]'
      : 'border-[#E2E4E9] bg-[#F8F9FA]',
    tabActive: isDark
      ? 'text-[#00F396] bg-[#0D0E12]'
      : 'text-[#00A360] bg-white',
    tabInactive: isDark
      ? 'text-[#8F94A6] hover:text-white'
      : 'text-[#5C6170] hover:text-[#0F1115]',
    tabIndicator: isDark
      ? 'bg-[#00F396]'
      : 'bg-[#00C278]',
    promptBox: isDark
      ? 'bg-[#050507] border-[#1C1D24] text-[#FAFBFD] transition-colors duration-300'
      : 'bg-[#F8F9FA] border-[#E2E4E9] text-[#12131A] transition-colors duration-300',
    promptBanner: isDark
      ? 'bg-[#0A2A1E]/30 border-[#103D2E]/60'
      : 'bg-[#E6F9F0] border-[#A8E2C9]',
    promptHeader: isDark
      ? 'text-[#00F396]'
      : 'text-[#00A360]',
    promptDot: isDark
      ? 'bg-[#00F396] shadow-[0_0_10px_#00F396]'
      : 'bg-[#00C278] shadow-[0_0_10px_#00C278]',
    copyBtn: isDark
      ? 'bg-[#00F396]/15 hover:bg-[#00F396]/25 border-[#00F396]/35 text-[#00F396] active:scale-[0.98]'
      : 'bg-[#00C278]/15 hover:bg-[#00C278]/25 border-[#00C278]/35 text-[#00A360] active:scale-[0.98]',
    codeBlockLabel: isDark
      ? 'text-white hover:underline flex items-center gap-1 font-bold active:scale-[0.98]'
      : 'text-[#1E2026] hover:underline flex items-center gap-1 font-bold active:scale-[0.98]',
    statsGrid: isDark
      ? 'border-[#1C1D24] bg-[#07080A]/40 shadow-xl'
      : 'border-[#E2E4E9] bg-[#F8F9FA]/40 shadow-md',
    statsItem: isDark
      ? 'bg-[#0D0E12] border-[#1C1D24]'
      : 'bg-white border-[#E2E4E9]',
    statsAccent: isDark
      ? 'text-[#00F396]'
      : 'text-[#00A360]',
    quickStartItem: isDark
      ? 'bg-[#0D0E12] border-[#1C1D24] hover:border-[#2C2E3B] transition-all duration-300 active:scale-[0.99]'
      : 'bg-white border-[#E2E4E9] hover:border-[#C8CDD6] shadow-sm transition-all duration-300 active:scale-[0.99]',
    badge01: isDark
      ? 'bg-[#00F396]/10 text-[#00F396]'
      : 'bg-[#00C278]/10 text-[#00A360]',
    tableHeadRow: isDark
      ? 'border-b border-[#1C1D24] text-[#8F94A6] bg-[#07080A]'
      : 'border-b border-[#E2E4E9] text-[#5C6170] bg-[#F8F9FA]',
    tableRow: isDark
      ? 'hover:bg-[#12131A]/40'
      : 'hover:bg-[#F8F9FA]/60',
    tableCellBorder: isDark
      ? 'border-[#16171F]'
      : 'border-[#E2E4E9]',
    tableCellBadge: isDark
      ? 'bg-[#0A2A1E] text-[#00F396]'
      : 'bg-[#E6F9F0] text-[#00A360]',
    cardFooter: isDark
      ? 'border-t border-[#1C1D24] bg-[#07080A]/50'
      : 'border-t border-[#E2E4E9] bg-[#F8F9FA]',
    themeBtn: isDark
      ? 'border-[#1C1D24] bg-[#0D0E12] text-[#8F94A6] hover:text-white hover:border-[#2C2E3B] active:scale-95 transition-all duration-150'
      : 'border-[#E2E4E9] bg-white text-[#5C6170] hover:text-[#0F1115] hover:border-[#C8CDD6] active:scale-95 transition-all duration-150',
    textNormal: isDark
      ? 'text-[#FAFBFD]'
      : 'text-[#1E2026]'
  };

  return (
    <div className={s.container}>
      <MouseTrail />
      {/* Background Subtle Overlay */}
      <div className={`absolute inset-0 ${s.gridOverlay} pointer-events-none`}></div>
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[800px] max-w-[100vw] h-[500px] bg-linear-to-b ${s.glowOverlayTop} to-transparent rounded-full blur-[120px] pointer-events-none`}></div>
      <div className={`absolute bottom-0 right-[10%] w-[600px] max-w-[100vw] h-[600px] bg-linear-to-tr ${s.glowOverlayBottom} to-transparent rounded-full blur-[140px] pointer-events-none`}></div>

      <div className="max-w-7xl mx-auto px-6 py-10 lg:py-16 relative z-10">
        
        {/* Navigation / Header */}
        <header className={`flex justify-between items-center mb-16 lg:mb-24 border-b ${s.headerBorder} pb-6`}>
          <div className="flex items-center">
            {/* Logo */}
            <Image 
              src="/logo/dark.svg" 
              alt="Aegis Logo" 
              width={100}
              height={24}
              priority
              className={`h-6 w-auto object-contain transition-all duration-300 ${isDark ? '' : 'invert'}`} 
            />
          </div>
          
          <div className="flex items-center gap-5">
            {/* Dark/Light Theme Switcher Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg border text-xs transition-all duration-300 cursor-pointer flex items-center justify-center ${s.themeBtn}`}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <a 
              href={docsUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className={`text-xs font-bold font-mono tracking-wider transition-colors ${s.navLink}`}
            >
              DOCS
            </a>
          </div>
        </header>

        {/* Hero Section */}
        <section className="text-center max-w-4xl mx-auto mb-20 lg:mb-28">
          
          <h1 className={`text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight font-sans mb-4 ${s.headingText}`}>
            Aegis <span className={s.accentGlow}>Wealth Engine</span>
          </h1>

          <div className="flex items-center justify-center gap-2 mb-8">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDark ? 'bg-[#00F396]' : 'bg-[#00C278]'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isDark ? 'bg-[#00F396]' : 'bg-[#00C278]'}`}></span>
            </span>
            <div className={`text-xs font-bold font-mono tracking-[0.25em] uppercase ${s.accentLabel}`}>
              Autonomous Financial Operations Center
            </div>
          </div>
          
          <p className={`max-w-2xl mx-auto text-sm sm:text-base leading-relaxed font-medium mb-12 ${s.subtitleText}`}>
            The secure control center for autonomous financial agents. Manage secure program wallets, track live audit trails, and enforce spending rules with complete administrative oversight.
          </p>

          {/* Developer Resource Tabs */}
          <div className={`max-w-2xl mx-auto rounded-2xl overflow-hidden ${s.cardContainer}`}>
            <div className={`flex border-b ${s.tabHeader}`}>
              <button 
                onClick={() => setActiveTab('skill')}
                className={`flex-1 py-3.5 px-6 text-xs font-bold font-mono tracking-wider transition-all relative cursor-pointer ${
                  activeTab === 'skill' ? s.tabActive : s.tabInactive
                }`}
              >
                SKILL.md
                {activeTab === 'skill' && <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${s.tabIndicator}`}></span>}
              </button>
              <button 
                onClick={() => setActiveTab('docs')}
                className={`flex-1 py-3.5 px-6 text-xs font-bold font-mono tracking-wider transition-all relative cursor-pointer ${
                  activeTab === 'docs' ? s.tabActive : s.tabInactive
                }`}
              >
                Docs
                {activeTab === 'docs' && <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${s.tabIndicator}`}></span>}
              </button>
            </div>

            <div className="p-6 text-left">
              {activeTab === 'skill' ? (
                <div className="space-y-4">
                  <div className={`border rounded-xl p-5 relative overflow-hidden group ${s.promptBanner}`}>
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-[#00F396]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#00F396]/10 transition-colors duration-500`}></div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-3 sm:gap-0">
                      <h4 className={`font-bold text-xs uppercase tracking-wider font-mono flex items-center gap-2 ${s.promptHeader}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${s.promptDot} animate-pulse`}></span>
                        GET STARTED: AGENT SYSTEM PROMPT
                      </h4>
                      <button 
                        onClick={() => handleCopy(`get started on aegis: ${skillUrl}`)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold font-mono transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shrink-0 ${s.copyBtn}`}
                      >
                        {copied ? 'PROMPT COPIED!' : 'COPY PROMPT'}
                      </button>
                    </div>
                    <p className={`text-xs leading-relaxed font-mono mb-4 ${s.subtitleText}`}>
                      Copy this prompt and feed it to your AI agent so it can read and adhere to Aegis instructions:
                    </p>
                    <div className="relative group/prompt">
                      <div className={`p-4 rounded-xl leading-relaxed text-xs font-mono select-all pr-4 sm:pr-12 shadow-inner break-all ${s.promptBox}`}>
                        &quot;get started on aegis: <span className={`${s.accentLabel} font-semibold break-all`}>{skillUrl}</span>&quot;
                      </div>
                    </div>
                  </div>
                  
                  <div className={`flex items-center justify-between px-4 py-3 border rounded-xl text-xs font-mono ${s.tabHeader}`}>
                    <span className={s.subtitleText}>Raw file endpoint:</span>
                    <a 
                      href={skillUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={`${s.accentLabel} hover:underline flex items-center gap-1 font-bold`}
                    >
                      SKILL.md
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`border rounded-xl p-5 relative overflow-hidden group ${s.promptBox}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-3 sm:gap-0">
                      <h4 className={`font-bold text-xs uppercase tracking-wider font-mono flex items-center gap-2 ${s.headingText}`}>
                        EXPLORE FULL TECHNICAL SPECS
                      </h4>
                      <a 
                        href={docsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold font-mono transition-all hover:scale-[1.02] active:scale-[0.98] ${s.themeBtn}`}
                      >
                        OPEN DOCS
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                    <p className={`text-xs leading-relaxed font-mono ${s.subtitleText}`}>
                      Explore the API references, configuration guides, integration tutorials, and security architecture specifications.
                    </p>
                  </div>
                  
                  <div className={`flex items-center justify-between px-4 py-3 border rounded-xl text-xs font-mono ${s.tabHeader}`}>
                    <span className={s.subtitleText}>Documentation domain:</span>
                    <a 
                      href={docsUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={`hover:underline flex items-center gap-1 font-bold ${s.codeBlockLabel}`}
                    >
                      docs.aegisintent.xyz
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="mb-24 lg:mb-32">
          <div className="text-center mb-12">
            <span className={`text-[10px] font-bold tracking-[0.25em] font-mono uppercase mb-2 block ${s.accentLabel}`}>Aegis Statistics</span>
            <h2 className={`text-2xl lg:text-3xl font-extrabold font-sans ${s.headingText}`}>General Stats</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Connected Fleet Agents */}
            <div className={`flex flex-col p-6 rounded-2xl border ${s.statsItem} hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 relative group overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-24 h-24 bg-[#00F396]/5 rounded-full blur-2xl pointer-events-none group-hover:bg-[#00F396]/10 transition-colors duration-500`}></div>
              <div className="flex justify-between items-center mb-4">
                <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${s.subtitleText}`}>Connected Fleet Agents</span>
                {/* SVG Network/Group Icon */}
                <svg className={`w-5 h-5 ${s.statsAccent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 025.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              {loading ? (
                <div className="w-6 h-6 border-2 border-transparent border-t-[#00F396] rounded-full animate-spin"></div>
              ) : (
                <span className={`text-4xl font-bold tracking-tight font-mono ${s.headingText}`}>{stats?.agents ?? 0}</span>
              )}
            </div>

            {/* Card 2: Transactions Processed */}
            <div className={`flex flex-col p-6 rounded-2xl border ${s.statsItem} hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 relative group overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-24 h-24 bg-[#00F396]/5 rounded-full blur-2xl pointer-events-none group-hover:bg-[#00F396]/10 transition-colors duration-500`}></div>
              <div className="flex justify-between items-center mb-4">
                <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${s.subtitleText}`}>Transactions Processed</span>
                {/* SVG Swap/Arrows Icon */}
                <svg className={`w-5 h-5 ${s.statsAccent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              {loading ? (
                <div className="w-6 h-6 border-2 border-transparent border-t-[#00F396] rounded-full animate-spin"></div>
              ) : (
                <div className="flex flex-col">
                  <span className={`text-3xl font-bold tracking-tight font-mono ${s.headingText} mb-2`}>
                    {stats?.successfulAudits ?? 0}
                  </span>
                  <div className={`flex justify-between text-[10px] font-mono border-t ${isDark ? 'border-[#1C1D24]' : 'border-[#E2E4E9]'} pt-2 mt-1`}>
                    <div className="flex flex-col">
                      <span className={s.subtitleText}>Total Audits</span>
                      <span className={`font-bold ${s.accentLabel}`}>{stats?.audits ?? 0}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className={s.subtitleText}>Rejected</span>
                      <span className="font-bold text-[#ef4444]">{stats?.failedAudits ?? 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Vault TVL & Yield APY */}
            <div className={`flex flex-col p-6 rounded-2xl border ${s.statsItem} hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 relative group overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-24 h-24 bg-[#00F396]/5 rounded-full blur-2xl pointer-events-none group-hover:bg-[#00F396]/10 transition-colors duration-500`}></div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col gap-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${s.subtitleText}`}>Multi Yield TVL</span>
                  {stats?.vaultApy !== undefined && (
                    <span className={`text-[9px] font-bold tracking-wider font-mono ${s.accentLabel}`}>
                      APY: {stats.vaultApy.toFixed(2)}%
                    </span>
                  )}
                </div>
                {/* SVG Trending Up Icon */}
                <svg className={`w-5 h-5 ${s.statsAccent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              {loading ? (
                <div className="w-6 h-6 border-2 border-transparent border-t-[#00F396] rounded-full animate-spin"></div>
              ) : (
                <div className="flex flex-col">
                  <span className={`text-3xl font-bold tracking-tight font-mono ${s.headingText} mb-2`}>
                    ${Number(stats?.vaultTvlUsdc || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <div className={`flex justify-between text-[10px] font-mono border-t ${isDark ? 'border-[#1C1D24]' : 'border-[#E2E4E9]'} pt-2 mt-1`}>
                    <div className="flex flex-col">
                      <span className={s.subtitleText}>Aegis aUSDC</span>
                      <span className={`font-bold ${s.accentLabel}`}>${Number(stats?.aegisTvlUsdc || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className={s.subtitleText}>Synthra V3</span>
                      <span className={`font-bold ${s.accentLabel}`}>${Number(stats?.synthraTvlUsdc || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card 4: Processed Volume (USDC) */}
            <div className={`flex flex-col p-6 rounded-2xl border ${s.statsItem} hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 relative group overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-24 h-24 bg-[#00F396]/5 rounded-full blur-2xl pointer-events-none group-hover:bg-[#00F396]/10 transition-colors duration-500`}></div>
              <div className="flex justify-between items-center mb-4">
                <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${s.subtitleText}`}>Processed Volume (USDC)</span>
                {/* SVG Circle stablecoin/money Icon */}
                <svg className={`w-5 h-5 ${s.statsAccent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {loading ? (
                <div className="w-6 h-6 border-2 border-transparent border-t-[#00F396] rounded-full animate-spin"></div>
              ) : (
                <span className={`text-3xl font-bold tracking-tight font-mono ${s.headingText}`}>
                  ${Number(stats?.successfulVolumeUsdc || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>
          
          {error && (
            <p className={`text-center text-xs font-mono mt-4 ${s.subtitleText}`}>{error}</p>
          )}
        </section>

        {/* Quick Start Section */}
        <section className="mb-24 lg:mb-32">
          <div className="text-center mb-16">
            <span className={`text-[10px] font-bold tracking-[0.25em] font-mono uppercase mb-2 block ${s.accentLabel}`}>Quick Start Guide</span>
            <h2 className={`text-2xl lg:text-3xl font-extrabold font-sans ${s.headingText}`}>Three Steps to Secure Autonomy</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className={`border rounded-2xl p-8 relative overflow-hidden ${s.quickStartItem}`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold font-mono mb-6 ${s.badge01}`}>01</div>
              <h3 className={`text-lg font-bold font-sans mb-3 ${s.headingText}`}>Integrate SKILL.md</h3>
              <p className={`text-xs leading-relaxed font-mono ${s.subtitleText}`}>
                Provide your AI agent with the public `SKILL.md` API resource instructions. The agent will parse platform rules, schemas, and action constraints to negotiate transactions natively.
              </p>
            </div>
            
            <div className={`border rounded-2xl p-8 relative overflow-hidden ${s.quickStartItem}`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold font-mono mb-6 ${s.badge01}`}>02</div>
              <h3 className={`text-lg font-bold font-sans mb-3 ${s.headingText}`}>Agent Authorization</h3>
              <p className={`text-xs leading-relaxed font-mono ${s.subtitleText}`}>
                Link agent access seamlessly through secure, temporary session tokens. Authorize wallets safely without exposing master private keys.
              </p>
            </div>

            <div className={`border rounded-2xl p-8 relative overflow-hidden ${s.quickStartItem}`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold font-mono mb-6 ${s.badge01}`}>03</div>
              <h3 className={`text-lg font-bold font-sans mb-3 ${s.headingText}`}>Execute with Guardrails</h3>
              <p className={`text-xs leading-relaxed font-mono ${s.subtitleText}`}>
                Run transactions with complete confidence. The Aegis Policy Engine verifies every single action against your active rules, instantly rejecting unauthorized operations.
              </p>
            </div>
          </div>
        </section>

        {/* Policy Engine Guardrails Section */}
        <section className="mb-24 lg:mb-32">
          <div className="text-center mb-12">
            <h2 className={`text-2xl lg:text-3xl font-extrabold font-sans ${s.headingText}`}>Spending Policy</h2>
            <p className={`max-w-xl mx-auto text-xs font-mono mt-3 ${s.subtitleText}`}>
              Administrative spending rules are securely stored in the database. Agents cannot override their boundaries, ensuring strict policy validation prior to blockchain execution.
            </p>
          </div>

          <div className={`border rounded-2xl shadow-xl overflow-hidden ${s.cardContainer}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className={`font-bold uppercase tracking-wider ${s.tableHeadRow}`}>
                    <th className="py-5 px-6">Spending Field</th>
                    <th className="py-5 px-6">Data Type</th>
                    <th className="py-5 px-6">Default Limit (USDC)</th>
                    <th className="py-5 px-6">Verification Enforcement</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-[#16171F]' : 'divide-[#E2E4E9]'}`}>
                  <tr className={`transition-colors ${s.tableRow}`}>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>perTxLimitUsdc</td>
                    <td className="py-4.5 px-6"><span className={`px-2 py-0.5 rounded font-bold text-[9px] ${s.tableCellBadge}`}>DECIMAL</span></td>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>$10,000.00</td>
                    <td className={`py-4.5 px-6 ${s.subtitleText}`}>Enforced on every transaction action request.</td>
                  </tr>
                  <tr className={`transition-colors ${s.tableRow}`}>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>dailyLimitUsdc</td>
                    <td className="py-4.5 px-6"><span className={`px-2 py-0.5 rounded font-bold text-[9px] ${s.tableCellBadge}`}>DECIMAL</span></td>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>$50,000.00</td>
                    <td className={`py-4.5 px-6 ${s.subtitleText}`}>Rolling 24-hour aggregate volume control.</td>
                  </tr>
                  <tr className={`transition-colors ${s.tableRow}`}>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>weeklyLimitUsdc</td>
                    <td className="py-4.5 px-6"><span className={`px-2 py-0.5 rounded font-bold text-[9px] ${s.tableCellBadge}`}>DECIMAL</span></td>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>$200,000.00</td>
                    <td className={`py-4.5 px-6 ${s.subtitleText}`}>Rolling 7-day aggregate volume control.</td>
                  </tr>
                  <tr className={`transition-colors ${s.tableRow}`}>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>monthlyLimitUsdc</td>
                    <td className="py-4.5 px-6"><span className={`px-2 py-0.5 rounded font-bold text-[9px] ${s.tableCellBadge}`}>DECIMAL</span></td>
                    <td className={`py-4.5 px-6 font-bold ${s.textNormal}`}>$500,000.00</td>
                    <td className={`py-4.5 px-6 ${s.subtitleText}`}>Rolling 30-day aggregate volume control.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={`px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${s.cardFooter}`}>
              <span className={`text-[10px] font-mono ${s.subtitleText} text-left`}>
                Need to upgrade limits or configure specialized policies?
              </span>
              <a 
                href="mailto:support@aegisintent.xyz" 
                className={`text-[10px] font-bold transition-colors font-mono flex items-center gap-1 shrink-0 ${s.accentLabel} hover:text-[#00c278]`}
              >
                Contact Support →
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className={`border-t pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono ${s.headerBorder} ${s.subtitleText}`}>
          <span>© 2026 Aegis. All Rights Reserved.</span>
          <div className="flex gap-6">
            <a href={docsUrl} target="_blank" rel="noopener noreferrer" className={`${s.navLink} transition-colors`}>Developer Docs</a>
            <span className={isDark ? 'text-[#1C1D24]' : 'text-[#E2E4E9]'}>|</span>
            <span className={s.accentLabel}>Secure DCW Shield Active</span>
          </div>
        </footer>
        
      </div>
    </div>
  );
}

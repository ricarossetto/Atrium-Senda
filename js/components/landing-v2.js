/**
 * ATRIUM MINERAL EDITORIAL — Landing Page Controller (v2.1)
 * Decoupled public landing page controller.
 * Zero authenticated dependencies.
 * Full WCAG AAA accessibility, ARIA synchronization, synthetic lens simulation, and subtle scroll choreography.
 */
(() => {
  'use strict';

  // 100% Synthetic, audited scenario data (Zero real PII, zero tribunal requests)
  const LENS_DATA = {
    civel: {
      cnj: '0000001-00.2026.8.21.0001 (Sintético)',
      tribunal: 'TJRS · 1ª Vara Cível de Porto Alegre',
      acao: 'Procedimento Comum Cível · Cobrança de Honorários',
      fase: 'Audiência de Instrução e Julgamento Designada',
      delta: 'Decisão interlocutória proferida às 06:12 — Intimação automática capturada',
      meta: 'Sincronização de leitura com eproc TJRS 1G · Sem intermediários',
      insightTitle: 'Inspeção Contínua e Detecção de Deltas',
      insightText: 'O Atrium monitora a fila do eproc TJRS em modo de leitura. A cada alteração nos autos, o sistema cataloga novos andamentos e destaca prazos sem jamais expor sua senha judicial em servidores de terceiros.',
      audit: 'SHA-256 Verificado · Integridade dos Dados Sintéticos Confirmada'
    },
    djen: {
      cnj: '0000002-00.2026.8.21.0010 (Sintético)',
      tribunal: 'DJEN Nacional · Caderno Judicial RS',
      acao: 'Cumprimento de Sentença · Execução de Título',
      fase: 'Publicação de Intimação · Prazo pendente de conferência humana',
      delta: 'Classificação estruturada: Manifestação sobre cálculo pericial',
      meta: 'Varredura unificada diária · Fonte oficial DJEN',
      insightTitle: 'Triagem Estruturada de Publicações',
      insightText: 'Intimações do Diário da Justiça Eletrônico Nacional auxiliam a triagem e a correlação com o processo. Prazos somente aparecem na agenda depois de cadastrados ou confirmados pela equipe.',
      audit: 'Prazo não definido · Conferência humana necessária'
    },
    execucao: {
      cnj: '0000003-00.2026.8.21.0001 (Sintético)',
      tribunal: 'TJRS · 12ª Vara da Fazenda Pública',
      acao: 'Execução Contra a Fazenda Pública · RPV e Precatório',
      fase: 'Expedição de Alvará Identificada',
      delta: 'Ordem de pagamento expedida nos autos virtuais',
      meta: 'Monitoramento Financeiro e Honorários Vinculados',
      insightTitle: 'Proteção Patrimonial e Acompanhamento de Alvarás',
      insightText: 'Acompanhe expedições de alvarás e ordens de pagamento nos autos. Suas credenciais judiciais e certificados A1 permanecem guardados em cofre com cifragem AES-256-GCM local da sua banca.',
      audit: 'Cofre AES-256-GCM: Cifrado em Repouso com Chave Mestra'
    }
  };

  const AtriumLanding = {
    currentTheme: 'dark',
    currentLens: 'civel',

    init() {
      this.initTheme();
      this.bindThemeToggle();
      this.bindLensInteraction();
      this.bindFaqAccordion();
      this.initScrollChoreography();
      this.bindVisibilityHandler();
      this.bindSmoothScroll();
    },

    initTheme() {
      try {
        const stored = localStorage.getItem('atrium_theme') || localStorage.getItem('jurisflow_theme');
        if (stored === 'light' || stored === 'dark') {
          this.currentTheme = stored;
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
          this.currentTheme = 'light';
        } else {
          this.currentTheme = 'dark';
        }
      } catch {
        this.currentTheme = 'dark';
      }
      this.applyTheme(this.currentTheme);
    },

    applyTheme(theme) {
      this.currentTheme = theme;
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem('atrium_theme', theme);
      } catch {}

      // Synchronize theme-color meta tag
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', theme === 'light' ? '#F8F9FA' : '#0B0D0E');
      }

      // Update all theme-aware images (Hero Showcase, Pillars, etc.)
      const themeImages = document.querySelectorAll('img[data-theme-dark][data-theme-light]');
      themeImages.forEach(img => {
        const targetSrc = theme === 'light' 
          ? img.getAttribute('data-theme-light') 
          : img.getAttribute('data-theme-dark');
        if (targetSrc && !img.src.endsWith(targetSrc)) {
          img.style.opacity = '0.5';
          setTimeout(() => {
            img.src = targetSrc;
            img.style.opacity = '1';
          }, 100);
        }
      });

      // Update Logo
      const logoImg = document.getElementById('headerLogoImg');
      if (logoImg) {
        logoImg.src = theme === 'light' 
          ? 'assets/icons/atrium-logo-light.svg?v=3.0.1'
          : 'assets/icons/atrium-logo.svg?v=3.0.1';
      }

      // Update theme toggle button metadata & icon
      const btn = document.getElementById('themeToggleBtn');
      const isLight = theme === 'light';
      if (btn) {
        btn.setAttribute('aria-label', isLight ? 'Ativar modo escuro' : 'Ativar modo claro');
        btn.setAttribute('title', isLight ? 'Ativar modo escuro' : 'Ativar modo claro');
      }
      const themeUse = document.getElementById('themeToggleUse') || (btn ? btn.querySelector('use') : null);
      if (themeUse) {
        const iconSymbol = isLight ? 'atrium-icon-theme-dark' : 'atrium-icon-theme-light';
        const iconHref = `assets/icons/atrium-ui-icons.svg?v=3.0.1#${iconSymbol}`;
        themeUse.setAttribute('href', iconHref);
        themeUse.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', iconHref);
      }
    },

    bindThemeToggle() {
      const btn = document.getElementById('themeToggleBtn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const next = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
      });
    },

    selectLensTab(key, tabElement) {
      if (!key || !LENS_DATA[key] || key === this.currentLens) return;

      const tabs = Array.from(document.querySelectorAll('[data-lens-tab]'));
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
        t.setAttribute('tabindex', '-1');
      });

      const activeTab = tabElement || document.querySelector(`[data-lens-tab="${key}"]`);
      if (activeTab) {
        activeTab.classList.add('active');
        activeTab.setAttribute('aria-selected', 'true');
        activeTab.setAttribute('tabindex', '0');
        activeTab.focus();
      }

      this.currentLens = key;
      const data = LENS_DATA[key];

      const cnjEl = document.getElementById('lensCnj');
      const tribunalEl = document.getElementById('lensTribunal');
      const acaoEl = document.getElementById('lensAcao');
      const faseEl = document.getElementById('lensFase');
      const deltaEl = document.getElementById('lensDelta');
      const metaEl = document.getElementById('lensMeta');
      const insightTitleEl = document.getElementById('lensInsightTitle');
      const insightTextEl = document.getElementById('lensInsightText');
      const auditEl = document.getElementById('lensAudit');

      const container = document.querySelector('.signature-lens-card');
      if (container) {
        container.style.transition = 'opacity 0.15s ease';
        container.style.opacity = '0.7';
        setTimeout(() => {
          if (cnjEl) cnjEl.textContent = data.cnj;
          if (tribunalEl) tribunalEl.textContent = data.tribunal;
          if (acaoEl) acaoEl.textContent = data.acao;
          if (faseEl) faseEl.textContent = data.fase;
          if (deltaEl) deltaEl.textContent = data.delta;
          if (metaEl) metaEl.textContent = data.meta;
          if (insightTitleEl) insightTitleEl.textContent = data.insightTitle;
          if (insightTextEl) insightTextEl.textContent = data.insightText;
          if (auditEl) auditEl.textContent = data.audit;
          container.style.opacity = '1';
        }, 80);
      }
    },

    bindLensInteraction() {
      const tabs = Array.from(document.querySelectorAll('[data-lens-tab]'));
      if (!tabs.length) return;

      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
          const key = tab.dataset.lensTab;
          this.selectLensTab(key, tab);
        });

        // WAI-ARIA Tablist Keyboard Navigation (ArrowLeft / ArrowRight / Home / End)
        tab.addEventListener('keydown', (e) => {
          let nextIndex = index;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextIndex = (index + 1) % tabs.length;
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            nextIndex = (index - 1 + tabs.length) % tabs.length;
          } else if (e.key === 'Home') {
            e.preventDefault();
            nextIndex = 0;
          } else if (e.key === 'End') {
            e.preventDefault();
            nextIndex = tabs.length - 1;
          } else {
            return;
          }
          const nextTab = tabs[nextIndex];
          const nextKey = nextTab.dataset.lensTab;
          this.selectLensTab(nextKey, nextTab);
        });
      });
    },

    bindFaqAccordion() {
      const triggers = document.querySelectorAll('.faq-trigger');
      triggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
          const item = trigger.closest('.faq-item');
          if (!item) return;
          const isOpen = item.classList.contains('open');

          // Close all other items for clean single-focus readability
          document.querySelectorAll('.faq-item').forEach(other => {
            if (other !== item) {
              other.classList.remove('open');
              other.querySelector('.faq-trigger')?.setAttribute('aria-expanded', 'false');
            }
          });

          item.classList.toggle('open', !isOpen);
          trigger.setAttribute('aria-expanded', String(!isOpen));
        });
      });
    },

    initScrollChoreography() {
      const isReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (isReducedMotion) {
        document.querySelectorAll('.reveal-on-scroll').forEach(el => {
          el.classList.add('revealed', 'motion-settled');
        });
        return;
      }

      // Progressive Enhancement: Only activate motion hiding once observer is instantiated
      document.documentElement.classList.add('motion-ready');

      // Hero On-load Entrance Choreography (Natural Stagger: Headline -> Subheadline -> CTAs -> Product Stage)
      const heroItems = Array.from(document.querySelectorAll('.landing-hero [data-reveal-order]'));
      heroItems.sort((a, b) => {
        const orderA = parseInt(a.getAttribute('data-reveal-order'), 10) || 1;
        const orderB = parseInt(b.getAttribute('data-reveal-order'), 10) || 1;
        return orderA - orderB;
      });

      heroItems.forEach(item => {
        const order = parseInt(item.getAttribute('data-reveal-order'), 10) || 1;
        // Deliberate, smooth sequence: 80ms, 170ms, 260ms, 360ms
        const delay = 80 + (order - 1) * 90;
        setTimeout(() => {
          item.classList.add('revealed');
          setTimeout(() => {
            item.classList.add('motion-settled');
          }, 700);
        }, delay);
      });

      // Intersection Observer for scroll sections entering viewport
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            el.classList.add('revealed');
            setTimeout(() => {
              el.classList.add('motion-settled');
            }, 750);
            observer.unobserve(el);
          }
        });
      }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
      });

      // Observe all reveal-on-scroll elements that are NOT handled by hero initial sequence
      document.querySelectorAll('.reveal-on-scroll').forEach(el => {
        if (!el.hasAttribute('data-reveal-order')) {
          observer.observe(el);
        }
      });

      // Print & Snapshot Safety: ensure everything is visible for printing or automated exports
      window.addEventListener('beforeprint', () => {
        document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed', 'motion-settled'));
      });

      // Graceful Fallback: Ensure no section remains permanently hidden if observer events are delayed
      setTimeout(() => {
        document.querySelectorAll('.reveal-on-scroll:not(.revealed)').forEach(el => el.classList.add('revealed', 'motion-settled'));
      }, 3000);

      // Pure Hardware Display: subtle scroll-linked motion (strictly non-gimmick translate)
      const stage = document.getElementById('productStage');
      if (stage && !isReducedMotion) {
        let ticking = false;
        // Activate scroll parallax only after hero entrance choreography has settled
        setTimeout(() => {
          window.addEventListener('scroll', () => {
            if (!ticking) {
              window.requestAnimationFrame(() => {
                const rect = stage.getBoundingClientRect();
                const windowHeight = window.innerHeight;
                if (rect.top < windowHeight && rect.bottom > 0) {
                  // Subtle translate of max 12px over scroll range
                  const progress = (windowHeight - rect.top) / (windowHeight + rect.height);
                  const clamped = Math.max(0, Math.min(1, progress));
                  const translateY = (clamped - 0.5) * -12;
                  stage.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0)`;
                }
                ticking = false;
              });
              ticking = true;
            }
          }, { passive: true });
        }, 900);
      }
    },

    bindVisibilityHandler() {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          document.body.classList.add('paused');
        } else {
          document.body.classList.remove('paused');
        }
      });
    },

    bindSmoothScroll() {
      document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
          const targetId = link.getAttribute('href').replace(/^#/, '');
          if (!targetId) return;
          const target = document.getElementById(targetId);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AtriumLanding.init());
  } else {
    AtriumLanding.init();
  }
})();

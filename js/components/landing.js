/**
 * Atrium Official Landing Page Component (UI v2)
 * Manages theme synchronization, showcase tab switching, FAQ accordions, and auth gate transitions.
 */
(() => {
  'use strict';

  const Landing = {
    currentShowcaseTab: 'dashboard',

    init() {
      this.bindEvents();
      this.updateShowcaseImage();
    },

    bindEvents() {
      // Smooth anchor scrolling
      document.querySelectorAll('#landingPage a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (event) => {
          const targetId = anchor.getAttribute('href').replace(/^#/, '');
          const targetElement = document.getElementById(targetId);
          if (targetElement) {
            event.preventDefault();
            targetElement.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });

      // Showcase tab switching
      document.querySelectorAll('.landing-mockup-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const tabKey = tab.dataset.tab;
          if (!tabKey) return;
          this.switchShowcaseTab(tabKey);
        });
      });

      // FAQ accordion toggle
      document.querySelectorAll('.landing-faq-button').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = btn.closest('.landing-faq-item');
          if (!item) return;
          const isOpen = item.classList.contains('open');
          // Close other items
          document.querySelectorAll('.landing-faq-item').forEach(other => {
            if (other !== item) {
              other.classList.remove('open');
              other.querySelector('.landing-faq-button')?.setAttribute('aria-expanded', 'false');
            }
          });
          item.classList.toggle('open', !isOpen);
          btn.setAttribute('aria-expanded', String(!isOpen));
        });
      });

      // Theme toggle inside landing page header
      document.querySelectorAll('[data-landing-theme-toggle]').forEach(toggle => {
        toggle.addEventListener('click', () => {
          this.toggleTheme();
        });
      });

      // Tooltip textual de controle sem rótulo visível (hover e foco de teclado)
      document.querySelectorAll('.landing-nav-actions button[aria-describedby]').forEach(trigger => {
        if (trigger.dataset.tooltipReady === 'true') return;
        trigger.dataset.tooltipReady = 'true';
        const ids = String(trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        const tip = ids.map(id => document.getElementById(id))
          .find(node => node && node.getAttribute('role') === 'tooltip');
        if (!tip) return;
        const show = () => { tip.dataset.open = 'true'; };
        const hide = () => { delete tip.dataset.open; };
        trigger.addEventListener('mouseenter', show);
        trigger.addEventListener('mouseleave', hide);
        trigger.addEventListener('focus', show);
        trigger.addEventListener('blur', hide);
        trigger.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
      });

      // Action triggers for login / register
      document.querySelectorAll('[data-landing-action="login"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openAuthGate('login');
        });
      });

      document.querySelectorAll('[data-landing-action="register"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openAuthGate('register');
        });
      });

      // Return from auth gate back to landing page
      document.querySelectorAll('[data-landing-action="back-to-landing"], [data-landing-action="discover"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.closeAuthGate();
        });
      });

      // Synchronize browser history navigation between /discover and /
      window.addEventListener('popstate', () => {
        const pathname = String(globalThis.location.pathname || '').toLowerCase();
        const urlParams = new URLSearchParams(globalThis.location.search);
        const isDiscover = pathname.includes('/discover') || pathname.includes('/landing') || urlParams.has('discover');
        document.documentElement.dataset.route = isDiscover ? 'discover' : 'app';
        const landing = document.getElementById('landingPage');
        const authGate = document.getElementById('authGate');
        if (isDiscover) {
          if (authGate) authGate.classList.add('hidden');
          if (landing) landing.classList.remove('hidden');
        } else {
          if (landing) landing.classList.add('hidden');
          if (authGate) authGate.classList.remove('hidden');
        }
      });

      // Watch for system / external theme mutations
      const observer = new MutationObserver(() => {
        this.updateShowcaseImage();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    },

    toggleTheme() {
      const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#eef1f1' : '#0c0c0b');
      try {
        localStorage.setItem('atrium_theme', next);
      } catch {}
      this.updateShowcaseImage();
      window.dispatchEvent(new CustomEvent('atrium:theme-changed', { detail: { theme: next } }));
    },

    switchShowcaseTab(tabKey) {
      this.currentShowcaseTab = tabKey;
      document.querySelectorAll('.landing-mockup-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabKey);
      });
      this.updateShowcaseImage();
    },

    updateShowcaseImage() {
      const img = document.getElementById('landingShowcaseImage');
      if (!img) return;
      const isLight = document.documentElement.dataset.theme === 'light';
      const version = '5.6.2';

      const imageMap = {
        dashboard: isLight ? `assets/images/dashboard-light.png?v=${version}` : `assets/images/dashboard-dark.png?v=${version}`,
        processes: `assets/images/process-inspector.png?v=${version}`,
        publications: `assets/images/publications-workspace.png?v=${version}`,
        contacts: `assets/images/contacts-registry.png?v=${version}`,
        integrations: `assets/images/integrations.png?v=${version}`
      };

      const targetSrc = imageMap[this.currentShowcaseTab] || imageMap.dashboard;
      const currentSrc = img.getAttribute('src') || '';
      if (currentSrc !== targetSrc && !currentSrc.endsWith(targetSrc)) {
        img.style.opacity = '0';
        setTimeout(() => {
          img.src = targetSrc;
          img.style.opacity = '1';
        }, 120);
      }
    },

    openAuthGate(tab = 'login') {
      const landing = document.getElementById('landingPage');
      const authGate = document.getElementById('authGate');
      if (!authGate) return;

      document.documentElement.dataset.route = 'app';
      if (globalThis.history?.pushState) {
        globalThis.history.pushState(null, '', `/?auth=${tab}`);
      }

      if (landing) landing.classList.add('hidden');
      authGate.classList.remove('hidden');

      if (tab === 'register') {
        const regTab = document.getElementById('authTabRegister');
        if (regTab) regTab.click();
      } else {
        const loginTab = document.getElementById('authTabLogin');
        if (loginTab) loginTab.click();
      }

      window.scrollTo({ top: 0, behavior: 'instant' });
    },

    closeAuthGate() {
      const landing = document.getElementById('landingPage');
      const authGate = document.getElementById('authGate');
      document.documentElement.dataset.route = 'discover';
      if (globalThis.history?.pushState) {
        globalThis.history.pushState(null, '', '/discover');
      }
      if (authGate) authGate.classList.add('hidden');
      if (landing) landing.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Landing.init());
  } else {
    Landing.init();
  }

  globalThis.AtriumLanding = Landing;
})();

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
      document.querySelectorAll('[data-landing-action="back-to-landing"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.closeAuthGate();
        });
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
      try {
        localStorage.setItem('atrium_theme', next);
        localStorage.setItem('jurisflow_theme', next);
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

      const imageMap = {
        dashboard: isLight ? 'assets/images/dashboard-light.png' : 'assets/images/dashboard-dark.png',
        processes: 'assets/images/process-inspector.png',
        publications: 'assets/images/publications-workspace.png',
        contacts: 'assets/images/contacts-registry.png',
        integrations: 'assets/images/integrations.png'
      };

      const targetSrc = imageMap[this.currentShowcaseTab] || imageMap.dashboard;
      if (img.src !== targetSrc) {
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

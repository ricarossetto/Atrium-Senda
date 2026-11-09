import '../portal.js?v=3.0.0';
import '../core/environment-badge.js?v=3.0.0';

export const MODULE_FOUNDATION_READY_EVENT = 'atrium:module-foundation-ready';

function announceModuleFoundationReady() {
  document.dispatchEvent(new CustomEvent(MODULE_FOUNDATION_READY_EVENT, {
    detail: Object.freeze({ entrypoint: 'js/app/bootstrap.js', version: 1 })
  }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', announceModuleFoundationReady, { once: true });
} else {
  queueMicrotask(announceModuleFoundationReady);
}

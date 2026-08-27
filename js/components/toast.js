export const Toast = Object.freeze({
  show(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.getElementById('toastRegion').appendChild(toast);
    setTimeout(() => toast.remove(), 4300);
    return toast;
  }
});

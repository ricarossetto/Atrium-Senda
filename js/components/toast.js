export const Toast = Object.freeze({
  show(message, type = '', action = null) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const messageNode = document.createElement('span');
    messageNode.className = 'toast-message';
    messageNode.textContent = message;
    toast.appendChild(messageNode);
    if (action?.label && typeof action.onClick === 'function') {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'toast-action';
      actionButton.textContent = action.label;
      actionButton.addEventListener('click', () => {
        toast.remove();
        action.onClick();
      });
      toast.appendChild(actionButton);
    }
    document.getElementById('toastRegion').appendChild(toast);
    setTimeout(() => toast.remove(), action ? 7000 : 4300);
    return toast;
  }
});

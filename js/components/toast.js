const EXIT_MS = 150;

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
    const region = document.getElementById('toastRegion');
    region.appendChild(toast);
    // No máximo dois avisos ao mesmo tempo: o mais antigo sai para não cobrir a tela.
    const visible = [...region.querySelectorAll('.toast')];
    for (const old of visible.slice(0, Math.max(0, visible.length - 2))) old.remove();
    // A saída (motion.css, .is-leaving) começa um instante antes; a remoção acontece no mesmo
    // momento de antes, então o tempo total do aviso não muda.
    const lifetime = action ? 7000 : 4300;
    setTimeout(() => toast.classList.add('is-leaving'), lifetime - EXIT_MS);
    setTimeout(() => toast.remove(), lifetime);
    return toast;
  }
});

let completionNotifications = [];
let loading = null;

function normalize(items = []) {
  return items.map(item => ({
    target: 'task',
    id: String(item.taskId || ''),
    eventId: String(item.id || ''),
    title: String(item.title || 'Tarefa concluída'),
    detail: String(item.detail || ''),
    read: item.read === true
  })).filter(item => item.id);
}

export function getCompletionNotifications() {
  return completionNotifications;
}

export function refreshCompletionNotifications() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await window.AtriumAuth?.secureFetch?.('/api/notifications/inbox', { headers: { Accept: 'application/json' } });
      if (!response?.ok) return completionNotifications;
      const payload = await response.json().catch(() => ({}));
      completionNotifications = normalize(payload.notifications);
      return completionNotifications;
    } catch {
      return completionNotifications;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function markCompletionNotificationsRead() {
  const eventIds = completionNotifications.filter(item => !item.read).map(item => item.eventId).filter(Boolean);
  if (!eventIds.length) return 0;
  try {
    const response = await window.AtriumAuth?.secureFetch?.('/api/notifications/inbox/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ eventIds })
    });
    if (!response?.ok) return 0;
    const payload = await response.json().catch(() => ({}));
    completionNotifications = completionNotifications.map(item => ({ ...item, read: true }));
    return Number(payload.marked) || eventIds.length;
  } catch {
    return 0;
  }
}

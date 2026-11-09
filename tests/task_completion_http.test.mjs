import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste HTTP: conclusão de tarefa e central de notificações ---');

const session = await startUiV2Session({ viewport: { width: 1280, height: 800 } });
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  const result = await page.evaluate(async () => {
    const auth = window.AtriumAuth;
    const usersResponse = await auth.secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
    const usersPayload = await usersResponse.json();
    const me = usersPayload.users.find(user => user.username === auth.currentUser.username);
    const taskId = `task-completion-http-${Date.now()}`;
    const task = {
      id: taskId,
      title: 'Tarefa sintética de conclusão',
      description: 'Verifica a confirmação para os envolvidos.',
      status: 'andamento',
      priority: 'normal',
      process: '',
      client: 'Cliente Teste',
      assigneeUserId: me.id,
      followerUserIds: [],
      createdAt: new Date().toISOString()
    };
    window.Atrium.Store.state.tasks.push(task);
    const savedOpen = await window.Atrium.Store.flush();
    if (!savedOpen) return { error: 'open-task-not-saved' };
    const current = window.Atrium.Store.state.tasks.find(item => item.id === taskId);
    current.status = 'concluida';
    current.completedAt = new Date().toISOString();
    const savedDone = await window.Atrium.Store.flush();
    if (!savedDone) return { error: 'completed-task-not-saved' };
    await new Promise(resolve => setTimeout(resolve, 250));
    const inboxResponse = await auth.secureFetch('/api/notifications/inbox', { headers: { Accept: 'application/json' } });
    const inbox = await inboxResponse.json();
    const notification = (inbox.notifications || []).find(item => item.taskId === taskId);
    let marked = 0;
    if (notification) {
      const readResponse = await auth.secureFetch('/api/notifications/inbox/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ eventIds: [notification.id] })
      });
      marked = (await readResponse.json().catch(() => ({}))).marked || 0;
    }
    const after = await (await auth.secureFetch('/api/notifications/inbox', { headers: { Accept: 'application/json' } })).json();
    const persisted = (await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json()).state.tasks.find(item => item.id === taskId);
    return {
      taskId,
      meId: me.id,
      status: persisted?.status,
      completedBy: persisted?.completedBy,
      notification: notification ? { title: notification.title, detail: notification.detail, read: notification.read } : null,
      marked,
      readAfter: (after.notifications || []).find(item => item.taskId === taskId)?.read ?? null
    };
  });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.status, 'concluida');
  assert.equal(result.completedBy, 'Advogada Teste UI V2', 'backend grava o ator da sessão');
  assert.ok(result.notification, 'conclusão aparece na central do envolvido');
  assert.match(result.notification.title, /Tarefa sintética de conclusão/);
  assert.match(result.notification.detail, /Concluída por/);
  assert.equal(result.marked, 1);
  assert.equal(result.readAfter, true);
  assert.deepEqual(pageErrors, []);
  console.log('  OK: conclusão persiste, evento chega ao envolvido e leitura é registrada.');
  console.log('\n[PASS] Central de notificações de conclusão validada no servidor real.');
} finally {
  await session.stop();
}

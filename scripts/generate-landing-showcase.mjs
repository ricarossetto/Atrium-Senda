import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUiV2Session, prepareUiV2Page, switchUiV2View } from '../tests/ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'assets', 'images');
const DOCS_DIR = path.join(ROOT, 'docs', 'assets', 'screenshots');
await mkdir(ASSETS_DIR, { recursive: true });
await mkdir(DOCS_DIR, { recursive: true });

const session = await startUiV2Session();

async function withPage({ theme = 'dark', viewport = { width: 1440, height: 900 } } = {}, callback) {
  const context = await session.createContext({ viewport, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
    await callback(page);
    await page.waitForTimeout(350);
    if (pageErrors.length) {
      console.warn(`[Aviso] Erros na página:`, pageErrors.join(' | '));
    }
  } finally {
    await context.close();
  }
}

async function saveImage(page, filename) {
  const p1 = path.join(ASSETS_DIR, filename);
  const p2 = path.join(DOCS_DIR, filename);
  await page.screenshot({ path: p1, fullPage: false });
  await page.screenshot({ path: p2, fullPage: false });
  console.log(`✓ Gerada: ${filename}`);
}

function getRealisticDemonstrationState() {
  return {
    settings: {
      officeName: 'Rossetto & Associados Advocacia',
      officeSlogan: 'Sociedade de Advogados · Porto Alegre / RS',
      lawyerName: 'Dr. Ricardo Rossetto',
      lawyerOab: 'OAB/RS 88.420',
      city: 'Porto Alegre / RS',
      theme: 'dark',
      guidedTourSeen: true,
      hasA1Certificate: true,
      hasTotp2FA: true,
      eprocSyncInterval: 'daily',
      djenSyncInterval: 'auto'
    },
    contacts: [
      {
        id: 'contact-1',
        name: 'Construtora Metropolitana Ltda.',
        contactRole: 'cliente',
        document: '04.123.456/0001-89',
        email: 'juridico@metropolitana.com.br',
        mobile: '(51) 99876-5432',
        phone: '(51) 3222-1000',
        city: 'Porto Alegre',
        state: 'RS',
        address: 'Av. Carlos Gomes, 1200, Sala 801',
        notes: 'Cliente corporativo prioritário · Contratos de empreitada e incorporação.',
        relatedProcessNumbers: ['5004321-12.2026.8.21.0001', '5019876-54.2026.8.21.0001']
      },
      {
        id: 'contact-2',
        name: 'Indústria Metalúrgica Gaúcha S/A',
        contactRole: 'cliente',
        document: '92.345.678/0001-10',
        email: 'tributario@metalurgicagaucha.com.br',
        mobile: '(51) 98765-4321',
        city: 'Caxias do Sul',
        state: 'RS',
        address: 'Rua das Indústrias, 450',
        notes: 'Ações tributárias federais · Mandados de Segurança TRF4.',
        relatedProcessNumbers: ['5012345-67.2026.4.04.7100']
      },
      {
        id: 'contact-3',
        name: 'Carolina Mendes Pereira',
        contactRole: 'cliente',
        document: '789.456.123-00',
        email: 'carolina.pereira@gmail.com',
        mobile: '(51) 99123-4567',
        city: 'Porto Alegre',
        state: 'RS',
        notes: 'Ação de responsabilidade civil e indenização.'
      },
      {
        id: 'contact-4',
        name: 'Agrícola Vale Verde S/A',
        contactRole: 'cliente',
        document: '11.222.333/0001-44',
        email: 'contratos@valeverde.com.br',
        mobile: '(55) 99765-1122',
        city: 'Passo Fundo',
        state: 'RS'
      },
      {
        id: 'contact-5',
        name: 'Banco Regional de Crédito S/A',
        contactRole: 'adverso',
        city: 'São Paulo',
        state: 'SP'
      }
    ],
    processes: [
      {
        id: 'proc-1',
        number: '5004321-12.2026.8.21.0001',
        client: 'Construtora Metropolitana Ltda.',
        clientPosition: 'Autor(a)',
        opposingParty: 'Engenharia & Obras Sul Ltda.',
        actionType: 'Obrigação de Fazer c/c Tutela Provisória',
        stage: 'Fase Instrutória',
        court: 'TJRS',
        county: 'Porto Alegre',
        courtUnit: '1ª Vara Cível do Foro Central',
        registeredAt: '2026-02-15',
        lastMovementAt: '2026-09-09',
        lastMovement: 'Concluso para despacho saneador e fixação de pontos controvertidos.',
        monitoring: 'active',
        secrecy: false,
        source: 'eproc TJRS',
        status: 'em_andamento',
        hasA1Key: true
      },
      {
        id: 'proc-2',
        number: '5012345-67.2026.4.04.7100',
        client: 'Indústria Metalúrgica Gaúcha S/A',
        clientPosition: 'Impetrante',
        opposingParty: 'Delegado da Receita Federal do Brasil',
        actionType: 'Mandado de Segurança Coletivo',
        stage: 'Julgamento Colegiado',
        court: 'TRF4',
        county: 'Porto Alegre',
        courtUnit: '2ª Turma Regional Federal',
        registeredAt: '2026-03-20',
        lastMovementAt: '2026-09-10',
        lastMovement: 'Acórdão publicado no DJEN Nacional. Prazo de 15 dias para Embargos.',
        monitoring: 'active',
        secrecy: false,
        source: 'eproc TRF4',
        status: 'em_andamento'
      },
      {
        id: 'proc-3',
        number: '5023456-78.2026.8.21.0010',
        client: 'Carolina Mendes Pereira',
        clientPosition: 'Autora',
        opposingParty: 'Seguradora Aliança do Sul S/A',
        actionType: 'Ação de Cobrança de Seguro c/c Indenização',
        stage: 'Instrução e Julgamento',
        court: 'TJRS',
        county: 'Caxias do Sul',
        courtUnit: '2ª Vara Cível da Comarca de Caxias do Sul',
        registeredAt: '2026-05-12',
        lastMovementAt: '2026-09-08',
        lastMovement: 'Designada audiência de instrução e julgamento por videoconferência.',
        monitoring: 'active',
        secrecy: false,
        source: 'eproc TJRS',
        status: 'em_andamento'
      },
      {
        id: 'proc-4',
        number: '0019876-43.2026.8.21.0001',
        client: 'Construtora Metropolitana Ltda.',
        clientPosition: 'Réu / Excipiente',
        opposingParty: 'Ministério Público Estadual',
        actionType: 'Ação Civil Pública',
        stage: 'Contestação',
        court: 'TJRS',
        county: 'Porto Alegre',
        courtUnit: 'Vara da Fazenda Pública',
        registeredAt: '2026-07-01',
        lastMovementAt: '2026-09-11',
        lastMovement: 'Intimação para apresentação de resposta em 30 dias.',
        monitoring: 'active',
        secrecy: true,
        source: 'eproc TJRS',
        status: 'em_andamento',
        hasA1Key: true
      }
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Elaborar minuta de Embargos de Declaração',
        description: 'Analisar omissão no acórdão do TRF4 quanto à compensação tributária.',
        client: 'Indústria Metalúrgica Gaúcha S/A',
        process: '5012345-67.2026.4.04.7100',
        responsible: 'Dr. Ricardo Rossetto',
        status: 'prioridade',
        priority: 'urgente',
        deadline: '2026-09-18',
        fatalDeadline: '2026-09-18',
        points: 20,
        timeLogs: [{ minutes: 45 }]
      },
      {
        id: 'task-2',
        title: 'Preparar rol de testemunhas e quesitos periciais',
        description: 'Audiência designada na 2ª Vara Cível de Caxias do Sul.',
        client: 'Carolina Mendes Pereira',
        process: '5023456-78.2026.8.21.0010',
        responsible: 'Equipe Cível',
        status: 'andamento',
        priority: 'importante',
        deadline: '2026-09-22',
        points: 15,
        timeLogs: [{ minutes: 30 }]
      },
      {
        id: 'task-3',
        title: 'Conferir andamento e certidão eproc TJRS',
        description: 'Processo em segredo de justiça com chave vinculada.',
        client: 'Construtora Metropolitana Ltda.',
        process: '0019876-43.2026.8.21.0001',
        responsible: 'Dr. Ricardo Rossetto',
        status: 'triagem',
        priority: 'normal',
        deadline: '2026-09-25',
        points: 10,
        timeLogs: []
      }
    ],
    intimations: [
      {
        id: 'pub-1',
        title: 'Intimação de Acórdão · Prazo de Embargos de Declaração (15 dias)',
        process: '5012345-67.2026.4.04.7100',
        client: 'Indústria Metalúrgica Gaúcha S/A',
        court: 'TRF4 · 2ª Turma Regional Federal',
        source: 'DJEN Nacional',
        publishedAt: new Date().toISOString().split('T')[0],
        text: 'Acórdão proferido na Apelação Cível nº 5012345-67.2026.4.04.7100. Ficam as partes intimadas da decisão colegiada para fins de interposição recursal. Prazo: 15 dias.',
        treatmentStatus: 'untreated',
        unread: true,
        urgent: true,
        priority: 'urgente',
        aiSummary: 'Prazo fatal de 15 dias para Embargos de Declaração. Recurso parcialmente provido quanto à repetição de indébito tributário.'
      },
      {
        id: 'pub-2',
        title: 'Designação de Audiência de Instrução e Julgamento',
        process: '5023456-78.2026.8.21.0010',
        client: 'Carolina Mendes Pereira',
        court: 'TJRS · 2ª Vara Cível de Caxias do Sul',
        source: 'eproc TJRS',
        publishedAt: new Date().toISOString().split('T')[0],
        text: 'Vistos. Designo o dia 15/10/2026, às 14h, para realização da audiência de instrução e julgamento por videoconferência oficial.',
        treatmentStatus: 'untreated',
        unread: true,
        urgent: false,
        priority: 'normal',
        aiSummary: 'Audiência de instrução agendada para 15 de outubro. Rol de testemunhas deve ser depositado no prazo comum de 10 dias úteis.'
      },
      {
        id: 'pub-3',
        title: 'Despacho Liminar · Deferimento de Tutela de Urgência',
        process: '5004321-12.2026.8.21.0001',
        client: 'Construtora Metropolitana Ltda.',
        court: 'TJRS · 1ª Vara Cível do Foro Central',
        source: 'eproc TJRS',
        publishedAt: new Date().toISOString().split('T')[0],
        text: 'Defiro o pedido de tutela de urgência antecipada para determinar a liberação imediata das obras mediante caução.',
        treatmentStatus: 'in_review',
        unread: false,
        urgent: false,
        priority: 'normal',
        aiSummary: 'Tutela concedida sob caução idônea. Fixada multa diária de R$ 5.000,00 para cumprimento em 48 horas.'
      },
      {
        id: 'pub-4',
        title: 'Sentença Homologatória de Acordo Extrajudicial',
        process: '0019876-43.2026.8.21.0001',
        client: 'Agrícola Vale Verde S/A',
        court: 'TJRS · Vara da Fazenda Pública',
        source: 'eproc TJRS',
        publishedAt: new Date().toISOString().split('T')[0],
        text: 'Homologo por sentença a transação havida entre as partes para que produza os efeitos jurídicos e legais, extinguindo o feito.',
        treatmentStatus: 'treated',
        treatedAt: new Date().toISOString().split('T')[0],
        unread: false,
        urgent: false,
        priority: 'baixa',
        aiSummary: 'Transação devidamente homologada. Extinção da execução com quitação integral das custas remanescentes.'
      }
    ],
    agenda: [
      {
        id: 'event-1',
        title: 'Audiência de Instrução - 2ª Vara Cível',
        date: '2026-10-15',
        time: '14:00',
        client: 'Carolina Mendes Pereira',
        process: '5023456-78.2026.8.21.0010',
        location: 'Videoconferência TJRS'
      },
      {
        id: 'event-2',
        title: 'Reunião de Alinhamento Tributário',
        date: '2026-09-15',
        time: '10:30',
        client: 'Indústria Metalúrgica Gaúcha S/A',
        location: 'Sala de Conferências / Meet'
      }
    ]
  };
}

try {
  // 1. DASHBOARD DARK
  console.log('Gerando Dashboard Dark...');
  await withPage({ theme: 'dark' }, async page => {
    await page.evaluate(state => {
      const { App, Store } = window.Atrium;
      Store.state = { ...Store.state, ...state };
      App.renderAll();
      App.switchView('dashboard');
      window.scrollTo(0, 0);
    }, getRealisticDemonstrationState());
    await page.locator('#view-dashboard.active').waitFor();
    await page.waitForTimeout(300);
    await saveImage(page, 'dashboard-dark.png');
  });

  // 2. DASHBOARD LIGHT
  console.log('Gerando Dashboard Light...');
  await withPage({ theme: 'light' }, async page => {
    await page.evaluate(state => {
      const { App, Store } = window.Atrium;
      Store.state = { ...Store.state, ...state };
      App.renderAll();
      App.switchView('dashboard');
      window.scrollTo(0, 0);
    }, getRealisticDemonstrationState());
    await page.locator('#view-dashboard.active').waitFor();
    await page.waitForTimeout(300);
    await saveImage(page, 'dashboard-light.png');
  });

  // 3. PROCESSOS & EPROC TJRS (FULL VIEW, SHARP & CRISP, NO BLURRY DRAWER)
  console.log('Gerando Processos & eproc TJRS...');
  await withPage({ theme: 'dark' }, async page => {
    await page.evaluate(state => {
      const { App, Store } = window.Atrium;
      Store.state = { ...Store.state, ...state };
      App.renderAll();
      App.switchView('processes');
      window.scrollTo(0, 0);
    }, getRealisticDemonstrationState());
    await page.locator('#view-processes.active').waitFor();
    await page.locator('#processTableBody tr').first().waitFor();
    await page.waitForTimeout(300);
    await saveImage(page, 'process-inspector.png');
  });

  // 4. DJEN & INTIMAÇÕES IA (PUBLICATIONS WORKSPACE)
  console.log('Gerando DJEN & Intimações IA...');
  await withPage({ theme: 'dark' }, async page => {
    await page.evaluate(state => {
      const { App, Store } = window.Atrium;
      Store.state = { ...Store.state, ...state };
      App.renderAll();
      App.switchView('inbox');
      window.scrollTo(0, 0);
    }, getRealisticDemonstrationState());
    await page.locator('#view-inbox.active').waitFor();
    await page.waitForTimeout(300);
    await saveImage(page, 'publications-workspace.png');
  });

  // 5. CONTATOS & CLIENTES (FULL SHARP DIRECTORY)
  console.log('Gerando Contatos & Clientes CRM...');
  await withPage({ theme: 'dark' }, async page => {
    await page.evaluate(state => {
      const { App, Store } = window.Atrium;
      Store.state = { ...Store.state, ...state };
      App.renderAll();
      App.switchView('contacts');
      window.scrollTo(0, 0);
    }, getRealisticDemonstrationState());
    await page.locator('#view-contacts.active').waitFor();
    await page.waitForTimeout(300);
    await saveImage(page, 'contacts-registry.png');
  });

  // 6. CONEXÕES & CERTIFICADO A1 (INTEGRATIONS PANEL)
  console.log('Gerando Conexões Judiciais & A1...');
  await withPage({ theme: 'dark' }, async page => {
    await page.evaluate(state => {
      const { App, Store } = window.Atrium;
      Store.state = { ...Store.state, ...state };
      App.renderAll();
      App.switchView('integrations');
      window.scrollTo(0, 0);
    }, getRealisticDemonstrationState());
    await page.locator('#view-integrations.active').waitFor();
    await page.waitForTimeout(300);
    await saveImage(page, 'integrations.png');
  });

  console.log('✓ Todas as imagens de vitrine foram geradas com sucesso!');
} finally {
  await session.stop();
}

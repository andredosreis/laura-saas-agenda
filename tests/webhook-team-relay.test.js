/**
 * Regressão: respostas do número pessoal do admin são recados internos.
 *
 * Nunca podem criar a responsável como lead nem invocar o agente comercial. Texto e
 * áudio transcrito resolvem o destinatário no tenant, enviam o recado escrito e
 * mantêm a IA do contacto activa.
 */

import { jest } from '@jest/globals';

const sendCalls = [];
const processLeadCalls = [];
const processClientCalls = [];
const transcribeCalls = [];
const parseTeamReplyCalls = [];
const failedSendPhones = new Set();
let transcribedText = 'Confirma marcação da Silva';
let parseTeamReplyError = null;
let parsedTeamReply = {
  action: 'clarify',
  recipient_hint: null,
  message_to_contact: null,
  clarification: 'A quem devo enviar o recado?',
};

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockImplementation((...args) => {
    sendCalls.push(args);
    return Promise.resolve({ success: !failedSendPhones.has(args[0]) });
  }),
  getMediaBase64: jest.fn().mockResolvedValue({
    success: true,
    base64: 'ADMIN_AUDIO_B64',
    mimetype: 'audio/ogg',
  }),
}));

jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead: jest.fn().mockImplementation((args) => {
    processLeadCalls.push(args);
    return Promise.resolve({ success: true });
  }),
  processClient: jest.fn().mockImplementation((args) => {
    processClientCalls.push(args);
    return Promise.resolve({ success: true });
  }),
  transcribeAudio: jest.fn().mockImplementation((args) => {
    transcribeCalls.push(args);
    return Promise.resolve({ text: transcribedText });
  }),
  parseTeamReply: jest.fn().mockImplementation((args) => {
    parseTeamReplyCalls.push(args);
    if (parseTeamReplyError) return Promise.reject(parseTeamReplyError);
    return Promise.resolve(parsedTeamReply);
  }),
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../src/app.js');
const { clearDB, setupTestDB, teardownTestDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

const WEBHOOK_URL = '/webhook/evolution';
const VALID_API_KEY = 'test-secret-key';
const ADMIN_PHONE = '351910376276';
const flushAsync = (ms = 1200) => new Promise((resolve) => setTimeout(resolve, ms));
let sequence = 0;

function buildTextPayload({
  messageId,
  phone,
  text,
  instance,
  messageTimestamp = Math.floor(Date.now() / 1000),
  fromMe = false,
}) {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe },
      messageTimestamp,
      message: { conversation: text },
    },
  };
}

function buildAudioPayload({ messageId, phone, instance }) {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000),
      messageType: 'audioMessage',
      message: { audioMessage: { mimetype: 'audio/ogg' } },
    },
  };
}

async function createTenant(overrides = {}) {
  sequence += 1;
  const instanceName = `relay-${sequence}`;
  const tenant = await Tenant.create({
    nome: `Clínica Relay ${sequence}`,
    slug: `clinica-relay-${sequence}`,
    plano: { tipo: 'pro', status: 'ativo', trialDias: 7 },
    limites: { maxLeads: 100, leadsAtivo: true },
    whatsapp: { instanceName, numeroWhatsapp: ADMIN_PHONE },
    ...overrides,
  });
  return {
    tenant,
    instanceName,
    models: getModels(getTenantDB(String(tenant._id))),
  };
}

async function createPendingRequest({ tenant, models, contact, type = 'cliente', reason = 'Recado' }) {
  return models.PedidoEquipa.create({
    tenantId: tenant._id,
    contactoTipo: type,
    contactoId: contact._id,
    contactoNome: contact.nome,
    contactoTelefone: contact.telefone,
    motivo: reason,
  });
}

describe('Webhook — canal interno de recados da equipa', () => {
  beforeAll(async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = VALID_API_KEY;
    process.env.IA_SERVICE_URL = 'http://ia-service-test.local';
    process.env.IA_SERVICE_ENABLED = 'true';
    await setupTestDB();
  });

  afterAll(teardownTestDB);

  beforeEach(async () => {
    await clearDB();
    sendCalls.length = 0;
    processLeadCalls.length = 0;
    processClientCalls.length = 0;
    transcribeCalls.length = 0;
    parseTeamReplyCalls.length = 0;
    failedSendPhones.clear();
    transcribedText = 'Confirma marcação da Silva';
    parseTeamReplyError = null;
    parsedTeamReply = {
      action: 'clarify',
      recipient_hint: null,
      message_to_contact: null,
      clarification: 'A quem devo enviar o recado?',
    };
  });

  afterEach(async () => {
    await flushAsync(300);
  });

  test('texto da responsável → envia recado à Anabela e mantém IA activa', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const anabela = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Anabela Cordeiro',
      telefone: '351912345678',
      iaAtiva: true,
    });
    const pending = await createPendingRequest({
      tenant,
      models,
      contact: anabela,
      reason: 'Cliente pediu que a responsável lhe ligasse',
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Anabela Cordeiro',
      message_to_contact: 'A responsável vai ligar-lhe.',
      clarification: null,
    };

    const relayStartedAt = Date.now();
    const response = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'team-text-1',
        phone: ADMIN_PHONE,
        text: 'Diga para Anabela Cordeiro que eu vou ligar para ela',
        instance: instanceName,
        // Simula interpretação lenta: o instante da entrada já tem 2 minutos.
        messageTimestamp: Math.floor((Date.now() - 2 * 60 * 1000) / 1000),
      }));

    expect(response.status).toBe(200);
    await flushAsync();

    expect(processLeadCalls).toHaveLength(0);
    expect(processClientCalls).toHaveLength(0);
    expect(parseTeamReplyCalls).toHaveLength(1);
    expect(parseTeamReplyCalls[0].tenantId).toBe(String(tenant._id));

    expect(sendCalls).toEqual(expect.arrayContaining([
      [anabela.telefone, 'A responsável vai ligar-lhe.', instanceName],
      [ADMIN_PHONE, '✅ Recado enviado a Anabela Cordeiro.', instanceName],
    ]));

    const outbound = await models.Mensagem.findOne({
      tenantId: tenant._id,
      telefone: anabela.telefone,
      direcao: 'saida',
    }).lean();
    expect(outbound?.mensagem).toBe('A responsável vai ligar-lhe.');
    expect(outbound?.geradoPor).toBe('humano');
    expect(outbound?.data.getTime()).toBeGreaterThanOrEqual(relayStartedAt);

    const updatedRequest = await models.PedidoEquipa.findById(pending._id).lean();
    expect(updatedRequest.status).toBe('entregue');
    expect(updatedRequest.respostaMessageId).toBe('team-text-1');

    const updatedClient = await models.Cliente.findById(anabela._id).lean();
    expect(updatedClient.iaAtiva).toBe(true);
    expect(await models.Lead.countDocuments({ tenantId: tenant._id, telefone: ADMIN_PHONE })).toBe(0);

    // O eco fromMe do Evolution deve casar com a saída acabada de persistir,
    // não duplicar a mensagem nem pausar a IA do contacto.
    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'team-text-1-echo',
        phone: anabela.telefone,
        text: 'A responsável vai ligar-lhe.',
        instance: instanceName,
        fromMe: true,
      }));
    await flushAsync();

    expect(await models.Mensagem.countDocuments({
      tenantId: tenant._id,
      telefone: anabela.telefone,
      direcao: 'saida',
    })).toBe(1);
    expect((await models.Cliente.findById(anabela._id)).iaAtiva).toBe(true);
  });

  test('áudio da responsável → transcreve e confirma a marcação por escrito', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const silva = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Rita Silva',
      telefone: '351923456789',
      iaAtiva: true,
    });
    await createPendingRequest({
      tenant,
      models,
      contact: silva,
      reason: 'Confirmar marcação',
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Silva',
      message_to_contact: 'A responsável confirmou a sua marcação.',
      clarification: null,
    };

    const response = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildAudioPayload({
        messageId: 'team-audio-1',
        phone: ADMIN_PHONE,
        instance: instanceName,
      }));

    expect(response.status).toBe(200);
    await flushAsync(1800);

    expect(transcribeCalls).toHaveLength(1);
    expect(processLeadCalls).toHaveLength(0);
    expect(processClientCalls).toHaveLength(0);
    expect(sendCalls).toEqual(expect.arrayContaining([
      [silva.telefone, 'A responsável confirmou a sua marcação.', instanceName],
      [ADMIN_PHONE, '✅ Recado enviado a Rita Silva.', instanceName],
    ]));
  });

  test('apelido ambíguo → pede nome completo e não envia a nenhum cliente', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const [ana, rita] = await Promise.all([
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Ana Silva',
        telefone: '351934567891',
      }),
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Rita Silva',
        telefone: '351934567892',
      }),
    ]);
    await Promise.all([
      createPendingRequest({ tenant, models, contact: ana }),
      createPendingRequest({ tenant, models, contact: rita }),
    ]);
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Silva',
      message_to_contact: 'A responsável confirmou a sua marcação.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'team-ambiguous-1',
        phone: ADMIN_PHONE,
        text: 'Confirma marcação da Silva',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0][0]).toBe(ADMIN_PHONE);
    expect(sendCalls[0][1]).toMatch(/mais de um contacto/i);
    expect(processLeadCalls).toHaveLength(0);
  });

  test('nome curto não casa por substring com pedido pendente de Mariana', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const [ana, mariana] = await Promise.all([
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Ana',
        telefone: '351934567893',
      }),
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Mariana Silva',
        telefone: '351934567894',
      }),
    ]);
    await createPendingRequest({ tenant, models, contact: mariana });

    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Ana',
      message_to_contact: 'A responsável vai ligar-lhe.',
      clarification: null,
    };
    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'exact-name-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Ana que eu vou ligar para ela',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toEqual(expect.arrayContaining([
      [ana.telefone, 'A responsável vai ligar-lhe.', instanceName],
    ]));
    expect(sendCalls.some(([phone]) => phone === mariana.telefone)).toBe(false);
  });

  test('nome exacto vence um pedido pendente com nome composto parcial', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const [ana, anaMaria] = await Promise.all([
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Ana',
        telefone: '351934567897',
      }),
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Ana Maria',
        telefone: '351934567898',
      }),
    ]);
    await createPendingRequest({ tenant, models, contact: anaMaria });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Ana',
      message_to_contact: 'A responsável vai ligar-lhe.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'exact-over-pending-partial-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Ana que eu vou ligar para ela',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toEqual(expect.arrayContaining([
      [ana.telefone, 'A responsável vai ligar-lhe.', instanceName],
    ]));
    expect(sendCalls.some(([phone]) => phone === anaMaria.telefone)).toBe(false);
  });

  test('pronome não é tratado como nome quando há vários pedidos pendentes', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const [anabela, rita] = await Promise.all([
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Anabela Cordeiro',
        telefone: '351934567895',
      }),
      models.Cliente.create({
        tenantId: tenant._id,
        nome: 'Rita Costa',
        telefone: '351934567896',
      }),
    ]);
    await Promise.all([
      createPendingRequest({ tenant, models, contact: anabela }),
      createPendingRequest({ tenant, models, contact: rita }),
    ]);
    parsedTeamReply = {
      action: 'clarify',
      recipient_hint: null,
      message_to_contact: null,
      clarification: 'A quem devo enviar o recado?',
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'pronoun-ambiguous-1',
        phone: ADMIN_PHONE,
        text: 'Diga para ela que eu vou ligar',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0][0]).toBe(ADMIN_PHONE);
    expect(sendCalls[0][1]).toMatch(/quem|nome completo|mais de um/i);
  });

  test('mesma frase vinda de número não-admin continua no fluxo normal de lead', async () => {
    const { instanceName } = await createTenant();
    const phone = '351945678901';

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'not-admin-1',
        phone,
        text: 'Diga para Anabela Cordeiro que eu vou ligar para ela',
        instance: instanceName,
      }));
    await flushAsync();

    expect(processLeadCalls).toHaveLength(1);
    expect(processLeadCalls[0].telefone).toBe(phone);
    expect(sendCalls).toHaveLength(0);
  });

  test('resolve nome com acentos mesmo sem pedido pendente', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const jose = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'José Ávila',
      telefone: '351945678902',
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'José Ávila',
      message_to_contact: 'A responsável vai ligar-lhe.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'accent-name-1',
        phone: ADMIN_PHONE,
        text: 'Diga ao José Ávila que eu vou ligar para ele',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toEqual(expect.arrayContaining([
      [jose.telefone, 'A responsável vai ligar-lhe.', instanceName],
      [ADMIN_PHONE, '✅ Recado enviado a José Ávila.', instanceName],
    ]));
    expect(processLeadCalls).toHaveLength(0);
  });

  test('recado livre usa a IA só para interpretar e o backend escolhe o telefone', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const anabela = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Anabela Cordeiro',
      telefone: '351945678903',
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Anabela Cordeiro',
      message_to_contact: 'A responsável pediu para aguardar pelo contacto amanhã.',
      phone: '351999999999',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'free-relay-1',
        phone: ADMIN_PHONE,
        text: 'Quanto à Anabela, pede-lhe por favor que aguarde o meu contacto amanhã',
        instance: instanceName,
      }));
    await flushAsync();

    expect(parseTeamReplyCalls).toHaveLength(1);
    expect(sendCalls).toEqual(expect.arrayContaining([
      [
        anabela.telefone,
        'A responsável pediu para aguardar pelo contacto amanhã.',
        instanceName,
      ],
    ]));
    expect(sendCalls.some(([phone]) => phone === '351999999999')).toBe(false);
  });

  test('resolve com segurança um nome não-latino', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const cliente = await models.Cliente.create({
      tenantId: tenant._id,
      nome: '李小娜',
      telefone: '351945678904',
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: '李小娜',
      message_to_contact: 'A responsável confirmou a sua marcação.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'unicode-name-1',
        phone: ADMIN_PHONE,
        text: 'Confirma a marcação de 李小娜',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toEqual(expect.arrayContaining([
      [cliente.telefone, 'A responsável confirmou a sua marcação.', instanceName],
    ]));
  });

  test('kill switch global bloqueia o canal interno sem criar lead', async () => {
    const { tenant, instanceName, models } = await createTenant({
      configuracoes: { iaGlobalAtiva: false },
    });
    const anabela = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Anabela Cordeiro',
      telefone: '351945678905',
    });
    const pending = await createPendingRequest({ tenant, models, contact: anabela });

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'relay-kill-switch-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Anabela Cordeiro que eu vou ligar para ela',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toHaveLength(0);
    expect(parseTeamReplyCalls).toHaveLength(0);
    expect(processLeadCalls).toHaveLength(0);
    expect((await models.PedidoEquipa.findById(pending._id)).status).toBe('pendente');
    expect(await models.Lead.countDocuments({ telefone: ADMIN_PHONE })).toBe(0);
  });

  test('contato.telefone público não autoriza o envio de recados', async () => {
    const { tenant, instanceName } = await createTenant();
    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $unset: { 'whatsapp.numeroWhatsapp': 1 },
        $set: { 'contato.telefone': ADMIN_PHONE },
      },
    );

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'public-phone-not-admin-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Anabela que eu vou ligar para ela',
        instance: instanceName,
      }));
    await flushAsync();

    expect(parseTeamReplyCalls).toHaveLength(0);
    expect(processLeadCalls).toHaveLength(1);
  });

  test('destinatário que resolve para o próprio admin é recusado', async () => {
    const { tenant, instanceName, models } = await createTenant();
    await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Marta Responsável',
      telefone: ADMIN_PHONE,
      iaAtiva: true,
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Marta Responsável',
      message_to_contact: 'Mensagem que nunca deve sair.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'self-target-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Marta Responsável que está confirmado',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0][0]).toBe(ADMIN_PHONE);
    expect(sendCalls[0][1]).toMatch(/próprio número do admin/i);
    expect(await models.Mensagem.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  test('falha do parser informa o admin e não envia a nenhum contacto', async () => {
    const { tenant, instanceName, models } = await createTenant();
    await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Anabela Cordeiro',
      telefone: '351945678906',
    });
    parseTeamReplyError = new Error('ia-service indisponível');

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'parse-failure-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Anabela que eu vou ligar',
        instance: instanceName,
      }));
    await flushAsync();

    expect(parseTeamReplyCalls).toHaveLength(1);
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0][0]).toBe(ADMIN_PHONE);
    expect(sendCalls[0][1]).toMatch(/não consegui interpretar/i);
    expect(await models.Mensagem.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  test('falha de envio remove a persistência preventiva e mantém o pedido pendente', async () => {
    const { tenant, instanceName, models } = await createTenant();
    const anabela = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Anabela Cordeiro',
      telefone: '351945678907',
      iaAtiva: true,
    });
    const pending = await createPendingRequest({ tenant, models, contact: anabela });
    failedSendPhones.add(anabela.telefone);
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Anabela Cordeiro',
      message_to_contact: 'A responsável vai ligar-lhe.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'send-failure-1',
        phone: ADMIN_PHONE,
        text: 'Diga à Anabela Cordeiro que eu vou ligar',
        instance: instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toEqual(expect.arrayContaining([
      [anabela.telefone, 'A responsável vai ligar-lhe.', instanceName],
    ]));
    expect(sendCalls.some(
      ([phone, text]) => phone === ADMIN_PHONE && /não consegui enviar/i.test(text),
    )).toBe(true);
    expect(await models.Mensagem.countDocuments({
      tenantId: tenant._id,
      telefone: anabela.telefone,
      direcao: 'saida',
    })).toBe(0);
    expect((await models.PedidoEquipa.findById(pending._id)).status).toBe('pendente');
    expect((await models.Cliente.findById(anabela._id)).iaAtiva).toBe(true);
  });

  test('admin do tenant A nunca resolve contacto que existe apenas no tenant B', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    await tenantB.models.Cliente.create({
      tenantId: tenantB.tenant._id,
      nome: 'Anabela Cordeiro',
      telefone: '351956789012',
    });
    parsedTeamReply = {
      action: 'relay',
      recipient_hint: 'Anabela Cordeiro',
      message_to_contact: 'A responsável vai ligar-lhe.',
      clarification: null,
    };

    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildTextPayload({
        messageId: 'cross-tenant-1',
        phone: ADMIN_PHONE,
        text: 'Diga para Anabela Cordeiro que eu vou ligar para ela',
        instance: tenantA.instanceName,
      }));
    await flushAsync();

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0][0]).toBe(ADMIN_PHONE);
    expect(sendCalls[0][1]).toMatch(/não encontrei/i);
    expect(processLeadCalls).toHaveLength(0);
  });
});

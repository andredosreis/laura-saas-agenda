// getTenantDBAdmin — acessor read-only do painel (Gate 4b). É fail-closed:
// sem MONGO_TENANT_RO_URI lança, NUNCA cai na conexão principal read-write.
//
// F14 — Read-Only Connection Runtime Verification: verifyTenantROEnforcement()
// prova em runtime que a credencial de MONGO_TENANT_RO_URI é read-only, em DUAS
// camadas — enumeração de privilégios (connectionStatus, sem escrita) + canário
// de escrita. O mongodb-memory-server é RW por natureza (sem auth) → serve para o
// caminho COMPROMETIDO (o insert do canário passa) e para exercitar o
// connectionStatus real. Os restantes caminhos injectam privilégios/colecção falsos.
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import {
  getTenantDBAdmin,
  verifyTenantROEnforcement,
  privilegesGrantTenantWrite,
  closeTenantDBAdmin,
  _resetROState,
} from '../src/modules/admin/getTenantDBAdmin.js';
import logger from '../src/utils/logger.js';
import { setupTestDB, teardownTestDB } from './setup.js';

const VALID_ID = '507f1f77bcf86cd799439011';

// Privilégios "vazios" — isola o caminho do canário nos testes que não querem
// exercitar a enumeração de privilégios.
const noPrivileges = async () => [];

const authRejectCollection = () => ({
  insertOne: jest.fn().mockRejectedValue(
    Object.assign(new Error('not authorized on tenant_ro_canary to execute command insert'), {
      code: 13,
      codeName: 'Unauthorized',
    })
  ),
  deleteOne: jest.fn(),
});

describe('getTenantDBAdmin — fail-closed', () => {
  it('lança se MONGO_TENANT_RO_URI não estiver definido (nunca usa a conexão principal)', () => {
    const saved = process.env.MONGO_TENANT_RO_URI;
    delete process.env.MONGO_TENANT_RO_URI;
    _resetROState();
    try {
      expect(() => getTenantDBAdmin(VALID_ID)).toThrow(/MONGO_TENANT_RO_URI/);
    } finally {
      if (saved !== undefined) process.env.MONGO_TENANT_RO_URI = saved;
    }
  });
});

describe('privilegesGrantTenantWrite — enumeração de privilégios (F14, camada 1)', () => {
  it('detecta escrita numa DB tenant_<id> específica (o caso que o canário não cobre)', () => {
    expect(
      privilegesGrantTenantWrite([
        { resource: { db: 'tenant_abc', collection: '' }, actions: ['find', 'insert'] },
      ])
    ).toBe(true);
  });

  it('detecta escrita em todas as DBs (db:"" — ex.: readWriteAnyDatabase)', () => {
    expect(
      privilegesGrantTenantWrite([{ resource: { db: '', collection: '' }, actions: ['update'] }])
    ).toBe(true);
  });

  it('detecta anyResource e cluster com acção de escrita', () => {
    expect(
      privilegesGrantTenantWrite([{ resource: { anyResource: true }, actions: ['remove'] }])
    ).toBe(true);
    expect(
      privilegesGrantTenantWrite([{ resource: { cluster: true }, actions: ['dropDatabase'] }])
    ).toBe(true);
  });

  it('read-only sobre todas as DBs (só find/list) → sem escrita', () => {
    expect(
      privilegesGrantTenantWrite([
        { resource: { db: '', collection: '' }, actions: ['find', 'listCollections', 'listIndexes'] },
      ])
    ).toBe(false);
  });

  it('escrita numa DB de control-plane (não-tenant) não conta como escrita de tenant', () => {
    expect(
      privilegesGrantTenantWrite([{ resource: { db: 'laura-saas', collection: 'x' }, actions: ['insert'] }])
    ).toBe(false);
  });

  it('array vazio / entrada não-array → false', () => {
    expect(privilegesGrantTenantWrite([])).toBe(false);
    expect(privilegesGrantTenantWrite(undefined)).toBe(false);
    expect(privilegesGrantTenantWrite(null)).toBe(false);
  });
});

describe('verifyTenantROEnforcement — Gate 4b runtime RO verification (F14)', () => {
  beforeAll(async () => {
    await setupTestDB();
    // Aponta o acessor RO ao MESMO memory-server (RW por natureza, sem auth).
    // Continua uma createConnection SEPARADA e fail-closed — o memory-server só
    // não impõe o read-only, exactamente o que precisamos para o caminho comprometido.
    process.env.MONGO_TENANT_RO_URI = process.env.MONGODB_URI;
  });

  afterAll(async () => {
    await closeTenantDBAdmin();
    await teardownTestDB();
  });

  beforeEach(() => {
    _resetROState();
  });

  it('credencial RW real (memory-server) → deteta escrita → getTenantDBAdmin lança + canário limpo', async () => {
    const errorSpy = jest.spyOn(logger, 'error');

    // Sem injecções: exercita o connectionStatus REAL + o insert REAL contra o
    // memory-server (RW). Qualquer das camadas o deteta → comprometido.
    await verifyTenantROEnforcement();

    expect(() => getTenantDBAdmin(VALID_ID)).toThrow(/Gate 4b comprometido/i);
    expect(errorSpy).toHaveBeenCalled();

    // O canário foi limpo (best-effort delete) — não deixou lixo na sentinela.
    const canaryCount = await mongoose.connection
      .getClient()
      .db('tenant_ro_canary')
      .collection('ro_canary')
      .countDocuments({});
    expect(canaryCount).toBe(0);
  });

  it('camada 1 real (connectionStatus contra memory-server sem auth) → sem escrita → o canário decide', async () => {
    // getEffectivePrivileges = default REAL; canário injectado a recusar por auth.
    // Prova que o connectionStatus real não devolve privilégios de escrita e não
    // compromete falsamente (valida o wiring da camada 1).
    await verifyTenantROEnforcement({ getCanaryCollection: async () => authRejectCollection() });
    expect(() => getTenantDBAdmin(VALID_ID)).not.toThrow();
  });

  it('camada 1: privilégios concedem escrita em tenant_<id> → comprometido sem sequer tocar no canário', async () => {
    const errorSpy = jest.spyOn(logger, 'error');
    const getCanaryCollection = jest.fn(); // não deve ser chamado

    await verifyTenantROEnforcement({
      getEffectivePrivileges: async () => [
        { resource: { db: 'tenant_realid', collection: '' }, actions: ['find', 'insert'] },
      ],
      getCanaryCollection,
    });

    expect(() => getTenantDBAdmin(VALID_ID)).toThrow(/Gate 4b comprometido/i);
    expect(errorSpy).toHaveBeenCalled();
    expect(getCanaryCollection).not.toHaveBeenCalled();
  });

  it('caminho saudável: privilégios só-leitura + canário recusado por autorização → RO verificado', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    const fakeColl = authRejectCollection();

    await verifyTenantROEnforcement({
      getEffectivePrivileges: async () => [{ resource: { db: '', collection: '' }, actions: ['find'] }],
      getCanaryCollection: async () => fakeColl,
    });

    expect(infoSpy).toHaveBeenCalledWith('Gate 4b verificado: credencial RO recusa escrita');
    expect(fakeColl.deleteOne).not.toHaveBeenCalled();
    expect(() => getTenantDBAdmin(VALID_ID)).not.toThrow();
  });

  it('camada 1 inconclusiva (connectionStatus falha) → cai para o canário', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const fakeColl = authRejectCollection();

    await verifyTenantROEnforcement({
      getEffectivePrivileges: async () => {
        throw Object.assign(new Error('command connectionStatus not supported'), { code: 59 });
      },
      getCanaryCollection: async () => fakeColl,
    });

    // Avisou da enumeração inconclusiva, mas o canário confirmou RO → funciona.
    expect(warnSpy).toHaveBeenCalled();
    expect(() => getTenantDBAdmin(VALID_ID)).not.toThrow(/Gate 4b comprometido/i);
  });

  it('erro de rede/timeout no insert do canário → warn, NÃO marca comprometido nem verificado', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const errorSpy = jest.spyOn(logger, 'error');
    const fakeColl = {
      insertOne: jest.fn().mockRejectedValue(
        Object.assign(new Error('connection timed out'), { name: 'MongoNetworkError' })
      ),
      deleteOne: jest.fn(),
    };

    await verifyTenantROEnforcement({
      getEffectivePrivileges: noPrivileges,
      getCanaryCollection: async () => fakeColl,
    });

    expect(warnSpy).toHaveBeenCalled();
    // Um erro de rede não prova nada: não é o caminho comprometido (sem error/Sentry)...
    expect(errorSpy).not.toHaveBeenCalled();
    // ...e não marca comprometido — getTenantDBAdmin continua a funcionar.
    expect(() => getTenantDBAdmin(VALID_ID)).not.toThrow(/Gate 4b comprometido/i);
  });

  it('falha a abrir a conexão RO (canário rejeita) → warn, não comprometido', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const getCanaryCollection = async () => {
      throw Object.assign(new Error('server selection timed out'), {
        name: 'MongoServerSelectionError',
      });
    };

    await verifyTenantROEnforcement({ getEffectivePrivileges: noPrivileges, getCanaryCollection });

    expect(warnSpy).toHaveBeenCalled();
    expect(() => getTenantDBAdmin(VALID_ID)).not.toThrow(/Gate 4b comprometido/i);
  });
});

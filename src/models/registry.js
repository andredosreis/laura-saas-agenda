/**
 * Model Registry — database-per-tenant
 *
 * Dado um `db` (mongoose Connection isolada por tenant),
 * retorna todos os modelos de negócio registados nessa conexão.
 * Se o modelo já estiver registado (cache interno do mongoose),
 * é reutilizado sem re-compilar o schema.
 *
 * Modelos que NÃO passam por aqui (ficam na DB partilhada):
 *   - Tenant  (src/models/Tenant.js)
 *   - User    (src/models/User.js)
 */

import { ClienteSchema }              from './Cliente.js';
import { AgendamentoSchema }          from './Agendamento.js';
import { PacoteSchema }               from './Pacote.js';
import { CompraPacoteSchema }         from './CompraPacote.js';
import { TransacaoSchema }            from './Transacao.js';
import { PagamentoSchema }            from './Pagamento.js';
import { HistoricoAtendimentoSchema } from './HistoricoAtendimento.js';
import { ConversaSchema }             from './Conversa.js';
import { ScheduleSchema }             from './Schedule.js';

/**
 * @param {import('mongoose').Connection} db  — conexão específica do tenant
 * @returns {Record<string, import('mongoose').Model>}
 */
export function getModels(db) {
  // db.model() verifica internamente se o model já existe nesta conexão
  // e reutiliza-o, evitando o erro "Cannot overwrite model once compiled".
  return {
    Cliente:              db.model('Cliente',              ClienteSchema),
    Agendamento:          db.model('Agendamento',          AgendamentoSchema),
    Pacote:               db.model('Pacote',               PacoteSchema),
    CompraPacote:         db.model('CompraPacote',         CompraPacoteSchema),
    Transacao:            db.model('Transacao',            TransacaoSchema),
    Pagamento:            db.model('Pagamento',            PagamentoSchema),
    HistoricoAtendimento: db.model('HistoricoAtendimento', HistoricoAtendimentoSchema),
    Conversa:             db.model('Conversa',             ConversaSchema),
    Schedule:             db.model('Schedule',             ScheduleSchema),
  };
}

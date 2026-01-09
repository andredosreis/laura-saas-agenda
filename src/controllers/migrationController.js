import Agendamento from '../models/Agendamento.js';
import Cliente from '../models/Cliente.js';
import Pacote from '../models/Pacote.js';
import Tenant from '../models/Tenant.js';

export const runMigration = async (req, res) => {
    try {
        const { targetTenantId } = req.body; // Opcional: especificar ID

        // Se não especificado, tenta pegar o tenant do usuário logado
        const tenantId = targetTenantId || req.tenantId;

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID não fornecido e não foi possível determinar a partir do usuário.'
            });
        }

        console.log(`[Migration] Iniciando migração para tenant: ${tenantId}`);

        // 1. Migrar Agendamentos
        const agendamentosResult = await Agendamento.updateMany(
            { tenantId: { $exists: false } },
            { $set: { tenantId: tenantId } }
        );
        console.log(`[Migration] Agendamentos atualizados: ${agendamentosResult.modifiedCount}`);

        // 2. Corrigir servicoAvulsoValor em Agendamentos antigos
        const agendamentosValorResult = await Agendamento.updateMany(
            { servicoAvulsoValor: null },
            { $set: { servicoAvulsoValor: 0 } }
        );
        console.log(`[Migration] Valores avulsos corrigidos: ${agendamentosValorResult.modifiedCount}`);

        // 3. Migrar Clientes
        const clientesResult = await Cliente.updateMany(
            { tenantId: { $exists: false } },
            { $set: { tenantId: tenantId } }
        );
        console.log(`[Migration] Clientes atualizados: ${clientesResult.modifiedCount}`);

        // 4. Migrar Pacotes
        const pacotesResult = await Pacote.updateMany(
            { tenantId: { $exists: false } },
            { $set: { tenantId: tenantId } }
        );
        console.log(`[Migration] Pacotes atualizados: ${pacotesResult.modifiedCount}`);

        res.status(200).json({
            success: true,
            message: 'Migração concluída com sucesso',
            results: {
                tenantId,
                agendamentosMigrados: agendamentosResult.modifiedCount,
                valoresCorrigidos: agendamentosValorResult.modifiedCount,
                clientesMigrados: clientesResult.modifiedCount,
                pacotesMigrados: pacotesResult.modifiedCount
            }
        });

    } catch (error) {
        console.error('[Migration] Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro durante a migração',
            error: error.message
        });
    }
};

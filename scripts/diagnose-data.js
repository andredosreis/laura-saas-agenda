import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

import Agendamento from '../src/models/Agendamento.js';
import Tenant from '../src/models/Tenant.js';

const diagnose = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI não definida no arquivo .env');
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        // 1. Verificar Tenants
        const tenants = await Tenant.find({});
        console.log(`\n=== TENANTS (${tenants.length}) ===`);
        tenants.forEach(t => console.log(`- ${t.name} (ID: ${t._id})`));

        // Obter IDs para verificação
        const tenantIds = tenants.map(t => t._id.toString());

        // 2. Verificar Agendamentos
        const totalAgendamentos = await Agendamento.countDocuments();
        const agendamentosComTenant = await Agendamento.countDocuments({ tenantId: { $in: tenantIds } });
        const agendamentosSemTenant = await Agendamento.countDocuments({ tenantId: { $exists: false } });
        const agendamentosTenantInvalido = totalAgendamentos - agendamentosComTenant - agendamentosSemTenant;

        console.log(`\n=== AGENDAMENTOS ===`);
        console.log(`Total: ${totalAgendamentos}`);
        console.log(`Com Tenant ID válido: ${agendamentosComTenant}`);
        console.log(`Sem Tenant ID: ${agendamentosSemTenant}`);
        console.log(`Com Tenant ID inválido (não encontrado na collection Tenants): ${agendamentosTenantInvalido}`);

        // 3. Verificar campos de Receita
        const comValorAvulso = await Agendamento.countDocuments({ servicoAvulsoValor: { $ne: null } });
        const comPacote = await Agendamento.countDocuments({ pacote: { $ne: null } });

        console.log(`\n=== FINANCEIRO ===`);
        console.log(`Com servicoAvulsoValor: ${comValorAvulso}`);
        console.log(`Com Pacote associado: ${comPacote}`);

        // 4. Verificar Status (para os gráficos)
        const statusCounts = await Agendamento.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        console.log(`\n=== STATUS ===`);
        statusCounts.forEach(s => console.log(`- ${s._id}: ${s.count}`));

        // 5. Amostra de um agendamento sem tenant (se houver)
        if (agendamentosSemTenant > 0) {
            const amostra = await Agendamento.findOne({ tenantId: { $exists: false } });
            console.log(`\n=== AMOSTRA SEM TENANT ===`);
            console.log(JSON.stringify(amostra, null, 2));
        }

    } catch (error) {
        console.error('Erro no diagnóstico:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDesconectado.');
    }
};

diagnose();

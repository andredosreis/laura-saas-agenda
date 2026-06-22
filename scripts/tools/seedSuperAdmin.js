import dotenv from 'dotenv-flow';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../../src/models/User.js';

const email = (process.argv[2] || process.env.SUPERADMIN_EMAIL || '').toLowerCase();
const password = process.argv[3] || process.env.SUPERADMIN_PASSWORD;
const nome = process.argv[4] || process.env.SUPERADMIN_NOME || 'Super Admin';

async function seed() {
  if (!email || !password) {
    console.error('Uso: node scripts/tools/seedSuperAdmin.js <email> <password> [nome]');
    console.error('   (ou definir SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NOME no ambiente)');
    console.error('   Preferir variáveis de ambiente a argumentos — argumentos ficam no histórico da shell.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Ligado ao MongoDB');

  try {
    const existente = await User.findOne({ email, role: 'superadmin' });

    if (existente) {
      const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(12));
      await User.findByIdAndUpdate(existente._id, { $set: { passwordHash } });
      console.log(`Super admin já existia — password actualizada: ${email}`);
    } else {
      await User.createWithPassword({ email, password, nome, role: 'superadmin' });
      console.log(`Super admin criado: ${email}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error) => {
  console.error('Erro ao criar/actualizar super admin:', error);
  process.exit(1);
});

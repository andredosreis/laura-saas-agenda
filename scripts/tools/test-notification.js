import dotenv from 'dotenv-flow';
dotenv.config(); // ← PRIMEIRO, antes de qualquer outro import!

import connectDB from './src/config/db.js';
import { sendReminderNotifications } from './src/controllers/agenteController.js';

(async () => {
  try {
    console.log('🔍 VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY ? '✅ Carregada' : '❌ Não carregada');
    
    await connectDB();
    console.log('✅ MongoDB conectado');
    
    const resultado = await sendReminderNotifications({}, {
      status: () => ({
        json: (data) => console.log('Resultado:', data),
      }),
    });
    
    console.log('\n🎯 Teste completo:', resultado);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  }
})();
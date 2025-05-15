const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.
      MONGO_URI);
    console.log('✅ Conectado ao MongoDB com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;

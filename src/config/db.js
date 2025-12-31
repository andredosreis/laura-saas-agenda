import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`🔌 MongoDB Conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Erro ao conectar ao MongoDB: ${error.message}`);
    // Encerra o processo com falha
    process.exit(1);
  }
};

// A correção principal está aqui:
export default connectDB;
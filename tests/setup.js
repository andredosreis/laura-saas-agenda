const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri)
});

afterAll(async () => {
  await mongoose.disconnect();
  // Close the MongoDB Memory Server
  // This is important to avoid open handles
  await mongoServer.stop();
});



//
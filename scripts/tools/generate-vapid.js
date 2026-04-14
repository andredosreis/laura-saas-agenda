import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();

console.log('=== VAPID KEYS GERADAS ===');
console.log('PUBLIC KEY (guardar em .env.public):');
console.log(vapidKeys.publicKey);
console.log('\nPRIVATE KEY (guardar em .env secretamente):');
console.log(vapidKeys.privateKey);
console.log('==========================');
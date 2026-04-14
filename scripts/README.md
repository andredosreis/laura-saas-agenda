# Scripts de Manutenção e Ferramentas

Utilitários de linha de comando para operações pontuais de manutenção, diagnóstico e configuração. **Nunca são executados automaticamente pelo servidor.**

## Estrutura

```
scripts/
├── maintenance/          # Migrações e correções de dados em produção
│   ├── adjust-client-stage.js
│   ├── check-subscriptions.js
│   └── fix-subscriptions.js
└── tools/                # Utilitários de configuração e teste
    ├── generate-vapid.js
    ├── test-notification.js
    └── test-push.js
```

---

## maintenance/

### `adjust-client-stage.js`
Migração pontual que define o campo `etapaConversa: 'livre'` em todos os clientes que não possuíam o campo. Usada na introdução do módulo de automação WhatsApp.

```bash
node scripts/maintenance/adjust-client-stage.js
```

### `check-subscriptions.js`
Diagnóstico de integridade das Web Push subscriptions no banco de dados. Lista todas as subscriptions e identifica registos com campos obrigatórios em falta (`endpoint`, `keys.p256dh`, `keys.auth`).

```bash
node scripts/maintenance/check-subscriptions.js
```

### `fix-subscriptions.js`
Correção pontual que atribui `userId: 'LAURA'` a subscriptions com `userId: null`, criadas antes da implementação de multi-tenancy.

```bash
node scripts/maintenance/fix-subscriptions.js
```

---

## tools/

### `generate-vapid.js`
Gera um par de chaves VAPID para Web Push. Executar uma vez durante o setup inicial ou rotação de chaves. Copiar os valores para o `.env`.

```bash
node scripts/tools/generate-vapid.js
```

### `test-notification.js`
Testa o pipeline completo de notificações push (conecta ao MongoDB, invoca `sendReminderNotifications`). Útil para validar configuração VAPID em novo ambiente.

```bash
node scripts/tools/test-notification.js
```

### `test-push.js`
Envia uma notificação push de teste directamente para a subscription activa no banco. Útil para validar que o browser está a receber notificações.

```bash
node scripts/tools/test-push.js
```

---

## Pré-requisitos

Todos os scripts requerem o ficheiro `.env` configurado (ver `.env.example`).

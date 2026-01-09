# Instruções para Corrigir os Dados (Migração)

Identifiquei que o motivo dos dados não aparecerem no Calendário e no Financeiro é que os agendamentos antigos não possuem o vínculo com a sua empresa ("Tenant ID"), que foi introduzido na atualização recente.

Corrigi também o contraste do texto (letras claras) no formulário de agendamento.

## Passos para corrigir os dados:

1.  Acesse o seu sistema no navegador (onde você já está logado).
2.  Abra o **Console do Desenvolvedor** (Pressione F12 ou clique com botão direito na página > Inspecionar > Console).
3.  Cole o seguinte comando e pressione Enter:

```javascript
fetch('/api/migration/run', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('laura_access_token')}`
    },
    body: JSON.stringify({})
}).then(r => r.json()).then(console.log).catch(console.error);
```

4.  Você verá uma mensagem de sucesso no console.
5.  Recarregue a página (`F5`).

Os dados devem aparecer agora!

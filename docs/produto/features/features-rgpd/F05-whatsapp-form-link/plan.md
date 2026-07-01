# F05 — WhatsApp Form Link Delivery — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

## Prerequisites
- Project running locally (backend + frontend per `CLAUDE.md` → Environment).
- **F04 implemented and merged** — `FichaToken` model + `FichaToken.emitir` (revoke-prior + create + return raw token), the `gdpr`/`ficha` routers, and the public `/ficha/:token` page. F05 builds directly on `FichaToken.emitir`.
- **F01 implemented** — the `gdpr` module scaffolding (dual-mount via `apiResources`).
- Patterns confirmed: `src/modules/leads/leadController.js` `manualReply` (tenant `whatsapp.instanceName` lookup → `sendWhatsAppMessage` → 502 on failure), `src/utils/evolutionClient.js`, `src/middlewares/{auth,validateObjectId}.js`, `process.env.FRONTEND_URL` usage in `src/services/emailService.js`.

## Phase 1 — Send action (backend)
1. **Message + URL helpers** — Create `src/modules/gdpr/fichaMessage.js` (`FICHA_MESSAGE_TEMPLATE` + `buildFichaMessage({ nome, url })`) and `src/modules/gdpr/fichaUrl.js` (`buildFichaUrl(token)` from `process.env.FRONTEND_URL`, mirroring F04's `url` build; optionally refactor F04's controller to reuse it).
2. **Controller** — Add `enviarFichaWhatsApp` to `src/modules/gdpr/fichaController.js`:
   - validate `:id` ObjectId; load `Cliente` by `{ _id, tenantId: req.tenantId }` → 404 if absent;
   - require `cliente.telefone` → 400 if missing;
   - load `Tenant` `whatsapp.instanceName` (`.select('whatsapp.instanceName').lean()`); if absent → 409 connect-first;
   - issue token via `FichaToken.emitir(req.models, { tenantId: req.tenantId, clienteId: cliente._id, emitidoPor: req.user._id })`;
   - build URL + message; `sendWhatsAppMessage(cliente.telefone, mensagem, instanceName)`; on `!success` → 502 (token left valid);
   - on success → 200 `{ enviado:true, clienteId, telefone, expiresAt }`. Never write `ConsentLog`.
3. **Route** — Add to `src/modules/gdpr/gdprRoutes.js`: `POST /clientes/:id/enviar-ficha` with `authorize('admin','gerente','recepcionista','terapeuta')` + `validateObjectId('id')` → `fichaController.enviarFichaWhatsApp`. (Router already mounted dual-path via F01.)

## Phase 2 — Panel button (frontend)
4. **Button** — In `laura-saas-frontend/src/pages/EditarCliente.jsx` add an "Enviar ficha por WhatsApp" button (design system indigo/purple, `api.js`): `POST /gdpr/clientes/:id/enviar-ficha`; disable while in-flight; on success `toast.success('Ficha enviada por WhatsApp')` + set "ficha enviada" local state; on error show the server `error` (toast/inline), re-enable for retry. Gate visibility with `useAuth()` staff roles.

## Phase 3 — Tests & gates
5. **Tests** — Create `tests/gdpr-ficha-envio.test.js` covering acceptance (deliver link via tenant connection; failure leaves token valid + retry; no-connection 409 with no token/no send), negatives (invalid id/unknown client/no telefone), the no-`ConsentLog` rule, and multi-tenant isolation, per spec §8. Mock `sendWhatsAppMessage`; set `FRONTEND_URL` in the test env.
6. **Gates** — Run `npm run lint` + `npm test` (backend) and `npm run build` + `npm run lint` (frontend) until green; then ready for `/implement-evaluate`.

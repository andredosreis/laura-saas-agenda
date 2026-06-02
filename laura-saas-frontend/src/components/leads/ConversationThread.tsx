import { useEffect, useRef } from 'react';
import { MessageSquare, Bot, User, Headset, Bell } from 'lucide-react';

export interface ThreadMessage {
  _id: string;
  mensagem: string;
  origem: 'cliente' | 'laura';
  /** Quem produziu o outbound: 'ia' (agente), 'humano' (resposta manual), 'sistema' (lembrete automático). Ausente em mensagens antigas → tratado como IA. */
  geradoPor?: 'ia' | 'humano' | 'cliente' | 'sistema';
  data: string;
}

interface ConversationThreadProps {
  messages: ThreadMessage[];
  isPolling: boolean;
  isDarkMode: boolean;
}

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

export function ConversationThread({ messages, isDarkMode }: ConversationThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Scroll fiável até ao fim: mexer no scrollTop do próprio container é mais
  // robusto que scrollIntoView (que falhava a esconder a última mensagem atrás
  // do composer). Re-corre quando muda o nº de mensagens OU a última (id/texto)
  // — cobre o envio otimista + a reconciliação do refetch sem scrollar a cada poll.
  const lastId = messages[messages.length - 1]?._id;
  const lastText = messages[messages.length - 1]?.mensagem;

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastId, lastText]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
          <MessageSquare className={`w-7 h-7 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
        </div>
        <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          Sem mensagens ainda
        </p>
        <p className={`text-xs max-w-xs ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
          As mensagens trocadas via WhatsApp aparecerão aqui quando o ia-service estiver activo.
        </p>
      </div>
    );
  }

  // Agrupa mensagens por dia
  const grupos: { dia: string; msgs: ThreadMessage[] }[] = [];
  for (const msg of messages) {
    const dia = formatDia(msg.data);
    const last = grupos[grupos.length - 1];
    if (last && last.dia === dia) {
      last.msgs.push(msg);
    } else {
      grupos.push({ dia, msgs: [msg] });
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {grupos.map(({ dia, msgs }) => (
        <div key={dia}>
          {/* Day separator */}
          <div className="flex items-center gap-3 my-3">
            <div className={`flex-1 h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
              {dia}
            </span>
            <div className={`flex-1 h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
          </div>

          <div className="space-y-2">
            {msgs.map((msg) => {
              const isOutbound = msg.origem === 'laura';
              // Tema do balão outbound: humano (verde), lembrete automático (âmbar) ou IA (indigo).
              const tema = msg.geradoPor === 'humano'
                ? { avatar: 'bg-emerald-500/20 text-emerald-400', bubble: 'bg-emerald-600', label: '👩 Laura (manual)', sub: 'text-emerald-100', icon: <Headset className="w-4 h-4" /> }
                : msg.geradoPor === 'sistema'
                  ? { avatar: 'bg-amber-500/20 text-amber-400', bubble: 'bg-amber-600', label: '🔔 Lembrete automático', sub: 'text-amber-100', icon: <Bell className="w-4 h-4" /> }
                  : { avatar: 'bg-indigo-500/20 text-indigo-400', bubble: 'bg-indigo-500', label: '🤖 IA', sub: 'text-indigo-200', icon: <Bot className="w-4 h-4" /> };
              return (
                <div key={msg._id} className={`flex items-end gap-2 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar: cliente vs (humano / lembrete / IA) */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    !isOutbound
                      ? isDarkMode ? 'bg-white/10 text-slate-400' : 'bg-gray-200 text-gray-500'
                      : tema.avatar
                  }`}>
                    {!isOutbound ? <User className="w-4 h-4" /> : tema.icon}
                  </div>
                  {/* Bubble — cada origem outbound tem a sua cor */}
                  <div className={`max-w-xs lg:max-w-sm xl:max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                    !isOutbound
                      ? isDarkMode ? 'bg-slate-700 text-white rounded-bl-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                      : `${tema.bubble} text-white rounded-br-sm`
                  }`}>
                    {isOutbound && (
                      <p className={`text-[10px] font-semibold mb-0.5 ${tema.sub}`}>
                        {tema.label}
                      </p>
                    )}
                    <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.mensagem}</p>
                    <p className={`text-xs mt-1 text-right ${
                      !isOutbound ? (isDarkMode ? 'text-slate-500' : 'text-gray-400') : tema.sub
                    }`}>
                      {formatHora(msg.data)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

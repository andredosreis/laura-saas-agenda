import { useAdminTenantUsers } from '../../hooks/useAdminTenantUsers';
import { ConsoleCard } from './ConsoleUI';
import { CopyIdButton } from './CopyIdButton';
import { AdminTenantUser, TenantUserRole } from '../../types/admin';

// F19 — Tenant Users Listing. Componente NOVO (não empilhado em ConsoleUI.tsx,
// que é território do F22/consolidação) — badge de role local, estilo visual
// espelha PlanBadge (ConsoleUI.tsx) sem reutilizar o mapa PLAN_STYLES (que é
// específico de plano.tipo).
const ROLE_STYLES: Record<TenantUserRole, string> = {
  superadmin: 'bg-purple-500/20 text-purple-300',
  admin: 'bg-primary-500/20 text-primary-300',
  gerente: 'bg-amber-500/15 text-amber-300',
  recepcionista: 'bg-dark-700 text-dark-300',
  terapeuta: 'bg-dark-700 text-dark-300',
};

function RoleBadge({ role }: { role: TenantUserRole }) {
  const cls = ROLE_STYLES[role] ?? ROLE_STYLES.recepcionista;
  return (
    <span
      className={`font-console-mono inline-flex items-center h-[22px] px-2.5 rounded-[2px] text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap ${cls}`}
    >
      {role}
    </span>
  );
}

function formatUltimoLogin(value: string | null | undefined): string {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
}

// Dono = 1º utilizador com role 'admin' na listagem — a lista já vem ordenada
// createdAt asc pelo backend (F19: listarUsersTenant, sort createdAt: 1).
function isOwner(user: AdminTenantUser, users: AdminTenantUser[]): boolean {
  const firstAdmin = users.find((u) => u.role === 'admin');
  return !!firstAdmin && firstAdmin._id === user._id;
}

interface UsersCardProps {
  tenantId: string;
}

export function UsersCard({ tenantId }: UsersCardProps) {
  // limit=100 (o máximo do backend) — equipas de um tenant done-for-you são
  // pequenas; evita paginação na UI para uma listagem que cabe sempre numa página.
  const { users, loading, error } = useAdminTenantUsers(tenantId, 1, 100);

  return (
    <ConsoleCard className="mt-4 overflow-hidden">
      <div className="px-6 sm:px-7 pt-6 pb-4 border-b border-white/10">
        <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400">Utilizadores</h3>
      </div>

      {loading ? (
        <div className="p-12 text-center text-dark-400 font-console-mono text-[13px]">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary-500 border-t-transparent mx-auto mb-4" />
          A carregar utilizadores...
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-300 bg-red-500/10 m-4 rounded-[3px] border border-red-500/20 text-[13.5px]">
          {error}
        </div>
      ) : users.length === 0 ? (
        <div className="p-12 text-center text-dark-400 text-[13.5px]">Sem utilizadores.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400">
                <th className="p-3.5 px-[18px] font-medium">Nome</th>
                <th className="p-3.5 font-medium">Email</th>
                <th className="p-3.5 font-medium">Role</th>
                <th className="p-3.5 font-medium">Estado</th>
                <th className="p-3.5 px-[18px] font-medium whitespace-nowrap">Último login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} className="border-b border-white/10 hover:bg-white/5 transition-colors text-[13px]">
                  <td className="p-3.5 px-[18px] text-dark-50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{user.nome}</span>
                      {isOwner(user, users) && (
                        <span className="font-console-mono inline-flex items-center h-[20px] px-2 rounded-[2px] text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-300 whitespace-nowrap">
                          Dono
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-console-mono text-[11px] text-dark-500">
                      <span>{user._id}</span>
                      <CopyIdButton id={user._id} label={`Copiar ID do utilizador ${user.nome}`} />
                    </div>
                  </td>
                  <td className="p-3.5 text-dark-300">{user.email}</td>
                  <td className="p-3.5">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-dark-300">
                      <span
                        className={`w-[7px] h-[7px] rounded-full inline-block ${user.ativo ? 'bg-emerald-400' : 'bg-dark-500'}`}
                      />
                      {user.ativo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-3.5 px-[18px] font-console-mono text-[12px] text-dark-400 whitespace-nowrap">
                    {formatUltimoLogin(user.ultimoLogin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsoleCard>
  );
}

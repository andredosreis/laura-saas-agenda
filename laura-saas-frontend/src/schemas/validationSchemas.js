import { z } from 'zod';

// ============================================
// SCHEMAS DE AUTENTICAÇÃO
// ============================================

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email é obrigatório')
    .email('Formato de email inválido'),
  password: z
    .string()
    .min(1, 'Senha é obrigatória')
    .min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

export const registerSchema = z
  .object({
    nomeEmpresa: z
      .string()
      .min(1, 'Nome da empresa é obrigatório')
      .min(2, 'Nome da empresa deve ter no mínimo 2 caracteres'),
    nome: z
      .string()
      .min(1, 'Nome é obrigatório')
      .min(3, 'Nome deve ter no mínimo 3 caracteres'),
    email: z
      .string()
      .min(1, 'Email é obrigatório')
      .email('Formato de email inválido'),
    telefone: z
      .string()
      .min(1, 'Telefone é obrigatório')
      .regex(/^\d{9,15}$/, 'Telefone deve ter entre 9 e 15 dígitos'),
    password: z
      .string()
      .min(1, 'Senha é obrigatória')
      .min(8, 'Senha deve ter no mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
      .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
      .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
      .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial'),
    confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email é obrigatório')
    .email('Formato de email inválido'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Senha é obrigatória')
      .min(8, 'Senha deve ter no mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
      .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
      .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
      .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial'),
    confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });

// ============================================
// SCHEMAS DE CLIENTE
// ============================================

export const clienteSchema = z.object({
  nome: z
    .string()
    .min(1, 'Nome é obrigatório')
    .min(3, 'Nome deve ter no mínimo 3 caracteres'),
  telefone: z
    .string()
    .min(1, 'Telefone é obrigatório')
    .refine(
      (val) => {
        const digits = val.replace(/\D/g, '');
        return digits.length >= 9 && digits.length <= 15;
      },
      { message: 'Telefone deve ter entre 9 e 15 dígitos' }
    ),
  dataNascimento: z
    .string()
    .min(1, 'Data de nascimento é obrigatória')
    .refine(
      (val) => {
        const birthDate = new Date(val);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const actualAge =
          monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())
            ? age - 1
            : age;
        return actualAge >= 16;
      },
      { message: 'Cliente deve ter pelo menos 16 anos' }
    ),
  pacote: z.string().min(1, 'Pacote é obrigatório'),
  sessoesRestantes: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: 'Sessões restantes deve ser um número maior ou igual a 0',
    }),
  observacoes: z.string().max(500, 'Observações devem ter no máximo 500 caracteres').optional(),
});

// ============================================
// SCHEMAS DE AGENDAMENTO
// ============================================

export const agendamentoSchema = z
  .object({
    cliente: z.string().min(1, 'Cliente é obrigatório'),
    tipoServico: z.enum(['pacote', 'avulso'], {
      required_error: 'Tipo de serviço é obrigatório',
    }),
    pacote: z.string().optional(),
    servicoAvulso: z.string().optional(),
    valorAvulso: z.union([z.string(), z.number()]).optional(),
    dataHora: z
      .string()
      .min(1, 'Data e hora são obrigatórias')
      .refine(
        (val) => {
          const selectedDate = new Date(val);
          const now = new Date();
          return selectedDate > now;
        },
        { message: 'A data e hora devem ser no futuro' }
      ),
    observacoes: z.string().max(500, 'Observações devem ter no máximo 500 caracteres').optional(),
  })
  .refine(
    (data) => {
      if (data.tipoServico === 'pacote') {
        return data.pacote && data.pacote.length > 0;
      }
      return true;
    },
    {
      message: 'Pacote é obrigatório quando o tipo de serviço é pacote',
      path: ['pacote'],
    }
  )
  .refine(
    (data) => {
      if (data.tipoServico === 'avulso') {
        return data.servicoAvulso && data.servicoAvulso.length > 0;
      }
      return true;
    },
    {
      message: 'Descrição do serviço avulso é obrigatória',
      path: ['servicoAvulso'],
    }
  );

// ============================================
// SCHEMAS DE PACOTE
// ============================================

export const pacoteSchema = z.object({
  nome: z
    .string()
    .min(1, 'Nome do pacote é obrigatório')
    .min(2, 'Nome deve ter no mínimo 2 caracteres'),
  categoria: z.string().min(1, 'Categoria é obrigatória'),
  descricao: z.string().max(500, 'Descrição deve ter no máximo 500 caracteres').optional(),
  sessoes: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => !isNaN(val) && val >= 1, {
      message: 'Número de sessões deve ser pelo menos 1',
    }),
  valor: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'Valor deve ser maior que 0',
    }),
  duracao: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => !isNaN(val) && val >= 15, {
      message: 'Duração deve ser pelo menos 15 minutos',
    })
    .optional(),
  ativo: z.boolean().default(true),
});

// ============================================
// HELPERS DE VALIDAÇÃO
// ============================================

// Remove caracteres não numéricos do telefone para validação
export const sanitizePhone = (phone) => phone.replace(/\D/g, '');

// Formata telefone para exibição (XX) XXXXX-XXXX
export const formatPhone = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

// Valida força da senha e retorna feedback
export const getPasswordStrength = (password) => {
  if (!password) return { strength: 0, label: '', color: '' };

  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  const levels = [
    { strength: 0, label: '', color: '' },
    { strength: 1, label: 'Muito fraca', color: 'bg-red-500' },
    { strength: 2, label: 'Fraca', color: 'bg-orange-500' },
    { strength: 3, label: 'Média', color: 'bg-yellow-500' },
    { strength: 4, label: 'Forte', color: 'bg-lime-500' },
    { strength: 5, label: 'Muito forte', color: 'bg-green-500' },
  ];

  return levels[strength];
};

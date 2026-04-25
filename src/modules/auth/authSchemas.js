import { z } from 'zod';

// ─── Primitivos reutilizáveis ───────────────────────────────────────

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .max(254);

const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 9 && v.length <= 15, {
    message: 'Telefone deve ter entre 9 e 15 dígitos',
  });

// Password forte — mesma regra que o frontend aplica no registerSchema
const strongPassword = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .max(128)
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial');

// Password para login — só comprimento mínimo (nunca dar hints ao atacante sobre regras)
const loginPassword = z.string().min(1, 'Senha é obrigatória').max(128);

// Token hex (reset password, email verification)
const hexToken = z
  .string()
  .length(64, 'Token inválido')
  .regex(/^[a-f0-9]+$/i, 'Token inválido');

// ─── Schemas públicos ───────────────────────────────────────────────

export const registerSchema = z
  .object({
    nomeEmpresa: z.string().trim().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres').max(100),
    nome: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
    email,
    password: strongPassword,
    telefone: telefone.optional(),
  })
  .strict(); // bloqueia role, tenantId, emailVerificado, plano enviados via body

export const loginSchema = z
  .object({
    email,
    password: loginPassword,
  })
  .strict();

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: hexToken,
    password: strongPassword,
  })
  .strict();

export const tokenParamSchema = z.object({
  token: hexToken,
});

// ─── Schemas privados (rotas protegidas) ────────────────────────────

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    nome: z.string().trim().min(1).max(100).optional(),
    telefone: telefone.optional(),
    avatar: z.string().trim().max(500).optional(),
    preferencias: z
      .object({
        darkMode: z.boolean().optional(),
        idioma: z.string().max(10).optional(),
        timezone: z.string().max(50).optional(),
        dashboardLayout: z.string().max(50).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória').max(128),
    newPassword: strongPassword,
  })
  .strict();

export const updateTenantSchema = z
  .object({
    nome: z.string().trim().min(2).max(100).optional(),
    whatsapp: z.string().trim().max(20).optional(),
    contato: z
      .object({
        email: email.optional(),
        telefone: z.string().trim().max(20).optional(),
        website: z.string().trim().max(200).optional().or(z.literal('')),
        endereco: z
          .object({
            rua: z.string().trim().max(200).optional(),
            numero: z.string().trim().max(20).optional(),
            cidade: z.string().trim().max(100).optional(),
            codigoPostal: z.string().trim().max(20).optional(),
            pais: z.string().trim().max(100).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    configuracoes: z
      .object({
        horarioInicio: z.string().max(10).optional(),
        horarioFim: z.string().max(10).optional(),
        diasAtivos: z.array(z.number().int().min(0).max(6)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

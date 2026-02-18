import nodemailer from 'nodemailer';

// Criar transporter do nodemailer
const createTransporter = () => {
    // Em desenvolvimento, pode usar ethereal.email para testes
    if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
        console.log('📧 Modo desenvolvimento: emails serão logados no console');
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

let transporter = null;

// Inicializar transporter (chamado no startup)
export const initEmailService = () => {
    transporter = createTransporter();
    if (transporter) {
        console.log('📧 Serviço de email configurado');
    }
};

// Enviar email genérico
export const sendEmail = async ({ to, subject, html, text }) => {
    const mailOptions = {
        from: process.env.SMTP_FROM || '"Laura SAAS" <noreply@laurasaas.com>',
        to,
        subject,
        html,
        text
    };

    // Em dev sem SMTP, apenas logar
    if (!transporter) {
        console.log('📧 [DEV] Email que seria enviado:');
        console.log('   Para:', to);
        console.log('   Assunto:', subject);
        console.log('   Corpo:', text || html);
        return { success: true, dev: true };
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Email enviado:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('📧 Erro ao enviar email:', error);
        throw error;
    }
};

// Template de email para recuperação de senha
export const sendPasswordResetEmail = async (email, resetToken, userName) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-senha/${resetToken}`;

    const subject = 'Recuperação de Senha - Laura SAAS';

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1); padding: 40px;">
                            <!-- Logo -->
                            <tr>
                                <td align="center" style="padding-bottom: 30px;">
                                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                                        <span style="font-size: 28px;">💆‍♀️</span>
                                    </div>
                                </td>
                            </tr>

                            <!-- Título -->
                            <tr>
                                <td align="center" style="padding-bottom: 20px;">
                                    <h1 style="margin: 0; color: #f8fafc; font-size: 24px; font-weight: 600;">
                                        Recuperação de Senha
                                    </h1>
                                </td>
                            </tr>

                            <!-- Mensagem -->
                            <tr>
                                <td style="padding-bottom: 30px;">
                                    <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                        Olá${userName ? `, ${userName}` : ''}!
                                    </p>
                                    <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                        Recebemos um pedido para redefinir a senha da sua conta. Se você não fez este pedido, pode ignorar este email com segurança.
                                    </p>
                                    <p style="margin: 0; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                        Para criar uma nova senha, clique no botão abaixo:
                                    </p>
                                </td>
                            </tr>

                            <!-- Botão -->
                            <tr>
                                <td align="center" style="padding-bottom: 30px;">
                                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                                        Redefinir Senha
                                    </a>
                                </td>
                            </tr>

                            <!-- Aviso -->
                            <tr>
                                <td style="padding: 20px; background: rgba(245, 158, 11, 0.1); border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2);">
                                    <p style="margin: 0; color: #fbbf24; font-size: 14px; line-height: 1.5;">
                                        ⚠️ Este link expira em <strong>1 hora</strong>. Se você não solicitou esta alteração, por favor ignore este email.
                                    </p>
                                </td>
                            </tr>

                            <!-- Link alternativo -->
                            <tr>
                                <td style="padding-top: 30px;">
                                    <p style="margin: 0 0 10px 0; color: #64748b; font-size: 13px;">
                                        Se o botão não funcionar, copie e cole este link no seu navegador:
                                    </p>
                                    <p style="margin: 0; color: #6366f1; font-size: 13px; word-break: break-all;">
                                        ${resetLink}
                                    </p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td align="center" style="padding-top: 40px; border-top: 1px solid rgba(255, 255, 255, 0.1); margin-top: 40px;">
                                    <p style="margin: 0; color: #475569; font-size: 12px;">
                                        © ${new Date().getFullYear()} Laura SAAS. Todos os direitos reservados.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const text = `
Olá${userName ? `, ${userName}` : ''}!

Recebemos um pedido para redefinir a senha da sua conta Laura SAAS.

Para criar uma nova senha, acesse o link abaixo:
${resetLink}

Este link expira em 1 hora.

Se você não solicitou esta alteração, por favor ignore este email.

---
© ${new Date().getFullYear()} Laura SAAS. Todos os direitos reservados.
    `;

    return sendEmail({ to: email, subject, html, text });
};

// Template de email para verificação de conta
export const sendEmailVerificationEmail = async (email, verificationToken, userName) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyLink = `${frontendUrl}/verificar-email/${verificationToken}`;

    const subject = 'Confirme o seu email - Laura SAAS';

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
                <tr>
                    <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1); padding: 40px;">
                            <tr>
                                <td align="center" style="padding-bottom: 30px;">
                                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                                        <span style="font-size: 28px;">✅</span>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding-bottom: 20px;">
                                    <h1 style="margin: 0; color: #f8fafc; font-size: 24px; font-weight: 600;">
                                        Confirme o seu email
                                    </h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding-bottom: 30px;">
                                    <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                        Olá${userName ? `, ${userName}` : ''}!
                                    </p>
                                    <p style="margin: 0; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                        Obrigado por criar a sua conta no Laura SAAS. Clique no botão abaixo para confirmar o seu email e ativar a sua conta.
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding-bottom: 30px;">
                                    <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                                        Confirmar Email
                                    </a>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 20px; background: rgba(245, 158, 11, 0.1); border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2);">
                                    <p style="margin: 0; color: #fbbf24; font-size: 14px; line-height: 1.5;">
                                        ⚠️ Este link expira em <strong>24 horas</strong>. Se não foi você, ignore este email.
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding-top: 30px;">
                                    <p style="margin: 0 0 10px 0; color: #64748b; font-size: 13px;">
                                        Se o botão não funcionar, copie e cole este link no seu navegador:
                                    </p>
                                    <p style="margin: 0; color: #6366f1; font-size: 13px; word-break: break-all;">
                                        ${verifyLink}
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding-top: 40px; border-top: 1px solid rgba(255, 255, 255, 0.1); margin-top: 40px;">
                                    <p style="margin: 0; color: #475569; font-size: 12px;">
                                        © ${new Date().getFullYear()} Laura SAAS. Todos os direitos reservados.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const text = `
Olá${userName ? `, ${userName}` : ''}!

Obrigado por criar a sua conta no Laura SAAS. Acesse o link abaixo para confirmar o seu email:
${verifyLink}

Este link expira em 24 horas.

Se não foi você, ignore este email.

---
© ${new Date().getFullYear()} Laura SAAS. Todos os direitos reservados.
    `;

    return sendEmail({ to: email, subject, html, text });
};

export default {
    initEmailService,
    sendEmail,
    sendPasswordResetEmail,
    sendEmailVerificationEmail
};

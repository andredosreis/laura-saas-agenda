import User from '../../models/User.js';

export const TWO_FACTOR_REQUIRED_ERROR =
  '2FA obrigatório. Configure em Segurança antes de usar o painel.';
export const TWO_FACTOR_SESSION_ERROR =
  'Sessão sem 2FA. Volte a iniciar sessão.';
// O frontend distingue este 403 pelo `code`, nunca pelo texto: a mensagem é copy
// e muda sem aviso. Mesma convenção de TOKEN_EXPIRED/CHALLENGE_EXPIRED.
export const TWO_FACTOR_SETUP_REQUIRED_CODE = 'TWO_FACTOR_SETUP_REQUIRED';

/**
 * Enforcement de TOTP para o painel super-admin (F16).
 *
 * Recuperação manual do operador único: remover `twoFactor` do User
 * superadmin na DB partilhada e voltar a fazer o enrolamento. A flag deve ficar
 * desligada durante essa operação para manter apenas a rota de setup acessível.
 */
export const require2FA = async (req, res, next) => {
  if (process.env.SUPERADMIN_REQUIRE_2FA !== 'true') return next();

  try {
    const user = await User.findById(req.user.userId || req.user._id)
      .select('twoFactor.enabled')
      .lean();

    if (!user?.twoFactor?.enabled) {
      return res.status(403).json({
        success: false,
        error: TWO_FACTOR_REQUIRED_ERROR,
        code: TWO_FACTOR_SETUP_REQUIRED_CODE,
      });
    }

    if (req.user.mfa !== true) {
      return res.status(401).json({ success: false, error: TWO_FACTOR_SESSION_ERROR });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

export default require2FA;

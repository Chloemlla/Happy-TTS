import { login } from "./auth/loginHandlers";
import { passkeyVerify } from "./auth/passkeyHandlers";
import { forgotPassword, resetPassword, resetPasswordLink, validateResetToken } from "./auth/passwordResetHandlers";
import {
  confirmProviderBind,
  getAuthProvidersPublicConfig,
  getGoogleAuthConfig,
  getProviderBindSession,
  googleAuth,
  googleBind,
  googleBindSession,
} from "./auth/providerHandlers";
import { register, sendVerifyEmail, verifyEmail, verifyEmailLink } from "./auth/registrationHandlers";
import { establishSession, getCurrentUser, listSessions, revokeSessionDevice } from "./auth/sessionHandlers";

export { logoutHandler, registerLogoutRoute } from "./auth/sessionHandlers";

export const AuthController = {
  getGoogleAuthConfig,
  getAuthProvidersPublicConfig,
  googleAuth,
  googleBindSession,
  getProviderBindSession,
  confirmProviderBind,
  googleBind,
  register,
  verifyEmailLink,
  verifyEmail,
  sendVerifyEmail,
  login,
  getCurrentUser,
  listSessions,
  revokeSessionDevice,
  establishSession,
  passkeyVerify,
  forgotPassword,
  resetPasswordLink,
  validateResetToken,
  resetPassword,
};

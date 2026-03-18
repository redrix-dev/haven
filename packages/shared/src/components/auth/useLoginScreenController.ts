import React from 'react';
import { getErrorMessage } from '@platform/lib/errors';
import { useAuth } from '@shared/contexts/AuthContext';

const isEmailNotConfirmedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === 'string' ? maybeError.code.toLowerCase() : '';
  const message = typeof maybeError.message === 'string' ? maybeError.message.toLowerCase() : '';

  return (
    code === 'email_not_confirmed' ||
    message.includes('email not confirmed') ||
    message.includes('confirm your email')
  );
};

export function useLoginScreenController() {
  const [isSignUp, setIsSignUp] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showVerificationModal, setShowVerificationModal] = React.useState(false);
  const [verificationChecking, setVerificationChecking] = React.useState(false);
  const [verificationStatus, setVerificationStatus] = React.useState('');
  const [verificationError, setVerificationError] = React.useState('');
  const [showForgotPasswordModal, setShowForgotPasswordModal] = React.useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = React.useState('');
  const [forgotPasswordSending, setForgotPasswordSending] = React.useState(false);
  const [forgotPasswordStatus, setForgotPasswordStatus] = React.useState('');
  const [forgotPasswordError, setForgotPasswordError] = React.useState('');
  const [pendingVerificationCredentials, setPendingVerificationCredentials] = React.useState<{
    email: string;
    password: string;
  } | null>(null);

  const { requestPasswordReset, signIn, signUp } = useAuth();

  const closeVerificationModal = React.useCallback(() => {
    setShowVerificationModal(false);
  }, []);

  const closeForgotPasswordModal = React.useCallback(() => {
    setShowForgotPasswordModal(false);
  }, []);

  const openForgotPasswordModal = React.useCallback(() => {
    setForgotPasswordEmail(email.trim());
    setForgotPasswordError('');
    setForgotPasswordStatus('');
    setShowForgotPasswordModal(true);
  }, [email]);

  const toggleMode = React.useCallback(() => {
    setIsSignUp((value) => !value);
    setError('');
  }, []);

  const handleVerificationRecheck = React.useCallback(async () => {
    if (verificationChecking) return;

    const nextEmail = pendingVerificationCredentials?.email ?? email.trim();
    const nextPassword = pendingVerificationCredentials?.password ?? password;
    if (!nextEmail || !nextPassword) {
      setVerificationError(
        'Enter your email and password, then recheck verification status.'
      );
      setVerificationStatus('');
      return;
    }

    setPendingVerificationCredentials({ email: nextEmail, password: nextPassword });
    setVerificationChecking(true);
    setVerificationError('');
    setVerificationStatus('');

    try {
      const { error: signInError } = await signIn(nextEmail, nextPassword);

      if (!signInError) {
        setVerificationStatus('Email verified. Signing you in...');
        return;
      }

      if (isEmailNotConfirmedError(signInError)) {
        setVerificationStatus(
          'Email is not verified yet. Open the verification email, then recheck.'
        );
        return;
      }

      throw signInError;
    } catch (recheckError: unknown) {
      setVerificationError(
        getErrorMessage(recheckError, 'Failed to verify your email status.')
      );
    } finally {
      setVerificationChecking(false);
    }
  }, [
    email,
    password,
    pendingVerificationCredentials,
    signIn,
    verificationChecking,
  ]);

  const handleSubmit = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      setError('');
      setLoading(true);

      try {
        if (isSignUp) {
          if (!username.trim()) {
            setError('Username is required');
            setLoading(false);
            return;
          }

          const normalizedEmail = email.trim();
          const { error: signUpError } = await signUp(normalizedEmail, password, username);
          if (signUpError) throw signUpError;

          setPendingVerificationCredentials({
            email: normalizedEmail,
            password,
          });
          setShowVerificationModal(true);
          setVerificationChecking(false);
          setVerificationError('');
          setVerificationStatus(
            `We sent a verification link to ${normalizedEmail}. Open it to finish verification.`
          );
          setIsSignUp(false);
          return;
        }

        const { error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
      } catch (submitError: unknown) {
        setError(getErrorMessage(submitError, 'An error occurred'));
      } finally {
        setLoading(false);
      }
    },
    [email, isSignUp, password, signIn, signUp, username]
  );

  const handleForgotPasswordSubmit = React.useCallback(async () => {
    const normalizedEmail = forgotPasswordEmail.trim();
    if (!normalizedEmail) {
      setForgotPasswordError('Email is required.');
      setForgotPasswordStatus('');
      return;
    }

    setForgotPasswordSending(true);
    setForgotPasswordError('');
    setForgotPasswordStatus('');

    try {
      const { error: resetError } = await requestPasswordReset(normalizedEmail);
      if (resetError) throw resetError;

      setForgotPasswordStatus(
        `Password reset link sent to ${normalizedEmail}. Open it and Haven will prompt you to set a new password.`
      );
    } catch (submitError: unknown) {
      setForgotPasswordError(
        getErrorMessage(submitError, 'Failed to send password reset email.')
      );
    } finally {
      setForgotPasswordSending(false);
    }
  }, [forgotPasswordEmail, requestPasswordReset]);

  const canRecheckVerification =
    Boolean((pendingVerificationCredentials?.email ?? email.trim()).trim()) &&
    Boolean(pendingVerificationCredentials?.password ?? password);

  return {
    state: {
      email,
      error,
      forgotPasswordEmail,
      forgotPasswordError,
      forgotPasswordSending,
      forgotPasswordStatus,
      isSignUp,
      loading,
      password,
      pendingVerificationEmail: pendingVerificationCredentials?.email ?? '',
      showForgotPasswordModal,
      showVerificationModal,
      username,
      verificationChecking,
      verificationError,
      verificationStatus,
    },
    derived: {
      canRecheckVerification,
    },
    actions: {
      closeForgotPasswordModal,
      closeVerificationModal,
      handleForgotPasswordSubmit,
      handleSubmit,
      handleVerificationRecheck,
      openForgotPasswordModal,
      setEmail,
      setForgotPasswordEmail,
      setPassword,
      setUsername,
      toggleMode,
    },
  };
}

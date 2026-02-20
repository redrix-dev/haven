import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/shared/lib/errors';

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

export function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationChecking, setVerificationChecking] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [pendingVerificationCredentials, setPendingVerificationCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const { signIn, signUp } = useAuth();

  const handleVerificationRecheck = useCallback(async () => {
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

  const canRecheckVerification =
    Boolean((pendingVerificationCredentials?.email ?? email.trim()).trim()) &&
    Boolean(pendingVerificationCredentials?.password ?? password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        const { error } = await signUp(normalizedEmail, password, username);
        if (error) throw error;

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
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'An error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#111a2b]">
      <Card className="w-full max-w-md bg-[#1c2a43] border-[#142033] shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-white">Haven</CardTitle>
          <CardDescription className="text-[#aebad0]">
            {isSignUp ? 'Create your account' : 'Welcome back!'}
          </CardDescription>
        </CardHeader>

        <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="signup-username" className="text-xs font-semibold text-[#aebad0] uppercase">
                Username
              </Label>
              <Input
                id="signup-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-[#263a58] border-[#304867] text-white"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="auth-email" className="text-xs font-semibold text-[#aebad0] uppercase">
              Email
            </Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#263a58] border-[#304867] text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-password" className="text-xs font-semibold text-[#aebad0] uppercase">
              Password
            </Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#263a58] border-[#304867] text-white"
              required
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#3f79d8] hover:bg-[#325fae] text-white"
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </Button>
        </form>

        <Button
          type="button"
          variant="link"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError('');
          }}
          className="mt-4 text-sm text-[#59b7ff] hover:text-[#86ccff] w-full text-center"
        >
          {isSignUp
            ? 'Already have an account? Sign in'
            : "Don't have an account? Sign up"}
        </Button>
        </CardContent>
      </Card>

      <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
        <DialogContent className="bg-[#1c2a43] border-[#142033] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check your email</DialogTitle>
            <DialogDescription className="text-[#aebad0]">
              Open the verification link from your email. Haven will complete sign-in automatically when possible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs text-[#aebad0]">
              {pendingVerificationCredentials?.email
                ? `Verification email sent to ${pendingVerificationCredentials.email}.`
                : 'Verification email sent. Use the same credentials to recheck.'}
            </p>

            {verificationStatus && (
              <p className="text-xs text-[#8fc1ff] bg-[#1c3352] rounded px-3 py-2">
                {verificationStatus}
              </p>
            )}

            {verificationError && (
              <p className="text-xs text-[#fca5a5] bg-[#4a1f2c] rounded px-3 py-2">
                {verificationError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowVerificationModal(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void handleVerificationRecheck()}
              disabled={verificationChecking || !canRecheckVerification}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {verificationChecking ? 'Checking...' : 'I verified, recheck now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


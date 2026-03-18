import React from 'react';
import { Button } from '@shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { useLoginScreenController } from '@shared/components/auth/useLoginScreenController';

export function LoginScreen() {
  const { actions, derived, state } = useLoginScreenController();

  return (
    <div className="flex items-center justify-center h-screen bg-[#111a2b]">
      <Card className="w-full max-w-md bg-[#1c2a43] border-[#142033] shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-white">Haven</CardTitle>
          <CardDescription className="text-[#aebad0]">
            {state.isSignUp ? 'Create your account' : 'Welcome back!'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={actions.handleSubmit} className="space-y-4">
            {state.isSignUp && (
              <div className="space-y-2">
                <Label
                  htmlFor="signup-username"
                  className="text-xs font-semibold text-[#aebad0] uppercase"
                >
                  Username
                </Label>
                <Input
                  id="signup-username"
                  type="text"
                  value={state.username}
                  onChange={(event) => actions.setUsername(event.target.value)}
                  className="bg-[#263a58] border-[#304867] text-white"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="auth-email"
                className="text-xs font-semibold text-[#aebad0] uppercase"
              >
                Email
              </Label>
              <Input
                id="auth-email"
                type="email"
                value={state.email}
                onChange={(event) => actions.setEmail(event.target.value)}
                className="bg-[#263a58] border-[#304867] text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="auth-password"
                className="text-xs font-semibold text-[#aebad0] uppercase"
              >
                Password
              </Label>
              <Input
                id="auth-password"
                type="password"
                value={state.password}
                onChange={(event) => actions.setPassword(event.target.value)}
                className="bg-[#263a58] border-[#304867] text-white"
                required
              />
            </div>

            {!state.isSignUp && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="link"
                  onClick={actions.openForgotPasswordModal}
                  className="h-auto px-0 text-xs text-[#59b7ff] hover:text-[#86ccff]"
                >
                  Forgot password?
                </Button>
              </div>
            )}

            {state.error && (
              <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">
                {state.error}
              </div>
            )}

            <Button
              type="submit"
              disabled={state.loading}
              className="w-full bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {state.loading ? 'Loading...' : state.isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
          </form>

          <Button
            type="button"
            variant="link"
            onClick={actions.toggleMode}
            className="mt-4 text-sm text-[#59b7ff] hover:text-[#86ccff] w-full text-center"
          >
            {state.isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={state.showVerificationModal} onOpenChange={actions.closeVerificationModal}>
        <DialogContent className="bg-[#1c2a43] border-[#142033] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check your email</DialogTitle>
            <DialogDescription className="text-[#aebad0]">
              Open the verification link from your email. Haven will complete sign-in
              automatically when possible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs text-[#aebad0]">
              {state.pendingVerificationEmail
                ? `Verification email sent to ${state.pendingVerificationEmail}.`
                : 'Verification email sent. Use the same credentials to recheck.'}
            </p>

            {state.verificationStatus && (
              <p className="text-xs text-[#8fc1ff] bg-[#1c3352] rounded px-3 py-2">
                {state.verificationStatus}
              </p>
            )}

            {state.verificationError && (
              <p className="text-xs text-[#fca5a5] bg-[#4a1f2c] rounded px-3 py-2">
                {state.verificationError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={actions.closeVerificationModal}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void actions.handleVerificationRecheck()}
              disabled={state.verificationChecking || !derived.canRecheckVerification}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {state.verificationChecking ? 'Checking...' : 'I verified, recheck now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={state.showForgotPasswordModal} onOpenChange={actions.closeForgotPasswordModal}>
        <DialogContent className="bg-[#1c2a43] border-[#142033] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription className="text-[#aebad0]">
              Enter your account email and we&apos;ll send a password reset link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label
                htmlFor="forgot-password-email"
                className="text-xs font-semibold text-[#aebad0] uppercase"
              >
                Email
              </Label>
              <Input
                id="forgot-password-email"
                type="email"
                value={state.forgotPasswordEmail}
                onChange={(event) => actions.setForgotPasswordEmail(event.target.value)}
                className="bg-[#263a58] border-[#304867] text-white"
                autoFocus
              />
            </div>

            {state.forgotPasswordStatus && (
              <p className="text-xs text-[#8fc1ff] bg-[#1c3352] rounded px-3 py-2">
                {state.forgotPasswordStatus}
              </p>
            )}

            {state.forgotPasswordError && (
              <p className="text-xs text-[#fca5a5] bg-[#4a1f2c] rounded px-3 py-2">
                {state.forgotPasswordError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={actions.closeForgotPasswordModal}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void actions.handleForgotPasswordSubmit()}
              disabled={state.forgotPasswordSending}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {state.forgotPasswordSending ? 'Sending...' : 'Send reset link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

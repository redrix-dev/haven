import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLoginScreenController } from '@shared/components/auth/useLoginScreenController';
import { MobileAppShell } from '@web-mobile/mobile/layout/MobileAppShell';
import { MobileSceneScaffold } from '@web-mobile/mobile/layout/MobileSceneScaffold';
import {
  MobileScrollableBody,
  MobileSheet,
  MobileSheetCloseButton,
  MobileSheetFooter,
  MobileSheetHandle,
  MobileSheetHeader,
  MobileSheetTitle,
} from '@web-mobile/mobile/layout/MobileSurfacePrimitives';

function AuthTextField({
  autoFocus = false,
  autoComplete,
  id,
  label,
  onChange,
  placeholder,
  type = 'text',
  value,
}: {
  autoComplete?: string;
  autoFocus?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        enterKeyHint="next"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
        placeholder={placeholder}
      />
    </label>
  );
}

export function MobileLoginScreen() {
  const { actions, derived, state } = useLoginScreenController();

  return (
    <MobileAppShell
      body={
        <MobileSceneScaffold
          bodyClassName="px-4 py-6"
          body={
            <div className="mx-auto flex min-h-full w-full max-w-sm flex-col pt-4 pb-8">
              <div className="rounded-[2rem] border border-white/10 bg-[#16233a] p-5 shadow-xl">
                <div className="mb-6 text-center">
                  <p className="text-3xl font-bold text-white">Haven</p>
                  <p className="mt-1 text-sm text-[#aebad0]">
                    {state.isSignUp ? 'Create your account' : 'Welcome back!'}
                  </p>
                </div>

                <form
                  onSubmit={actions.handleSubmit}
                  className="space-y-4"
                >
                  {state.isSignUp && (
                    <AuthTextField
                      id="mobile-signup-username"
                      label="Username"
                      onChange={actions.setUsername}
                      placeholder="Pick a username"
                      value={state.username}
                    />
                  )}

                  <AuthTextField
                    id="mobile-auth-email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                    onChange={actions.setEmail}
                    placeholder="you@example.com"
                    value={state.email}
                  />

                  <AuthTextField
                    id="mobile-auth-password"
                    label="Password"
                    type="password"
                    autoComplete={state.isSignUp ? 'new-password' : 'current-password'}
                    onChange={actions.setPassword}
                    placeholder={state.isSignUp ? 'Create a password' : 'Enter your password'}
                    value={state.password}
                  />

                  {!state.isSignUp && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={actions.openForgotPasswordModal}
                        className="text-xs font-medium text-[#59b7ff]"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {state.error && (
                    <div className="rounded-xl bg-red-900/20 px-3 py-2 text-sm text-red-400">
                      {state.error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={state.loading}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#3f79d8] text-sm font-semibold text-white transition-colors hover:bg-[#325fae] disabled:opacity-60"
                  >
                    {state.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : state.isSignUp ? (
                      'Sign Up'
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={actions.toggleMode}
                  className="mt-4 w-full text-sm text-[#59b7ff]"
                >
                  {state.isSignUp
                    ? 'Already have an account? Sign in'
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          }
        />
      }
    >
      <MobileSheet
        open={state.showVerificationModal}
        onClose={actions.closeVerificationModal}
        label="Email Verification"
        id="mobile-email-verification"
        size="auto"
        className="h-auto"
      >
        <MobileSheetHandle />
        <MobileSheetHeader>
          <MobileSheetTitle>Check your email</MobileSheetTitle>
          <MobileSheetCloseButton onClick={actions.closeVerificationModal} />
        </MobileSheetHeader>

        <MobileScrollableBody className="px-4 py-4">
          <p className="text-sm text-[#aebad0]">
            Open the verification link from your email. Haven will complete sign-in
            automatically when possible.
          </p>
          <p className="mt-3 text-xs text-[#aebad0]">
            {state.pendingVerificationEmail
              ? `Verification email sent to ${state.pendingVerificationEmail}.`
              : 'Verification email sent. Use the same credentials to recheck.'}
          </p>

          {state.verificationStatus && (
            <p className="mt-3 rounded-xl bg-[#1c3352] px-3 py-2 text-xs text-[#8fc1ff]">
              {state.verificationStatus}
            </p>
          )}

          {state.verificationError && (
            <p className="mt-2 rounded-xl bg-[#4a1f2c] px-3 py-2 text-xs text-[#fca5a5]">
              {state.verificationError}
            </p>
          )}
        </MobileScrollableBody>

        <MobileSheetFooter className="flex gap-2">
          <button
            type="button"
            onClick={actions.closeVerificationModal}
            className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void actions.handleVerificationRecheck()}
            disabled={state.verificationChecking || !derived.canRecheckVerification}
            className="flex-1 rounded-xl bg-[#3f79d8] py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {state.verificationChecking ? 'Checking...' : 'I verified, recheck now'}
          </button>
        </MobileSheetFooter>
      </MobileSheet>

      <MobileSheet
        open={state.showForgotPasswordModal}
        onClose={actions.closeForgotPasswordModal}
        label="Reset Password"
        id="mobile-forgot-password"
        size="auto"
        className="h-auto"
      >
        <MobileSheetHandle />
        <MobileSheetHeader>
          <MobileSheetTitle>Reset password</MobileSheetTitle>
          <MobileSheetCloseButton onClick={actions.closeForgotPasswordModal} />
        </MobileSheetHeader>

        <MobileScrollableBody className="px-4 py-4">
          <p className="mb-4 text-sm text-[#aebad0]">
            Enter your account email and we&apos;ll send a password reset link.
          </p>

          <AuthTextField
            id="mobile-forgot-password-email"
            autoFocus
            label="Email"
            type="email"
            autoComplete="email"
            onChange={actions.setForgotPasswordEmail}
            placeholder="you@example.com"
            value={state.forgotPasswordEmail}
          />

          {state.forgotPasswordStatus && (
            <p className="mt-3 rounded-xl bg-[#1c3352] px-3 py-2 text-xs text-[#8fc1ff]">
              {state.forgotPasswordStatus}
            </p>
          )}

          {state.forgotPasswordError && (
            <p className="mt-2 rounded-xl bg-[#4a1f2c] px-3 py-2 text-xs text-[#fca5a5]">
              {state.forgotPasswordError}
            </p>
          )}
        </MobileScrollableBody>

        <MobileSheetFooter className="flex gap-2">
          <button
            type="button"
            onClick={actions.closeForgotPasswordModal}
            className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void actions.handleForgotPasswordSubmit()}
            disabled={state.forgotPasswordSending}
            className="flex-1 rounded-xl bg-[#3f79d8] py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {state.forgotPasswordSending ? 'Sending...' : 'Send reset link'}
          </button>
        </MobileSheetFooter>
      </MobileSheet>
    </MobileAppShell>
  );
}

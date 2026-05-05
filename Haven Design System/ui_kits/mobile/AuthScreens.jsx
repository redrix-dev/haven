/* AuthCard: shared layout for MobileLogin, SignUpScreen, PasswordRecoveryScreen.
   Centered card on the dark background; max-w-sm; rounded-3xl; bg-card; px-6 py-6. */

const HM = window.HM;

function FieldLabel({ children, kind }) {
  // login screen uses sentence-case labels; signup/recovery use uppercase eyebrows
  if (kind === "eyebrow") {
    return (
      <div style={{
        marginBottom: 8, fontSize: 11, fontWeight: 600,
        letterSpacing: "0.06em", textTransform: "uppercase",
        color: HM.mutedForeground, fontFamily: HM.fontSans,
      }}>{children}</div>
    );
  }
  return (
    <div style={{
      marginBottom: 8, fontSize: 13,
      color: HM.mutedForeground, fontFamily: HM.fontSans,
    }}>{children}</div>
  );
}

function TextField({ value, placeholder, secure, surface, marginBottom = 16 }) {
  // Mirrors `mb-4 rounded-xl border border-border bg-card px-4 py-3 text-foreground`
  // and the signup variant `rounded-lg border border-border bg-muted px-4 py-3`
  const bg = surface === "muted" ? HM.muted : HM.card;
  const radius = surface === "muted" ? 8 : 12;
  return (
    <div style={{
      marginBottom,
      borderRadius: radius,
      border: `1px solid ${HM.border}`,
      background: bg,
      padding: "12px 16px",
      fontSize: 15,
      color: value ? HM.foreground : HM.placeholder,
      fontFamily: HM.fontSans,
      lineHeight: 1.4,
      letterSpacing: secure && value ? "0.15em" : 0,
    }}>
      {value ? (secure ? "•".repeat(Math.min(value.length, 12)) : value) : placeholder}
    </div>
  );
}

function PrimaryButton({ children, disabled, marginBottom = 0 }) {
  return (
    <div style={{
      marginBottom,
      borderRadius: 12,
      background: HM.primary,
      padding: "14px 16px",
      textAlign: "center",
      fontSize: 16, fontWeight: 600,
      color: HM.primaryFg,
      opacity: disabled ? 0.6 : 1,
      fontFamily: HM.fontSans,
    }}>{children}</div>
  );
}

function MutedLink({ children, primary, align = "center", marginTop = 0 }) {
  return (
    <div style={{
      marginTop,
      textAlign: align,
      fontSize: 13,
      color: primary ? HM.primary : HM.mutedForeground,
      fontFamily: HM.fontSans,
    }}>{children}</div>
  );
}

function AuthCard({ children, bordered, withShadow }) {
  return (
    <div style={{
      width: "100%",
      maxWidth: 360,
      alignSelf: "center",
      borderRadius: 24,
      background: HM.card,
      padding: 24,
      border: bordered ? `1px solid ${HM.border}` : "none",
      boxShadow: withShadow ? "0 25px 50px -12px rgba(0,0,0,0.45)" : "none",
      fontFamily: HM.fontSans,
    }}>{children}</div>
  );
}

function HavenWordmark({ size = 22, sub }) {
  return (
    <>
      <div style={{
        marginBottom: sub ? 4 : 32,
        textAlign: "center",
        fontSize: size,
        fontWeight: 600,
        color: HM.foreground,
        letterSpacing: "-0.01em",
      }}>Haven</div>
      {sub ? (
        <div style={{
          marginBottom: 32,
          textAlign: "center",
          fontSize: 13,
          color: HM.mutedForeground,
        }}>{sub}</div>
      ) : null}
    </>
  );
}

/* The full screen wrappers — these go INSIDE <MobileScreen>. */

function LoginScreen() {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "60px 16px 32px",
    }}>
      <AuthCard>
        <HavenWordmark />
        <FieldLabel>Email</FieldLabel>
        <TextField value="ada@havenchat.app" />
        <FieldLabel>Password</FieldLabel>
        <TextField value="hunter2hunter2" secure marginBottom={24} />
        <PrimaryButton>Sign in</PrimaryButton>
        <MutedLink marginTop={16}>Forgot password?</MutedLink>
        <MutedLink marginTop={8}>Don't have an account? Sign up</MutedLink>
      </AuthCard>
    </div>
  );
}

function LoginLoadingScreen() {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "60px 16px 32px",
    }}>
      <AuthCard>
        <HavenWordmark />
        <FieldLabel>Email</FieldLabel>
        <TextField value="ada@havenchat.app" />
        <FieldLabel>Password</FieldLabel>
        <TextField value="hunter2hunter2" secure marginBottom={24} />
        <PrimaryButton disabled>Signing in…</PrimaryButton>
        <MutedLink marginTop={16}>Forgot password?</MutedLink>
        <MutedLink marginTop={8}>Don't have an account? Sign up</MutedLink>
      </AuthCard>
    </div>
  );
}

function SignUpScreenView() {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "44px 16px 32px",
    }}>
      <AuthCard bordered withShadow>
        <div style={{
          marginBottom: 4, textAlign: "center",
          fontSize: 22, fontWeight: 600, color: HM.foreground,
        }}>Haven</div>
        <div style={{
          marginBottom: 28, textAlign: "center",
          fontSize: 13, color: HM.mutedForeground,
        }}>Create your account</div>

        <FieldLabel kind="eyebrow">Username</FieldLabel>
        <TextField value="ada.lovelace" surface="muted" />
        <FieldLabel kind="eyebrow">Email</FieldLabel>
        <TextField value="ada@havenchat.app" surface="muted" />
        <FieldLabel kind="eyebrow">Password</FieldLabel>
        <TextField value="hunter2hunter2" surface="muted" secure />
        <FieldLabel kind="eyebrow">Confirm password</FieldLabel>
        <TextField value="hunter2hunter2" surface="muted" secure marginBottom={20} />

        {/* Legal checkbox */}
        <div style={{
          marginBottom: 20,
          borderRadius: 12,
          border: `1px solid ${HM.border}`,
          background: HM.muted,
          padding: 14,
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{
            width: 18, height: 18,
            borderRadius: 4,
            border: `2px solid ${HM.primary}`,
            background: HM.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 11, fontWeight: 700,
            flexShrink: 0, marginTop: 1,
          }}>✓</div>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: HM.mutedForeground }}>
            I agree to the{" "}
            <span style={{ color: HM.primary }}>Terms of Service</span>
            {" "}and{" "}
            <span style={{ color: HM.primary }}>Privacy Policy</span>
          </div>
        </div>

        <PrimaryButton marginBottom={20}>Sign Up</PrimaryButton>

        <div style={{
          display: "flex", justifyContent: "center", gap: 4,
          fontSize: 13,
        }}>
          <span style={{ color: HM.mutedForeground }}>Already have an account?</span>
          <span style={{ color: HM.primary }}>Sign in</span>
        </div>
      </AuthCard>
    </div>
  );
}

function PasswordRecoveryRequest() {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "60px 16px 32px",
    }}>
      <AuthCard bordered withShadow>
        <div style={{
          marginBottom: 4, textAlign: "center",
          fontSize: 22, fontWeight: 600, color: HM.foreground,
        }}>Haven</div>
        <div style={{
          marginBottom: 28, textAlign: "center",
          fontSize: 13, color: HM.mutedForeground,
        }}>Reset your password</div>

        <FieldLabel kind="eyebrow">Email</FieldLabel>
        <TextField value="ada@havenchat.app" surface="muted" marginBottom={20} />

        <PrimaryButton marginBottom={20}>Send reset link</PrimaryButton>

        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center", gap: 6,
          fontSize: 13,
        }}>
          <span style={{ color: HM.primary }}>Back to login</span>
          <span style={{ color: HM.mutedForeground }}>·</span>
          <span style={{ color: HM.primary }}>Sign up</span>
        </div>
      </AuthCard>
    </div>
  );
}

function PasswordRecoverySuccess() {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "60px 16px 32px",
    }}>
      <AuthCard bordered withShadow>
        <div style={{
          marginBottom: 4, textAlign: "center",
          fontSize: 22, fontWeight: 600, color: HM.foreground,
        }}>Haven</div>
        <div style={{
          marginBottom: 24, textAlign: "center",
          fontSize: 18, fontWeight: 600, color: HM.foreground,
        }}>Check your email</div>
        <div style={{
          marginBottom: 28, textAlign: "center",
          fontSize: 13, lineHeight: 1.6, color: HM.mutedForeground,
        }}>
          We sent a password reset link to{" "}
          <span style={{ color: HM.foreground }}>ada@havenchat.app</span>.
          Open the email and follow the link to choose a new password.
        </div>
        <PrimaryButton>Back to login</PrimaryButton>
      </AuthCard>
    </div>
  );
}

Object.assign(window, {
  AuthCard, FieldLabel, TextField, PrimaryButton, MutedLink, HavenWordmark,
  LoginScreen, LoginLoadingScreen, SignUpScreenView,
  PasswordRecoveryRequest, PasswordRecoverySuccess,
});

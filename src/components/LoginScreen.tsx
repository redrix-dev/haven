import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

export function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = useAuth();

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
        const { error } = await signUp(email, password, username);
        if (error) throw error;
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
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
    </div>
  );
}


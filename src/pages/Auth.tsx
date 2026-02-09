import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Zap } from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '' });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signIn(form.email, form.password);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Email ou senha incorretos. Verifique suas credenciais.');
      } else if (error.message.includes('Email not confirmed')) {
        setError('Email não confirmado. Verifique sua caixa de entrada.');
      } else {
        setError(error.message);
      }
    } else {
      navigate('/');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Eletroportas</h1>
          <p className="text-muted-foreground mt-2">Sistema de Gestão Inteligente</p>
        </div>

        <Card className="border-border/50 shadow-xl backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Bem-vindo de volta</CardTitle>
            <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Entrar
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2025 PrimeSync. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
};

export default Auth;

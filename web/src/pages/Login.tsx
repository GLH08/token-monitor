import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { login } from '../api/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

interface LoginProps {
    onLogin?: () => void;
}

const Login = ({ onLogin }: LoginProps) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!password) {
            setError('请输入密码');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await login(password);
            onLogin?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : '登录失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
            <div className="ambient" aria-hidden="true">
                <div className="blob b1" />
                <div className="blob b2" />
                <div className="blob b3" />
                <div className="blob b4" />
                <div className="noise" />
            </div>

            <div className="relative z-10 w-full max-w-[400px] rounded-[28px] border border-black/5 bg-white/82 p-9 shadow-md backdrop-blur-xl dark:bg-card/90">
                <div className="mb-8 text-center">
                    <h1 className="font-display text-[34px] font-normal tracking-tight">Token Monitor</h1>
                    <p className="mt-2 text-[14.5px] text-muted-foreground">输入访问密码以继续</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground">
                            访问密码
                        </Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                            autoFocus
                        />
                    </div>

                    {error ? (
                        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                            {error}
                        </div>
                    ) : null}

                    <Button type="submit" disabled={submitting} className="mt-1 w-full" size="lg">
                        {submitting ? '登录中...' : '进入系统'}
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </form>

                <p className="mt-8 text-center text-[11px] uppercase tracking-wider text-muted-foreground/70">
                    Access · Secured
                </p>
            </div>
        </div>
    );
};

export default Login;

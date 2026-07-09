import { useState, type FormEvent } from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import { login } from '../api/client';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
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
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-[10%] -top-[20%] h-[50%] w-[50%] rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -right-[10%] top-[40%] h-[40%] w-[40%] rounded-full bg-blue-500/10 blur-3xl" />
            </div>

            <Card className="relative z-10 w-full max-w-md p-10">
                <div className="mb-10 flex flex-col items-center">
                    <div className="mb-6 flex h-16 w-16 rotate-3 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30">
                        <Activity className="h-8 w-8" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Token Monitor</h1>
                    <p className="mt-2 font-medium text-muted-foreground">请输入访问密码以继续</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="password">访问密码</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="输入您的密码"
                            autoFocus
                        />
                    </div>

                    {error ? (
                        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                            {error}
                        </div>
                    ) : null}

                    <Button type="submit" disabled={submitting} className="w-full text-lg" size="lg">
                        {submitting ? '登录中...' : '进入系统'}
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </form>

                <p className="mt-8 text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Token Monitor
                </p>
            </Card>
        </div>
    );
};

export default Login;

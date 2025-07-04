import React, { useEffect, useState } from 'react';
import { usePasskey } from '../hooks/usePasskey';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './ui/Dialog';
import { formatDate } from '../utils/date';
import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useToast } from '../hooks/useToast';

export const PasskeySetup: React.FC = () => {
    const {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        removeAuthenticator
    } = usePasskey();
    const { showToast } = useToast();

    const [isOpen, setIsOpen] = useState(false);
    const [credentialName, setCredentialName] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        loadCredentials();
    }, [loadCredentials]);

    // 注册 Passkey
    const handleRegister = async () => {
        if (!credentialName.trim()) return;
        try {
            await registerAuthenticator(credentialName);
            showToast('Passkey 注册成功', 'success');
        } catch {
            showToast('Passkey 注册失败', 'error');
        }
        setCredentialName('');
        setIsOpen(false);
    };

    // 删除 Passkey
    const handleRemove = async (id: string) => {
        if (!window.confirm('确定要删除这个 Passkey 吗？')) return;
        setRemovingId(id);
        try {
            await removeAuthenticator(id);
            showToast('Passkey 已删除', 'success');
        } catch {
            showToast('删除失败', 'error');
        }
        setRemovingId(null);
    };

    return (
        <div className="space-y-4 bg-white rounded-xl p-4 shadow-md">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <KeyRoundIcon className="w-7 h-7 text-indigo-500" />
                    Passkey 无密码认证
                </h2>
                <Button onClick={() => setIsOpen(true)} disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 shadow flex items-center gap-2">
                    <PlusIcon className="w-5 h-5" /> 添加 Passkey
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {credentials.map((credential) => (
                    <Card key={credential.id} className="p-4 shadow rounded-xl border hover:border-indigo-400 transition-all duration-200 bg-gradient-to-br from-white to-indigo-50 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold flex items-center gap-2">
                                    <KeyRoundIcon className="w-5 h-5 text-indigo-500" />
                                    {credential.name}
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    添加时间：{formatDate(credential.createdAt)}
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemove(credential.id)}
                                disabled={isLoading || removingId === credential.id}
                                className="hover:bg-red-600 transition flex items-center gap-1"
                            >
                                {removingId === credential.id ? (
                                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                                ) : (
                                    <Trash2Icon className="w-4 h-4" />
                                )}
                                删除
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            {credentials.length === 0 && !isLoading && (
                <div className="flex flex-col items-center py-8 text-gray-400">
                    <KeyRoundIcon className="w-12 h-12 mb-2" />
                    <div>还没有添加任何 Passkey</div>
                </div>
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <KeyRoundIcon className="text-indigo-500 w-6 h-6" />
                            <DialogTitle>注册新的 Passkey</DialogTitle>
                        </div>
                        <DialogDescription>
                            支持指纹、面容、Windows Hello、手机等安全认证
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="name" className="text-sm font-medium">
                                Passkey 名称
                            </label>
                            <Input
                                id="name"
                                placeholder="例如：我的指纹"
                                value={credentialName}
                                onChange={(e) => setCredentialName(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                            disabled={isLoading}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleRegister}
                            disabled={isLoading || !credentialName.trim()}
                        >
                            {isLoading ? (
                                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                            ) : null}
                            注册
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}; 
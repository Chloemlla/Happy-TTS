import React, { useEffect, useState } from 'react';
import { useWebAuthn } from '../hooks/useWebAuthn';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './ui/Dialog';
import { formatDate } from '../utils/date';

export const WebAuthnSetup: React.FC = () => {
    const {
        credentials,
        isLoading,
        loadCredentials,
        registerAuthenticator,
        removeAuthenticator
    } = useWebAuthn();

    const [isOpen, setIsOpen] = useState(false);
    const [credentialName, setCredentialName] = useState('');

    useEffect(() => {
        loadCredentials();
    }, [loadCredentials]);

    const handleRegister = async () => {
        if (!credentialName.trim()) return;
        await registerAuthenticator(credentialName);
        setCredentialName('');
        setIsOpen(false);
    };

    const handleRemove = async (id: string) => {
        if (window.confirm('确定要删除这个认证器吗？')) {
            await removeAuthenticator(id);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">生物识别认证</h2>
                <Button onClick={() => setIsOpen(true)} disabled={isLoading}>
                    添加认证器
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {credentials.map((credential) => (
                    <Card key={credential.id} className="p-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold">{credential.name}</h3>
                                <p className="text-sm text-gray-500">
                                    添加时间：{formatDate(credential.createdAt)}
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemove(credential.id)}
                                disabled={isLoading}
                            >
                                删除
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            {credentials.length === 0 && !isLoading && (
                <div className="text-center text-gray-500 py-8">
                    还没有添加任何认证器
                </div>
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加认证器</DialogTitle>
                        <DialogDescription>
                            为您的账户添加生物识别认证器（如指纹、面容等）
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="name" className="text-sm font-medium">
                                认证器名称
                            </label>
                            <Input
                                id="name"
                                placeholder="例如：我的指纹"
                                value={credentialName}
                                onChange={(e) => setCredentialName(e.target.value)}
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
                            {isLoading ? '注册中...' : '注册'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}; 
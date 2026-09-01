# ARQUITETURA DO SEGUNDO FATOR (TOTP / 2FA)
## Especificação RFC 6238, Parsers de QR Code e Verificação de Desvio de Relógio

O ATRIUM implementa geração e validação local de segundo fator TOTP (RFC 6238). A compatibilidade de login depende de cada portal e não é considerada universal nem certificada sem evidência específica.

---

## 🔑 Mecanismos de Entrada e Formatos Suportados

1. **QR Code de Ativação do Tribunal (PJe, PDPJ, eproc)**:
   - Formato padrão: `otpauth://totp/[Emissor:]Conta?secret=BASE32&issuer=Emissor&digits=6&period=30`
2. **QR Code de Migração / Exportação do Google Authenticator**:
   - Formato: `otpauth-migration://offline?data=BASE64_PROTOBUF`
   - O parser decodifica as mensagens Protobuf e permite extrair individualmente as contas vinculadas aos tribunais.
3. **Chave Manual Base32**:
   - Permite a digitação direta da sequência alfanumérica fornecida pelo portal.

---

## 🔒 Princípios de Segurança e Privacidade

- **Descarte Imediato**: As imagens de QR Code recebidas (via upload ou leitura no navegador) são processadas em memória e nunca são persistidas em disco.
- **Criptografia em Repouso**: O segredo Base32 extraído é salvo dentro do envelope encriptado `data/judicial-integrations.json` com AES-256-GCM.
- **Zero Logging**: O segredo TOTP e os códigos numéricos de 6 dígitos gerados em tempo de execução jamais são impressos em logs, telemetria ou respostas HTTP de diagnóstico.
- **Clock Skew Check**: O motor realiza validação temporal antes de emitir o código para garantir que o relógio local do sistema não esteja desajustado (`TOTP-006`).
